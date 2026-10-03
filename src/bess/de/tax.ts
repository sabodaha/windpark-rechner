// German corporate taxes of the storage GmbH (spec v1.2 R2.1 §6.2): the rules of the wind farm's `computeTaxes` (rates,
// separate KSt and GewSt loss pools, the § 8 Nr. 1 add-back) for a GmbH, without rounding the trade income down to
// €100. The rounding (§ 11 (1) GewStG) moves tax by at most €14 a year but makes tax a step function of debt and toll
// price, so the sizing iteration and the T* search could not converge to their tolerances (found in the engine run).
import { corporateLossShare, corporateTaxRate, offsetLosses, TAX } from "@/engine/tax";

export interface DeTaxYearIn {
  year: number;
  ebt: number;
  interest: number;
  lease: number;
}

export interface DeTaxYearOut {
  year: number;
  addBack: number;
  gewIncome: number;
  gewPoolOpen: number;
  gewLossUsed: number;
  gewPoolClose: number;
  gewBase: number;
  gewSt: number;
  kstPoolOpen: number;
  kstLossUsed: number;
  kstPoolClose: number;
  kstTaxable: number;
  kstRate: number;
  kst: number;
  soli: number;
}

export function deTaxes(years: DeTaxYearIn[], hebesatz: number): DeTaxYearOut[] {
  let gPool = 0;
  let kPool = 0;
  return years.map((y) => {
    const addBack = TAX.addBackShare * Math.max(0, y.interest + TAX.immovableLeaseShare * y.lease - TAX.addBackAllowance);
    const gewIncome = y.ebt + addBack;
    const gOpen = gPool;
    const g = offsetLosses(gewIncome, gPool, TAX.tradeTaxLossShare);
    const gUsed = gewIncome > 0 ? gPool - g.pool : 0;
    gPool = g.pool;
    const kOpen = kPool;
    const k = offsetLosses(y.ebt, kPool, corporateLossShare(y.year));
    const kUsed = y.ebt > 0 ? kPool - k.pool : 0;
    kPool = k.pool;
    const rate = corporateTaxRate(y.year);
    const kst = k.taxable * rate;
    return {
      year: y.year, addBack, gewIncome, gewPoolOpen: gOpen, gewLossUsed: gUsed, gewPoolClose: gPool, gewBase: g.taxable,
      gewSt: g.taxable * TAX.tradeTaxBaseRate * hebesatz, kstPoolOpen: kOpen, kstLossUsed: kUsed, kstPoolClose: kPool,
      kstTaxable: k.taxable, kstRate: rate, kst, soli: kst * TAX.soli,
    };
  });
}
