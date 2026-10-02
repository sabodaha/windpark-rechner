"use client";

import { buildCalendar } from "@/bess/engine/calendar";
import { TECH } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore } from "@/bess/view";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { addMonths, parts } from "@/engine/dates";
import { operatingYears } from "./BessOverview";

export function BessBattery({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const B = t.battery;
  const { inputs } = core;
  const cal = buildCalendar(inputs.codDelayMonths);
  const opDays = new Map<number, number>();
  for (const m of cal.months) if (m.phase === "operation") opDays.set(m.year, (opDays.get(m.year) ?? 0) + m.days);
  const rows = operatingYears(core).filter((a) => a.deliveredMWh > 0);
  const years = rows.map((a) => a.year);
  const usableBoL = inputs.durationH;
  const codDay = cal.months[cal.codIndex]!.start;
  const augYear = parts(addMonths(codDay, TECH.augmentation.monthAfterCod)).year;
  const pcsYear = parts(addMonths(codDay, TECH.pcsOverhaul.monthAfterCod)).year;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{B.title}</CardTitle>
          <CardDescription>{B.note}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years}
            lines={[
              { id: "usable", label: B.soh, color: SERIES[0]!, values: rows.map((a) => a.usableHoursEnd / usableBoL) },
            ]}
            format={(v) => f.pct(v, 1)}
            axisFormat={(v) => f.pct(v, 0)}
            yMin={0}
            yMax={1}
            ariaLabel={B.soh}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{B.cycles}</CardTitle>
          <CardDescription>{B.cyclesNote(f.num(inputs.cycleCap, 1))}</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart
            years={years}
            bars={[
              {
                id: "cycles",
                label: B.cycles,
                color: SERIES[2]!,
                values: rows.map((a) => a.deliveredMWh / (inputs.powerMW * usableBoL) / Math.max(1, opDays.get(a.year) ?? 365)),
              },
            ]}
            refLines={[{ label: f.num(inputs.cycleCap, 1), value: inputs.cycleCap }]}
            format={(v) => f.num(v, 2)}
            axisFormat={(v) => f.num(v, 1)}
            height={180}
            ariaLabel={B.cycles}
          />
          <h3 className="mt-4 text-sm font-semibold">{B.events}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground/85">
            <li>{inputs.augmentation ? B.augmentation(augYear) : B.noAugmentation}</li>
            <li>{B.overhaul(pcsYear)}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
