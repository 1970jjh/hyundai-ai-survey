import { expect, test } from "@playwright/test";
import { createOpenSurvey, expectNoHorizontalScroll, login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("관리자 API는 로그인 없이 401", async ({ request }) => {
  expect((await request.get("/api/surveys")).status()).toBe(401);
  expect((await request.get("/api/settings")).status()).toBe(401);
  expect((await request.post("/api/ai/generate", { data: { mode: "prompt", prompt: "x" } })).status()).toBe(401);
});

test("잘못된 비밀번호는 거절, 맞으면 빈 상태 화면", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("관리자 비밀번호").fill("1111");
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText("비밀번호가 올바르지 않습니다");
  await login(page);
  await expect(page.getByText("아직 만든 설문이 없습니다.")).toBeVisible();
  // 키가 없으면 AI 버튼 대신 안내
  await expect(page.getByText(/관리자에게 API 키 등록을 요청하세요/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Gemini로 설문 생성/ })).toBeDisabled();
  await expectNoHorizontalScroll(page);
});

test("직접 작성 → 문항 편집(5유형·순서·삭제) → 공개 → QR → 응답 → 대시보드 자동 갱신 → CSV", async ({ page, browser }) => {
  await login(page);
  await page.getByRole("button", { name: "직접 작성" }).click();
  await expect(page.getByRole("heading", { name: "문항 편집기" })).toBeVisible();

  await page.getByLabel("설문 제목").fill("E2E 교육 만족도");
  const add = page.locator(".add-row");
  for (const t of ["5점 척도", "객관식 단일", "객관식 복수", "주관식", "NPS 0–10"]) await add.getByRole("button", { name: t }).click();
  await expect(page.getByTestId("q-item")).toHaveCount(5);
  await page.getByLabel("1번 문항").fill("만족도는?");
  await page.getByLabel("2번 문항").fill("가장 좋았던 것은?");
  await page.getByLabel("2번 보기").fill("이론\n실습\n토론");
  await page.getByLabel("3번 문항").fill("더 원하는 것은?");
  await page.getByTestId("q-item").nth(2).getByLabel("필수 응답").uncheck();
  await page.getByLabel("4번 문항").fill("자유 의견을 주세요");
  await page.getByLabel("5번 문항").fill("추천 의향은?");
  // 5번(NPS)을 위로 옮기고, 새 문항을 추가했다가 삭제
  await page.getByRole("button", { name: "5번 위로" }).click();
  await expect(page.getByLabel("4번 문항")).toHaveValue("추천 의향은?");
  await add.getByRole("button", { name: "주관식" }).click();
  await page.getByRole("button", { name: "6번 삭제" }).click();
  await expect(page.getByTestId("q-item")).toHaveCount(5);

  // 저장 전에는 공개 불가
  await expect(page.getByRole("button", { name: "공개하기" })).toBeDisabled();
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(page.getByText("저장했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "공개하기" }).click();
  await expect(page.getByTestId("status-text")).toContainText("공개 중");

  const url = await page.getByTestId("share-url").innerText();
  expect(url).toMatch(/\/s\/[a-zA-Z0-9]{10}$/);
  await expect(page.locator(".qr-box svg")).toBeVisible();
  await page.getByRole("button", { name: "QR 전체화면" }).click();
  await expect(page.getByTestId("qr-full").locator("svg")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("qr-full")).toHaveCount(0);

  // 응답자(노트북): 필수 검증 → 제출
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const r = await ctx.newPage();
  await r.goto(url);
  await expect(r.getByRole("heading", { name: "E2E 교육 만족도" })).toBeVisible();
  await r.getByRole("button", { name: "응답 보내기" }).click();
  await expect(r.getByText(/필수 문항 \d개에 답해 주세요/)).toBeVisible();
  await r.getByRole("radiogroup", { name: "만족도는?" }).getByText("5", { exact: true }).click();
  await r.getByText("실습", { exact: true }).click();
  await r.getByText("토론", { exact: true }).click(); // 단일 선택: 마지막 값
  await r.getByRole("radiogroup", { name: "추천 의향은?" }).getByText("9", { exact: true }).click();
  await r.getByLabel("자유 의견을 주세요").fill("사례가 좋았고, 실습 시간을 늘려 주세요.");
  await expectNoHorizontalScroll(r);
  await r.getByRole("button", { name: "응답 보내기" }).click();
  await expect(r.getByText("소중한 목소리를 남겨 주셔서 감사합니다.")).toBeVisible();
  // 같은 기기 재방문 → 1회 제한
  await r.reload();
  await expect(r.getByText("이미 응답해 주셨습니다.")).toBeVisible();
  await ctx.close();

  // 대시보드: 새로고침 없이 10초 폴링으로 반영
  await expect(page.getByTestId("total")).toContainText("1", { timeout: 15_000 });
  await expect(page.getByTestId("chart-card")).toHaveCount(5);
  await expect(page.locator(".chart-card", { hasText: "추천 의향은?" })).toContainText("+100");
  await expect(page.locator(".chart-card", { hasText: "가장 좋았던 것은?" })).toContainText("토론");

  // CSV
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("a", { hasText: "원자료 CSV" }).first().click()]);
  const csv = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(csv).toString("utf8");
  expect(text).toContain("Q1. 만족도는?");
  expect(text).toContain("사례가 좋았고, 실습 시간을 늘려 주세요.");
  expect(text.trim().split("\r\n")).toHaveLength(2);

  // 마감 → 응답자에게 마감 안내, API 409
  await page.getByRole("button", { name: "마감하기" }).click();
  await expect(page.getByTestId("status-text")).toContainText("마감");
  const closed = await browser.newPage();
  await closed.goto(url);
  await expect(closed.getByText("마감된 설문입니다.")).toBeVisible();
  const id = url.split("/s/")[1];
  const res = await closed.request.post(`/api/public/surveys/${id}/responses`, { data: { answers: {} } });
  expect(res.status()).toBe(409);
  await closed.close();
  await expectNoHorizontalScroll(page);
});

test("템플릿 «기본 문항 그대로 쓰기»와 목록 반영", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "조직문화 펄스 템플릿" }).click();
  await page.getByPlaceholder("예: 2026 신입사원 온보딩 교육").fill("영업본부");
  await page.getByRole("button", { name: "기본 문항 그대로 쓰기" }).click();
  await expect(page.getByTestId("survey-title")).toHaveText("영업본부 조직문화 펄스 서베이");
  await expect(page.getByTestId("q-item")).toHaveCount(7);
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "영업본부 조직문화 펄스 서베이" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E 교육 만족도" })).toBeVisible();
});

test("작성 중인 설문은 응답자에게 비공개, 중복 허용 설문은 두 번 응답 가능", async ({ page }) => {
  await login(page);
  const draft = await page.request.post("/api/surveys", { data: { title: "초안", questions: [] } });
  const { survey } = await draft.json();
  await page.goto(`/s/${survey.id}`);
  await expect(page.getByText("아직 공개되지 않았거나 없는 설문입니다.")).toBeVisible();
  expect((await page.request.post(`/api/public/surveys/${survey.id}/responses`, { data: { answers: {} } })).status()).toBe(404);

  const id = await createOpenSurvey(page.request, "중복 허용", { onePerDevice: false });
  for (let i = 0; i < 2; i++) {
    await page.goto(`/s/${id}`);
    await page.getByRole("radiogroup", { name: "전반적인 만족도는?" }).getByText("4", { exact: true }).click();
    await page.getByText("실습", { exact: true }).click();
    await page.getByRole("radiogroup", { name: "동료에게 추천할 의향은?" }).getByText("7", { exact: true }).click();
    await page.getByRole("button", { name: "응답 보내기" }).click();
    await expect(page.getByText("소중한 목소리를 남겨 주셔서 감사합니다.")).toBeVisible();
  }
  const results = await (await page.request.get(`/api/surveys/${id}/results`)).json();
  expect(results.summary.total).toBe(2);
});

test("잘못된 응답은 서버에서 거절", async ({ page }) => {
  await login(page);
  const id = await createOpenSurvey(page.request, "검증");
  const post = (answers: unknown) => page.request.post(`/api/public/surveys/${id}/responses`, { data: { answers } });
  expect((await post({ q1: 9, q2: "실습", q4: 3 })).status()).toBe(400);
  expect((await post({ q1: 3, q2: "없는 보기", q4: 3 })).status()).toBe(400);
  expect((await post({ q2: "실습", q4: 3 })).status()).toBe(400);
  expect((await post({ q1: 3, q2: "실습", q4: 3, hack: "x" })).status()).toBe(400);
  expect((await post({ q1: 3, q2: "실습", q4: 3 })).status()).toBe(201);
});
