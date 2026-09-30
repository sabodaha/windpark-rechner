"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ModelResult, ScenarioName } from "@/engine";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ct, meur, pct, ratio } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

interface Props {
  results: Record<ScenarioName, ModelResult>;
  scenario: ScenarioName;
  t: Messages;
  pending: boolean;
  onChecks: () => void;
}

export function KpiBar({ results, scenario, t, pending, onChecks }: Props) {
  const r = results[scenario];
  const k = r.kpis;
  const tiles: { key: keyof Messages["kpis"]; value: string; sub?: string; tone?: "bad" }[] = [
    { key: "equityIrr", value: pct(k.equityIrr, 2), tone: (k.equityIrr ?? 0) < 0 ? "bad" : undefined },
    { key: "projectIrr", value: pct(k.projectIrrPostTax, 2) },
    { key: "lcoe", value: ct(k.lcoeRealCt) },
    {
      key: "minDscr",
      value: ratio(k.minDscr),
      sub: scenario === "base" ? `P90: ${ratio(results.p90.kpis.minDscr)}` : undefined,
    },
    { key: "debt", value: meur(k.debt), sub: `${pct(k.gearing, 0)} ${t.kpis.gearing}` },
    { key: "npv", value: meur(k.npvEquity), tone: k.npvEquity < 0 ? "bad" : undefined },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6", pending && "opacity-60 transition-opacity")}>
      {tiles.map((tile) => {
        const meta = t.kpis[tile.key] as { label: string; hint: string };
        return (
          <Popover key={tile.key}>
            <PopoverTrigger className="rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="text-xs text-muted-foreground">{meta.label}</div>
              <div className="text-lg font-semibold leading-tight">{tile.value}</div>
              <div className="h-4 text-[11px] text-muted-foreground">{tile.sub ?? ""}</div>
            </PopoverTrigger>
            <PopoverContent className="w-64">{meta.hint}</PopoverContent>
          </Popover>
        );
      })}
      <span className="sr-only" aria-live="polite">
        {t.kpis.equityIrr.label} {pct(k.equityIrr, 2)}
      </span>
      <ChecksBadge result={r} t={t} onClick={onChecks} />
    </div>
  );
}

function ChecksBadge({ result, t, onClick }: { result: ModelResult; t: Messages; onClick: () => void }) {
  const errors = result.checks.filter((c) => !c.ok && c.severity === "error").length;
  const warnings = result.checks.filter((c) => !c.ok && c.severity === "warning").length;
  const Icon = errors ? CircleAlert : warnings ? TriangleAlert : CircleCheck;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "col-span-2 flex items-center gap-1.5 rounded-lg px-1 text-left text-xs sm:col-span-3 lg:col-span-6",
        errors ? "text-critical" : warnings ? "text-foreground" : "text-good-text",
      )}
    >
      <Icon className={cn("size-4", warnings && !errors && "text-warning")} aria-hidden />
      <span className="font-medium">{errors ? t.checks.failed(errors) : t.checks.allPassed}</span>
      {warnings > 0 && <span className="text-muted-foreground">· {t.checks.warnings(warnings)}</span>}
    </button>
  );
}
