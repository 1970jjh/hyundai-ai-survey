import type { AnswerValue, Question, SurveyResponse } from "./schemas";

export function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function answerText(v: AnswerValue | undefined): string {
  if (v === undefined) return "";
  return Array.isArray(v) ? v.join(" | ") : String(v);
}

/** 엑셀 수식 주입 방지 + 따옴표 이스케이프 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(questions: Question[], responses: SurveyResponse[]): string {
  const header = ["응답ID", "제출시각", ...questions.map((q, i) => `Q${i + 1}. ${q.text}`)];
  const rows = responses.map((r) => [r.id, formatKst(r.submittedAt), ...questions.map((q) => answerText(r.answers[q.id]))]);
  // BOM: 엑셀에서 한글이 깨지지 않도록
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
