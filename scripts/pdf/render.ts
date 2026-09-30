// Prints the base-case report to PDF with a local Chromium browser in headless mode — tagged for accessibility,
// with an outline of the slides — and writes the manifest the tests check it against. Run after a build:
//   npm run build && npm run report:pdf
// Browser: $BROWSER, or Microsoft Edge at its default Windows path. No other dependencies.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_CASE, DATA_AS_OF, ENGINE_VERSION, hashInputs } from "../../src/engine";
import { PATHS } from "../../src/lib/site";
import { dependencyFiles, dependencyHash, inspectPdf, type PdfManifest } from "./deps";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const browser = process.env.BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = Number(process.env.PDF_PORT ?? 3119);
const target = join(root, "public", ...PATHS.reportPdf.split("/").filter(Boolean));
const manifestPath = join(root, "scripts", "pdf", "manifest.json");
const MAX_BYTES = 3 * 1024 * 1024;
const SLIDES = 18;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`server did not start: ${url}`);
}

async function main(): Promise<void> {
  if (!existsSync(join(root, "out", "wind-farm-calculator", "report", "index.html"))) {
    throw new Error("no build of the report page — run `npm run build` first");
  }
  if (!existsSync(browser)) throw new Error(`browser not found: ${browser} (set $BROWSER)`);

  // The static build, served the way Cloudflare Pages serves it (headers from _headers, incl. the CSP).
  const server = spawn(process.execPath, [join(root, "scripts", "serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const work = mkdtempSync(join(tmpdir(), "report-pdf-"));
  try {
    const url = `http://127.0.0.1:${port}${PATHS.report}`;
    await waitForServer(url);
    const out = join(work, "report.pdf");
    // A profile of its own: a shared one hands the job to a running instance that writes nothing.
    spawnSync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      `--user-data-dir=${join(work, "profile")}`,
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=15000",
      "--no-pdf-header-footer",
      "--export-tagged-pdf",
      "--generate-pdf-document-outline",
      `--print-to-pdf=${out}`,
      url,
    ]);
    // The browser can exit before the file is written: wait until it exists and its size is stable.
    let last = -1;
    for (let i = 0; i < 150; i++) {
      if (existsSync(out)) {
        const size = statSync(out).size;
        if (size > 0 && size === last) break;
        last = size;
      }
      await sleep(200);
    }
    if (!existsSync(out)) throw new Error("the browser wrote no PDF");

    const bytes = readFileSync(out);
    const info = inspectPdf(bytes);
    const problems = [
      info.pages !== SLIDES && `${info.pages} pages instead of ${SLIDES}: a slide overflows or the page size is wrong`,
      bytes.length > MAX_BYTES && `${(bytes.length / 1e6).toFixed(2)} MB, above the 3 MB limit`,
      !info.tagged && "not tagged (no structure tree)",
      !info.outline && "no document outline",
    ].filter(Boolean);
    if (problems.length) throw new Error(`PDF rejected:\n  ${problems.join("\n  ")}`);

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(out, target);
    const manifest: PdfManifest = {
      file: PATHS.reportPdf,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      pages: info.pages,
      tagged: info.tagged,
      outline: info.outline,
      engineVersion: ENGINE_VERSION,
      dataAsOf: DATA_AS_OF,
      inputHash: hashInputs(BASE_CASE),
      dependencyHash: dependencyHash(root),
      dependencies: dependencyFiles(root).length,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${PATHS.reportPdf}: ${info.pages} pages, ${(bytes.length / 1024).toFixed(0)} KB, tagged, with outline`);
    console.log(`manifest: dependencies ${manifest.dependencies} files, hash ${manifest.dependencyHash.slice(0, 12)}…`);
  } finally {
    server.kill();
    for (let i = 0; i < 20; i++) {
      try {
        rmSync(work, { recursive: true, force: true });
        break;
      } catch {
        await sleep(250); // the browser's crash handler keeps the profile locked for a moment
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
