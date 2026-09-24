import { defineConfig, devices } from "@playwright/test";

const PORT = 3218;

// 라이브: 실제 Gemini 키로 «AI 생성 → 공개 → 휴대폰 응답 → 대시보드 → 분석 → 보고서» 한 흐름 (npm run test:live)
export default defineConfig({
  testDir: "e2e-live",
  timeout: 240_000,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e-live/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "ko-KR", timezoneId: "Asia/Seoul" },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { DATA_DIR: ".data-live", BLOB_READ_WRITE_TOKEN: "", BLOB_STORE_ID: "" },
  },
});
