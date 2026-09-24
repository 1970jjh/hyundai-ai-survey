import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login-wrap">
      <div className="login-card">
        <span className="eyebrow">404</span>
        <h1 className="serif">찾는 페이지가 없습니다.</h1>
        <p className="muted">주소를 다시 확인해 주세요.</p>
        <Link className="secondary" href="/admin">관리자 화면으로</Link>
      </div>
    </main>
  );
}
