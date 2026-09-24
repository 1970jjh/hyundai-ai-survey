"use client";

import { useState } from "react";
import type { Analysis } from "@/lib/ai";
import type { Insights } from "@/lib/surveys";
import { api, errorText, formatDate } from "@/lib/client";

const SENTIMENT = { positive: "긍정", negative: "개선 요청", mixed: "엇갈림" } as const;

interface Props {
  surveyId: string;
  insights: Insights;
  textCount: number;
  hasKey: boolean;
  onDone: (i: Insights) => void;
}

export default function AnalysisPanel({ surveyId, insights, textCount, hasKey, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = insights.analysis;
  const a = saved?.data as Analysis | undefined;

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ insights: Insights }>(`/api/surveys/${surveyId}/analyze`, { method: "POST" });
      onDone(res.insights);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const s = a?.sentiment;
  const sum = s ? s.positive + s.negative + s.neutral || 1 : 1;
  const pct = (n: number) => Math.round((n / sum) * 100);

  return (
    <section className="feature" aria-labelledby="analysis-title" data-testid="analysis-panel">
      <div className="feature-head">
        <div>
          <span className="ai-tag">✦ GEMINI INSIGHT</span>
          <h3 id="analysis-title">서술 응답 속 이야기</h3>
          <p>
            {a
              ? `주관식 ${saved!.analyzed}건을 ${a.themes.length}가지 주제로 묶었습니다. (${formatDate(saved!.createdAt)})`
              : `주관식 응답 ${textCount}건을 주제별로 묶고 긍정·부정을 나눕니다.`}
          </p>
        </div>
        <span className="index">04</span>
      </div>

      {saved && saved.analyzed < saved.total && (
        <p className="notice info" data-testid="truncated">
          응답이 많아 전체 {saved.total}건 중 {saved.analyzed}건만 AI에 보내 분석했습니다(토큰 한도). 긴 응답은 앞부분만 보냈습니다.
        </p>
      )}
      {saved && textCount > saved.total && <p className="muted">분석 이후 새 주관식 응답 {textCount - saved.total}건이 더 들어왔습니다.</p>}

      {a ? (
        <>
          <div className="quote-panel">
            <span className="ai-tag">REPRESENTATIVE VOICE</span>
            <blockquote>“{a.representativeQuote}”</blockquote>
            <small>{a.summary}</small>
          </div>
          <div className="themes">
            {a.themes.map((t) => (
              <span key={t.name}>
                {t.name} · {t.count}건
              </span>
            ))}
          </div>
          <div className="sentiment" aria-label={`긍정 ${pct(s!.positive)}%, 중립 ${pct(s!.neutral)}%, 개선 요청 ${pct(s!.negative)}%`}>
            <i style={{ width: `${pct(s!.positive)}%` }} />
            <i className="neutral" style={{ width: `${pct(s!.neutral)}%` }} />
          </div>
          <div className="sentiment-label">
            <span>긍정 {pct(s!.positive)}%</span>
            <span>중립 {pct(s!.neutral)}%</span>
            <span>개선 의견 {pct(s!.negative)}%</span>
          </div>
          <div style={{ marginTop: 16 }}>
            {a.themes.map((t) => (
              <div className="chart-card" key={t.name}>
                <small className="q">
                  {SENTIMENT[t.sentiment]} · {t.count}건
                </small>
                <h4>{t.name}</h4>
                <p className="muted" style={{ fontSize: 12 }}>{t.summary}</p>
                <ul className="text-samples">
                  {t.quotes.map((q, i) => (
                    <li key={i}>“{q}”</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <strong>아직 분석 전입니다.</strong>
          {textCount ? "버튼을 누르면 Gemini가 주관식 응답을 읽고 정리합니다." : "주관식 응답이 들어오면 분석할 수 있습니다."}
        </div>
      )}

      {error && <p className="notice" role="alert">{error}</p>}
      {!hasKey && <p className="notice info">AI 분석을 쓰려면 관리자에게 Gemini API 키 등록을 요청하세요(설정).</p>}
      <button className="secondary" type="button" onClick={run} disabled={busy || !hasKey || textCount === 0} style={{ marginTop: 15 }}>
        {busy ? <><span className="spinner" />Gemini가 읽는 중…</> : a ? "✦ Gemini로 다시 분석" : "✦ Gemini로 주관식 분석"}
      </button>
    </section>
  );
}
