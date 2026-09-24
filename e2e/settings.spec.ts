import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

test("설정: 키 가림 표시, 시트 주소 검증, 비밀번호 변경·복구, 초기화", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/settings");
  await expect(page.getByTestId("key-mask")).toHaveText("미등록");

  // 가짜 키 저장 → 끝 4자리만 보임, 응답 JSON에도 키 원문 없음
  await page.getByPlaceholder("AIza…").fill("AIzaFAKEKEY-for-e2e-9Z7Q");
  await page.getByRole("button", { name: "저장", exact: true }).first().click();
  await expect(page.getByTestId("key-mask")).toContainText("9Z7Q");
  const json = await (await page.request.get("/api/settings")).text();
  expect(json).not.toContain("AIzaFAKEKEY");
  expect(json).not.toContain("sessionSecret");

  // Apps Script 주소가 아니면 거절
  await page.getByPlaceholder("https://script.google.com/macros/s/…/exec").fill("http://169.254.169.254/latest");
  await page.getByLabel("시트로 실시간 전송 켜기").check();
  await page.locator("section", { hasText: "구글시트 실시간 쌓기" }).getByRole("button", { name: "저장" }).click();
  await expect(page.getByText(/Apps Script 웹 앱 주소/).last()).toBeVisible();
  await expect(page.locator("pre.code-box")).toContainText("function doPost");

  // 비밀번호 변경 → 새 비밀번호로만 로그인 → 원래대로
  const change = async (current: string, next: string) => {
    const form = page.locator("form", { hasText: "관리자 비밀번호" });
    await form.getByLabel("현재 비밀번호").fill(current);
    await form.getByLabel("새 비밀번호", { exact: true }).fill(next);
    await form.getByLabel("새 비밀번호 확인").fill(next);
    await form.getByRole("button", { name: "비밀번호 변경" }).click();
    await expect(page.getByText("비밀번호를 바꿨습니다.")).toBeVisible();
  };
  await change(PASSWORD, "hrd-2026!");
  const other = await browser.newPage();
  await other.goto("/admin");
  await other.getByLabel("관리자 비밀번호").fill(PASSWORD);
  await other.getByRole("button", { name: "입장하기" }).click();
  await expect(other.locator(".notice[role=alert]")).toBeVisible();
  await other.getByLabel("관리자 비밀번호").fill("hrd-2026!");
  await other.getByRole("button", { name: "입장하기" }).click();
  await expect(other.getByRole("heading", { name: /진행 중인 설문/ })).toBeVisible();
  await other.close();
  await change("hrd-2026!", PASSWORD);

  // 데이터만 초기화 → 설문 목록 비어 있음, 키는 유지
  await page.getByLabel("확인을 위해 «초기화»라고 입력하세요").fill("초기화");
  await page.getByRole("button", { name: "전체 초기화" }).click();
  await expect(page.getByText("초기화했습니다.")).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("아직 만든 설문이 없습니다.")).toBeVisible();
  await page.goto("/admin/settings");
  await expect(page.getByTestId("key-mask")).toContainText("9Z7Q");
});
