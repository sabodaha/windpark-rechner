// The analyses beyond the scenarios — tornado, bid calculator and the equity IRR by award price — computed the same
// way for the Excel workbook and the PDF report.
import { runModel, solveAwardPrice, tornadoAll, type BidResult, type Inputs, type TornadoBar, type TornadoMetric } from "@/engine";

export interface ModelExtras {
  tornado: Record<TornadoMetric, TornadoBar[]>;
  bid: BidResult;
  bidTarget: number;
  curve: { x: number; y: number | null }[];
}

/** Tornado for every metric, the bid calculator at the cost of equity, and the IRR curve from 3 to 10 ct/kWh. */
export function modelExtras(inputs: Inputs): ModelExtras {
  const target = inputs.macro.costOfEquity;
  const curve: ModelExtras["curve"] = [];
  for (let c = 3; c <= 10.0001; c += 0.25) {
    const copy = structuredClone(inputs);
    copy.revenue.awardPriceCt = Math.round(c * 100) / 100;
    try {
      const r = runModel(copy);
      curve.push({ x: copy.revenue.awardPriceCt, y: r.validity.returnsMeaningful ? r.kpis.equityIrr : null });
    } catch {
      curve.push({ x: copy.revenue.awardPriceCt, y: null });
    }
  }
  return { tornado: tornadoAll(inputs), bid: solveAwardPrice(inputs, target), bidTarget: target, curve };
}
