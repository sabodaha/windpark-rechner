// Discounting and IRR on dated cash flows (Act/365, like Excel's XNPV/XIRR).

export interface DatedFlow {
  day: number;
  amount: number;
}

/** Sums flows that fall on the same day and sorts them by date. */
export function consolidate(flows: DatedFlow[]): DatedFlow[] {
  const byDay = new Map<number, number>();
  for (const f of flows) byDay.set(f.day, (byDay.get(f.day) ?? 0) + f.amount);
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, amount]) => ({ day, amount }));
}

export function xnpv(rate: number, flows: DatedFlow[], baseDay: number): number {
  const lr = Math.log1p(rate);
  let sum = 0;
  for (const f of flows) sum += f.amount * Math.exp((-lr * (f.day - baseDay)) / 365);
  return sum;
}

export interface IrrResult {
  /** The economically meaningful root, or null if there is none. */
  rate: number | null;
  /** All roots found in the search interval; more than one means the IRR is ambiguous. */
  roots: number[];
}

const GRID_LOW = -0.95;
const GRID_HIGH = 1.5;
const GRID_STEP = 0.0025;

/**
 * XIRR: brackets every sign change of the NPV on a grid, then refines each root by bisection.
 * With several roots (e.g. a decommissioning outflow at the end) the root where the NPV falls as
 * the rate rises and which lies closest to zero is returned — the usual choice for investment flows.
 */
export function xirr(input: DatedFlow[]): IrrResult {
  const flows = consolidate(input);
  const first = flows[0];
  if (!first || !flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) {
    return { rate: null, roots: [] };
  }
  const base = first.day;
  const f = (r: number) => xnpv(r, flows, base);
  const roots: { rate: number; falling: boolean }[] = [];
  let r0 = GRID_LOW;
  let v0 = f(r0);
  for (let r1 = GRID_LOW + GRID_STEP; r1 <= GRID_HIGH + 1e-12; r1 += GRID_STEP) {
    const v1 = f(r1);
    if (v0 === 0) roots.push({ rate: r0, falling: v1 < 0 });
    else if (v0 * v1 < 0) {
      let lo = r0;
      let hi = r1;
      let vlo = v0;
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const vm = f(mid);
        if (vm === 0 || hi - lo < 1e-13) {
          lo = hi = mid;
          break;
        }
        if (vlo * vm < 0) hi = mid;
        else {
          lo = mid;
          vlo = vm;
        }
      }
      roots.push({ rate: (lo + hi) / 2, falling: v1 < v0 });
    }
    r0 = r1;
    v0 = v1;
  }
  if (roots.length === 0) return { rate: null, roots: [] };
  const falling = roots.filter((r) => r.falling);
  const pool = falling.length > 0 ? falling : roots;
  const best = pool.reduce((a, b) => (Math.abs(b.rate) < Math.abs(a.rate) ? b : a));
  return { rate: best.rate, roots: roots.map((r) => r.rate) };
}

/** Payment per 1 of principal for an annuity of n periods. */
export function annuityFactor(rate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (rate === 0) return 1 / periods;
  return rate / (1 - Math.pow(1 + rate, -periods));
}
