import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put, get, list as blobList, del, BlobPreconditionFailedError } from "@vercel/blob";

/**
 * 저장소: 레코드 1건 = JSON 파일 1개.
 * Vercel Blob(비공개) 자격 증명이 있으면 Blob, 없으면 로컬 `.data/` 폴더.
 */
/** 현재 값을 받아 새 값을 돌려준다. undefined 를 돌려주면 쓰지 않는다(예: 이미 삭제된 레코드) */
export type Updater<T> = (current: T | null) => T | undefined;

export interface Store {
  putJson(pathname: string, data: unknown): Promise<void>;
  getJson<T>(pathname: string): Promise<T | null>;
  /** 조건부 쓰기: 읽은 뒤 다른 요청이 바꿨으면 다시 읽고 fn 을 다시 적용(최대 5회) */
  updateJson<T>(pathname: string, fn: Updater<T>): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  delete(pathnames: string[]): Promise<void>;
}

export const MAX_UPDATE_TRIES = 5;
export const CONFLICT_MESSAGE = "다른 변경과 동시에 저장되어 반영하지 못했습니다. 잠시 후 다시 시도하세요.";

const SAFE_PATH = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

function assertSafe(pathname: string): void {
  if (!SAFE_PATH.test(pathname) || pathname.includes("..")) {
    throw new Error(`잘못된 저장 경로: ${pathname}`);
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (attempt: number) => pause(20 * (attempt + 1) + Math.random() * 40);

export function createLocalStore(rootDir: string): Store {
  const full = (p: string) => path.join(rootDir, ...p.split("/"));
  // ponytail: 프로세스 하나 안에서만 직렬화. 여러 프로세스는 쓰기 직전 원문 비교(버전 확인)로만 막는다.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

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

  async function readRaw(pathname: string): Promise<string | null> {
    assertSafe(pathname);
    try {
      return await fs.readFile(full(pathname), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async function writeAtomic(pathname: string, data: unknown): Promise<void> {
    assertSafe(pathname);
    const target = full(pathname);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // 임시 파일에 쓴 뒤 이름 바꾸기 → 동시에 읽어도 반쯤 쓴 파일이 보이지 않는다
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), "utf8");
    await fs.rename(tmp, target);
  }

  return {
    putJson: writeAtomic,
    async getJson<T>(pathname: string) {
      const raw = await readRaw(pathname);
      return raw === null ? null : (JSON.parse(raw) as T);
    },
    updateJson<T>(pathname: string, fn: Updater<T>) {
      return serial(async () => {
        for (let attempt = 0; attempt < MAX_UPDATE_TRIES; attempt++) {
          const raw = await readRaw(pathname);
          const current = raw === null ? null : (JSON.parse(raw) as T);
          const next = fn(current);
          if (next === undefined) return current;
          // 버전 확인: 읽은 뒤 다른 프로세스가 바꿨으면 처음부터 다시
          if ((await readRaw(pathname)) !== raw) {
            await jitter(attempt);
            continue;
          }
          await writeAtomic(pathname, next);
          return next;
        }
        throw new Error(CONFLICT_MESSAGE);
      });
    },
    async list(prefix) {
      const all = await walk(rootDir, "");
      return all.filter((p) => p.startsWith(prefix)).sort();
    },
    delete(pathnames) {
      // 수정과 같은 줄에 세워, 삭제 직후 늦게 온 수정이 레코드를 되살리지 않게 한다
      return serial(async () => {
        await Promise.all(
          pathnames.map((p) => {
            assertSafe(p);
            return fs.rm(full(p), { force: true });
          }),
        );
      });
    },
  };
}

const BLOB_PUT = { access: "private", addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 } as const;

async function readBlob<T>(pathname: string): Promise<{ value: T; etag: string } | null> {
  // useCache:false → CDN 캐시를 건너뛰고 방금 쓴 내용을 바로 읽는다
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return { value: (await new Response(res.stream).json()) as T, etag: res.blob.etag };
}

export function createBlobStore(): Store {
  return {
    async putJson(pathname, data) {
      assertSafe(pathname);
      await put(pathname, JSON.stringify(data), { ...BLOB_PUT, allowOverwrite: true });
    },
    async getJson<T>(pathname: string) {
      assertSafe(pathname);
      return (await readBlob<T>(pathname))?.value ?? null;
    },
    async updateJson<T>(pathname: string, fn: Updater<T>) {
      assertSafe(pathname);
      for (let attempt = 0; attempt < MAX_UPDATE_TRIES; attempt++) {
        const current = await readBlob<T>(pathname);
        const next = fn(current?.value ?? null);
        if (next === undefined) return current?.value ?? null;
        // 있으면 ETag 가 같을 때만, 없으면 «아직 없을 때만» 쓴다(첫 생성도 원자적)
        const guard = current ? { ifMatch: current.etag } : { allowOverwrite: false };
        try {
          await put(pathname, JSON.stringify(next), { ...BLOB_PUT, ...guard });
          return next;
        } catch (err) {
          const lostCreateRace = !current && (await readBlob(pathname)) !== null;
          if (!(err instanceof BlobPreconditionFailedError) && !lostCreateRace) throw err;
          await jitter(attempt);
        }
      }
      throw new Error(CONFLICT_MESSAGE);
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

/** Blob 자격 증명: 읽기·쓰기 토큰, 또는 스토어 ID(+ Vercel OIDC — SDK가 자동으로 가져온다) */
export function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** Vercel 에 배포됐는데 Blob 이 없으면 로컬 파일로 가지 않는다(배포 파일시스템은 읽기 전용) */
export function storageMissing(): boolean {
  return Boolean(process.env.VERCEL) && !usesBlob();
}

export const STORAGE_MISSING_MESSAGE =
  "Vercel Blob 저장소가 연결되지 않았습니다. README 3단계대로 Vercel 프로젝트 › Storage 에서 Blob(Private) 저장소를 만들어 연결한 뒤 다시 배포하세요.";

let cached: Store | null = null;

export function getStore(): Store {
  if (storageMissing()) throw new Error(STORAGE_MISSING_MESSAGE);
  if (!cached) {
    cached = usesBlob()
      ? createBlobStore()
      : createLocalStore(path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || ".data"));
  }
  return cached;
}
