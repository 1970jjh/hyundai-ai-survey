"use client";

import { useState } from "react";
import { QUESTION_TYPES, TYPE_LABEL, type Question, type QuestionType, type Survey } from "@/lib/schemas";
import { api, errorText } from "@/lib/client";

type Draft = Pick<Survey, "title" | "description" | "questions">;

function newQuestion(type: QuestionType): Question {
  const options = type === "single" || type === "multi" ? ["보기 1", "보기 2"] : [];
  return { id: Math.random().toString(36).slice(2, 10), type, text: "", required: type !== "text", options };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface Props {
  survey: Survey;
  responseCount: number;
  onSaved: (s: Survey) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export default function QuestionEditor({ survey, responseCount, onSaved, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<Draft>({ title: survey.title, description: survey.description, questions: survey.questions });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function update(next: Draft) {
    setDraft(next);
    setDirty(true);
    onDirtyChange(true);
    setMessage(null);
  }
  const setQuestion = (i: number, patch: Partial<Question>) =>
    update({ ...draft, questions: draft.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const changeType = (i: number, type: QuestionType) => {
    const q = draft.questions[i];
    const needs = type === "single" || type === "multi";
    setQuestion(i, { type, options: needs ? (q.options.length >= 2 ? q.options : ["보기 1", "보기 2"]) : [] });
  };

  async function save() {
    setBusy(true);
    try {
      const body = {
        ...draft,
        questions: draft.questions.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) })),
      };
      const { survey: saved } = await api<{ survey: Survey }>(`/api/surveys/${survey.id}`, { method: "PATCH", body });
      onSaved(saved);
      setDirty(false);
      onDirtyChange(false);
      setMessage({ ok: true, text: "저장했습니다." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="feature" aria-labelledby="editor-title">
      <div className="feature-head">
        <div>
          <span className="ai-tag">✦ EDITOR</span>
          <h3 id="editor-title">문항 편집기</h3>
          <p>유형을 바꾸고, 순서를 옮기고, 필요 없는 문항은 지우세요. 저장해야 응답 화면에 반영됩니다.</p>
        </div>
        <span className="index">01</span>
      </div>
      {responseCount > 0 && (
        <p className="notice">이미 응답 {responseCount}건이 있습니다. 문항을 지우거나 보기를 바꾸면 기존 결과와 어긋날 수 있어요.</p>
      )}
      <label className="field">
        <span>설문 제목</span>
        <input className="input" maxLength={120} value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} />
      </label>
      <label className="field">
        <span>응답자에게 보이는 안내문</span>
        <textarea className="textarea" maxLength={500} value={draft.description} onChange={(e) => update({ ...draft, description: e.target.value })} />
      </label>

      <div className="q-list">
        {draft.questions.length === 0 && <div className="empty">아래 버튼으로 첫 문항을 추가하세요.</div>}
        {draft.questions.map((q, i) => (
          <div className="q-item" key={q.id} data-testid="q-item">
            <div className="q-item-head">
              <small>QUESTION {String(i + 1).padStart(2, "0")}</small>
              <div className="q-tools">
                <button type="button" aria-label={`${i + 1}번 위로`} onClick={() => update({ ...draft, questions: move(draft.questions, i, i - 1) })} disabled={i === 0}>↑</button>
                <button type="button" aria-label={`${i + 1}번 아래로`} onClick={() => update({ ...draft, questions: move(draft.questions, i, i + 1) })} disabled={i === draft.questions.length - 1}>↓</button>
                <button type="button" aria-label={`${i + 1}번 삭제`} onClick={() => update({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>삭제</button>
              </div>
            </div>
            <div className="q-row">
              <select className="select" aria-label={`${i + 1}번 유형`} value={q.type} onChange={(e) => changeType(i, e.target.value as QuestionType)}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
              <input className="input" aria-label={`${i + 1}번 문항`} placeholder="문항 내용" maxLength={300} value={q.text} onChange={(e) => setQuestion(i, { text: e.target.value })} />
            </div>
            {(q.type === "single" || q.type === "multi") && (
              <label className="field">
                <span>보기 (한 줄에 하나, 2~12개)</span>
                <textarea
                  className="textarea"
                  aria-label={`${i + 1}번 보기`}
                  value={q.options.join("\n")}
                  onChange={(e) => setQuestion(i, { options: e.target.value.split("\n").slice(0, 12) })}
                />
              </label>
            )}
            <label className="check" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(i, { required: e.target.checked })} /> 필수 응답
            </label>
          </div>
        ))}
      </div>

      <div className="add-row">
        <span>+ 문항 추가</span>
        {QUESTION_TYPES.map((t) => (
          <button key={t} type="button" className="secondary" onClick={() => update({ ...draft, questions: [...draft.questions, newQuestion(t)] })}>
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="sticky-save">
        <button className="primary" type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? "저장 중…" : dirty ? "변경 내용 저장" : "저장됨"}
        </button>
        {message && (
          <span className={message.ok ? "connected" : "notice"} role="status" style={{ margin: 0, fontSize: 12 }}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}
