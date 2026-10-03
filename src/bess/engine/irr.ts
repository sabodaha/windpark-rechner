// IRR with every root reported (registry ENGINE: domain from −0.99 up to 10, rate tolerance 1e-7, NPV residual
// below €1). One root is `valid`, several `ambiguous`, none `notDefined` — which is not 0 % (spec §15, N16, M10).
import { consolidate, xnpv, type DatedFlow } from "@/engine/finance";
import type { Metric } from "./types";

const LOW = -0.99;
const HIGH = 10;
const RATE_TOLERANCE = 1e-7;
const RESIDUAL_EUR = 1;

/** Search grid: fine steps on the negative side, geometric steps above zero (where NPV changes slowly). */
const GRID: number[] = (() => {
  const g: number[] = [];
  for (let r = LOW; r < 0; r += 0.0025) g.push(r);
  for (let k = 0; k <= 400; k++) g.push(Math.pow(1 + HIGH, k / 400) - 1);
  return g;
})();

/** All roots in the domain: a grid node where the NPV is exactly zero is itself a root (the last node included); an
 *  interval with a strict sign change is refined by bisection. A root is kept only if its dated NPV residual is below
 *  €1 and it lies more than the rate tolerance above the previous one. */
export function irrRoots(input: DatedFlow[]): number[] {
  const flows = consolidate(input);
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return [];
  const base = flows[0]!.day;
  const npv = (r: number) => xnpv(r, flows, base);
  const roots: number[] = [];
  const keep = (root: number) => {
    if (Math.abs(npv(root)) < RESIDUAL_EUR && (roots.length === 0 || Math.abs(root - roots[roots.length - 1]!) > RATE_TOLERANCE)) roots.push(root);
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
      for (let it = 0; it < 200 && hi - lo > 1e-13; it++) {
        const mid = (lo + hi) / 2;
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
export function irrMetric(flows: DatedFlow[], funded = true): Metric {
  const roots = irrRoots(flows);
  if (!funded) return { value: null, status: "unfunded", roots };
  if (roots.length === 0) return { value: null, status: "notDefined", roots };
  if (roots.length > 1) return { value: null, status: "ambiguous", roots };
  return { value: roots[0]!, status: "valid", roots };
}
