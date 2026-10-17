"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "./ui";

// Latimea containerului (grafice responsive)
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Valori "rotunde" pentru axa Y
function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return ticks;
}

const shortNum = (v) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${+(v / 1000).toFixed(a >= 10000 ? 0 : 1)}K`;
  return String(Math.round(v));
};

function Tooltip({ x, y, width, children }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-md"
      style={{ left, top: y - 10 }}
    >
      {children}
    </div>
  );
}

/**
 * Grafic arie (o singura serie): data [{ label, value, sub? }]
 */
export function AreaChart({ data, height = 220, format = (v) => v, color = "var(--series-1)", tickEvery, ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / top) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join("");
  const area = data.length ? `${line}L${x(data.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z` : "";
  const every = tickEvery || Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 70))));

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const last = data.length - 1;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fg-3 text-[11px]">
                {shortNum(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            (i % every === 0 && last - i >= every * 0.7) || i === last ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-fg-3 text-[11px]">
                {d.label}
              </text>
            ) : null
          )}
          <path d={area} fill={color} opacity="0.1" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" strokeWidth="1" />
          )}
          {data.length > 0 && (
            <circle
              cx={x(hover ?? last)}
              cy={y(data[hover ?? last].value)}
              r="4.5"
              fill={color}
              stroke="var(--surface)"
              strokeWidth="2"
            />
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={x(hover)} y={y(data[hover].value)} width={width}>
          <div className="font-medium text-fg">{data[hover].tooltipLabel || data[hover].label}</div>
          <div className="tnum text-fg-2">{format(data[hover].value)}</div>
          {data[hover].sub && <div className="text-fg-3">{data[hover].sub}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Coloane verticale (o serie): data [{ label, value, sub? }]
 */
export function ColumnChart({ data, height = 220, format = (v) => v, color = "var(--series-1)", ariaLabel }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const iw = Math.max(1, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(4, band - 6));
  const y = (v) => pad.t + ih - (Math.max(0, v) / top) * ih;
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 64))));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fg-3 text-[11px]">
                {shortNum(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx0 = pad.l + band * i + band / 2;
            const h = pad.t + ih - y(d.value);
            const r = Math.min(4, h / 2, bw / 2);
            const x0 = cx0 - bw / 2;
            const y0 = y(d.value);
            const path =
              h > 0
                ? `M${x0},${pad.t + ih}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${pad.t + ih}Z`
                : "";
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
                {((i % every === 0 && data.length - 1 - i >= every * 0.7) || i === data.length - 1) && (
                  <text x={cx0} y={height - 6} textAnchor="middle" className="fill-fg-3 text-[11px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={pad.l + band * hover + band / 2} y={y(data[hover].value)} width={width}>
          <div className="font-medium text-fg">{data[hover].tooltipLabel || data[hover].label}</div>
          <div className="tnum text-fg-2">{format(data[hover].value)}</div>
          {data[hover].sub && <div className="text-fg-3">{data[hover].sub}</div>}
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Lista cu bare orizontale (clasamente, ponderi): items [{ key, label, value, sub? }]
 */
export function BarList({ items, format = (v) => v, color = "var(--series-1)", empty = "Fără date în perioada aleasă", max: forcedMax, className }) {
  const max = forcedMax || Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  if (!items.length) return <p className="py-6 text-center text-[13px] text-fg-3">{empty}</p>;
  return (
    <ul className={cx("space-y-3", className)}>
      {items.map((it, i) => (
        <li key={it.key ?? i} className="group" title={`${it.label}: ${format(it.value)} (${((it.value / total) * 100).toFixed(1)}%)`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-fg-2">{it.label}</span>
            <span className="tnum shrink-0 font-medium text-fg">
              {format(it.value)}
              {it.sub && <span className="ml-1.5 font-normal text-fg-3">{it.sub}</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-2">
            <div
              className="h-2 rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Linie mica pentru indicatori
export function Sparkline({ values, width = 96, height = 28, color = "var(--series-1)" }) {
  const path = useMemo(() => {
    if (!values?.length) return "";
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    return values
      .map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`)
      .join("");
  }, [values, width, height]);
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
