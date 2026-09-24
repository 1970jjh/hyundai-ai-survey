import { z } from "zod";
import { generateJson } from "./gemini";
import { newId } from "./surveys";
import { QUESTION_TYPES, type GeminiModel, type Question, type SurveyInput } from "./schemas";
import type { Summary } from "./aggregate";
import { getTemplate, type TemplateKey } from "./templates";

export interface AiConfig {
  apiKey?: string;
  model: GeminiModel;
}

const today = () => new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

const SYSTEM_BASE = `당신은 한국 대기업(현대그룹) HR/HRD 담당자를 돕는 설문·교육평가 전문가입니다.
모든 출력은 자연스러운 한국어 존댓말로, 과장 없이 구체적으로 씁니다. 개인을 특정할 수 있는 표현은 쓰지 않습니다.`;
const system = () => `${SYSTEM_BASE}
오늘은 ${today()}입니다. 연도가 필요하면 올해를 씁니다.`;

// ── 설문 생성 ───────────────────────────────────────────
const draftSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  questions: z
    .array(
      z.object({
        type: z.enum(QUESTION_TYPES).describe("scale=5점 척도, single=객관식 단일, multi=객관식 복수, text=주관식, nps=0~10 추천 의향"),
        text: z.string().min(1).max(300),
        required: z.boolean(),
        options: z.array(z.string().min(1).max(100)).max(12).describe("single/multi 일 때만 2~8개, 나머지는 빈 배열"),
      }),
    )
    .min(1)
    .max(40),
});
type Draft = z.infer<typeof draftSchema>;

const QUESTION_RULES = `문항 작성 규칙:
- 유형은 scale(5점 척도), single(객관식 단일), multi(객관식 복수), text(주관식), nps(0~10 추천 의향) 중에서 고릅니다.
- 요청에 문항 수·주관식 개수가 있으면 정확히 지킵니다. 없으면 7~10문항.
- 한 문항에는 하나만 묻습니다. 유도 질문을 피합니다.
- single/multi 는 보기 2~8개, 서로 겹치지 않게. 다른 유형의 options 는 빈 배열.
- 주관식은 보통 선택(required=false), 나머지는 필수(required=true).`;

function toSurveyInput(d: Draft): SurveyInput {
  const questions: Question[] = d.questions.map((q) => {
    const choice = q.type === "single" || q.type === "multi";
    const options = choice ? [...new Set(q.options.map((o) => o.trim()).filter(Boolean))] : [];
    // 보기가 모자라면 주관식으로 바꿔 편집기에서 바로 쓸 수 있게
    const type = choice && options.length < 2 ? "text" : q.type;
    return { id: newId(8), type, text: q.text.trim(), required: q.required, options: type === q.type ? options : [] };
  });
  return { title: d.title.trim(), description: d.description.trim(), questions, onePerDevice: true };
}

export async function generateSurvey(cfg: AiConfig, request: string): Promise<SurveyInput> {
  const draft = await generateJson({
    ...cfg,
    system: system(),
    schema: draftSchema,
    prompt: `다음 요청에 맞는 설문을 만들어 주세요.\n요청: «${request}»\n\n${QUESTION_RULES}\n- 제목은 과정·목적이 드러나게, 설명은 응답자에게 건네는 1~2문장.`,
  });
  return toSurveyInput(draft);
}

export async function refineTemplate(cfg: AiConfig, key: TemplateKey, courseName: string): Promise<SurveyInput> {
  const t = getTemplate(key);
  const draft = await generateJson({
    ...cfg,
    system: system(),
    schema: draftSchema,
    prompt: `아래 «${t.label}» 기본 설문을 과정 «${courseName}»에 맞게 다듬어 주세요.
- 문항의 뜻과 유형, 순서는 대체로 유지하되 과정명·주제에 맞는 구체적 표현으로 바꿉니다.
- 과정 특성상 꼭 필요한 문항이 있으면 1~2개 더해도 됩니다.
- 제목에 과정명을 넣습니다.

${QUESTION_RULES}

기본 설문(JSON):
${JSON.stringify({ title: t.title, description: t.description, questions: t.questions })}`,
  });
  return toSurveyInput(draft);
}

// ── 주관식 분석 ─────────────────────────────────────────
export const analysisSchema = z.object({
  summary: z.string().describe("전체 주관식 응답을 2~3문장으로 요약"),
  themes: z
    .array(
      z.object({
        name: z.string().describe("주제 이름, 15자 이내"),
        count: z.number().int().min(0).describe("이 주제에 해당하는 응답 수"),
        sentiment: z.enum(["positive", "negative", "mixed"]),
        summary: z.string().describe("이 주제에서 나온 의견 한두 문장 요약"),
        quotes: z.array(z.string()).max(3).describe("원문 그대로 옮긴 대표 인용 1~3개"),
      }),
    )
    .min(1)
    .max(8),
  sentiment: z.object({
    positive: z.number().int().min(0),
    negative: z.number().int().min(0),
    neutral: z.number().int().min(0),
  }).describe("분석한 응답 한 건 한 건을 긍정/부정(개선 요청 포함)/중립으로 센 개수"),
  representativeQuote: z.string().describe("전체를 가장 잘 대표하는 인용문 하나(원문 그대로)"),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const MAX_ANALYZE_ANSWERS = 300;
export const MAX_ANSWER_CHARS = 400;
export const MAX_ANALYZE_CHARS = 60_000;

export interface TextGroup {
  question: string;
  answers: string[];
}

/** 토큰 한도를 넘지 않게 응답을 잘라 보낸다(먼저 들어온 응답부터 한도까지). */
export function prepareTexts(groups: TextGroup[]) {
  const total = groups.reduce((n, g) => n + g.answers.length, 0);
  let budgetCount = MAX_ANALYZE_ANSWERS;
  let budgetChars = MAX_ANALYZE_CHARS;
  const picked = groups.map((g) => {
    const answers: string[] = [];
    for (const a of g.answers) {
      const clipped = a.length > MAX_ANSWER_CHARS ? `${a.slice(0, MAX_ANSWER_CHARS)}…` : a;
      if (budgetCount <= 0 || budgetChars - clipped.length < 0) break;
      answers.push(clipped);
      budgetCount -= 1;
      budgetChars -= clipped.length;
    }
    return { question: g.question, answers };
  });
  const analyzed = picked.reduce((n, g) => n + g.answers.length, 0);
  return { groups: picked, total, analyzed, truncated: analyzed < total };
}

export async function analyzeTexts(cfg: AiConfig, surveyTitle: string, groups: TextGroup[]) {
  const prepared = prepareTexts(groups);
  if (prepared.analyzed === 0) throw new Error("분석할 주관식 응답이 아직 없습니다.");
  const body = prepared.groups
    .filter((g) => g.answers.length)
    .map((g) => `[문항] ${g.question}\n${g.answers.map((a) => `- ${a}`).join("\n")}`)
    .join("\n\n");
  const data = await generateJson({
    ...cfg,
    system: system(),
    schema: analysisSchema,
    prompt: `설문 «${surveyTitle}»의 주관식 응답 ${prepared.analyzed}건을 분석해 주세요.
- 비슷한 의견을 주제로 묶고 빈도(count) 순으로 정렬합니다. 응답이 충분하면 주제를 3개 이상 만듭니다.
- 인용문은 응답 원문을 그대로 옮기고, 새로 지어내지 않습니다.
- sentiment 세 값의 합은 분석한 응답 수(${prepared.analyzed})와 같게 셉니다.

${body}`,
  });
  return { data, analyzed: prepared.analyzed, total: prepared.total, truncated: prepared.truncated };
}

// ── 결과 보고서 ─────────────────────────────────────────
export const reportSchema = z.object({
  title: z.string(),
  summary: z.string().describe("핵심 요약 3~5문장. 응답 수·평균·NPS 등 숫자를 인용"),
  questionInsights: z
    .array(z.object({ question: z.string(), interpretation: z.string().describe("수치와 의견을 근거로 한 1~2문장 해석") }))
    .describe("주요 문항별 해석"),
  strengths: z.array(z.string()).min(1).max(6).describe("잘된 점"),
  improvements: z.array(z.string()).min(1).max(6).describe("개선점"),
  nextSteps: z.array(z.string()).min(1).max(6).describe("다음 교육을 위한 실행 가능한 제안"),
});
export type Report = z.infer<typeof reportSchema>;

function describeStats(summary: Summary): string {
  return summary.questions
    .map((q, i) => {
      const head = `Q${i + 1}. ${q.text} (응답 ${q.answered})`;
      if (q.type === "scale") return `${head} 평균 ${q.average ?? "-"}/5, 분포 ${q.buckets.map((b) => `${b.label}점:${b.count}`).join(", ")}`;
      if (q.type === "nps") return `${head} NPS ${q.nps ?? "-"}, 추천 ${q.promoters}·중립 ${q.passives}·비추천 ${q.detractors}, 평균 ${q.average ?? "-"}`;
      if (q.type === "text") return `${head} 주관식`;
      return `${head} ${q.buckets.map((b) => `${b.label}:${b.count}`).join(", ")}`;
    })
    .join("\n");
}

export async function writeReport(
  cfg: AiConfig,
  surveyTitle: string,
  summary: Summary,
  groups: TextGroup[],
  analysis?: Analysis,
): Promise<Report> {
  const prepared = prepareTexts(groups.map((g) => ({ ...g, answers: g.answers.slice(0, 60) })));
  const texts = prepared.groups
    .filter((g) => g.answers.length)
    .map((g) => `[문항] ${g.question}\n${g.answers.map((a) => `- ${a}`).join("\n")}`)
    .join("\n\n");
  return generateJson({
    ...cfg,
    system: system(),
    schema: reportSchema,
    prompt: `설문 «${surveyTitle}» 결과로 HRD 담당자가 상사에게 보고할 결과 보고서 초안을 써 주세요.
구성: 핵심 요약 → 문항별 해석 → 잘된 점 / 개선점 → 다음 교육 제안.
숫자는 아래 집계만 쓰고 지어내지 않습니다. 응답이 적으면 해석의 한계를 짧게 밝힙니다.

[집계] 총 응답 ${summary.total}건, 5점 척도 전체 평균 ${summary.averageScale ?? "-"}, NPS ${summary.nps ?? "-"}
${describeStats(summary)}
${analysis ? `\n[주관식 AI 분석]\n${JSON.stringify(analysis)}` : ""}
${texts ? `\n[주관식 원문 일부]\n${texts}` : ""}`,
  });
}
