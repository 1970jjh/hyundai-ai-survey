"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GEMINI_MODELS } from "@/lib/schemas";
import type { PublicSettings } from "@/lib/settings";
import type { SheetStatus } from "@/lib/sheets";
import { api, errorText } from "@/lib/client";
import Masthead from "./Masthead";
import SheetSettings from "./SheetSettings";

export interface SettingsPayload {
  settings: PublicSettings;
  sheetStatus: SheetStatus;
  storage: "blob" | "local";
}

type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  return msg ? <p className={`notice ${msg.ok ? "ok" : ""}`} role="status">{msg.text}</p> : null;
}

function GeminiCard({ data, onSaved }: { data: SettingsPayload; onSaved: (d: SettingsPayload) => void }) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(data.settings.model);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      onSaved(await api<SettingsPayload>("/api/settings", { method: "PATCH", body: { geminiKey: key, model } }));
      setKey("");
      setMsg({ ok: true, text: "저장했습니다." });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ elapsedMs: number; model: string }>("/api/settings/test-gemini", { method: "POST" });
      setMsg({ ok: true, text: `연결 성공 · ${r.model} · ${(r.elapsedMs / 1000).toFixed(1)}초` });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="feature">
      <div className="feature-head">
        <div>
          <span className="ai-tag">✦ GEMINI</span>
          <h3>Gemini API 키 · 모델</h3>
          <p>키는 서버(비공개 저장소)에만 저장되고 화면에는 끝 4자리만 보입니다. 발급: aistudio.google.com/apikey</p>
        </div>
        <span className="index">01</span>
      </div>
      <div className="settings-list">
        <div className="row">
          <span>현재 키</span>
          <strong data-testid="key-mask">
            {data.settings.hasGeminiKey ? <>{data.settings.geminiKeyMasked} <span className="connected">● 등록됨</span></> : "미등록"}
          </strong>
        </div>
      </div>
      <label className="field">
        <span>새 API 키 (바꿀 때만 입력)</span>
        <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIza…" />
      </label>
      <label className="field">
        <span>모델</span>
        <select className="select" value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
          {GEMINI_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
              {m === "gemini-3.7-flash" ? " (기본)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="buttons">
        <button className="primary" type="button" onClick={save} disabled={busy}>저장</button>
        <button className="secondary" type="button" onClick={test} disabled={busy || !data.settings.hasGeminiKey}>
          {busy ? "확인 중…" : "Gemini 연결 테스트 ↗"}
        </button>
      </div>
      <Note msg={msg} />
    </section>
  );
}

function PasswordCard() {
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.next !== form.confirm) return setMsg({ ok: false, text: "새 비밀번호 두 칸이 서로 다릅니다." });
    try {
      await api("/api/settings/password", { body: { current: form.current, next: form.next } });
      setForm({ current: "", next: "", confirm: "" });
      setMsg({ ok: true, text: "비밀번호를 바꿨습니다. 다른 기기의 로그인은 풀립니다." });
      router.refresh(); // 초기 비밀번호 경고 띠를 내린다
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }
  const field = (k: keyof typeof form, label: string, ac: string) => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="password" autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
    </label>
  );
  return (
    <form className="feature" onSubmit={submit} id="password">
      <div className="feature-head">
        <div>
          <span className="eyebrow">Admin password</span>
          <h3>관리자 비밀번호</h3>
          <p>처음 비밀번호는 20261105(또는 배포 때 넣은 ADMIN_PASSWORD)입니다. 공유 전에 꼭 바꾸세요(6자 이상).</p>
        </div>
        <span className="index">02</span>
      </div>
      {field("current", "현재 비밀번호", "current-password")}
      {field("next", "새 비밀번호", "new-password")}
      {field("confirm", "새 비밀번호 확인", "new-password")}
      <button className="primary" type="submit">비밀번호 변경</button>
      <Note msg={msg} />
    </form>
  );
}

function ResetCard({ storage }: { storage: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function reset() {
    try {
      const r = await api<{ loggedOut: boolean }>("/api/settings/reset", { body: { confirm, includeSettings } });
      setMsg({ ok: true, text: "초기화했습니다." });
      setConfirm("");
      if (r.loggedOut) router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }
  return (
    <section className="feature">
      <div className="feature-head">
        <div>
          <span className="eyebrow">Data</span>
          <h3>데이터 관리 · 전체 초기화</h3>
          <p>저장 위치: {storage === "blob" ? "Vercel Blob (비공개)" : "로컬 파일 .data/ (개발·테스트용)"}</p>
        </div>
        <span className="index">04</span>
      </div>
      <p className="muted">모든 설문·응답·AI 분석을 지웁니다. 되돌릴 수 없으니 필요하면 먼저 각 설문의 CSV를 받아 두세요.</p>
      <label className="check">
        <input type="checkbox" checked={includeSettings} onChange={(e) => setIncludeSettings(e.target.checked)} />
        API 키·비밀번호·구글시트 설정도 처음 상태로 (로그아웃됨)
      </label>
      <label className="field">
        <span>확인을 위해 «초기화»라고 입력하세요</span>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button className="danger" type="button" onClick={reset} disabled={confirm !== "초기화"}>전체 초기화</button>
      <Note msg={msg} />
    </section>
  );
}

export default function SettingsView({ initial, appsScriptCode }: { initial: SettingsPayload; appsScriptCode: string }) {
  const [data, setData] = useState(initial);
  return (
    <main className="admin">
      <Masthead
        links={[
          { href: "/admin", label: "← 설문 목록" },
          { href: "/admin/settings", label: "설정", current: true },
        ]}
      />
      <div className="section-heading">
        <h2 className="serif">
          <span className="rule-label">05</span> 운영 설정
        </h2>
        <p>AI 연결, 비밀번호, 구글시트, 데이터를 관리합니다</p>
      </div>
      <div className="settings-grid">
        <GeminiCard data={data} onSaved={setData} />
        <PasswordCard />
        <SheetSettings data={data} onSaved={setData} code={appsScriptCode} />
        <ResetCard storage={data.storage} />
      </div>
    </main>
  );
}
