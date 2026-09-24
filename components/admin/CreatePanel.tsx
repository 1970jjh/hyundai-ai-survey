"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText } from "@/lib/client";
import { TEMPLATES, type TemplateKey } from "@/lib/templates";
import type { Survey, SurveyInput } from "@/lib/schemas";

function newQid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function templateInput(key: TemplateKey, courseName: string): SurveyInput {
  const t = TEMPLATES.find((x) => x.key === key)!;
  return {
    title: courseName ? `${courseName} ${t.title}` : t.title,
    description: t.description,
    onePerDevice: true,
    questions: t.questions.map((q) => ({ id: newQid(), type: q.type, text: q.text, required: q.required, options: q.options ?? [] })),
  };
}

export default function CreatePanel({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  const [courseName, setCourseName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(label: string, task: () => Promise<{ survey: Survey }>) {
    setBusy(label);
    setError("");
    try {
      const { survey } = await task();
      router.push(`/admin/surveys/${survey.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  const aiPrompt = () => run("ai", () => api("/api/ai/generate", { body: { mode: "prompt", prompt } }));
  const aiTemplate = () =>
    run("refine", () => api("/api/ai/generate", { body: { mode: "template", template, courseName } }));
  const useTemplate = () =>
    run("template", () => api("/api/surveys", { body: templateInput(template!, courseName.trim()) }));
  const blank = () =>
    run("blank", () => api("/api/surveys", { body: { title: "새 설문", description: "", questions: [], onePerDevice: true } }));

  return (
    <section className="feature" aria-labelledby="create-title">
      <div className="feature-head">
        <div>
          <span className="ai-tag">✦ GEMINI WRITING PARTNER</span>
          <h3 id="create-title">AI 설문 초안</h3>
          <p>알고 싶은 것을 한 줄로 쓰면 문항을 만들어 드립니다. 만든 뒤 편집기에서 고칠 수 있습니다.</p>
        </div>
        <span className="index">01</span>
      </div>

      {template === null ? (
        <textarea
          className="prompt-input"
          rows={2}
          maxLength={500}
          aria-label="설문 요청 한 줄"
          placeholder="“신입사원 온보딩 교육 만족도, 10문항, 주관식 2개”"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      ) : (
        <label className="field">
          <span>과정명 (템플릿을 이 과정에 맞게 다듬습니다)</span>
          <input
            className="input"
            maxLength={120}
            placeholder="예: 2026 신입사원 온보딩 교육"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />
        </label>
      )}

      <div className="templates" role="group" aria-label="템플릿">
        <button type="button" className={template === null ? "active" : ""} onClick={() => setTemplate(null)}>
          한 줄 요청
        </button>
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" className={template === t.key ? "active" : ""} onClick={() => setTemplate(t.key)}>
            {t.label} 템플릿
          </button>
        ))}
      </div>

      <div className="buttons">
        {template === null ? (
          <button className="primary" type="button" onClick={aiPrompt} disabled={!hasKey || !!busy || prompt.trim().length < 2}>
            {busy === "ai" ? <><span className="spinner" />Gemini가 문항을 쓰는 중…</> : "✦ Gemini로 설문 생성 ↗"}
          </button>
        ) : (
          <>
            <button className="primary" type="button" onClick={aiTemplate} disabled={!hasKey || !!busy || !courseName.trim()}>
              {busy === "refine" ? <><span className="spinner" />과정에 맞게 다듬는 중…</> : "✦ AI로 과정에 맞게 다듬기"}
            </button>
            <button className="secondary" type="button" onClick={useTemplate} disabled={!!busy}>
              기본 문항 그대로 쓰기
            </button>
          </>
        )}
        <button className="secondary" type="button" onClick={blank} disabled={!!busy}>
          직접 작성
        </button>
      </div>

      {!hasKey && (
        <p className="notice info">
          AI 기능을 쓰려면 Gemini API 키가 필요합니다. 관리자에게 API 키 등록을 요청하세요(<a href="/admin/settings" style={{ textDecoration: "underline" }}>설정</a>).
          템플릿 «기본 문항 그대로 쓰기»와 «직접 작성»은 키 없이도 됩니다.
        </p>
      )}
      {error && <p className="notice" role="alert">{error}</p>}

      <div className="ai-result">
        <div>
          <strong>만들 수 있는 문항 유형</strong>
          <p>AI 초안·템플릿 모두 편집기에서 순서 변경·삭제·보기 수정이 됩니다.</p>
          <div className="types">
            <span>5점 척도</span>
            <span>객관식 단일·복수</span>
            <span>주관식</span>
            <span>NPS 0–10</span>
          </div>
        </div>
      </div>
    </section>
  );
}
