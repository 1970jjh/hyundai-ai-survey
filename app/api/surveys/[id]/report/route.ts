import { NextResponse } from "next/server";
import { aiFailure, jsonError, requireAdmin } from "@/lib/admin";
import { writeReport, type Analysis } from "@/lib/ai";
import { collectTexts, summarize } from "@/lib/aggregate";
import { readSettings } from "@/lib/settings";
import { getInsights, getSurvey, listResponses, saveInsights } from "@/lib/surveys";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
  const responses = await listResponses(id);
  if (responses.length === 0) return jsonError("응답이 한 건 이상 있어야 보고서를 만들 수 있습니다.");
  const [s, insights] = await Promise.all([readSettings(), getInsights(id)]);
  try {
    const report = await writeReport(
      { apiKey: s.geminiKey, model: s.model },
      survey.title,
      summarize(survey.questions, responses),
      collectTexts(survey.questions, responses),
      insights.analysis?.data as Analysis | undefined,
    );
    const next = await saveInsights(id, { report: { data: report, createdAt: new Date().toISOString() } });
    return NextResponse.json({ insights: next });
  } catch (err) {
    return aiFailure(err);
  }
}
