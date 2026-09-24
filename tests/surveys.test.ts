import { describe, expect, it } from "vitest";
import { setTempDataDir } from "./helpers";
import {
  createSurvey,
  deleteSurvey,
  getInsights,
  getSurvey,
  listResponses,
  listSurveys,
  QuestionLockedError,
  resetAll,
  saveAnalysis,
  saveReport,
  saveResponse,
  updateSurvey,
} from "@/lib/surveys";
import { readSettings, writeSettings } from "@/lib/settings";

setTempDataDir();

const input = {
  title: "테스트 설문",
  description: "",
  onePerDevice: true,
  questions: [{ id: "q1", type: "scale" as const, text: "만족도", required: true, options: [] }],
};

describe("설문 저장소", () => {
  it("만들기·수정·목록(응답 수 포함)", async () => {
    const s = await createSurvey(input);
    expect(s.status).toBe("draft");
    expect(s.id).toMatch(/^[a-zA-Z0-9]{10}$/);
    const u = await updateSurvey(s.id, { status: "open", title: "바뀐 제목" });
    expect(u).toMatchObject({ status: "open", title: "바뀐 제목" });
    await saveResponse(s.id, { q1: 5 });
    const list = await listSurveys();
    expect(list.find((x) => x.id === s.id)?.responseCount).toBe(1);
    expect(await updateSurvey("none", {})).toBeNull();
    expect(await getSurvey("../etc")).toBeNull();
  });

  it("20명이 동시에 제출해도 응답 20건이 모두 저장된다", async () => {
    const s = await createSurvey(input);
    const saved = await Promise.all(Array.from({ length: 20 }, (_, i) => saveResponse(s.id, { q1: (i % 5) + 1 })));
    expect(new Set(saved.map((r) => r.id)).size).toBe(20);
    const all = await listResponses(s.id);
    expect(all).toHaveLength(20);
    expect(all.reduce((n, r) => n + (r.answers.q1 as number), 0)).toBe(60);
  });

  it("분석·보고서는 별도 파일: 동시에 저장해도 둘 다 남고, 삭제 시 응답까지 함께 지움", async () => {
    const s = await createSurvey(input);
    await saveResponse(s.id, { q1: 3 });
    await Promise.all([
      saveReport(s.id, { data: { a: 1 }, createdAt: "x" }),
      saveAnalysis(s.id, { data: { b: 2 }, createdAt: "y", analyzed: 1, total: 1 }),
    ]);
    const both = await getInsights(s.id);
    expect(both.report?.data).toEqual({ a: 1 });
    expect(both.analysis?.data).toEqual({ b: 2 });
    await deleteSurvey(s.id);
    expect(await getSurvey(s.id)).toBeNull();
    expect(await listResponses(s.id)).toHaveLength(0);
    expect(await getInsights(s.id)).toEqual({});
  });

  it("전체 초기화: 데이터만 / 설정까지", async () => {
    await writeSettings({ geminiKey: "k-1234" });
    await createSurvey(input);
    await resetAll(false);
    expect(await listSurveys()).toHaveLength(0);
    expect((await readSettings()).geminiKey).toBe("k-1234");
    await resetAll(true);
    expect((await readSettings()).geminiKey).toBeUndefined();
  });
});

describe("설문 동시 수정·삭제", () => {
  it("다른 필드를 동시에 고쳐도 모두 남는다", async () => {
    const s = await createSurvey(input);
    await Promise.all([
      updateSurvey(s.id, { title: "새 제목" }),
      updateSurvey(s.id, { status: "open" }),
      updateSurvey(s.id, { description: "안내" }),
    ]);
    expect(await getSurvey(s.id)).toMatchObject({ title: "새 제목", status: "open", description: "안내" });
  });

  it("삭제와 수정이 겹쳐도 설문이 되살아나지 않는다", async () => {
    const s = await createSurvey(input);
    await Promise.all([deleteSurvey(s.id), updateSurvey(s.id, { title: "늦은 수정" })]);
    expect(await getSurvey(s.id)).toBeNull();
  });
});

describe("응답이 있는 문항 잠금", () => {
  const two = {
    ...input,
    questions: [
      { id: "q1", type: "single" as const, text: "좋았던 부분", required: true, options: ["이론", "실습"] },
      { id: "q2", type: "text" as const, text: "의견", required: false, options: [] },
    ],
  };

  it("응답 있는 문항은 유형·보기 변경·삭제 불가, 문구·필수 여부는 가능, 응답 없는 문항은 자유", async () => {
    const s = await createSurvey(two);
    await saveResponse(s.id, { q1: "실습" });
    const [q1, q2] = two.questions;
    await expect(updateSurvey(s.id, { questions: [{ ...q1, type: "multi" }, q2] })).rejects.toThrow(QuestionLockedError);
    await expect(updateSurvey(s.id, { questions: [{ ...q1, options: ["이론", "토론"] }, q2] })).rejects.toThrow(/유형·보기/);
    await expect(updateSurvey(s.id, { questions: [q2] })).rejects.toThrow(/삭제할 수 없습니다/);
    await expect(updateSurvey(s.id, { questions: [{ ...q1, id: "q9" }, q2] })).rejects.toThrow(QuestionLockedError);
    // 거부된 뒤에도 원래 문항 그대로
    expect((await getSurvey(s.id))?.questions).toEqual(two.questions);

    const ok = await updateSurvey(s.id, {
      questions: [{ ...q2, type: "scale" as const }, { ...q1, text: "가장 좋았던 부분은?", required: false }],
    });
    expect(ok?.questions.map((q) => [q.id, q.type, q.text])).toEqual([
      ["q2", "scale", "의견"],
      ["q1", "single", "가장 좋았던 부분은?"],
    ]);
  });
});
