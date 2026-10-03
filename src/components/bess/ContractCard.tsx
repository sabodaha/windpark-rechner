"use client";

import { ArrowRight, CircleAlert, CircleCheck, Info, Plus } from "lucide-react";
import { CONTRACT_DEFAULTS, RESERVE } from "@/bess/engine/registry";
import type { BessMessages } from "@/bess/messages";
import type { BessCore, BessPStar } from "@/bess/view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFormat } from "@/components/site/LocaleProvider";
import { cn } from "@/lib/utils";
import { monthLabel, reasonText } from "./contractText";

/** The default price of a new award: about the latest special-auction round (V04). */
const ROUND = CONTRACT_DEFAULTS.eurPerMWHour;
const MAX = RESERVE.pStarDomain[1];

type Tone = "good" | "bad" | "neutral";

/**
 * Beside the day-ahead answer (decision V01): the contract price at which the investor NPV turns zero, on a disclosed
 * contract — the visitor's own, or the default award for this battery — with its status and the auction cap.
 */
export function ContractCard({
  core,
  pstar,
  t,
  onAdd,
  onDetails,
}: {
  core: BessCore;
  pstar: BessPStar | null;
  t: BessMessages;
  /** Switches the contract on. */
  onAdd: () => void;
  /** Opens the Contract tab. */
  onDetails: () => void;
}) {
  const f = useFormat();
  const C = t.contract;
  const on = core.inputs.contract?.enabled === true;
  const euro = (v: number) => `€${f.num(v, 2)}`;
  const mw = (v: number) => `${f.num(v, 0)} MW`;
  const be = pstar?.breakEven ?? null;

  let tone: Tone = "neutral";
  let headline = C.calculating;
  const notes: string[] = [];
  let reasons: string[] = [];
  if (be) {
    switch (be.outcome) {
      case "found":
        headline = C.breakEven(euro(be.value!));
        if (be.admissibility === "admissible") {
          notes.push(C.admissible(euro(be.capEur)));
          tone = be.fundedAtValue ? "good" : "neutral";
        } else if (be.admissibility === "aboveAuctionCap") {
          notes.push(C.aboveCap(euro(be.capEur)));
          tone = "bad";
        } else if (be.admissibility === "zeroPriceNotBid") {
          notes.push(C.zeroPrice);
          tone = "good";
        }
        if (be.fundedAtValue === false) notes.push(C.unfunded);
        if (be.roots.length > 1) notes.push(C.roots(be.roots.length));
        break;
      case "viableAtZero":
        headline = C.viableAtZero;
        tone = "good";
        break;
      case "noCrossingInDomain":
        headline = be.sign === "allPositive" ? C.allPositive(euro(MAX)) : C.allNegative(euro(MAX));
        tone = be.sign === "allPositive" ? "good" : "bad";
        break;
      case "priceInsensitive":
        headline = C.priceInsensitive;
        tone = "bad";
        break;
      case "physicallyUnsupported":
        headline = C.physicallyUnsupported(mw(be.acceptedMW));
        reasons = be.templateReasons.map((code) => reasonText(t, code));
        tone = "bad";
        break;
      case "inputUnsupported":
        headline = C.inputUnsupported;
        reasons = be.templateReasons.map((code) => reasonText(t, code));
        tone = "bad";
        break;
      case "refinementFailed":
        headline = C.refinementFailed;
        break;
      default:
        headline = C.unresolved;
    }
  }
  const at = be?.candidates.find((c) => c.price === ROUND);
  const tpl = pstar?.template;
  const template = tpl ? (tpl.own ? C.templateOwn : C.templateDefault)(mw(tpl.acceptedMW), tpl.tenorMonths, monthLabel(tpl.start)) : null;
  const unsupported = be?.outcome === "physicallyUnsupported" || be?.outcome === "inputUnsupported";
  const Icon = tone === "good" ? CircleCheck : tone === "bad" ? CircleAlert : Info;

  return (
    <Card className={cn("border-l-4", tone === "good" ? "border-l-good" : tone === "bad" ? "border-l-critical" : "border-l-border")}>
      <CardContent className="flex flex-col gap-3 py-4 lg:flex-row lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{C.cardTitle}</h2>
            {!on && <Badge variant="outline">{C.cardTag}</Badge>}
          </div>
          <div className="flex flex-col gap-1 text-sm leading-relaxed text-foreground/85" aria-live="polite">
            <p className={cn("flex items-start gap-1.5", be ? "font-medium text-foreground" : "text-muted-foreground")}>
              {be && <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "good" ? "text-good-text" : tone === "bad" ? "text-critical" : "text-muted-foreground")} aria-hidden />}
              <span>{headline}</span>
            </p>
            {reasons.length > 0 && (
              <ul className="ml-6 list-disc text-foreground/85">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {notes.length > 0 && <p>{notes.join(" ")}</p>}
            {at?.supported && at.npv !== null && !unsupported && <p>{C.at(`€${f.num(ROUND, 0)}`, f.meur(at.npv, 1))}</p>}
            {template && (
              <p className="text-muted-foreground">
                {template} {pstar && C.holds(mw(pstar.cMax))}
              </p>
            )}
            {be?.outcome === "found" && <p className="text-xs text-muted-foreground">{C.gridNote}</p>}
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-80 lg:shrink-0">
          {be && <PriceScale value={be.outcome === "found" || be.outcome === "viableAtZero" ? be.value : null} cap={be.capEur} t={t} />}
          <div className="no-print flex flex-wrap items-center gap-2">
            {!on && (
              <Button size="sm" onClick={onAdd}>
                <Plus aria-hidden />
                {C.show}
              </Button>
            )}
            <button type="button" onClick={onDetails} className="flex w-fit items-center gap-1 text-xs font-medium text-link hover:underline">
              {C.open}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** The price axis €0–40 with the auction cap, the latest round and the break-even price (V04: the cap on the scale). */
function PriceScale({ value, cap, t }: { value: number | null; cap: number; t: BessMessages }) {
  const f = useFormat();
  const S = t.contract.scale;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / MAX) * 100));
  const label = [
    value !== null ? `${S.breakEven} €${f.num(value, 2)}` : null,
    `${S.round} €${f.num(ROUND, 0)}`,
    `${S.cap} €${f.num(cap, 2)}`,
  ].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-muted-foreground">{t.contract.scaleLabel}</div>
      <div className="relative h-14" role="img" aria-label={`${t.contract.scaleLabel}: ${label}`}>
        {value !== null && (
          <div
            className="absolute top-0 whitespace-nowrap text-[11px] font-semibold tabular"
            style={{ left: `${pct(value)}%`, transform: `translateX(-${pct(value)}%)` }}
          >
            {S.breakEven} €{f.num(value, 2)}
          </div>
        )}
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-secondary" />
        <div className="absolute top-6 h-2 rounded-r-full bg-critical/25" style={{ left: `${pct(cap)}%`, right: 0 }} />
        <div className="absolute top-5 h-4 w-0.5 -translate-x-1/2 bg-foreground/60" style={{ left: `${pct(cap)}%` }} />
        <div className="absolute top-5 h-4 w-0.5 -translate-x-1/2 bg-foreground/30" style={{ left: `${pct(ROUND)}%` }} />
        {value !== null && (
          <div className="absolute top-[21px] size-3.5 -translate-x-1/2 rounded-full border-2 border-card bg-[var(--series-6)]" style={{ left: `${pct(value)}%` }} />
        )}
        <div className="absolute top-10 -translate-x-full whitespace-nowrap pr-1 text-[11px] text-muted-foreground tabular" style={{ left: `${pct(ROUND)}%` }}>
          €{f.num(ROUND, 0)} {S.round}
        </div>
        <div className="absolute top-10 whitespace-nowrap pl-1 text-[11px] text-muted-foreground tabular" style={{ left: `${pct(cap)}%` }}>
          {S.cap} €{f.num(cap, 2)}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular">
        <span>€0</span>
        <span>€{MAX}</span>
      </div>
    </div>
  );
}
