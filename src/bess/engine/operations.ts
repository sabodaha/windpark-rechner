// Monthly operations of one case (model-spec §3, §6, §7, §9, §10): cohort degradation, library revenue under the
// scenario's price transformation, capture and fee, operating costs, network tariffs, war risk, lifecycle capex.
// All money is in UAH (the SPV's functional currency); `fx` converts to EUR.
import { toDay } from "@/engine/dates";
import type { Calendar } from "./calendar";
import { paidCapexEur, type CapexBuild } from "./capex";
import { lookup, monthFields, type Library, UnsupportedLibraryInput } from "./library";
import { FX_ANCHOR_2025, fxMonth, hicpIndex, uaCpiIndex } from "./macro";
import { CASE, CAPEX, GRID, OPEX, PRICE_LEVEL_EUR, SPREAD_PATHS, TECH, WAR, type ScenarioId } from "./registry";
import type { BessInputs } from "./types";

export interface OpsSettings {
  scenario: ScenarioId;
  lowerNode: boolean;
  /** Multiplier on the whole spread path (break-even search); 1 in normal runs. */
  spreadScale: number;
  /** Tariff on gross withdrawal from COD, as if the legacy cohort were lost (sensitivity, spec §16). */
  grossTariffFromCod?: boolean;
}

export interface OpsMonth {
  index: number;
  fx: number;
  operating: boolean;
  usableHours: number;
  sohInitial: number;
  importMWh: number;
  exportMWh: number;
  auxMWh: number;
  salesUah: number;
  purchasesUah: number;
  /** Library purchases at base-period prices (UAH), for scaling the liquidity reserve. */
  purchasesHistUah: number;
  pfMarginUah: number;
  capturedUah: number;
  captureLossUah: number;
  optimiserFeeUah: number;
  /** Operating costs paid in the month (O&M, insurance, security, admin, metering, land, market and regulator fees, aux). */
  opexUah: number;
  tariffUah: number;
  warExpectedUah: number;
  insurancePremiumUah: number;
  /** Expected insurance claim recognised when the damage is expected (income); cash follows 9 months later. */
  insuranceClaimAccrualUah: number;
  /** Insurance claim cash received in the month. */
  insurancePayoutUah: number;
  /** State premium compensation recognised with the premium instalment, net of the per-policy fee. */
  stateCompensationAccrualUah: number;
  /** State compensation cash received in the month. */
  stateCompensationUah: number;
  /** VAT on lifecycle capex paid in the month (refunded two months later). */
  lifecycleVatUah: number;
  lifecycleCapexUah: number;
  decommissioningUah: number;
  grossTariffRegime: boolean;
  libraryFeeUah: number;
  /** Peak daily purchases of the node in use, per the whole plant, base-period UAH. */
  peakDayPurchasesUah: number;
}

export interface OpsResult {
  months: OpsMonth[];
  cohortLost: boolean;
  /** The usable energy fell below the library grid and the battery stood idle for the rest of its life. */
  retiredBelowGrid: boolean;
  /** Operating months whose equivalent fee was negative and floored at zero (M01). */
  feeFloorMonths: number;
  unsupported: string | null;
  augmentationUah: number;
}

const yearKey = (table: Record<number, number>, y: number) => table[Math.min(Math.max(y, 2028), 2031)]!;

export function soh(ageYears: number, efc: number, stress: number): number {
  const cal = TECH.calendarFade.coefficient * Math.pow(Math.max(ageYears, 0), TECH.calendarFade.exponent);
  const cyc = TECH.cycleFade.coefficient * Math.pow(Math.max(efc, 0), TECH.cycleFade.exponent);
  return 1 - stress * (cal + cyc);
}

export function runOperations(inp: BessInputs, lib: Library, cal: Calendar, capex: CapexBuild, s: OpsSettings): OpsResult {
  const P = inp.powerMW;
  const meta = lib.manifest.snapshots[inp.snapshot];
  const key = { snapshot: inp.snapshot, duration: inp.durationH, cycleCap: inp.cycleCap, rte: inp.rte };
  const cohortLost = (s.grossTariffFromCod ?? false) || cal.codDay > toDay(CASE.legacyCohortCodCutoff);
  const grossFrom = toDay("2037-05-01");
  const stress = inp.degradationStress ? TECH.degradationStressFactor : 1;
  const elRate = WAR.marketPremium * inp.lossRatio;
  const hit = elRate / WAR.severity;
  const outageDerate = (hit * WAR.downtimeMonths) / 12;
  // replacement value: the dated payment total of the investment less development (spec §8–9, S1.3), indexed from 2026
  const rv2026 = paidCapexEur(capex, (i) => fxMonth(cal.months[i]!.year, cal.months[i]!.month, inp.fxStress)) - capex.developmentEur;
  const usableBoL = capex.usableAcMWh;
  const cohorts = [{ bol: usableBoL, start: cal.codIndex, efc: 0, active: true }];
  const months: OpsMonth[] = [];
  let unsupported: string | null = null;
  let retiredBelowGrid = false;
  let feeFloorMonths = 0;
  let augmentationUah = 0;
  const payouts = new Map<number, number>();
  const compensations = new Map<number, number>();
  const compUsed = new Map<number, number>();

  for (const m of cal.months) {
    const fx = fxMonth(m.year, m.month, inp.fxStress);
    const row: OpsMonth = {
      index: m.index, fx, operating: m.phase === "operation", usableHours: 0, sohInitial: 0, importMWh: 0, exportMWh: 0,
      auxMWh: 0, salesUah: 0, purchasesUah: 0, purchasesHistUah: 0, pfMarginUah: 0, capturedUah: 0, captureLossUah: 0, optimiserFeeUah: 0,
      opexUah: 0, tariffUah: 0, warExpectedUah: 0, insurancePremiumUah: 0, insuranceClaimAccrualUah: 0,
      insurancePayoutUah: payouts.get(m.index) ?? 0, stateCompensationAccrualUah: 0,
      stateCompensationUah: compensations.get(m.index) ?? 0, lifecycleVatUah: 0, lifecycleCapexUah: 0, decommissioningUah: 0,
      grossTariffRegime: false, libraryFeeUah: 0, peakDayPurchasesUah: 0,
    };
    months.push(row);
    if (m.phase === "settlement") {
      if (m.index === cal.months.length - 1) {
        row.decommissioningUah = TECH.decommissioningEurPerKwhUsable2026 * usableBoL * 1000 * (hicpIndex(m.year) / hicpIndex(2026)) * fx;
      }
      continue;
    }
    if (m.phase !== "operation") continue;

    const y = m.year;
    const hicp = hicpIndex(y) / hicpIndex(2026);
    const cpi = uaCpiIndex(y) / uaCpiIndex(2026);
    const cpiMo = uaCpiIndex(y) / uaCpiIndex(2027); // market operator fee: the rate is for 2027 (A02)
    // lifecycle events at the start of the month
    if (inp.augmentation && m.opIndex === TECH.augmentation.monthAfterCod) {
      const addDc = TECH.augmentation.dcShareOfInitial * capex.nameplateDcMWh;
      cohorts.push({ bol: addDc / TECH.nameplateFactor, start: m.index, efc: 0, active: true });
      row.lifecycleCapexUah += addDc * 1000 * TECH.augmentation.priceEurPerKwhDc2026 * hicp * fx;
      augmentationUah = row.lifecycleCapexUah;
    }
    if (m.opIndex === TECH.pcsOverhaul.monthAfterCod) row.lifecycleCapexUah += TECH.pcsOverhaul.eurPerMW2026 * P * hicp * fx;
    // the import VAT relief ends by 2029 at the latest, so later equipment carries recoverable 20 % VAT
    row.lifecycleVatUah = CAPEX.vatRate * row.lifecycleCapexUah;

    // usable energy at the start of the month
    let usable = 0;
    const shares: number[] = [];
    for (const c of cohorts) {
      const h = c.active ? soh((m.index - c.start) / 12, c.efc, stress) : 0;
      if (c.active && h < TECH.minimumOperatingSoH) c.active = false;
      const u = c.active ? c.bol * h : 0;
      shares.push(u);
      usable += u;
      if (c === cohorts[0]) row.sohInitial = c.active ? h : 0;
    }
    row.usableHours = usable / P;

    // scenario path and the import fee in the library's base-period scale
    const mult = s.spreadScale * yearKey(SPREAD_PATHS[s.scenario], y);
    const level = yearKey(PRICE_LEVEL_EUR, y);
    row.grossTariffRegime = cohortLost || m.start >= grossFrom;
    const tdRate = GRID.transmissionDispatchUahPerMWh2027 * (uaCpiIndex(y) / uaCpiIndex(2027));
    const distRate = inp.connection === "dso110kV" ? GRID.distributionClass1UahPerMWh2026 * cpi : 0;
    const tariffRate = tdRate + distRate;
    // Map nominal per-MWh charges onto the library's base-period price scale (spec §6).
    const toBase = (uahPerMWh: number) =>
      inp.pathCurrency === "EUR" ? (uahPerMWh * FX_ANCHOR_2025) / (fx * hicpIndex(y) * mult) : uahPerMWh / (uaCpiIndex(y) * mult);
    if (lib.manifest.version >= 2) {
      // S1.2: in a closed day Σd = RTE·Σc, so a charge on net withdrawal, a uniform price-level shift and a per-MWh fee
      // on both directions are each an exact equivalent of a fee on purchases: one axis carries all of them.
      const shift = inp.pathCurrency === "EUR"
        ? ((level - mult * meta.avgPriceEUR) / mult) * FX_ANCHOR_2025
        : (level * FX_ANCHOR_2025 - mult * meta.avgPriceUAH) / mult;
      const gross = row.grossTariffRegime ? toBase(tariffRate) : 0;
      const net = row.grossTariffRegime ? 0 : toBase(tariffRate);
      const mo = toBase(OPEX.marketOperatorFeeUahPerMWh * cpiMo);
      const raw = gross + (1 - inp.rte) * (net + shift) + (1 + inp.rte) * mo;
      // a negative equivalent fee is floored at zero: a deliberately conservative dispatch proxy, counted (M01)
      if (raw < 0) feeFloorMonths += 1;
      row.libraryFeeUah = Math.max(0, raw);
    } else if (row.grossTariffRegime) {
      row.libraryFeeUah = toBase(tariffRate); // S1.1: only the gross-withdrawal tariff enters the dispatch
    }
    // below the library's lowest usable-energy node the remaining modules are retired: the battery stands idle while
    // its fixed costs continue (spec §5, §7; U11)
    const lowest = lib.manifest.axes.usableHours[String(inp.durationH)]![0]!;
    let lib0 = null;
    if (row.usableHours < lowest - 1e-9) retiredBelowGrid = true;
    else {
      try {
        lib0 = lookup(lib, key, row.usableHours, row.libraryFeeUah, s.lowerNode);
      } catch (e) {
        if (e instanceof UnsupportedLibraryInput) {
          unsupported ??= `${m.year}-${String(m.month).padStart(2, "0")}: ${e.message}`;
          continue;
        }
        throw e;
      }
    }
    const f = lib0 ? monthFields(lib0, m.month) : { salesUAH: 0, purchasesUAH: 0, salesEUR: 0, purchasesEUR: 0, importMWh: 0, exportMWh: 0 };
    const avail = (m.opIndex < 12 ? TECH.availabilityYear1 : TECH.availability) * (1 - outageDerate);
    const I = f.importMWh * P * avail;
    const O = f.exportMWh * P * avail;
    row.importMWh = I;
    row.exportMWh = O;
    row.peakDayPurchasesUah = (lib0?.peakDayPurchasesUAH ?? 0) * P;
    row.purchasesHistUah = f.purchasesUAH * P * avail;

    if (inp.pathCurrency === "EUR") {
      const sh = f.salesEUR * P * avail;
      const ph = f.purchasesEUR * P * avail;
      const shift = level - mult * meta.avgPriceEUR;
      row.salesUah = (mult * sh + shift * O) * hicpIndex(y) * fx;
      row.purchasesUah = (mult * ph + shift * I) * hicpIndex(y) * fx;
    } else {
      const sh = f.salesUAH * P * avail;
      const ph = f.purchasesUAH * P * avail;
      const shift = level * FX_ANCHOR_2025 - mult * meta.avgPriceUAH;
      row.salesUah = (mult * sh + shift * O) * uaCpiIndex(y);
      row.purchasesUah = (mult * ph + shift * I) * uaCpiIndex(y);
    }
    row.pfMarginUah = row.salesUah - row.purchasesUah;
    row.capturedUah = inp.captureFactor * Math.max(row.pfMarginUah, 0) + Math.min(row.pfMarginUah, 0);
    row.captureLossUah = row.pfMarginUah - row.capturedUah;
    row.optimiserFeeUah = inp.optimiserFeeRate * Math.max(row.capturedUah, 0);

    // degradation: delivered energy split by usable share, EFC = 0.9 × AC cycles of the cohort's start-of-life energy
    cohorts.forEach((c, j) => {
      if (usable > 0 && c.active) c.efc += (TECH.efcPerAcCycle * O * (shares[j]! / usable)) / c.bol;
    });

    // costs
    const aux = inp.auxStress ? TECH.auxStressShareOfPower * P * m.days * 24 : 0;
    row.auxMWh = aux;
    const auxPrice = inp.pathCurrency === "EUR" ? level * hicpIndex(y) * fx : level * FX_ANCHOR_2025 * uaCpiIndex(y);
    const withdrawal = row.grossTariffRegime ? I + aux : Math.max(0, I + aux - O);
    row.tariffUah = tariffRate * withdrawal;
    const rvEur = rv2026 * hicp;
    const eur = (v: number) => v * fx;
    row.opexUah =
      eur((OPEX.omEurPerKwYear * P * 1000 * hicp) / 12) +
      eur((OPEX.propertyInsuranceRate * rvEur) / 12) +
      OPEX.securityUahPerMonth * cpi +
      eur((OPEX.spvAdminEurPerYear * hicp) / 12) +
      eur((OPEX.meteringEurPerYear * hicp) / 12) +
      (OPEX.landLeaseEurPerHaYear * OPEX.landHa * CAPEX.bookFxUah * cpi) / 12 +
      OPEX.marketOperatorFeeUahPerMWh * cpiMo * (I + O + aux) +
      OPEX.marketOperatorFeeUahPerMonth * cpiMo +
      OPEX.neurcFeeRate * row.salesUah +
      aux * auxPrice;

    // war risk: expected loss without cover; with insurance the premium, the expected repair and lagged receipts
    if (inp.insurance) {
      row.insurancePremiumUah = eur((WAR.insurancePremiumRate * rvEur) / 12);
      const grossLoss = WAR.severity * rvEur;
      const deductible = Math.max(WAR.deductibleShare * rvEur, WAR.deductibleMinEur);
      row.warExpectedUah = eur((hit / 12) * grossLoss);
      // deductible per event = max(5 % of the replacement value, €250k), applied to the 40 % severity loss
      const payout = eur((hit / 12) * Math.max(0, grossLoss - deductible));
      row.insuranceClaimAccrualUah = payout;
      const due = m.index + WAR.insurancePayoutLagMonths;
      payouts.set(due, (payouts.get(due) ?? 0) + payout);
      if (inp.stateBudgetAvailable) {
        // the UAH 5 m ceiling counts compensation by the calendar year it is paid out; one fee per policy year
        const at = m.index + WAR.stateCompensationLagMonths;
        const receiptYear = cal.months[Math.min(at, cal.months.length - 1)]!.year + Math.max(0, at - (cal.months.length - 1)) / 12;
        const key = Math.floor(receiptYear);
        const used = compUsed.get(key) ?? 0;
        const accrual = Math.max(0, Math.min(((WAR.insurancePremiumRate - 0.01) * rvEur * fx) / 12, WAR.stateCompensationCapUah - used));
        compUsed.set(key, used + accrual);
        row.stateCompensationAccrualUah = accrual;
        compensations.set(at, (compensations.get(at) ?? 0) + accrual);
        if (m.opIndex % 12 === 0) row.opexUah += WAR.stateCompensationFeeUah;
      }
    } else {
      row.warExpectedUah = eur((elRate * rvEur) / 12);
    }
  }
  // receivables falling due after the last month are not collected: the ledger writes them off (no claim recovery
  // beyond the settlement horizon is assumed)
  return { months, cohortLost, unsupported, augmentationUah, retiredBelowGrid, feeFloorMonths };
}
