import { NextResponse } from "next/server";
import { aiFailure, requireAdmin } from "@/lib/admin";
import { pingGemini } from "@/lib/gemini";
import { readSettings } from "@/lib/settings";

export const maxDuration = 60;

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const s = await readSettings();
  try {
    const elapsedMs = await pingGemini(s.geminiKey, s.model);
    return NextResponse.json({ ok: true, elapsedMs, model: s.model });
  } catch (err) {
    return aiFailure(err);
  }
}
