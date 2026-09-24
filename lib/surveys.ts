import { randomBytes } from "node:crypto";
import { getStore } from "./store";
import type { Survey, SurveyInput, SurveyResponse, SurveyStatus, AnswerValue } from "./schemas";

const surveyPath = (id: string) => `surveys/${id}.json`;
const responsePrefix = (surveyId: string) => `responses/${surveyId}/`;
const insightsPath = (id: string) => `insights/${id}.json`;

export function newId(len = 10): string {
  return randomBytes(16).toString("base64url").replace(/[-_]/g, "").slice(0, len);
}

export interface SurveySummary extends Survey {
  responseCount: number;
}

export async function listSurveys(): Promise<SurveySummary[]> {
  const store = getStore();
  const [paths, responsePaths] = await Promise.all([store.list("surveys/"), store.list("responses/")]);
  const counts = new Map<string, number>();
  for (const p of responsePaths) {
    const sid = p.split("/")[1];
    counts.set(sid, (counts.get(sid) ?? 0) + 1);
  }
  const surveys = await Promise.all(paths.map((p) => store.getJson<Survey>(p)));
  return surveys
    .filter((s): s is Survey => Boolean(s))
    .map((s) => ({ ...s, responseCount: counts.get(s.id) ?? 0 }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSurvey(id: string): Promise<Survey | null> {
  if (!/^[a-zA-Z0-9]{1,40}$/.test(id)) return null;
  return getStore().getJson<Survey>(surveyPath(id));
}

export async function createSurvey(input: SurveyInput): Promise<Survey> {
  const now = new Date().toISOString();
  const survey: Survey = { ...input, id: newId(), status: "draft", createdAt: now, updatedAt: now };
  await getStore().putJson(surveyPath(survey.id), survey);
  return survey;
}

export async function updateSurvey(
  id: string,
  patch: Partial<SurveyInput> & { status?: SurveyStatus },
): Promise<Survey | null> {
  const current = await getSurvey(id);
  if (!current) return null;
  const next: Survey = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await getStore().putJson(surveyPath(id), next);
  return next;
}

export async function deleteSurvey(id: string): Promise<void> {
  const store = getStore();
  const responses = await store.list(responsePrefix(id));
  await store.delete([surveyPath(id), insightsPath(id), ...responses]);
}

export async function saveResponse(surveyId: string, answers: Record<string, AnswerValue>): Promise<SurveyResponse> {
  const now = new Date();
  // 시간순 정렬되는 파일 이름 + 랜덤 꼬리 → 동시에 제출해도 덮어쓰지 않는다
  const id = `${now.getTime().toString(36)}${newId(8)}`;
  const response: SurveyResponse = { id, surveyId, submittedAt: now.toISOString(), answers };
  await getStore().putJson(`${responsePrefix(surveyId)}${id}.json`, response);
  return response;
}

// ponytail: 응답 파일은 한 번 쓰면 바뀌지 않으므로 인스턴스 메모리에 캐시(폴링 때 재다운로드 방지).
const responseCache = new Map<string, SurveyResponse>();

export async function listResponses(surveyId: string): Promise<SurveyResponse[]> {
  const store = getStore();
  const paths = await store.list(responsePrefix(surveyId));
  const out: SurveyResponse[] = [];
  for (let i = 0; i < paths.length; i += 25) {
    const chunk = paths.slice(i, i + 25);
    const loaded = await Promise.all(
      chunk.map(async (p) => {
        const hit = responseCache.get(p);
        if (hit) return hit;
        const r = await store.getJson<SurveyResponse>(p);
        if (r) responseCache.set(p, r);
        return r;
      }),
    );
    out.push(...loaded.filter((r): r is SurveyResponse => Boolean(r)));
  }
  return out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

export function clearResponseCache(): void {
  responseCache.clear();
}

export interface Insights {
  analysis?: { data: unknown; createdAt: string; analyzed: number; total: number };
  report?: { data: unknown; createdAt: string };
}

export async function getInsights(id: string): Promise<Insights> {
  return (await getStore().getJson<Insights>(insightsPath(id))) ?? {};
}

export async function saveInsights(id: string, patch: Insights): Promise<Insights> {
  const next = { ...(await getInsights(id)), ...patch };
  await getStore().putJson(insightsPath(id), next);
  return next;
}

/** 모든 설문·응답·분석 삭제. includeSettings면 API 키·비밀번호·시트 설정까지 처음 상태로 */
export async function resetAll(includeSettings: boolean): Promise<void> {
  const store = getStore();
  const all = await Promise.all(["surveys/", "responses/", "insights/"].map((p) => store.list(p)));
  await store.delete(all.flat());
  if (includeSettings) await store.delete(["settings.json", "sheet-status.json"]);
  clearResponseCache();
}
