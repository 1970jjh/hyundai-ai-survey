"use client";

import type { AnswerValue, Question } from "@/lib/schemas";

interface Props {
  q: Question;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue | undefined) => void;
}

function Scale({ q, value, onChange, from, to, low, high }: Props & { from: number; to: number; low: string; high: string }) {
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return (
    <>
      <div className={`scale ${to === 10 ? "nps" : ""}`} role="radiogroup" aria-label={q.text}>
        {nums.map((n) => (
          <label key={n}>
            <input type="radio" name={q.id} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${n}점`} />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <div className="scale-label">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </>
  );
}

export default function QuestionInput(props: Props) {
  const { q, value, onChange } = props;
  switch (q.type) {
    case "scale":
      return <Scale {...props} from={1} to={5} low="전혀 그렇지 않다" high="매우 그렇다" />;
    case "nps":
      return <Scale {...props} from={0} to={10} low="추천하지 않음" high="적극 추천" />;
    case "single":
      return (
        <div className="choice-grid" role="radiogroup" aria-label={q.text}>
          {q.options.map((o) => (
            <label className="choice" key={o}>
              <input type="radio" name={q.id} checked={value === o} onChange={() => onChange(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
    case "multi": {
      const picked = Array.isArray(value) ? value : [];
      const toggle = (o: string) => {
        const next = picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o];
        onChange(next.length ? next : undefined);
      };
      return (
        <div className="choice-grid" role="group" aria-label={`${q.text} (복수 선택)`}>
          {q.options.map((o) => (
            <label className="choice" key={o}>
              <input type="checkbox" name={q.id} checked={picked.includes(o)} onChange={() => toggle(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
    }
    case "text":
      return (
        <textarea
          aria-label={q.text}
          maxLength={2000}
          placeholder="생각나는 대로 자유롭게 적어 주세요."
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
  }
}
