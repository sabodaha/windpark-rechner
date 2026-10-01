// Renders the social-sharing images (public/og.png, German public/og-de.png) and the Apple touch icon (src/app/apple-icon.png) from
// the HTML templates next to this file, with a local Chromium browser in headless mode. Run after a
// build, which provides the self-hosted Inter font:  npm run build && node scripts/images/render.mjs
// Browser: $BROWSER, or Microsoft Edge at its default Windows path.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const browser = process.env.BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function latinInter() {
  const chunks = join(root, "out", "_next", "static", "chunks");
  for (const name of readdirSync(chunks).filter((n) => n.endsWith(".css"))) {
    const css = readFileSync(join(chunks, name), "utf8");
    const m = /@font-face\{font-family:Inter;[^}]*src:url\(\.\.\/media\/([^)]+)\)[^}]*unicode-range:U\+\?\?,/.exec(css);
    if (m) return join(root, "out", "_next", "static", "media", m[1]);
  }
  throw new Error("Latin Inter font not found — run `npm run build` first");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(template, out, width, height, font) {
  const work = mkdtempSync(join(tmpdir(), "og-"));
  const page = join(work, "page.html");
  let html = readFileSync(join(here, template), "utf8");
  if (font) {
    copyFileSync(font, join(work, "inter.woff2"));
    html = html.replace("__INTER__", "inter.woff2");
  }
  writeFileSync(page, html);
  const shot = join(work, "shot.png");
  // A profile of its own per job: a shared one hands the job to a running instance that writes nothing.
  spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${join(work, "profile")}`,
    `--window-size=${width},${height}`,
    `--screenshot=${shot}`,
    pathToFileURL(page).href,
  ]);
  // The browser can exit before the file is written: wait until it exists and its size is stable.
  let last = -1;
  for (let i = 0; i < 100; i++) {
    if (existsSync(shot)) {
      const size = statSync(shot).size;
      if (size > 0 && size === last) break;
      last = size;
    }
    await sleep(200);
  }
  if (!existsSync(shot)) throw new Error(`no screenshot for ${template}`);
  copyFileSync(shot, out);
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(work, { recursive: true, force: true });
      break;
    } catch {
      await sleep(250);
    }
  }
  console.log(`${out} (${statSync(out).size} bytes)`);
}

await render("og.html", join(root, "public", "og.png"), 1200, 630, latinInter());
await render("og.de.html", join(root, "public", "og-de.png"), 1200, 630, latinInter());
await render("apple-icon.html", join(root, "src", "app", "apple-icon.png"), 180, 180);
