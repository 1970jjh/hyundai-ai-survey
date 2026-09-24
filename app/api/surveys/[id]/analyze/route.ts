import { NextResponse } from "next/server";
import { aiFailure, jsonError, requireAdmin } from "@/lib/admin";
import { analyzeTexts } from "@/lib/ai";
import { collectTexts } from "@/lib/aggregate";
import { readSettings } from "@/lib/settings";
import { getSurvey, listResponses, saveAnalysis } from "@/lib/surveys";
import { aiDeadline } from "@/lib/gemini";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deadline = aiDeadline();
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
  const groups = collectTexts(survey.questions, await listResponses(id));
  if (!groups.some((g) => g.answers.length)) return jsonError("분석할 주관식 응답이 아직 없습니다.");
  const s = await readSettings();
  try {
    const result = await analyzeTexts({ apiKey: s.geminiKey, model: s.model, deadline }, survey.title, groups);
    const insights = await saveAnalysis(id, {
      data: result.data,
      analyzed: result.analyzed,
      total: result.total,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ insights });
  } catch (err) {
    return aiFailure(err);
  }
}
