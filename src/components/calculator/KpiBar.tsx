"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { Inputs, ModelResult, ScenarioName } from "@/engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ct, eurCompact, meur, pct, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

interface Props {
  results: Record<ScenarioName, ModelResult>;
  inputs: Inputs;
  scenario: ScenarioName;
  t: Messages;
  pending: boolean;
  onChecks: () => void;
}

export function KpiBar({ results, inputs, scenario, t, pending, onChecks }: Props) {
  const r = results[scenario];
  const k = r.kpis;
  const v = r.validity;
  const nm = !v.returnsMeaningful;
  // critical (red): not meaningful, or the covenant is breached.
  const tiles: { key: keyof Messages["kpis"]; value: string; sub?: string; tone?: "critical"; hint?: string }[] = [
    {
      key: "equityIrr",
      value: nm ? t.kpis.notMeaningful : pct(k.equityIrr, 2),
      tone: nm ? "critical" : undefined,
      hint: nm ? t.kpis.notMeaningfulHint : undefined,
    },
    { key: "projectIrr", value: pct(k.projectIrrPostTax, 2) },
    { key: "lcoe", value: ct(k.lcoeRealCt) },
    {
      key: "minDscr",
      value: ratio(k.minDscr),
      sub: scenario === "base" ? `${t.scenarios.p90}: ${ratio(results.p90.kpis.minDscr)}` : undefined,
      tone: v.covenantBreach ? "critical" : undefined,
    },
    { key: "debt", value: meur(k.debt), sub: `${pct(k.gearing, 0)} ${t.kpis.gearing}` },
    {
      key: "npv",
      value: nm ? t.kpis.notMeaningful : meur(k.npvEquity),
      tone: nm ? "critical" : undefined,
      hint: nm ? t.kpis.notMeaningfulHint : undefined,
    },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", pending && "opacity-60 transition-opacity")}>
      {tiles.map((tile) => {
        const meta = t.kpis[tile.key] as { label: string; hint: string };
        return (
          <Popover key={tile.key}>
            <PopoverTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="text-xs text-muted-foreground">{meta.label}</div>
              <div className={cn("text-lg font-semibold leading-tight", tile.tone === "critical" && "text-critical")}>
                {tile.value}
              </div>
              <div className="h-4 text-[11px] text-muted-foreground">{tile.sub ?? ""}</div>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              {tile.hint && <p className="mb-1 font-medium">{tile.hint}</p>}
              {meta.hint}
            </PopoverContent>
          </Popover>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {t.kpis.equityIrr.label} {nm ? t.kpis.notMeaningful : pct(k.equityIrr, 2)}
      </span>
      <ValidityLine result={r} inputs={inputs} t={t} onClick={onChecks} />
    </div>
  );
}

/** One line on the state of the selected scenario: the most serious problem first. */
function ValidityLine({ result, inputs, t, onClick }: { result: ModelResult; inputs: Inputs; t: Messages; onClick: () => void }) {
  const v = result.validity;
  const V = t.validity;
  const failedErrors = result.checks.filter((c) => !c.ok && c.severity === "error");
  const warnings = result.checks.filter((c) => !c.ok && c.severity === "warning").length;
  let message: string;
  let level: "error" | "warning" | "ok";
  if (v.integrity === "error") {
    message = `${V.integrity}: ${failedErrors.filter((c) => c.group === "integrity").map((c) => t.checks.ids[c.id] ?? c.id).join("; ")}`;
    level = "error";
  } else if (v.shortfall) {
    message = V.shortfall(eurCompact(v.shortfall.amount), v.shortfall.year);
    level = "error";
  } else if (v.covenantBreach) {
    message = V.covenant(ratio(v.covenantBreach.dscr), v.covenantBreach.year, ratio(inputs.financing.covenantDscr));
    level = "error";
  } else if (v.scope === "error") {
    message = `${V.scopeError}: ${failedErrors.filter((c) => c.group === "scope").map((c) => t.checks.ids[c.id] ?? c.id).join("; ")}`;
    level = "error";
  } else {
    message = v.lockUpYears.length > 0 ? `${V.ok} · ${V.lockUp(v.lockUpYears.length)}` : V.ok;
    level = warnings > 0 ? "warning" : "ok";
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
        <span className="text-muted-foreground underline-offset-2 hover:underline"> · {V.details}</span>
      </span>
    </button>
  );
}
