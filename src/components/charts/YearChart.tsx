"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import { AXIS, barPath, GRID, INK_2, Legend, type LegendItem, linear, MUTED, niceTicks, SURFACE, Tooltip, useChartWidth } from "./core";

export interface BarSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
}
export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
}
export interface RefLine {
  label: string;
  value: number;
  /** index range of the years the line applies to (inclusive); default all years */
  from?: number;
  to?: number;
  /** where the label sits, so two close lines never overlap; default right, above */
  labelAt?: "right-above" | "right-below" | "left-above" | "left-below";
}

interface Props {
  years: number[];
  bars?: BarSeries[];
  lines?: LineSeries[];
  refLines?: RefLine[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  height?: number;
  /** Fixed width in px instead of the container's. */
  width?: number;
  ariaLabel: string;
}

const M = { top: 10, right: 12, bottom: 24, left: 46 };
const GAP = 2;

/**
 * Chart over calendar years: stacked bars (positive stack up, negative stack down from one baseline),
 * lines and horizontal reference lines. One y-axis. Crosshair + tooltip on hover.
 */
export function YearChart({ years, bars = [], lines = [], refLines = [], format, axisFormat = format, yMin, yMax, height = 220, width: fixedWidth, ariaLabel }: Props) {
  const { ref, width } = useChartWidth(640, fixedWidth);
  const [hover, setHover] = useState<number | null>(null);
  const n = years.length;
  const plotW = Math.max(10, width - M.left - M.right);
  const plotH = height;
  const band = plotW / Math.max(1, n);
  const barW = Math.min(24, band * 0.62);

  // domain
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    for (const s of bars) {
      const v = s.values[i] ?? 0;
      if (v >= 0) pos += v;
      else neg += v;
    }
    hi = Math.max(hi, pos);
    lo = Math.min(lo, neg);
    for (const l of lines) {
      const v = l.values[i];
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        hi = Math.max(hi, v);
        lo = Math.min(lo, v);
      }
    }
  }
  for (const r of refLines) {
    hi = Math.max(hi, r.value);
    lo = Math.min(lo, r.value);
  }
  if (yMin !== undefined) lo = yMin;
  if (yMax !== undefined) hi = Math.max(hi, yMax);
  const ticks = niceTicks(lo, hi, 5);
  const d0 = ticks[0]!;
  const d1 = ticks[ticks.length - 1]!;
  const y = linear(d0, d1, M.top + plotH, M.top);
  const xCenter = (i: number) => M.left + band * i + band / 2;
  const labelEvery = n > 20 ? 5 : n > 10 ? 2 : 1;

  const legend: LegendItem[] = [
    ...bars.map((b) => ({ label: b.label, color: b.color, kind: "bar" as const })),
    ...lines.map((l) => ({ label: l.label, color: l.color, kind: "line" as const })),
  ];

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.floor((px - M.left) / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  return (
    <div className="flex flex-col gap-2">
      {legend.length > 1 && <Legend items={legend} />}
      <div ref={ref} className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${plotH + M.top + M.bottom}`}
          width="100%"
          role="img"
          aria-label={ariaLabel}
          className="block overflow-visible"
          style={{ fontSize: 11 }}
        >
          {/* grid + y labels */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fill={MUTED} className="tabular">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {/* x labels */}
          {years.map((yr, i) =>
            i % labelEvery === 0 || (i === n - 1 && i % labelEvery >= Math.ceil(labelEvery / 2)) ? (
              <text key={yr} x={xCenter(i)} y={M.top + plotH + 16} textAnchor="middle" fill={MUTED} className="tabular">
                {yr}
              </text>
            ) : null,
          )}
          {/* hover band */}
          {hover !== null && <rect x={M.left + band * hover} y={M.top} width={band} height={plotH} fill="var(--secondary)" opacity={0.7} />}
          {/* stacked bars */}
          {years.map((_, i) => {
            const x = xCenter(i) - barW / 2;
            const segs: ReactNode[] = [];
            for (const sign of [1, -1]) {
              const inStack = bars.map((s) => ({ s, v: s.values[i] ?? 0 })).filter((d) => (sign > 0 ? d.v > 0 : d.v < 0));
              let acc = 0;
              inStack.forEach((d, k) => {
                const from = acc;
                acc += d.v;
                let y0 = y(from);
                let y1 = y(acc);
                const last = k === inStack.length - 1;
                // 2px surface gap between touching segments
                if (k > 0) y0 += sign > 0 ? -GAP / 2 : GAP / 2;
                if (!last) y1 += sign > 0 ? GAP / 2 : -GAP / 2;
                if (Math.abs(y1 - y0) < 0.5) return;
                segs.push(<path key={`${d.s.id}-${sign}`} d={barPath(x, y0, y1, barW, last)} fill={d.s.color} />);
              });
            }
            return <g key={i}>{segs}</g>;
          })}
          {/* reference lines */}
          {refLines.map((r) => {
            const from = r.from ?? 0;
            const to = r.to ?? n - 1;
            const x1 = M.left + band * from + (from === 0 ? 0 : band / 2 - barW / 2);
            const x2 = M.left + band * to + band / 2 + (to === n - 1 ? band / 2 : barW / 2);
            const at = r.labelAt ?? "right-above";
            const right = at.startsWith("right");
            const above = at.endsWith("above");
            return (
              <g key={r.label}>
                <line x1={x1} x2={x2} y1={y(r.value)} y2={y(r.value)} stroke={INK_2} strokeWidth={1} opacity={0.75} />
                <text
                  x={right ? x2 - 2 : x1 + 2}
                  y={y(r.value) + (above ? -5 : 13)}
                  textAnchor={right ? "end" : "start"}
                  fill={INK_2}
                  stroke={SURFACE}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {r.label}
                </text>
              </g>
            );
          })}
          {/* lines */}
          {lines.map((l) => {
            let d = "";
            let started = false;
            l.values.forEach((v, i) => {
              if (v === null || v === undefined || !Number.isFinite(v)) {
                started = false;
                return;
              }
              d += `${started ? "L" : "M"}${xCenter(i)},${y(v)}`;
              started = true;
            });
            const lastIdx = l.values.reduce<number>((acc, v, i) => (v !== null && v !== undefined && Number.isFinite(v) ? i : acc), -1);
            return (
              <g key={l.id}>
                <path d={d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {lastIdx >= 0 && (
                  <circle cx={xCenter(lastIdx)} cy={y(l.values[lastIdx]!)} r={4} fill={l.color} stroke={SURFACE} strokeWidth={2} />
                )}
              </g>
            );
          })}
          {/* crosshair */}
          {hover !== null && (
            <line x1={xCenter(hover)} x2={xCenter(hover)} y1={M.top} y2={M.top + plotH} stroke={AXIS} strokeWidth={1} />
          )}
          <rect
            x={M.left}
            y={M.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <Tooltip
            title={String(years[hover])}
            x={xCenter(hover)}
            y={M.top}
            containerWidth={width}
            rows={[
              ...bars.map((b) => ({ label: b.label, value: format(b.values[hover] ?? 0), color: b.color })),
              ...lines.map((l) => ({ label: l.label, value: l.values[hover] === null ? "—" : format(l.values[hover] ?? 0), color: l.color })),
            ]}
          />
        )}
      </div>
    </div>
  );
}
