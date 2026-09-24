"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Survey } from "@/lib/schemas";
import type { Summary } from "@/lib/aggregate";
import type { Insights } from "@/lib/surveys";
import { api, errorText, formatDate } from "@/lib/client";
import Masthead from "./Masthead";
import QuestionEditor from "./QuestionEditor";
import SharePanel from "./SharePanel";
import AnalysisPanel from "./AnalysisPanel";
import ReportPanel from "./ReportPanel";
import { QuestionChart } from "./Charts";
import { useResults } from "./useResults";

interface Props {
  initialSurvey: Survey;
  initialSummary: Summary;
  initialInsights: Insights;
  hasKey: boolean;
}

function Heading({ n, title, sub, id }: { n: string; title: string; sub: string; id: string }) {
  return (
    <div className="section-heading" id={id}>
      <h2 className="serif">
        <span className="rule-label">{n}</span> {title}
      </h2>
      <p>{sub}</p>
    </div>
  );
}

function Overview({ summary }: { summary: Summary }) {
  const nps = summary.nps === null ? "–" : summary.nps > 0 ? `+${summary.nps}` : String(summary.nps);
  return (
    <section className="overview" data-testid="overview">
      <div className="metric">
        <small>참여한 사람</small>
        <strong data-testid="total">{summary.total}<em>명</em></strong>
        <span>오늘 새 응답 <b>+{summary.today}</b></span>
      </div>
      <div className="metric">
        <small>평균 만족도 (5점 척도 전체)</small>
        <strong>{summary.averageScale ?? "–"}<em>/ 5</em></strong>
        <span>5점 척도 문항 평균</span>
      </div>
      <div className="metric">
        <small>추천 의향 · NPS</small>
        <strong>{nps}</strong>
        <span>추천(9–10) − 비추천(0–6)</span>
      </div>
      <div className="metric">
        <small>마지막 응답</small>
        <strong style={{ fontSize: 24 }}>{summary.lastSubmittedAt ? formatDate(summary.lastSubmittedAt) : "–"}</strong>
        <span>10초마다 자동 갱신</span>
      </div>
    </section>
  );
}

export default function SurveyWorkspace({ initialSurvey, initialSummary, initialInsights, hasKey }: Props) {
  const router = useRouter();
  const [survey, setSurvey] = useState(initialSurvey);
  const [dirty, setDirty] = useState(false);
  const results = useResults(survey.id, { summary: initialSummary, insights: initialInsights });
  const { summary } = results;
  const textCount = summary.questions.filter((q) => q.type === "text").reduce((n, q) => n + q.answered, 0);

  async function remove() {
    if (!window.confirm(`«${survey.title}» 설문과 응답 ${summary.total}건을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/api/surveys/${survey.id}`, { method: "DELETE" });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      window.alert(errorText(err));
    }
  }

  return (
    <main className="admin">
      <Masthead
        links={[
          { href: "/admin", label: "← 설문 목록" },
          { href: "#overview", label: "개요", current: true },
          { href: "#make", label: "문항·공개" },
          { href: "#insights", label: "응답 읽기" },
          { href: "#report", label: "보고서" },
          { href: "/admin/settings", label: "설정" },
        ]}
      />
      <section className="hero no-print" id="overview">
        <div className="hero-copy">
          <span className="eyebrow">Survey / {survey.status === "open" ? "Live now" : survey.status === "closed" ? "Closed" : "Draft"}</span>
          <h1 className="serif" data-testid="survey-title">{survey.title}</h1>
          <p>{survey.description || "응답자에게 보일 안내문을 편집기에서 적어 주세요."}</p>
        </div>
        <aside className="hero-aside">
          <div className="aside-label">
            <span>TODAY&apos;S EDITION</span>
            <span className="live">{survey.status === "open" ? "● LIVE" : "○ " + (survey.status === "closed" ? "CLOSED" : "DRAFT")}</span>
          </div>
          <div>
            <div className="aside-number">{summary.total}<span>명</span></div>
            <strong>지금까지 도착한 의견</strong>
          </div>
          <div className="aside-footer">
            <span>{results.updatedAt ? `${results.updatedAt.toLocaleTimeString("ko-KR")} 갱신` : "10초마다 자동 갱신"}</span>
            <b>+{summary.today}명 오늘</b>
          </div>
        </aside>
      </section>

      <div className="no-print">
        <Heading n="01" id="summary" title="한눈에 보는 교육 경험" sub="실시간 자동 갱신 · 화면이 열려 있을 때만" />
        <Overview summary={summary} />
        {results.error && <p className="notice">{results.error}</p>}

        <Heading n="02" id="make" title="질문을 만드는 시간" sub="문항을 다듬고, 공개하고, QR로 나눕니다" />
        <div className="feature-grid">
          <QuestionEditor survey={survey} responseCount={summary.total} onSaved={setSurvey} onDirtyChange={setDirty} />
          <div>
            <SharePanel survey={survey} dirty={dirty} onChange={setSurvey} />
          </div>
        </div>

        <Heading n="03" id="insights" title="응답을 읽는 시간" sub="점수의 분포와 의견의 결을 함께 살펴봅니다" />
        <div className="results-grid">
          <section className="feature" aria-labelledby="dist-title">
            <div className="feature-head">
              <div>
                <h3 id="dist-title">문항별 응답 분포</h3>
                <p>응답 {summary.total}명 · 새 응답이 오면 자동으로 반영됩니다.</p>
              </div>
              <span className="index">03</span>
            </div>
            {summary.questions.length === 0 ? (
              <div className="empty">문항을 추가하고 공개하면 여기에 분포가 나타납니다.</div>
            ) : (
              summary.questions.map((q, i) => <QuestionChart key={q.id} stats={q} index={i} />)
            )}
          </section>
          <AnalysisPanel surveyId={survey.id} insights={results.insights} textCount={textCount} hasKey={hasKey} onDone={results.setInsights} />
        </div>
      </div>

      <Heading n="04" id="report" title="다음 교육을 위한 기록" sub="읽고 끝나지 않도록, 실행할 수 있는 제안까지" />
      <div className="report-grid">
        <ReportPanel surveyId={survey.id} insights={results.insights} total={summary.total} hasKey={hasKey} onDone={results.setInsights} />
        <section className="feature no-print">
          <div className="feature-head">
            <div>
              <span className="eyebrow">Survey settings</span>
              <h3>운영 메모</h3>
              <p>이 설문의 응답 정책과 데이터를 관리합니다.</p>
            </div>
            <span className="index">05</span>
          </div>
          <div className="settings-list">
            <div className="row"><span>응답 정책</span><strong>{survey.onePerDevice ? "기기당 1회 · 중복 방지" : "중복 응답 허용"}</strong></div>
            <div className="row"><span>문항 수</span><strong>{survey.questions.length}개</strong></div>
            <div className="row"><span>만든 시각</span><strong>{formatDate(survey.createdAt)}</strong></div>
            <div className="row"><span>AI 연결</span><strong className={hasKey ? "connected" : undefined}>{hasKey ? "● Gemini 연결됨" : "○ 키 미등록"}</strong></div>
          </div>
          <p className="muted" style={{ margin: "18px 0" }}>API 키가 없어도 설문 작성, 응답 수집, 기본 차트, CSV는 사용할 수 있습니다.</p>
          <div className="buttons">
            <a className="secondary" href={`/api/surveys/${survey.id}/csv`} download>원자료 CSV</a>
            <button className="danger" type="button" onClick={remove}>설문 삭제</button>
          </div>
        </section>
      </div>
    </main>
  );
}
