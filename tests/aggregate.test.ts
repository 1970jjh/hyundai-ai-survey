import { describe, expect, it } from "vitest";
import { collectTexts, computeNps, summarize } from "@/lib/aggregate";
import { toCsv } from "@/lib/csv";
import type { Question, SurveyResponse } from "@/lib/schemas";

const qs: Question[] = [
  { id: "s", type: "scale", text: "만족도", required: true, options: [] },
  { id: "s2", type: "scale", text: "도움", required: true, options: [] },
  { id: "n", type: "nps", text: "추천", required: true, options: [] },
  { id: "o", type: "single", text: "하나", required: false, options: ["A", "B"] },
  { id: "m", type: "multi", text: "여럿", required: false, options: ["X", "Y"] },
  { id: "t", type: "text", text: "의견", required: false, options: [] },
];

const r = (id: string, at: string, answers: SurveyResponse["answers"]): SurveyResponse => ({ id, surveyId: "sv", submittedAt: at, answers });
const responses = [
  r("1", "2026-11-05T01:00:00Z", { s: 5, s2: 4, n: 10, o: "A", m: ["X", "Y"], t: "좋았어요" }),
  r("2", "2026-11-05T02:00:00Z", { s: 4, s2: 4, n: 9, o: "B", m: ["X"] }),
  r("3", "2026-11-04T02:00:00Z", { s: 3, s2: 2, n: 5, o: "A", t: "=SUM(1,2) 실습, 더 \"많이\"" }),
];

describe("NPS", () => {
  it("추천 비율 − 비추천 비율", () => {
    expect(computeNps([10, 9, 5])).toEqual({ nps: 33, promoters: 2, passives: 0, detractors: 1 });
    expect(computeNps([7, 8])).toMatchObject({ nps: 0, passives: 2 });
    expect(computeNps([]).nps).toBeNull();
  });
});

describe("집계", () => {
  const s = summarize(qs, responses, new Date("2026-11-05T05:00:00Z"));
  it("총계·오늘·평균·NPS", () => {
    expect(s.total).toBe(3);
    expect(s.today).toBe(2);
    expect(s.averageScale).toBe(3.7); // (5+4+3+4+4+2)/6
    expect(s.nps).toBe(33);
    expect(s.lastSubmittedAt).toBe("2026-11-05T02:00:00Z");
  });
  it("문항별 분포", () => {
    const scale = s.questions[0];
    expect(scale.type === "scale" && scale.buckets.map((b) => b.count)).toEqual([0, 0, 1, 1, 1]);
    expect(scale.type === "scale" && scale.average).toBe(4);
    const nps = s.questions[2];
    expect(nps.type === "nps" && nps.buckets).toHaveLength(11);
    const multi = s.questions[4];
    expect(multi.type === "multi" && multi.buckets).toEqual([{ label: "X", count: 2 }, { label: "Y", count: 1 }]);
    expect(multi.answered).toBe(2);
    const text = s.questions[5];
    expect(text.type === "text" && text.samples[0]).toContain("실습");
  });
  it("응답이 없으면 비어 있는 값", () => {
    const e = summarize(qs, []);
    expect(e).toMatchObject({ total: 0, averageScale: null, nps: null, lastSubmittedAt: null });
  });
  it("주관식 모음", () => {
    expect(collectTexts(qs, responses)).toEqual([{ question: "의견", answers: ["좋았어요", expect.stringContaining("실습")] }]);
  });
});

describe("CSV", () => {
  const csv = toCsv(qs, responses);
  it("BOM + 한글 헤더 + 행 수", () => {
    expect(csv.startsWith("﻿응답ID,제출시각,Q1. 만족도")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(4);
    expect(csv).toContain("2026-11-05 10:00:00"); // KST
    expect(csv).toContain("X | Y");
  });
  it("수식 주입을 막고 따옴표를 이스케이프", () => {
    expect(csv).toContain(`"'=SUM(1,2) 실습, 더 ""많이"""`);
  });
  it("+ - @ 탭으로 시작하는 응답도 텍스트로(시트와 같은 방어)", () => {
    const text = [{ id: "t", type: "text" as const, text: "의견", required: false, options: [] }];
    const rows = ["+1", "-2", "@x", "	cmd"].map((v, i) => ({ id: `r${i}`, surveyId: "s", submittedAt: "2026-11-05T01:00:00Z", answers: { t: v } }));
    const out = toCsv(text, rows);
    for (const v of ["'+1", "'-2", "'@x", "'	cmd"]) expect(out).toContain(v);
  });
});
