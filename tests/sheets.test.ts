import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { setTempDataDir } from "./helpers";
import { notifySheet, postToSheet, readSheetStatus, responseRecord, responseTabName, surveyRecord } from "@/lib/sheets";
import { writeSettings } from "@/lib/settings";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
import type { Survey, SurveyResponse } from "@/lib/schemas";

setTempDataDir();

const survey: Survey = {
  id: "Ab12Cd34Ef",
  title: "2026 신입사원 온보딩 교육 만족도: 1차 [본사]",
  description: "",
  onePerDevice: true,
  status: "open",
  createdAt: "2026-11-05T00:00:00Z",
  updatedAt: "2026-11-05T00:00:00Z",
  questions: [
    { id: "q1", type: "scale", text: "만족도", required: true, options: [] },
    { id: "q2", type: "multi", text: "좋았던 점", required: false, options: ["사례", "실습"] },
  ],
};
const response: SurveyResponse = {
  id: "r1",
  surveyId: survey.id,
  submittedAt: "2026-11-05T01:02:03Z",
  answers: { q1: 5, q2: ["사례", "실습"] },
};

// 가짜 Apps Script 수신 서버
let server: Server;
let base = "";
const received: unknown[] = [];
let mode: "ok" | "fail" | "slow" | "html" = "ok";

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push(JSON.parse(body));
      if (mode === "slow") return void setTimeout(() => res.end('{"ok":true}'), 400);
      if (mode === "html") return void res.end("<html>Google 오류</html>");
      res.setHeader("Content-Type", "application/json");
      res.end(mode === "ok" ? '{"ok":true}' : '{"ok":false,"error":"권한 없음"}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`;
});
afterAll(() => server.close());

describe("시트 페이로드", () => {
  it("응답 탭 이름 = 제목 앞부분 + ID 짧게, 금지 문자 제거", () => {
    const name = responseTabName(survey);
    expect(name).toBe("2026 신입사원 온보딩 교육 만족도_Ab12Cd");
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
  it("응답 레코드: 제출시각 + 각 문항 텍스트 헤더", () => {
    const rec = responseRecord(survey, response);
    expect(rec).toEqual({
      type: responseTabName(survey),
      action: "upsert",
      id: "r1",
      row: { 제출시각: "2026-11-05 10:02:03", "Q1. 만족도": "5", "Q2. 좋았던 점": "사례 | 실습" },
    });
    expect(Object.keys(rec.row)[0]).toBe("제출시각");
  });
  it("설문 목록 레코드는 surveys 탭", () => {
    const rec = surveyRecord(survey, "https://x.vercel.app", 3);
    expect(rec.type).toBe("surveys");
    expect(rec.row).toMatchObject({
      제목: survey.title,
      상태: "공개 중",
      문항수: 2,
      응답링크: "https://x.vercel.app/s/Ab12Cd34Ef",
      응답수: 3,
    });
  });
});

describe("시트 전송(가짜 수신 서버)", () => {
  it("POST 본문이 그대로 도착하고 ok를 돌려준다", async () => {
    mode = "ok";
    received.length = 0;
    const rec = responseRecord(survey, response);
    expect(await postToSheet(base, rec)).toEqual({ ok: true });
    expect(received).toEqual([rec]);
  });
  it("실패·타임아웃·HTML 응답을 친절한 오류로", async () => {
    mode = "fail";
    expect(await postToSheet(base, { action: "ping" })).toEqual({ ok: false, error: "권한 없음" });
    mode = "slow";
    expect(await postToSheet(base, { action: "ping" }, 100)).toMatchObject({ ok: false, error: expect.stringContaining("시간 초과") });
    mode = "html";
    expect(await postToSheet(base, { action: "ping" })).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
    expect(await postToSheet("http://127.0.0.1:1/exec", { action: "ping" })).toMatchObject({ ok: false });
  });
  it("꺼져 있으면 보내지 않고, 켜져 있으면 보내며 실패를 상태에 남긴다", async () => {
    mode = "ok";
    received.length = 0;
    await writeSettings({ sheetEnabled: false, sheetUrl: base });
    await notifySheet([responseRecord(survey, response)]);
    expect(received).toHaveLength(0);

    await writeSettings({ sheetEnabled: true });
    await notifySheet([responseRecord(survey, response)]);
    expect(received).toHaveLength(1);
    expect((await readSheetStatus()).lastSuccessAt).toBeTruthy();

    mode = "fail";
    await notifySheet([responseRecord(survey, response), surveyRecord(survey, "https://x")]);
    expect(received.at(-1)).toMatchObject({ records: [expect.any(Object), expect.any(Object)] });
    expect((await readSheetStatus()).lastError).toBe("권한 없음");
  });
});

describe("Apps Script 코드", () => {
  it("설정 화면에 보이는 코드가 apps-script/Code.gs 와 같다", () => {
    expect(APPS_SCRIPT_CODE).toBe(readFileSync("apps-script/Code.gs", "utf8"));
    expect(APPS_SCRIPT_CODE).toContain("LockService");
    expect(APPS_SCRIPT_CODE).toContain("function doPost");
  });
});
