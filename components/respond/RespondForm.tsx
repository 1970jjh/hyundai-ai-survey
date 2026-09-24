"use client";

import { useState, useSyncExternalStore } from "react";
import { TYPE_LABEL, type AnswerValue, type Question } from "@/lib/schemas";
import QuestionInput from "./QuestionInput";

export interface PublicSurvey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  onePerDevice: boolean;
}

const doneKey = (id: string) => `survey-lab:done:${id}`;
const noop = () => () => {};

function readDone(id: string): boolean {
  try {
    return window.localStorage.getItem(doneKey(id)) !== null;
  } catch {
    return false;
  }
}

function isAnswered(v: AnswerValue | undefined): boolean {
  if (v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function ThankYou({ again }: { again?: boolean }) {
  return (
    <div className="thankyou" role="status">
      <span className="latin">Thank you.</span>
      <h2>{again ? "이미 응답해 주셨습니다." : "소중한 목소리를 남겨 주셔서 감사합니다."}</h2>
      <p>{again ? "이 기기에서는 한 번만 응답할 수 있어요. 참여해 주셔서 고맙습니다." : "전해 주신 생각을 다음 교육에 담겠습니다."}</p>
    </div>
  );
}

export default function RespondForm({ survey }: { survey: PublicSurvey }) {
  const qs = survey.questions;
  const alreadyDone = useSyncExternalStore(noop, () => survey.onePerDevice && readDone(survey.id), () => false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [step, setStep] = useState(0);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  const answeredCount = qs.filter((q) => isAnswered(answers[q.id])).length;
  const last = step === qs.length - 1;

  function setAnswer(id: string, v: AnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });
    setMissing((m) => (m.has(id) ? new Set([...m].filter((x) => x !== id)) : m));
  }

  function missingOf(list: Question[]): string[] {
    return list.filter((q) => q.required && !isAnswered(answers[q.id])).map((q) => q.id);
  }

  function next() {
    const miss = missingOf([qs[step]]);
    if (miss.length) return setMissing(new Set(miss));
    if (last) return void submit();
    setStep(step + 1);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const miss = missingOf(qs);
    if (miss.length) {
      setMissing(new Set(miss));
      const idx = qs.findIndex((q) => q.id === miss[0]);
      setStep(idx);
      document.getElementById(`q-${miss[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setError(`필수 문항 ${miss.length}개에 답해 주세요.`);
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch(`/api/public/surveys/${survey.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "제출하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      try {
        if (survey.onePerDevice) window.localStorage.setItem(doneKey(survey.id), new Date().toISOString());
      } catch {
        // 저장이 막힌 브라우저(사생활 보호 모드 등)는 중복 방지 없이 진행
      }
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출하지 못했습니다.");
      setStatus("idle");
    }
  }

  if (alreadyDone && status !== "done") {
    return (
      <div className="survey-form">
        <ThankYou again />
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="survey-form">
        <ThankYou />
      </div>
    );
  }

  return (
    <form className="survey-form" onSubmit={submit} noValidate data-testid="survey-form">
      <div className="form-head">
        <b className="latin">Learning notes</b>
        <span>
          <span className="step-desktop">모든 질문 / {qs.length}개 · {answeredCount}개 응답</span>
          <span className="step-mobile" data-testid="step">{step + 1} / {qs.length}</span>
        </span>
      </div>
      <div className="progress" aria-hidden="true">
        <i className="bar-d" style={{ width: `${qs.length ? (answeredCount / qs.length) * 100 : 0}%` }} />
        <i className="bar-m" style={{ width: `${((step + 1) / qs.length) * 100}%` }} />
      </div>
      {qs.map((q, i) => (
        <div key={q.id} id={`q-${q.id}`} className={`question ${i === step ? "active" : ""} ${missing.has(q.id) ? "missing" : ""}`}>
          <small>
            QUESTION {String(i + 1).padStart(2, "0")} · {TYPE_LABEL[q.type]}
            {q.required ? <span className="req">필수</span> : null}
          </small>
          <h2>{q.text}</h2>
          <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
          {missing.has(q.id) && <p className="err" role="alert">이 문항은 필수입니다.</p>}
        </div>
      ))}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="form-foot">
        <span>응답은 익명으로 모입니다.</span>
        <button className="primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "보내는 중…" : "응답 보내기 ↗"}
        </button>
      </div>
      <div className="mobile-foot">
        <button className="secondary" type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          이전
        </button>
        <button className="primary" type="button" onClick={next} disabled={status === "sending"}>
          {last ? (status === "sending" ? "보내는 중…" : "응답 보내기 ↗") : "다음 질문 →"}
        </button>
      </div>
    </form>
  );
}
