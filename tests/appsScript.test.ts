import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
import { appsScriptWithSecret } from "@/lib/sheets";

/**
 * Apps Script(Code.gs)를 Node 에서 실제로 돌려 보는 회귀 테스트.
 * SpreadsheetApp·LockService·PropertiesService·ContentService 를 메모리 가짜로 바꿔 끼운다.
 */
const SECRET = "cd".repeat(32);
type Cell = string | number;

class FakeSheet {
  rows: Cell[][] = [];
  constructor(public name: string, readonly id: number) {}
  getName() { return this.name; }
  setName(n: string) { this.name = n; }
  getSheetId() { return this.id; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  appendRow(values: Cell[]) { this.rows.push([...values]); }
  deleteRow(i: number) { this.rows.splice(i - 1, 1); }
  setFrozenRows() {}
  getRange(row: number, col: number, nRows = 1, nCols = 1) {
    const range = {
      getValues: () => Array.from({ length: nRows }, (_, r) => Array.from({ length: nCols }, (_, c) => this.rows[row - 1 + r]?.[col - 1 + c] ?? "")),
      getValue: () => this.rows[row - 1]?.[col - 1] ?? "",
      setValues: (vals: Cell[][]) => {
        vals.forEach((v, r) => {
          const target = this.rows[row - 1 + r] ?? [];
          v.forEach((cell, c) => (target[col - 1 + c] = cell));
          this.rows[row - 1 + r] = target;
        });
        return range;
      },
      setFontWeight: () => range,
    };
    return range;
  }
}

function load(code: string, opts: { lockFree?: boolean } = {}) {
  const sheets: FakeSheet[] = [];
  const props = new Map<string, string>();
  const book = {
    getSheets: () => sheets,
    getSheetByName: (n: string) => sheets.find((s) => s.getName() === n) ?? null,
    insertSheet: (n: string) => {
      const s = new FakeSheet(n, 1000 + sheets.length);
      sheets.push(s);
      return s;
    },
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => book, flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => opts.lockFree !== false, releaseLock: () => {} }) },
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (k: string) => props.get(k) ?? null, setProperty: (k: string, v: string) => props.set(k, v) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t: string) => ({ setMimeType: () => JSON.parse(t) }) },
  });
  vm.runInContext(code, ctx);
  const post = (body: unknown) => (ctx.doPost as (e: unknown) => Record<string, unknown>)({ postData: { contents: JSON.stringify(body) } });
  return { sheets, post, tab: (name: string) => sheets.find((s) => s.getName() === name) };
}

const record = (over: Record<string, unknown> = {}) => ({
  type: "resp_Survey1",
  tab: "만족도_Survey",
  action: "upsert",
  id: "r1",
  row: { 제출시각: "2026-11-05 10:00:00", "Q1. 의견": "좋아요" },
  updatedAt: "2026-11-05T01:00:00.000Z",
  ...over,
});

describe("Apps Script 수신기(Code.gs)", () => {
  const code = appsScriptWithSecret(APPS_SCRIPT_CODE, SECRET);

  it("비밀값이 다르거나 없으면 거부하고, 원본(비밀값 미설정) 코드는 항상 거부", () => {
    const gs = load(code);
    expect(gs.post({ action: "ping" })).toMatchObject({ ok: false, error: expect.stringContaining("비밀값") });
    expect(gs.post({ secret: "wrong", records: [record()] })).toMatchObject({ ok: false });
    expect(gs.sheets).toHaveLength(0);
    expect(gs.post({ secret: SECRET, action: "ping" })).toMatchObject({ ok: true });
    const raw = load(APPS_SCRIPT_CODE);
    expect(raw.post({ secret: "__SHEET_SECRET__", action: "ping" })).toMatchObject({ ok: false });
  });

  it("type·action·id·row·updatedAt 형식이 틀리면 거부", () => {
    const gs = load(code);
    const bad = [
      record({ type: "../x" }),
      record({ action: "drop" }),
      record({ id: "a b" }),
      record({ id: "-r1" }),
      record({ row: [1, 2] }),
      record({ row: { "=HYPERLINK()": "x" } }),
      record({ row: { a: { nested: true } } }),
      record({ updatedAt: "어제" }),
    ];
    for (const r of bad) expect(gs.post({ secret: SECRET, records: [r] })).toMatchObject({ ok: false });
    expect(gs.post({ secret: SECRET, records: [] })).toMatchObject({ ok: false });
    expect(gs.sheets).toHaveLength(0);
  });

  it("= + - @ 탭 CR 로 시작하는 값은 ' 를 붙여 텍스트로, 숫자는 그대로", () => {
    const gs = load(code);
    const row = { a: "=IMPORTXML(\"http://evil\")", b: "+1", c: "-2", d: "@x", e: "\tx", f: "\rx", g: "보통 글", h: 7 };
    expect(gs.post({ secret: SECRET, records: [record({ row })] })).toMatchObject({ ok: true });
    const sheet = gs.tab("만족도_Survey")!;
    const [headers, values] = sheet.rows;
    const get = (k: string) => values[headers.indexOf(k)];
    expect(get("a")).toBe("'=IMPORTXML(\"http://evil\")");
    expect(["b", "c", "d", "e", "f"].map(get)).toEqual(["'+1", "'-2", "'@x", "'\tx", "'\rx"]);
    expect(get("g")).toBe("보통 글");
    expect(get("h")).toBe(7);
  });

  it("같은 ID 는 갱신, 더 오래된 updatedAt 은 무시(순서 역전 방지), 삭제", () => {
    const gs = load(code);
    gs.post({ secret: SECRET, records: [record({ row: { v: "새 값" }, updatedAt: "2026-11-05T02:00:00Z" })] });
    const res = gs.post({ secret: SECRET, records: [record({ row: { v: "옛 값" }, updatedAt: "2026-11-05T01:00:00Z" })] });
    expect(res).toMatchObject({ ok: true, skipped: 1 });
    const sheet = gs.tab("만족도_Survey")!;
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1][sheet.rows[0].indexOf("v")]).toBe("새 값");
    gs.post({ secret: SECRET, records: [record({ row: { v: "더 새 값" }, updatedAt: "2026-11-05T03:00:00Z" })] });
    expect(sheet.rows[1][sheet.rows[0].indexOf("v")]).toBe("더 새 값");
    gs.post({ secret: SECRET, records: [record({ action: "delete", row: {}, updatedAt: "2026-11-05T04:00:00Z" })] });
    expect(sheet.rows).toHaveLength(1);
  });

  it("설문 제목이 바뀌어도 같은 탭(설문 ID 키)에 쌓이고 탭 이름만 바뀐다", () => {
    const gs = load(code);
    gs.post({ secret: SECRET, records: [record({ id: "r1" })] });
    gs.post({ secret: SECRET, records: [record({ id: "r2", tab: "새 제목_Survey" })] });
    expect(gs.sheets).toHaveLength(1);
    expect(gs.sheets[0].getName()).toBe("새 제목_Survey");
    expect(gs.sheets[0].rows).toHaveLength(3);
  });

  it("락을 못 잡으면 busy 로 알려 앱이 다시 보내게 한다", () => {
    const gs = load(code, { lockFree: false });
    expect(gs.post({ secret: SECRET, records: [record()] })).toMatchObject({ ok: false, busy: true });
  });
});
