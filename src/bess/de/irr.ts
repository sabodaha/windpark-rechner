// IRR of the German pack: the shared scan of engine/irr.ts (spec R2.4 K1) with the gate-3 amendment for steep roots.
// A project cash flow that ends in an outflow (decommissioning) also has a root at a deeply negative rate, where the NPV is
// so steep that a bracket of 1e-13 still leaves a residual of tens of euros: whether that real root passed the €1 check
// came down to floating-point detail. Here bisection goes on past 1e-13 while the residual is €1 or more and the bracket
// can still be halved, and a root is kept if |NPV| < max(€1, 1e-12 × the sum of the absolute discounted flows). For an
// ordinary root both rules stop at the same point with €1, so the shared solver and this one agree bit for bit; the
// shared file stays as it is for the Ukrainian model.
import { consolidate, xnpv, type DatedFlow } from "@/engine/finance";
import type { Metric } from "../engine/types";

const LOW = -0.99;
const HIGH = 10;
const RATE_TOLERANCE = 1e-7;
const RESIDUAL_EUR = 1;
const PROTOCOL_WIDTH = 1e-13;
const SCALE_SHARE = 1e-12;

/** The shared grid: fine steps on the negative side (accumulated), geometric steps above zero. */
const GRID: number[] = (() => {
  const g: number[] = [];
  for (let r = LOW; r < 0; r += 0.0025) g.push(r);
  for (let k = 0; k <= 400; k++) g.push(Math.pow(1 + HIGH, k / 400) - 1);
  return g;
})();

export function deIrrRoots(input: DatedFlow[]): number[] {
  const flows = consolidate(input);
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return [];
  const base = flows[0]!.day;
  const npv = (r: number) => xnpv(r, flows, base);
  const scale = (r: number) => {
    const lr = Math.log1p(r);
    let s = 0;
    for (const f of flows) s += Math.abs(f.amount) * Math.exp((-lr * (f.day - base)) / 365);
    return s;
  };
  const roots: number[] = [];
  const keep = (root: number) => {
    const tolerance = Math.max(RESIDUAL_EUR, SCALE_SHARE * scale(root));
    if (Math.abs(npv(root)) < tolerance && (roots.length === 0 || Math.abs(root - roots[roots.length - 1]!) > RATE_TOLERANCE)) roots.push(root);
  };
  let r0 = GRID[0]!;
  let v0 = npv(r0);
  for (let k = 1; k < GRID.length; k++) {
    const r1 = GRID[k]!;
    const v1 = npv(r1);
    if (v0 === 0) keep(r0);
    else if (v1 !== 0 && v0 * v1 < 0) {
      let lo = r0;
      let hi = r1;
      let vlo = v0;
      for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2;
        if (!(mid > lo && mid < hi)) break;
        if (hi - lo <= PROTOCOL_WIDTH && Math.abs(npv(mid)) < RESIDUAL_EUR) break;
        const vm = npv(mid);
        if (vm === 0) {
          lo = hi = mid;
          break;
        }
        if (vlo * vm < 0) hi = mid;
        else {
          lo = mid;
          vlo = vm;
        }
      }
      keep((lo + hi) / 2);
    }
    r0 = r1;
    v0 = v1;
  }
  if (v0 === 0) keep(r0);
  return roots;
}

/** IRR as a metric with its status and roots; `unfunded` when the case runs out of cash (no return is shown). */
export function deIrrMetric(flows: DatedFlow[], funded = true): Metric {
  const roots = deIrrRoots(flows);
  if (!funded) return { value: null, status: "unfunded", roots };
  if (roots.length === 0) return { value: null, status: "notDefined", roots };
  if (roots.length > 1) return { value: null, status: "ambiguous", roots };
  return { value: roots[0]!, status: "valid", roots };
}
