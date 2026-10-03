"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { DeMessages } from "@/bess/de/messages";
import type { DeCheck } from "@/bess/de/types";
import type { DeCore } from "@/bess/de/view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ORDER: DeCheck["group"][] = ["input", "integrity", "scope"];

const ICON = { pass: CircleCheck, fail: CircleAlert, warn: TriangleAlert, notApplicable: Info };
const TONE = { pass: "text-good-text", fail: "text-critical", warn: "text-warning", notApplicable: "text-muted-foreground" };

/** Every check with its status (spec §14): inputs, the calculation's own identities, then scope and covenants. */
export function DeChecks({ core, t }: { core: DeCore; t: DeMessages }) {
  const C = t.checks;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{C.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ORDER.map((group) => {
          const checks = core.checks.filter((c) => c.group === group);
          if (checks.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`de-checks-${group}`}>
              <h3 id={`de-checks-${group}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {C.groups[group] ?? group}
              </h3>
              <ul className="divide-y divide-border text-sm">
                {checks.map((c) => {
                  const Icon = ICON[c.status];
                  return (
                    <li key={c.id} className="flex items-start gap-2 py-2">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[c.status])} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div>{C.ids[c.id] ?? c.id}</div>
                        <div className="text-xs text-muted-foreground">{C.status[c.status] ?? c.status}</div>
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
