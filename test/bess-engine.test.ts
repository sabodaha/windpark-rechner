// End-to-end runs of the BESS engine on the built Ukrainian library (model-spec §15–§18). The library files are the
// derived public artefacts in public/bess/; the test is skipped while they are not built yet.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESS_BASE, breakEvenSpread, parseLibrary, runBess, type BessResult, type LibraryManifest } from "@/bess/engine";

const DIR = "public/bess";
const VERSION = 2;
const built = existsSync(`${DIR}/ua-library-v${VERSION}.json`) && existsSync(`${DIR}/ua-library-v${VERSION}.bin`);

function load() {
  const manifest = JSON.parse(readFileSync(`${DIR}/ua-library-v${VERSION}.json`, "utf-8")) as LibraryManifest;
  const bin = readFileSync(`${DIR}/ua-library-v${VERSION}.bin`);
  return parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
}

const integrity = (r: BessResult) => r.checks.filter((c) => ["integrity", "funding", "data"].includes(c.group));

describe.runIf(built)("BESS engine on the UA library", () => {
  const lib = built ? load() : (null as never);
  const base = built ? runBess(BESS_BASE, lib) : (null as never);

  it("closes every integrity, funding and data check in the base case", () => {
    for (const c of integrity(base)) expect(c.status, `${c.id} ${c.value ?? ""} ${c.note ?? ""}`).toBe("pass");
  });

  it("sizes the debt on the lender case at the target DSCR or the gearing cap", () => {
    const f = base.funding;
    expect(f.sizingStatus).toBe("converged");
    const lenderDscrs = base.lenderPeriods.filter((p) => p.debtServiceEur > 0).map((p) => p.dscr!);
    const capped = (base.kpis.gearing!.value ?? 0) > 0.6 - 1e-6;
    if (!capped) for (const d of lenderDscrs) expect(d).toBeCloseTo(1.75, 4);
    expect(base.kpis.minDscr!.value!).toBeGreaterThanOrEqual(base.kpis.lenderMinDscr!.value! - 1e-9);
  });

  it("keeps the locked debt in a post-close stress (F19)", () => {
    const stress = runBess({ ...BESS_BASE, codDelayMonths: 3 }, lib, { funding: base.funding });
    expect(stress.funding.debtEur).toBe(base.funding.debtEur);
    expect(stress.checks.find((c) => c.id === "cohortLost")!.status).toBe("warning");
  });

  it("runs the no-debt variant with all equity", () => {
    const nd = runBess({ ...BESS_BASE, debt: false }, lib);
    expect(nd.funding.debtEur).toBe(0);
    for (const c of integrity(nd)) expect(c.status, c.id).toBe("pass");
  });

  // Anchors from the independent reference implementation (frozen 2 Oct 2026) with the acceptance tolerances of
  // model-spec §18: the engine must keep matching it after any change.
  it("matches the independent reference on the base case", () => {
    const k = base.kpis;
    expect(k.investorIrr!.status).toBe("valid");
    expect(Math.abs(k.investorIrr!.value! - -0.0688346474)).toBeLessThan(0.0005);
    expect(Math.abs(k.investorNpv!.value! - -16_769_492.46)).toBeLessThan(10_000);
    expect(Math.abs(k.debtEur!.value! - 4_057_305.89)).toBeLessThan(4_057.31);
    expect(Math.abs(k.lcos!.value! - 209.2822)).toBeLessThan(209.2822 * 0.005);
    expect(Math.abs(k.minDscr!.value! - 2.4124)).toBeLessThan(0.01);
    expect(k.projectIrrPreTax!.status).toBe("notDefined");
    expect(k.projectIrrPostTax!.status).toBe("notDefined");
    expect(Math.abs(k.projectNpv!.value! - -11_767_209.92)).toBeLessThan(10_000);
    const be = breakEvenSpread(BESS_BASE, lib, base.funding);
    expect(be.status).toBe("found");
    expect(Math.abs(be.value! - 1.962598)).toBeLessThan(0.005);
  });

  it("funds construction net of the VAT refunded in the COD month (M09)", () => {
    const nd = runBess({ ...BESS_BASE, debt: false }, lib);
    expect(Math.abs(nd.kpis.equityEur!.value! - 23_814_390.54)).toBeLessThan(5);
    expect(nd.kpis.minDscr!.value).toBeNull();
    expect(nd.kpis.avgDscr!.value).toBeNull();
  });

  it("reports every IRR root (M10)", () => {
    const ltm = runBess({ ...BESS_BASE, snapshot: "UA-LTM-2026-09" }, lib, { funding: base.funding });
    for (const key of ["projectIrrPreTax", "projectIrrPostTax"] as const) {
      expect(ltm.kpis[key]!.status).toBe("ambiguous");
      expect(ltm.kpis[key]!.value).toBeNull();
      expect(ltm.kpis[key]!.roots!.length).toBe(2);
    }
    expect(Math.abs(ltm.kpis.projectIrrPreTax!.roots![0]! - -0.400863)).toBeLessThan(0.0005);
    expect(Math.abs(ltm.kpis.projectIrrPreTax!.roots![1]! - 0.033386)).toBeLessThan(0.0005);
  });

  it("prints the base-case KPIs", () => {
    const k = Object.fromEntries(Object.entries(base.kpis).map(([n, m]) => [n, m.value === null ? null : Number(m.value.toFixed(4))]));
    const be = breakEvenSpread(BESS_BASE, lib, base.funding);
    console.log(JSON.stringify({ kpis: k, breakEven: be, funding: { debt: base.funding.debtEur, dsra: base.funding.dsraInitialEur, liq: base.funding.liquidityReserveUah, it: base.funding.iterations } }, null, 1));
    console.log(base.annual.map((a) => [a.year, Math.round(a.netRevenueEur / 1e3), Math.round(a.opexEur / 1e3), Math.round(a.tariffsEur / 1e3), Math.round(a.warExpectedEur / 1e3), Math.round(a.cfadsEur / 1e3), Math.round(a.debtServiceEur / 1e3), Math.round(a.investorNetEur / 1e3), a.sohInitial.toFixed(3)].join(" ")).join("\n"));
    expect(base.returnsMeaningful).toBe(true);
  });
});
