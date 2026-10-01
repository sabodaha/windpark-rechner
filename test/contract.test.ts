// One contract for the calculator, the report and the workbook (review R36): the engine's ModelSnapshot. The
// calculator and the report read it without the trace, the workbook with it, after rounding the inputs to what it
// stores; the report and the workbook receive the screen's inputs through a link or the download.
import { describe, expect, it } from "vitest";
import { BASE_CASE, buildSnapshot, SCENARIOS, type ModelResult } from "../src/engine";
import { FIELDS, withField } from "../src/lib/fields";
import { encodeInputs, decodeInputs, ignoredParams } from "../src/lib/url-state";
import { canonicalInputs } from "../src/lib/workbook/build";
import { VARIANTS } from "../scripts/workbook/variants";

const withoutTrace = ({ trace: _trace, ...rest }: ModelResult) => rest;

describe("one snapshot for calculator, report and workbook", () => {
  it("is frozen: no consumer can change the numbers another one shows", () => {
    const s = buildSnapshot(BASE_CASE, { trace: false });
    expect(Object.isFrozen(s.scenarios.base.kpis)).toBe(true);
    expect(Object.isFrozen(s.inputs.revenue)).toBe(true);
    expect(s.scenarios.base.trace).toBeUndefined();
  });

  it("without the trace it gives the workbook's numbers, for every variant whose inputs the workbook stores as they are", () => {
    let compared = 0;
    for (const [name, inputs] of Object.entries(VARIANTS)) {
      if (JSON.stringify(canonicalInputs(inputs)) !== JSON.stringify(inputs)) continue;
      const screen = buildSnapshot(inputs, { trace: false });
      const workbook = buildSnapshot(canonicalInputs(inputs));
      expect(workbook.inputHash, name).toBe(screen.inputHash);
      for (const s of SCENARIOS) expect(withoutTrace(workbook.scenarios[s]), `${name} ${s}`).toEqual(withoutTrace(screen.scenarios[s]));
      compared++;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it("a link carries the inputs on screen to the report: every field, and the same results", () => {
    // Inputs as the screen can set them: random values of random fields, at each field's precision.
    let seed = 20261001;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let compared = 0;
    for (let n = 0; n < 60; n++) {
      let inputs = BASE_CASE;
      for (const f of FIELDS) {
        if (f.virtual || rnd() > 0.3) continue;
        if (f.kind === "switch") inputs = withField(inputs, f, rnd() < 0.5);
        else if (f.kind === "select") inputs = withField(inputs, f, f.options![Math.floor(rnd() * f.options!.length)]!);
        else if (f.kind === "number" && f.min !== undefined && f.max !== undefined) {
          const lo = f.usual?.[0] ?? f.min;
          const hi = f.usual?.[1] ?? f.max;
          const step = 10 ** -(f.decimals ?? 2);
          inputs = withField(inputs, f, Math.round((lo + rnd() * (hi - lo)) / step) * step / (f.scale ?? 1));
        }
      }
      let screen;
      try {
        screen = buildSnapshot(inputs, { trace: false });
      } catch {
        continue; // a combination the calculator rejects with a message
      }
      const query = encodeInputs(inputs, BASE_CASE);
      expect(ignoredParams(query), query).toEqual([]);
      const back = query ? decodeInputs(query, BASE_CASE)! : BASE_CASE;
      for (const f of FIELDS) {
        if (f.virtual) continue;
        const [a, b] = [f.get(inputs), f.get(back)];
        if (typeof a === "number" && typeof b === "number") expect(Math.abs(a - b), `${f.id} ${query}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(a)));
        else expect(b, `${f.id} ${query}`).toEqual(a);
      }
      const report = buildSnapshot(back, { trace: false });
      for (const s of SCENARIOS) {
        const [x, y] = [screen.scenarios[s].kpis, report.scenarios[s].kpis];
        expect(Math.abs((x.equityIrr ?? 0) - (y.equityIrr ?? 0)), `${s} ${query}`).toBeLessThan(1e-9);
        expect(Math.abs(x.npvEquity - y.npvEquity), `${s} ${query}`).toBeLessThan(0.01);
        expect(Math.abs(x.debt - y.debt), `${s} ${query}`).toBeLessThan(0.01);
      }
      compared++;
    }
    expect(compared).toBeGreaterThan(20);
  });
});
