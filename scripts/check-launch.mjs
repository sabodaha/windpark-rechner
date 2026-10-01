// Gate before any deployment: fails while a page of the static build still shows a placeholder
// (contact details not yet supplied), lacks the "no advice" disclaimer of its language or declares the wrong
// language.  npm run build && npm run check:launch
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out/", import.meta.url));
/** German pages live under /de/; every other page is English. */
const DISCLAIMER = {
  en: "Illustrative calculation — not investment, tax or legal advice",
  de: "Beispielrechnung – keine Anlage-, Steuer- oder Rechtsberatung",
};

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "_next" ? [] : pages(full);
    return name.endsWith(".html") ? [full] : [];
  });
}

const problems = [];
let german = 0;
for (const file of pages(out)) {
  const html = readFileSync(file, "utf8");
  const page = relative(out, file).split("\\").join("/");
  const locale = page.startsWith("de/") ? "de" : "en";
  if (locale === "de") german++;
  if (html.includes("data-placeholder")) problems.push(`${page}: placeholder not filled in`);
  if (/404/.test(page)) continue;
  if (!html.includes(DISCLAIMER[locale])) problems.push(`${page}: disclaimer missing`);
  if (!html.includes(`<html lang="${locale}"`)) problems.push(`${page}: not marked as lang="${locale}"`);
}
if (problems.length) {
  console.error(`NOT READY FOR LAUNCH\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`ready for launch: no placeholders, disclaimer and language on every page (${german} German pages)`);
