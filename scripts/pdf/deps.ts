// The files the published PDF report is made from. Their hash goes into the manifest next to the PDF, and a test
// fails when it no longer matches: the model, the slides or their texts changed, but the PDF was not printed again.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const REPORT_DEPENDENCIES = [
  "src/engine",
  "src/components/report",
  "src/components/charts",
  "src/components/ui/button.tsx",
  "src/app/wind-farm-calculator/report",
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/lib/extras.ts",
  "src/lib/fields.ts",
  "src/lib/format.ts",
  "src/lib/site.ts",
  "src/lib/url-state.ts",
  "src/lib/utils.ts",
  "src/messages/en.ts",
];

function walk(root: string, path: string): string[] {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full)
    .flatMap((name) => walk(root, `${path}/${name}`))
    .filter((p) => /\.(ts|tsx|css)$/.test(p));
}

/** Sorted repository paths of every dependency file. */
export function dependencyFiles(root: string): string[] {
  return [...new Set(REPORT_DEPENDENCIES.flatMap((p) => walk(root, p)))].sort();
}

/** SHA-256 over path and content of every dependency, with line endings normalised (a Windows checkout gives CRLF). */
export function dependencyHash(root: string): string {
  const h = createHash("sha256");
  for (const file of dependencyFiles(root)) {
    h.update(`${relative(root, join(root, file)).split("\\").join("/")}\n`);
    h.update(readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n"));
    h.update("\n");
  }
  return h.digest("hex");
}

export interface PdfManifest {
  file: string;
  bytes: number;
  sha256: string;
  pages: number;
  tagged: boolean;
  outline: boolean;
  engineVersion: string;
  dataAsOf: string;
  inputHash: string;
  dependencyHash: string;
  dependencies: number;
}

/** Page count, tags and outline of a PDF written by Chromium (its page objects are not compressed). */
export function inspectPdf(bytes: Uint8Array): { pages: number; tagged: boolean; outline: boolean } {
  const text = Buffer.from(bytes).toString("latin1");
  return {
    pages: (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length,
    tagged: /\/StructTreeRoot/.test(text) && /\/Marked\s+true/.test(text),
    outline: /\/Outlines\s+\d+\s+0\s+R/.test(text),
  };
}
