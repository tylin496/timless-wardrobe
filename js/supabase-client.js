import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** @param {import('@supabase/supabase-js').SupabaseClient} client */
export function createBrowserClient(url, key) {
  if (!url || !key) return null;
  return createClient(url, key);
}

/** @param {unknown} g */
function normalizeGallery(g) {
  if (Array.isArray(g)) return g.map((x) => String(x)).filter(Boolean);
  if (typeof g === "string" && g.trim()) {
    try {
      const p = JSON.parse(g);
      if (Array.isArray(p)) return p.map((x) => String(x)).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** @param {Record<string, unknown>} row */
export function mapRowToItem(row) {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : null;
  const cv = meta && Array.isArray(/** @type {{ colorVariants?: unknown }} */ (meta).colorVariants)
    ? /** @type {{ colorVariants: unknown[] }} */ (meta).colorVariants
    : null;
  return {
    id: String(row.id ?? ""),
    pillar: String(row.pillar ?? ""),
    section: String(row.section ?? ""),
    category: String(row.category ?? ""),
    brand: String(row.brand ?? ""),
    name: String(row.name ?? ""),
    season: String(row.season ?? ""),
    color: String(row.color ?? ""),
    fabric: String(row.fabric ?? ""),
    weight: String(row.weight ?? ""),
    size: String(row.size ?? ""),
    measuredDimensions: String(row.measured_dimensions ?? ""),
    purchaseDate: String(row.purchase_date ?? ""),
    image: String(row.image ?? ""),
    gallery: normalizeGallery(row.gallery),
    notes: String(row.notes ?? ""),
    ...(cv && cv.length ? { colorVariants: cv } : {}),
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<{ ok: true, items: object[] } | { ok: false, error: string }>}
 */
export async function fetchWardrobeItems(client) {
  const { data, error } = await client
    .from("wardrobe_items")
    .select(
      "id, pillar, section, category, brand, name, season, color, fabric, weight, size, measured_dimensions, purchase_date, image, gallery, notes, metadata"
    )
    .order("section", { ascending: true })
    .order("category", { ascending: true })
    .order("brand", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const items = (data || []).map(mapRowToItem);
  return { ok: true, items };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<{ ok: true, outfits: { id: string, name: string, slots: { itemId: string, colorKey?: string }[], createdAt: string }[] } | { ok: false, error: string }>}
 */
export async function fetchOutfits(client) {
  const { data, error } = await client
    .from("outfits")
    .select("id, name, created_at, outfit_items(item_id, sort_order, color_key)")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  /** @type {{ id: string, name: string, slots: { itemId: string, colorKey?: string }[], createdAt: string }[]} */
  const outfits = [];
  for (const row of data || []) {
    const links = Array.isArray(row.outfit_items) ? row.outfit_items : [];
    links.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const slots = links.map((x) => {
      const itemId = String(x.item_id ?? "").trim();
      const ck = x.color_key != null ? String(x.color_key).trim() : "";
      return ck ? { itemId, colorKey: ck } : { itemId };
    });
    outfits.push({
      id: String(row.id),
      name: String(row.name ?? ""),
      slots,
      createdAt: row.created_at
        ? new Date(row.created_at).toISOString()
        : new Date().toISOString(),
    });
  }
  return { ok: true, outfits };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ id: string, name: string, slots?: { itemId: string, colorKey?: string }[], itemIds?: string[], createdAt: string }} record
 */
export async function insertOutfitWithItems(client, record) {
  const { error: e1 } = await client.from("outfits").insert({
    id: record.id,
    name: record.name,
    created_at: record.createdAt,
  });
  if (e1) return { ok: false, error: e1.message };

  const slots =
    Array.isArray(record.slots) && record.slots.length
      ? record.slots
      : Array.isArray(record.itemIds)
        ? record.itemIds.map((itemId) => ({ itemId: String(itemId) }))
        : [];
  const rows = slots.map((s, sort_order) => ({
    outfit_id: record.id,
    item_id: String(s.itemId ?? "").trim(),
    sort_order,
    color_key: s.colorKey && String(s.colorKey).trim() ? String(s.colorKey).trim() : null,
  }));
  const { error: e2 } = await client.from("outfit_items").insert(rows);
  if (e2) {
    await client.from("outfits").delete().eq("id", record.id);
    return { ok: false, error: e2.message };
  }
  return { ok: true };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} id
 */
export async function deleteOutfitById(client, id) {
  const { error } = await client.from("outfits").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Replace name and line items for an existing outfit (local id must match cloud row).
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ id: string, name: string, slots: { itemId: string, colorKey?: string }[] }} record
 */
export async function updateOutfitWithItems(client, record) {
  const { error: eDel } = await client.from("outfit_items").delete().eq("outfit_id", record.id);
  if (eDel) return { ok: false, error: eDel.message };

  const { error: eUp } = await client.from("outfits").update({ name: record.name }).eq("id", record.id);
  if (eUp) return { ok: false, error: eUp.message };

  const slots = Array.isArray(record.slots) ? record.slots : [];
  const rows = slots.map((s, sort_order) => ({
    outfit_id: record.id,
    item_id: String(s.itemId ?? "").trim(),
    sort_order,
    color_key: s.colorKey && String(s.colorKey).trim() ? String(s.colorKey).trim() : null,
  }));
  if (rows.length) {
    const { error: eIns } = await client.from("outfit_items").insert(rows);
    if (eIns) return { ok: false, error: eIns.message };
  }
  return { ok: true };
}
