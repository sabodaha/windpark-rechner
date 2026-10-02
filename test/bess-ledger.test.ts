// Ledger branches that the main cases do not reach (model-spec §11, §17; round-3 review): a DSRA drawn and refilled
// month by month, debt arrears and their repayment, the hryvnia-mode liquidity reserve, and the physical checks.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESS_BASE, parseLibrary, runBess, type LibraryManifest } from "@/bess/engine";
import { buildCalendar } from "@/bess/engine/calendar";
import { buildCapex } from "@/bess/engine/capex";
import { liquidityReserveUah } from "@/bess/engine/funding";
import { runLedger } from "@/bess/engine/ledger";
import { lookup } from "@/bess/engine/library";
import { uaCpiIndex } from "@/bess/engine/macro";
import { runOperations, type OpsResult } from "@/bess/engine/operations";
import { OPEX, PRICE_LEVEL_EUR, SPREAD_PATHS } from "@/bess/engine/registry";

const DIR = "public/bess";
const built = existsSync(`${DIR}/ua-library-v2.json`) && existsSync(`${DIR}/ua-library-v2.bin`);

function load() {
  const manifest = JSON.parse(readFileSync(`${DIR}/ua-library-v2.json`, "utf-8")) as LibraryManifest;
  const bin = readFileSync(`${DIR}/ua-library-v2.bin`);
  return parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
}

describe.runIf(built)("BESS ledger branches", () => {
  const lib = built ? load() : (null as never);
  const base = built ? runBess(BESS_BASE, lib) : (null as never);
  const cal = buildCalendar(0);
  const capex = buildCapex(BESS_BASE.powerMW, BESS_BASE.durationH, BESS_BASE.connection, BESS_BASE.capexFactor);
  const ops = built ? runOperations(BESS_BASE, lib, cal, capex, { scenario: "reference", lowerNode: false, spreadScale: 1 }) : (null as never);
  const plain = built ? runLedger(BESS_BASE, ops, capex, cal, base.funding) : (null as never);
  const jan2030 = cal.months.findIndex((m) => m.year === 2030 && m.month === 1);
  const feb2030 = jan2030 + 1;
  const aug2030 = cal.months.findIndex((m) => m.year === 2030 && m.month === 8);
  const periodAt = (led: ReturnType<typeof runLedger>, monthIndex: number) => led.periods.find((p) => p.lastMonth === monthIndex - 1)!;

  /** The same operations with an extra cost in January 2030 that leaves `leftEur` of the 1 February payment unpaid by cash. */
  function shocked(leftEur: number): OpsResult {
    const s = structuredClone(ops);
    const due = periodAt(plain, feb2030).debtServiceEur;
    const x = s.months[jan2030]!.fx;
    // opening cash of February is the closing cash of January: remove all of it, and `leftEur` of the payment more
    s.months[jan2030]!.opexUah += plain.monthly.cashUah[jan2030]! + (due * leftEur) * x;
    return s;
  }

  it("draws the DSRA when cash falls short, locks dividends and refills it month by month", () => {
    const led = runLedger(BESS_BASE, shocked(0.5), capex, cal, base.funding);
    const p = periodAt(led, feb2030);
    expect(p.dsraDrawEur).toBeGreaterThan(0);
    expect(p.shortfallEur).toBeLessThan(0.01);
    expect(p.lockedUp).toBe(true);
    // after the payment the reserve sits below its target and is topped up from cash until it is full again
    const target = periodAt(led, aug2030).debtServiceEur;
    const dsra = led.monthly.dsraEur;
    expect(dsra[feb2030]!).toBeLessThan(target - 0.01);
    for (let i = feb2030 + 1; i < aug2030; i++) expect(dsra[i]!).toBeGreaterThanOrEqual(dsra[i - 1]! - 1e-9);
    expect(dsra[aug2030 - 1]!).toBeCloseTo(target, 2);
    expect(led.maxBalanceErrorUah).toBeLessThan(1);
  });

  it("keeps unpaid debt service as arrears, blocks dividends until they are repaid", () => {
    // cash three payments deep in the red: the DSRA covers 1 February, nothing is left to refill it, so 1 August
    // goes unpaid; later cash repays the arrears with interest before any dividend
    const led = runLedger(BESS_BASE, shocked(3), capex, cal, base.funding);
    const feb = periodAt(led, feb2030);
    expect(feb.shortfallEur).toBeLessThan(0.01);
    expect(feb.dsraDrawEur).toBeGreaterThan(0);
    const aug = periodAt(led, aug2030);
    expect(aug.shortfallEur).toBeGreaterThan(0);
    const cleared = led.periods.findIndex((p) => p.lastMonth >= aug2030 && p.shortfallEur < 0.01);
    expect(cleared).toBeGreaterThan(-1);
    const clearedMonth = led.periods[cleared]!.lastMonth + 1;
    for (let i = feb2030; i < clearedMonth; i++) expect(led.monthly.divGrossUah[i], `month ${i}`).toBe(0);
    expect(led.arrearsAtEndEur).toBeLessThan(1);
    expect(led.maxBalanceErrorUah).toBeLessThan(1);
  });

  it("sizes the liquidity reserve in hryvnias for a hryvnia spread path (S13-04)", () => {
    const inp = { ...BESS_BASE, pathCurrency: "UAH" as const };
    const node = lookup(lib, { snapshot: inp.snapshot, duration: inp.durationH, cycleCap: inp.cycleCap, rte: inp.rte }, inp.durationH, 0);
    const m = SPREAD_PATHS.reference[2028];
    const peakUah = node.peakDayPurchasesUAH * inp.powerMW;
    const maxImport = (inp.cycleCap * inp.durationH * inp.powerMW) / inp.rte;
    const meanUah = lib.manifest.snapshots[inp.snapshot].avgPriceUAH;
    const expected = 3 * (m * peakUah + Math.max(0, 47.09 * PRICE_LEVEL_EUR[2028] - m * meanUah) * maxImport) * uaCpiIndex(2028) * 1.2 + OPEX.brpGuaranteeUah;
    expect(liquidityReserveUah(inp, lib, cal)).toBeCloseTo(expected, 4);
  });

  it("passes the physical checks in the main cases", () => {
    const cases = [
      base,
      runBess({ ...BESS_BASE, durationH: 4 }, lib),
      runBess({ ...BESS_BASE, durationH: 1 }, lib),
      runBess({ ...BESS_BASE, snapshot: "UA-LTM-2026-09", cycleCap: 1 }, lib),
      runBess({ ...BESS_BASE, pathCurrency: "UAH" }, lib),
    ];
    for (const r of cases)
      for (const id of ["energyBalance", "cycleLimit"]) expect(r.checks.find((c) => c.id === id)!.status, `${id} ${r.inputs.durationH}h`).toBe("pass");
  });
});
