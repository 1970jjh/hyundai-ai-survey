import { expect, test, devices, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadTestKey, SAMPLE_TEXTS } from "../tests-live/samples";

const timings: Record<string, number> = {};
async function timed(name: string, fn: () => Promise<unknown>) {
  const t = Date.now();
  await fn();
  timings[name] = Date.now() - t;
}

type Q = { id: string; type: string; options: string[]; required: boolean };

function answersFor(questions: Q[], i: number) {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.type === "scale") out[q.id] = [5, 4, 4, 3, 5][i % 5];
    if (q.type === "nps") out[q.id] = [10, 9, 8, 6, 9, 10, 7][i % 7];
    if (q.type === "single") out[q.id] = q.options[i % q.options.length];
    if (q.type === "multi") out[q.id] = [q.options[i % q.options.length]];
    if (q.type === "text") out[q.id] = SAMPLE_TEXTS[i % SAMPLE_TEXTS.length];
  }
  return out;
}

async function answerCurrentOnMobile(m: Page) {
  const active = m.locator(".question.active");
  if (await active.locator("input[type=radio]").count()) await active.locator("label").last().click();
  else if (await active.locator("input[type=checkbox]").count()) await active.locator("label").first().click();
  else await active.locator("textarea").fill("휴대폰으로 응답해 보니 편했습니다. 실습이 더 많았으면 해요.");
}

test("라이브: AI 설문 생성 → 공개 → 휴대폰 응답 → 대시보드 → 주관식 분석 → 보고서", async ({ page, browser }) => {
  // 로그인 + 키 등록 + 연결 테스트
  await page.goto("/admin");
  await page.getByLabel("관리자 비밀번호").fill("20261105");
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.getByRole("heading", { name: /진행 중인 설문/ })).toBeVisible();
  await page.goto("/admin/settings");
  await page.getByPlaceholder("AIza…").fill(loadTestKey());
  await page.getByRole("button", { name: "저장", exact: true }).first().click();
  await expect(page.getByTestId("key-mask")).toContainText("등록됨");
  await timed("ui:connectionTest", async () => {
    await page.getByRole("button", { name: /Gemini 연결 테스트/ }).click();
    await expect(page.getByText(/연결 성공 · gemini/)).toBeVisible({ timeout: 60_000 });
  });

  // 한 줄 요청 → AI 설문 생성
  await page.goto("/admin");
  await page.getByLabel("설문 요청 한 줄").fill("신입사원 온보딩 교육 만족도, 8문항, 주관식 2개");
  await timed("ui:generateSurvey", async () => {
    await page.getByRole("button", { name: /Gemini로 설문 생성/ }).click();
    await expect(page.getByRole("heading", { name: "문항 편집기" })).toBeVisible({ timeout: 120_000 });
  });
  await expect(page.getByTestId("q-item")).toHaveCount(8);
  await page.getByRole("button", { name: "공개하기" }).click();
  await expect(page.getByTestId("status-text")).toContainText("공개 중");
  const url = await page.getByTestId("share-url").innerText();
  const id = url.split("/s/")[1];

  // 휴대폰으로 한 문항씩 응답
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const m = await ctx.newPage();
  await m.goto(url);
  for (let i = 0; i < 8; i++) {
    await answerCurrentOnMobile(m);
    await m.locator(".mobile-foot .primary").click();
  }
  await expect(m.getByText("소중한 목소리를 남겨 주셔서 감사합니다.")).toBeVisible();
  await ctx.close();

  // 49명 더(주관식 샘플 포함) → 합계 50
  const { survey } = await (await page.request.get(`/api/surveys/${id}`)).json();
  const posts = Array.from({ length: 49 }, (_, i) =>
    page.request.post(`/api/public/surveys/${id}/responses`, { data: { answers: answersFor(survey.questions, i) } }),
  );
  expect((await Promise.all(posts)).every((r) => r.status() === 201)).toBe(true);

  // 대시보드 자동 반영
  await expect(page.getByTestId("total")).toContainText("50", { timeout: 20_000 });

  // 주관식 분석 → 주제 3개 이상
  await timed("ui:analyze", async () => {
    await page.getByRole("button", { name: /Gemini로 주관식 분석/ }).click();
    await expect(page.locator(".quote-panel blockquote")).toBeVisible({ timeout: 120_000 });
  });
  const themeCount = await page.locator(".themes span").count();
  expect(themeCount).toBeGreaterThanOrEqual(3);

  // 결과 보고서
  await timed("ui:report", async () => {
    await page.getByRole("button", { name: /Gemini 보고서 생성/ }).click();
    await expect(page.getByTestId("report-paper").getByRole("heading", { name: "4. 다음 교육 제안" })).toBeVisible({ timeout: 120_000 });
  });
  await expect(page.getByTestId("report-paper").locator("li").first()).toBeVisible();

  mkdirSync("live-results", { recursive: true });
  writeFileSync("live-results/live-e2e-summary.json", JSON.stringify({ themeCount, ms: timings }, null, 2));
});
