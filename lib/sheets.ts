import type { Survey, SurveyResponse } from "./schemas";
import { answerText, formatKst } from "./csv";
import { ensureSheetSecret, readSettings } from "./settings";
import { getStore } from "./store";

export type SheetRow = Record<string, string | number>;
export interface SheetRecord {
  /** 탭을 찾는 변하지 않는 키(설문 응답 탭 = resp_<설문ID>) */
  type: string;
  /** 탭에 보이는 이름(설문 제목이 바뀌면 같은 탭의 이름만 바뀐다) */
  tab?: string;
  action: "upsert" | "delete";
  id: string;
  row: SheetRow;
  /** 순서 역전 방지: 시트에 이미 더 최신 값이 있으면 Apps Script 가 무시한다 */
  updatedAt: string;
}
export type SheetPayload = { records: SheetRecord[] } | { action: "ping" };
export type SheetResult = { ok: true } | { ok: false; error: string };

export const SURVEYS_TAB = "surveys";
const STATUS_LABEL = { draft: "작성 중", open: "공개 중", closed: "마감" } as const;

/** 설문별 응답 탭에 보이는 이름: 제목 앞부분 + ID 짧게 (시트 이름에 못 쓰는 문자 제거) */
export function responseTabName(survey: Pick<Survey, "id" | "title">): string {
  const head = survey.title.replace(/[\[\]:*?/\']/g, " ").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return `${head || "설문"}_${survey.id.slice(0, 6)}`;
}

export const responseTabKey = (surveyId: string) => `resp_${surveyId}`;

export function responseRecord(survey: Survey, response: SurveyResponse): SheetRecord {
  const row: SheetRow = { 제출시각: formatKst(response.submittedAt) };
  survey.questions.forEach((q, i) => {
    row[`Q${i + 1}. ${q.text}`] = answerText(response.answers[q.id]);
  });
  return {
    type: responseTabKey(survey.id),
    tab: responseTabName(survey),
    action: "upsert",
    id: response.id,
    row,
    updatedAt: response.submittedAt,
  };
}

export function surveyRecord(survey: Survey, baseUrl: string, responseCount?: number): SheetRecord {
  const row: SheetRow = {
    제목: survey.title,
    상태: STATUS_LABEL[survey.status],
    문항수: survey.questions.length,
    응답링크: `${baseUrl}/s/${survey.id}`,
    응답탭: responseTabName(survey),
    만든시각: formatKst(survey.createdAt),
    수정시각: formatKst(survey.updatedAt),
  };
  if (responseCount !== undefined) row["응답수"] = responseCount;
  return { type: SURVEYS_TAB, action: "upsert", id: survey.id, row, updatedAt: survey.updatedAt };
}

export function surveyDeleteRecord(id: string, now = new Date()): SheetRecord {
  return { type: SURVEYS_TAB, action: "delete", id, row: {}, updatedAt: now.toISOString() };
}

/** Apps Script 웹 앱은 결과를 script.googleusercontent.com 으로 리다이렉트한다. 그 외로는 따라가지 않는다 */
export function isAllowedRedirect(location: string, base: string): boolean {
  try {
    const u = new URL(location, base);
    return u.protocol === "https:" && u.hostname === "script.googleusercontent.com";
  } catch {
    return false;
  }
}

type Attempt = SheetResult & { retryable?: boolean };

async function postOnce(url: string, body: string, timeoutMs: number): Promise<Attempt> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "";
      if (!isAllowedRedirect(location, url)) {
        return { ok: false, error: "시트 주소가 Apps Script 가 아닌 곳으로 이동시켰습니다. 웹 앱 주소를 확인하세요." };
      }
      res = await fetch(new URL(location, url), { method: "GET", redirect: "manual", signal });
    }
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `시트 응답 오류 (HTTP ${res.status})`, retryable: res.status >= 500 || res.status === 429 };
    const json = JSON.parse(text) as { ok?: boolean; error?: string; busy?: boolean };
    if (json.ok) return { ok: true };
    return { ok: false, error: json.error || "시트가 요청을 처리하지 못했습니다.", retryable: Boolean(json.busy) };
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TimeoutError") return { ok: false, error: `시트 응답 시간 초과(${Math.round(timeoutMs / 1000)}초)`, retryable: true };
    if (err instanceof SyntaxError) return { ok: false, error: "Apps Script 응답이 JSON이 아닙니다. 코드와 배포(액세스: 모든 사용자)를 확인하세요." };
    return { ok: false, error: `시트 전송 실패: ${(err as Error).message}`, retryable: true };
  }
}

export interface PostOptions {
  /** 한 번 시도의 타임아웃 */
  timeoutMs?: number;
  /** 실패 시 다시 보내는 횟수 */
  retries?: number;
  /** 재시도까지 포함한 전체 시간 한도 */
  budgetMs?: number;
}

const BACKOFF_MS = [400, 1200];
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Apps Script 웹 앱으로 전송. 요청 본문에 공유 비밀값을 넣는다.
 * 일시적 실패(시간 초과·5xx·락 대기)는 짧게 쉬고 최대 2번 더 보낸다(전체 시간 한도 안에서). 예외 대신 결과를 돌려준다.
 */
export async function postToSheet(url: string, payload: SheetPayload, secret: string, opts: PostOptions = {}): Promise<SheetResult> {
  const { timeoutMs = 15_000, retries = 2, budgetMs = 40_000 } = opts;
  const deadline = Date.now() + budgetMs;
  const body = JSON.stringify({ ...payload, secret });
  let last: Attempt = { ok: false, error: "시트 전송을 시작하지 못했습니다." };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      if (deadline - Date.now() < wait + 1_000) break;
      await pause(wait);
    }
    last = await postOnce(url, body, Math.min(timeoutMs, deadline - Date.now()));
    if (last.ok || !last.retryable) break;
  }
  return last.ok ? { ok: true } : { ok: false, error: last.error };
}

export interface SheetStatus {
  lastSuccessAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

const STATUS_PATH = "sheet-status.json";

export async function readSheetStatus(): Promise<SheetStatus> {
  return (await getStore().getJson<SheetStatus>(STATUS_PATH)) ?? {};
}

export async function recordStatus(result: SheetResult): Promise<void> {
  const prev = await readSheetStatus();
  const now = new Date().toISOString();
  // 성공이 이어지는 동안은 1분에 한 번만 기록(동시 제출 때 쓰기 폭주 방지)
  const recentOk = prev.lastSuccessAt && Date.now() - Date.parse(prev.lastSuccessAt) < 60_000;
  if (result.ok && recentOk && !prev.lastError) return;
  // 성공하면 지난 오류는 지운다(복구된 뒤에도 오류가 남아 보이지 않게)
  const next: SheetStatus = result.ok ? { lastSuccessAt: now } : { ...prev, lastError: result.error, lastErrorAt: now };
  await getStore().putJson(STATUS_PATH, next);
}

/** 연결돼 있을 때만 전송. 실패해도 예외를 던지지 않는다(원본은 저장소에 이미 있음) */
export async function notifySheet(records: SheetRecord[]): Promise<void> {
  if (!records.length) return;
  try {
    const s = await readSettings();
    if (!s.sheetEnabled || !s.sheetUrl) return;
    const secret = s.sheetSecret ?? (await ensureSheetSecret());
    await recordStatus(await postToSheet(s.sheetUrl, { records }, secret));
  } catch {
    // 시트 상태 기록 실패는 무시 — 본 저장에 영향 없음
  }
}

/** 관리자 화면에서 복사할 Apps Script 코드: 이 앱 전용 비밀값을 넣어 둔다 */
export function appsScriptWithSecret(code: string, secret: string): string {
  if (!/^[a-f0-9]{16,128}$/.test(secret)) throw new Error("시트 비밀값 형식이 올바르지 않습니다.");
  return code.replace("'__SHEET_SECRET__'", `'${secret}'`);
}
