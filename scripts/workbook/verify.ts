// Verification of the formula workbook against the engine.
//   npx tsx scripts/workbook/verify.ts build <dir> [variant…]   write <variant>.xlsx (with cached results),
//                                                            <variant>.nocache.xlsx and <variant>.manifest.json
//   npx tsx scripts/workbook/verify.ts compare <dir> [variant…] compare <variant>.recalc.xlsx (the no-cache copy
//                                                            after a forced recalculation in a spreadsheet
//                                                            application) with the manifest and with the caches
// Recalculate with scripts/workbook/recalc.ps1 (Microsoft Excel via COM) between the two steps.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { BASE_CASE, buildSnapshot, type Inputs } from "../../src/engine";
import { decodeInputs } from "../../src/lib/url-state";
import { buildFormulaWorkbook, canonicalInputs, workbookExtras } from "../../src/lib/workbook/build";
import type { ManifestEntry } from "../../src/lib/workbook/grid";
import { en } from "../../src/messages/en";

const edit = (fn: (c: Inputs) => void): Inputs => {
  const c = structuredClone(BASE_CASE);
  fn(c);
  return c;
};

/** Switch variants: every value of every switch at least once, and the cases the reviews asked for. */
export const VARIANTS: Record<string, Inputs> = {
  base: BASE_CASE,
  gmbh: edit((c) => (c.tax.legalForm = "GmbH")),
  annuity: edit((c) => (c.financing.repayment = "annuity")),
  sculpted: edit((c) => (c.financing.repayment = "sculpted")),
  bankBase: edit((c) => (c.revenue.bankPriceBasis = "base")),
  twoSided: edit((c) => (c.revenue.twoSidedPremium = true)),
  ppa: edit((c) => (c.revenue.postEeg = "ppa")),
  noMunicipalAfter: edit((c) => (c.revenue.municipalAfterEeg = false)),
  equityFirst: edit((c) => (c.financing.equityFirst = true)),
  degressive: edit((c) => {
    c.tax.degressive = true;
    c.project.financialClose = "2026-04-01";
    c.revenue.awardNoticeDate = "2026-01-15";
    c.financing.graceYears = 2;
  }),
  south: edit((c) => {
    c.energy.southRegion = true;
    c.energy.siteQuality = 0.55;
  }),
  lowPrice: edit((c) => (c.revenue.longTermBaseEurMwh2026 = 50)),
  lockup: edit((c) => {
    c.revenue.longTermBaseEurMwh2026 = 55;
    c.financing.lockupDscr = 1.6;
  }),
  gearingCap: edit((c) => (c.financing.maxGearing = 0.3)),
  grace2: edit((c) => (c.financing.graceYears = 2)),
  fcJuly: edit((c) => (c.project.financialClose = "2027-07-01")),
  construction12: edit((c) => {
    c.project.constructionMonths = 12;
    c.financing.graceYears = 1;
  }),
  construction24: edit((c) => (c.project.constructionMonths = 24)),
  life30: edit((c) => (c.project.lifetimeYears = 30)),
  vatLag0: edit((c) => (c.capex.vatRefundLagMonths = 0)),
  vatLag6: edit((c) => (c.capex.vatRefundLagMonths = 6)),
  dsra6: edit((c) => (c.financing.dsraMonths = 6)),
  lag15: edit((c) => {
    c.revenue.premiumTrueUpLagMonths = 15;
    c.revenue.longTermBaseEurMwh2026 = 50;
  }),
  depYears30: edit((c) => (c.tax.depreciationYears = 30)),
  mixed: edit((c) => {
    c.tax.legalForm = "GmbH";
    c.financing.repayment = "sculpted";
    c.revenue.bankPriceBasis = "base";
    c.revenue.postEeg = "ppa";
    c.financing.equityFirst = true;
    c.revenue.municipalCtKwh = 0.5;
    c.opex.gridFeePerKw2026 = 5.5;
  }),
  // Second review (1 Oct 2026): no loan, no cash, negative returns, edges of the loan and of the model's scope.
  gmbhSculpted: edit((c) => {
    c.tax.legalForm = "GmbH";
    c.financing.repayment = "sculpted";
  }),
  zeroDebt: edit((c) => (c.financing.maxGearing = 0)),
  noCashDebt: edit((c) => {
    c.revenue.longTermBaseEurMwh2026 = 20;
    c.revenue.awardPriceCt = 2;
  }),
  closureGap: edit((c) => {
    c.opex.decommissioningCostPerKw2026 = 100;
    c.opex.decommissioningReserveYears = 1;
  }),
  unfundedTwoSided: edit((c) => {
    c.revenue.twoSidedPremium = true;
    c.opex.gridFeePerKw2026 = 50;
  }),
  negativeIrr: edit((c) => {
    c.revenue.awardPriceCt = 4.2;
    c.revenue.longTermBaseEurMwh2026 = 45;
    c.financing.maxGearing = 0.5;
  }),
  sculptedEdge: decodeInputs(
    "om1=22.4&om2=25.6&om3=28.16&mg1=6.4&mg2=8&mg3=8&in1=1.6&in2=1.6&in3=1.6&ot1=9.6&ot2=9.6&ot3=9.6&gridFee=4&repayment=sculpted&infLR=0.03",
    BASE_CASE,
  )!,
  lapsed: edit((c) => {
    c.revenue.awardNoticeDate = "2023-01-01";
    c.revenue.ceilingPriceCt = 8;
  }),
  unusual: edit((c) => {
    c.revenue.awardPriceCt = 7.6;
    c.revenue.awardNoticeDate = "2027-02-01";
    c.tax.hebesatz = 2.5;
    c.tax.degressive = true;
    c.financing.tenorYearsFromClose = 10;
    c.financing.graceYears = 3;
  }),
  penaltyLong: edit((c) => {
    c.revenue.awardNoticeDate = "2025-12-01";
    c.financing.tenorYearsFromClose = 26;
  }),
  interestBarrier: edit((c) => {
    c.revenue.awardPriceCt = 9.5;
    c.revenue.ceilingPriceCt = 10;
    c.financing.interestRate = 0.075;
    c.financing.maxGearing = 0.9;
    c.financing.targetDscrP50 = 1.1;
    c.financing.targetDscrP90 = 1;
    c.financing.covenantDscr = 1;
    c.financing.lockupDscr = 1.05;
    c.financing.repayment = "annuity";
    c.financing.tenorYearsFromClose = 20;
  }),
  construction40: edit((c) => {
    c.project.constructionMonths = 40;
    c.financing.graceYears = 4;
    c.financing.tenorYearsFromClose = 22;
  }),
  coe9: edit((c) => (c.macro.costOfEquity = 0.09)),
};

/**
 * Edits made in the file after the download: the base workbook with one input changed. "same": a valuation-only
 * edit, so every formula must give what the engine gives for the edited inputs (that variant's manifest). Without
 * it, the edit moves the loan: no formula may show an error, and the Checks sheet must ask for a re-solve.
 */
export const USER_EDITS: Record<string, { id: string; value: number; same?: string }> = {
  editCoe: { id: "in.coe", value: 0.09, same: "coe9" },
  editAward: { id: "in.award", value: 5.5 },
};

function build(dir: string, names: string[]) {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const inputs = canonicalInputs(VARIANTS[name]!);
    const snap = buildSnapshot(inputs);
    const extras = workbookExtras(inputs);
    const url = "https://igorsabodakha.com/wind-farm-calculator/";
    const full = buildFormulaWorkbook(snap, extras, en, url);
    const bare = buildFormulaWorkbook(snap, extras, en, url, { withoutCache: true });
    writeFileSync(join(dir, `${name}.xlsx`), full.bytes);
    writeFileSync(join(dir, `${name}.nocache.xlsx`), bare.bytes);
    writeFileSync(join(dir, `${name}.manifest.json`), JSON.stringify(full.manifest));
    writeFileSync(join(dir, `${name}.cells.json`), JSON.stringify(full.scalars));
    console.log(`${name}: ${full.manifest.length} formula cells, ${(full.bytes.length / 1024).toFixed(0)} KB`);
  }
  if (names.includes("base")) for (const [name, ed] of Object.entries(USER_EDITS)) patchInput(dir, "base", name, ed.id, ed.value);
}

/** Copies <from>.nocache.xlsx to <name>.nocache.xlsx with the value of one input cell replaced. */
function patchInput(dir: string, from: string, name: string, id: string, value: number) {
  const cells = JSON.parse(readFileSync(join(dir, `${from}.cells.json`), "utf8")) as Record<string, string>;
  const [sheet, ref] = cells[id]!.split("!") as [string, string];
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, `${from}.nocache.xlsx`))));
  const wb = strFromU8(files["xl/workbook.xml"]!);
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  const path = `xl/worksheets/sheet${sheets.indexOf(sheet) + 1}.xml`;
  const re = new RegExp(`(<c r="${ref}"[^>]*>)<v>([^<]*)</v>`);
  const xml = strFromU8(files[path]!);
  const m = re.exec(xml);
  if (!m) throw new Error(`cell ${ref} not found`);
  files[path] = strToU8(xml.replace(re, `$1<v>${value}</v>`));
  writeFileSync(join(dir, `${name}.nocache.xlsx`), zipSync(files));
  console.log(`${name}: ${from} with ${id} (${sheet}!${ref}) ${m[2]} → ${value}`);
}

/** Values of every cell of a workbook, by "Sheet!A1". */
function readValues(path: string): Map<string, number | string | boolean> {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const wb = strFromU8(files["xl/workbook.xml"]!);
  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"]!);
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    for (const m of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1]!)).join(""));
    }
  }
  const out = new Map<string, number | string | boolean>();
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = decode(m[1]!);
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels)?.[1];
    const xml = strFromU8(files[`xl/${target!.replace(/^\/?xl\//, "")}`]!);
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[2] ?? "";
      const inner = c[3] ?? "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: number | string | boolean | undefined;
      if (t === "s" && v !== undefined) value = shared[Number(v)]!;
      else if (t === "str" || t === "e") value = v === undefined ? "" : decode(v);
      else if (t === "inlineStr") value = decode(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "");
      else if (t === "b") value = v === "1";
      else if (v !== undefined) value = Number(v);
      if (value !== undefined) out.set(`${name}!${c[1]}`, value);
    }
  }
  return out;
}

function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Money to the cent (plus a relative term for large sums); ratios, rates and factors to 1e-7; exact otherwise. */
function close(expected: unknown, actual: unknown, entry: ManifestEntry): boolean {
  if (expected === null || expected === "") return actual === undefined || actual === "" || actual === null;
  if (typeof expected === "number") {
    if (typeof actual === "boolean") return expected === (actual ? 1 : 0);
    if (typeof actual !== "number") return false;
    // Money (whole-euro format) to the cent; everything else — rates, ratios, factors, years, dates — to 1e-7.
    const tol = entry.fmt === "int" ? 0.01 + 1e-10 * Math.abs(expected) : 1e-7 + 1e-9 * Math.abs(expected);
    return Math.abs(actual - expected) <= tol;
  }
  if (typeof expected === "boolean") return actual === expected || actual === (expected ? 1 : 0);
  return String(actual) === String(expected);
}

function compare(dir: string, names: string[]): boolean {
  let allOk = true;
  for (const name of names) {
    const ed = USER_EDITS[name];
    if (ed && !ed.same) {
      allOk &&= compareMovedEdit(dir, name);
      continue;
    }
    const source = ed?.same ?? name;
    const manifest = JSON.parse(readFileSync(join(dir, `${source}.manifest.json`), "utf8")) as ManifestEntry[];
    const recalc = readValues(join(dir, `${name}.recalc.xlsx`));
    const cached = readValues(join(dir, `${source}.xlsx`));
    const wrong: string[] = [];
    let cacheWrong = 0;
    for (const m of manifest) {
      const key = `${m.sheet}!${m.cell}`;
      const got = recalc.get(key);
      if (!close(m.expected, got, m)) wrong.push(`${key} ${m.id}: engine ${JSON.stringify(m.expected)} ≠ spreadsheet ${JSON.stringify(got)}`);
      if (got !== undefined && !close(got, cached.get(key), m)) cacheWrong++;
    }
    const ok = wrong.length === 0 && cacheWrong === 0;
    allOk &&= ok;
    console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${manifest.length} cells, ${wrong.length} differ from the engine, ${cacheWrong} caches differ from the recalculation`);
    for (const w of wrong.slice(0, Number(process.env.SHOW ?? 25))) console.log(`     ${w}`);
  }
  return allOk;
}

/** An edit that moves the loan: no formula shows an error, and the Checks sheet asks for a re-solve. */
function compareMovedEdit(dir: string, name: string): boolean {
  const manifest = JSON.parse(readFileSync(join(dir, "base.manifest.json"), "utf8")) as ManifestEntry[];
  const cells = JSON.parse(readFileSync(join(dir, "base.cells.json"), "utf8")) as Record<string, string>;
  const recalc = readValues(join(dir, `${name}.recalc.xlsx`));
  const errors = manifest.filter((m) => /^#/.test(String(recalc.get(`${m.sheet}!${m.cell}`) ?? "")));
  const at = (id: string) => recalc.get(cells[id]!);
  const asks = at("chk.loan") === "Re-solve the financing on the website" || at("chk.usesBase") === "Re-solve the financing on the website";
  const ok = errors.length === 0 && asks && at("chk.master") === "See the checks above";
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${errors.length} error values; loan ${JSON.stringify(at("chk.loan"))}, uses ${JSON.stringify(at("chk.usesBase"))}, all checks ${JSON.stringify(at("chk.master"))}`);
  for (const m of errors.slice(0, 10)) console.log(`     ${m.sheet}!${m.cell} ${m.id}: ${String(recalc.get(`${m.sheet}!${m.cell}`))}`);
  return ok;
}

/**
 * Negative control: the base workbook with the trade-tax multiplier raised from 400 % to 410 % in the file. After a
 * recalculation the tax lines — and everything that depends on them — must differ from the engine, while lines that
 * do not depend on tax (revenue, the loan, capex) must still match. Proves the spreadsheet computes by itself.
 */
function negativeControl(dir: string) {
  const cells = JSON.parse(readFileSync(join(dir, "base.cells.json"), "utf8")) as Record<string, string>;
  const [sheet, ref] = cells["in.hebesatz"]!.split("!") as [string, string];
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, "base.nocache.xlsx"))));
  const wb = strFromU8(files["xl/workbook.xml"]!);
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  const path = `xl/worksheets/sheet${names.indexOf(sheet) + 1}.xml`;
  const xml = strFromU8(files[path]!);
  const re = new RegExp(`(<c r="${ref}"[^>]*>)<v>([^<]*)</v>`);
  const m = re.exec(xml);
  if (!m) throw new Error(`cell ${ref} not found`);
  const patched = xml.replace(re, `$1<v>${Number(m[2]) + 0.1}</v>`);
  files[path] = strToU8(patched);
  writeFileSync(join(dir, "negctl.nocache.xlsx"), zipSync(files));
  writeFileSync(join(dir, "negctl.manifest.json"), readFileSync(join(dir, "base.manifest.json")));
  writeFileSync(join(dir, "negctl.xlsx"), readFileSync(join(dir, "base.xlsx")));
  console.log(`negative control written: ${sheet}!${ref} ${m[2]} → ${Number(m[2]) + 0.1}`);
}

function checkNegativeControl(dir: string): boolean {
  const manifest = JSON.parse(readFileSync(join(dir, "negctl.manifest.json"), "utf8")) as ManifestEntry[];
  const recalc = readValues(join(dir, "negctl.recalc.xlsx"));
  const differ = (pattern: RegExp) => manifest.filter((m) => pattern.test(m.id) && !close(m.expected, recalc.get(`${m.sheet}!${m.cell}`), m)).length;
  const count = (pattern: RegExp) => manifest.filter((m) => pattern.test(m.id)).length;
  const taxMoved = differ(/^tx\.base\.tradeTax\[/);
  const taxAll = count(/^tx\.base\.tradeTax\[/);
  const revenueMoved = differ(/^o\.base\.revenue\[/);
  const loanMoved = differ(/^d\.(interest|principal)\[/);
  const capexMoved = differ(/^c\.base\.capex\[/);
  const irrMoved = differ(/^r\.base\.irr$/);
  console.log(`negative control: trade tax differs in ${taxMoved} of ${taxAll} years (taxed years only), equity IRR ${irrMoved ? "differs" : "unchanged"};`);
  console.log(`                  revenue ${revenueMoved}, loan ${loanMoved}, capex ${capexMoved} cells differ (must be 0)`);
  return taxMoved > 0 && irrMoved === 1 && revenueMoved === 0 && loanMoved === 0 && capexMoved === 0;
}

const [, , cmd, dir, ...rest] = process.argv;
const names = rest.length ? rest : Object.keys(VARIANTS);
if (cmd === "build") build(dir!, names);
else if (cmd === "compare") process.exit(compare(dir!, rest.length ? rest : [...names, ...Object.keys(USER_EDITS)]) ? 0 : 1);
else if (cmd === "negctl") negativeControl(dir!);
else if (cmd === "negctl-check") process.exit(checkNegativeControl(dir!) ? 0 : 1);
else {
  console.error("usage: verify.ts build|compare <dir> [variant…]");
  process.exit(2);
}
