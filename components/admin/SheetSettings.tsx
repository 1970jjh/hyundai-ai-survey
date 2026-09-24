"use client";

import { useState } from "react";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
import { api, errorText, formatDate } from "@/lib/client";
import type { SettingsPayload } from "./SettingsView";

type Msg = { ok: boolean; text: string } | null;

export default function SheetSettings({ data, onSaved }: { data: SettingsPayload; onSaved: (d: SettingsPayload) => void }) {
  const [url, setUrl] = useState(data.settings.sheetUrl);
  const [enabled, setEnabled] = useState(data.settings.sheetEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const st = data.sheetStatus;

  async function act(task: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await task() });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }
  const save = () =>
    act(async () => {
      onSaved(await api<SettingsPayload>("/api/settings", { method: "PATCH", body: { sheetUrl: url, sheetEnabled: enabled && !!url } }));
      return enabled && url ? "저장했습니다. 이제 새 설문·응답이 시트로 전송됩니다." : "저장했습니다(시트 전송 꺼짐).";
    });
  const test = () => act(async () => (await api("/api/settings/sheet-test", { method: "POST" }), "시트 연결 성공! Apps Script가 응답했습니다."));
  const resend = () =>
    act(async () => `${(await api<{ sent: number }>("/api/settings/sheet-resend", { method: "POST" })).sent}건을 시트로 보냈습니다.`);
  const copy = () =>
    act(async () => {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE);
      return "Apps Script 코드를 복사했습니다.";
    });

  return (
    <section className="feature">
      <div className="feature-head">
        <div>
          <span className="eyebrow">Google Sheets · 선택</span>
          <h3>구글시트 실시간 쌓기</h3>
          <p>응답이 들어올 때마다 구글시트에 한 줄씩 쌓입니다. 구글 클라우드 콘솔·로그인 설정은 필요 없습니다.</p>
        </div>
        <span className="index">03</span>
      </div>
      <ol className="steps">
        <li>구글시트를 새로 만듭니다.</li>
        <li>시트 메뉴 «확장 프로그램 › Apps Script»를 열고, 아래 코드를 통째로 붙여 넣고 저장합니다.</li>
        <li>«배포 › 새 배포 › 웹 앱», 실행: 나 / 액세스: 모든 사용자 → 배포 → 권한 허용.</li>
        <li>나오는 웹 앱 주소(…/exec)를 아래 칸에 붙여 넣고, 켜고, 저장합니다.</li>
      </ol>
      <pre className="code-box" aria-label="Apps Script 코드">{APPS_SCRIPT_CODE}</pre>
      <button className="secondary" type="button" onClick={copy} disabled={busy}>코드 복사</button>
      <label className="field">
        <span>Apps Script 웹 앱 주소</span>
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://script.google.com/macros/s/…/exec" />
      </label>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 시트로 실시간 전송 켜기
      </label>
      <div className="buttons" style={{ marginTop: 12 }}>
        <button className="primary" type="button" onClick={save} disabled={busy}>저장</button>
        <button className="secondary" type="button" onClick={test} disabled={busy || !data.settings.sheetUrl}>연결 테스트</button>
        <button className="secondary" type="button" onClick={resend} disabled={busy || !data.settings.sheetUrl}>지금까지 데이터 전부 보내기</button>
      </div>
      {msg && <p className={`notice ${msg.ok ? "ok" : ""}`} role="status">{msg.text}</p>}
      <div className="settings-list" style={{ marginTop: 10 }}>
        <div className="row"><span>상태</span><strong className={data.settings.sheetEnabled ? "connected" : undefined}>{data.settings.sheetEnabled ? "● 전송 켜짐" : "○ 꺼짐"}</strong></div>
        <div className="row"><span>마지막 성공</span><strong>{st.lastSuccessAt ? formatDate(st.lastSuccessAt) : "–"}</strong></div>
        <div className="row"><span>마지막 오류</span><strong>{st.lastError ? `${st.lastErrorAt ? formatDate(st.lastErrorAt) : ""} · ${st.lastError}` : "–"}</strong></div>
      </div>
      <p className="muted">시트 전송이 실패해도 응답은 앱 저장소에 안전하게 남습니다. 탭 이름: 설문별 «제목 앞부분_ID», 설문 목록은 «surveys» 탭.</p>
    </section>
  );
}
