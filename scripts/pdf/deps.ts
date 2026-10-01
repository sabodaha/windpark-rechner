// The files the published PDF report is made from. Their hash goes into the manifest next to the PDF, and a test
// fails when it no longer matches: the model, the slides or their texts changed, but the PDF was not printed again.
// A second hash covers what the slides show (the report data of the base case), whatever file it came from.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReportData } from "../../src/components/report/data";
import { stableStringify } from "../../src/engine/snapshot";

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
  "src/lib/metadata.ts",
  "src/lib/site.ts",
  "src/lib/url-state.ts",
  "src/lib/utils.ts",
  "src/lib/workbook/verification.ts",
  "src/messages/en.ts",
  "scripts/pdf/render.ts",
  "package-lock.json",
];

const TEXT = /\.(ts|tsx|css|json|txt)$/;

function walk(root: string, path: string): string[] {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full)
    .flatMap((name) => walk(root, `${path}/${name}`))
    .filter((p) => /\.(ts|tsx|css|woff2)$/.test(p));
}

/** Sorted repository paths of every dependency file. */
export function dependencyFiles(root: string): string[] {
  return [...new Set(REPORT_DEPENDENCIES.flatMap((p) => walk(root, p)))].sort();
}

/**
 * SHA-256 over path and content of every dependency. Text with line endings normalised (a Windows checkout gives
 * CRLF), fonts as bytes.
 */
export function dependencyHash(root: string): string {
  const h = createHash("sha256");
  for (const file of dependencyFiles(root)) {
    h.update(`${relative(root, join(root, file)).split("\\").join("/")}\n`);
    const full = join(root, file);
    if (TEXT.test(file)) h.update(readFileSync(full, "utf8").replace(/\r\n/g, "\n"));
    else h.update(readFileSync(full));
    h.update("\n");
  }
  return h.digest("hex");
}

/**
 * Fingerprint of what the slides show: titles, messages, facts and the results behind the charts and tables.
 * Numbers to nine significant digits, so last-digit differences of a maths library cannot fail it.
 */
export function reportFingerprint(d: ReportData): string {
  const round = (v: unknown): unknown => {
    if (typeof v === "number") return Number.isFinite(v) ? Number(v.toPrecision(9)) : String(v);
    if (Array.isArray(v)) return v.map(round);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => typeof x !== "function")
          .map(([k, x]) => [k, round(x)]),
      );
    }
    return v;
  };
  const { titles, summary, facts, meta, sourceKeys, results, extras } = d;
  return createHash("sha256")
    .update(stableStringify(round({ titles, summary, facts, meta, sourceKeys, results, extras })))
    .digest("hex");
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
  /** reportFingerprint of the base case's report data. */
  contentHash: string;
  /** The browser that printed it. */
  browser: string;
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

// ---------------------------------------------------------------------------------------------
// Document information (Title, Author, Subject, Keywords). Chromium writes only the title; the rest is set by
// rewriting the information dictionary and shifting the cross-reference offsets — no PDF library needed.
// ---------------------------------------------------------------------------------------------

/** A PDF text string: UTF-16BE with a byte-order mark, in hex. */
export function pdfText(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return `<${hex}>`;
}

function decodePdfText(v: string): string {
  if (v.startsWith("<")) {
    const hex = v.slice(1, -1).replace(/\s/g, "");
    if (!/^FEFF/i.test(hex)) return hex.replace(/../g, (h) => String.fromCharCode(parseInt(h, 16)));
    let out = "";
    for (let i = 4; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    return out;
  }
  if (v.startsWith("(")) return v.slice(1, -1).replace(/\\([()\\])/g, "$1");
  return v;
}

/** The entries of a dictionary "<< /Key value … >>" with string, hex-string, name or number values. */
function parseDict(body: string): [string, string][] {
  const out: [string, string][] = [];
  const end = body.lastIndexOf(">>");
  let i = body.indexOf("<<") + 2;
  const space = (c: string | undefined) => c !== undefined && /\s/.test(c);
  while (i < end) {
    while (space(body[i])) i++;
    if (i >= end) break;
    if (body[i] !== "/") throw new Error(`unexpected "${body[i]}" in the information dictionary`);
    let j = i + 1;
    while (j < end && !/[\s/<(\[]/.test(body[j]!)) j++;
    const key = body.slice(i + 1, j);
    while (space(body[j])) j++;
    let k = j;
    if (body[k] === "(") {
      let depth = 0;
      for (; k < end; k++) {
        const c = body[k];
        if (c === "\\") k++;
        else if (c === "(") depth++;
        else if (c === ")" && --depth === 0) {
          k++;
          break;
        }
      }
    } else if (body[k] === "<") k = body.indexOf(">", k) + 1;
    else while (k < end && !/[\s/>]/.test(body[k]!)) k++;
    out.push([key, body.slice(j, k)]);
    i = k;
  }
  return out;
}

function locateInfo(text: string): { n: number; start: number; end: number; body: string } {
  const trailer = text.slice(text.lastIndexOf("trailer"));
  const ref = /\/Info\s+(\d+)\s+0\s+R/.exec(trailer);
  if (!ref) throw new Error("the PDF has no information dictionary");
  const n = Number(ref[1]);
  const head = new RegExp(`(^|[\\r\\n])${n} 0 obj`).exec(text);
  if (!head) throw new Error(`object ${n} not found`);
  const start = head.index + head[1]!.length;
  const end = text.indexOf("endobj", start) + "endobj".length;
  return { n, start, end, body: text.slice(start, end) };
}

/** The document information of a PDF, decoded. */
export function readInfo(bytes: Uint8Array): Record<string, string> {
  const text = Buffer.from(bytes).toString("latin1");
  return Object.fromEntries(parseDict(locateInfo(text).body).map(([k, v]) => [k, decodePdfText(v)]));
}

/**
 * Sets entries of the information dictionary of a PDF with one classic cross-reference table (as Chromium writes
 * it): the object is rewritten in place and every offset behind it shifted. Throws if any offset ends up wrong.
 */
export function setInfo(bytes: Uint8Array, entries: Record<string, string>): Uint8Array {
  const text = Buffer.from(bytes).toString("latin1");
  const info = locateInfo(text);
  const pairs = parseDict(info.body);
  for (const [key, value] of Object.entries(entries)) {
    const at = pairs.findIndex(([k]) => k === key);
    if (at >= 0) pairs[at] = [key, pdfText(value)];
    else pairs.push([key, pdfText(value)]);
  }
  const order = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"];
  pairs.sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const object = `${info.n} 0 obj\n<<${pairs.map(([k, v]) => `/${k} ${v}`).join("\n")}>>\nendobj`;
  const delta = object.length - (info.end - info.start);
  let out = text.slice(0, info.start) + object + text.slice(info.end);

  const sx = out.lastIndexOf("startxref");
  const xrefAt = Number(/startxref\s+(\d+)/.exec(out.slice(sx))![1]) + delta;
  if (!out.startsWith("xref", xrefAt)) throw new Error("not a classic cross-reference table");
  const table = /^xref\r?\n(\d+) (\d+)\r?\n/.exec(out.slice(xrefAt));
  if (!table || table[1] !== "0") throw new Error("unexpected cross-reference table");
  const count = Number(table[2]);
  const first = xrefAt + table[0].length;
  let rows = "";
  for (let i = 0; i < count; i++) {
    const row = out.slice(first + i * 20, first + (i + 1) * 20);
    const offset = Number(row.slice(0, 10));
    const shifted = row.endsWith("n \n") || row.endsWith("n\r\n") ? (offset > info.start ? offset + delta : offset) : offset;
    rows += `${String(shifted).padStart(10, "0")}${row.slice(10)}`;
  }
  out = out.slice(0, first) + rows + out.slice(first + count * 20);
  out = `${out.slice(0, sx)}startxref\n${xrefAt}\n%%EOF\n`;

  // Every in-use entry must point at its object.
  for (let i = 1; i < count; i++) {
    const row = out.slice(first + i * 20, first + (i + 1) * 20);
    if (!/ n\s*$/.test(row)) continue;
    const offset = Number(row.slice(0, 10));
    if (!out.startsWith(`${i} 0 obj`, offset)) throw new Error(`cross-reference entry ${i} is off after the rewrite`);
  }
  return new Uint8Array(Buffer.from(out, "latin1"));
}
