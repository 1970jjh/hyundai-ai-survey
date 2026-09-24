import Link from "next/link";
import type { SurveySummary } from "@/lib/surveys";
import { TYPE_LABEL } from "@/lib/schemas";

export const STATUS_TEXT = { draft: "○ 작성 중", open: "● 공개 중", closed: "■ 마감" } as const;

function kdate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "numeric", day: "numeric" });
}

export default function SurveyTable({ surveys }: { surveys: SurveySummary[] }) {
  if (surveys.length === 0) {
    return (
      <div className="empty">
        <strong>아직 만든 설문이 없습니다.</strong>
        아래 «질문을 만드는 시간»에서 한 줄 요청이나 템플릿으로 첫 설문을 만들어 보세요.
      </div>
    );
  }
  return (
    <table className="survey-table">
      <thead>
        <tr>
          <th>설문</th>
          <th>상태</th>
          <th>응답</th>
          <th className="hide-sm">문항</th>
          <th className="hide-sm">만든 날</th>
        </tr>
      </thead>
      <tbody>
        {surveys.map((s) => (
          <tr key={s.id}>
            <td className="title">
              <Link href={`/admin/surveys/${s.id}`}>{s.title}</Link>
              <div className="muted">
                {[...new Set(s.questions.map((q) => TYPE_LABEL[q.type]))].join(" · ") || "문항 없음"}
              </div>
            </td>
            <td>
              <span className={`status ${s.status}`}>{STATUS_TEXT[s.status]}</span>
            </td>
            <td className="num">
              {s.responseCount}
              <span className="muted"> 건</span>
            </td>
            <td className="hide-sm">{s.questions.length}개</td>
            <td className="hide-sm">{kdate(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
