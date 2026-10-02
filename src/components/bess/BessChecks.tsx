"use client";

import { CircleAlert, CircleCheck, CircleSlash, Info, TriangleAlert } from "lucide-react";
import type { CheckResult } from "@/bess/engine";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ORDER: CheckResult["group"][] = ["integrity", "funding", "covenant", "data", "inputs", "physical", "scope"];

const ICON = { pass: CircleCheck, fail: CircleAlert, warning: TriangleAlert, notApplicable: Info, outOfScope: CircleSlash };
const TONE = { pass: "text-good-text", fail: "text-critical", warning: "text-warning", notApplicable: "text-muted-foreground", outOfScope: "text-muted-foreground" };

/** Every check with its status; what the model does not cover is said as such, never shown as passed (spec §17). */
export function BessChecks({ core, t }: { core: BessCore; t: BessMessages }) {
  const C = t.checks;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{C.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ORDER.map((group) => {
          const checks = core.result.checks.filter((c) => c.group === group);
          if (checks.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`bess-checks-${group}`}>
              <h3 id={`bess-checks-${group}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {C.groups[group] ?? group}
              </h3>
              <ul className="divide-y divide-border text-sm">
                {checks.map((c) => {
                  const Icon = ICON[c.status];
                  const note = C.notes[c.id];
                  return (
                    <li key={c.id} className="flex items-start gap-2 py-2">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[c.status])} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div>{C.ids[c.id] ?? c.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {C.status[c.status]}
                          {note && c.status !== "pass" && ` · ${note}`}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
