#!/usr/bin/env node
/**
 * Prune Supabase Storage bucket `wardrobe-images`:
 *
 * 1. Deletes objects not referenced by `wardrobe_items` (image, gallery, metadata) or
 *    `wardrobe_app_state.archive_overrides`.
 * 2. Deletes referenced objects whose pixel size is below a minimum (short side), then strips
 *    those URLs from `wardrobe_items` and `wardrobe_app_state` so rows do not point at 404s.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).
 *
 * Env:
 *   MIN_IMAGE_SHORT_SIDE   default 500 — delete if min(width,height) < this (0 = skip low-res pass)
 *   DRY_RUN=1             list actions only, no DB or Storage writes
 *
 *   DRY_RUN=1 node scripts/prune_wardrobe_storage_orphans.mjs
 *   node scripts/prune_wardrobe_storage_orphans.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import imageSize from "image-size";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const BUCKET = "wardrobe-images";

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0" && process.env.DRY_RUN !== "false");
const minShortSide = Math.max(0, parseInt(process.env.MIN_IMAGE_SHORT_SIDE || "500", 10) || 0);

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example).");
  process.exit(1);
}

/** @param {string} u */
function storagePathFromUrl(u) {
  const s = String(u ?? "").trim().split("?")[0];
  if (!s || !/^https?:\/\//i.test(s)) return "";
  const esc = BUCKET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`/storage/v1/(?:object/public|render/image/public)/${esc}/(.+)$`, "i");
  const m = s.match(re);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function publicUrlForPath(baseUrl, bucket, objectPath) {
  const rootUrl = String(baseUrl).replace(/\/$/, "");
  const enc = objectPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${rootUrl}/storage/v1/object/public/${bucket}/${enc}`;
}

/** @param {string} publicUrl */
async function probeDimensions(publicUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(publicUrl, { signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.length > 98304 ? buf.subarray(0, 98304) : buf;
    try {
      const dim = imageSize(head);
      if (!dim?.width || !dim?.height) return null;
      return { width: dim.width, height: dim.height };
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {unknown} obj @param {string[]} out */
function collectStrings(obj, out) {
  if (obj == null) return;
  if (typeof obj === "string") {
    out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectStrings(x, out);
    return;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
}

/** @param {import("@supabase/supabase-js").SupabaseClient} client @param {string} prefix */
async function listAllObjectPaths(client, prefix = "") {
  const paths = [];
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit, offset });
    if (error) throw error;
    const batch = data || [];
    if (!batch.length) break;
    for (const entry of batch) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const meta = entry.metadata;
      const isFile = Boolean(meta && typeof meta === "object" && typeof meta.mimetype === "string");
      if (isFile) {
        paths.push(rel);
      } else {
        const nested = await listAllObjectPaths(client, rel);
        paths.push(...nested);
      }
    }
    if (batch.length < limit) break;
    offset += limit;
  }
  return paths;
}

function normalizeGallery(g) {
  if (Array.isArray(g)) return g.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof g === "string" && g.trim()) {
    try {
      const p = JSON.parse(g);
      if (Array.isArray(p)) return p.map((x) => String(x ?? "").trim()).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** @param {unknown} v @param {Set<string>} pathSet */
function stripUrlsDeep(v, pathSet) {
  if (v == null) return v;
  if (typeof v === "string") {
    const p = storagePathFromUrl(v);
    if (p && pathSet.has(p)) return "";
    return v;
  }
  if (Array.isArray(v)) {
    return v
      .map((x) => stripUrlsDeep(x, pathSet))
      .filter((x) => !(typeof x === "string" && x === ""));
  }
  if (typeof v === "object") {
    const o = /** @type {Record<string, unknown>} */ ({});
    for (const [k, val] of Object.entries(v)) {
      o[k] = stripUrlsDeep(val, pathSet);
    }
    return o;
  }
  return v;
}

/** @param {Record<string, unknown>} row @param {Set<string>} pathSet */
function patchWardrobeRow(row, pathSet) {
  const id = String(row.id ?? "");
  let image = String(row.image ?? "").trim();
  const ip = storagePathFromUrl(image);
  if (ip && pathSet.has(ip)) image = "";

  let gallery = normalizeGallery(row.gallery).filter((u) => {
    const p = storagePathFromUrl(u);
    return !p || !pathSet.has(p);
  });

  let metadata = row.metadata;
  if (metadata && typeof metadata === "object") {
    metadata = stripUrlsDeep(metadata, pathSet);
  }

  const before = JSON.stringify({
    image: row.image,
    gallery: normalizeGallery(row.gallery),
    metadata: row.metadata,
  });
  const after = JSON.stringify({ image, gallery, metadata });
  if (before === after) return null;
  return { id, image, gallery, metadata };
}

async function main() {
  const admin = createClient(url, serviceKey);
  const referenced = new Set();

  function refUrl(u) {
    const p = storagePathFromUrl(u);
    if (p) referenced.add(p);
  }

  const { data: rows, error: e1 } = await admin
    .from("wardrobe_items")
    .select("id, image, gallery, metadata");
  if (e1) throw e1;
  for (const r of rows || []) {
    refUrl(r.image);
    for (const u of normalizeGallery(r.gallery)) refUrl(u);
    const strings = [];
    collectStrings(r.metadata, strings);
    for (const s of strings) {
      if (/^https?:\/\//i.test(s)) refUrl(s);
    }
  }

  const { data: st, error: e2 } = await admin.from("wardrobe_app_state").select("*").eq("id", "default").maybeSingle();
  if (e2 && e2.code !== "PGRST116") console.warn("wardrobe_app_state:", e2.message);
  const ovStrings = [];
  collectStrings(st?.archive_overrides, ovStrings);
  for (const s of ovStrings) {
    if (/^https?:\/\//i.test(s)) refUrl(s);
  }

  console.info(`Referenced Storage paths: ${referenced.size}`);
  console.info(`MIN_IMAGE_SHORT_SIDE=${minShortSide} (${minShortSide ? "low-res referenced files will be removed" : "disabled"})`);

  const allPaths = await listAllObjectPaths(admin);
  console.info(`Total objects in ${BUCKET}: ${allPaths.length}`);

  const allPathSet = new Set(allPaths);
  const orphans = allPaths.filter((p) => !referenced.has(p));
  console.info(`Orphans (not referenced): ${orphans.length}`);

  /** @type {Set<string>} */
  const lowResReferenced = new Set();
  if (minShortSide > 0) {
    const toProbe = [...referenced].filter((p) => allPathSet.has(p));
    console.info(`Probing dimensions for ${toProbe.length} referenced objects…`);
    let n = 0;
    for (const p of toProbe) {
      n += 1;
      if (n % 25 === 0) console.info(`  …${n}/${toProbe.length}`);
      const pub = publicUrlForPath(url, BUCKET, p);
      const dim = await probeDimensions(pub);
      if (!dim) continue;
      const short = Math.min(dim.width, dim.height);
      if (short < minShortSide) {
        lowResReferenced.add(p);
        console.info(`  low-res: ${p} (${dim.width}×${dim.height}, short=${short})`);
      }
    }
    console.info(`Low-resolution referenced (short side < ${minShortSide}): ${lowResReferenced.size}`);
  }

  const toDelete = new Set([...orphans, ...lowResReferenced]);
  console.info(`Total Storage objects to remove: ${toDelete.size}`);

  if (!toDelete.size) {
    console.info("Nothing to delete.");
    return;
  }

  const rowPatches = [];
  for (const r of rows || []) {
    const patch = patchWardrobeRow(r, lowResReferenced);
    if (patch) rowPatches.push(patch);
  }

  let nextOverrides = st?.archive_overrides;
  if (lowResReferenced.size && nextOverrides && typeof nextOverrides === "object") {
    nextOverrides = stripUrlsDeep(nextOverrides, lowResReferenced);
  }

  const stateDirty =
    st &&
    lowResReferenced.size &&
    JSON.stringify(st.archive_overrides) !== JSON.stringify(nextOverrides);

  if (dryRun) {
    console.info("DRY_RUN — no writes.");
    if (rowPatches.length) console.info(`Would update wardrobe_items rows: ${rowPatches.length}`);
    if (stateDirty) console.info("Would update wardrobe_app_state.archive_overrides");
    return;
  }

  for (const patch of rowPatches) {
    const { id, ...rest } = patch;
    const { error } = await admin.from("wardrobe_items").update(rest).eq("id", id);
    if (error) {
      console.error("wardrobe_items update failed:", id, error.message);
      process.exit(1);
    }
  }
  if (rowPatches.length) console.info(`Updated wardrobe_items rows: ${rowPatches.length}`);

  if (stateDirty && st) {
    const { error } = await admin
      .from("wardrobe_app_state")
      .update({
        archive_overrides: nextOverrides,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
    if (error) {
      console.error("wardrobe_app_state update failed:", error.message);
      process.exit(1);
    }
    console.info("Updated wardrobe_app_state.archive_overrides");
  }

  const deleteList = [...toDelete];
  const batchSize = 100;
  let deleted = 0;
  for (let i = 0; i < deleteList.length; i += batchSize) {
    const chunk = deleteList.slice(i, i + batchSize);
    const { error } = await admin.storage.from(BUCKET).remove(chunk);
    if (error) {
      console.error("storage remove failed:", error.message, chunk.slice(0, 5));
      process.exit(1);
    }
    deleted += chunk.length;
    console.info(`Removed from Storage ${deleted}/${deleteList.length}`);
  }
  console.info("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
