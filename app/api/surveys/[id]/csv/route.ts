import { jsonError, requireAdmin } from "@/lib/admin";
import { toCsv } from "@/lib/csv";
import { getSurvey, listResponses } from "@/lib/surveys";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
  const csv = toCsv(survey.questions, await listResponses(id));
  const filename = encodeURIComponent(`${survey.title}_응답.csv`);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="survey-${id}.csv"; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
