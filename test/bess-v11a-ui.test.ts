// v1.1a in the calculator (spec v1.1 §3, §12, §15): the contract's inputs and their link format, the award following
// the battery's duration, and what the page shows — p* on its disclosed template, C_max, the award's summary, and the
// contract's sensitivity drivers, where a setting the battery cannot hold is a status rather than a number.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BESS_BASE, parseLibrary, runBess, type BessInputs, type LibraryManifest } from "@/bess/engine";
import { BESS_CONTRACT_DRIVERS, BESS_DRIVERS, BESS_VARIANTS, bessTornado } from "@/bess/engine/sensitivity";
import { BESS_FIELDS, type BessFieldValue } from "@/bess/fields";
import { decodeBessInputs, encodeBessInputs } from "@/bess/url-state";
import { computePStar } from "@/bess/view";

const built = existsSync("public/bess/ua-library-v2.bin");
const load = () => {
  const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
  const bin = readFileSync("public/bess/ua-library-v2.bin");
  return parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
};
const field = (id: string) => BESS_FIELDS.find((f) => f.id === id)!;
const set = (inp: BessInputs, id: string, v: BessFieldValue) => field(id).set(inp, v);
const withContract = set(BESS_BASE, "ctr", true);

describe("contract inputs", () => {
  it("are off in the base case and add nothing to its link", () => {
    expect(field("ctr").get(BESS_BASE)).toBe(false);
    expect(BESS_BASE.contract).toBeUndefined();
    expect(encodeBessInputs(BESS_BASE, BESS_BASE)).toBe("");
    expect(encodeBessInputs(withContract, BESS_BASE)).toBe("ctr=1");
  });

  it("the award follows the duration while at its preset and stays when set by hand (V03)", () => {
    expect(withContract.contract!.acceptedMW).toBe(40);
    expect(set(withContract, "dur", "4").contract!.acceptedMW).toBe(45);
    expect(set(withContract, "dur", "1").contract!.acceptedMW).toBe(20);
    expect(set(set(withContract, "cmw", 30), "dur", "4").contract!.acceptedMW).toBe(30);
    // without a contract the shown award follows too, and the link stays clean
    expect(field("cmw").get(set(BESS_BASE, "dur", "4"))).toBe(45);
    expect(encodeBessInputs(set(BESS_BASE, "dur", "4"), BESS_BASE)).toBe("dur=4");
    expect(encodeBessInputs(set(set(BESS_BASE, "dur", "4"), "ctr", true), BESS_BASE)).toBe("dur=4&ctr=1");
  });

  it("links bring back the same contract whatever the order of setting", () => {
    const cases = [
      set(set(withContract, "cmw", 30), "dur", "4"),
      set(set(set(BESS_BASE, "dur", "4"), "ctr", true), "cmw", 40),
      set(set(withContract, "dur", "1"), "cpr", 21.5),
      set(set(set(withContract, "cren", true), "crp", 19), "chit", "suspended"),
      set(set(set(withContract, "cbsp", true), "clag", "24"), "cnet", true),
    ];
    for (const inp of cases) {
      const q = encodeBessInputs(inp, BESS_BASE);
      const back = decodeBessInputs(q, BESS_BASE)!;
      expect(back.contract, q).toEqual(inp.contract);
      expect(back.durationH, q).toBe(inp.durationH);
    }
  });

  it("the second contract's price follows the first until set apart (spec §17)", () => {
    const moved = set(set(withContract, "cren", true), "cpr", 20);
    expect(moved.contract!.renewalPrice).toBe(20);
    expect(encodeBessInputs(moved, BESS_BASE)).toBe("ctr=1&cpr=20&cren=1");
    const apart = set(moved, "crp", 18);
    expect(set(apart, "cpr", 22).contract!.renewalPrice).toBe(18);
    expect(encodeBessInputs(apart, BESS_BASE)).toBe("ctr=1&cpr=20&cren=1&crp=18");
  });

  it("whole MW and months are rounded; the balancing switches set both sides", () => {
    expect(set(withContract, "cmw", 40.6).contract!.acceptedMW).toBe(41);
    expect(set(withContract, "cten", 24.4).contract!.tenorMonths).toBe(24);
    const bsp = set(withContract, "cbsp", true).contract!;
    expect([bsp.balancingPremiumUp, bsp.balancingPremiumDown]).toEqual([0.6, 0.875]);
    expect(set(withContract, "cnet", true).contract!.settlementRegime).toBe("noOffset");
  });

  it("the contract's details are hidden while it is off", () => {
    for (const f of BESS_FIELDS.filter((x) => x.group === "contract" || x.group === "contractOps")) {
      if (f.id === "ctr") continue;
      expect(f.hidden?.(BESS_BASE), f.id).toBe(true);
    }
  });
});

describe.runIf(built)("what the page shows for the contract", () => {
  const lib = load();

  it("p* of the base case: the default 40 MW award from March 2028, above the auction cap (P01)", () => {
    const p = computePStar(BESS_BASE, lib);
    expect(p.template).toEqual({ own: false, acceptedMW: 40, tenorMonths: 60, start: "2028-03-01" });
    expect(p.breakEven.outcome).toBe("found");
    expect(Math.abs(p.breakEven.value! - 30.96445)).toBeLessThan(0.05);
    expect(p.breakEven.admissibility).toBe("aboveAuctionCap");
    expect(p.breakEven.candidates).toHaveLength(41);
    expect(p.cMax).toBe(45);
  }, 120_000);

  it("the award's summary and the yearly contract cash; neither without a contract", () => {
    const r = runBess(withContract, lib);
    expect(r.status.primary).toBe("ok");
    const s = r.contract!.summary;
    expect(s.acceptedMW).toBe(40);
    expect(s.escrowPeakEur).toBeCloseTo(30_000 * 40, 6); // posted in the auction month at that month's rate
    expect(s.sigmaStarMax).toBeCloseTo((40 * 1.1) / 50, 12); // σ_P = C(1 + ρ)/P binds in the base case
    expect(s.recoveryHoursUp).toBeCloseTo(1 / (0.85 * 0.1), 9);
    expect(s.recoveryHoursDown).toBeCloseTo((0.85 * 1) / 0.1, 9);
    expect(s.quotaUseMax).toBeGreaterThan(0);
    expect(s.quotaUseMax).toBeLessThanOrEqual(1);
    // σ_a = 1 − σ·Z − τ: at least 1 − σ*, more as mass hit or lost returns to trading (Z < 1)
    expect(s.daShare2029!).toBeGreaterThan(1 - s.sigmaStarMax - 1e-9);
    expect(s.daShare2029!).toBeLessThan(1);
    expect(r.annual.every((a) => a.contractNetEur !== undefined)).toBe(true);
    const plain = runBess(BESS_BASE, lib);
    expect(plain.contract).toBeUndefined();
    expect(plain.annual.some((a) => "contractNetEur" in a)).toBe(false);
  }, 60_000);

  it("the tornado adds the contract's drivers only with a contract; unsupported settings are statuses (§15)", () => {
    const plain = runBess(BESS_BASE, lib);
    expect(bessTornado(BESS_BASE, lib, plain.funding).bars.map((b) => b.id).sort()).toEqual(BESS_DRIVERS.map((d) => d.id).sort());
    const r = runBess(withContract, lib);
    const tor = bessTornado(withContract, lib, r.funding);
    expect(tor.bars.map((b) => b.id).sort()).toEqual([...BESS_DRIVERS, ...BESS_CONTRACT_DRIVERS].map((d) => d.id).sort());
    // 1.5 h of full activation each way needs 3 h of energy per MW awarded: more than a 2-hour battery has
    const sustain = tor.bars.find((b) => b.id === "cSustain")!;
    expect(sustain.high.status).toBe("physicallyUnsupported");
    expect(sustain.high.npv).toBeNull();
    const price = tor.bars.find((b) => b.id === "cPrice")!;
    expect(price.low!.npv!).toBeLessThan(tor.base.npv!);
    expect(price.high.npv!).toBeGreaterThan(tor.base.npv!);
  }, 120_000);

  it("the duration variants move the award with its preset", () => {
    const four = BESS_VARIANTS.find((v) => v.id === "fourHours")!.patch(withContract);
    expect(four.contract!.acceptedMW).toBe(45);
    const own = set(withContract, "cmw", 30);
    expect(BESS_VARIANTS.find((v) => v.id === "fourHours")!.patch(own).contract).toBeUndefined();
  });
});
