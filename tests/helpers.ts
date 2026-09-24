import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** 테스트마다 빈 로컬 저장소 폴더를 쓰도록 DATA_DIR 지정(getStore 첫 호출 전에 불러야 함) */
export function setTempDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "survey-test-"));
  process.env.DATA_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  return dir;
}
