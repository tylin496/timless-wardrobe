#!/usr/bin/env node
/**
 * Migrate Supabase wardrobe_items ids (and Storage paths) to name slugs.
 * Uses data/item-id-migration-map.json from the local catalogue migration.
 *
 *   npm run db:migrate-supabase-ids
 *   DRY_RUN=1 npm run db:migrate-supabase-ids
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REPO_ROOT, createServiceClient } from "./lib/supabase-env.mjs";
import {
  WARDROBE_IMAGE_BUCKET,
  storagePathFromWardrobeImageUrl,
} from "./lib/wardrobe-image-local.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = WARDROBE_IMAGE_BUCKET;
const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

/** Per-colour outfit lines saved before variant merge (client legacy). */
const LEGACY_OUTFIT_ITEM_IDS = {
  "uniqlo-ocbd-shirt-blue": { itemId: "ocbd-shirt", colourKey: "blue" },
  "uniqlo-ocbd-shirt-white": { itemId: "ocbd-shirt", colourKey: "white" },
  "uniqlo-ocbd-shirt-pink-stripe": { itemId: "ocbd-shirt", colourKey: "pink-stripe" },
  "uniqlo-ocbd-shirt-blue-striped": { itemId: "ocbd-shirt", colourKey: "blue-striped" },
  "uniqlo-tuck-trousers-grey": { itemId: "pleated-trousers", colourKey: "grey" },
  "uniqlo-tuck-trousers-beige": { itemId: "pleated-trousers", colourKey: "beige" },
};

function publicUrlForPath(baseUrl, objectPath) {
  const rootUrl = String(baseUrl).replace(/\/$/, "");
  const enc = objectPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${rootUrl}/storage/v1/object/public/${BUCKET}/${enc}`;
}

/** @param {string} url @param {string} oldId @param {string} newId @param {string} baseUrl */
function rewriteWardrobeUrl(url, oldId, newId, baseUrl) {
  const s = String(url ?? "").trim();
  if (!s) return s;
  const p = storagePathFromWardrobeImageUrl(s);
  if (p && (p === oldId || p.startsWith(`${oldId}/`))) {
    const tail = p === oldId ? "" : p.slice(oldId.length + 1);
    const newPath = tail ? `${newId}/${tail}` : newId;
    return publicUrlForPath(baseUrl, newPath);
  }
  if (s.includes(`/wardrobe/${oldId}/`) || s.includes(`/${oldId}/main/`) || s.includes(`/${oldId}/variants/`)) {
    return s.split(`/${oldId}/`).join(`/${newId}/`);
  }
  return s;
}

/** @param {unknown} value @param {string} oldId @param {string} newId @param {string} baseUrl */
function rewriteValueDeep(value, oldId, newId, baseUrl) {
  if (value == null) return value;
  if (typeof value === "string") return rewriteWardrobeUrl(value, oldId, newId, baseUrl);
  if (Array.isArray(value)) return value.map((v) => rewriteValueDeep(v, oldId, newId, baseUrl));
  if (typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteValueDeep(v, oldId, newId, baseUrl);
    return out;
  }
  return value;
}

/** @param {Record<string, unknown>} row @param {string} oldId @param {string} newId @param {string} baseUrl */
function wardrobeRowForNewId(row, oldId, newId, baseUrl) {
  const next = { ...row, id: newId };
  if (next.image) next.image = rewriteWardrobeUrl(String(next.image), oldId, newId, baseUrl);
  if (Array.isArray(next.gallery)) {
    next.gallery = next.gallery.map((u) => rewriteWardrobeUrl(String(u), oldId, newId, baseUrl));
  }
  if (next.metadata && typeof next.metadata === "object") {
    next.metadata = rewriteValueDeep(next.metadata, oldId, newId, baseUrl);
  }
  return next;
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
      if (isFile) paths.push(rel);
      else {
        const nested = await listAllObjectPaths(client, rel);
        paths.push(...nested);
      }
    }
    if (batch.length < limit) break;
    offset += limit;
  }
  return paths;
}

/** @param {import("@supabase/supabase-js").SupabaseClient} client */
async function moveStorageItemPrefix(client, oldId, newId) {
  const paths = await listAllObjectPaths(client, oldId);
  if (!paths.length) return { moved: 0, skipped: 0 };
  let moved = 0;
  let skipped = 0;
  for (const src of paths) {
    const dest = `${newId}/${src.slice(oldId.length + 1)}`;
    if (dryRun) {
      console.log(`  storage: ${src} → ${dest}`);
      moved++;
      continue;
    }
    const { error } = await client.storage.from(BUCKET).move(src, dest);
    if (error) {
      const { error: copyErr } = await client.storage.from(BUCKET).copy(src, dest);
      if (copyErr) {
        console.warn(`  storage FAIL ${src}:`, error.message, "| copy:", copyErr.message);
        skipped++;
        continue;
      }
      await client.storage.from(BUCKET).remove([src]);
    }
    moved++;
  }
  return { moved, skipped };
}

/** @param {import("@supabase/supabase-js").SupabaseClient} client */
async function removeStoragePrefix(client, itemId) {
  const paths = await listAllObjectPaths(client, itemId);
  if (!paths.length) return 0;
  if (dryRun) {
    console.log(`  storage remove prefix ${itemId}/ (${paths.length} files)`);
    return paths.length;
  }
  const chunk = 100;
  let n = 0;
  for (let i = 0; i < paths.length; i += chunk) {
    const { error } = await client.storage.from(BUCKET).remove(paths.slice(i, i + chunk));
    if (error) console.warn(`  storage remove failed:`, error.message);
    else n += Math.min(chunk, paths.length - i);
  }
  return n;
}

/** @param {Record<string, object>} overrides @param {Map<string, string>} idMap */
function rewriteOverrideKeys(overrides, idMap) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [key, val] of Object.entries(overrides)) {
    const nk = idMap.get(key) || key;
    out[nk] = val;
  }
  return out;
}

function loadIdMigrationMap() {
  const p = path.join(REPO_ROOT, "data", "item-id-migration-map.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const map = raw?.map && typeof raw.map === "object" ? raw.map : raw;
  /** @type {Map<string, string>} */
  const idMap = new Map();
  for (const [oldId, newId] of Object.entries(map)) {
    if (oldId && newId && oldId !== newId) idMap.set(String(oldId), String(newId));
  }
  return idMap;
}

const { url: supabaseUrl, client } = createServiceClient(createClient);
const idMap = loadIdMigrationMap();

console.log(`Supabase item-id migration${dryRun ? " (DRY RUN)" : ""}`);
console.log(`Map entries: ${idMap.size}`);

const { data: wardrobeRows, error: wErr } = await client.from("wardrobe_items").select("*");
if (wErr) {
  console.error("wardrobe_items fetch:", wErr.message);
  process.exit(1);
}
const byId = new Map((wardrobeRows || []).map((r) => [String(r.id), r]));

const { data: outfitLinks, error: oErr } = await client
  .from("outfit_items")
  .select("outfit_id, item_id, sort_order, colour_key");
if (oErr) {
  console.error("outfit_items fetch:", oErr.message);
  process.exit(1);
}

let inserted = 0;
let deleted = 0;
let outfitUpdates = 0;
let storageMoved = 0;
let skipped = 0;

for (const [oldId, newId] of idMap) {
  const oldRow = byId.get(oldId);
  const newRow = byId.get(newId);
  if (!oldRow && !newRow) {
    skipped++;
    continue;
  }
  if (!oldRow && newRow) {
    continue;
  }

  console.log(`\n${oldId} → ${newId}`);

  if (oldRow && newRow) {
    console.log("  duplicate rows — drop old, relink outfits");
    for (const link of outfitLinks || []) {
      if (String(link.item_id) !== oldId) continue;
      if (dryRun) {
        console.log(`  outfit_items ${link.outfit_id}#${link.sort_order}: ${oldId} → ${newId}`);
      } else {
        const { error } = await client
          .from("outfit_items")
          .update({ item_id: newId })
          .eq("outfit_id", link.outfit_id)
          .eq("item_id", oldId)
          .eq("sort_order", link.sort_order);
        if (error) console.warn("  outfit_items update:", error.message);
      }
      outfitUpdates++;
    }
    if (!dryRun) {
      const { error } = await client.from("wardrobe_items").delete().eq("id", oldId);
      if (error) console.warn("  delete old row:", error.message);
      else deleted++;
    } else {
      deleted++;
    }
    byId.delete(oldId);
    const oldPaths = await listAllObjectPaths(client, oldId);
    const newPaths = await listAllObjectPaths(client, newId);
    if (oldPaths.length && !newPaths.length) {
      const st = await moveStorageItemPrefix(client, oldId, newId);
      storageMoved += st.moved;
    } else if (oldPaths.length) {
      await removeStoragePrefix(client, oldId);
    }
    continue;
  }

  const nextRow = wardrobeRowForNewId(oldRow, oldId, newId, supabaseUrl);
  const st = await moveStorageItemPrefix(client, oldId, newId);
  storageMoved += st.moved;

  if (!dryRun) {
    const { error: insErr } = await client.from("wardrobe_items").upsert(nextRow, { onConflict: "id" });
    if (insErr) {
      console.error("  upsert new row:", insErr.message);
      process.exit(1);
    }
    inserted++;
  } else {
    console.log("  upsert new wardrobe_items row");
    inserted++;
  }

  for (const link of outfitLinks || []) {
    let targetItemId = String(link.item_id);
    let colourKey = String(link.colour_key ?? "").trim();
    const leg = LEGACY_OUTFIT_ITEM_IDS[targetItemId];
    if (leg) {
      targetItemId = leg.itemId;
      if (!colourKey) colourKey = leg.colourKey;
    }
    if (targetItemId !== oldId) continue;
    if (dryRun) {
      console.log(`  outfit_items ${link.outfit_id}#${link.sort_order}: ${oldId} → ${newId}${colourKey ? ` (${colourKey})` : ""}`);
    } else {
      const { error } = await client
        .from("outfit_items")
        .update({ item_id: newId, colour_key: colourKey || null })
        .eq("outfit_id", link.outfit_id)
        .eq("item_id", oldId)
        .eq("sort_order", link.sort_order);
      if (error) console.warn("  outfit_items update:", error.message);
    }
    outfitUpdates++;
  }

  if (!dryRun) {
    const { error: delErr } = await client.from("wardrobe_items").delete().eq("id", oldId);
    if (delErr) console.warn("  delete old row:", delErr.message);
    else deleted++;
  } else {
    deleted++;
  }
  byId.delete(oldId);
  byId.set(newId, nextRow);
}

for (const [legacyId, leg] of Object.entries(LEGACY_OUTFIT_ITEM_IDS)) {
  for (const link of outfitLinks || []) {
    if (String(link.item_id) !== legacyId) continue;
    const colourKey = String(link.colour_key ?? "").trim() || leg.colourKey;
    if (dryRun) {
      console.log(`\nlegacy outfit ${legacyId} → ${leg.itemId} (${colourKey})`);
    } else {
      const { error } = await client
        .from("outfit_items")
        .update({ item_id: leg.itemId, colour_key: colourKey || null })
        .eq("outfit_id", link.outfit_id)
        .eq("item_id", legacyId)
        .eq("sort_order", link.sort_order);
      if (error) console.warn("legacy outfit_items:", error.message);
    }
    outfitUpdates++;
  }
}

const { data: stateRow, error: sErr } = await client
  .from("wardrobe_app_state")
  .select("*")
  .eq("id", "default")
  .maybeSingle();
if (sErr && sErr.code !== "PGRST116") {
  console.warn("wardrobe_app_state:", sErr.message);
} else if (stateRow) {
  const overrides =
    stateRow.collection_overrides && typeof stateRow.collection_overrides === "object"
      ? stateRow.collection_overrides
      : stateRow.archive_overrides && typeof stateRow.archive_overrides === "object"
        ? stateRow.archive_overrides
        : {};
  const hiddenRaw = Array.isArray(stateRow.collection_hidden_ids)
    ? stateRow.collection_hidden_ids
    : Array.isArray(stateRow.archive_hidden_ids)
      ? stateRow.archive_hidden_ids
      : [];
  const newOverrides = rewriteOverrideKeys(overrides, idMap);
  const newHidden = hiddenRaw.map((id) => idMap.get(String(id)) || String(id));
  const changed =
    JSON.stringify(newOverrides) !== JSON.stringify(overrides) ||
    JSON.stringify(newHidden) !== JSON.stringify(hiddenRaw);
  if (changed) {
    const patch = {
      id: "default",
      updated_at: new Date().toISOString(),
    };
    if (stateRow.collection_overrides !== undefined) {
      patch.collection_overrides = newOverrides;
      patch.collection_hidden_ids = newHidden;
    } else {
      patch.archive_overrides = newOverrides;
      patch.archive_hidden_ids = newHidden;
    }
    if (dryRun) {
      console.log("\nWould update wardrobe_app_state override/hidden id keys");
    } else {
      const { error } = await client.from("wardrobe_app_state").upsert(patch, { onConflict: "id" });
      if (error) console.warn("wardrobe_app_state upsert:", error.message);
      else console.log("\nUpdated wardrobe_app_state id keys");
    }
  }
}

const { count, error: cErr } = await client.from("wardrobe_items").select("id", { count: "exact", head: true });
if (!cErr) console.log(`\nwardrobe_items count: ${count}`);

console.log(
  `\nDone. upserted=${inserted} deleted_old=${deleted} outfit_links=${outfitUpdates} storage_moved≈${storageMoved} skipped_missing=${skipped}${dryRun ? " (dry run)" : ""}`
);

if (!dryRun) {
  console.log("\nNext: reload the collection — cloud ids should match the frozen catalogue lock.");
}
