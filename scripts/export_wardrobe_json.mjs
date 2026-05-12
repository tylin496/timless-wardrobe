#!/usr/bin/env node
/**
 * Export data/wardrobe.js → data/wardrobe.json for tooling / inspection.
 *
 *   node scripts/export_wardrobe_json.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsPath = path.join(root, "data", "wardrobe.js");
const jsonPath = path.join(root, "data", "wardrobe.json");

const code = fs.readFileSync(jsPath, "utf8");
const fn = new Function(`${code}\n;return WARDROBE_ITEMS;`);
const items = fn();
if (!Array.isArray(items)) {
  console.error("WARDROBE_ITEMS not found in wardrobe.js");
  process.exit(1);
}
fs.writeFileSync(jsonPath, JSON.stringify(items, null, 2), "utf8");
console.log(`Wrote ${jsonPath} (${items.length} items).`);
