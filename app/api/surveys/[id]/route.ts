import { after, NextResponse } from "next/server";
import { jsonError, parseBody, requireAdmin } from "@/lib/admin";
import { surveyPatchSchema } from "@/lib/schemas";
import { deleteSurvey, getSurvey, listResponses, updateSurvey } from "@/lib/surveys";
import { notifySheet, surveyDeleteRecord, surveyRecord } from "@/lib/sheets";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const survey = await getSurvey((await params).id);
  return survey ? NextResponse.json({ survey }) : jsonError("설문을 찾을 수 없습니다.", 404);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, surveyPatchSchema);
  if ("error" in body) return body.error;
  const { id } = await params;
  if (body.data.status === "open") {
    const current = await getSurvey(id);
    const questions = body.data.questions ?? current?.questions ?? [];
    if (questions.length === 0) return jsonError("문항이 하나 이상 있어야 공개할 수 있습니다.");
  }
  const survey = await updateSurvey(id, body.data);
  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
  const origin = new URL(req.url).origin;
  after(async () => notifySheet([surveyRecord(survey, origin, (await listResponses(id)).length)]));
  return NextResponse.json({ survey });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  if (!(await getSurvey(id))) return jsonError("설문을 찾을 수 없습니다.", 404);
  await deleteSurvey(id);
  after(() => notifySheet([surveyDeleteRecord(id)]));
  return NextResponse.json({ ok: true });
}
