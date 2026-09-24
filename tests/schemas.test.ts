import { describe, expect, it } from "vitest";
import { questionSchema, settingsPatchSchema, surveyInputSchema, surveyPatchSchema, validateAnswers, type Question } from "@/lib/schemas";

const qs: Question[] = [
  { id: "s", type: "scale", text: "만족도", required: true, options: [] },
  { id: "n", type: "nps", text: "추천", required: true, options: [] },
  { id: "o", type: "single", text: "하나", required: false, options: ["A", "B"] },
  { id: "m", type: "multi", text: "여럿", required: false, options: ["X", "Y", "Z"] },
  { id: "t", type: "text", text: "의견", required: false, options: [] },
];

describe("문항 스키마", () => {
  it("객관식은 보기 2개 이상, 중복 불가", () => {
    expect(questionSchema.safeParse({ id: "a", type: "single", text: "q", required: true, options: ["1"] }).success).toBe(false);
    expect(questionSchema.safeParse({ id: "a", type: "multi", text: "q", required: true, options: ["1", "1"] }).success).toBe(false);
    expect(questionSchema.safeParse({ id: "a", type: "single", text: "q", required: true, options: ["1", "2"] }).success).toBe(true);
  });
  it("빈 문항·잘못된 id·너무 긴 제목 거부", () => {
    expect(questionSchema.safeParse({ id: "a", type: "text", text: "  ", required: true }).success).toBe(false);
    expect(questionSchema.safeParse({ id: "../x", type: "text", text: "q", required: true }).success).toBe(false);
    expect(surveyInputSchema.safeParse({ title: "x".repeat(121), questions: [] }).success).toBe(false);
  });
  it("기본값: onePerDevice=true, 설명 빈 문자열", () => {
    const r = surveyInputSchema.parse({ title: "t", questions: [] });
    expect(r).toMatchObject({ onePerDevice: true, description: "" });
  });
  it("수정(PATCH)은 보낸 필드만 — 공개 버튼이 다른 설정을 덮어쓰지 않는다", () => {
    expect(surveyPatchSchema.parse({ status: "open" })).toEqual({ status: "open" });
  });
});

describe("응답 검증", () => {
  it("정상 응답은 통과하고 빈 값은 빠진다", () => {
    const r = validateAnswers(qs, { s: 5, n: 10, o: "A", m: ["X", "X", "Z"], t: "  좋아요 " });
    expect(r).toEqual({ ok: true, answers: { s: 5, n: 10, o: "A", m: ["X", "Z"], t: "좋아요" } });
    const r2 = validateAnswers(qs, { s: 1, n: 0, t: "   ", m: [] });
    expect(r2).toEqual({ ok: true, answers: { s: 1, n: 0 } });
  });
  it("필수 누락·범위 밖·없는 보기·모르는 문항 거부", () => {
    expect(validateAnswers(qs, { n: 3 })).toMatchObject({ ok: false, error: expect.stringContaining("1번") });
    expect(validateAnswers(qs, { s: 6, n: 3 }).ok).toBe(false);
    expect(validateAnswers(qs, { s: 2.5, n: 3 }).ok).toBe(false);
    expect(validateAnswers(qs, { s: 2, n: 11 }).ok).toBe(false);
    expect(validateAnswers(qs, { s: 2, n: 1, o: "C" }).ok).toBe(false);
    expect(validateAnswers(qs, { s: 2, n: 1, m: ["X", "Q"] }).ok).toBe(false);
    expect(validateAnswers(qs, { s: 2, n: 1, zzz: "x" }).ok).toBe(false);
    expect(validateAnswers(qs, "nope").ok).toBe(false);
    expect(validateAnswers(qs, { s: 2, n: 1, t: "x".repeat(2001) }).ok).toBe(false);
  });
});

describe("설정 스키마", () => {
  it("Apps Script 웹 앱 주소만 허용(SSRF 방지)", () => {
    const ok = (u: string) => settingsPatchSchema.safeParse({ sheetUrl: u }).success;
    expect(ok("https://script.google.com/macros/s/AKfy_cb-123/exec")).toBe(true);
    expect(ok("https://script.google.com/a/macros/hyundai.com/s/AKfy123/exec")).toBe(true);
    expect(ok("")).toBe(true);
    expect(ok("http://localhost:3000/x")).toBe(false);
    expect(ok("https://evil.com/macros/s/x/exec")).toBe(false);
  });
  it("모르는 모델 거부", () => {
    expect(settingsPatchSchema.safeParse({ model: "gpt-9" }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ model: "gemini-3.8-flash" }).success).toBe(true);
  });
});
