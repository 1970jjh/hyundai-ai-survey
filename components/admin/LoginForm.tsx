"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client";
import { Brand } from "./Masthead";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { body: { password } });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <Brand />
        <h1 className="serif">관리자 입장</h1>
        <p className="muted">설문 만들기·결과 분석·설정은 관리자만 볼 수 있습니다.</p>
        <label className="field">
          <span>관리자 비밀번호</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <p className="notice" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !password} style={{ width: "100%", marginTop: 8 }}>
          {busy ? "확인 중…" : "입장하기 ↗"}
        </button>
      </form>
    </main>
  );
}
