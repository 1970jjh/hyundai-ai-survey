"use client";

import { useState } from "react";
import { api, errorText, formatDate } from "@/lib/client";
import type { SettingsPayload } from "./SettingsView";

type Msg = { ok: boolean; text: string } | null;
interface ResendSurvey {
  id: string;
  title: string;
  responseCount: number;
}
/** 다시 보내기 진행 위치(실패하면 여기서 이어서) */
interface ResendPos {
  surveys: ResendSurvey[];
  index: number;
  offset: number;
  sent: number;
}

interface Props {
  data: SettingsPayload;
  onSaved: (d: SettingsPayload) => void;
  /** 이 앱 전용 비밀값이 들어 있는 Apps Script 코드 */
  code: string;
}

/** 설문 목록 → 설문 하나씩(응답 200건 단위) 순서대로 보낸다. 실패하면 위치를 돌려준다 */
async function runResend(start: ResendPos | null, onProgress: (text: string) => void): Promise<{ done: true; sent: number } | { done: false; pos: ResendPos; error: string }> {
  let pos = start;
  try {
    if (!pos) {
      onProgress("설문 목록 보내는 중…");
      const r = await api<{ sent: number; surveys: ResendSurvey[] }>("/api/settings/sheet-resend", { body: { step: "surveys" } });
      pos = { surveys: r.surveys, index: 0, offset: 0, sent: r.sent };
    }
    while (pos.index < pos.surveys.length) {
      const sv: ResendSurvey = pos.surveys[pos.index];
      onProgress(`설문 ${pos.index + 1}/${pos.surveys.length} «${sv.title}» 응답 보내는 중… (지금까지 ${pos.sent}건)`);
      const r: { sent: number; nextOffset: number | null } = await api("/api/settings/sheet-resend", {
        body: { step: "responses", surveyId: sv.id, offset: pos.offset },
      });
      pos = r.nextOffset === null
        ? { ...pos, index: pos.index + 1, offset: 0, sent: pos.sent + r.sent }
        : { ...pos, offset: r.nextOffset, sent: pos.sent + r.sent };
    }
    return { done: true, sent: pos.sent };
  } catch (err) {
    const fallback: ResendPos = pos ?? { surveys: [], index: 0, offset: 0, sent: 0 };
    return { done: false, pos: fallback, error: errorText(err) };
  }
}

export default function SheetSettings({ data, onSaved, code }: Props) {
  const [url, setUrl] = useState(data.settings.sheetUrl);
  const [enabled, setEnabled] = useState(data.settings.sheetEnabled);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [resume, setResume] = useState<ResendPos | null>(null);
  const [progress, setProgress] = useState("");
  const st = data.sheetStatus;

  async function refreshStatus() {
    onSaved(await api<SettingsPayload>("/api/settings").catch(() => data));
  }

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
  async function resend(from: ResendPos | null) {
    setBusy(true);
    setMsg(null);
    const result = await runResend(from, setProgress);
    setProgress("");
    if (result.done) {
      setResume(null);
      setMsg({ ok: true, text: `설문 목록과 응답 ${result.sent}건을 시트로 보냈습니다.` });
    } else {
      // 설문 목록도 못 보냈으면 처음부터, 아니면 실패한 설문·위치부터 이어서
      setResume(result.pos.surveys.length ? result.pos : null);
      setMsg({ ok: false, text: `${result.pos.sent}건까지 보낸 뒤 멈췄습니다: ${result.error}` });
    }
    await refreshStatus();
    setBusy(false);
  }
  const copy = () =>
    act(async () => {
      await navigator.clipboard.writeText(code);
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
      <p className="muted">이 코드에는 이 앱 전용 비밀값이 들어 있어, 다른 사람이 시트 주소를 알아도 데이터를 바꿀 수 없습니다. 코드를 다른 곳에 공유하지 마세요.</p>
      <pre className="code-box" aria-label="Apps Script 코드">{code}</pre>
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
        <button className="secondary" type="button" onClick={() => resend(null)} disabled={busy || !data.settings.sheetUrl}>지금까지 데이터 전부 보내기</button>
        {resume && (
          <button className="secondary" type="button" onClick={() => resend(resume)} disabled={busy}>
            이어서 보내기 (설문 {resume.index + 1}/{resume.surveys.length}부터)
          </button>
        )}
      </div>
      {progress && <p className="notice info" role="status" data-testid="resend-progress">{progress}</p>}
      {msg && <p className={`notice ${msg.ok ? "ok" : ""}`} role="status">{msg.text}</p>}
      <div className="settings-list" style={{ marginTop: 10 }}>
        <div className="row"><span>상태</span><strong className={data.settings.sheetEnabled ? "connected" : undefined}>{data.settings.sheetEnabled ? "● 전송 켜짐" : "○ 꺼짐"}</strong></div>
        <div className="row"><span>마지막 성공</span><strong>{st.lastSuccessAt ? formatDate(st.lastSuccessAt) : "–"}</strong></div>
        <div className="row"><span>마지막 오류</span><strong>{st.lastError ? `${st.lastErrorAt ? formatDate(st.lastErrorAt) : ""} · ${st.lastError}` : "–"}</strong></div>
      </div>
      <p className="muted">시트 전송이 실패해도 응답은 앱 저장소에 안전하게 남습니다. 탭 이름: 설문별 «제목 앞부분_ID»(제목을 바꾸면 같은 탭 이름이 따라 바뀜), 설문 목록은 «surveys» 탭.</p>
    </section>
  );
}
