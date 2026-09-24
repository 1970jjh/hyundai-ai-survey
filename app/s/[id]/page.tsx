import type { Metadata } from "next";
import { getSurvey } from "@/lib/surveys";
import RespondForm from "@/components/respond/RespondForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const survey = await getSurvey((await params).id);
  return { title: survey && survey.status !== "draft" ? `${survey.title} — 설문` : "설문", robots: { index: false } };
}

function Shell({ title, children, intro }: { title: string; children: React.ReactNode; intro: React.ReactNode }) {
  return (
    <main className="respondent">
      <header className="respondent-head">
        <span className="brand">
          <span className="brandmark">s</span> 서베이랩
        </span>
        <small>{title} / YOUR VOICE</small>
      </header>
      <div className="respondent-body">
        <div className="respondent-intro">{intro}</div>
        {children}
      </div>
    </main>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="survey-form">
      <div className="thankyou" role="status">
        <span className="latin">Notice.</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

export default async function RespondPage({ params }: Props) {
  const survey = await getSurvey((await params).id);
  if (!survey || survey.status === "draft") {
    return (
      <Shell title="SURVEY" intro={<span className="eyebrow">A NOTE TO OUR LEARNERS</span>}>
        <Notice title="아직 공개되지 않았거나 없는 설문입니다." text="링크를 다시 확인하거나 담당자에게 문의해 주세요." />
      </Shell>
    );
  }
  const minutes = Math.max(1, Math.ceil(survey.questions.length * 0.3));
  const intro = (
    <>
      <span className="eyebrow">A NOTE TO OUR LEARNERS</span>
      <h1 className="serif">{survey.title}</h1>
      <p>{survey.description || "좋았던 장면과 더 필요한 순간을 함께 알려 주세요. 짧은 응답이 다음 교육을 바꿉니다."}</p>
      <div className="intro-note">
        <span><b>문항</b>{survey.questions.length}개</span>
        <span><b>방식</b>익명 · 로그인 없이 응답</span>
        <span><b>시간</b>약 {minutes}분{survey.onePerDevice ? " · 기기당 1회" : ""}</span>
      </div>
    </>
  );
  return (
    <Shell title={survey.title} intro={intro}>
      {survey.status === "closed" ? (
        <Notice title="마감된 설문입니다." text="응답 기간이 끝났습니다. 관심 가져 주셔서 감사합니다." />
      ) : (
        <RespondForm
          survey={{ id: survey.id, title: survey.title, description: survey.description, questions: survey.questions, onePerDevice: survey.onePerDevice }}
        />
      )}
    </Shell>
  );
}
