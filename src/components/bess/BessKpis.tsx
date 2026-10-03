"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { Metric } from "@/bess/engine";
import type { BessKpiKey, BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormat } from "@/components/site/LocaleProvider";
import type { Format } from "@/lib/format";
import { cn } from "@/lib/utils";
import { blockedStatus, reasonText } from "./contractText";

/** A metric as text: its value when valid, else the word for its status and why. */
export function metricText(m: Metric | undefined, show: (v: number) => string, t: BessMessages, f: Format): { text: string; hint?: string; flagged: boolean } {
  if (!m || (m.status === "valid" && m.value === null)) return { text: f.na, flagged: false };
  if (m.status === "valid") return { text: show(m.value!), flagged: false };
  const roots = m.status === "ambiguous" && m.roots?.length ? ` (${m.roots.map((r) => f.pct(r, 1)).join("; ")})` : "";
  return { text: t.kpis.status[m.status], hint: `${t.kpis.statusHint[m.status]}${roots}`, flagged: true };
}

export const lcosText = (v: number | null, f: Format) => (v === null ? f.na : `€${f.num(v, 0)}/MWh`);

interface Props {
  core: BessCore;
  t: BessMessages;
  pending: boolean;
  onChecks: () => void;
}

export function BessKpis({ core, t, pending, onChecks }: Props) {
  const f = useFormat();
  const { result, inputs, noDebt } = core;
  const k = result.kpis;
  // a contract case without a result shows no numbers, only why (spec v1.1 §14)
  const blocked = blockedStatus(core);
  const bridge = result.contract?.bridge2029PerMW;
  const irr = metricText(k.investorIrr, (v) => f.pct(v, 1), t, f);
  const plainIrr = noDebt ? metricText(noDebt.investorIrr, (v) => f.pct(v, 1), t, f).text : null;
  const npv = k.investorNpv?.value ?? null;
  const lender = k.lenderMinDscr?.value ?? null;
  const payback = k.paybackYears?.value ?? null;
  const tiles: { key: BessKpiKey; value: string; sub: string; critical?: boolean; extra?: string }[] = [
    {
      key: "investorIrr",
      value: irr.text,
      sub: plainIrr !== null ? `${t.kpis.withoutDebt}: ${plainIrr}` : "",
      critical: irr.flagged,
      extra: irr.hint,
    },
    { key: "investorNpv", value: f.meur(npv, 1), sub: `@ ${f.pct(inputs.equityHurdle, 0)}`, critical: !result.returnsMeaningful },
    {
      key: "minDscr",
      value: f.ratio(k.minDscr?.value ?? null),
      sub: lender !== null ? `${t.kpis.lenderCase}: ${f.ratio(lender)}` : "",
      critical: (k.minDscr?.value ?? Infinity) < 1.05,
    },
    bridge
      ? { key: "netRevenueContract", value: f.eurCompact(bridge.net), sub: `${t.kpis.perMw} · ${t.kpis.contractShort}` }
      : { key: "netRevenue", value: f.eurCompact(k.netRevenue2029PerMW?.value ?? null), sub: t.kpis.perMw },
    { key: "lcos", value: lcosText(k.lcos?.value ?? null, f), sub: "" },
    { key: "payback", value: payback === null ? t.kpis.notReached : `${f.num(payback, 1)} ${t.kpis.years}`, sub: "" },
  ];
  if (blocked) for (const tile of tiles) Object.assign(tile, { value: "—", sub: "", critical: false, extra: undefined });
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", pending && "opacity-60 transition-opacity")} aria-busy={pending}>
      {tiles.map((tile) => {
        const meta = t.kpis[tile.key];
        return (
          <Popover key={tile.key}>
            <PopoverTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="text-xs text-muted-foreground">{meta.label}</div>
              <div className={cn("text-lg font-semibold leading-tight tabular", tile.critical && "text-critical")}>{tile.value}</div>
              <div className="h-4 truncate text-[11px] text-muted-foreground">{tile.sub}</div>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              {tile.extra && <p className="mb-1 font-medium">{tile.extra}</p>}
              {meta.hint}
              {tile.key === "investorIrr" && noDebt && !blocked && <p className="mt-2 text-muted-foreground">{t.kpis.noDebtHint}</p>}
            </PopoverContent>
          </Popover>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {pending ? t.kpis.stale : blocked ? t.caseStatus.title[blocked] : `${t.kpis.investorIrr.label} ${irr.text}`}
      </span>
      {blocked ? <StatusLine core={core} t={t} onClick={onChecks} /> : <ValidityLine core={core} t={t} onClick={onChecks} />}
    </div>
  );
}

/** For a contract case without a result: its status and the reasons, in place of the numbers. */
function StatusLine({ core, t, onClick }: { core: BessCore; t: BessMessages; onClick: () => void }) {
  const { primary, reasons } = core.result.status;
  return (
    <button
      type="button"
      onClick={onClick}
      className="col-span-2 flex items-start gap-1.5 rounded-lg px-1 text-left text-xs text-critical sm:col-span-3 lg:col-span-6"
    >
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{t.caseStatus.title[primary] ?? primary}: </span>
        {reasons.map((r) => reasonText(t, r)).join("; ")}
        <span className="text-muted-foreground underline-offset-2 hover:underline"> · {t.validity.details}</span>
      </span>
    </button>
  );
}

/** One line on the state of the result: failed checks first, then warnings and what lies outside the model. */
function ValidityLine({ core, t, onClick }: { core: BessCore; t: BessMessages; onClick: () => void }) {
  const V = t.validity;
  const checks = core.result.checks;
  const failed = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warning").length;
  const outside = checks.filter((c) => c.status === "outOfScope").length;
  const libraryFail = failed.some((c) => c.id === "library");
  let level: "error" | "warning" | "ok";
  let message: string;
  if (failed.length > 0) {
    level = "error";
    message = libraryFail ? V.unsupported : `${V.failed(failed.length)}: ${failed.map((c) => t.checks.ids[c.id] ?? c.id).join("; ")}`;
  } else {
    level = warnings > 0 ? "warning" : "ok";
    message = V.ok;
  }
  const Icon = level === "error" ? CircleAlert : level === "warning" ? TriangleAlert : CircleCheck;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "col-span-2 flex items-start gap-1.5 rounded-lg px-1 text-left text-xs sm:col-span-3 lg:col-span-6",
        level === "error" ? "text-critical" : level === "warning" ? "text-foreground" : "text-good-text",
      )}
    >
      <Icon className={cn("mt-px size-4 shrink-0", level === "warning" && "text-warning")} aria-hidden />
      <span>
        <span className="font-medium">{message}</span>
        {level !== "error" && warnings > 0 && <span className="text-muted-foreground"> · {V.warnings(warnings)}</span>}
        {outside > 0 && <span className="text-muted-foreground"> · {V.outOfScope(outside)}</span>}
        <span className="text-muted-foreground underline-offset-2 hover:underline"> · {V.details}</span>
      </span>
    </button>
  );
}
