#!/usr/bin/env node
/**
 * Rename catalogue ids + image folders to slug(item.name), using wardrobe-catalogue-lock.json
 * as the canonical target list (handles duplicate product names via colour suffixes).
 *
 *   node scripts/migrate_wardrobe_ids_to_name_slug.mjs
 *   node scripts/migrate_wardrobe_ids_to_name_slug.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileItemsFromJs } from "./lib/wardrobe-text.mjs";
import { formatWardrobeJsFile } from "./lib/cloud-to-seed.mjs";
import { resolveTargetIdFromLock } from "./lib/item-id-slug.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

const wardrobeJsPath = path.join(root, "data", "wardrobe.js");
const lockPath = path.join(root, "data", "wardrobe-catalogue-lock.json");
const imagesRoot = path.join(root, "images", "wardrobe");
const mapPath = path.join(root, "data", "item-id-migration-map.json");

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const lockIds = Array.isArray(lock.ids) ? lock.ids.map(String).filter(Boolean) : [];
if (lockIds.length !== lock.count) {
  console.error(`Lock count mismatch: ${lockIds.length} ids vs count ${lock.count}`);
  process.exit(1);
}

const items = readFileItemsFromJs(wardrobeJsPath, fs);
if (items.length !== lockIds.length) {
  console.error(`Item count ${items.length} !== lock count ${lock.count}`);
  process.exit(1);
}

const assigned = new Set();
/** @type {Map<string, string>} */
const oldToNew = new Map();

for (const item of items) {
  const oldId = String(item.id ?? "").trim();
  const newId = resolveTargetIdFromLock(item, lockIds, assigned);
  if (oldId !== newId) oldToNew.set(oldId, newId);
}

if (assigned.size !== lockIds.length) {
  const missing = lockIds.filter((id) => !assigned.has(id));
  const extra = [...assigned].filter((id) => !lockIds.includes(id));
  console.error("Assignment failed.", { missing, extra });
  process.exit(1);
}

console.log(`Items: ${items.length}, renames: ${oldToNew.size}`);
if (dryRun) {
  for (const [oldId, newId] of [...oldToNew.entries()].sort()) {
    console.log(`${oldId} → ${newId}`);
  }
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
fs.copyFileSync(wardrobeJsPath, path.join(root, "data", `wardrobe.js.backup-id-migration-${stamp}`));

function rewritePathsInValue(val, oldId, newId) {
  if (typeof val === "string") {
    return val
      .split(`/images/wardrobe/${oldId}/`)
      .join(`/images/wardrobe/${newId}/`)
      .split(`/images/wardrobe/${oldId}`)
      .join(`/images/wardrobe/${newId}`);
  }
  if (Array.isArray(val)) return val.map((x) => rewritePathsInValue(x, oldId, newId));
  if (val && typeof val === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = rewritePathsInValue(v, oldId, newId);
    return out;
  }
  return val;
}

for (const [oldId, newId] of oldToNew) {
  const from = path.join(imagesRoot, oldId);
  const to = path.join(imagesRoot, newId);
  if (!fs.existsSync(from)) {
    console.warn(`  skip mv (missing): ${oldId}`);
    continue;
  }
  if (fs.existsSync(to)) {
    console.error(`  target exists: ${newId}`);
    process.exit(1);
  }
  fs.renameSync(from, to);
  console.log(`  mv ${oldId} → ${newId}`);
}

const migrated = items.map((item) => {
  const oldId = String(item.id ?? "").trim();
  const newId = oldToNew.get(oldId) ?? oldId;
  let next = { ...item, id: newId };
  if (oldId !== newId) next = rewritePathsInValue(next, oldId, newId);
  return next;
});

const migratedAt = new Date().toISOString();
fs.writeFileSync(
  wardrobeJsPath,
  formatWardrobeJsFile(migrated, migratedAt).replace(
    "Images: full `https://…` public URLs (Supabase `wardrobe-images` bucket).",
    "Images: local files under `/images/wardrobe/` (backed up from Supabase Storage)."
  ),
  "utf8"
);

const mapObj = Object.fromEntries([...oldToNew.entries()].sort());
fs.writeFileSync(
  mapPath,
  JSON.stringify(
    {
      _schema: "timeless-wardrobe-item-id-migration-v1",
      migratedAt,
      count: Object.keys(mapObj).length,
      map: mapObj,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`Wrote ${path.relative(root, wardrobeJsPath)}`);
console.log(`Wrote ${path.relative(root, mapPath)}`);
