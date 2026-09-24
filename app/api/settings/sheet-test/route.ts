import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin";
import { ensureSheetSecret, readSettings } from "@/lib/settings";
import { postToSheet } from "@/lib/sheets";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const s = await readSettings();
  if (!s.sheetUrl) return jsonError("먼저 Apps Script 웹 앱 주소를 저장하세요.");
  const result = await postToSheet(s.sheetUrl, { action: "ping" }, s.sheetSecret ?? (await ensureSheetSecret()), { retries: 0 });
  return result.ok ? NextResponse.json({ ok: true }) : jsonError(result.error, 502);
}
