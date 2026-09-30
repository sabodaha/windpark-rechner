// Gate before any deployment: fails while a page of the static build still shows a placeholder
// (contact details not yet supplied) or lacks the "no advice" disclaimer.  npm run build && npm run check:launch
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out/", import.meta.url));
const DISCLAIMER = "Illustrative calculation — not investment, tax or legal advice";

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "_next" ? [] : pages(full);
    return name.endsWith(".html") ? [full] : [];
  });
}

const problems = [];
for (const file of pages(out)) {
  const html = readFileSync(file, "utf8");
  const page = relative(out, file);
  if (html.includes("data-placeholder")) problems.push(`${page}: placeholder not filled in`);
  if (!/404/.test(page) && !html.includes(DISCLAIMER)) problems.push(`${page}: disclaimer missing`);
}
if (problems.length) {
  console.error(`NOT READY FOR LAUNCH\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("ready for launch: no placeholders, disclaimer on every page");
