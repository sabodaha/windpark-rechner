// Next.js 16 static export writes segment prefetch payloads as nested files
// (…/__next.wind-farm-calculator/__PAGE__.txt), while its client router requests the flat name
// (…/__next.wind-farm-calculator.__PAGE__.txt). Static hosts serve files as they are, so every
// page load would log a 404. This copies each nested payload to its flat name.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let copied = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith("__next.")) flatten(full, full);
    else if (name !== "_next") walk(full);
  }
}

function flatten(root, dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) flatten(root, full);
    else {
      const flat = `${root}.${relative(root, full).split(/[\\/]/).join(".")}`;
      copyFileSync(full, flat);
      copied++;
    }
  }
}

walk(OUT);
console.log(`postbuild: ${copied} prefetch payload(s) copied to flat names`);
