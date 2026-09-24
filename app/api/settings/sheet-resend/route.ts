import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody, requireAdmin } from "@/lib/admin";
import { ensureSheetSecret, readSettings } from "@/lib/settings";
import { getSurvey, listResponses, listSurveys } from "@/lib/surveys";
import { postToSheet, recordStatus, responseRecord, surveyRecord, type SheetRecord } from "@/lib/sheets";

export const maxDuration = 60;

/** 한 번 요청에 보내는 응답 수. Apps Script 한 번 실행 시간이 넉넉히 남도록 */
const RESEND_CHUNK = 200;

const schema = z.union([
  z.object({ step: z.literal("surveys") }),
  z.object({ step: z.literal("responses"), surveyId: z.string().regex(/^[a-zA-Z0-9]{1,40}$/), offset: z.number().int().min(0) }),
]);

/**
 * 전체 다시 보내기를 잘게 나눠 진행한다(브라우저가 순서대로 호출).
 * 1) step=surveys: 설문 목록 탭을 보내고 설문 목록을 돌려준다.
 * 2) step=responses: 설문 하나의 응답을 offset 부터 RESEND_CHUNK 건 보내고 다음 offset 을 돌려준다(끝이면 null).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;
  const s = await readSettings();
  if (!s.sheetUrl) return jsonError("먼저 Apps Script 웹 앱 주소를 저장하세요.");
  const secret = s.sheetSecret ?? (await ensureSheetSecret());
  const send = async (records: SheetRecord[]) => {
    if (!records.length) return null;
    const result = await postToSheet(s.sheetUrl!, { records }, secret);
    await recordStatus(result);
    return result.ok ? null : jsonError(`시트 전송 실패: ${result.error}`, 502);
  };

  if (body.data.step === "surveys") {
    const origin = new URL(req.url).origin;
    const surveys = await listSurveys();
    const failed = await send(surveys.map((sv) => surveyRecord(sv, origin, sv.responseCount)));
    if (failed) return failed;
    return NextResponse.json({
      sent: surveys.length,
      surveys: surveys.map((sv) => ({ id: sv.id, title: sv.title, responseCount: sv.responseCount })),
    });
  }

  const { surveyId, offset } = body.data;
  const survey = await getSurvey(surveyId);
  if (!survey) return NextResponse.json({ sent: 0, nextOffset: null, total: 0 }); // 그 사이 삭제됨 → 건너뛴다
  const responses = await listResponses(surveyId);
  const chunk = responses.slice(offset, offset + RESEND_CHUNK);
  const failed = await send(chunk.map((r) => responseRecord(survey, r)));
  if (failed) return failed;
  const next = offset + chunk.length;
  return NextResponse.json({ sent: chunk.length, nextOffset: next < responses.length ? next : null, total: responses.length });
}
