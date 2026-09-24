import { isAdmin } from "@/lib/admin";
import { readSettings } from "@/lib/settings";

/** 초기 비밀번호로 로그인 중이면 모든 관리자 화면 위에 변경을 권하는 띠를 띄운다(강제 변경은 하지 않음) */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const showWarning = (await isAdmin()) && !(await readSettings()).passwordHash;
  return (
    <>
      {showWarning && (
        <div className="pw-banner no-print" role="alert" data-testid="pw-banner">
          <span>
            ⚠ 초기 관리자 비밀번호를 쓰고 있습니다. 이 비밀번호는 안내문에 공개되어 있어 링크를 아는 누구나 관리자 화면에 들어올 수 있습니다.
          </span>
          <a href="/admin/settings#password">지금 비밀번호 바꾸기 →</a>
        </div>
      )}
      {children}
    </>
  );
}
