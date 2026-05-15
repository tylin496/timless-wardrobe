#!/usr/bin/env node
/**
 * Serves the repo root as static files and accepts PUT /api/custom-items
 * to overwrite data/custom-items.json (used by app.js when adding/editing/deleting custom pieces).
 *
 * Usage: npm run dev
 * Open: http://127.0.0.1:8787/
 */
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const customJsonPath = path.join(root, "data", "custom-items.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function isPathInsideRoot(absFile) {
  const r = path.resolve(root);
  const f = path.resolve(absFile);
  return f === r || f.startsWith(r + path.sep);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function handlePutCustomItems(req, res) {
  let body;
  try {
    body = await readRequestBody(req);
  } catch (e) {
    console.error(e);
    res.writeHead(400);
    res.end();
    return;
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Invalid JSON");
    return;
  }
  if (!Array.isArray(data)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Body must be a JSON array");
    return;
  }
  try {
    await fs.mkdir(path.dirname(customJsonPath), { recursive: true });
    await fs.writeFile(customJsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    res.writeHead(204);
    res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Write failed");
  }
}

async function serveFaviconPng(/** @type {http.IncomingMessage} */ req, /** @type {http.ServerResponse} */ res, absFile) {
  if (!isPathInsideRoot(absFile)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return true;
  }
  try {
    const st = await fs.stat(absFile);
    if (!st.isFile()) return false;
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Content-Length": String(st.size),
    });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    createReadStream(absFile).pipe(res);
    return true;
  } catch {
    return false;
  }
}

async function handleStatic(/** @type {http.IncomingMessage} */ req, /** @type {http.ServerResponse} */ res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  const faviconRoutes = {
    "/favicon.ico": "favicon-light-32.png",
    "/favicon-light.png": "favicon-light-32.png",
    "/favicon-dark.png": "favicon-dark-32.png",
  };
  if (pathname in faviconRoutes) {
    const absFile = path.join(root, faviconRoutes[pathname]);
    if (await serveFaviconPng(req, res, absFile)) return;
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (pathname.includes("\0")) {
    res.writeHead(400);
    res.end();
    return;
  }
  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  rel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(root, rel);
  if (!isPathInsideRoot(filePath)) {
    res.writeHead(403);
    res.end();
    return;
  }
  let st;
  try {
    st = await fs.stat(filePath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  if (st.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    try {
      st = await fs.stat(filePath);
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
  }
  if (!st.isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  if (req.method === "HEAD") {
    res.writeHead(200, { "Content-Type": type, "Content-Length": String(st.size) });
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

const preferredPort = Number(process.env.PORT) || 8787;
const maxPortTries = 20;

const server = http.createServer((req, res) => {
  if (req.method === "PUT" && req.url?.split("?")[0] === "/api/custom-items") {
    void handlePutCustomItems(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    void handleStatic(req, res);
    return;
  }
  res.writeHead(405, { Allow: "GET, HEAD, PUT" });
  res.end();
});

function listenWithFallback(port, triesLeft) {
  server.once("error", (err) => {
    const e = /** @type {NodeJS.ErrnoException} */ (err);
    if (e.code === "EADDRINUSE" && triesLeft > 1) {
      console.warn(`Port ${port} busy, trying ${port + 1}…`);
      if (port === preferredPort) {
        console.warn(
          "Tip: another `npm run dev` may still be running (another terminal, or Ctrl+Z suspended). " +
            "Open only the URL printed below, or free the port: lsof -nP -iTCP:" +
            port +
            " -sTCP:LISTEN"
        );
      }
      listenWithFallback(port + 1, triesLeft - 1);
      return;
    }
    console.error(e);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Timeless Wardrobe dev server → http://127.0.0.1:${port}/`);
    console.log("PUT /api/custom-items writes data/custom-items.json");
  });
}

listenWithFallback(preferredPort, maxPortTries);
