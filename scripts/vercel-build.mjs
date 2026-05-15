#!/usr/bin/env node
/**
 * Copy static site assets into `dist/` for Vercel (avoids Output Directory = public 404s).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const rootFiles = [
  "index.html",
  "archive.html",
  "item.html",
  "app.js",
  "styles.css",
  "logo.png",
  "cover.png",
];

const rootDirs = ["js", "data", "images", "public"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const name of rootFiles) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, name));
}

for (const name of rootDirs) {
  const src = path.join(root, name);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(dist, name), { recursive: true });
}

const faviconLight32 = path.join(root, "favicon-light-32.png");
if (fs.existsSync(faviconLight32)) {
  fs.copyFileSync(faviconLight32, path.join(dist, "favicon-light.png"));
  fs.copyFileSync(faviconLight32, path.join(dist, "favicon.png"));
}
const faviconDark32 = path.join(root, "favicon-dark-32.png");
if (fs.existsSync(faviconDark32)) {
  fs.copyFileSync(faviconDark32, path.join(dist, "favicon-dark.png"));
}

console.log("Vercel static build → dist/");
