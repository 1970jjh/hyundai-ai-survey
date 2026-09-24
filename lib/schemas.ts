import { z } from "zod";

z.config(z.locales.ko());

export const QUESTION_TYPES = ["scale", "single", "multi", "text", "nps"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const TYPE_LABEL: Record<QuestionType, string> = {
  scale: "5점 척도",
  single: "객관식 단일",
  multi: "객관식 복수",
  text: "주관식",
  nps: "NPS 0–10",
};

export const LIMITS = {
  title: 120,
  description: 500,
  questionText: 300,
  option: 100,
  options: 12,
  questions: 40,
  textAnswer: 2000,
  prompt: 500,
} as const;

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);

export const questionSchema = z
  .object({
    id: idSchema,
    type: z.enum(QUESTION_TYPES),
    text: z.string().trim().min(1, "문항 내용을 입력하세요").max(LIMITS.questionText),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(LIMITS.option)).max(LIMITS.options).default([]),
  })
  .superRefine((q, ctx) => {
    const needsOptions = q.type === "single" || q.type === "multi";
    if (needsOptions && q.options.length < 2) {
      ctx.addIssue({ code: "custom", message: `객관식 문항 «${q.text}»에는 보기가 2개 이상 필요합니다`, path: ["options"] });
    }
    if (needsOptions && new Set(q.options).size !== q.options.length) {
      ctx.addIssue({ code: "custom", message: `문항 «${q.text}»에 같은 보기가 두 번 있습니다`, path: ["options"] });
    }
  });
export type Question = z.infer<typeof questionSchema>;

/**
 * 응답이 있는 문항은 문구·필수 여부·순서만 바꿀 수 있다(유형·보기·ID·삭제 금지).
 * 과거 응답을 현재 문항 정의로 읽기 때문. 문제가 없으면 null.
 */
export function questionLockError(before: Question[], after: Question[], answered: Set<string>): string | null {
  const nextById = new Map(after.map((q) => [q.id, q]));
  for (const [i, q] of before.entries()) {
    if (!answered.has(q.id)) continue;
    const n = nextById.get(q.id);
    const label = `${i + 1}번 문항 «${q.text}»에는 이미 응답이 있어`;
    if (!n) return `${label} 삭제할 수 없습니다. 문구만 고칠 수 있습니다.`;
    if (n.type !== q.type || JSON.stringify(n.options) !== JSON.stringify(q.options)) {
      return `${label} 유형·보기를 바꿀 수 없습니다. 문구만 고칠 수 있습니다.`;
    }
  }
  return null;
}

export const surveyStatusSchema = z.enum(["draft", "open", "closed"]);
export type SurveyStatus = z.infer<typeof surveyStatusSchema>;

/** 관리자가 보내는 설문 내용(생성/수정 공통) */
const surveyFields = {
  title: z.string().trim().min(1, "설문 제목을 입력하세요").max(LIMITS.title),
  description: z.string().trim().max(LIMITS.description),
  questions: z.array(questionSchema).max(LIMITS.questions),
  onePerDevice: z.boolean(),
};

export const surveyInputSchema = z.object({
  ...surveyFields,
  description: surveyFields.description.default(""),
  onePerDevice: surveyFields.onePerDevice.default(true),
});
export type SurveyInput = z.infer<typeof surveyInputSchema>;

// 수정은 보낸 필드만 바꾼다(기본값을 채우면 공개 버튼이 설정을 덮어쓴다)
export const surveyPatchSchema = z
  .object(surveyFields)
  .partial()
  .extend({ status: surveyStatusSchema.optional() });

export interface Survey extends SurveyInput {
  id: string;
  status: SurveyStatus;
  createdAt: string;
  updatedAt: string;
}

export type AnswerValue = number | string | string[];
export interface SurveyResponse {
  id: string;
  surveyId: string;
  submittedAt: string;
  answers: Record<string, AnswerValue>;
}

export const answersSchema = z.record(
  idSchema,
  z.union([z.number(), z.string().max(LIMITS.textAnswer), z.array(z.string().max(LIMITS.option)).max(LIMITS.options)]),
);

/** 설문 문항에 맞춰 응답을 검증하고, 빈 값은 걸러 낸 새 객체를 돌려준다 */
export function validateAnswers(
  questions: Question[],
  raw: unknown,
): { ok: true; answers: Record<string, AnswerValue> } | { ok: false; error: string } {
  const parsed = answersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "응답 형식이 올바르지 않습니다." };
  const known = new Set(questions.map((q) => q.id));
  if (Object.keys(parsed.data).some((k) => !known.has(k))) {
    return { ok: false, error: "설문에 없는 문항 응답이 포함되어 있습니다." };
  }
  const entries: [string, AnswerValue][] = [];
  for (const [i, q] of questions.entries()) {
    const value = normalize(q, parsed.data[q.id]);
    if (value === "invalid") return { ok: false, error: `${i + 1}번 문항의 응답 값이 올바르지 않습니다.` };
    if (value === undefined) {
      if (q.required) return { ok: false, error: `${i + 1}번 문항은 필수입니다.` };
      continue;
    }
    entries.push([q.id, value]);
  }
  return { ok: true, answers: Object.fromEntries(entries) };
}

function normalize(q: Question, v: AnswerValue | undefined): AnswerValue | undefined | "invalid" {
  if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return undefined;
  switch (q.type) {
    case "scale":
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5 ? v : "invalid";
    case "nps":
      return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10 ? v : "invalid";
    case "single":
      return typeof v === "string" && q.options.includes(v) ? v : "invalid";
    case "multi":
      return Array.isArray(v) && v.every((o) => q.options.includes(o)) ? [...new Set(v)] : "invalid";
    case "text": {
      if (typeof v !== "string") return "invalid";
      const t = v.trim();
      return t ? t : undefined;
    }
  }
}

export const loginSchema = z.object({ password: z.string().min(1).max(100) });

export const GEMINI_MODELS = ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];

/** 시트 전송 주소는 Apps Script 웹 앱 형식만 허용(임의 주소로 서버가 요청을 보내지 않도록) */
export const SHEET_URL_PATTERN = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]{1,100}|macros)\/s\/[\w-]+\/exec$/;

export const settingsPatchSchema = z.object({
  geminiKey: z.string().trim().max(200).optional(),
  model: z.enum(GEMINI_MODELS).optional(),
  sheetUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || SHEET_URL_PATTERN.test(u), {
      message:
        "Apps Script 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 붙여 넣으세요",
    })
    .optional(),
  sheetEnabled: z.boolean().optional(),
});

export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(100),
  next: z.string().min(6, "새 비밀번호는 6자 이상이어야 합니다").max(100),
});

export const generateRequestSchema = z.union([
  z.object({ mode: z.literal("prompt"), prompt: z.string().trim().min(2).max(LIMITS.prompt) }),
  z.object({
    mode: z.literal("template"),
    template: z.enum(["satisfaction", "needs", "pulse"]),
    courseName: z.string().trim().min(1).max(LIMITS.title),
  }),
]);
