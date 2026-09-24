import Link from "next/link";

export default function Home() {
  return (
    <main className="admin">
      <div className="masthead">
        <span className="brand">
          <span className="brandmark">s</span> 서베이랩
        </span>
        <span className="edition">HYUNDAI HRD · AI SURVEY LAB</span>
        <Link className="head-action" href="/admin">
          관리자 입장 ↗
        </Link>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">People &amp; learning / AI Survey Lab</span>
          <h1 className="serif">
            숫자 너머의 <i>목소리</i>를<br />
            다음 배움으로 잇다.
          </h1>
          <p>
            HR/HRD 담당자가 알고 싶은 것을 한 줄 쓰면 AI가 설문을 만들고, 링크·QR로 응답을 받고,
            <br />
            주관식까지 읽어 결과 보고서 초안을 써 줍니다.
          </p>
        </div>
        <aside className="hero-aside">
          <div className="aside-label">
            <span>HOW TO JOIN</span>
            <span>● OPEN</span>
          </div>
          <div>
            <strong>설문에 응답하러 오셨나요?</strong>
            <p className="muted" style={{ marginTop: 10 }}>
              담당자가 공유한 링크나 QR 코드로 들어오시면 로그인 없이 바로 응답할 수 있습니다.
            </p>
          </div>
          <div className="aside-footer">
            <span>JJ Creative 교육연구소</span>
            <b>2026 현대그룹 인재육성실무협의회</b>
          </div>
        </aside>
      </section>
    </main>
  );
}
