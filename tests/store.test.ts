import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalStore } from "@/lib/store";

const fresh = () => createLocalStore(mkdtempSync(path.join(tmpdir(), "store-")));

describe("로컬 저장소", () => {
  it("쓰고 읽고 목록·삭제한다", async () => {
    const s = fresh();
    await s.putJson("surveys/a.json", { id: "a" });
    await s.putJson("responses/a/1.json", { n: 1 });
    await s.putJson("responses/a/2.json", { n: 2 });
    expect(await s.getJson("surveys/a.json")).toEqual({ id: "a" });
    expect(await s.list("responses/a/")).toEqual(["responses/a/1.json", "responses/a/2.json"]);
    await s.delete(["responses/a/1.json"]);
    expect(await s.list("responses/")).toEqual(["responses/a/2.json"]);
  });

  it("없는 파일은 null", async () => {
    expect(await fresh().getJson("nope.json")).toBeNull();
  });

  it("덮어쓰기는 마지막 값을 남긴다", async () => {
    const s = fresh();
    await s.putJson("settings.json", { v: 1 });
    await s.putJson("settings.json", { v: 2 });
    expect(await s.getJson("settings.json")).toEqual({ v: 2 });
  });

  it("경로 밖으로 나가는 이름을 거부한다", async () => {
    const s = fresh();
    await expect(s.putJson("../evil.json", {})).rejects.toThrow();
    await expect(s.getJson("a/../../b.json")).rejects.toThrow();
  });

  it("20건을 동시에 써도 20건 모두 남는다", async () => {
    const s = fresh();
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.putJson(`responses/x/${i}.json`, { i })));
    const paths = await s.list("responses/x/");
    expect(paths).toHaveLength(20);
    const values = await Promise.all(paths.map((p) => s.getJson<{ i: number }>(p)));
    expect(values.map((v) => v!.i).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
