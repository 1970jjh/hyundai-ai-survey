import type { Survey, SurveyResponse } from "./schemas";
import { answerText, formatKst } from "./csv";
import { readSettings } from "./settings";
import { getStore } from "./store";

export type SheetRow = Record<string, string | number>;
export interface SheetRecord {
  type: string;
  action: "upsert" | "delete";
  id: string;
  row: SheetRow;
}

export const SURVEYS_TAB = "surveys";
const STATUS_LABEL = { draft: "작성 중", open: "공개 중", closed: "마감" } as const;

/** 설문별 응답 탭 이름: 제목 앞부분 + ID 짧게 (시트 이름에 못 쓰는 문자 제거) */
export function responseTabName(survey: Pick<Survey, "id" | "title">): string {
  const head = survey.title.replace(/[\[\]:*?/\\']/g, " ").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return `${head || "설문"}_${survey.id.slice(0, 6)}`;
}

export function responseRecord(survey: Survey, response: SurveyResponse): SheetRecord {
  const row: SheetRow = { 제출시각: formatKst(response.submittedAt) };
  survey.questions.forEach((q, i) => {
    row[`Q${i + 1}. ${q.text}`] = answerText(response.answers[q.id]);
  });
  return { type: responseTabName(survey), action: "upsert", id: response.id, row };
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
  return { type: SURVEYS_TAB, action: "upsert", id: survey.id, row };
}

export function surveyDeleteRecord(id: string): SheetRecord {
  return { type: SURVEYS_TAB, action: "delete", id, row: {} };
}

/** Apps Script 웹 앱으로 전송. 5초 타임아웃, 예외 대신 결과를 돌려준다 */
export async function postToSheet(
  url: string,
  body: SheetRecord | { records: SheetRecord[] } | { action: "ping" },
  timeoutMs = 5000,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `시트 응답 오류 (HTTP ${res.status})` };
    const json = JSON.parse(text) as { ok?: boolean; error?: string };
    return json.ok ? { ok: true } : { ok: false, error: json.error || "시트가 요청을 처리하지 못했습니다." };
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TimeoutError") return { ok: false, error: "시트 응답 시간 초과(5초)" };
    if (err instanceof SyntaxError) return { ok: false, error: "Apps Script 응답이 JSON이 아닙니다. 코드와 배포(액세스: 모든 사용자)를 확인하세요." };
    return { ok: false, error: `시트 전송 실패: ${(err as Error).message}` };
  }
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

async function recordStatus(result: { ok: true } | { ok: false; error: string }): Promise<void> {
  const prev = await readSheetStatus();
  const now = new Date().toISOString();
  // 성공이 이어지는 동안은 1분에 한 번만 기록(동시 제출 때 쓰기 폭주 방지)
  const recentOk = prev.lastSuccessAt && Date.now() - Date.parse(prev.lastSuccessAt) < 60_000;
  if (result.ok && recentOk && !prev.lastError) return;
  const next = result.ok ? { ...prev, lastSuccessAt: now } : { ...prev, lastError: result.error, lastErrorAt: now };
  await getStore().putJson(STATUS_PATH, next);
}

/** 연결돼 있을 때만 전송. 실패해도 예외를 던지지 않는다(원본은 저장소에 이미 있음) */
export async function notifySheet(records: SheetRecord[]): Promise<void> {
  if (!records.length) return;
  try {
    const s = await readSettings();
    if (!s.sheetEnabled || !s.sheetUrl) return;
    const result = await postToSheet(s.sheetUrl, records.length === 1 ? records[0] : { records });
    await recordStatus(result);
  } catch {
    // 시트 상태 기록 실패는 무시 — 본 저장에 영향 없음
  }
}
