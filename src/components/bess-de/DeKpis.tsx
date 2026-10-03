"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { DeKpiKey, DeMessages } from "@/bess/de/messages";
import type { DeMetric } from "@/bess/de/types";
import type { DeCore } from "@/bess/de/view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormat } from "@/components/site/LocaleProvider";
import type { Format } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A metric as text: its value when valid, else the word for its status and why. */
export function deMetricText(m: DeMetric | null | undefined, show: (v: number) => string, t: DeMessages, f: Format): { text: string; hint?: string; flagged: boolean } {
  if (!m || (m.status === "valid" && m.value === null)) return { text: f.na, flagged: false };
  if (m.status === "valid") return { text: show(m.value!), flagged: false };
  const roots = m.status === "ambiguous" && m.roots?.length ? ` (${m.roots.map((r) => f.pct(r, 1)).join("; ")})` : "";
  return { text: t.kpis.status[m.status] ?? m.status, hint: `${t.kpis.statusHint[m.status] ?? ""}${roots}`, flagged: true };
}

export const deLcosText = (v: number | null | undefined, f: Format) => (v === null || v === undefined ? f.na : `€${f.num(v, 0)}/MWh`);

interface Props {
  core: DeCore;
  t: DeMessages;
  pending: boolean;
  onChecks: () => void;
}

export function DeKpis({ core, t, pending, onChecks }: Props) {
  const f = useFormat();
  const { inputs, noDebt } = core;
  const k = core.kpis;
  const blocked = core.status.primary !== "ok" || !k;
  const irr = deMetricText(k?.investorIrr, (v) => f.pct(v, 1), t, f);
  const plainIrr = noDebt ? deMetricText(noDebt.investorIrr, (v) => f.pct(v, 1), t, f).text : null;
  const npv = k?.investorNpvEur?.value ?? null;
  const unfunded = k?.investorIrr?.status === "unfunded";
  const dscr = k?.dscrMin?.value ?? null;
  const lender = k?.lenderDscrMin?.value ?? null;
  const payback = k?.paybackYears?.value ?? null;
  const tiles: { key: DeKpiKey; value: string; sub: string; critical?: boolean; extra?: string }[] = [
    { key: "investorIrr", value: irr.text, sub: plainIrr !== null ? `${t.kpis.withoutDebt}: ${plainIrr}` : "", critical: irr.flagged, extra: irr.hint },
    { key: "investorNpv", value: f.meur(npv, 1), sub: `@ ${f.pct(inputs.equityHurdle, 0)}`, critical: unfunded },
    {
      key: "minDscr",
      value: dscr === null ? f.na : f.ratio(dscr),
      sub: lender !== null ? `${t.kpis.lenderCase}: ${f.ratio(lender)}` : "",
      critical: dscr !== null && dscr < inputs.lockupDscr,
    },
    { key: "revenue2029", value: f.eurCompact(k?.revenue2029PerMwEur?.value ?? null), sub: t.kpis.perMw },
    { key: "lcos", value: deLcosText(k?.lcosEurPerMWh?.value, f), sub: "" },
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
        {pending ? t.kpis.stale : blocked ? (t.caseStatus.title[core.status.primary] ?? core.status.primary) : `${t.kpis.investorIrr.label} ${irr.text}`}
      </span>
      {blocked ? <StatusLine core={core} t={t} onClick={onChecks} /> : <ValidityLine core={core} t={t} onClick={onChecks} />}
    </div>
  );
}

/** For a case without a result: its status and the failed input checks, in place of the numbers. */
function StatusLine({ core, t, onClick }: { core: DeCore; t: DeMessages; onClick: () => void }) {
  const failed = core.checks.filter((c) => c.status === "fail");
  return (
    <button
      type="button"
      onClick={onClick}
      className="col-span-2 flex items-start gap-1.5 rounded-lg px-1 text-left text-xs text-critical sm:col-span-3 lg:col-span-6"
    >
      <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{t.caseStatus.title[core.status.primary] ?? core.status.primary}: </span>
        {failed.map((c) => t.checks.ids[c.id] ?? c.id).join("; ")}
        <span className="text-muted-foreground underline-offset-2 hover:underline"> · {t.validity.details}</span>
      </span>
    </button>
  );
}

/** One line on the state of the result: failed checks first, then warnings. */
function ValidityLine({ core, t, onClick }: { core: DeCore; t: DeMessages; onClick: () => void }) {
  const V = t.validity;
  const failed = core.checks.filter((c) => c.status === "fail");
  const warnings = core.checks.filter((c) => c.status === "warn").length;
  const level = failed.length > 0 ? "error" : warnings > 0 ? "warning" : "ok";
  const message = failed.length > 0 ? `${V.failed(failed.length)}: ${failed.map((c) => t.checks.ids[c.id] ?? c.id).join("; ")}` : V.ok;
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
        <span className="text-muted-foreground underline-offset-2 hover:underline"> · {V.details}</span>
      </span>
    </button>
  );
}
