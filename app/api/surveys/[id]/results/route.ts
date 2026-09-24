import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin";
import { summarize } from "@/lib/aggregate";
import { getInsights, getSurvey, listResponses } from "@/lib/surveys";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
  const [responses, insights] = await Promise.all([listResponses(id), getInsights(id)]);
  return NextResponse.json(
    { summary: summarize(survey.questions, responses), insights, status: survey.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
