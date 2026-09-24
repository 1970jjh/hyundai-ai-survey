import { describe, expect, it } from "vitest";
import { setTempDataDir } from "./helpers";
import { ensureSessionSecret, ensureSheetSecret, readSettings, writeSettings } from "@/lib/settings";

setTempDataDir();

describe("설정 동시 변경", () => {
  it("서로 다른 항목을 동시에 바꿔도 모두 남는다(비밀번호·키·모델)", async () => {
    await Promise.all([
      writeSettings({ passwordHash: "salt:hash" }),
      writeSettings({ geminiKey: "key-1234" }),
      writeSettings({ model: "gemini-3.8-flash" }),
      writeSettings({ sheetEnabled: true }),
    ]);
    expect(await readSettings()).toMatchObject({
      passwordHash: "salt:hash",
      geminiKey: "key-1234",
      model: "gemini-3.8-flash",
      sheetEnabled: true,
    });
  });

  it("첫 실행 서명 비밀값은 동시에 요청해도 하나만 만들어진다", async () => {
    const secrets = await Promise.all(Array.from({ length: 10 }, () => ensureSessionSecret()));
    expect(new Set(secrets).size).toBe(1);
    expect((await readSettings()).sessionSecret).toBe(secrets[0]);
    const sheet = await Promise.all(Array.from({ length: 5 }, () => ensureSheetSecret()));
    expect(new Set(sheet).size).toBe(1);
    expect(sheet[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(sheet[0]).not.toBe(secrets[0]);
    // 다른 설정은 그대로
    expect((await readSettings()).geminiKey).toBe("key-1234");
  });
});
