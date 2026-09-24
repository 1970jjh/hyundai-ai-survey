import type { Bucket, QuestionStats } from "@/lib/aggregate";
import { TYPE_LABEL } from "@/lib/schemas";

const W = 420;
const H = 170;
const COLOR = { base: "#bacbb6", top: "#234238", det: "#dfb7a0", pas: "#cfd3c4", pro: "#537563" };

/** 위쪽만 둥근 막대(시안 C의 막대 모양) */
function topRounded(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(w / 2, h, 22);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

function npsColor(label: string): string {
  const n = Number(label);
  return n >= 9 ? COLOR.pro : n >= 7 ? COLOR.pas : COLOR.det;
}

export function VerticalBars({ buckets, nps = false, unit = "점" }: { buckets: Bucket[]; nps?: boolean; unit?: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const topCount = Math.max(...buckets.map((b) => b.count));
  const slot = W / buckets.length;
  const bw = Math.min(46, slot * 0.62);
  const chartH = H - 30;
  return (
    <svg className="bars-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={buckets.map((b) => `${b.label}${unit} ${b.count}명`).join(", ")}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1="0" x2={W} y1={chartH - chartH * t * 0.9} y2={chartH - chartH * t * 0.9} stroke="#e5e8dd" />
      ))}
      <line x1="0" x2={W} y1={chartH} y2={chartH} stroke="#bac3b5" />
      {buckets.map((b, i) => {
        const h = (b.count / max) * chartH * 0.9;
        const x = i * slot + (slot - bw) / 2;
        const fill = nps ? npsColor(b.label) : b.count === topCount && b.count > 0 ? COLOR.top : COLOR.base;
        return (
          <g key={b.label}>
            <path d={topRounded(x, chartH - h, bw, h)} fill={fill} />
            {b.count > 0 && (
              <text x={x + bw / 2} y={chartH - h - 6} textAnchor="middle" fontSize="14" fill="#5c695d">
                {b.count}
              </text>
            )}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="14" fill="#898e83">
              {b.label}
              {nps ? "" : unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function HorizontalBars({ buckets, answered }: { buckets: Bucket[]; answered: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="hbars">
      {buckets.map((b) => {
        const pct = answered ? Math.round((b.count / answered) * 100) : 0;
        return (
          <div key={b.label} className="hbar">
            <div className="hbar-label">
              <span>{b.label}</span>
              <b>
                {b.count}명 · {pct}%
              </b>
            </div>
            <div className="hbar-track">
              <i style={{ width: `${(b.count / max) * 100}%`, background: b.count === max && b.count > 0 ? COLOR.top : COLOR.base }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function QuestionChart({ stats, index }: { stats: QuestionStats; index: number }) {
  return (
    <div className="chart-card" data-testid="chart-card">
      <small className="q">
        Q{String(index + 1).padStart(2, "0")} · {TYPE_LABEL[stats.type]} · 응답 {stats.answered}명
      </small>
      <h4>{stats.text}</h4>
      {stats.type === "scale" && (
        <>
          <VerticalBars buckets={stats.buckets} />
          <div className="chart-under">
            <span>5점 척도</span>
            <span>
              평균 <strong>{stats.average ?? "–"}</strong> / 5
            </span>
          </div>
        </>
      )}
      {stats.type === "nps" && (
        <>
          <VerticalBars buckets={stats.buckets} nps />
          <div className="nps-legend">
            <span><i style={{ background: COLOR.det }} />비추천 0–6 · {stats.detractors}명</span>
            <span><i style={{ background: COLOR.pas }} />중립 7–8 · {stats.passives}명</span>
            <span><i style={{ background: COLOR.pro }} />추천 9–10 · {stats.promoters}명</span>
          </div>
          <div className="chart-under">
            <span>평균 {stats.average ?? "–"}점</span>
            <span>
              NPS <strong>{stats.nps === null ? "–" : stats.nps > 0 ? `+${stats.nps}` : stats.nps}</strong>
            </span>
          </div>
        </>
      )}
      {(stats.type === "single" || stats.type === "multi") && <HorizontalBars buckets={stats.buckets} answered={stats.answered} />}
      {stats.type === "text" &&
        (stats.samples.length ? (
          <ul className="text-samples">
            {stats.samples.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">아직 주관식 응답이 없습니다.</p>
        ))}
    </div>
  );
}
