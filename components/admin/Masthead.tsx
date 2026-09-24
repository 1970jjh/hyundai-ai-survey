"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export interface NavLink {
  href: string;
  label: string;
  current?: boolean;
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brandmark">s</span> 서베이랩
    </span>
  );
}

export default function Masthead({ links, action }: { links: NavLink[]; action?: React.ReactNode }) {
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }
  return (
    <div className="masthead no-print">
      <Link href="/admin" aria-label="설문 목록으로">
        <Brand />
      </Link>
      <span className="edition">HYUNDAI HRD · AI SURVEY LAB</span>
      <nav className="mast-nav" aria-label="관리자 메뉴">
        {links.map((l) => (
          <a key={l.href} href={l.href} className={l.current ? "current" : undefined}>
            {l.label}
          </a>
        ))}
        <button type="button" onClick={logout} style={{ border: 0, background: "none", color: "inherit", font: "inherit", padding: 0 }}>
          로그아웃
        </button>
      </nav>
      {action}
    </div>
  );
}
