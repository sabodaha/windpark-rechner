// Build time only: the revenue library and price statistics read from public/, and the base case computed once for
// the static pages (calculator, home page). Never imported by client components.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BESS_FILES, type StatsFile } from "./data";
import { BESS_BASE, parseLibrary, type Library, type LibraryManifest } from "./engine";
import { computeCore, computeExtras, computePStar, computeTornado, type BessCore, type BessExtras, type BessPStar, type BessTornado } from "./view";

const file = (p: string) => join(process.cwd(), "public", p);

let library: Library | null = null;
export function loadLibrary(): Library {
  if (!library) {
    const manifest = JSON.parse(readFileSync(file(BESS_FILES.manifest), "utf-8")) as LibraryManifest;
    const bin = readFileSync(file(BESS_FILES.payload));
    library = parseLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  }
  return library;
}

export function loadStats(): StatsFile {
  return JSON.parse(readFileSync(file(BESS_FILES.stats), "utf-8")) as StatsFile;
}

export interface BessBase {
  core: BessCore;
  extras: BessExtras;
  tornado: BessTornado;
  pstar: BessPStar;
}

let base: BessBase | null = null;
/** The base case with everything the first screen and the tabs show. */
export function bessBase(): BessBase {
  if (!base) {
    const lib = loadLibrary();
    const core = computeCore(BESS_BASE, lib);
    base = {
      core,
      extras: computeExtras(BESS_BASE, lib, core.result.funding),
      tornado: computeTornado(BESS_BASE, lib, core.result.funding),
      pstar: computePStar(BESS_BASE, lib),
    };
  }
  return base;
}
