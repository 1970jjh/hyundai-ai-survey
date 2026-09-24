import { describe, expect, it } from "vitest";
import { setTempDataDir } from "./helpers";
import {
  createSurvey,
  deleteSurvey,
  getInsights,
  getSurvey,
  listResponses,
  listSurveys,
  resetAll,
  saveInsights,
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

  it("인사이트 저장, 삭제 시 응답까지 함께 지움", async () => {
    const s = await createSurvey(input);
    await saveResponse(s.id, { q1: 3 });
    await saveInsights(s.id, { report: { data: { a: 1 }, createdAt: "x" } });
    expect((await getInsights(s.id)).report?.data).toEqual({ a: 1 });
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
