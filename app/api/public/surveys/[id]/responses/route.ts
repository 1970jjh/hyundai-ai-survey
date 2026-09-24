import { after, NextResponse } from "next/server";
import { jsonError } from "@/lib/admin";
import { validateAnswers } from "@/lib/schemas";
import { getSurvey, saveResponse } from "@/lib/surveys";
import { notifySheet, responseRecord } from "@/lib/sheets";

/** 응답자 제출(로그인 없음). 응답 1건 = 파일 1개 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
