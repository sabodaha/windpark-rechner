// Diagnostics of the revenue stack (spec R3.1): the base case with the stack against day-ahead only — KPIs, the annual
// opportunity rule, the 2029 bridge and the lifetime market revenue (gate 1b). Usage: npx tsx scripts/bess/diag-de-stack.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { kOfCase, runDe, tStarOfCase } from "../../src/bess/de/index";
import { parseDeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";
import { DE_BASE, DE_VARIANTS } from "../../src/bess/de/registry";
import type { DeInputs } from "../../src/bess/de/types";

const libDir = "public/bess";
const manifest = JSON.parse(readFileSync(join(libDir, "de-library-v1.json"), "utf-8")) as DeLibraryManifest;
const bin = readFileSync(join(libDir, "de-library-v1.bin"));
const lib = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const full = process.argv.includes("--full");

const m = (v: number | null | undefined) => (v == null ? "—" : `${(v / 1e6).toFixed(2)}m`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(2)} %`);
const lifetime = (r: ReturnType<typeof runDe>) => r.ops!.months.reduce((s, o) => s + o.marketNetEur, 0);

function show(name: string, inp: DeInputs) {
  const r = runDe(inp, lib);
  const da = runDe({ ...inp, stackEnabled: false }, lib);
  const k = r.kpis!;
  const line = [name.padEnd(28), r.status.primary, `NPV ${m(k.investorNpvEur!.value)}`, `IRR ${pct(k.investorIrr!.value)} ${k.investorIrr!.status}`,
    `debt ${m(r.funding!.debtEur)}`, `rev2029/MW ${Math.round(k.revenue2029PerMwEur!.value!)}`,
    `market life ${m(lifetime(r))} vs DA ${m(lifetime(da))} = ${(lifetime(r) / lifetime(da)).toFixed(4)}`];
  if (full) {
    const t = tStarOfCase(inp, lib);
    const kk = inp.tollEnabled ? null : kOfCase(inp, lib);
    line.push(`T* ${t.outcome} ${t.value?.toFixed(0) ?? ""}`, kk ? `k ${kk.status} ${kk.value?.toFixed(4) ?? ""}` : "");
  }
  console.log(line.join(" | "));
  console.log("  warn/fail:", r.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => `${c.id}=${c.status}(${c.value})`).join(", ") || "none");
  if (r.stack) {
    console.log("  reserve start", r.cal!.months[r.stack.reserveStartIndex]!.year, r.cal!.months[r.stack.reserveStartIndex]!.month);
    console.log("  rule:", r.stack.years.filter((y) => y.activeMonths > 0).map((y) => `${y.year}:${y.held ? "A" : "w"} a=${Math.round(y.oppReserveEurPerMw)} w=${Math.round(y.oppWholesaleEurPerMw)} R=${y.multiplier}`).join("; "));
    const b = r.stack.revenue2029Bridge;
    console.log("  bridge 2029/MW:", Object.entries(b).map(([key, v]) => `${key} ${Math.round(v)}`).join(", "), "sum", Math.round(b.tollEur + b.dayAheadEur + b.intradayEur + b.afrrEur + b.feeEur));
    const y30 = r.ops!.months.filter((o) => r.cal!.months[o.index]!.year === 2030).reduce((s, o) => s + o.marketNetEur + o.tollFeeAccruedEur, 0) / inp.powerMW;
    console.log("  revenue 2030 per MW (toll + market)", Math.round(y30));
  }
}

show("base stack-central", DE_BASE);
show("stack-fast", { ...DE_BASE, reservePath: "fast" });
show("stack-slow", { ...DE_BASE, reservePath: "slow" });
show("dayahead", { ...DE_BASE, stackEnabled: false });
show("merchant stack-central", { ...DE_BASE, ...DE_VARIANTS.merchant });
show("merchant dayahead", { ...DE_BASE, ...DE_VARIANTS.merchant, stackEnabled: false });
show("afrrShare 0 (ID only)", { ...DE_BASE, afrrShare: 0 });
show("u = 0", { ...DE_BASE, intradayUplift: 0 });
show("activation 0.2", { ...DE_BASE, activationShare: 0.2 });
