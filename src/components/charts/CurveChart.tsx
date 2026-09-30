"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import { AXIS, GRID, INK_2, linear, MUTED, niceTicks, SERIES, SURFACE, Tooltip, useChartWidth } from "./core";

interface Props {
  points: { x: number; y: number | null }[];
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  hLines?: { label: string; y: number }[];
  vLines?: { label: string; x: number }[];
  marker?: { x: number; y: number } | null;
  seriesLabel: string;
  ariaLabel: string;
  height?: number;
  /** Fixed width in px instead of the container's. */
  width?: number;
}

const M = { top: 14, right: 24, bottom: 26, left: 46 };

/** One series over a numeric x-axis (award price), with reference lines and a crosshair. */
export function CurveChart({ points, xFormat, yFormat, hLines = [], vLines = [], marker, seriesLabel, ariaLabel, height = 220, width: fixedWidth }: Props) {
  const { ref, width } = useChartWidth(640, fixedWidth);
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(40, width - M.left - M.right);
  const xs = points.map((p) => p.x);
  const ys = [...points.map((p) => p.y).filter((v): v is number => v !== null), ...hLines.map((h) => h.y)];
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), 6);
  const yt = niceTicks(Math.min(0, ...ys), Math.max(...ys), 5);
  const x = linear(xt[0]!, xt[xt.length - 1]!, M.left, M.left + plotW);
  const y = linear(yt[0]!, yt[yt.length - 1]!, M.top + height, M.top);

  let d = "";
  let started = false;
  points.forEach((p) => {
    if (p.y === null) {
      started = false;
      return;
    }
    d += `${started ? "L" : "M"}${x(p.x)},${y(p.y)}`;
    started = true;
  });

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.x) - px) < Math.abs(x(points[best]!.x) - px)) best = i;
    });
    setHover(best);
  };

  const hp = hover !== null ? points[hover] : undefined;
  return (
    <div ref={ref} className="relative w-full">
      <svg viewBox={`0 0 ${width} ${height + M.top + M.bottom}`} width="100%" role="img" aria-label={ariaLabel} style={{ fontSize: 11 }}>
        {yt.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fill={MUTED} className="tabular">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xt.map((t) => (
          <text key={t} x={x(t)} y={M.top + height + 17} textAnchor="middle" fill={MUTED} className="tabular">
            {xFormat(t)}
          </text>
        ))}
        {hLines.map((h) => (
          <g key={h.label}>
            <line x1={M.left} x2={M.left + plotW} y1={y(h.y)} y2={y(h.y)} stroke={INK_2} strokeWidth={1} opacity={0.75} />
            <text x={M.left + 4} y={y(h.y) - 4} fill={INK_2}>
              {h.label}
            </text>
          </g>
        ))}
        {vLines.map((v, i) => (
          <g key={v.label}>
            <line x1={x(v.x)} x2={x(v.x)} y1={M.top} y2={M.top + height} stroke={INK_2} strokeWidth={1} opacity={0.6} />
            <text x={x(v.x) + 4} y={M.top + 10 + i * 13} fill={INK_2}>
              {v.label}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {marker && <circle cx={x(marker.x)} cy={y(marker.y)} r={5} fill={SERIES[0]} stroke={SURFACE} strokeWidth={2} />}
        {hp && hp.y !== null && (
          <>
            <line x1={x(hp.x)} x2={x(hp.x)} y1={M.top} y2={M.top + height} stroke={AXIS} strokeWidth={1} />
            <circle cx={x(hp.x)} cy={y(hp.y)} r={4} fill={SERIES[0]} stroke={SURFACE} strokeWidth={2} />
          </>
        )}
        <rect x={M.left} y={M.top} width={plotW} height={height} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hp && (
        <Tooltip
          title={xFormat(hp.x)}
          x={x(hp.x)}
          y={M.top}
          containerWidth={width}
          rows={[{ label: seriesLabel, value: hp.y === null ? "—" : yFormat(hp.y), color: SERIES[0] }]}
        />
      )}
    </div>
  );
}
