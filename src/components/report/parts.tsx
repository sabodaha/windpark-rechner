// Building blocks of the report's 16:9 slides: the frame with title and footer, key-figure tiles, tables, status
// icons, a bridge chart and a timeline. Every size is fixed in px, so the static HTML and the PDF are identical.
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { AXIS, GRID, INK_2, linear, MUTED, niceTicks, SERIES, SURFACE } from "@/components/charts/core";
import { dateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { en } from "@/messages/en";
import { keep } from "./data";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;
/** Width of a slide's content area (1280 − 2 × 56 px). */
export const BODY_W = 1168;

export interface SlideMeta {
  n: number;
  total: number;
  dataAsOf: string;
}

/** One slide: short name as the heading (it becomes the PDF outline), the action title, the body and the footer. */
export function Slide({
  meta,
  kicker,
  title,
  sources,
  children,
}: {
  meta: SlideMeta;
  kicker: string;
  title: string;
  /** Source keys shown in the footer ("S3, S7"); empty for none. */
  sources: string;
  children: ReactNode;
}) {
  const id = `slide-${meta.n}`;
  return (
    <section className="report-slide" aria-labelledby={id}>
      <div className="flex h-full flex-col px-14 pt-10">
        <h2 id={id} className="text-[14px] font-semibold text-link">
          {kicker}
        </h2>
        <p className="mt-1 max-w-[1150px] text-[27px] font-semibold leading-[1.22] tracking-[-0.01em] text-balance text-foreground">{keep(title)}</p>
        <div className="mt-6 min-h-0 flex-1">{children}</div>
        <SlideFooter meta={meta} sources={sources} />
      </div>
    </section>
  );
}

export function SlideFooter({ meta, sources }: { meta: SlideMeta; sources: string }) {
  return (
    <footer className="mb-5 mt-3 flex items-end justify-between gap-6 whitespace-nowrap border-t border-border pt-2.5 text-[10.5px] leading-snug text-muted-foreground">
      <span>{en.header.disclaimer}</span>
      <span className="tabular">
        {sources && <>Sources: {sources} · </>}Data as of {dateLabel(meta.dataAsOf)} ·{" "}
        <span className="font-semibold text-foreground">
          {meta.n} / {meta.total}
        </span>
      </span>
    </footer>
  );
}

export function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "critical" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[12.5px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-[30px] font-semibold leading-tight tabular", tone === "critical" && "text-critical")}>{value}</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{note}</div>
    </div>
  );
}

export type Level = "ok" | "warning" | "error" | "info";

/** Decorative: the status is always written next to the icon, so screen readers and the PDF tags get it as text. */
export function StatusIcon({ level, className }: { level: Level; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  if (level === "ok") return <CircleCheck className={cn(cls, "text-good-text")} aria-hidden />;
  if (level === "warning") return <TriangleAlert className={cn(cls, "text-[#9a6700]")} aria-hidden />;
  if (level === "error") return <CircleAlert className={cn(cls, "text-critical")} aria-hidden />;
  return <Info className={cn(cls, "text-muted-foreground")} aria-hidden />;
}

export interface Row {
  cells: ReactNode[];
  bold?: boolean;
  muted?: boolean;
  /** A thin rule above the row (subtotals). */
  rule?: boolean;
}

/** A compact table; columns listed in `num` are right-aligned with tabular figures. */
export function Table({
  head,
  rows,
  num = [],
  widths,
  className,
  caption,
}: {
  head?: ReactNode[];
  rows: Row[];
  num?: number[];
  widths?: (string | undefined)[];
  className?: string;
  caption?: string;
}) {
  return (
    <table className={cn("w-full border-collapse text-[13px] leading-snug", className)}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {widths && (
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={w ? { width: w } : undefined} />
          ))}
        </colgroup>
      )}
      {head && (
        <thead>
          <tr className="border-b border-foreground/25 text-left text-[11.5px] text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} scope="col" className={cn("pb-1 pr-2 font-medium last:pr-0", num.includes(i) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={i}
            className={cn(
              "border-b border-border last:border-0",
              r.bold && "font-semibold",
              r.muted && "text-muted-foreground",
              r.rule && "border-t border-t-foreground/25",
            )}
          >
            {r.cells.map((c, j) =>
              j === 0 && !num.includes(0) ? (
                <th key={j} scope="row" className={cn("py-[3px] pr-2 text-left", r.bold ? "font-semibold" : "font-normal")}>
                  {typeof c === "string" ? keep(c) : c}
                </th>
              ) : (
                <td key={j} className={cn("py-[3px] pr-2 last:pr-0", num.includes(j) && "text-right tabular whitespace-nowrap")}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-4 py-3", className)}>
      {title && <p className="mb-1.5 text-[13px] font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function Bullets({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1.5 text-[13.5px] leading-snug", className)}>
      {items.map((it, i) => (
        <li key={i} className="relative pl-3.5 before:absolute before:left-0 before:top-[0.55em] before:size-1.5 before:rounded-full before:bg-foreground/45">
          {typeof it === "string" ? keep(it) : it}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------
// Bridge (waterfall) chart
// ---------------------------------------------------------------------------------------------

export interface BridgeStep {
  label: string;
  value: number;
  /** total: a bar from zero; delta: a step from the running total. */
  kind: "total" | "delta";
}

/**
 * Vertical bridge: totals from zero, changes as floating steps with thin connectors. Colour shows the role (total,
 * decrease, increase); the legend names it, and every bar carries its value.
 */
export function Bridge({
  steps,
  width,
  height,
  format,
  axisFormat = format,
  ariaLabel,
}: {
  steps: BridgeStep[];
  width: number;
  height: number;
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  ariaLabel: string;
}) {
  const M = { top: 22, right: 8, bottom: 54, left: 52 };
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  let run = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "total" ? 0 : run;
    const to = s.kind === "total" ? s.value : run + s.value;
    run = to;
    return { ...s, from, to };
  });
  const vals = bars.flatMap((b) => [b.from, b.to]);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), 5);
  const y = linear(ticks[0]!, ticks[ticks.length - 1]!, M.top + plotH, M.top);
  const band = plotW / bars.length;
  const bw = Math.min(64, band * 0.6);
  const color = (b: (typeof bars)[number]) => (b.kind === "total" ? SERIES[0]! : b.value < 0 ? SERIES[1]! : SERIES[2]!);
  const hasUp = bars.some((b) => b.kind === "delta" && b.value > 0);
  const hasDown = bars.some((b) => b.kind === "delta" && b.value < 0);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex gap-4 text-xs text-muted-foreground">
        {[
          { l: "Total", c: SERIES[0]!, show: true },
          { l: "Decrease", c: SERIES[1]!, show: hasDown },
          { l: "Increase", c: SERIES[2]!, show: hasUp },
        ]
          .filter((x) => x.show)
          .map((x) => (
            <li key={x.l} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-[2px]" style={{ background: x.c }} aria-hidden />
              {x.l}
            </li>
          ))}
      </ul>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={ariaLabel} style={{ fontSize: 11 }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} shapeRendering="crispEdges" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fill={MUTED} className="tabular">
              {axisFormat(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = M.left + band * i + band / 2;
          const top = Math.min(y(b.from), y(b.to));
          const h = Math.max(1, Math.abs(y(b.from) - y(b.to)));
          const next = bars[i + 1];
          const lines = wrap(b.label, Math.max(8, Math.floor((band - 6) / 6.1)));
          const up = b.to >= b.from;
          return (
            <g key={b.label}>
              <rect x={cx - bw / 2} y={top} width={bw} height={h} rx={3} fill={color(b)} />
              {next && next.kind === "delta" && (
                <line x1={cx + bw / 2} x2={cx + band - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke={INK_2} strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />
              )}
              <text
                x={cx}
                y={up || b.kind === "total" ? top - 5 : top + h + 12}
                textAnchor="middle"
                fill="var(--chart-ink)"
                stroke={SURFACE}
                strokeWidth={3}
                paintOrder="stroke"
                className="tabular"
                fontWeight={b.kind === "total" ? 600 : 400}
              >
                {b.kind === "delta" && b.value > 0 ? "+" : ""}
                {format(b.value)}
              </text>
              {lines.map((l, k) => (
                <text key={k} x={cx} y={M.top + plotH + 15 + k * 13} textAnchor="middle" fill={MUTED}>
                  {l}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Greedy word wrap to at most `max` characters a line (at 11 px, about 6 px a character). */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

// ---------------------------------------------------------------------------------------------
// Timeline (Gantt)
// ---------------------------------------------------------------------------------------------

export interface GanttRow {
  label: string;
  start: string;
  end: string;
  color: string;
  /** Lighter fill for windows and periods without payments. */
  light?: boolean;
  note?: string;
}

const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Bars over calendar years, the label and dates in a column on the left, a marker for the data date. */
export function Gantt({ rows, width, marker }: { rows: GanttRow[]; width: number; marker?: { label: string; date: string } }) {
  const labelW = 300;
  const rowH = 42;
  const M = { top: 22, bottom: 24 };
  const firstYear = Math.min(...rows.map((r) => Number(r.start.slice(0, 4))));
  const lastYear = Math.max(...rows.map((r) => Number(r.end.slice(0, 4)))) + 1;
  const x = linear(dayOf(`${firstYear}-01-01`), dayOf(`${lastYear}-01-01`), labelW, width - 18);
  const height = M.top + rows.length * rowH + M.bottom;
  const years: number[] = [];
  for (let yr = firstYear; yr <= lastYear; yr++) years.push(yr);
  const step = years.length > 20 ? 2 : 1;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Project timeline" style={{ fontSize: 11 }}>
      {years.map((yr) =>
        (yr - firstYear) % step === 0 ? (
          <g key={yr}>
            <line x1={x(dayOf(`${yr}-01-01`))} x2={x(dayOf(`${yr}-01-01`))} y1={M.top} y2={M.top + rows.length * rowH} stroke={GRID} shapeRendering="crispEdges" />
            <text x={x(dayOf(`${yr}-01-01`))} y={height - 8} textAnchor="middle" fill={MUTED} className="tabular">
              {yr}
            </text>
          </g>
        ) : null,
      )}
      {rows.map((r, i) => {
        const top = M.top + i * rowH;
        const x0 = x(dayOf(r.start));
        const x1 = x(dayOf(r.end));
        return (
          <g key={r.label}>
            <text x={0} y={top + 16} fill="var(--chart-ink)" fontSize={13.5} fontWeight={500}>
              {r.label}
            </text>
            <text x={0} y={top + 32} fill={MUTED} fontSize={11.5} className="tabular">
              {dateLabel(r.start)} – {dateLabel(r.end)}
              {r.note ? ` · ${r.note}` : ""}
            </text>
            <rect x={x0} y={top + 11} width={Math.max(2, x1 - x0)} height={18} rx={3} fill={r.color} opacity={r.light ? 0.35 : 1} />
          </g>
        );
      })}
      {marker && (
        <g>
          <line
            x1={x(dayOf(marker.date))}
            x2={x(dayOf(marker.date))}
            y1={M.top - 4}
            y2={M.top + rows.length * rowH}
            stroke={INK_2}
            strokeDasharray="3 3"
          />
          <text x={x(dayOf(marker.date)) + 4} y={M.top - 8} fill={INK_2} className="tabular">
            {marker.label}
          </text>
        </g>
      )}
    </svg>
  );
}
