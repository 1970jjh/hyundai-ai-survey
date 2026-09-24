import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { analyzeTexts, generateSurvey, refineTemplate, writeReport, type Analysis } from "@/lib/ai";
import { pingGemini } from "@/lib/gemini";
import { collectTexts, summarize } from "@/lib/aggregate";
import { GEMINI_MODELS, surveyInputSchema, type Question, type SurveyResponse } from "@/lib/schemas";
import { loadTestKey, SAMPLE_TEXTS } from "./samples";

const apiKey = loadTestKey();
const cfg = { apiKey, model: "gemini-3.7-flash" as const };
const timings: Record<string, number | string> = {};

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const out = await fn();
  timings[name] = Date.now() - t;
  return out;
}

afterAll(() => {
  mkdirSync("live-results", { recursive: true });
  writeFileSync("live-results/live-ai-summary.json", JSON.stringify({ model: cfg.model, ms: timings }, null, 2));
});

describe("라이브 Gemini (실제 키)", () => {
  it.each(GEMINI_MODELS)("연결 테스트: %s", async (model) => {
    const ms = await pingGemini(apiKey, model);
    timings[`ping:${model}`] = ms;
    expect(ms).toBeGreaterThan(0);
  });

  it("한 줄 요청 → 설문 생성 (문항 수·주관식 수 지킴)", async () => {
    const s = await timed("generateSurvey", () => generateSurvey(cfg, "신입사원 온보딩 교육 만족도, 10문항, 주관식 2개"));
    expect(surveyInputSchema.safeParse(s).success).toBe(true);
    expect(s.questions).toHaveLength(10);
    expect(s.questions.filter((q) => q.type === "text")).toHaveLength(2);
    timings["generateSurvey:types"] = [...new Set(s.questions.map((q) => q.type))].join(",");
  });

  it.each(["satisfaction", "needs", "pulse"] as const)("템플릿 다듬기: %s", async (key) => {
    const s = await timed(`refine:${key}`, () => refineTemplate(cfg, key, "2026 HRD 담당자 AI Agent 개발 과정"));
    expect(surveyInputSchema.safeParse(s).success).toBe(true);
    expect(s.title).toMatch(/AI|HRD|Agent/);
    expect(s.questions.length).toBeGreaterThanOrEqual(5);
  });

  let analysis: Analysis | undefined;
  const questions: Question[] = [
    { id: "s1", type: "scale", text: "전반적 만족도", required: true, options: [] },
    { id: "n1", type: "nps", text: "추천 의향", required: true, options: [] },
    { id: "t1", type: "text", text: "좋았던 점과 개선할 점을 자유롭게 적어 주세요.", required: false, options: [] },
  ];
  const responses: SurveyResponse[] = SAMPLE_TEXTS.map((t, i) => ({
    id: `r${i}`,
    surveyId: "live",
    submittedAt: new Date(Date.now() - i * 60_000).toISOString(),
    answers: { s1: [5, 4, 4, 3, 5][i % 5], n1: [10, 9, 8, 6, 9, 10, 7][i % 7], t1: t },
  }));

  it("주관식 50건 분석 → 주제 3개 이상, 긍부정, 대표 인용", async () => {
    const r = await timed("analyze50", () => analyzeTexts(cfg, "신입사원 온보딩 교육", collectTexts(questions, responses)));
    analysis = r.data;
    expect(r.analyzed).toBe(50);
    expect(r.data.themes.length).toBeGreaterThanOrEqual(3);
    expect(r.data.representativeQuote.length).toBeGreaterThan(5);
    const s = r.data.sentiment;
    expect(s.positive + s.negative + s.neutral).toBeGreaterThan(0);
    timings["analyze50:themes"] = r.data.themes.map((t) => `${t.name}(${t.count})`).join(" / ");
  });

  it("결과 보고서: 요약→문항별 해석→잘된 점/개선점→다음 교육 제안", async () => {
    const summary = summarize(questions, responses);
    const rep = await timed("report", () =>
      writeReport(cfg, "신입사원 온보딩 교육", summary, collectTexts(questions, responses), analysis),
    );
    expect(rep.summary.length).toBeGreaterThan(20);
    expect(rep.questionInsights.length).toBeGreaterThan(0);
    expect(rep.strengths.length).toBeGreaterThan(0);
    expect(rep.improvements.length).toBeGreaterThan(0);
    expect(rep.nextSteps.length).toBeGreaterThan(0);
  });
});
