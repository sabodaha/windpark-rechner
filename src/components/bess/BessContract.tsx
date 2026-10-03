"use client";

import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import { CONTRACT_DEFAULTS } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore, BessPStar } from "@/bess/view";
import { CurveChart } from "@/components/charts/CurveChart";
import { SERIES } from "@/components/charts/core";
import { YearChart } from "@/components/charts/YearChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { parts } from "@/engine/dates";
import { cn } from "@/lib/utils";
import { millions } from "./chartFormat";
import { blockedStatus, checkLabel, monthLabel, RESERVE_SCREENS, reasonText } from "./contractText";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (day: number) => {
  const p = parts(day);
  return `${MON[p.month - 1]} ${String(p.year).slice(2)}`;
};

/** The reserve contract in detail (spec v1.1 §3, §7, §11–§13): the award, what it changes in 2029, the break-even price,
 *  the two debt buckets and the physical checks. Without a contract: what it would be, and how to switch it on. */
export function BessContract({ core, pstar, t, onSwitchOn }: { core: BessCore; pstar: BessPStar | null; t: BessMessages; onSwitchOn: () => void }) {
  const T = t.contract.tab;
  const on = core.inputs.contract?.enabled === true;
  const blocked = blockedStatus(core);
  if (!on) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{T.offTitle}</CardTitle>
            <CardDescription className="max-w-3xl leading-relaxed">{T.offText}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={onSwitchOn}>
              <Plus aria-hidden />
              {T.switchOn}
            </Button>
          </CardContent>
        </Card>
        <BreakEvenCard pstar={pstar} t={t} />
      </div>
    );
  }
  if (blocked) {
    return (
      <div className="flex flex-col gap-4">
        <StatusCard core={core} pstar={pstar} t={t} />
        {blocked === "physicallyUnsupported" && <PhysicalCard core={core} t={t} />}
        <BreakEvenCard pstar={pstar} t={t} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {core.result.status.primary === "cancelled" && <StatusCard core={core} pstar={pstar} t={t} />}
      <FactsCard core={core} pstar={pstar} t={t} />
      <BridgeCard core={core} t={t} />
      <BreakEvenCard pstar={pstar} t={t} />
      <BucketsCard core={core} t={t} />
      <PhysicalCard core={core} t={t} />
    </div>
  );
}

/** Why there is no result (or, for a cancelled award, what happened instead). */
export function StatusCard({ core, pstar, t }: { core: BessCore; pstar: BessPStar | null; t: BessMessages }) {
  const f = useFormat();
  const S = t.caseStatus;
  const { primary, reasons } = core.result.status;
  const bad = primary !== "cancelled";
  return (
    <Card role={bad ? "alert" : undefined} className={cn("border-l-4", bad ? "border-l-critical" : "border-l-warning")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleAlert className={cn("size-4", bad ? "text-critical" : "text-warning")} aria-hidden />
          {S.title[primary] ?? primary}
        </CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">{S.text[primary]}</CardDescription>
      </CardHeader>
      {bad && (
        <CardContent className="flex flex-col gap-2 text-sm">
          <ul className="ml-5 list-disc">
            {reasons.map((r) => (
              <li key={r}>{reasonText(t, r)}</li>
            ))}
          </ul>
          {primary === "physicallyUnsupported" && pstar && <p className="font-medium">{S.cMax(`${f.num(pstar.cMax, 0)} MW`)}</p>}
          <p className="text-muted-foreground">{t.contract.tab.notShown}</p>
        </CardContent>
      )}
    </Card>
  );
}

function FactsCard({ core, pstar, t }: { core: BessCore; pstar: BessPStar | null; t: BessMessages }) {
  const f = useFormat();
  const T = t.contract.tab;
  const F = T.facts;
  const rc = core.result.contract;
  if (!rc) return null;
  const s = rc.summary;
  const a1 = rc.awards[0];
  const a2 = rc.awards[1];
  const euro = (v: number) => `€${f.num(v, 2)}`;
  const facts: [string, string][] = [
    [F.award, `${f.num(s.acceptedMW, 0)} MW`],
    [F.cMax, pstar ? `${f.num(pstar.cMax, 0)} MW` : "…"],
    [F.price, a1 ? `${euro(a1.eurPerMWHour)} /MW·h` : f.na],
    [F.cap, a1 ? euro(a1.capEur) : f.na],
    [F.service, a1 ? `${monthLabel(a1.start)} – ${monthLabel(a1.endExclusive, 1)}` : f.na],
    [F.second, a2 ? `${monthLabel(a2.start)} – ${monthLabel(a2.endExclusive, 1)}, ${euro(a2.eurPerMWHour)}` : F.none],
    [F.escrow, f.meur(s.escrowPeakEur, 2)],
    [F.liquidity, f.eurCompact(s.liquidityPeakEur)],
    [F.fill, f.eurCompact(s.fillEur)],
    [F.calls, f.meur(s.sponsorCallsEur, 2)],
    [F.share, f.pct(s.sigmaStarMax, 0)],
    [F.daShare, f.pct(s.daShare2029, 0)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.factsTitle}</CardTitle>
        <CardDescription className="max-w-3xl leading-relaxed">{T.expected}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          <span className="text-muted-foreground">{F.recovery}: </span>
          <span className="tabular">{T.recoveryValue(f.num(s.recoveryHoursUp, 1), f.num(s.recoveryHoursDown, 1))}</span>
        </p>
      </CardContent>
    </Card>
  );
}

/** 2029 per MW: the contract's lines beside what is left of day-ahead trading (spec §13). */
function BridgeCard({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const T = t.contract.tab;
  const b = core.result.contract?.bridge2029PerMW;
  if (!b) return null;
  const rows: { label: string; v: number; total?: boolean }[] = [
    { label: T.bridge.daNet, v: b.daNet },
    { label: T.bridge.capacity, v: b.capacity },
    { label: T.bridge.upEnergy, v: b.upEnergy },
    { label: T.bridge.downEnergy, v: b.downEnergy },
    { label: T.bridge.restoration, v: b.restoration },
    { label: T.bridge.penalties, v: b.penalties },
    { label: T.bridge.feesAndLoad, v: b.feesAndLoad },
    { label: T.bridge.networkIncrement, v: b.networkIncrement },
    { label: T.bridge.net, v: b.net, total: true },
  ];
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1);
  // whole euros: several lines are worth only tens of euros per MW
  const eur = (v: number) => `${v < 0 ? "−" : ""}€${f.num(Math.abs(v), 0)}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.bridgeTitle}</CardTitle>
        <CardDescription>{T.bridgeNote}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-2 sm:grid-cols-[15rem_1fr_5rem]">
              <span className={cn("truncate", r.total ? "font-medium" : "pl-3 text-muted-foreground")}>{r.label}</span>
              <span className="h-3 rounded-sm bg-secondary">
                <span
                  className={cn("block h-3 rounded-sm", r.total ? "bg-[var(--series-1)]" : r.v < 0 ? "bg-[var(--series-2)]" : "bg-[var(--series-3)]")}
                  style={{ width: `${(Math.abs(r.v) / max) * 100}%` }}
                />
              </span>
              <span className={cn("text-right tabular", r.total && "font-semibold")}>{eur(r.v)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Investor NPV against the contract price, the loan sized again at every price (V07). */
export function BreakEvenCard({ pstar, t }: { pstar: BessPStar | null; t: BessMessages }) {
  const f = useFormat();
  const T = t.contract.tab;
  const be = pstar?.breakEven;
  const points = (be?.candidates ?? []).map((c) => ({ x: c.price, y: c.supported && c.npv !== null ? c.npv / 1e6 : null }));
  const root = be && (be.outcome === "found" || be.outcome === "viableAtZero") && be.value !== null ? be.value : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.pStarTitle}</CardTitle>
        <CardDescription>{T.pStarNote}</CardDescription>
      </CardHeader>
      <CardContent>
        {!be ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.contract.calculating}</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.contract.tab.notShown}</p>
        ) : (
          <CurveChart
            points={points}
            xFormat={(v) => `€${f.num(v, 0)}`}
            yFormat={(v) => f.meur(v * 1e6, 0)}
            vLines={[
              { label: `${t.contract.scale.cap} €${f.num(be.capEur, 2)}`, x: be.capEur },
              { label: `${t.contract.scale.round} €${f.num(CONTRACT_DEFAULTS.eurPerMWHour, 0)}`, x: CONTRACT_DEFAULTS.eurPerMWHour },
              ...(root !== null ? [{ label: `${t.contract.scale.breakEven} €${f.num(root, 2)}`, x: root }] : []),
            ]}
            marker={root !== null ? { x: root, y: 0 } : null}
            seriesLabel={T.npv}
            ariaLabel={T.pStarTitle}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Cash for debt service of each half-year, split into the contract and the trading bucket (spec §11). */
function BucketsCard({ core, t }: { core: BessCore; t: BessMessages }) {
  const f = useFormat();
  const T = t.contract.tab;
  const M = millions(f);
  const rc = core.result.contract;
  if (!rc || rc.buckets.length === 0) return null;
  const rows = rc.buckets.map((b, i) => ({ ...b, ds: core.result.periods[i]?.debtServiceEur ?? 0 }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.bucketsTitle}</CardTitle>
        <CardDescription>
          {T.bucketsNote}
          {rc.contractShare !== null && ` ${T.bucketsShare(f.pct(rc.contractShare, 0))}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <YearChart
          years={rows.map((r) => r.day)}
          labels={rows.map((r) => periodLabel(r.day))}
          bars={[
            { id: "contract", label: T.bucketContract, color: "var(--series-6)", values: rows.map((r) => M.m(r.contractEur)) },
            { id: "merchant", label: T.bucketMerchant, color: SERIES[0]!, values: rows.map((r) => M.m(r.merchantEur)) },
          ]}
          lines={[{ id: "ds", label: T.debtService, color: "var(--chart-ink-2)", values: rows.map((r) => (r.ds > 0 ? M.m(r.ds) : null)) }]}
          format={M.tip}
          axisFormat={M.axis}
          ariaLabel={T.bucketsTitle}
        />
      </CardContent>
    </Card>
  );
}

/** The reserve's physical screens on the case's path and the lender's (spec §3, §14). */
function PhysicalCard({ core, t }: { core: BessCore; t: BessMessages }) {
  const T = t.contract.tab;
  const checks = core.result.checks.filter((c) => RESERVE_SCREENS.includes(c.id.replace(/^lender:/, "")));
  if (checks.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{T.physicalTitle}</CardTitle>
        <CardDescription>{T.physicalNote}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {checks.map((c) => {
            const ok = c.status === "pass";
            const Icon = ok ? CircleCheck : CircleAlert;
            return (
              <li key={c.id} className="flex items-start gap-2 py-2">
                <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? "text-good-text" : "text-critical")} aria-hidden />
                <span>{checkLabel(t, c.id)}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
