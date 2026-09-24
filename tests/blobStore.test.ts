import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Blob 조건부 쓰기 회귀 테스트: @vercel/blob 을 ETag 를 흉내 내는 메모리 가짜로 바꾼다.
 * ifMatch 가 다르면 BlobPreconditionFailedError, allowOverwrite:false 인데 있으면 오류.
 */
const blobs = new Map<string, { body: string; etag: number }>();
let etagSeq = 0;
/** 다음 get 직후 다른 요청이 끼어들어 값을 바꾸게 할 훅 */
let interleave: (() => void) | null = null;

vi.mock("@vercel/blob", () => {
  class BlobPreconditionFailedError extends Error {}
  return {
    BlobPreconditionFailedError,
    get: async (pathname: string) => {
      const b = blobs.get(pathname);
      const hook = interleave;
      interleave = null;
      hook?.();
      if (!b) return null;
      return { statusCode: 200, stream: new Response(b.body).body, blob: { etag: String(b.etag) } };
    },
    put: async (pathname: string, body: string, opts: { ifMatch?: string; allowOverwrite?: boolean }) => {
      const cur = blobs.get(pathname);
      if (opts.ifMatch !== undefined && (!cur || String(cur.etag) !== opts.ifMatch)) throw new BlobPreconditionFailedError();
      if (opts.allowOverwrite === false && cur) throw new Error("This blob already exists");
      blobs.set(pathname, { body, etag: ++etagSeq });
    },
    del: async (paths: string[]) => paths.forEach((p) => blobs.delete(p)),
    list: async ({ prefix }: { prefix: string }) => ({
      blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((pathname) => ({ pathname })),
      hasMore: false,
    }),
  };
});

const { createBlobStore, CONFLICT_MESSAGE } = await import("@/lib/store");

describe("Blob 조건부 쓰기(updateJson)", () => {
  beforeEach(() => {
    blobs.clear();
    interleave = null;
  });

  it("읽은 뒤 다른 요청이 바꿨으면 다시 읽어 둘 다 반영한다", async () => {
    const s = createBlobStore();
    await s.putJson("settings.json", { a: 1 });
    interleave = () => blobs.set("settings.json", { body: JSON.stringify({ a: 1, b: 2 }), etag: ++etagSeq });
    await s.updateJson<Record<string, number>>("settings.json", (cur) => ({ ...cur, c: 3 }));
    expect(await s.getJson("settings.json")).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("첫 생성 경쟁: 다른 요청이 먼저 만들었으면 그 값을 보고 다시 판단(비밀값 1개만)", async () => {
    const s = createBlobStore();
    interleave = () => blobs.set("settings.json", { body: JSON.stringify({ secret: "first" }), etag: ++etagSeq });
    const saved = await s.updateJson<{ secret?: string }>("settings.json", (cur) => (cur?.secret ? undefined : { secret: "second" }));
    expect(saved).toEqual({ secret: "first" });
    expect(await s.getJson("settings.json")).toEqual({ secret: "first" });
  });

  it("삭제된 레코드는 수정으로 되살아나지 않는다", async () => {
    const s = createBlobStore();
    await s.putJson("surveys/a.json", { id: "a" });
    interleave = () => blobs.delete("surveys/a.json");
    const saved = await s.updateJson<{ id: string }>("surveys/a.json", (cur) => (cur ? { ...cur, title: "x" } : undefined));
    expect(saved).toBeNull();
    expect(blobs.has("surveys/a.json")).toBe(false);
  });

  it("5번 연속 충돌하면 한국어 오류", async () => {
    const s = createBlobStore();
    await s.putJson("k.json", { n: 0 });
    let left = 10;
    const bump = () => {
      blobs.set("k.json", { body: '{"n":9}', etag: ++etagSeq });
      if (--left > 0) interleave = bump;
    };
    interleave = bump;
    await expect(s.updateJson<{ n: number }>("k.json", (c) => ({ n: (c?.n ?? 0) + 1 }))).rejects.toThrow(CONFLICT_MESSAGE);
  });
});
