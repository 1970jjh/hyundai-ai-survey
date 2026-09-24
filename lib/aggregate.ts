import type { Question, SurveyResponse } from "./schemas";

export interface Bucket {
  label: string;
  count: number;
}

export type QuestionStats =
  | { id: string; type: "scale"; text: string; answered: number; buckets: Bucket[]; average: number | null }
  | {
      id: string;
      type: "nps";
      text: string;
      answered: number;
      buckets: Bucket[];
      average: number | null;
      nps: number | null;
      promoters: number;
      passives: number;
      detractors: number;
    }
  | { id: string; type: "single" | "multi"; text: string; answered: number; buckets: Bucket[] }
  | { id: string; type: "text"; text: string; answered: number; samples: string[] };

export interface Summary {
  total: number;
  today: number;
  averageScale: number | null;
  nps: number | null;
  lastSubmittedAt: string | null;
  questions: QuestionStats[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function mean(values: number[]): number | null {
  return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function numericBuckets(values: number[], from: number, to: number): Bucket[] {
  return range(from, to).map((n) => ({ label: String(n), count: values.filter((v) => v === n).length }));
}

/** NPS = 추천(9–10) 비율 − 비추천(0–6) 비율, 정수 */
export function computeNps(values: number[]) {
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const passives = values.length - promoters - detractors;
  const nps = values.length ? Math.round(((promoters - detractors) / values.length) * 100) : null;
  return { nps, promoters, passives, detractors };
}

function statsFor(q: Question, responses: SurveyResponse[]): QuestionStats {
  const values = responses.map((r) => r.answers[q.id]).filter((v) => v !== undefined);
  const base = { id: q.id, text: q.text, answered: values.length };
  switch (q.type) {
    case "scale": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return { ...base, type: "scale", buckets: numericBuckets(nums, 1, 5), average: mean(nums) };
    }
    case "nps": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return { ...base, type: "nps", buckets: numericBuckets(nums, 0, 10), average: mean(nums), ...computeNps(nums) };
    }
    case "single":
    case "multi": {
      const picked = values.flatMap((v) => (Array.isArray(v) ? v : [v]));
      return {
        ...base,
        type: q.type,
        buckets: q.options.map((o) => ({ label: o, count: picked.filter((p) => p === o).length })),
      };
    }
    case "text":
      return {
        ...base,
        type: "text",
        samples: values.filter((v): v is string => typeof v === "string").slice(-5).reverse(),
      };
  }
}

export function summarize(questions: Question[], responses: SurveyResponse[], now = new Date()): Summary {
  const stats = questions.map((q) => statsFor(q, responses));
  const scaleValues = questions
    .filter((q) => q.type === "scale")
    .flatMap((q) => responses.map((r) => r.answers[q.id]))
    .filter((v): v is number => typeof v === "number");
  const firstNps = stats.find((s) => s.type === "nps");
  const todayKey = now.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const today = responses.filter(
    (r) => new Date(r.submittedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) === todayKey,
  ).length;
  return {
    total: responses.length,
    today,
    averageScale: mean(scaleValues),
    nps: firstNps && firstNps.type === "nps" ? firstNps.nps : null,
    lastSubmittedAt: responses.reduce<string | null>((m, r) => (!m || r.submittedAt > m ? r.submittedAt : m), null),
    questions: stats,
  };
}

/** 주관식 응답 모음(분석·보고서용) */
export function collectTexts(questions: Question[], responses: SurveyResponse[]) {
  return questions
    .filter((q) => q.type === "text")
    .map((q) => ({
      question: q.text,
      answers: responses.map((r) => r.answers[q.id]).filter((v): v is string => typeof v === "string"),
    }));
}
