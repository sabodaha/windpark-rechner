// A synthetic German library of the real shape (axes, fields, manifest) with made-up monthly values, for engine tests
// and smoke runs before or without the real price library. It carries no prices.
import { parseDeLibrary, type DeLibrary, type DeLibraryManifest } from "../../src/bess/de/library";

export function syntheticDeLibrary(): DeLibrary {
  const hours = { "2": [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1], "4": Array.from({ length: 19 }, (_v, i) => Math.round((2.4 + 0.1 * i) * 10) / 10) };
  const fees = Array.from({ length: 11 }, (_v, i) => -15 + 5 * i);
  const snaps = ["DE-2025", "DE-LTM-2026-09"] as const;
  const values: number[] = [];
  for (const s of snaps) for (const d of [2, 4]) for (const cap of [1, 1.5]) for (const rte of [0.85, 0.88, 0.9]) for (const fee of fees) {
    for (const h of hours[String(d) as "2" | "4"]) {
      const act = Math.max(0, 1 - (fee + 15) / 120) * (s === "DE-2025" ? 1 : 1.1);
      for (let m = 0; m < 12; m++) {
        const exp = 30 * Math.min(h, cap * d) * 0.8 * act * (1 + 0.05 * Math.sin(m));
        const imp = exp / rte;
        values.push(exp * 130, imp * 55, imp, exp);
      }
      values.push(h * 95);
    }
  }
  const manifest: DeLibraryManifest = {
    schema: "bess-de-library", market: "DE", currency: "EUR", priceBase: 2025, version: 1, algorithmVersion: 2,
    attribution: "synthetic", license: "synthetic",
    axes: { snapshot: [...snaps], durationHoursBoL: [2, 4], usableHours: hours, cycleCap: [1, 1.5], rte: [0.85, 0.88, 0.9], importFeeEUR: fees },
    nodeOrder: ["snapshot", "durationHoursBoL", "cycleCap", "rte", "importFeeEUR", "usableHours"],
    fields: ["salesEUR", "purchasesEUR", "importMWh", "exportMWh"], months: 12, dtype: "float32", doublesPerNode: 49, nodes: values.length / 49,
    snapshots: {
      "DE-2025": { from: "2025-01-01", to: "2025-12-31", days: 365, hours: 8760, avgPriceEUR: 89.321723, tb2EurPerMw: 84737.505, monthly: [] },
      "DE-LTM-2026-09": { from: "2025-10-01", to: "2026-09-30", days: 365, hours: 8760, avgPriceEUR: 104.045007, tb2EurPerMw: 97716.575, monthly: [] },
    },
    releaseGate: { passed: true },
  };
  return parseDeLibrary(manifest, new Float32Array(values).buffer);
}
