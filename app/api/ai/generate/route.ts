import { after, NextResponse } from "next/server";
import { aiFailure, parseBody, requireAdmin } from "@/lib/admin";
import { generateSurvey, refineTemplate } from "@/lib/ai";
import { aiDeadline } from "@/lib/gemini";
import { generateRequestSchema } from "@/lib/schemas";
import { readSettings } from "@/lib/settings";
import { createSurvey } from "@/lib/surveys";
import { notifySheet, surveyRecord } from "@/lib/sheets";

export const maxDuration = 60;

/** AI로 설문 초안을 만들어 «작성 중» 설문으로 저장하고 id를 돌려준다 */
export async function POST(req: Request) {
  const deadline = aiDeadline();
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, generateRequestSchema);
  if ("error" in body) return body.error;
  const s = await readSettings();
  const cfg = { apiKey: s.geminiKey, model: s.model, deadline };
  try {
    const started = Date.now();
    const input =
      body.data.mode === "prompt"
        ? await generateSurvey(cfg, body.data.prompt)
        : await refineTemplate(cfg, body.data.template, body.data.courseName);
    const survey = await createSurvey(input);
    const origin = new URL(req.url).origin;
    after(() => notifySheet([surveyRecord(survey, origin, 0)]));
    return NextResponse.json({ survey, elapsedMs: Date.now() - started }, { status: 201 });
  } catch (err) {
    return aiFailure(err);
  }
}
