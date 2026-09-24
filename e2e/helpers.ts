import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PASSWORD = "20261105";

export async function login(page: Page, password = PASSWORD) {
  await page.goto("/admin");
  await page.getByLabel("관리자 비밀번호").fill(password);
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page.getByRole("heading", { name: /진행 중인 설문/ })).toBeVisible();
}

export interface QInput {
  id: string;
  type: "scale" | "single" | "multi" | "text" | "nps";
  text: string;
  required: boolean;
  options?: string[];
}

export const SAMPLE_QUESTIONS: QInput[] = [
  { id: "q1", type: "scale", text: "전반적인 만족도는?", required: true },
  { id: "q2", type: "single", text: "가장 좋았던 부분은?", required: true, options: ["이론", "실습", "토론"] },
  { id: "q3", type: "multi", text: "더 원하는 것은? (복수)", required: false, options: ["사례", "도구", "시간"] },
  { id: "q4", type: "nps", text: "동료에게 추천할 의향은?", required: true },
  { id: "q5", type: "text", text: "자유 의견", required: false },
];

/** 관리자 쿠키가 있는 request로 설문을 만들고 공개한다 */
export async function createOpenSurvey(request: APIRequestContext, title: string, opts: { onePerDevice?: boolean } = {}) {
  const res = await request.post("/api/surveys", {
    data: {
      title,
      description: "E2E 테스트 설문입니다.",
      onePerDevice: opts.onePerDevice ?? true,
      questions: SAMPLE_QUESTIONS.map((q) => ({ ...q, options: q.options ?? [] })),
    },
  });
  expect(res.status()).toBe(201);
  const { survey } = await res.json();
  const pub = await request.patch(`/api/surveys/${survey.id}`, { data: { status: "open" } });
  expect(pub.ok()).toBeTruthy();
  return survey.id as string;
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
