import { defineConfig, devices } from "@playwright/test";

const PORT = 3217;

// E2E: 로컬 저장 모드(.data-e2e)로 프로덕션 빌드를 띄워 핵심 흐름을 검증한다
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "ko-KR", timezoneId: "Asia/Seoul" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATA_DIR: ".data-e2e", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "" },
  },
});
