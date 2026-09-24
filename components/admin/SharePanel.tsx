"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import type { Survey, SurveyStatus } from "@/lib/schemas";
import { api, errorText } from "@/lib/client";

function useQrSvg(url: string): string {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1d302b", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [url]);
  return svg;
}

function FullscreenQr({ svg, url, title, onClose }: { svg: string; url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="qr-full" role="dialog" aria-modal="true" aria-label="전체화면 QR">
      <button className="secondary close" type="button" onClick={onClose} autoFocus>
        닫기 (Esc)
      </button>
      <span className="eyebrow">휴대폰 카메라로 스캔하세요</span>
      <h2>{title}</h2>
      <div className="qr-big" data-testid="qr-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p>{url}</p>
    </div>
  );
}

const noop = () => () => {};

const NEXT_ACTION: Record<SurveyStatus, { to: SurveyStatus; label: string }> = {
  draft: { to: "open", label: "공개하기" },
  open: { to: "closed", label: "마감하기" },
  closed: { to: "open", label: "다시 열기" },
};

interface Props {
  survey: Survey;
  dirty: boolean;
  onChange: (s: Survey) => void;
}

export default function SharePanel({ survey, dirty, onChange }: Props) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const url = `${origin}/s/${survey.id}`;
  const svg = useQrSvg(url);
  const live = survey.status !== "draft";

  async function patch(body: Partial<Survey>) {
    setBusy(true);
    setMsg("");
    try {
      const res = await api<{ survey: Survey }>(`/api/surveys/${survey.id}`, { method: "PATCH", body });
      onChange(res.survey);
    } catch (err) {
      setMsg(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("링크를 복사했습니다.");
    } catch {
      setMsg(`복사가 막혀 있습니다. 직접 복사하세요: ${url}`);
    }
  }

  const action = NEXT_ACTION[survey.status];
  const statusText =
    survey.status === "open" ? "● 공개 중 · 응답을 받고 있어요" : survey.status === "closed" ? "○ 마감됨 · 응답 종료" : "○ 작성 중 · 아직 비공개";

  return (
    <section className="feature" aria-labelledby="share-title">
      <div className="feature-head">
        <div>
          <span className="eyebrow">Ready to share</span>
          <h3 id="share-title">링크와 QR로 공개</h3>
          <p>현장 화면에 띄우거나, 참여 링크를 전달하세요.</p>
        </div>
        <span className="index">02</span>
      </div>
      <div className="share-panel">
        <div style={{ minWidth: 0 }}>
          <strong>{survey.status === "open" ? "응답을 기다리고 있어요." : survey.status === "closed" ? "응답을 마감했어요." : "공개하면 링크가 열립니다."}</strong>
          <p data-testid="share-url">{url}</p>
          <div className="buttons">
            <button className="secondary" type="button" onClick={copy} disabled={!live}>링크 복사</button>
            <button className="secondary" type="button" onClick={() => setFull(true)} disabled={!live || !svg}>QR 전체화면 ↗</button>
            {live && <a className="secondary" href={url} target="_blank" rel="noreferrer">응답 화면 열기</a>}
          </div>
        </div>
        <div className="qr-box" aria-label="응답 링크 QR 코드" role="img" style={{ opacity: live ? 1 : 0.25 }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <p className="share-hint">* QR은 실제 스캔용 코드입니다. 공개 전에는 응답자가 들어와도 «아직 공개되지 않은 설문»으로 안내됩니다.</p>
      {msg && <p className="notice info" role="status">{msg}</p>}
      {dirty && <p className="notice">편집기에 저장하지 않은 변경이 있습니다. 공개 전에 먼저 저장하세요.</p>}
      <div className="inline-row">
        <span data-testid="status-text">{statusText}</span>
        <button className="primary" type="button" disabled={busy || (dirty && action.to === "open")} onClick={() => patch({ status: action.to })}>
          {busy ? "처리 중…" : action.label}
        </button>
      </div>
      <div className="inline-row">
        <label className="check">
          <input type="checkbox" checked={survey.onePerDevice} disabled={busy} onChange={(e) => patch({ onePerDevice: e.target.checked })} />
          기기당 1회만 응답 (브라우저에 기록)
        </label>
      </div>
      {full && <FullscreenQr svg={svg} url={url} title={survey.title} onClose={() => setFull(false)} />}
    </section>
  );
}
