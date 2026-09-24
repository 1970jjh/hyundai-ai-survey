import { expect, test, devices } from "@playwright/test";
import { createOpenSurvey, expectNoHorizontalScroll, login, PASSWORD } from "./helpers";

test("휴대폰(390px): 한 문항씩, 진행 표시, 필수 검증, 이전/다음, 제출", async ({ page, browser }) => {
  await login(page);
  const id = await createOpenSurvey(page.request, "모바일 응답");

  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const m = await ctx.newPage();
  await m.goto(`/s/${id}`);
  await expect(m.getByTestId("step")).toHaveText("1 / 5");
  await expect(m.locator(".question.active")).toHaveCount(1);
  await expect(m.getByText("전반적인 만족도는?")).toBeVisible();
  await expect(m.getByText("가장 좋았던 부분은?")).toBeHidden();
  await expectNoHorizontalScroll(m);

  // 필수 문항을 비우고 다음 → 막힘
  await m.getByRole("button", { name: "다음 질문" }).click();
  await expect(m.getByText("이 문항은 필수입니다.")).toBeVisible();
  await expect(m.getByTestId("step")).toHaveText("1 / 5");

  await m.getByRole("radiogroup", { name: "전반적인 만족도는?" }).getByText("4", { exact: true }).click();
  await m.getByRole("button", { name: "다음 질문" }).click();
  await expect(m.getByTestId("step")).toHaveText("2 / 5");
  await m.getByRole("button", { name: "이전" }).click();
  await expect(m.getByTestId("step")).toHaveText("1 / 5");
  await m.getByRole("button", { name: "다음 질문" }).click();
  await m.getByText("토론", { exact: true }).click();
  await m.getByRole("button", { name: "다음 질문" }).click();
  await m.getByText("도구", { exact: true }).click(); // 선택 문항
  await m.getByRole("button", { name: "다음 질문" }).click();
  await expect(m.getByTestId("step")).toHaveText("4 / 5");
  await m.getByRole("radiogroup", { name: "동료에게 추천할 의향은?" }).getByText("10", { exact: true }).click();
  await expectNoHorizontalScroll(m);
  await m.getByRole("button", { name: "다음 질문" }).click();
  await m.getByLabel("자유 의견").fill("휴대폰으로도 편했어요");
  await m.getByRole("button", { name: "응답 보내기" }).click();
  await expect(m.getByText("소중한 목소리를 남겨 주셔서 감사합니다.")).toBeVisible();
  await ctx.close();

  const results = await (await page.request.get(`/api/surveys/${id}/results`)).json();
  expect(results.summary.total).toBe(1);
  expect(results.summary.nps).toBe(100);
});

test("관리자 화면도 390px에서 가로 스크롤 없음", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("/admin");
  await p.getByLabel("관리자 비밀번호").fill(PASSWORD);
  await p.getByRole("button", { name: "입장하기" }).click();
  await expect(p.getByRole("heading", { name: /진행 중인 설문/ })).toBeVisible();
  await expectNoHorizontalScroll(p);
  await p.getByRole("link", { name: "모바일 응답" }).click();
  await expect(p.getByRole("heading", { name: "문항 편집기" })).toBeVisible();
  await expectNoHorizontalScroll(p);
  await p.goto("/admin/settings");
  await expect(p.getByRole("heading", { name: "구글시트 실시간 쌓기" })).toBeVisible();
  await expectNoHorizontalScroll(p);
  await ctx.close();
});

test("20명이 동시에 제출해도 20건 모두 저장", async ({ page, playwright }) => {
  await login(page);
  const id = await createOpenSurvey(page.request, "동시 제출 20명");
  const baseURL = test.info().project.use.baseURL!;
  // 서로 다른 20명의 응답자(쿠키 없는 별도 컨텍스트)
  const clients = await Promise.all(Array.from({ length: 20 }, () => playwright.request.newContext({ baseURL })));
  const started = Date.now();
  const results = await Promise.all(
    clients.map((c, i) =>
      c.post(`/api/public/surveys/${id}/responses`, {
        data: { answers: { q1: (i % 5) + 1, q2: "실습", q4: i % 11, q5: `동시 응답 ${i}` } },
      }),
    ),
  );
  const elapsed = Date.now() - started;
  expect(results.map((r) => r.status())).toEqual(Array(20).fill(201));
  expect(elapsed).toBeLessThan(60_000);
  await Promise.all(clients.map((c) => c.dispose()));

  const summary = (await (await page.request.get(`/api/surveys/${id}/results`)).json()).summary;
  expect(summary.total).toBe(20);
  const texts = summary.questions.find((q: { type: string }) => q.type === "text");
  expect(texts.answered).toBe(20);
  const csv = await (await page.request.get(`/api/surveys/${id}/csv`)).text();
  expect(csv.trim().split("\r\n")).toHaveLength(21);
});
