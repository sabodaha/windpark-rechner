"use client";

import { RadioGroup } from "@/components/ui/radio-group";
import { useState, type ReactNode } from "react";
import type { Inputs, ModelResult, ScenarioName } from "@/engine";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import type { Messages } from "@/messages";
import { YearTable, type TableRow } from "./YearTable";

const DSCR_VIEWS = ["operating", "lender"] as const;

interface Props {
  inputs: Inputs;
  results: Record<ScenarioName, ModelResult>;
  scenario: ScenarioName;
  t: Messages;
}

const m = (v: number) => v / 1e6;

export function Overview({ inputs, results, scenario, t }: Props) {
  const fm = useFormat();
  const fmtM = (v: number) => fm.num(v, 2);
  const fmtAxisM = (v: number) => fm.num(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0);
  const fmtRatio = (v: number | null) => (v === null ? "—" : fm.ratio(v));
  const r = results[scenario];
  const a = r.annual;
  const years = a.map((x) => x.year);
  const C = t.charts;
  const k = r.kpis;
  const eegYears = a.map((x, i) => (x.eegShare > 0 ? i : -1)).filter((i) => i >= 0);
  const [dscrView, setDscrView] = useState<"operating" | "lender">("operating");
  const lender = results.base.sizing.lenderCase;
  const basis = t.overview.basis[results.base.sizing.bankPriceBasis] ?? "";
  const f = inputs.financing;
  const perKwh = (value: number, sold: number) => (sold > 0 ? (value / sold) * 100 : null);
  const binding = r.sizing.binding;
  const bindingLabel =
    binding === "dscrP50" || binding === "dscrP90"
      ? `${t.overview.binding[binding]} ${t.overview.basis[r.sizing.bankPriceBasis] ?? ""}`
      : (t.overview.binding[binding] ?? binding);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={C.cashflow.title}
          subtitle={C.cashflow.subtitle}
          table={{
            years,
            rows: [
              { label: C.cashflow.revenue, values: a.map((x) => x.revenue) },
              { label: C.cashflow.opex, values: a.map((x) => -x.opex) },
              { label: C.cashflow.taxes, values: a.map((x) => -x.taxes) },
              { label: C.cashflow.debtService, values: a.map((x) => -x.debtService) },
              { label: C.cashflow.distribution, values: a.map((x) => x.distribution), bold: true },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "rev", label: C.cashflow.revenue, color: SERIES[0]!, values: a.map((x) => m(x.revenue)) },
              { id: "opex", label: C.cashflow.opex, color: SERIES[1]!, values: a.map((x) => -m(x.opex)) },
              { id: "tax", label: C.cashflow.taxes, color: SERIES[2]!, values: a.map((x) => -m(x.taxes)) },
              { id: "ds", label: C.cashflow.debtService, color: SERIES[3]!, values: a.map((x) => -m(x.debtService)) },
            ]}
            lines={[{ id: "dist", label: C.cashflow.distribution, color: SERIES[4]!, values: a.map((x) => m(x.distribution)) }]}
            format={(v) => `€${fmtM(v)}m`}
            axisFormat={fmtAxisM}
            ariaLabel={`${C.cashflow.title}, ${C.cashflow.subtitle}`}
          />
        </ChartCard>

        <ChartCard
          title={C.dscr.title}
          subtitle={dscrView === "operating" ? C.dscr.subtitle : C.dscr.lenderNote(basis)}
          controls={
            <RadioGroup
              value={dscrView}
              options={DSCR_VIEWS}
              onChange={setDscrView}
              label={C.dscr.title}
              className="inline-flex rounded-md border border-border p-0.5"
              optionClassName={(checked) =>
                cn("whitespace-nowrap rounded px-2 py-0.5 text-[11px]", checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
              render={(view) => C.dscr[view]}
            />
          }
          table={
            dscrView === "operating"
              ? {
                  years,
                  rows: [
                    { label: C.dscr.base, values: results.base.annual.map((x) => x.dscr), format: fmtRatio },
                    { label: C.dscr.p90, values: results.p90.annual.map((x) => x.dscr), format: fmtRatio },
                  ],
                }
              : {
                  years: lender.years,
                  rows: [
                    { label: C.dscr.lenderP50, values: lender.dscrP50, format: fmtRatio },
                    { label: C.dscr.lenderP90, values: lender.dscrP90, format: fmtRatio },
                  ],
                }
          }
          t={t}
        >
          {dscrView === "operating" ? (
            <YearChart
              years={years}
              lines={[
                { id: "base", label: C.dscr.base, color: SERIES[0]!, values: results.base.annual.map((x) => x.dscr) },
                { id: "p90", label: C.dscr.p90, color: SERIES[1]!, values: results.p90.annual.map((x) => x.dscr) },
              ]}
              refLines={[
                { label: `${C.dscr.lockup} ${fm.ratio(f.lockupDscr)}`, value: f.lockupDscr, labelAt: "right-above" },
                { label: `${C.dscr.covenant} ${fm.ratio(f.covenantDscr)}`, value: f.covenantDscr, labelAt: "right-below" },
              ]}
              yMin={0}
              format={(v) => fm.ratio(v)}
              axisFormat={(v) => fm.num(v, 1)}
              ariaLabel={`${C.dscr.title} — ${C.dscr.operating}, ${C.dscr.subtitle}`}
            />
          ) : (
            <YearChart
              years={lender.years}
              lines={[
                { id: "l50", label: C.dscr.lenderP50, color: SERIES[0]!, values: lender.dscrP50 },
                { id: "l90", label: C.dscr.lenderP90, color: SERIES[1]!, values: lender.dscrP90 },
              ]}
              refLines={[
                { label: `${C.dscr.targetP50} ${fm.ratio(f.targetDscrP50)}`, value: f.targetDscrP50, labelAt: "right-above" },
                { label: `${C.dscr.targetP90} ${fm.ratio(f.targetDscrP90)}`, value: f.targetDscrP90, labelAt: "right-below" },
              ]}
              yMin={0}
              format={(v) => fm.ratio(v)}
              axisFormat={(v) => fm.num(v, 1)}
              ariaLabel={`${C.dscr.title} — ${C.dscr.lender}, ${C.dscr.lenderNote(basis)}`}
            />
          )}
        </ChartCard>

        <ChartCard
          title={C.revenue.title}
          subtitle={C.revenue.subtitle}
          table={{
            years,
            rows: [
              { label: C.revenue.market, values: a.map((x) => perKwh(x.revenueMarket + x.revenuePostEeg, x.energySoldKwh)), format: (v) => fm.num(v, 2) },
              { label: C.revenue.premium, values: a.map((x) => perKwh(x.revenuePremium, x.energySoldKwh)), format: (v) => fm.num(v, 2) },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "mv", label: C.revenue.market, color: SERIES[0]!, values: a.map((x) => perKwh(x.revenueMarket + x.revenuePostEeg, x.energySoldKwh) ?? 0) },
              { id: "mp", label: C.revenue.premium, color: SERIES[1]!, values: a.map((x) => perKwh(x.revenuePremium, x.energySoldKwh) ?? 0) },
            ]}
            refLines={
              eegYears.length
                ? [{ label: `${C.revenue.aw} ${fm.num(k.awCt, 2)}`, value: k.awCt, from: eegYears[0]!, to: eegYears[eegYears.length - 1]! }]
                : []
            }
            format={(v) => `${fm.num(v, 2)} ct`}
            axisFormat={(v) => fm.num(v, 0)}
            ariaLabel={`${C.revenue.title}, ${C.revenue.subtitle}`}
          />
        </ChartCard>

        <ChartCard
          title={C.debtService.title}
          subtitle={C.debtService.subtitle}
          table={{
            years,
            rows: [
              { label: C.debtService.interest, values: a.map((x) => x.interest) },
              { label: C.debtService.principal, values: a.map((x) => x.principal) },
              { label: t.tables.rows.debtClosing!, values: a.map((x) => x.debtClosing) },
            ],
          }}
          t={t}
        >
          <YearChart
            years={years}
            bars={[
              { id: "int", label: C.debtService.interest, color: SERIES[0]!, values: a.map((x) => m(x.interest)) },
              { id: "prin", label: C.debtService.principal, color: SERIES[1]!, values: a.map((x) => m(x.principal)) },
            ]}
            format={(v) => `€${fmtM(v)}m`}
            axisFormat={fmtAxisM}
            ariaLabel={`${C.debtService.title}, ${C.debtService.subtitle}`}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.facts}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Fact label={t.overview.capacity} value={`${fm.num(k.capacityMw, 1)} MW`} />
              <Fact label={t.overview.p50} value={`${fm.num(k.fullLoadHoursP50, 0)} h`} />
              <Fact label={t.overview.kf} value={fm.num(k.correctionFactor, 3)} />
              <Fact
                label={t.overview.aw}
                value={r.awPeriods.map((p) => `${fm.num(p.awCt, 2)}`).filter((v, i, all) => all.indexOf(v) === i).join(" → ") + " ct/kWh"}
              />
              <Fact label={t.overview.cod} value={fm.dateLabel(r.timeline.cod)} />
              <Fact label={t.overview.firstInstalment} value={r.timeline.firstInstalment ? fm.dateLabel(r.timeline.firstInstalment) : "—"} />
              <Fact label={t.overview.loanEnd} value={fm.dateLabel(r.timeline.loanMaturity)} />
              <Fact label={t.overview.eegEnd} value={fm.dateLabel(r.timeline.eegEnd)} />
              <Fact label={t.overview.endOfLife} value={fm.dateLabel(r.timeline.endOfLife)} />
              <Fact label={t.overview.awardLapse} value={fm.dateLabel(r.timeline.awardLapse)} />
              <Fact label={t.overview.sizing} value={bindingLabel} />
              <Fact
                label={t.tables.lenderCase}
                value={t.tables.lenderDscr(basis, fm.ratio(results.base.sizing.minBankDscrP50), fm.ratio(results.base.sizing.minBankDscrP90))}
              />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t.overview.sourcesUses}</CardTitle>
            <CardDescription>
              € thousand · {fm.pct(k.gearing, 1)} {t.kpis.gearing}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm tabular">
              <tbody>
                {(
                  [
                    "capex",
                    "upfrontFee",
                    "commitmentFee",
                    "interestDuringConstruction",
                    "vatInterest",
                    "dsraInitial",
                    "workingCapitalInitial",
                    "totalUses",
                  ] as const
                ).map((key) => (
                  <tr key={key} className={cn("border-b border-border last:border-0", key === "totalUses" && "font-semibold")}>
                    <td className="py-1">{t.overview.uses[key]}</td>
                    <td className="py-1 text-right">{fm.keur(r.sourcesUses[key])}</td>
                  </tr>
                ))}
                {(["debt", "equity", "totalSources"] as const).map((key) => (
                  <tr key={key} className={cn("border-b border-border last:border-0", key === "totalSources" && "font-semibold")}>
                    <td className="py-1">{t.overview.uses[key]}</td>
                    <td className="py-1 text-right">{fm.keur(r.sourcesUses[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.kpis.debt.label}: {fm.meur(k.debt)} · Equity: {fm.meur(k.equity)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular sm:text-left">{value}</dd>
    </>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  table,
  controls,
  t,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  table: { years: number[]; rows: TableRow[] };
  controls?: ReactNode;
  t: Messages;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {controls}
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            aria-pressed={showTable}
            className="text-xs font-medium text-link hover:underline"
          >
            {showTable ? title : t.charts.tableView}
          </button>
        </div>
      </CardHeader>
      <CardContent>{showTable ? <YearTable years={table.years} rows={table.rows} caption={title} /> : children}</CardContent>
    </Card>
  );
}
