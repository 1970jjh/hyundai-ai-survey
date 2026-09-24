import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put, get, list as blobList, del } from "@vercel/blob";

/**
 * 저장소: 레코드 1건 = JSON 파일 1개.
 * Vercel Blob(비공개) 자격 증명이 있으면 Blob, 없으면 로컬 `.data/` 폴더.
 */
export interface Store {
  putJson(pathname: string, data: unknown): Promise<void>;
  getJson<T>(pathname: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  delete(pathnames: string[]): Promise<void>;
}

const SAFE_PATH = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

function assertSafe(pathname: string): void {
  if (!SAFE_PATH.test(pathname) || pathname.includes("..")) {
    throw new Error(`잘못된 저장 경로: ${pathname}`);
  }
}

export function createLocalStore(rootDir: string): Store {
  const full = (p: string) => path.join(rootDir, ...p.split("/"));

  async function walk(dir: string, base: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const nested = await Promise.all(
      entries.map((e) => {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) return walk(path.join(dir, e.name), rel);
        return Promise.resolve(e.name.endsWith(".json") ? [rel] : []);
      }),
    );
    return nested.flat();
  }

  return {
    async putJson(pathname, data) {
      assertSafe(pathname);
      const target = full(pathname);
      await fs.mkdir(path.dirname(target), { recursive: true });
      // 임시 파일에 쓴 뒤 이름 바꾸기 → 동시에 읽어도 반쯤 쓴 파일이 보이지 않는다
      const tmp = `${target}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data), "utf8");
      await fs.rename(tmp, target);
    },
    async getJson<T>(pathname: string) {
      assertSafe(pathname);
      try {
        return JSON.parse(await fs.readFile(full(pathname), "utf8")) as T;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async list(prefix) {
      const all = await walk(rootDir, "");
      return all.filter((p) => p.startsWith(prefix)).sort();
    },
    async delete(pathnames) {
      await Promise.all(
        pathnames.map((p) => {
          assertSafe(p);
          return fs.rm(full(p), { force: true });
        }),
      );
    },
  };
}

export function createBlobStore(): Store {
  return {
    async putJson(pathname, data) {
      assertSafe(pathname);
      await put(pathname, JSON.stringify(data), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
    },
    async getJson<T>(pathname: string) {
      assertSafe(pathname);
      // useCache:false → CDN 캐시를 건너뛰고 방금 쓴 내용을 바로 읽는다
      const res = await get(pathname, { access: "private", useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return (await new Response(res.stream).json()) as T;
    },
    async list(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await blobList({ prefix, cursor, limit: 1000 });
        out.push(...page.blobs.map((b) => b.pathname));
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return out.sort();
    },
    async delete(pathnames) {
      for (let i = 0; i < pathnames.length; i += 500) {
        const chunk = pathnames.slice(i, i + 500);
        if (chunk.length) await del(chunk);
      }
    },
  };
}

export function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

let cached: Store | null = null;

export function getStore(): Store {
  if (!cached) {
    cached = usesBlob()
      ? createBlobStore()
      : createLocalStore(path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || ".data"));
  }
  return cached;
}
