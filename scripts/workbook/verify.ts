// Verification of the formula workbook against the engine, recalculated by Microsoft Excel:
//   npx tsx scripts/workbook/verify.ts build <dir> [variant…]    the workbooks of the variants (scripts/workbook/
//                                                                 variants.ts); with "base", also the edits made in
//                                                                 the file and the two negative controls
//   powershell -File scripts/workbook/recalc.ps1 -Dir <dir>       Excel recalculates every formula-only copy
//   npx tsx scripts/workbook/verify.ts compare <dir> [variant…]   every formula cell against the engine
//   npx tsx scripts/workbook/verify.ts archive <dir>              after a full run: verification/excel-run.json, which a
//                                                                 test checks against the current workbook
// Tolerances are absolute: money to the cent, everything else (rates, ratios, factors, dates) to 1e-7.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { ENGINE_VERSION } from "../../src/engine";
import type { ManifestEntry } from "../../src/lib/workbook/grid";
import { variantWorkbooks, workbookDigest, type ExcelRun } from "./digest";
import { pairCoverage, USER_EDITS, VARIANTS } from "./variants";

const TOLERANCE = { money: 0.01, other: 1e-7 };
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const archivePath = join(root, "verification", "excel-run.json");

/**
 * Negative controls on the base workbook: Excel must disagree with the engine where the file was spoiled, and only
 * there. "input" raises the trade-tax multiplier from 400 % to 410 %; "formula" corrupts the trade-tax formula.
 */
const CONTROLS = ["negInput", "negFormula"] as const;

function build(dir: string, names: string[]) {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const { full, bare } = variantWorkbooks(VARIANTS[name]!);
    writeFileSync(join(dir, `${name}.xlsx`), full.bytes);
    writeFileSync(join(dir, `${name}.nocache.xlsx`), bare.bytes);
    writeFileSync(join(dir, `${name}.manifest.json`), JSON.stringify(full.manifest));
    writeFileSync(join(dir, `${name}.cells.json`), JSON.stringify(full.scalars));
    console.log(`${name}: ${full.manifest.length} formula cells, ${(full.bytes.length / 1024).toFixed(0)} KB`);
  }
  if (!names.includes("base")) return;
  for (const [name, ed] of Object.entries(USER_EDITS)) patchInput(dir, name, ed.id, ed.value);
  const hebesatz = JSON.parse(readFileSync(join(dir, "base.cells.json"), "utf8"))["in.hebesatz"] as string;
  patchInput(dir, "negInput", "in.hebesatz", Number(cellValue(dir, hebesatz)) + 0.1);
  corruptFormulas(dir, "negFormula", /^tx\.base\.tradeTax\[/);
}

function sheetPath(files: Record<string, Uint8Array>, sheet: string): string {
  const wb = strFromU8(files["xl/workbook.xml"]!);
  const sheets = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]);
  return `xl/worksheets/sheet${sheets.indexOf(sheet) + 1}.xml`;
}

function cellValue(dir: string, address: string): string {
  const [sheet, ref] = address.split("!") as [string, string];
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, "base.nocache.xlsx"))));
  const m = new RegExp(`<c r="${ref}"[^>]*><v>([^<]*)</v>`).exec(strFromU8(files[sheetPath(files, sheet)]!));
  if (!m) throw new Error(`cell ${address} not found`);
  return m[1]!;
}

/** Copies base.nocache.xlsx to <name>.nocache.xlsx with the value of one input cell replaced. */
function patchInput(dir: string, name: string, id: string, value: number) {
  const cells = JSON.parse(readFileSync(join(dir, "base.cells.json"), "utf8")) as Record<string, string>;
  const [sheet, ref] = cells[id]!.split("!") as [string, string];
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, "base.nocache.xlsx"))));
  const path = sheetPath(files, sheet);
  const re = new RegExp(`(<c r="${ref}"[^>]*>)<v>([^<]*)</v>`);
  const xml = strFromU8(files[path]!);
  const m = re.exec(xml);
  if (!m) throw new Error(`cell ${ref} not found`);
  files[path] = strToU8(xml.replace(re, `$1<v>${value}</v>`));
  writeFileSync(join(dir, `${name}.nocache.xlsx`), zipSync(files));
  console.log(`${name}: base with ${id} (${sheet}!${ref}) ${m[2]} → ${value}`);
}

/** Copies base.nocache.xlsx to <name>.nocache.xlsx with the formulas of the matching rows multiplied by 1.01. */
function corruptFormulas(dir: string, name: string, ids: RegExp) {
  const manifest = JSON.parse(readFileSync(join(dir, "base.manifest.json"), "utf8")) as ManifestEntry[];
  const files = unzipSync(new Uint8Array(readFileSync(join(dir, "base.nocache.xlsx"))));
  let count = 0;
  for (const m of manifest.filter((x) => ids.test(x.id))) {
    const path = sheetPath(files, m.sheet);
    const re = new RegExp(`(<c r="${m.cell}"[^>]*>)<f>([^<]*)</f>`);
    const xml = strFromU8(files[path]!);
    if (!re.test(xml)) throw new Error(`formula ${m.sheet}!${m.cell} not found`);
    files[path] = strToU8(xml.replace(re, `$1<f>($2)*1.01</f>`));
    count++;
  }
  writeFileSync(join(dir, `${name}.nocache.xlsx`), zipSync(files));
  console.log(`${name}: base with ${count} formulas of ${ids.source} multiplied by 1.01`);
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

/** Absolute tolerances: money (whole-euro format) to the cent, every other number to 1e-7; text exactly. */
function close(expected: unknown, actual: unknown, entry: ManifestEntry): boolean {
  if (expected === null || expected === "") return actual === undefined || actual === "" || actual === null;
  if (typeof expected === "number") {
    if (typeof actual === "boolean") return expected === (actual ? 1 : 0);
    if (typeof actual !== "number") return false;
    return Math.abs(actual - expected) <= (entry.fmt === "int" ? TOLERANCE.money : TOLERANCE.other);
  }
  if (typeof expected === "boolean") return actual === expected || actual === (expected ? 1 : 0);
  return String(actual) === String(expected);
}

type Results = Pick<ExcelRun, "variants" | "edits" | "negativeControls">;

function compareVariant(dir: string, name: string, manifestOf: string, cachedOf: string, results: Results): boolean {
  const manifest = JSON.parse(readFileSync(join(dir, `${manifestOf}.manifest.json`), "utf8")) as ManifestEntry[];
  const recalc = readValues(join(dir, `${name}.recalc.xlsx`));
  const cached = readValues(join(dir, `${cachedOf}.xlsx`));
  const wrong: string[] = [];
  let cacheWrong = 0;
  for (const m of manifest) {
    const key = `${m.sheet}!${m.cell}`;
    const got = recalc.get(key);
    if (!close(m.expected, got, m)) wrong.push(`${key} ${m.id}: engine ${JSON.stringify(m.expected)} ≠ spreadsheet ${JSON.stringify(got)}`);
    if (got !== undefined && !close(got, cached.get(key), m)) cacheWrong++;
  }
  const ok = wrong.length === 0 && cacheWrong === 0;
  if (name in VARIANTS) results.variants[name] = { cells: manifest.length, differ: wrong.length, cachesDiffer: cacheWrong };
  else results.edits[name] = { ok, note: `${manifest.length} cells as the engine for ${manifestOf}` };
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${manifest.length} cells, ${wrong.length} differ from the engine, ${cacheWrong} caches differ from the recalculation`);
  for (const w of wrong.slice(0, Number(process.env.SHOW ?? 25))) console.log(`     ${w}`);
  return ok;
}

/** An edit that moves the loan: no formula shows an error, and the Checks sheet asks for a re-solve. */
function compareMovedEdit(dir: string, name: string, results: Results): boolean {
  const manifest = JSON.parse(readFileSync(join(dir, "base.manifest.json"), "utf8")) as ManifestEntry[];
  const cells = JSON.parse(readFileSync(join(dir, "base.cells.json"), "utf8")) as Record<string, string>;
  const recalc = readValues(join(dir, `${name}.recalc.xlsx`));
  const errors = manifest.filter((m) => /^#/.test(String(recalc.get(`${m.sheet}!${m.cell}`) ?? "")));
  const at = (id: string) => recalc.get(cells[id]!);
  const asks = at("chk.loan") === "Re-solve the financing on the website" || at("chk.usesBase") === "Re-solve the financing on the website";
  const ok = errors.length === 0 && asks && at("chk.master") === "See the checks above";
  const note = `${errors.length} error values; loan ${JSON.stringify(at("chk.loan"))}, uses ${JSON.stringify(at("chk.usesBase"))}, all checks ${JSON.stringify(at("chk.master"))}`;
  results.edits[name] = { ok, note };
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${note}`);
  for (const m of errors.slice(0, 10)) console.log(`     ${m.sheet}!${m.cell} ${m.id}: ${String(recalc.get(`${m.sheet}!${m.cell}`))}`);
  return ok;
}

/** A spoiled base workbook: trade tax and the equity IRR must move; revenue, the loan and capex must not. */
function compareControl(dir: string, name: string, results: Results): boolean {
  const manifest = JSON.parse(readFileSync(join(dir, "base.manifest.json"), "utf8")) as ManifestEntry[];
  const recalc = readValues(join(dir, `${name}.recalc.xlsx`));
  const differ = (pattern: RegExp) => manifest.filter((m) => pattern.test(m.id) && !close(m.expected, recalc.get(`${m.sheet}!${m.cell}`), m)).length;
  const count = (pattern: RegExp) => manifest.filter((m) => pattern.test(m.id)).length;
  const tax = differ(/^tx\.base\.tradeTax\[/);
  const irr = differ(/^r\.base\.irr$/);
  const untouched = differ(/^o\.base\.revenue\[/) + differ(/^d\.(interest|principal)\[/) + differ(/^c\.base\.capex\[/);
  const ok = tax > 0 && irr === 1 && untouched === 0;
  const note = `trade tax differs in ${tax} of ${count(/^tx\.base\.tradeTax\[/)} years, equity IRR ${irr ? "differs" : "unchanged"}, revenue/loan/capex cells that differ: ${untouched}`;
  results.negativeControls[name] = { ok, note };
  console.log(`${ok ? "OK  " : "FAIL"} ${name} (negative control): ${note}`);
  return ok;
}

function compare(dir: string, names: string[]): boolean {
  const results: Results = { variants: {}, edits: {}, negativeControls: {} };
  let allOk = true;
  for (const name of names) {
    const ed = USER_EDITS[name];
    if ((CONTROLS as readonly string[]).includes(name)) allOk = compareControl(dir, name, results) && allOk;
    else if (ed && !ed.same) allOk = compareMovedEdit(dir, name, results) && allOk;
    else allOk = compareVariant(dir, name, ed?.same ?? name, ed?.same ?? name, results) && allOk;
  }
  writeFileSync(join(dir, "results.json"), JSON.stringify(results, null, 2));
  return allOk;
}

/** Writes verification/excel-run.json from a complete, passing run. */
function archive(dir: string) {
  const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8")) as Results;
  const missing = Object.keys(VARIANTS).filter((n) => !results.variants[n]);
  const failed = [
    ...Object.entries(results.variants).filter(([, v]) => v.differ || v.cachesDiffer).map(([n]) => n),
    ...Object.entries(results.edits).filter(([, v]) => !v.ok).map(([n]) => n),
    ...Object.entries(results.negativeControls).filter(([, v]) => !v.ok).map(([n]) => n),
  ];
  if (missing.length || failed.length || Object.keys(results.negativeControls).length !== CONTROLS.length) {
    throw new Error(`not a complete passing run: missing ${missing.join(", ") || "-"}; failed ${failed.join(", ") || "-"}`);
  }
  const versionFile = join(dir, "excel-version.txt");
  const run: ExcelRun = {
    date: new Date().toISOString().slice(0, 10),
    excel: existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : "unknown",
    engineVersion: ENGINE_VERSION,
    baseWorkbookDigest: workbookDigest(new Uint8Array(readFileSync(join(dir, "base.nocache.xlsx")))),
    tolerance: TOLERANCE,
    ...results,
    pairs: (({ pairs, missing: m }) => ({ total: pairs, missing: m }))(pairCoverage(Object.values(VARIANTS))),
  };
  mkdirSync(dirname(archivePath), { recursive: true });
  writeFileSync(archivePath, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`archived: ${archivePath} (${Object.keys(run.variants).length} variants, ${run.excel})`);
}

const [, , cmd, dir, ...rest] = process.argv;
const all = [...Object.keys(VARIANTS), ...Object.keys(USER_EDITS), ...CONTROLS];
if (cmd === "build") build(dir!, rest.length ? rest : Object.keys(VARIANTS));
else if (cmd === "compare") process.exit(compare(dir!, rest.length ? rest : all) ? 0 : 1);
else if (cmd === "archive") archive(dir!);
else {
  console.error("usage: verify.ts build|compare|archive <dir> [variant…]");
  process.exit(2);
}
