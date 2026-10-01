"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { SCENARIOS, type ScenarioName } from "@/engine";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";

export function ScenarioSwitch({ value, onChange, t }: { value: ScenarioName; onChange: (s: ScenarioName) => void; t: Messages }) {
  const S = t.scenarios;
  const hint = value === "p90" ? S.p90Hint : value === "resource" ? S.resourceHint : value === "downside" ? S.downsideHint : null;
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <RadioGroup
        value={value}
        options={SCENARIOS}
        onChange={onChange}
        label={S.label}
        className="inline-flex w-fit shrink-0 rounded-lg border border-border bg-card p-0.5"
        optionClassName={(checked) =>
          cn(
            "whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors sm:px-3",
            checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )
        }
        render={(s) => S[s]}
      />
      <p className="text-xs text-muted-foreground">{hint ? `${hint} ${S.note}` : S.note}</p>
    </div>
  );
}
