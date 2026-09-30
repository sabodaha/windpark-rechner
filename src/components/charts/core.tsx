"use client";

import { useEffect, useRef, useState } from "react";

export const SURFACE = "var(--chart-surface)";
export const GRID = "var(--chart-grid)";
export const AXIS = "var(--chart-axis)";
export const INK_2 = "var(--chart-ink-2)";
export const MUTED = "var(--chart-muted)";
export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/**
 * Measures the container; renders at a default width on the server and before the first measurement. A fixed
 * width (the PDF report's slides) skips the measurement, so the static HTML is already final.
 */
export function useChartWidth(defaultWidth = 640, fixed?: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fixed ?? defaultWidth);
  useEffect(() => {
    const el = ref.current;
    if (fixed !== undefined || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(260, Math.round(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixed]);
  return { ref, width: fixed ?? width };
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return ticks;
}

export function linear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Vertical bar segment with a 4px rounded data-end and a square baseline end. */
export function barPath(x: number, yBase: number, yEnd: number, w: number, roundEnd: boolean, r = 4): string {
  const top = Math.min(yBase, yEnd);
  const bottom = Math.max(yBase, yEnd);
  const h = bottom - top;
  if (h <= 0 || w <= 0) return "";
  const rr = roundEnd ? Math.min(r, h, w / 2) : 0;
  const up = yEnd < yBase; // grows upwards → round the top
  if (rr === 0) return `M${x},${top}h${w}v${h}h${-w}Z`;
  if (up) {
    return `M${x},${bottom}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${bottom}Z`;
  }
  return `M${x},${top}H${x + w}V${bottom - rr}Q${x + w},${bottom} ${x + w - rr},${bottom}H${x + rr}Q${x},${bottom} ${x},${bottom - rr}Z`;
}

export interface LegendItem {
  label: string;
  color: string;
  kind: "bar" | "line" | "rule";
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.kind === "bar" ? (
            <span className="inline-block size-2.5 rounded-[2px]" style={{ background: it.color }} aria-hidden />
          ) : (
            <span
              className="inline-block h-0.5 w-3.5 rounded-full"
              style={{ background: it.color, opacity: it.kind === "rule" ? 0.9 : 1 }}
              aria-hidden
            />
          )}
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function Tooltip({ title, rows, x, y, containerWidth }: { title: string; rows: TooltipRow[]; x: number; y: number; containerWidth: number }) {
  const left = x > containerWidth / 2 ? x - 12 : x + 12;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-40 rounded-md border border-border bg-card px-2.5 py-2 text-xs shadow-md"
      style={{ left, top: y, transform: x > containerWidth / 2 ? "translateX(-100%)" : undefined }}
      role="status"
    >
      <div className="mb-1 font-medium text-muted-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: r.color }} aria-hidden />}
            {r.label}
          </span>
          <span className="tabular font-semibold text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
