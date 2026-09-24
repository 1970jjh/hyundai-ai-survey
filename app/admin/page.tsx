import { isAdmin } from "@/lib/admin";
import { listSurveys } from "@/lib/surveys";
import { readSettings } from "@/lib/settings";
import LoginForm from "@/components/admin/LoginForm";
import Masthead from "@/components/admin/Masthead";
import CreatePanel from "@/components/admin/CreatePanel";
import SurveyTable from "@/components/admin/SurveyTable";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  if (!(await isAdmin())) return <LoginForm />;
  const [surveys, settings] = await Promise.all([listSurveys(), readSettings()]);
  const total = surveys.reduce((n, s) => n + s.responseCount, 0);
  const open = surveys.filter((s) => s.status === "open").length;

  return (
    <main className="admin">
      <Masthead
        links={[
          { href: "#list", label: "설문 목록", current: true },
          { href: "#make", label: "설문 만들기" },
          { href: "/admin/settings", label: "설정" },
        ]}
        action={
          <a className="head-action" href="#make">
            새 설문 작성 ↗
          </a>
        }
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">People &amp; learning / AI Survey Lab</span>
          <h1 className="serif">
            숫자 너머의 <i>목소리</i>를<br />
            다음 배움으로 잇다.
          </h1>
          <p>
            한 줄로 설문을 만들고, 링크·QR로 응답을 모으고, AI가 주관식까지 읽어 보고서 초안을 씁니다.
            <br />
            교육에 참여한 사람들의 생각을 모으고, 읽고, 다음을 설계합니다.
          </p>
        </div>
        <aside className="hero-aside">
          <div className="aside-label">
            <span>TODAY&apos;S EDITION</span>
            <span className="live">● {open > 0 ? "LIVE" : "READY"}</span>
          </div>
          <div>
            <div className="aside-number">
              {total}
              <span>건</span>
            </div>
            <strong>지금까지 도착한 의견</strong>
          </div>
          <div className="aside-footer">
            <span>전체 설문 {surveys.length}개</span>
            <b>공개 중 {open}개</b>
          </div>
        </aside>
      </section>

      <div className="section-heading" id="list">
        <h2 className="serif">
          <span className="rule-label">01</span> 진행 중인 설문
        </h2>
        <p>설문을 눌러 편집·공개·결과·보고서로 들어갑니다</p>
      </div>
      <SurveyTable surveys={surveys} />

      <div className="section-heading" id="make">
        <h2 className="serif">
          <span className="rule-label">02</span> 질문을 만드는 시간
        </h2>
        <p>한 문장에서 시작해, 응답하기 좋은 설문으로</p>
      </div>
      <div className="feature-grid">
        <CreatePanel hasKey={Boolean(settings.geminiKey)} />
        <section className="feature">
          <div className="feature-head">
            <div>
              <span className="eyebrow">How it works</span>
              <h3>교육 당일 흐름</h3>
              <p>설문 하나로 교육 전·중·후를 모두 챙길 수 있습니다.</p>
            </div>
            <span className="index">02</span>
          </div>
          <ol className="steps">
            <li>AI 초안이나 템플릿으로 설문을 만들고 문항을 다듬습니다.</li>
            <li>«공개»를 누르면 응답 링크와 QR 코드가 생깁니다.</li>
            <li>강의장 화면에 전체화면 QR을 띄웁니다. 휴대폰은 한 문항씩 응답합니다.</li>
            <li>결과 대시보드가 10초마다 새 응답을 반영합니다.</li>
            <li>주관식 AI 분석과 결과 보고서 초안을 만들고 A4로 인쇄합니다.</li>
          </ol>
          <div className="inline-row">
            <span>
              Gemini API 키 {settings.geminiKey ? <b className="connected">● 연결됨</b> : "○ 미등록"}
            </span>
            <a href="/admin/settings" className="secondary">
              설정 열기
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
