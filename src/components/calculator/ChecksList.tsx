"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { CheckGroup, ModelResult } from "@/engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import type { Messages } from "@/messages";

const ORDER: CheckGroup[] = ["integrity", "funding", "covenant", "inputs", "scope"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ChecksList({ result, t }: { result: ModelResult; t: Messages }) {
  const f = useFormat();
  const C = t.checks;
  /** Numbers and dates in the page's format; words ("one-sided") translated. */
  const shown = (v: number | string) =>
    typeof v === "number" ? f.num(v, Math.abs(v) < 100 ? 3 : 0) : ISO_DATE.test(v) ? f.dateLabel(v) : (C.values[v] ?? v);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.tabs.checks}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ORDER.map((group) => {
          const checks = result.checks.filter((c) => c.group === group);
          if (checks.length === 0) return null;
          return (
            <section key={group} aria-labelledby={`checks-${group}`}>
              <h3 id={`checks-${group}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {C.groups[group] ?? group}
              </h3>
              <ul className="divide-y divide-border text-sm">
                {checks.map((c) => {
                  const Icon = c.ok ? CircleCheck : c.severity === "error" ? CircleAlert : c.severity === "warning" ? TriangleAlert : Info;
                  const tone = c.ok ? "text-good-text" : c.severity === "error" ? "text-critical" : c.severity === "warning" ? "text-warning" : "text-muted-foreground";
                  const status = c.ok ? C.ok : C.severity[c.severity];
                  return (
                    <li key={c.id} className="flex items-start gap-2 py-2">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div>{C.ids[c.id] ?? c.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {status}
                          {c.value !== null && ` · ${C.value}: ${shown(c.value)}`}
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
