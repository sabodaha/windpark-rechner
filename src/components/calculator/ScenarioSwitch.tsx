"use client";

import type { ScenarioName } from "@/engine";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

const ORDER: ScenarioName[] = ["base", "p90", "downside"];

export function ScenarioSwitch({ value, onChange, t }: { value: ScenarioName; onChange: (s: ScenarioName) => void; t: Messages }) {
  const hint = value === "p90" ? t.scenarios.p90Hint : value === "downside" ? t.scenarios.downsideHint : null;
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div role="radiogroup" aria-label={t.scenarios.label} className="inline-flex w-fit rounded-lg border border-border bg-card p-0.5">
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition-colors",
              value === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.scenarios[s]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{hint ? `${hint} ${t.scenarios.note}` : t.scenarios.note}</p>
    </div>
  );
}
