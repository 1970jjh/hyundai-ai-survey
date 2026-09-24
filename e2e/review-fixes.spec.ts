import { expect, test, devices } from "@playwright/test";
import { createOpenSurvey, login, PASSWORD, SAMPLE_QUESTIONS } from "./helpers";

test("초기 비밀번호 경고 띠: 로그인하면 보이고, 바꾸면 사라진다. 시트 코드에는 이 앱 비밀값이 들어 있다", async ({ page }) => {
  await login(page);
  const banner = page.getByTestId("pw-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("link", { name: /비밀번호 바꾸기/ }).click();
  await expect(page).toHaveURL(/\/admin\/settings#password$/);

  const code = await page.locator("pre.code-box").textContent();
  expect(code).toMatch(/var SHEET_SECRET = '[a-f0-9]{64}';/);
  expect(code).not.toContain("'__SHEET_SECRET__'");
  // 비밀값은 설정 API 응답에는 나오지 않는다
  expect(await (await page.request.get("/api/settings")).text()).not.toContain("sheetSecret");

  const change = async (current: string, next: string) => {
    const form = page.locator("form", { hasText: "관리자 비밀번호" });
    await form.getByLabel("현재 비밀번호").fill(current);
    await form.getByLabel("새 비밀번호", { exact: true }).fill(next);
    await form.getByLabel("새 비밀번호 확인").fill(next);
    await form.getByRole("button", { name: "비밀번호 변경" }).click();
    await expect(page.getByText("비밀번호를 바꿨습니다.")).toBeVisible();
  };
  await change(PASSWORD, "banner-test-1");
  await expect(banner).toBeHidden();
  await page.goto("/admin");
  await expect(page.getByTestId("pw-banner")).toHaveCount(0);
  await page.goto("/admin/settings");
  await change("banner-test-1", PASSWORD);
});

test("응답이 있는 문항은 유형·보기·삭제 잠금(화면과 API 모두), 문구 수정은 허용", async ({ page }) => {
  await login(page);
  const id = await createOpenSurvey(page.request, "잠금 테스트");
  const res = await page.request.post(`/api/public/surveys/${id}/responses`, { data: { answers: { q1: 5, q2: "실습", q4: 9 } } });
  expect(res.status()).toBe(201);

  await page.goto(`/admin/surveys/${id}`);
  const first = page.getByTestId("q-item").first();
  await expect(first.getByTestId("q-locked")).toBeVisible();
  await expect(page.getByLabel("1번 유형")).toBeDisabled();
  await expect(page.getByRole("button", { name: "1번 삭제" })).toBeDisabled();
  await expect(page.getByLabel("2번 보기")).toHaveAttribute("readonly", "");
  // 응답이 없는 문항(3번 복수선택)은 자유롭게
  await expect(page.getByLabel("3번 유형")).toBeEnabled();

  // 문구만 고치면 저장된다
  await page.getByLabel("1번 문항").fill("전반적인 만족도는 어땠나요?");
  await page.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(page.getByText("저장했습니다.")).toBeVisible();

  // API 로 유형을 바꾸려 하면 409
  const questions = SAMPLE_QUESTIONS.map((q) => ({ ...q, options: q.options ?? [] }));
  const changed = questions.map((q) => (q.id === "q2" ? { ...q, type: "multi" as const } : q));
  const patch = await page.request.patch(`/api/surveys/${id}`, { data: { questions: changed } });
  expect(patch.status()).toBe(409);
  expect((await patch.json()).error).toContain("유형·보기를 바꿀 수 없습니다");
});

test("휴대폰에서 다음·이전 문항으로 옮기면 새 문항 제목에 포커스", async ({ page, browser }) => {
  await login(page);
  const id = await createOpenSurvey(page.request, "포커스 테스트", { onePerDevice: false });
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const m = await ctx.newPage();
  await m.goto(`/s/${id}`);
  await m.getByRole("radiogroup", { name: "전반적인 만족도는?" }).getByText("4", { exact: true }).click();
  await m.getByRole("button", { name: "다음 질문" }).click();
  await expect(m.getByRole("heading", { name: "가장 좋았던 부분은?" })).toBeFocused();
  await m.getByRole("button", { name: "이전" }).click();
  await expect(m.getByRole("heading", { name: "전반적인 만족도는?" })).toBeFocused();
  await ctx.close();
});
