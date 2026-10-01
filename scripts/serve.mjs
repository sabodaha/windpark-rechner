// Serves the static build (out/) the way Cloudflare Pages will: the response headers from public/_headers,
// directory URLs with a trailing slash, and 404.html for unknown paths. For checking the content security
// policy locally:  npm run build && npm run serve
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const port = Number(process.env.PORT ?? 3109);

/**
 * `_headers`: an unindented path pattern, then indented "Name: value" lines ("! Name" removes a header). Host-specific
 * rules are skipped.
 */
function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      if (line.trim().startsWith("!")) continue; // "! Name" detaches a header Cloudflare adds; nothing to do here
      const i = line.indexOf(":");
      current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules
    .filter((r) => r.pattern.startsWith("/"))
    .map((r) => ({ ...r, re: new RegExp(`^${r.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`) }));
}

const rules = parseHeaders(readFileSync(join(root, "_headers"), "utf8"));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname);
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith("/")) {
      res.writeHead(308, { Location: `${path}/${url.search}` }).end();
      return;
    }
    file = join(file, "index.html");
  }
  let status = 200;
  if (!existsSync(file)) {
    status = 404;
    file = join(root, "404.html");
  }
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
  for (const r of rules) if (r.re.test(path)) for (const [k, v] of r.headers) headers[k] = v;
  res.writeHead(status, headers);
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log(`out/ with _headers on http://localhost:${port}`));
