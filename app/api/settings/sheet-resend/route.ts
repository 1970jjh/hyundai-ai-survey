import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin";
import { readSettings } from "@/lib/settings";
import { listResponses, listSurveys } from "@/lib/surveys";
import { postToSheet, responseRecord, surveyRecord, type SheetRecord } from "@/lib/sheets";

export const maxDuration = 60;

/** 지금까지의 설문 목록 + 모든 응답을 시트로 다시 보낸다(설문 하나당 요청 1번) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const s = await readSettings();
  if (!s.sheetUrl) return jsonError("먼저 Apps Script 웹 앱 주소를 저장하세요.");
  const origin = new URL(req.url).origin;
  const surveys = await listSurveys();
  const batches: SheetRecord[][] = [surveys.map((sv) => surveyRecord(sv, origin, sv.responseCount))];
  for (const sv of surveys) {
    const responses = await listResponses(sv.id);
    for (let i = 0; i < responses.length; i += 200) {
      batches.push(responses.slice(i, i + 200).map((r) => responseRecord(sv, r)));
    }
  }
  let sent = 0;
  for (const records of batches.filter((b) => b.length)) {
    const result = await postToSheet(s.sheetUrl, { records }, 30_000);
    if (!result.ok) return jsonError(`${sent}건 보낸 뒤 실패: ${result.error}`, 502);
    sent += records.length;
  }
  return NextResponse.json({ ok: true, sent });
}
