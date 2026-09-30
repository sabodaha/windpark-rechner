"use client";

import { SCENARIOS, type ScenarioName } from "@/engine";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages/en";

export function ScenarioSwitch({ value, onChange, t }: { value: ScenarioName; onChange: (s: ScenarioName) => void; t: Messages }) {
  const S = t.scenarios;
  const hint = value === "p90" ? S.p90Hint : value === "resource" ? S.resourceHint : value === "downside" ? S.downsideHint : null;
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div role="radiogroup" aria-label={S.label} className="inline-flex w-fit shrink-0 rounded-lg border border-border bg-card p-0.5">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            onClick={() => onChange(s)}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors sm:px-3",
              value === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {S[s]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{hint ? `${hint} ${S.note}` : S.note}</p>
    </div>
  );
}
