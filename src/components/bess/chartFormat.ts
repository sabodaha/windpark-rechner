import type { Format } from "@/lib/format";

/** Charts plot € amounts in millions: the tooltip shows "€1.25m", the axis plain numbers (the title gives the unit). */
export function millions(f: Format) {
  return {
    m: (v: number) => v / 1e6,
    tip: (v: number) => f.meur(v * 1e6, 2),
    axis: (v: number) => f.num(v, Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0),
  };
}
