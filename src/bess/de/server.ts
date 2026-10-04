// Build time only: the German revenue library and price statistics read from public/, and the base case computed once
// for the static page — the first screen's T* and reserve paths, the sensitivity and the comparison with Ukraine
// included (spec §9.2: the base T* is computed at build time). Never imported by client components.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLibrary as loadUaLibrary } from "../server";
import { DE_FILES, type DeStatsFile } from "./data";
import { parseDeLibrary, type DeLibrary, type DeLibraryManifest } from "./library";
import { DE_BASE } from "./registry";
import {
  computeDeCompare,
  computeDeCore,
  computeDeExtras,
  computeDePaths,
  computeDeSensitivity,
  type DeCompare,
  type DeCore,
  type DeExtras,
  type DePathResult,
  type DeSensitivity,
} from "./view";

const file = (p: string) => join(process.cwd(), "public", p);

let library: DeLibrary | null = null;
export function loadDeLibrary(): DeLibrary {
  if (!library) {
    const manifest = JSON.parse(readFileSync(file(DE_FILES.manifest), "utf-8")) as DeLibraryManifest;
    const bin = readFileSync(file(DE_FILES.payload));
    library = parseDeLibrary(manifest, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  }
  return library;
}

export function loadDeStats(): DeStatsFile {
  return JSON.parse(readFileSync(file(DE_FILES.stats), "utf-8")) as DeStatsFile;
}

export interface DeBase {
  core: DeCore;
  extras: DeExtras;
  paths: DePathResult[] | null;
  sensitivity: DeSensitivity;
  compare: DeCompare;
}

let base: DeBase | null = null;
/** The base case with everything the first screen and the tabs show. */
export function deBase(): DeBase {
  if (!base) {
    const lib = loadDeLibrary();
    const core = computeDeCore(DE_BASE, lib);
    const extras = computeDeExtras(DE_BASE, lib);
    base = {
      core,
      extras,
      paths: computeDePaths(DE_BASE, lib, extras),
      sensitivity: computeDeSensitivity(DE_BASE, lib, core.funding),
      compare: computeDeCompare(DE_BASE, lib, loadUaLibrary()),
    };
  }
  return base;
}
