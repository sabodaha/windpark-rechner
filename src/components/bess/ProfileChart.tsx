"use client";

import { useState, type PointerEvent } from "react";
import { AXIS, GRID, Legend, linear, MUTED, niceTicks, SURFACE, Tooltip, useChartWidth } from "@/components/charts/core";

export interface ProfileSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
}

const M = { top: 10, right: 12, bottom: 24, left: 46 };

/** Several series over the hours of a day (0–23): average price profiles. */
export function ProfileChart({
  series,
  format,
  hourLabel,
  ariaLabel,
  height = 220,
}: {
  series: ProfileSeries[];
  format: (v: number) => string;
  hourLabel: string;
  ariaLabel: string;
  height?: number;
}) {
  const { ref, width } = useChartWidth(640);
  const [hover, setHover] = useState<number | null>(null);
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const plotW = Math.max(10, width - M.left - M.right);
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all), 5);
  const y = linear(ticks[0]!, ticks[ticks.length - 1]!, M.top + height, M.top);
  const x = linear(0, Math.max(1, n - 1), M.left, M.left + plotW);
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - M.left) / plotW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color, kind: "line" as const }))} />}
      <div ref={ref} className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height + M.top + M.bottom}`} width="100%" role="img" aria-label={ariaLabel} className="block overflow-visible" style={{ fontSize: 11 }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fill={MUTED} className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {Array.from({ length: n }, (_, i) =>
            i % 3 === 0 ? (
              <text key={i} x={x(i)} y={M.top + height + 16} textAnchor="middle" fill={MUTED} className="tabular">
                {String(i).padStart(2, "0")}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <path
              key={s.id}
              d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + height} stroke={AXIS} strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.id} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={3.5} fill={s.color} stroke={SURFACE} strokeWidth={1.5} />
              ))}
            </>
          )}
          <rect x={M.left} y={M.top} width={plotW} height={height} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <Tooltip
            title={`${hourLabel} ${String(hover).padStart(2, "0")}:00`}
            x={x(hover)}
            y={M.top}
            containerWidth={width}
            rows={series.map((s) => ({ label: s.label, value: format(s.values[hover] ?? 0), color: s.color }))}
          />
        )}
      </div>
    </div>
  );
}
