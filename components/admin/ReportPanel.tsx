"use client";

import { useState } from "react";
import type { Report } from "@/lib/ai";
import type { Insights } from "@/lib/surveys";
import { api, errorText, formatDate } from "@/lib/client";

export function reportToText(r: Report): string {
  const list = (items: string[]) => items.map((x) => `- ${x}`).join("\n");
  return [
    r.title,
    "",
    "1. 핵심 요약",
    r.summary,
    "",
    "2. 문항별 해석",
    r.questionInsights.map((q) => `- ${q.question}: ${q.interpretation}`).join("\n"),
    "",
    "3. 잘된 점",
    list(r.strengths),
    "",
    "4. 개선점",
    list(r.improvements),
    "",
    "5. 다음 교육 제안",
    list(r.nextSteps),
  ].join("\n");
}

interface Props {
  surveyId: string;
  insights: Insights;
  total: number;
  hasKey: boolean;
  onDone: (i: Insights) => void;
}

export default function ReportPanel({ surveyId, insights, total, hasKey, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const r = insights.report?.data as Report | undefined;

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ insights: Insights }>(`/api/surveys/${surveyId}/report`, { method: "POST" });
      onDone(res.insights);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(reportToText(r));
      setMsg({ ok: true, text: "보고서를 복사했습니다. 메일·문서에 붙여 넣으세요." });
    } catch {
      setMsg({ ok: false, text: "브라우저가 복사를 막았습니다. 본문을 직접 선택해 복사하세요." });
    }
  }

  return (
    <section className="report-paper print-area" aria-labelledby="report-title" data-testid="report-paper">
      <span className="kicker">AI REPORT / {r ? `DRAFT · ${formatDate(insights.report!.createdAt)}` : "NOT YET"}</span>
      <h3 id="report-title">{r ? r.title : "결과 보고서 초안"}</h3>
      {r ? (
        <>
          <h4>1. 핵심 요약</h4>
          <p>{r.summary}</p>
          <h4>2. 문항별 해석</h4>
          <ul>
            {r.questionInsights.map((q, i) => (
              <li key={i}>
                <b>{q.question}</b> — {q.interpretation}
              </li>
            ))}
          </ul>
          <h4>3. 잘된 점</h4>
          <ul>{r.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <h4>4. 개선점</h4>
          <ul>{r.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <h4>5. 다음 교육 제안</h4>
          <ul>{r.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      ) : (
        <p>응답이 모이면 Gemini가 집계와 주관식 의견을 읽고 요약부터 다음 교육 제안까지 초안을 씁니다. 주관식 분석을 먼저 해 두면 보고서가 더 구체적입니다.</p>
      )}
      <div className="report-chapters no-print">
        <span><b>1.</b> 핵심 요약</span>
        <span><b>2.</b> 문항별 해석</span>
        <span><b>3–4.</b> 잘된 점 / 개선점</span>
        <span><b>5.</b> 다음 교육 제안</span>
      </div>
      <div className="buttons no-print">
        <button className="primary" type="button" onClick={generate} disabled={busy || !hasKey || total === 0}>
          {busy ? <><span className="spinner" />보고서 쓰는 중…</> : r ? "✦ Gemini로 다시 쓰기" : "✦ Gemini 보고서 생성"}
        </button>
        <button className="secondary" type="button" onClick={copy} disabled={!r}>복사</button>
        <button className="secondary" type="button" onClick={() => window.print()} disabled={!r}>A4 PDF 인쇄</button>
        <a className="secondary" href={`/api/surveys/${surveyId}/csv`} download>원자료 CSV</a>
      </div>
      {total === 0 && <p className="muted no-print">응답이 한 건 이상 있어야 보고서를 만들 수 있습니다.</p>}
      {!hasKey && <p className="notice info no-print">AI 보고서를 쓰려면 관리자에게 Gemini API 키 등록을 요청하세요(설정).</p>}
      {msg && <p className={`notice no-print ${msg.ok ? "ok" : ""}`} role="status">{msg.text}</p>}
    </section>
  );
}
