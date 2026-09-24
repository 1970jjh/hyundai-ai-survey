import { defineConfig } from "vitest/config";
import path from "node:path";

// 실제 Gemini 호출 테스트: .env.test.local 의 GEMINI_API_KEY_FOR_TESTS 사용 (npm run test:live)
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", include: ["tests-live/**/*.test.ts"], testTimeout: 180_000, fileParallelism: false },
});
