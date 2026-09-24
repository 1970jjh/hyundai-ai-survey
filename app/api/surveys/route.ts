import { after, NextResponse } from "next/server";
import { parseBody, requireAdmin } from "@/lib/admin";
import { surveyInputSchema } from "@/lib/schemas";
import { createSurvey, listSurveys } from "@/lib/surveys";
import { notifySheet, surveyRecord } from "@/lib/sheets";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ surveys: await listSurveys() });
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, surveyInputSchema);
  if ("error" in body) return body.error;
  const survey = await createSurvey(body.data);
  const origin = new URL(req.url).origin;
  after(() => notifySheet([surveyRecord(survey, origin, 0)]));
  return NextResponse.json({ survey }, { status: 201 });
}
