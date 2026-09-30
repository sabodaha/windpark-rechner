"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import { AXIS, GRID, Legend, linear, MUTED, niceTicks, SERIES, Tooltip, useChartWidth } from "./core";

export interface TornadoRow {
  label: string;
  lowLabel: string;
  highLabel: string;
  low: number | null;
  high: number | null;
}

interface Props {
  rows: TornadoRow[];
  base: number;
  format: (v: number) => string;
  lowName: string;
  highName: string;
  ariaLabel: string;
  /** Fixed width in px instead of the container's. */
  width?: number;
}

const ROW = 30;
const BAR = 12;

/**
 * Horizontal bars from the base value: one bar for the low setting of each driver, one for the high
 * setting. Colour marks the side of the input (low / high), not whether the result is better or worse.
 */
export function TornadoChart({ rows, base, format, lowName, highName, ariaLabel, width: fixedWidth }: Props) {
  const { ref, width } = useChartWidth(640, fixedWidth);
  const [hover, setHover] = useState<number | null>(null);
  // About 6 px a character at 11 px; at most 40 % of the width, long labels are shortened.
  const longest = Math.max(0, ...rows.map((r) => r.label.length));
  const labelW = Math.min(width * 0.4, Math.max(110, longest * 6 + 16));
  const fit = Math.floor((labelW - 16) / 6);
  const short = (s: string) => (s.length > fit ? `${s.slice(0, Math.max(1, fit - 1)).trimEnd()}…` : s);
  const M = { top: 8, right: 56, bottom: 22, left: labelW };
  const plotW = Math.max(40, width - M.left - M.right);
  const height = rows.length * ROW;
  const values = rows.flatMap((r) => [r.low, r.high]).filter((v): v is number => v !== null && Number.isFinite(v));
  const ticks = niceTicks(Math.min(base, ...values), Math.max(base, ...values), 4);
  const x = linear(ticks[0]!, ticks[ticks.length - 1]!, M.left, M.left + plotW);

  return (
    <figure className="flex flex-col gap-2">
      <Legend
        items={[
          { label: lowName, color: SERIES[0]!, kind: "bar" },
          { label: highName, color: SERIES[1]!, kind: "bar" },
        ]}
      />
      <div ref={ref} className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height + M.top + M.bottom}`} width="100%" role="img" aria-label={ariaLabel} style={{ fontSize: 11 }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + height} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={x(t)} y={M.top + height + 15} textAnchor="middle" fill={MUTED} className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = M.top + i * ROW + ROW / 2;
            const seg = (v: number | null, color: string, dy: number) => {
              if (v === null || !Number.isFinite(v)) return null;
              const x0 = x(base);
              const x1 = x(v);
              const left = Math.min(x0, x1);
              const w = Math.max(1, Math.abs(x1 - x0));
              return <rect x={left} y={cy + dy} width={w} height={BAR / 2 + 1} rx={2} fill={color} />;
            };
            const lo = r.low;
            const hi = r.high;
            const tipValue = (v: number | null) => (v === null ? null : v);
            const extremes = [tipValue(lo), tipValue(hi)].filter((v): v is number => v !== null);
            const maxV = extremes.length ? Math.max(...extremes) : base;
            const minV = extremes.length ? Math.min(...extremes) : base;
            return (
              <g key={r.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                {hover === i && <rect x={0} y={cy - ROW / 2} width={width} height={ROW} fill="var(--secondary)" opacity={0.7} />}
                <text x={M.left - 8} y={cy} dy="0.32em" textAnchor="end" fill="var(--chart-ink)">
                  <title>{r.label}</title>
                  {short(r.label)}
                </text>
                {seg(lo, SERIES[0]!, -BAR / 2 - 1)}
                {seg(hi, SERIES[1]!, 1)}
                <text x={x(maxV) + 4} y={cy} dy="0.32em" fill={MUTED} className="tabular">
                  {format(maxV)}
                </text>
                {minV < base && (
                  <text x={x(minV) - 4} y={cy} dy="0.32em" textAnchor="end" fill={MUTED} className="tabular">
                    {format(minV)}
                  </text>
                )}
                <rect x={0} y={cy - ROW / 2} width={width} height={ROW} fill="transparent" />
              </g>
            );
          })}
          <line x1={x(base)} x2={x(base)} y1={M.top - 4} y2={M.top + height} stroke={AXIS} strokeWidth={1.5} />
        </svg>
        {hover !== null && rows[hover] && (
          <Tooltip
            title={rows[hover].label}
            x={M.left + plotW / 2}
            y={M.top + hover * ROW + ROW}
            containerWidth={width}
            rows={[
              { label: `${lowName}: ${rows[hover].lowLabel}`, value: rows[hover].low === null ? "—" : format(rows[hover].low!), color: SERIES[0] },
              { label: `${highName}: ${rows[hover].highLabel}`, value: rows[hover].high === null ? "—" : format(rows[hover].high!), color: SERIES[1] },
            ]}
          />
        )}
      </div>
    </figure>
  );
}
