import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/admin";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import { validateAnswers } from "@/lib/schemas";
import { getSurvey, saveResponse } from "@/lib/surveys";
import { notifySheet, responseRecord } from "@/lib/sheets";

// 강의장 20~수십 명이 같은 회사 IP(NAT)로 1분 안에 제출해도 통과하도록 넉넉하게. 자동 제출 폭주만 막는다
const submitLimit = createRateLimiter(200, 60_000);

/** 응답자 제출(로그인 없음). 응답 1건 = 파일 1개 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (submitLimit.hit(clientIp(req))) return jsonError("잠시 뒤에 다시 제출해 주세요. 짧은 시간에 요청이 너무 많습니다.", 429);
  const survey = await getSurvey((await params).id);
  if (!survey || survey.status === "draft") return jsonError("설문을 찾을 수 없습니다.", 404);
  if (survey.status === "closed") return jsonError("마감된 설문입니다. 응답해 주셔서 감사합니다.", 409);
  const raw = await req.json().catch(() => undefined);
  const result = validateAnswers(survey.questions, (raw as { answers?: unknown } | undefined)?.answers);
  if (!result.ok) return jsonError(result.error);
  const response = await saveResponse(survey.id, result.answers);
  after(() => notifySheet([responseRecord(survey, response)]));
  return NextResponse.json({ ok: true, id: response.id }, { status: 201 });
}
