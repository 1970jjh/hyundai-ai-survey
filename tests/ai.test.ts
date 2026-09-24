import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_ANALYZE_ANSWERS, MAX_ANSWER_CHARS, prepareTexts, analysisSchema, reportSchema } from "@/lib/ai";
import { AiError, friendlyError, generateJson, NO_KEY_MESSAGE, toGeminiSchema } from "@/lib/gemini";
import { TEMPLATES } from "@/lib/templates";
import { questionSchema } from "@/lib/schemas";

describe("주관식 자르기(토큰 한도)", () => {
  it("적으면 그대로", () => {
    const r = prepareTexts([{ question: "q", answers: ["a", "b"] }]);
    expect(r).toMatchObject({ total: 2, analyzed: 2, truncated: false });
  });
  it("많으면 최대 개수까지만 보내고 잘렸다고 알린다", () => {
    const answers = Array.from({ length: 500 }, (_, i) => `응답 ${i}`);
    const r = prepareTexts([{ question: "q", answers }]);
    expect(r.total).toBe(500);
    expect(r.analyzed).toBe(MAX_ANALYZE_ANSWERS);
    expect(r.truncated).toBe(true);
  });
  it("긴 응답은 앞부분만", () => {
    const r = prepareTexts([{ question: "q", answers: ["가".repeat(MAX_ANSWER_CHARS + 50)] }]);
    expect(r.groups[0].answers[0].length).toBe(MAX_ANSWER_CHARS + 1);
  });
});

describe("Gemini 스키마 변환", () => {
  it("지원하지 않는 키워드($schema, minLength 등)를 없앤다", () => {
    const s = JSON.stringify(toGeminiSchema(z.object({ a: z.string().min(1).max(5), b: z.array(z.number()).min(1).max(40) })));
    expect(s).not.toContain("$schema");
    expect(s).not.toContain("minLength");
    expect(s).toContain("minItems");
    expect(s).not.toContain("maxItems");
    for (const schema of [analysisSchema, reportSchema]) {
      expect(JSON.stringify(toGeminiSchema(schema))).toContain('"properties"');
    }
  });
});

describe("Gemini 오류", () => {
  it("키가 없으면 관리자에게 등록 요청 안내", async () => {
    await expect(
      generateJson({ model: "gemini-3.7-flash", system: "", prompt: "", schema: z.object({}) }),
    ).rejects.toThrow(NO_KEY_MESSAGE);
  });
  it("상태 코드를 한국어 오류로", () => {
    expect(friendlyError(Object.assign(new Error("x"), { status: 429 })).message).toContain("한도");
    expect(friendlyError(Object.assign(new Error("API key not valid"), { status: 400 })).message).toContain("키");
    expect(friendlyError(new Error("boom"))).toBeInstanceOf(AiError);
  });
});

describe("내장 템플릿 3종", () => {
  it("모든 문항이 스키마를 통과한다", () => {
    expect(TEMPLATES.map((t) => t.key)).toEqual(["satisfaction", "needs", "pulse"]);
    for (const t of TEMPLATES) {
      t.questions.forEach((q, i) => {
        expect(questionSchema.safeParse({ ...q, id: `q${i}`, options: q.options ?? [] }).success).toBe(true);
      });
    }
  });
});
