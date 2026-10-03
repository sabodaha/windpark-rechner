// Runs the BESS engine on the cases of the independent reference and writes their KPIs, statuses, IRR roots and dated
// audit series (project flows, equity, dividend vintages, remittance tail) for the acceptance comparison.
// Usage: npx tsx scripts/bess/run-cases.ts <out.json> [library version]
import { readFileSync, writeFileSync } from "node:fs";
import { parseLibrary, type LibraryManifest } from "../../src/bess/engine";
import { acceptanceCases } from "./cases";

const version = process.argv[3] ?? "2";
const manifest = JSON.parse(readFileSync(`public/bess/ua-library-v${version}.json`, "utf-8")) as LibraryManifest;
const bin = readFileSync(`public/bess/ua-library-v${version}.bin`);
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

const t0 = Date.now();
const out = { ...acceptanceCases(lib), ms: 0 };
out.ms = Date.now() - t0;
writeFileSync(process.argv[2] ?? "bess-cases.json", JSON.stringify(out, null, 1));
const k = out.base.kpis as Record<string, number | null>;
console.log({ investorIrr: k.investorIrr, investorNpv: k.investorNpv, debt: k.debtEur, minDscr: k.minDscr, lenderMinDscr: k.lenderMinDscr, lcos: k.lcos, net2029: k.netRevenue2029PerMW, breakEven: out.base.breakEven.value, ms: out.ms });
