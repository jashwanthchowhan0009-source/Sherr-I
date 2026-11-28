// Local preview: serves the app and runs /api/chat like Vercel does.
//   GEMINI_API_KEY=... node dev-server.mjs   (or AI_GATEWAY_API_KEY=...)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import * as chat from "./api/chat.js";
import * as push from "./api/push.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const api = { "/api/chat": chat, "/api/push": push }[url.pathname];
  if (api) {
    const body = req.method === "POST" ? await new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); }) : undefined;
    const request = new Request(url, { method: req.method, headers: req.headers, body });
    const out = await (req.method === "POST" ? api.POST(request) : api.GET(request));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    return res.end(await out.text());
  }
  const path = normalize(join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!path.startsWith(ROOT) || path.includes("/tests/") || path.includes("/lib/") || path.includes("/api/")) { res.writeHead(404); return res.end(); }
  try {
    const data = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(PORT, () => console.log(`🐯 Sherr I on http://127.0.0.1:${PORT}`));
