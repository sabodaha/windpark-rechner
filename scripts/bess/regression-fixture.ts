// Freezes the released v1 engine's outputs on the nine acceptance cases as the regression fixture of spec v1.1 §14,
// gate 1: with every v1.1 module off, a later engine must reproduce these rows to €0.01 with the same dates and statuses.
// Run once on the released engine (main 00873c0); never regenerate it to make a failing test pass.
// Usage: npx tsx scripts/bess/regression-fixture.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseLibrary, type LibraryManifest } from "../../src/bess/engine";
import { acceptanceCases } from "./cases";

const manifest = JSON.parse(readFileSync("public/bess/ua-library-v2.json", "utf-8")) as LibraryManifest;
const bin = readFileSync("public/bess/ua-library-v2.bin");
const lib = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

mkdirSync("test/fixtures", { recursive: true });
const fixture = { engine: "released v1 (S1.3), main 00873c0", library: manifest.version, cases: acceptanceCases(lib) };
writeFileSync("test/fixtures/bess-v1-regression.json", JSON.stringify(fixture));
console.log("written", Object.keys(fixture.cases).length, "cases");
