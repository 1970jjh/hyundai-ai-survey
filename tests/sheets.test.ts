import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { setTempDataDir } from "./helpers";
import {
  appsScriptWithSecret, isAllowedRedirect, notifySheet, postToSheet, readSheetStatus, responseRecord, responseTabKey,
  responseTabName, surveyDeleteRecord, surveyRecord,
} from "@/lib/sheets";
import { ensureSheetSecret, writeSettings } from "@/lib/settings";
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
const SECRET = "ab".repeat(32);

// 가짜 Apps Script 수신 서버
let server: Server;
let base = "";
let origin = "";
const received: { path: string; body: Record<string, unknown> }[] = [];
let mode: "ok" | "fail" | "slow" | "html" | "flaky" | "busy" | "redirect-evil" = "ok";
let flakyLeft = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ path: req.url ?? "", body: body ? JSON.parse(body) : {} });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/evil") return void res.end('{"ok":true}');
      if (mode === "redirect-evil") {
        res.statusCode = 302;
        res.setHeader("Location", `${origin}/evil`);
        return void res.end();
      }
      if (mode === "slow") return void setTimeout(() => res.end('{"ok":true}'), 400);
      if (mode === "html") return void res.end("<html>Google 오류</html>");
      if (mode === "flaky" && flakyLeft-- > 0) {
        res.statusCode = 503;
        return void res.end("{}");
      }
      if (mode === "busy") return void res.end('{"ok":false,"busy":true,"error":"처리 중"}');
      res.end(mode === "fail" ? '{"ok":false,"error":"권한 없음"}' : '{"ok":true}');
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  base = `${origin}/exec`;
});
afterAll(() => server.close());

describe("시트 페이로드", () => {
  it("응답 탭 이름 = 제목 앞부분 + ID 짧게, 금지 문자 제거", () => {
    const name = responseTabName(survey);
    expect(name).toBe("2026 신입사원 온보딩 교육 만족도_Ab12Cd");
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });
  it("응답 레코드: 탭은 변하지 않는 설문 ID 키로 찾고, 제목은 표시 이름, updatedAt 포함", () => {
    const rec = responseRecord(survey, response);
    expect(rec).toEqual({
      type: "resp_Ab12Cd34Ef",
      tab: responseTabName(survey),
      action: "upsert",
      id: "r1",
      row: { 제출시각: "2026-11-05 10:02:03", "Q1. 만족도": "5", "Q2. 좋았던 점": "사례 | 실습" },
      updatedAt: response.submittedAt,
    });
    // 제목이 바뀌어도 같은 탭 키
    expect(responseRecord({ ...survey, title: "새 제목" }, response).type).toBe(responseTabKey(survey.id));
  });
  it("설문 목록 레코드는 surveys 탭, 삭제 레코드는 지금 시각", () => {
    const rec = surveyRecord(survey, "https://x.vercel.app", 3);
    expect(rec.type).toBe("surveys");
    expect(rec.updatedAt).toBe(survey.updatedAt);
    expect(rec.row).toMatchObject({ 제목: survey.title, 상태: "공개 중", 문항수: 2, 응답링크: "https://x.vercel.app/s/Ab12Cd34Ef", 응답수: 3 });
    expect(surveyDeleteRecord("x", new Date("2026-11-06T00:00:00Z")).updatedAt).toBe("2026-11-06T00:00:00.000Z");
  });
});

describe("시트 전송(가짜 수신 서버)", () => {
  it("본문에 비밀값을 실어 보내고 ok를 돌려준다", async () => {
    mode = "ok";
    received.length = 0;
    const rec = responseRecord(survey, response);
    expect(await postToSheet(base, { records: [rec] }, SECRET)).toEqual({ ok: true });
    expect(received).toEqual([{ path: "/exec", body: { records: [rec], secret: SECRET } }]);
  });
  it("실패·타임아웃·HTML 응답을 친절한 오류로", async () => {
    mode = "fail";
    expect(await postToSheet(base, { action: "ping" }, SECRET)).toEqual({ ok: false, error: "권한 없음" });
    mode = "slow";
    expect(await postToSheet(base, { action: "ping" }, SECRET, { timeoutMs: 100, retries: 0 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("시간 초과"),
    });
    mode = "html";
    expect(await postToSheet(base, { action: "ping" }, SECRET)).toMatchObject({ ok: false, error: expect.stringContaining("JSON") });
    expect(await postToSheet("http://127.0.0.1:1/exec", { action: "ping" }, SECRET, { retries: 0 })).toMatchObject({ ok: false });
  });
  it("일시 실패(5xx)는 짧게 쉬고 2번까지 다시 보낸다", async () => {
    mode = "flaky";
    flakyLeft = 2;
    received.length = 0;
    expect(await postToSheet(base, { action: "ping" }, SECRET)).toEqual({ ok: true });
    expect(received).toHaveLength(3);
  });
  it("락 대기(busy)도 재시도, 영구 실패(권한 없음)는 재시도하지 않는다", async () => {
    mode = "busy";
    received.length = 0;
    expect(await postToSheet(base, { action: "ping" }, SECRET)).toMatchObject({ ok: false });
    expect(received).toHaveLength(3);
    mode = "fail";
    received.length = 0;
    await postToSheet(base, { action: "ping" }, SECRET);
    expect(received).toHaveLength(1);
  });
  it("재시도는 전체 시간 한도를 넘기지 않는다", async () => {
    mode = "slow";
    received.length = 0;
    const started = Date.now();
    await postToSheet(base, { action: "ping" }, SECRET, { timeoutMs: 100, budgetMs: 600 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(received.length).toBeLessThan(3);
  });
  it("script.googleusercontent.com 이 아닌 리다이렉트는 따라가지 않는다", async () => {
    mode = "redirect-evil";
    received.length = 0;
    expect(await postToSheet(base, { action: "ping" }, SECRET)).toMatchObject({ ok: false, error: expect.stringContaining("Apps Script") });
    expect(received.map((r) => r.path)).toEqual(["/exec"]);
    expect(isAllowedRedirect("https://script.googleusercontent.com/macros/echo?x=1", base)).toBe(true);
    expect(isAllowedRedirect("http://script.googleusercontent.com/x", base)).toBe(false);
    expect(isAllowedRedirect("https://script.googleusercontent.com.evil.io/x", base)).toBe(false);
    expect(isAllowedRedirect("/local", base)).toBe(false);
  });
  it("꺼져 있으면 보내지 않고, 켜져 있으면 보내며 실패를 남기고, 성공하면 지난 오류를 지운다", async () => {
    mode = "ok";
    received.length = 0;
    await writeSettings({ sheetEnabled: false, sheetUrl: base });
    await notifySheet([responseRecord(survey, response)]);
    expect(received).toHaveLength(0);

    await writeSettings({ sheetEnabled: true });
    await notifySheet([responseRecord(survey, response)]);
    expect(received).toHaveLength(1);
    expect(received[0].body.secret).toBe(await ensureSheetSecret());
    expect((await readSheetStatus()).lastSuccessAt).toBeTruthy();

    mode = "fail";
    await notifySheet([responseRecord(survey, response), surveyRecord(survey, "https://x")]);
    expect(received.at(-1)?.body).toMatchObject({ records: [expect.any(Object), expect.any(Object)] });
    expect((await readSheetStatus()).lastError).toBe("권한 없음");

    mode = "ok";
    await notifySheet([responseRecord(survey, response)]);
    expect((await readSheetStatus()).lastError).toBeUndefined();
  });
});

describe("Apps Script 코드", () => {
  it("설정 화면 코드의 원본이 apps-script/Code.gs 와 같다", () => {
    expect(APPS_SCRIPT_CODE).toBe(readFileSync("apps-script/Code.gs", "utf8"));
    expect(APPS_SCRIPT_CODE).toContain("LockService");
    expect(APPS_SCRIPT_CODE).toContain("function doPost");
  });
  it("복사용 코드에 비밀값이 한 번 들어가고, 이상한 비밀값은 거부", () => {
    const code = appsScriptWithSecret(APPS_SCRIPT_CODE, SECRET);
    expect(code).toContain(`var SHEET_SECRET = '${SECRET}';`);
    expect(code).not.toContain("var SHEET_SECRET = '__SHEET_SECRET__'");
    expect(() => appsScriptWithSecret(APPS_SCRIPT_CODE, "x'; evil()")).toThrow();
  });
});
