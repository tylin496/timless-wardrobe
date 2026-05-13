(function () {
  const STORAGE_KEY = "timeless-wardrobe-outfits-v1";
  const MAX_OUTFIT_ITEMS = 16;
  const OUTFIT_STORAGE_VERSION = 2;

  /** Split archive rows merged into one id — remap saved outfit lines. */
  const LEGACY_OUTFIT_ITEM_TO_SLOT = new Map([
    ["uniqlo-ocbd-shirt-blue", { itemId: "uniqlo-ocbd-shirt", colorKey: "blue" }],
    ["uniqlo-ocbd-shirt-white", { itemId: "uniqlo-ocbd-shirt", colorKey: "white" }],
    ["uniqlo-ocbd-shirt-pink-stripe", { itemId: "uniqlo-ocbd-shirt", colorKey: "pink-stripe" }],
    ["uniqlo-ocbd-shirt-blue-striped", { itemId: "uniqlo-ocbd-shirt", colorKey: "blue-striped" }],
    ["uniqlo-tuck-trousers-grey", { itemId: "uniqlo-tuck-trousers", colorKey: "grey" }],
    ["uniqlo-tuck-trousers-beige", { itemId: "uniqlo-tuck-trousers", colorKey: "beige" }],
  ]);

  /**
   * Optional `colorVariants` on a wardrobe row: same product, different colours / images.
   * @returns {{ key: string, label: string, color: string, image: string, gallery: string[], notes: string }[] | null}
   */
  function getItemColorVariants(item) {
    const raw = item?.colorVariants;
    if (!Array.isArray(raw) || !raw.length) return null;
    const out = [];
    for (const v of raw) {
      if (!v || typeof v !== "object") continue;
      const key = String(v.key ?? "").trim();
      const image = String(v.image ?? "").trim();
      if (!key || !image) continue;
      out.push({
        key,
        label: String(v.label ?? v.color ?? key).trim() || key,
        color: String(v.color ?? "").trim(),
        image,
        gallery: Array.isArray(v.gallery) ? v.gallery.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
        notes: v.notes != null ? String(v.notes) : "",
      });
    }
    return out.length ? out : null;
  }

  /** First `#rgb` / `#rrggbb` in `color` or `label` for grid swatches. */
  function extractSwatchHexFromVariant(v) {
    const pools = [String(v?.color ?? "").trim(), String(v?.label ?? "").trim()];
    for (const p of pools) {
      const m = p.match(/#([0-9a-fA-F]{6})\b|#([0-9a-fA-F]{3})\b/);
      if (!m) continue;
      const raw = m[0];
      let h = raw.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      return `#${h.toLowerCase()}`;
    }
    return "";
  }

  /**
   * Colour dots for `colorVariants` — display only; never changes the cover / hero image.
   * @param {HTMLElement} mountEl
   * @param {object} item
   */
  function mountVariantSwatchStrip(mountEl, item) {
    const variants = getItemColorVariants(item);
    if (!variants?.length) return;
    const sw = document.createElement("div");
    sw.className = "card__swatches";
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "Available colours");
    variants.forEach((v, idx) => {
      const el = document.createElement("span");
      el.className = "card__swatch";
      const lbl = String(v.label ?? v.color ?? "").trim() || `Colour ${idx + 1}`;
      const colorText = String(v.color ?? "").trim();
      const vu = String(v.image ?? "").trim();
      const hex = extractSwatchHexFromVariant(v);
      el.title = [lbl, colorText].filter(Boolean).join(" · ");
      el.setAttribute("aria-label", lbl);
      if (hex) {
        el.style.backgroundColor = hex;
        el.style.boxShadow = "inset 0 0 0 1px rgba(0, 0, 0, 0.2)";
      } else {
        const si = document.createElement("img");
        if (vu) si.src = vu;
        si.alt = "";
        si.setAttribute("aria-hidden", "true");
        el.appendChild(si);
      }
      sw.appendChild(el);
    });
    mountEl.appendChild(sw);
  }

  /** Shallow row shaped for cover / gallery resolution for one outfit slot. */
  function itemProjectionForOutfitSlot(item, slot) {
    const vars = getItemColorVariants(item);
    if (!vars || !slot?.colorKey) return item;
    const v = vars.find((x) => x.key === slot.colorKey);
    if (!v) return item;
    const baseId = String(item.id ?? "");
    return {
      ...item,
      image: v.image,
      color: v.color || item.color,
      gallery: v.gallery.length ? v.gallery : item.gallery,
      __coverCacheKey: `${baseId}::${slot.colorKey}`,
    };
  }

  function outfitSlotKey(slot) {
    const id = String(slot?.itemId ?? "").trim();
    const ck = String(slot?.colorKey ?? "").trim();
    return `${id}::${ck}`;
  }

  function normalizeOutfitSlot(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
      const itemId = raw.trim();
      if (!itemId) return null;
      const leg = LEGACY_OUTFIT_ITEM_TO_SLOT.get(itemId);
      if (leg) return { itemId: leg.itemId, colorKey: leg.colorKey };
      return { itemId };
    }
    if (typeof raw === "object" && raw.itemId != null) {
      let itemId = String(raw.itemId).trim();
      let colorKey = raw.colorKey != null ? String(raw.colorKey).trim() : "";
      const leg = LEGACY_OUTFIT_ITEM_TO_SLOT.get(itemId);
      if (leg) {
        itemId = leg.itemId;
        if (!colorKey) colorKey = leg.colorKey;
      }
      if (!itemId) return null;
      return colorKey ? { itemId, colorKey } : { itemId };
    }
    return null;
  }

  function outfitSlotsFromRecord(o) {
    if (!o) return [];
    if (Array.isArray(o.slots) && o.slots.length) {
      return o.slots.map(normalizeOutfitSlot).filter(Boolean);
    }
    if (Array.isArray(o.itemIds)) {
      return o.itemIds.map(normalizeOutfitSlot).filter(Boolean);
    }
    return [];
  }

  function normalizeSavedOutfitRecord(o) {
    if (!o || typeof o.id !== "string" || typeof o.name !== "string") return null;
    const slots = outfitSlotsFromRecord(o);
    return {
      id: o.id,
      name: o.name,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
      slots,
    };
  }

  const CUSTOM_ITEMS_KEY = "timeless-wardrobe-custom-items-v1";
  /** Merged on top of each `wardrobeBase` row with matching `id` (this browser only). */
  const ITEM_ARCHIVE_OVERRIDES_KEY = "timeless-wardrobe-archive-overrides-v1";
  /** Seed / Supabase row ids removed from the grid in this browser only (not deleted from disk or cloud). */
  const ARCHIVE_HIDDEN_IDS_KEY = "timeless-wardrobe-archive-hidden-v1";
  const SEASON_NAV_STORAGE_KEY = "timeless-wardrobe-season-nav-v1";
  /** Same-tab return from `item.html` → restore main list scroll (short TTL avoids stale jumps). */
  const ARCHIVE_SCROLL_RESTORE_KEY = "timeless-wardrobe-archive-scroll-v1";
  /** Same-tab return → restore category / season / type / search (same TTL as scroll). */
  const ARCHIVE_BROWSE_RESTORE_KEY = "timeless-wardrobe-archive-browse-v1";
  const ARCHIVE_SCROLL_TTL_MS = 20 * 60 * 1000;

  /** Seed / Supabase rows only — merged with `loadCustomItems()` into `items`. */
  /** @type {object[]} */
  let wardrobeBase = [];

  /** Top-level archive category (filter + add-item). */
  const SLOT_CLOTHING = "Clothing";
  const SLOT_ACCESSORIES = "Accessories";
  const SLOT_SHOES = "Shoes";
  const SLOT_JEWELRY = "Jewelry";
  const SLOT_WATCHES = "Watches";
  const SLOT_FRAGRANCE = "Fragrance";

  const SLOT_OPTIONS = [
    SLOT_CLOTHING,
    SLOT_ACCESSORIES,
    SLOT_SHOES,
    SLOT_JEWELRY,
    SLOT_WATCHES,
    SLOT_FRAGRANCE,
  ];

  /**
   * When a row has no specific record type, pick the first real `category` seen in seed for that browse tab
   * (stable sort by `RECORD_CATEGORY_RANK`). If seed has none for a tab, use a safe static leaf.
   */
  const STATIC_RECORD_FALLBACK_BY_SLOT = {
    [SLOT_CLOTHING]: "Tops",
    [SLOT_ACCESSORIES]: "Small accessories",
    [SLOT_SHOES]: "Footwear",
    [SLOT_WATCHES]: "Dress watch",
    [SLOT_JEWELRY]: "Necklace",
    [SLOT_FRAGRANCE]: "Fragrance",
  };

  /** Legacy `category` values that only encoded browse tab — mapped for `itemSlot()` and migration off storage. */
  const LEGACY_UNSPEC_CATEGORY_TO_SLOT = {
    "Unspecified clothing": SLOT_CLOTHING,
    "Unspecified accessories": SLOT_ACCESSORIES,
    "Unspecified footwear": SLOT_SHOES,
    "Unspecified watches": SLOT_WATCHES,
    "Unspecified jewelry": SLOT_JEWELRY,
    "Unspecified perfume": SLOT_FRAGRANCE,
  };

  /** @type {Record<string, string>} First concrete record-type per browse slot from seed (recomputed in `mergeWardrobeFromSources`). */
  let slotRecordFallbackCategory = {};

  function categoryDisplayLabel(slot) {
    if (slot === SLOT_FRAGRANCE) return "Perfume";
    return slot;
  }

  /** Seed / DB `category` → short browse label in drill-down grid. */
  const RECORD_CATEGORY_LABELS = {
    Jackets: "Jackets & sport coats",
    Outerwear: "Outerwear & coats",
    "Mid Layer": "Knitwear & mid layers",
    "Inner Layer": "Layers & base layers",
    Shirts: "Shirts",
    Bottoms: "Trousers & bottoms",
    Tops: "Tops & polos",
    Footwear: "Shoes & boots",
    Fragrance: "Perfume",
    Necklace: "Necklace",
    Bracelet: "Bracelet",
    Ring: "Ring",
    Beater: "Beater",
    "Dress watch": "Dress watch",
    "Dive watch": "Dive watch",
    "Sports watch": "Sports watch",
    Accessories: "Accessories",
    "Small accessories": "Small accessories",
  };

  function friendlyRecordCategory(raw) {
    const r = String(raw ?? "").trim();
    if (!r) return "";
    return RECORD_CATEGORY_LABELS[r] || r;
  }

  /** For clipboard export: keep paste small — omit base64 bodies. */
  function summarizeUrlForPlaintext(u) {
    const s = String(u ?? "").trim();
    if (!s) return "(none)";
    if (s.startsWith("data:")) return `[embedded image, ${s.length} characters — omitted]`;
    return s;
  }

  function buildItemPlainTextSnapshot(item) {
    if (!item) return "";
    const lines = [];
    lines.push("Timeless Wardrobe — wardrobe piece (plain text export)");
    lines.push("=".repeat(48));
    lines.push(`ID: ${item.id ?? ""}`);
    lines.push(`Brand: ${String(item.brand ?? "").trim()}`);
    lines.push(`Name: ${String(item.name ?? "").trim()}`);
    lines.push(`Name (display line): ${displayNameWithoutLeadingColor(item)}`);
    lines.push(`Browse category: ${categoryDisplayLabel(itemSlot(item))}`);
    lines.push(`Record category: ${recordCategoryForDrill(item, itemSlot(item))}`);
    lines.push(`Season: ${seasonUiLabel(item.season)}`);
    lines.push(`Color: ${String(item.color ?? "").trim()}`);
    lines.push(`Fabric: ${String(item.fabric ?? "").trim()}`);
    lines.push(`Weight / specs: ${String(item.weight ?? "").trim()}`);
    lines.push(`Size: ${String(item.size ?? "").trim()}`);
    lines.push(`Measured dimensions: ${String(item.measuredDimensions ?? "").trim()}`);
    {
      const pd = String(item.purchaseDate ?? "").trim();
      lines.push(`Purchase date: ${pd ? formatPurchaseDateForDisplay(pd) : "(none)"}`);
    }
    lines.push(`Outfit-eligible: ${itemEligibleForOutfit(item) ? "yes" : "no"}`);
    lines.push("");
    lines.push(`Cover image: ${summarizeUrlForPlaintext(item.image)}`);
    const gals = itemGalleryList(item);
    lines.push(`Gallery images (${gals.length}):`);
    if (!gals.length) lines.push("  (none)");
    else gals.forEach((u, i) => lines.push(`  ${i + 1}. ${summarizeUrlForPlaintext(u)}`));
    lines.push("");
    lines.push("Notes:");
    lines.push(String(item.notes ?? "").trim() || "(none)");
    if (item.metadata != null && item.metadata !== "") {
      lines.push("");
      lines.push("Metadata (raw):");
      try {
        lines.push(typeof item.metadata === "string" ? item.metadata : JSON.stringify(item.metadata));
      } catch {
        lines.push(String(item.metadata));
      }
    }
    lines.push("");
    lines.push("-- end --");
    return lines.join("\n");
  }

  async function copyItemPlainTextForAi(item) {
    const text = buildItemPlainTextSnapshot(item);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied plain text to clipboard.");
    } catch (err) {
      console.warn(err);
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showToast("Copied plain text to clipboard.");
      } catch {
        showToast("Could not copy automatically.");
      }
    }
  }

  /** Previously saved Chinese clothing slots → Clothing (典藏·配件 handled in `itemSlot`). */
  const LEGACY_SLOT_LABEL = {
    "冬·上裝": SLOT_CLOTHING,
    "冬·上装": SLOT_CLOTHING,
    "冬·下裝": SLOT_CLOTHING,
    "冬·下装": SLOT_CLOTHING,
    "冬·夹克": SLOT_CLOTHING,
    "冬·外層（非夹克）": SLOT_CLOTHING,
    "夏·上裝": SLOT_CLOTHING,
    "夏·上装": SLOT_CLOTHING,
    "夏·下裝": SLOT_CLOTHING,
    "夏·下装": SLOT_CLOTHING,
  };

  /** Old English granular slots → Clothing (non-archive rows). */
  const LEGACY_ENGLISH_GRANULAR_SLOT = {
    "Winter · Upper": SLOT_CLOTHING,
    "Winter · Lower": SLOT_CLOTHING,
    "Winter · Jacket": SLOT_CLOTHING,
    "Winter · Outer (non-jacket)": SLOT_CLOTHING,
    "Summer · Upper": SLOT_CLOTHING,
    "Summer · Lower": SLOT_CLOTHING,
  };

  /** Disambiguate former “archive accessories” bucket using record `category` only. */
  function inferAccessoryBucket(item) {
    const cat = String(item.category ?? "").trim();
    if (cat === "Watches") return SLOT_WATCHES;
    if (
      cat === "Beater" ||
      cat === "Dress watch" ||
      cat === "Dive watch" ||
      cat === "潛水錶" ||
      cat === "Everyday" ||
      cat === "Sports watch"
    ) {
      return SLOT_WATCHES;
    }
    if (cat === "Fragrance") return SLOT_FRAGRANCE;
    if (
      cat === "Jewellery" ||
      cat === "Jewelry" ||
      cat === "Necklace" ||
      cat === "Bracelet" ||
      cat === "Ring" ||
      cat === "項鏈" ||
      cat === "手鏈" ||
      cat === "戒指"
    )
      return SLOT_JEWELRY;
    if (cat === "Footwear") return SLOT_SHOES;
    if (cat === "Future") return SLOT_JEWELRY;
    return SLOT_ACCESSORIES;
  }

  function itemSlot(item) {
    if (!item) return SLOT_CLOTHING;
    const rawCat = String(item.category ?? "").trim();
    const season = String(item.season ?? "");

    if (Object.prototype.hasOwnProperty.call(LEGACY_UNSPEC_CATEGORY_TO_SLOT, rawCat)) {
      return LEGACY_UNSPEC_CATEGORY_TO_SLOT[rawCat];
    }

    if (rawCat === "Small accessories") return SLOT_ACCESSORIES;

    if (rawCat === "Clothing (incl. shoes)") return SLOT_CLOTHING;

    if (LEGACY_SLOT_LABEL[rawCat]) return LEGACY_SLOT_LABEL[rawCat];
    if (rawCat === "典藏·配件" || rawCat === "Archive · Accessories") return inferAccessoryBucket(item);
    if (Object.prototype.hasOwnProperty.call(LEGACY_ENGLISH_GRANULAR_SLOT, rawCat)) {
      return LEGACY_ENGLISH_GRANULAR_SLOT[rawCat];
    }
    if (SLOT_OPTIONS.includes(rawCat)) return rawCat;

    if (rawCat === "Footwear") return SLOT_SHOES;
    if (rawCat === "Watches") return SLOT_WATCHES;
    if (
      rawCat === "Beater" ||
      rawCat === "Dress watch" ||
      rawCat === "Dive watch" ||
      rawCat === "潛水錶" ||
      rawCat === "Everyday" ||
      rawCat === "Sports watch"
    ) {
      return SLOT_WATCHES;
    }
    if (rawCat === "Fragrance") return SLOT_FRAGRANCE;
    if (
      rawCat === "Jewellery" ||
      rawCat === "Jewelry" ||
      rawCat === "Necklace" ||
      rawCat === "Bracelet" ||
      rawCat === "Ring" ||
      rawCat === "項鏈" ||
      rawCat === "手鏈" ||
      rawCat === "戒指"
    ) {
      return SLOT_JEWELRY;
    }
    if (rawCat === "Future") return SLOT_JEWELRY;

    if (season === "S/S" || season === "A/W") return SLOT_CLOTHING;
    return SLOT_CLOTHING;
  }

  function computeSlotRecordFallbackCategories(seedRows) {
    const out = /** @type {Record<string, string>} */ ({});
    for (const slot of SLOT_OPTIONS) {
      const names = new Set();
      for (const row of seedRows) {
        if (!row || row.id == null) continue;
        const c = String(row.category ?? "").trim();
        if (!c) continue;
        if (Object.prototype.hasOwnProperty.call(LEGACY_UNSPEC_CATEGORY_TO_SLOT, c)) continue;
        const probe = { ...row, category: c };
        if (itemSlot(probe) !== slot) continue;
        if (SLOT_OPTIONS.includes(c)) continue;
        if (c === "Clothing" || c === "Accessories") continue;
        names.add(c);
      }
      const arr = [...names].sort(
        (a, b) =>
          (RECORD_CATEGORY_RANK[a] ?? 800) - (RECORD_CATEGORY_RANK[b] ?? 800) ||
          a.localeCompare(b, undefined, { sensitivity: "base" })
      );
      if (arr.length) out[slot] = arr[0];
    }
    return out;
  }

  function defaultRecordCategoryForSlot(slot) {
    const s = String(slot ?? "").trim();
    if (s === SLOT_JEWELRY || s === SLOT_WATCHES) {
      return (
        STATIC_RECORD_FALLBACK_BY_SLOT[s] ||
        slotRecordFallbackCategory[s] ||
        STATIC_RECORD_FALLBACK_BY_SLOT[SLOT_CLOTHING]
      );
    }
    return (
      slotRecordFallbackCategory[s] ||
      STATIC_RECORD_FALLBACK_BY_SLOT[s] ||
      STATIC_RECORD_FALLBACK_BY_SLOT[SLOT_CLOTHING]
    );
  }

  /** Outfit builder: clothing, shoes, watches, and accessories — jewelry and perfume stay archive-only. */
  function itemEligibleForOutfit(item) {
    if (!item) return false;
    const s = itemSlot(item);
    return s === SLOT_CLOTHING || s === SLOT_SHOES || s === SLOT_WATCHES || s === SLOT_ACCESSORIES;
  }

  /** Browse column order when viewing All (or a main tab without a record-type drill). */
  const BROWSE_SLOT_RANK = {
    [SLOT_CLOTHING]: 0,
    [SLOT_ACCESSORIES]: 1,
    [SLOT_SHOES]: 2,
    [SLOT_WATCHES]: 3,
    [SLOT_JEWELRY]: 4,
    [SLOT_FRAGRANCE]: 5,
  };

  /**
   * Clothing record types: outer shells → mid/inner upper body → bottoms (`RECORD_CATEGORY_RANK`).
   * Other browse tabs use the same rank map where applicable; unknown labels sort last (800).
   */
  const RECORD_CATEGORY_RANK = {
    Outerwear: 0,
    Jackets: 1,
    "Mid Layer": 2,
    "Inner Layer": 3,
    Shirts: 4,
    Tops: 5,
    Bottoms: 6,
    Footwear: 7,
    Beater: 50,
    "Dress watch": 51,
    "Dive watch": 52,
    "Sports watch": 54,
    Fragrance: 9,
    Necklace: 70,
    Bracelet: 71,
    Ring: 72,
    Accessories: 13,
    "Small accessories": 13,
  };

  /** Record types always listed in add/edit `<select>` for these slots (even with zero items). */
  const KNOWN_RECORD_TYPES_BY_SLOT = {
    [SLOT_JEWELRY]: ["Necklace", "Bracelet", "Ring"],
    [SLOT_WATCHES]: ["Beater", "Dress watch", "Dive watch", "Sports watch"],
  };

  function browseSlotRank(item) {
    const k = itemSlot(item);
    return Object.prototype.hasOwnProperty.call(BROWSE_SLOT_RANK, k) ? BROWSE_SLOT_RANK[k] : 99;
  }

  function recordCategoryRank(item) {
    const c = recordCategoryForDrill(item, itemSlot(item));
    if (!c) return 999;
    if (Object.prototype.hasOwnProperty.call(RECORD_CATEGORY_RANK, c)) return RECORD_CATEGORY_RANK[c];
    return 800;
  }

  /** When not drilling to a single record type, sort by slot + garment category, not seed file order. */
  function compareByTaxonomy(a, b) {
    const sDiff = browseSlotRank(a) - browseSlotRank(b);
    if (sDiff !== 0) return sDiff;
    const rDiff = recordCategoryRank(a) - recordCategoryRank(b);
    if (rDiff !== 0) return rDiff;
    const ca = recordCategoryForDrill(a, itemSlot(a));
    const cb = recordCategoryForDrill(b, itemSlot(b));
    return ca.localeCompare(cb, undefined, { sensitivity: "base" });
  }

  function sanitizeCurrentOutfit() {
    currentOutfitSlots = currentOutfitSlots.filter((slot) => {
      const it = itemById.get(slot.itemId);
      return it && itemEligibleForOutfit(it);
    });
  }

  /** @type {any} */
  let supabaseClient = null;

  /** @type {object[]} */
  let items = [];

  /** Document-level dismiss listeners for the mobile filters panel (installed once). */
  let filtersMenuDismissListenersInstalled = false;

  /** Every non-data image path in the merged archive (for loose cover matching). */
  let archiveImagePathList = [];

  /** From `images/_manifest.json` — files on disk that no row references yet. */
  let archiveManifestPaths = [];

  /** After a cover loads, remember the working URL for gallery / outfit UI. */
  const coverResolutionCache = new Map();

  /** @type {Map<string, object>} */
  const itemById = new Map();

  function rebuildItemIndex() {
    itemById.clear();
    for (const i of items) itemById.set(i.id, i);
  }

  function loadCustomItems() {
    try {
      const raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(
          (x) =>
            x &&
            typeof x.id === "string" &&
            typeof x.brand === "string" &&
            typeof x.name === "string" &&
            (x.image == null || typeof x.image === "string")
        )
        .map((x) => ({ ...x, image: String(x.image ?? "").trim() }));
    } catch {
      return [];
    }
  }

  function saveCustomItems(arr) {
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(arr));
  }

  function loadPersistedSeasonNav() {
    try {
      const v = localStorage.getItem(SEASON_NAV_STORAGE_KEY);
      if (v === "A/W" || v === "S/S" || v === "All") return v;
    } catch {
      /* private mode / disabled */
    }
    return "S/S";
  }

  function persistSeasonNav() {
    try {
      localStorage.setItem(SEASON_NAV_STORAGE_KEY, seasonNavFilter);
    } catch {
      /* ignore */
    }
  }

  function loadArchiveOverrides() {
    try {
      const raw = localStorage.getItem(ITEM_ARCHIVE_OVERRIDES_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }

  function saveArchiveOverrides(map) {
    localStorage.setItem(ITEM_ARCHIVE_OVERRIDES_KEY, JSON.stringify(map));
  }

  function loadArchiveHiddenIds() {
    try {
      const raw = localStorage.getItem(ARCHIVE_HIDDEN_IDS_KEY);
      if (!raw) return new Set();
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return new Set();
      return new Set(p.map((x) => String(x)));
    } catch {
      return new Set();
    }
  }

  function saveArchiveHiddenIds(set) {
    try {
      localStorage.setItem(ARCHIVE_HIDDEN_IDS_KEY, JSON.stringify([...set]));
    } catch (e) {
      console.warn(e);
    }
  }

  function mergeWardrobeFromSources() {
    const ov = loadArchiveOverrides();
    const hiddenArchive = loadArchiveHiddenIds();
    const mergedBase = wardrobeBase
      .filter((row) => {
        if (!row || row.id == null) return false;
        return !hiddenArchive.has(String(row.id));
      })
      .map((row, idx) => {
        if (!row || row.id == null) return row;
        const id = String(row.id);
        const patch = ov[id];
        const base = patch && typeof patch === "object" ? { ...row, ...patch, id } : { ...row };
        return { ...base, __archiveOrdinal: idx };
      });
    slotRecordFallbackCategory = computeSlotRecordFallbackCategories(mergedBase);
    const mergedList = [...loadCustomItems(), ...mergedBase];
    items = mergedList.map((row) => {
      let row2 = row;
      let cat = String(row2.category ?? "").trim();
      if (Object.prototype.hasOwnProperty.call(LEGACY_UNSPEC_CATEGORY_TO_SLOT, cat)) {
        const slotForOld = LEGACY_UNSPEC_CATEGORY_TO_SLOT[cat];
        row2 = {
          ...row2,
          category:
            slotRecordFallbackCategory[slotForOld] || STATIC_RECORD_FALLBACK_BY_SLOT[slotForOld] || "Tops",
        };
      }
      const slot = itemSlot(row2);
      const canon = recordCategoryForDrill(row2, slot);
      const raw = String(row2.category ?? "").trim();
      if (raw === canon) return row2;
      return { ...row2, category: canon };
    });
    rebuildItemIndex();
    coverResolutionCache.clear();
    rebuildArchiveImagePathList();
  }

  /** @type {{ itemId: string, colorKey?: string }[]} */
  let currentOutfitSlots = [];

  /** @type {{ id: string, name: string, slots: { itemId: string, colorKey?: string }[], createdAt: string }[]} */
  let savedOutfits = [];

  /** When set, the next "Save outfit" updates this saved row instead of creating a new one. */
  let editingSavedOutfitId = null;

  let toastTimer = null;

  /** @type {boolean} */
  let useCloudOutfits = false;

  /** Active category tab value (matches `itemSlot()`; empty string = all). */
  let categoryNavFilter = "";

  /** Top strip: "All", "S/S", or "A/W" — narrows archive before category tabs (persisted in localStorage). */
  let seasonNavFilter = loadPersistedSeasonNav();

  /** Within main category: filter by seed `category` (e.g. Jackets); empty = all types. */
  let subcategoryFilter = "";

  /** Item id currently shown on the item page (for edit / delete actions). */
  let detailItemId = null;

  const els = {
    grid: document.getElementById("grid"),
    emptyWrap: document.getElementById("empty-wrap"),
    emptyMsg: document.getElementById("empty-state-msg"),
    emptyReset: document.getElementById("empty-reset-filters"),
    count: document.getElementById("filter-count"),
    search: document.getElementById("filter-search"),
    outfitStrip: document.getElementById("outfit-strip"),
    outfitEmpty: document.getElementById("outfit-empty"),
    outfitName: document.getElementById("outfit-name"),
    outfitSave: document.getElementById("outfit-save"),
    outfitClear: document.getElementById("outfit-clear"),
    outfitToast: document.getElementById("outfit-toast"),
    savedList: document.getElementById("saved-outfits-list"),
    savedEmpty: document.getElementById("saved-outfits-empty"),
  };

  let itemDetailDelegatesInstalled = false;
  let itemDetailPageKeyboardInstalled = false;
  let itemPageBackNavInstalled = false;

  function itemDetailMountRoot() {
    return document.getElementById("item-detail-root");
  }

  /** Standalone item.html: prefer browser back so the archive tab (and in-memory filters) is restored when possible. */
  function installItemPageBackNavigation() {
    if (itemPageBackNavInstalled) return;
    const back = document.querySelector(".item-page-header__back");
    if (!back) return;
    itemPageBackNavInstalled = true;
    back.addEventListener("click", (e) => {
      if (globalThis.history.length > 1) {
        e.preventDefault();
        globalThis.history.back();
      }
    });
  }

  function itemDetailIsPageRoot(root) {
    return root?.classList?.contains("item-detail__root--page") ?? false;
  }

  /** Scroll and focus for standalone item.html (not dialog). */
  function afterItemDetailPageRender(root, edit) {
    if (!itemDetailIsPageRoot(root)) return;
    globalThis.scrollTo({ top: 0, left: 0, behavior: "auto" });
    queueMicrotask(() => {
      if (edit) {
        document.getElementById("item-edit-brand")?.focus();
      } else {
        const h = document.getElementById("item-detail-heading");
        if (h) {
          h.setAttribute("tabindex", "-1");
          h.focus({ preventScroll: true });
        }
      }
    });
  }

  function sortRecordTypeKeysForSlot(_browseSlot, keys) {
    const arr = [...new Set(keys.filter(Boolean))];
    arr.sort((a, b) => {
      const ra = RECORD_CATEGORY_RANK[a] ?? 800;
      const rb = RECORD_CATEGORY_RANK[b] ?? 800;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return arr;
  }

  function normalizeSearch(s) {
    return s.trim().toLowerCase();
  }

  function itemMatchesSearch(item, q) {
    if (!q) return true;
    const hay = [
      item.brand,
      item.name,
      itemSlot(item),
      categoryDisplayLabel(itemSlot(item)),
      item.category,
      friendlyRecordCategory(String(item.category ?? "")),
      item.season,
      item.color,
      item.fabric,
      item.weight,
      item.size,
      item.measuredDimensions,
      item.purchaseDate,
      item.notes,
      ...(getItemColorVariants(item)?.map((v) => [v.label, v.color, v.key].filter(Boolean).join(" ")) ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function getFilters() {
    return {
      seasonNav: seasonNavFilter,
      category: categoryNavFilter,
      subcategory: subcategoryFilter,
      search: normalizeSearch(els.search?.value ?? ""),
    };
  }

  /** Category / record-type drill / search — not the season tab. */
  function narrowingFiltersActive() {
    return Boolean(
      categoryNavFilter || String(subcategoryFilter ?? "").trim() || normalizeSearch(els.search?.value ?? "")
    );
  }

  function describeNarrowingFiltersForUi() {
    const bits = [];
    if (categoryNavFilter) bits.push(categoryDisplayLabel(categoryNavFilter));
    const sub = String(subcategoryFilter ?? "").trim();
    if (sub) bits.push(friendlyRecordCategory(sub) || sub);
    const rawQ = els.search?.value?.trim() ?? "";
    if (rawQ) bits.push(`“${rawQ}”`);
    return bits.join(" · ");
  }

  function countNarrowingFilterDims() {
    let n = 0;
    if (categoryNavFilter) n += 1;
    if (String(subcategoryFilter ?? "").trim()) n += 1;
    if (normalizeSearch(els.search?.value ?? "")) n += 1;
    return n;
  }

  function syncFilterSummaryBar() {
    const bar = document.getElementById("filter-summary-bar");
    const text = document.getElementById("filter-summary-text");
    if (!bar || !text) return;
    const n = countNarrowingFilterDims();
    if (n === 0) {
      bar.hidden = true;
      text.textContent = "";
      return;
    }
    bar.hidden = false;
    text.textContent = `${n} active — ${describeNarrowingFiltersForUi()}`;
  }

  function countItemsForCurrentSeasonTab() {
    return items.filter((it) => itemPassesSeasonNav(it, seasonNavFilter)).length;
  }

  function resetNarrowingFilters() {
    categoryNavFilter = "";
    subcategoryFilter = "";
    if (els.search) els.search.value = "";
    syncCategoryTabUI();
    validateSubcategoryFilter();
    renderCategoryDrill();
    syncFiltersMenuForViewport();
    renderGrid();
    collapseFiltersMenuPanel();
  }

  /** Season tab: "All" shows everything; S/S vs A/W use exact match plus `All-season` / blank / item `All`. */
  function itemPassesSeasonNav(item, nav) {
    if (nav === "All") return true;
    const s = String(item.season ?? "").trim();
    if (nav === "S/S") return s === "S/S" || s === "All-season" || s === "All" || s === "";
    if (nav === "A/W") return s === "A/W" || s === "All-season" || s === "All" || s === "";
    return true;
  }

  /** UI / export: blank, `All-season`, or `All` → label "All". */
  function seasonUiLabel(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "All-season" || s === "All") return "All";
    if (s === "A/W" || s === "S/S") return s;
    return s;
  }

  /** Display `purchaseDate` (often ISO YYYY-MM-DD) for cards and detail. */
  function formatPurchaseDateForDisplay(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      try {
        const d = new Date(`${s}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        }
      } catch {
        /* fall through */
      }
    }
    return s;
  }

  function poolItemsForDrillSubcategories() {
    let pool = items;
    pool = pool.filter((i) => itemPassesSeasonNav(i, seasonNavFilter));
    if (categoryNavFilter) pool = pool.filter((i) => itemSlot(i) === categoryNavFilter);
    return pool;
  }

  /**
   * Record types removed from the Watches drill — fold old `category` values into concrete keys.
   * @param {string} raw
   */
  function mapRemovedWatchRecordTypesToConcrete(raw) {
    const r = String(raw ?? "").trim();
    if (r === "Watches") return "Sports watch";
    if (r === "Everyday") return "Dress watch";
    return r;
  }

  /**
   * Legacy jewelry record types removed from the UI — fold into concrete drill keys.
   * @param {string} raw
   */
  function mapJewelleryFutureToConcreteDrillKey(raw) {
    const r = String(raw ?? "").trim();
    if (r === "Future") return "Ring";
    if (r === "Jewellery" || r === "Jewelry") return "Necklace";
    return r;
  }

  /**
   * Stable record-type key for drill chips, filtering, and display under `browseSlot`.
   * Empty category or tab-only `category` maps to the first concrete type for that tab from seed (see `slotRecordFallbackCategory`).
   */
  function recordCategoryForDrill(item, browseSlot) {
    const slot = String(browseSlot ?? "").trim() || itemSlot(item);
    let raw = String(item?.category ?? "").trim();

    if (slot === SLOT_JEWELRY) {
      if (raw === "項鏈") raw = "Necklace";
      if (raw === "手鏈") raw = "Bracelet";
      if (raw === "戒指") raw = "Ring";
      raw = mapJewelleryFutureToConcreteDrillKey(raw);
    }
    if (slot === SLOT_WATCHES) {
      if (raw === "潛水錶") raw = "Dive watch";
      raw = mapRemovedWatchRecordTypesToConcrete(raw);
    }

    if (!raw) return defaultRecordCategoryForSlot(slot);

    const broadClothing = slot === SLOT_CLOTHING && (raw === slot || raw === "Clothing");
    const broadAccessories = slot === SLOT_ACCESSORIES && (raw === slot || raw === "Accessories");
    if (broadClothing || broadAccessories) return defaultRecordCategoryForSlot(slot);

    return raw;
  }

  function itemMatchesDrillSubcategory(item, browseCategory, sub) {
    if (!sub) return true;
    return recordCategoryForDrill(item, browseCategory) === sub;
  }

  /**
   * Distinct record-type keys for the type drill / edit dropdown under `browseSlot`.
   */
  function drillSubcategoryKeysFromPool(browseSlot, pool) {
    const slot = String(browseSlot ?? "").trim();
    if (!slot) return [];
    return sortRecordTypeKeysForSlot(
      slot,
      pool
        .filter((i) => itemSlot(i) === slot)
        .map((i) => recordCategoryForDrill(i, slot))
        .filter(Boolean)
    );
  }

  /** Legacy Chinese `category` / drill keys saved before English migration. */
  function legacyZhRecordCategoryToEn(raw) {
    const r = String(raw ?? "").trim();
    if (r === "項鏈") return "Necklace";
    if (r === "手鏈") return "Bracelet";
    if (r === "戒指") return "Ring";
    if (r === "潛水錶") return "Dive watch";
    return r;
  }

  /**
   * Populate record-type `<select>`: keys from the pool plus `preferKey` when valid; always includes the section fallback.
   */
  function fillItemEditRecordTypeSelect(selectEl, browseSlot, preferKey) {
    const slot = String(browseSlot ?? "").trim() || SLOT_CLOTHING;
    let prev = legacyZhRecordCategoryToEn(preferKey);
    if (slot === SLOT_JEWELRY) prev = mapJewelleryFutureToConcreteDrillKey(prev);
    if (slot === SLOT_WATCHES) prev = mapRemovedWatchRecordTypesToConcrete(prev);
    const pool = items.filter((i) => itemSlot(i) === slot);
    const fall = defaultRecordCategoryForSlot(slot);
    let keys = drillSubcategoryKeysFromPool(slot, pool);
    const knownExtra = KNOWN_RECORD_TYPES_BY_SLOT[slot];
    if (knownExtra?.length) keys = sortRecordTypeKeysForSlot(slot, [...keys, ...knownExtra]);
    if (slot === SLOT_JEWELRY) {
      keys = keys.filter((k) => k && !["Jewellery", "Jewelry", "Future"].includes(k));
    }
    if (slot === SLOT_WATCHES) {
      keys = keys.filter((k) => k && !["Everyday", "Watches"].includes(k));
    }
    if (!keys.includes(fall)) keys = sortRecordTypeKeysForSlot(slot, [fall, ...keys]);
    if (prev && !keys.includes(prev)) {
      const probe = { category: prev, season: "" };
      if (itemSlot(probe) === slot && prev !== slot && !SLOT_OPTIONS.includes(prev)) {
        keys = sortRecordTypeKeysForSlot(slot, [...keys, prev]);
      }
    }
    selectEl.innerHTML = "";
    for (const k of keys) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = friendlyRecordCategory(k) || k;
      selectEl.appendChild(o);
    }
    const pick = prev && keys.includes(prev) ? prev : fall;
    selectEl.value = pick;
  }

  function validateSubcategoryFilter() {
    let sub = String(subcategoryFilter ?? "").trim();
    const subEn = legacyZhRecordCategoryToEn(sub);
    if (subEn !== sub) {
      subcategoryFilter = subEn;
      sub = subEn;
    }
    if (!sub) return;
    if (!categoryNavFilter) {
      subcategoryFilter = "";
      return;
    }
    if (categoryNavFilter === SLOT_JEWELRY) {
      const j = mapJewelleryFutureToConcreteDrillKey(sub);
      if (j !== sub) {
        subcategoryFilter = j;
        sub = j;
      }
    }
    if (categoryNavFilter === SLOT_JEWELRY && sub === "Jewelry") {
      subcategoryFilter = "Necklace";
      return;
    }
    if (categoryNavFilter === SLOT_WATCHES) {
      const w = mapRemovedWatchRecordTypesToConcrete(sub);
      if (w !== sub) {
        subcategoryFilter = w;
        sub = w;
      }
    }
    const seasonalPool = poolItemsForDrillSubcategories();
    if (!seasonalPool.length) {
      subcategoryFilter = "";
      return;
    }
    const allowed = drillSubcategoryKeysFromPool(categoryNavFilter, seasonalPool);
    if (!allowed.includes(sub)) subcategoryFilter = "";
  }

  function renderCategoryDrill() {
    const drill = document.getElementById("category-drill");
    const grid = document.getElementById("category-drill-grid");
    if (!drill || !grid) return;

    validateSubcategoryFilter();

    if (!categoryNavFilter) {
      drill.hidden = true;
      drill.setAttribute("aria-hidden", "true");
      grid.innerHTML = "";
      return;
    }

    const seasonalPool = poolItemsForDrillSubcategories();
    if (!seasonalPool.length) {
      subcategoryFilter = "";
      drill.hidden = true;
      drill.setAttribute("aria-hidden", "true");
      grid.innerHTML = "";
      return;
    }

    const typeKeys = drillSubcategoryKeysFromPool(categoryNavFilter, seasonalPool);

    /** No sub-type strip when there is nothing to choose or only one record type (main tabs are enough). */
    if (typeKeys.length <= 1) {
      subcategoryFilter = "";
      drill.hidden = true;
      drill.setAttribute("aria-hidden", "true");
      grid.innerHTML = "";
      return;
    }

    grid.innerHTML = "";

    function appendChoice(rawValue, label, isAll) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "category-drill__choice" + (isAll ? " category-drill__choice--all" : "");
      const active = isAll ? subcategoryFilter === "" : subcategoryFilter === rawValue;
      if (active) b.classList.add("is-active");
      b.dataset.subcategory = isAll ? "" : rawValue;
      b.textContent = label;
      grid.appendChild(b);
    }

    appendChoice("", "All types", true);
    for (const raw of typeKeys) {
      appendChoice(raw, friendlyRecordCategory(raw) || raw, false);
    }

    drill.hidden = false;
    drill.removeAttribute("aria-hidden");
  }

  function applyFilters(list) {
    const f = getFilters();
    return list.filter((item) => {
      if (!itemPassesSeasonNav(item, f.seasonNav)) return false;
      if (f.category && itemSlot(item) !== f.category) return false;
      if (f.subcategory && !itemMatchesDrillSubcategory(item, f.category, f.subcategory)) return false;
      if (!itemMatchesSearch(item, f.search)) return false;
      return true;
    });
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Title line: when `color` is set and the name repeats it at the start, strip it (colour lives in specs).
   * Does not strip when the leading colour is the first half of a compound material (e.g. Camel Hair, Navy Wool).
   */
  function displayNameWithoutLeadingColor(item) {
    const name = String(item?.name ?? "").trim();
    const col = String(item?.color ?? "").trim();
    if (!name || !col) return name;
    const re = new RegExp("^" + escapeRegExp(col) + "\\s+", "i");
    const stripped = name.replace(re, "").trim();
    if (stripped.length < 2) return name;
    const firstAfter = stripped.split(/\s+/)[0] || "";
    /** If stripping would leave this as the first token, we likely split a two-word material (Camel Hair, …). */
    const compoundMaterialContinuations = new Set([
      "hair",
      "wool",
      "cashmere",
      "silk",
      "linen",
      "cotton",
      "leather",
      "suede",
      "twill",
      "denim",
      "mesh",
    ]);
    if (firstAfter && compoundMaterialContinuations.has(firstAfter.toLowerCase())) return name;
    return stripped;
  }

  function imageAltForItem(item) {
    const dn = displayNameWithoutLeadingColor(item);
    const col = String(item?.color ?? "").trim();
    if (col) return `${item.brand} — ${dn} (${col})`;
    return `${item.brand} — ${dn}`;
  }

  function specParts(item) {
    const parts = [];
    const vars = getItemColorVariants(item);
    if (vars?.length) {
      parts.push(`${vars.length} colours: ${vars.map((v) => v.label).join(", ")}`);
    } else if (item.color) {
      parts.push(item.color);
    }
    if (item.fabric) parts.push(item.fabric);
    if (item.weight) parts.push(item.weight);
    return parts;
  }

  /** Extra images only (not the main `image` URL). */
  function itemGalleryList(item) {
    const raw = item?.gallery;
    let arr = [];
    if (Array.isArray(raw)) arr = raw.map((x) => String(x)).filter(Boolean);
    else if (raw && typeof raw === "string") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) arr = p.map((x) => String(x)).filter(Boolean);
      } catch {
        /* ignore */
      }
    }
    const main = String(item?.image ?? "").trim();
    return arr.filter((u) => u && u !== main);
  }

  function rebuildArchiveImagePathList() {
    const seen = new Set();
    for (const it of items) {
      const m = String(it?.image ?? "").trim();
      if (m && !m.startsWith("data:")) seen.add(m);
      for (const g of itemGalleryList(it)) {
        const u = String(g ?? "").trim();
        if (u && !u.startsWith("data:")) seen.add(u);
      }
      const vars = getItemColorVariants(it);
      if (vars) {
        for (const v of vars) {
          const im = String(v.image ?? "").trim();
          if (im && !im.startsWith("data:")) seen.add(im);
          for (const g of v.gallery || []) {
            const u = String(g ?? "").trim();
            if (u && !u.startsWith("data:")) seen.add(u);
          }
        }
      }
    }
    for (const p of archiveManifestPaths) {
      const u = String(p ?? "").trim().replace(/\\/g, "/");
      if (u && !u.startsWith("data:")) seen.add(u);
    }
    archiveImagePathList = [...seen];
  }

  async function loadArchiveImageManifest() {
    try {
      const href = globalThis.location?.href;
      if (!href) return;
      const url = new URL("images/_manifest.json", href);
      const res = await fetch(url.href, { cache: "reload" });
      if (!res.ok) return;
      const data = await res.json();
      const arr = Array.isArray(data) ? data : Array.isArray(data?.paths) ? data.paths : [];
      const next = [];
      const dup = new Set();
      for (const x of arr) {
        const u = String(x ?? "").trim().replace(/\\/g, "/");
        if (!u || u.startsWith("data:") || dup.has(u)) continue;
        dup.add(u);
        next.push(u);
      }
      archiveManifestPaths = next;
      coverResolutionCache.clear();
      rebuildArchiveImagePathList();
    } catch {
      /* offline, invalid JSON, or file missing */
    }
  }

  const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".PNG", ".JPG", ".JPEG"];

  /** Too generic for cross-file image matching — would map many rows to one photo. */
  const IMAGE_MATCH_STOPWORDS = new Set([
    "trouser",
    "trousers",
    "pant",
    "pants",
    "bottom",
    "bottoms",
    "shirt",
    "shirts",
    "jacket",
    "jackets",
    "coat",
    "coats",
    "blazer",
    "blazers",
    "shoe",
    "shoes",
    "boot",
    "boots",
    "loafer",
    "loafers",
    "sneaker",
    "sneakers",
    "watch",
    "watches",
    "ring",
    "rings",
    "chain",
    "chains",
    "bracelet",
    "bracelets",
    "jewelry",
    "jewellery",
    "top",
    "tops",
    "knit",
    "knits",
    "vest",
    "vests",
    "polo",
    "polos",
    "dress",
    "jean",
    "jeans",
    "outerwear",
    "layer",
    "layers",
    "inner",
    "mid",
    "fragrance",
    "perfume",
    "collection",
    "piece",
    "pieces",
    "all",
    "season",
    "seasons",
    "cotton",
    "wool",
    "linen",
    "silk",
    "denim",
    "leather",
    "suede",
  ]);

  function isBlobOrAbsoluteUrl(u) {
    const s = String(u ?? "").trim();
    return !s || s.startsWith("data:") || /^https?:\/\//i.test(s);
  }

  function splitDirFile(path) {
    const s = String(path ?? "").trim().replace(/\\/g, "/");
    const i = s.lastIndexOf("/");
    if (i < 0) return { dir: "", file: s };
    return { dir: s.slice(0, i + 1), file: s.slice(i + 1) };
  }

  function stemAndExt(file) {
    const m = String(file).match(/^(.+)(\.[a-z0-9]+)$/i);
    if (m) return { stem: m[1], ext: m[2] };
    return { stem: String(file), ext: "" };
  }

  /** Filename stem normalized to a single space-separated word string (for stem-prefix match). */
  function normalizeImageStem(imagePath) {
    const { file } = splitDirFile(String(imagePath ?? ""));
    const { stem } = stemAndExt(file);
    return String(stem)
      .toLowerCase()
      .replace(/\u00d7/g, "x")
      .replace(/(?<![0-9])([0-9])-([0-9])(?![0-9])/g, "$1$2")
      .replace(/[^a-z0-9]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** `…_2.png` / `… copy 2` → drop trailing numeric token for fuzzy stem compare. */
  function stripTrailingOrdinalStemSuffix(norm) {
    return String(norm ?? "")
      .trim()
      .replace(/\s+\d+$/u, "")
      .trim();
  }

  /**
   * Filename sometimes repeats the brand (`GU GU olive…`). If the first token matches the
   * declared stem's first token twice in a row, collapse to one so prefix / token logic works.
   */
  function collapseDuplicateLeadingTokenMatchingDeclared(declNorm, candNorm) {
    const dw = declNorm.split(/\s+/).filter(Boolean);
    let cw = candNorm.split(/\s+/).filter(Boolean);
    if (dw.length < 1 || cw.length < 2) return candNorm;
    const head = dw[0];
    while (cw.length >= 2 && cw[0] === cw[1] && cw[0] === head) cw = cw.slice(1);
    return cw.join(" ");
  }

  /** Declared / candidate stems aligned for “same photo, messier filename” rules. */
  function alignedCandidateStemForFuzzy(declStripped, candNormRaw) {
    const c0 = stripTrailingOrdinalStemSuffix(candNormRaw);
    return collapseDuplicateLeadingTokenMatchingDeclared(declStripped, c0);
  }

  /**
   * File dropped the leading brand in the filename (`Tank Solo…` vs declared `CARTIER Tank Solo…`).
   * True when `decl` ends with the same token sequence as `cand` (word-level suffix).
   */
  function declaredStemEndsWithCandidateStem(declNorm, candNorm) {
    const d = stripTrailingOrdinalStemSuffix(declNorm);
    const c = stripTrailingOrdinalStemSuffix(candNorm);
    if (c.length < 6 || d.length <= c.length) return false;
    const dw = d.split(/\s+/).filter(Boolean);
    const cw = c.split(/\s+/).filter(Boolean);
    if (cw.length < 2 || dw.length <= cw.length) return false;
    for (let i = 0; i < cw.length; i++) {
      if (dw[dw.length - cw.length + i] !== cw[i]) return false;
    }
    return true;
  }

  /**
   * Disk filename dropped a leading brand segment (`JWA Straight Jeans.png` vs declared
   * `UNIQLO × JWA Straight Jeans …`). Every candidate word appears in the same order inside
   * the declared stem. Guarded so two-word tails like `new york` do not match broadly.
   */
  function candidateStemIsOrderedSubsequenceOfDeclared(declNorm, candNorm) {
    const hw = stripTrailingOrdinalStemSuffix(declNorm).split(/\s+/).filter(Boolean);
    const cw = stripTrailingOrdinalStemSuffix(candNorm).split(/\s+/).filter(Boolean);
    if (cw.length < 2 || cw.length > hw.length) return false;
    const joined = cw.join(" ");
    if (cw.length < 3 && joined.length < 12) return false;
    let j = 0;
    for (let i = 0; i < hw.length && j < cw.length; i++) {
      if (hw[i] === cw[j]) j += 1;
    }
    return j === cw.length;
  }

  function looseTokens(s) {
    return String(s ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  /** Filename stem only, lowercased, padded with spaces for whole-token checks (` token `). */
  function tokenHaystackFromImagePath(imagePath) {
    const inner = normalizeImageStem(imagePath);
    return ` ${inner} `;
  }

  /** Brand / display name / name tokens (length ≥ 3), minus generic garment words — for fuzzy file match. */
  function compileStrictMatchTokens(item) {
    const out = [];
    const seen = new Set();
    function pushFrom(arr, minLen) {
      const m = minLen ?? 3;
      for (const t of arr) {
        if (t.length < m) continue;
        if (IMAGE_MATCH_STOPWORDS.has(t)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
    }
    pushFrom(looseTokens(item.brand), 2);
    pushFrom(looseTokens(displayNameWithoutLeadingColor(item)));
    pushFrom(looseTokens(item.name));
    return out;
  }

  /** How many tokens appear as **whole** words in the stem (not substring of another word). */
  function countWholeWordMatchesInStem(imagePath, tokens) {
    const hay = tokenHaystackFromImagePath(imagePath);
    let n = 0;
    for (const t of tokens) {
      if (hay.includes(` ${t} `)) n += 1;
    }
    return n;
  }

  /**
   * Ordered URLs to try for the cover: declared path, extension / parenthesis variants,
   * `images/<id>.*`, then best fuzzy matches against all archive paths.
   */
  function buildCoverCandidates(item) {
    const primary = String(item?.image ?? "").trim();
    const out = [];
    const seen = new Set();
    function add(u) {
      const x = String(u ?? "").trim();
      if (!x || seen.has(x)) return;
      seen.add(x);
      out.push(x);
    }

    if (!primary) {
      for (const u of itemGalleryList(item)) add(u);
      const vars = getItemColorVariants(item);
      if (vars) {
        for (const v of vars) {
          const u = String(v?.image ?? "").trim();
          if (u) add(u);
        }
      }
      if (!out.length) return [];
      if (out.every((u) => isBlobOrAbsoluteUrl(u))) return out;
      return out;
    }

    add(primary);
    if (isBlobOrAbsoluteUrl(primary)) return out;

    const { dir, file } = splitDirFile(primary);
    const { stem, ext } = stemAndExt(file);
    if (stem) {
      const baseExt = ext || ".png";
      for (const e of IMAGE_EXTENSIONS) {
        if (e.toLowerCase() !== ext.toLowerCase()) add(dir + stem + e);
      }
      let relaxed = stem;
      for (let k = 0; k < 10 && /\s*\([^)]*\)/.test(relaxed); k++) {
        const next = relaxed.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
        if (!next || next === relaxed) break;
        relaxed = next;
        add(dir + relaxed + baseExt);
        for (const e of IMAGE_EXTENSIONS) add(dir + relaxed + e);
      }
    }

    const id = String(item?.id ?? "").trim();
    if (id) {
      for (const e of [".png", ".jpg", ".jpeg", ".webp"]) add(`images/${id}${e}`);
    }

    const matchTokens = compileStrictMatchTokens(item);
    const declaredStemRaw = normalizeImageStem(primary);
    const declD = stripTrailingOrdinalStemSuffix(declaredStemRaw);
    const declaredWordCount = declD.split(/\s+/).filter(Boolean).length;

    const scored = [];
    for (const p of archiveImagePathList) {
      if (seen.has(p)) continue;
      const candStemRaw = normalizeImageStem(p);
      const candAdj = alignedCandidateStemForFuzzy(declD, candStemRaw);
      const rawStemDiffers = candStemRaw !== declaredStemRaw;
      const stemExt =
        declD.length >= 4 &&
        declaredWordCount >= 2 &&
        rawStemDiffers &&
        (candAdj === declD || candAdj.startsWith(declD + " "));
      const stemTail =
        declD.length >= 4 &&
        declaredWordCount >= 2 &&
        rawStemDiffers &&
        declaredStemEndsWithCandidateStem(declD, candStemRaw);
      const candC = stripTrailingOrdinalStemSuffix(candStemRaw);
      const candWordCount = candC.split(/\s+/).filter(Boolean).length;
      const stemPrefix =
        rawStemDiffers &&
        candC.length >= 4 &&
        candWordCount >= 2 &&
        (declD === candC || declD.startsWith(candC + " "));
      const stemSubseq =
        rawStemDiffers &&
        candC.length >= 4 &&
        candidateStemIsOrderedSubsequenceOfDeclared(declD, candC);
      const hits = countWholeWordMatchesInStem(p, matchTokens);
      if (stemExt) {
        scored.push({ p, score: 1_000 + hits });
      } else if (stemTail) {
        scored.push({ p, score: 998 + hits });
      } else if (stemPrefix) {
        scored.push({ p, score: 997 + hits });
      } else if (stemSubseq) {
        scored.push({ p, score: 994 + hits });
      } else if (matchTokens.length >= 3 && hits >= 3) {
        scored.push({ p, score: hits });
      }
    }
    scored.sort((a, b) => b.score - a.score || String(a.p).length - String(b.p).length);
    for (const { p } of scored.slice(0, 5)) add(p);

    return out;
  }

  function effectiveCoverSrc(item) {
    const cacheKey =
      item?.__coverCacheKey != null
        ? String(item.__coverCacheKey)
        : item?.id != null
          ? String(item.id)
          : "";
    if (cacheKey && coverResolutionCache.has(cacheKey)) return coverResolutionCache.get(cacheKey);
    return String(item?.image ?? "").trim();
  }

  /**
   * Try `buildCoverCandidates` in order until one loads. Optionally cache working URL on `item.id`.
   * @param {{ host?: HTMLElement, missingClass?: string | null, onResolved?: (url: string) => void, onExhausted?: () => void }} [opts]
   */
  function wireCoverImageWithFallbacks(img, item, opts) {
    const host = opts?.host;
    const missingClass = opts?.missingClass !== undefined ? opts.missingClass : "card__media--missing";
    const onResolved = opts?.onResolved;
    const onExhausted = opts?.onExhausted;
    const candidates = buildCoverCandidates(item);
    if (!candidates.length) {
      if (host && missingClass) host.classList.add(missingClass);
      onExhausted?.();
      img.removeAttribute("src");
      return;
    }

    let idx = 0;
    function cleanup() {
      img.removeEventListener("error", onErr);
      img.removeEventListener("load", onLoad);
    }
    function onLoad() {
      cleanup();
      if (host && missingClass) host.classList.remove(missingClass);
      const url = img.currentSrc || img.src;
      const cacheKey =
        item?.__coverCacheKey != null
          ? String(item.__coverCacheKey)
          : item?.id != null
            ? String(item.id)
            : "";
      if (cacheKey) coverResolutionCache.set(cacheKey, url);
      onResolved?.(url);
    }
    function onErr() {
      idx += 1;
      if (idx >= candidates.length) {
        cleanup();
        if (host && missingClass) host.classList.add(missingClass);
        onExhausted?.();
        img.removeAttribute("src");
        return;
      }
      img.src = candidates[idx];
    }

    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onErr);
    img.src = candidates[0];
  }

  /** Thumbnail strip to swap the hero `img` (grid card or detail dialog). */
  function mountHeroGalleryStrip(mediaEl, heroImgEl, item) {
    const extras = itemGalleryList(item);
    if (!extras.length) return;

    const strip = document.createElement("div");
    strip.className = "card__gallery-strip";
    strip.setAttribute("role", "tablist");
    strip.setAttribute("aria-label", "Switch photo");

    function setActive(btn) {
      strip.querySelectorAll(".card__gallery-thumb").forEach((b) => b.classList.remove("is-active"));
      if (btn) btn.classList.add("is-active");
    }

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "card__gallery-thumb is-active";
    mainBtn.title = "Cover";
    const mainTi = document.createElement("img");
    const firstCover = buildCoverCandidates(item)[0] ?? String(item.image ?? "").trim();
    mainTi.src = firstCover;
    mainTi.alt = "";
    mainTi.draggable = false;
    mainBtn.appendChild(mainTi);
    mainBtn.addEventListener("click", () => {
      heroImgEl.src = effectiveCoverSrc(item);
      heroImgEl.alt = imageAltForItem(item);
      setActive(mainBtn);
    });
    strip.appendChild(mainBtn);

    extras.forEach((url, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card__gallery-thumb";
      btn.title = `Photo ${i + 2}`;
      const ti = document.createElement("img");
      ti.src = url;
      ti.alt = "";
      ti.draggable = false;
      btn.appendChild(ti);
      btn.addEventListener("click", () => {
        heroImgEl.src = url;
        heroImgEl.alt = `${item.brand} — ${displayNameWithoutLeadingColor(item)} (detail)`;
        setActive(btn);
      });
      strip.appendChild(btn);
    });

    mediaEl.appendChild(strip);
  }

  function showToast(msg) {
    const toastEl = els.outfitToast || document.getElementById("outfit-toast");
    if (!toastEl) return;
    toastEl.textContent = msg || "";
    if (toastTimer) clearTimeout(toastTimer);
    if (msg) {
      toastTimer = setTimeout(() => {
        toastEl.textContent = "";
        toastTimer = null;
      }, 3800);
    }
  }

  /** @type {string | null} */
  let pendingOutfitVariantItemId = null;

  function loadSavedOutfitsFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.outfits)) return [];
      const list = [];
      for (const o of data.outfits) {
        const n = normalizeSavedOutfitRecord(o);
        if (n) list.push(n);
      }
      return list;
    } catch {
      return [];
    }
  }

  function persistSavedOutfitsCache() {
    const payload = {
      version: OUTFIT_STORAGE_VERSION,
      outfits: savedOutfits.map((o) => ({
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        slots: o.slots,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function newOutfitRecordId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    if (supabaseClient) {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    return `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function outfitIdSet() {
    return new Set(currentOutfitSlots.map((s) => s.itemId));
  }

  function outfitSlotKeySet() {
    return new Set(currentOutfitSlots.map(outfitSlotKey));
  }

  function pushOutfitSlot(slot) {
    const item = itemById.get(slot.itemId);
    if (!item) return;
    if (!itemEligibleForOutfit(item)) {
      showToast(
        "Only clothing, shoes, watches, and accessories go into outfits — jewelry and perfume stay in the archive."
      );
      return;
    }
    const k = outfitSlotKey(slot);
    if (outfitSlotKeySet().has(k)) {
      showToast("This colour is already in the outfit.");
      return;
    }
    if (currentOutfitSlots.length >= MAX_OUTFIT_ITEMS) {
      showToast(`Outfits are limited to ${MAX_OUTFIT_ITEMS} pieces.`);
      return;
    }
    currentOutfitSlots.push(slot);
    onOutfitChange();
    showToast("Added to outfit.");
  }

  function openOutfitVariantPicker(itemId) {
    const item = itemById.get(itemId);
    const vars = item ? getItemColorVariants(item) : null;
    const dlg = document.getElementById("outfit-variant-dialog");
    const sel = document.getElementById("outfit-variant-select");
    const title = document.getElementById("outfit-variant-title");
    if (!item || !vars?.length || !dlg || !sel) return;
    pendingOutfitVariantItemId = itemId;
    sel.innerHTML = "";
    for (const v of vars) {
      const o = document.createElement("option");
      o.value = v.key;
      o.textContent = v.label;
      sel.appendChild(o);
    }
    if (title) {
      title.textContent = `${item.brand} — ${displayNameWithoutLeadingColor(item)}`;
    }
    try {
      dlg.showModal();
    } catch {
      /* already open */
    }
    queueMicrotask(() => sel.focus());
  }

  function addToOutfit(id) {
    const item = itemById.get(id);
    if (!item) return;
    const vars = getItemColorVariants(item);
    if (vars?.length) {
      openOutfitVariantPicker(id);
      return;
    }
    pushOutfitSlot({ itemId: id });
  }

  function removeOutfitSlotAt(index) {
    if (index < 0 || index >= currentOutfitSlots.length) return;
    currentOutfitSlots = currentOutfitSlots.filter((_, i) => i !== index);
    onOutfitChange();
  }

  function clearOutfit() {
    currentOutfitSlots = [];
    els.outfitName.value = "";
    editingSavedOutfitId = null;
    syncOutfitSaveButtonLabel();
    onOutfitChange();
    showToast("Outfit cleared.");
  }

  function syncOutfitSaveButtonLabel() {
    const btn = els.outfitSave || document.getElementById("outfit-save");
    if (!btn) return;
    btn.textContent = editingSavedOutfitId ? "Update outfit" : "Save outfit";
    btn.title = editingSavedOutfitId
      ? "Save changes to the outfit you opened with Edit."
      : "Save the current strip as a new named outfit.";
  }

  function reorderOutfit(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= currentOutfitSlots.length ||
      toIndex >= currentOutfitSlots.length
    ) {
      return;
    }
    const next = [...currentOutfitSlots];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    currentOutfitSlots = next;
    onOutfitChange();
  }

  async function saveCurrentOutfit() {
    const name = els.outfitName.value.trim();
    if (!currentOutfitSlots.length) {
      showToast("Add at least one piece first.");
      return;
    }
    if (!name) {
      showToast("Please name this outfit.");
      els.outfitName.focus();
      return;
    }
    const slots = currentOutfitSlots.map((s) =>
      s.colorKey ? { itemId: s.itemId, colorKey: s.colorKey } : { itemId: s.itemId }
    );

    const editId = editingSavedOutfitId;
    if (editId) {
      const prevIdx = savedOutfits.findIndex((o) => o.id === editId);
      if (prevIdx < 0) {
        editingSavedOutfitId = null;
        syncOutfitSaveButtonLabel();
        showToast("That saved outfit is no longer here — use Save outfit to create a new one.");
        return;
      }
      const prev = savedOutfits[prevIdx];
      const record = {
        id: editId,
        name,
        slots,
        createdAt: prev.createdAt,
      };

      if (supabaseClient && useCloudOutfits) {
        const api = await import("./js/supabase-client.js");
        const res = await api.updateOutfitWithItems(supabaseClient, record);
        if (!res.ok) {
          showToast(`Cloud update failed: ${res.error}`);
          return;
        }
      }

      const next = [...savedOutfits];
      next[prevIdx] = record;
      savedOutfits = next;
      persistSavedOutfitsCache();
      editingSavedOutfitId = null;
      syncOutfitSaveButtonLabel();
      els.outfitName.value = "";
      renderSavedOutfits();
      showToast(`Updated: “${name}”`);
      return;
    }

    const record = {
      id: newOutfitRecordId(),
      name,
      slots,
      createdAt: new Date().toISOString(),
    };

    if (supabaseClient && useCloudOutfits) {
      const api = await import("./js/supabase-client.js");
      const res = await api.insertOutfitWithItems(supabaseClient, record);
      if (!res.ok) {
        showToast(`Cloud save failed: ${res.error}`);
        return;
      }
    }

    savedOutfits = [record, ...savedOutfits];
    persistSavedOutfitsCache();
    els.outfitName.value = "";
    renderSavedOutfits();
    showToast(`Saved: “${name}”`);
  }

  async function deleteSavedOutfit(id) {
    if (editingSavedOutfitId === id) {
      editingSavedOutfitId = null;
      syncOutfitSaveButtonLabel();
    }
    if (supabaseClient && useCloudOutfits) {
      const api = await import("./js/supabase-client.js");
      const res = await api.deleteOutfitById(supabaseClient, id);
      if (!res.ok) {
        showToast(`Cloud delete failed: ${res.error}`);
        return;
      }
    }
    savedOutfits = savedOutfits.filter((o) => o.id !== id);
    persistSavedOutfitsCache();
    renderSavedOutfits();
    showToast("Outfit deleted.");
  }

  /**
   * @param {string} id
   * @param {{ forEdit?: boolean }} [opts] Pass `forEdit: true` to update that outfit on next save (name field filled).
   */
  function loadSavedIntoBuilder(id, opts = {}) {
    const forEdit = Boolean(opts.forEdit);
    const found = savedOutfits.find((o) => o.id === id);
    if (!found) return;
    const rawSlots = outfitSlotsFromRecord(found);
    const valid = rawSlots.filter((slot) => {
      const it = itemById.get(slot.itemId);
      return it && itemEligibleForOutfit(it);
    });
    const before = rawSlots.length;
    currentOutfitSlots = valid;
    editingSavedOutfitId = forEdit ? id : null;
    if (els.outfitName) els.outfitName.value = forEdit ? String(found.name ?? "").trim() : "";
    syncOutfitSaveButtonLabel();
    onOutfitChange();
    const skipped = before - valid.length;
    if (forEdit) {
      els.outfitName?.focus();
      if (skipped > 0) {
        showToast(`Editing “${found.name}” — skipped ${skipped} archive-only piece(s). Save updates this outfit.`);
      } else {
        showToast(`Editing “${found.name}” — Save updates this outfit.`);
      }
    } else if (skipped > 0) {
      showToast(`Loaded: “${found.name}” — skipped ${skipped} archive-only piece(s).`);
    } else {
      showToast(`Loaded: “${found.name}”`);
    }
  }

  function showAddItemFormMsg(text, isError) {
    const el = document.getElementById("add-item-form-msg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("add-item-form__msg--error", Boolean(isError));
  }

  /**
   * Cover fields must never accept more than one file — clears `multiple` and keeps only the first selection.
   * @param {HTMLInputElement | null | undefined} inputEl
   * @param {() => void} [onDroppedExtra]
   */
  function trimCoverFileInputToOne(inputEl, onDroppedExtra) {
    if (!inputEl || inputEl.type !== "file") return;
    try {
      inputEl.removeAttribute("multiple");
    } catch {
      /* ignore */
    }
    const list = inputEl.files;
    if (!list || list.length <= 1) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(list[0]);
      inputEl.files = dt.files;
      if (onDroppedExtra) onDroppedExtra();
    } catch {
      try {
        inputEl.value = "";
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Resize an uploaded image and return a data URL.
   *
   * PNG / WebP / GIF inputs are re-encoded as **PNG** so any alpha channel (e.g. background
   * removal) is preserved. JPEG / other inputs default to JPEG to keep storage small. Pass
   * `forcePng: true` to force PNG output regardless of source.
   *
   * @param {File} file
   * @param {number | { maxSide?: number, maxWidth?: number, quality?: number, forcePng?: boolean }} [opts]
   *   Defaults: longest edge **1920px** (Full HD class), JPEG quality **0.82**. Prefer `maxSide` so tall images shrink too.
   *   Legacy: `maxWidth` only caps width (omit `maxSide` to use width-only behaviour).
   * @returns {Promise<string>}
   */
  function fileToResizedDataUrl(file, opts) {
    let o = {};
    if (typeof opts === "number") o = { maxSide: opts };
    else if (opts && typeof opts === "object") o = opts;

    const quality = typeof o.quality === "number" ? o.quality : 0.82;
    const forcePng = Boolean(o.forcePng);
    const maxSide = typeof o.maxSide === "number" ? o.maxSide : typeof o.maxWidth === "number" ? null : 1920;
    const maxWidthLegacy = typeof o.maxWidth === "number" ? o.maxWidth : null;

    const mime = String(file?.type ?? "").toLowerCase();
    const fileName = String(file?.name ?? "").toLowerCase();
    const looksAlphaCapable =
      forcePng ||
      mime === "image/png" ||
      mime === "image/webp" ||
      mime === "image/gif" ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".webp") ||
      fileName.endsWith(".gif");
    const outMime = looksAlphaCapable ? "image/png" : "image/jpeg";

    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        if (!nw || !nh) {
          reject(new Error("Could not read image dimensions"));
          return;
        }
        let w = nw;
        let h = nh;
        if (maxSide != null && maxSide > 0) {
          const m = Math.max(w, h);
          if (m > maxSide) {
            const s = maxSide / m;
            w = Math.round(w * s);
            h = Math.round(h * s);
          }
        } else {
          const capW = maxWidthLegacy != null && maxWidthLegacy > 0 ? maxWidthLegacy : 1920;
          if (w > capW) {
            h = Math.round((h * capW) / w);
            w = capW;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          if (outMime === "image/png") {
            resolve(canvas.toDataURL("image/png"));
          } else {
            resolve(canvas.toDataURL("image/jpeg", quality));
          }
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image failed to load"));
      };
      img.src = url;
    });
  }

  /** Encode steps for `localStorage` / JSON — tries progressively smaller until under a soft byte budget. */
  const STORAGE_IMAGE_TIERS = [
    { maxSide: 1920, quality: 0.88 },
    { maxSide: 1920, quality: 0.82 },
    { maxSide: 1680, quality: 0.84 },
    { maxSide: 1536, quality: 0.82 },
    { maxSide: 1440, quality: 0.8 },
    { maxSide: 1280, quality: 0.78 },
    { maxSide: 1152, quality: 0.75 },
    { maxSide: 1080, quality: 0.72 },
    { maxSide: 960, quality: 0.7 },
    { maxSide: 840, quality: 0.66 },
    { maxSide: 720, quality: 0.62 },
    { maxSide: 640, quality: 0.58 },
    { maxSide: 520, quality: 0.54 },
  ];

  /** Stop stepping down when data URL is under this (chars); PNG stays smaller so use a lower cap. */
  const STORAGE_IMAGE_SOFT_LIMIT_JPEG = 1_200_000;
  const STORAGE_IMAGE_SOFT_LIMIT_PNG = 650_000;

  /** After `QuotaExceededError`: one aggressive re-encode (still HD-class before tiny fallbacks). */
  const QUOTA_SHRINK_MAX_SIDE = 1280;
  const QUOTA_SHRINK_QUALITY = 0.72;

  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  async function fileToStorageDataUrl(file) {
    /** @type {string} */
    let chosen = "";
    for (const t of STORAGE_IMAGE_TIERS) {
      chosen = await fileToResizedDataUrl(file, t);
      const png = chosen.startsWith("data:image/png");
      if (chosen.length <= (png ? STORAGE_IMAGE_SOFT_LIMIT_PNG : STORAGE_IMAGE_SOFT_LIMIT_JPEG)) return chosen;
    }
    return chosen;
  }

  /**
   * Re-encode a `data:` image URL smaller as JPEG (used after `QuotaExceededError`).
   * Defaults match `QUOTA_SHRINK_MAX_SIDE` / `QUOTA_SHRINK_QUALITY` (HD-class single pass).
   * @param {string} dataUrl
   * @param {number} [maxSide]
   * @param {number} [quality]
   * @returns {Promise<string>}
   */
  async function shrinkDataUrlForStorage(dataUrl, maxSide = QUOTA_SHRINK_MAX_SIDE, quality = QUOTA_SHRINK_QUALITY) {
    const s = String(dataUrl ?? "").trim();
    if (!s.startsWith("data:image")) return s;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (!w || !h) {
          resolve(s);
          return;
        }
        const m = Math.max(w, h);
        if (m > maxSide) {
          const scale = maxSide / m;
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => resolve(s);
      img.src = s;
    });
  }

  /** Second pass: shrink every embedded image on a custom row before writing JSON to `localStorage`. */
  async function shrinkCustomItemRowForQuota(row) {
    const next = { ...row };
    if (next.image) next.image = await shrinkDataUrlForStorage(String(next.image));
    if (Array.isArray(next.gallery) && next.gallery.length) {
      next.gallery = (
        await Promise.all(next.gallery.map((u) => (u ? shrinkDataUrlForStorage(String(u)) : "")))
      ).filter(Boolean);
    }
    if (Array.isArray(next.colorVariants) && next.colorVariants.length) {
      next.colorVariants = await Promise.all(
        next.colorVariants.map(async (v) => {
          const nv = { ...v };
          if (nv.image) nv.image = await shrinkDataUrlForStorage(String(nv.image));
          if (Array.isArray(nv.gallery) && nv.gallery.length) {
            nv.gallery = (
              await Promise.all(nv.gallery.map((u) => (u ? shrinkDataUrlForStorage(String(u)) : "")))
            ).filter(Boolean);
          }
          return nv;
        })
      );
    }
    return next;
  }

  /** Shown after `QuotaExceededError` when shrinking and retry did not help. */
  const STORAGE_QUOTA_USER_HINT =
    "不是 Chrome 不讓存：每個網站在瀏覽器裡的儲存上限大約只有 5MB。請少放幾張圖、刪掉較舊的自訂單品，或在網站設定裡清除本網站資料。若錯誤句子像舊版（例如 crop first），請強制重新整理（⌘⇧R 或 Ctrl+Shift+R）載入最新 app.js。";

  function dedupeGalleryUrls(imageMain, galleryUrls, max = 12) {
    const main = String(imageMain ?? "").trim();
    const out = [];
    const seen = new Set();
    for (const u of galleryUrls) {
      const s = String(u ?? "").trim();
      if (!s || s === main || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * Remove a piece from this browser’s wardrobe view: custom rows are dropped;
   * archive / Supabase rows are hidden locally and any override for that id is cleared.
   */
  function deleteWardrobePieceFromBrowser(id) {
    const sid = String(id);
    if (!sid) return;
    const isCustom = sid.startsWith("custom-");

    currentOutfitSlots = currentOutfitSlots.filter((s) => s.itemId !== sid);

    if (isCustom) {
      const next = loadCustomItems().filter((x) => x.id !== sid);
      saveCustomItems(next);
    } else {
      const hidden = loadArchiveHiddenIds();
      hidden.add(sid);
      saveArchiveHiddenIds(hidden);
      try {
        const all = loadArchiveOverrides();
        if (Object.prototype.hasOwnProperty.call(all, sid)) {
          delete all[sid];
          saveArchiveOverrides(all);
        }
      } catch (e) {
        console.warn(e);
      }
    }

    mergeWardrobeFromSources();

    if (document.getElementById("grid")) {
      initFilters();
      onOutfitChange();
    }

    showToast("Piece removed from this browser.");

    if (!document.getElementById("grid") && String(detailItemId) === sid) {
      globalThis.location.href = "index.html";
    }
  }

  async function handleAddItemSubmit(ev) {
    ev.preventDefault();
    const form = /** @type {HTMLFormElement} */ (ev.target);
    const brand = document.getElementById("add-item-brand")?.value?.trim() || "";
    const name = document.getElementById("add-item-name")?.value?.trim() || "";
    const browseSlot = document.getElementById("add-item-category")?.value || "";
    const recordPick = document.getElementById("add-item-record-type")?.value?.trim() || "";
    const category = recordPick || defaultRecordCategoryForSlot(browseSlot);
    const season = document.getElementById("add-item-season")?.value?.trim() || "";
    const color = document.getElementById("add-item-color")?.value?.trim() || "";
    const fabric = document.getElementById("add-item-fabric")?.value?.trim() || "";
    const weight = document.getElementById("add-item-weight")?.value?.trim() || "";
    const size = document.getElementById("add-item-size")?.value?.trim() || "";
    const measuredDimensions =
      document.getElementById("add-item-measured-dimensions")?.value?.trim() || "";
    const purchaseDate = document.getElementById("add-item-purchase-date")?.value?.trim() || "";
    const notes = document.getElementById("add-item-notes")?.value?.trim() || "";
    const fileInput = document.getElementById("add-item-image");
    trimCoverFileInputToOne(fileInput, () =>
      showAddItemFormMsg("Cover is limited to one image — using the first file only.", false)
    );
    const file = fileInput?.files?.[0];
    if (!brand || !name || !browseSlot) {
      showAddItemFormMsg("Fill required fields (brand, name, section).", true);
      return;
    }
    if (itemSlot({ category, season: season || "" }) !== browseSlot) {
      showAddItemFormMsg("Pick a record type that fits the selected section.", true);
      return;
    }

    const galleryInput = document.getElementById("add-item-gallery");
    const galleryFiles = galleryInput?.files ? Array.from(galleryInput.files) : [];
    if (file || galleryFiles.length) showAddItemFormMsg("Processing images…", false);

    let dataUrl = "";
    if (file) {
      try {
        dataUrl = await fileToStorageDataUrl(file);
      } catch (err) {
        console.warn(err);
        showAddItemFormMsg("Could not process this image. Try JPEG or PNG.", true);
        return;
      }
    }
    const MAX_GALLERY = 12;
    /** @type {string[]} */
    const galleryUrls = [];
    for (const gf of galleryFiles.slice(0, MAX_GALLERY)) {
      try {
        galleryUrls.push(await fileToStorageDataUrl(gf));
      } catch (err) {
        console.warn(err);
        showAddItemFormMsg("One gallery image could not be processed and was skipped.", true);
      }
    }

    const galleryDeduped = galleryUrls.filter((u) => u && u !== dataUrl);

    const newItem = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? `custom-${crypto.randomUUID()}`
          : `custom-${Date.now()}`,
      brand,
      name,
      section: "",
      category,
      season,
      color,
      fabric,
      weight,
      size,
      measuredDimensions,
      purchaseDate,
      image: dataUrl,
      gallery: galleryDeduped,
      notes,
      pillar: "",
    };

    const list = loadCustomItems();
    list.unshift(newItem);
    try {
      saveCustomItems(list);
    } catch (e) {
      const err = /** @type {any} */ (e);
      const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
      if (!quota) {
        showAddItemFormMsg("Save failed. Try again.", true);
        return;
      }
      showAddItemFormMsg("Storage almost full — compressing photos once more…", false);
      try {
        list[0] = await shrinkCustomItemRowForQuota(newItem);
        saveCustomItems(list);
      } catch (e2) {
        console.warn(e2);
        showAddItemFormMsg(STORAGE_QUOTA_USER_HINT, true);
        return;
      }
    }

    mergeWardrobeFromSources();
    initFilters();
    renderGrid();
    form.reset();
    const catEl = document.getElementById("add-item-category");
    const recordEl = document.getElementById("add-item-record-type");
    if (catEl && recordEl) fillItemEditRecordTypeSelect(recordEl, catEl.value, "");
    const prev = document.getElementById("add-item-preview");
    if (prev) {
      prev.hidden = true;
      prev.removeAttribute("src");
    }
    showAddItemFormMsg("Added to wardrobe.", false);
    showToast("Custom piece saved.");
    document.getElementById("add-item-dialog")?.close();
  }

  function initAddItemForm() {
    const form = document.getElementById("add-item-form");
    const cat = document.getElementById("add-item-category");
    const recordSel = document.getElementById("add-item-record-type");
    const imgInput = document.getElementById("add-item-image");
    const preview = document.getElementById("add-item-preview");
    if (!form || !cat || !recordSel) return;
    cat.innerHTML = "";
    for (const c of SLOT_OPTIONS) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = categoryDisplayLabel(c);
      cat.appendChild(o);
    }

    function syncAddItemRecordTypes() {
      fillItemEditRecordTypeSelect(recordSel, cat.value, "");
    }
    cat.addEventListener("change", syncAddItemRecordTypes);
    syncAddItemRecordTypes();

    imgInput?.addEventListener("change", () => {
      trimCoverFileInputToOne(imgInput, () =>
        showAddItemFormMsg("Cover is limited to one image — using the first file only.", false)
      );
      const f = imgInput.files?.[0];
      if (!preview) return;
      if (!f) {
        preview.hidden = true;
        preview.removeAttribute("src");
        return;
      }
      const u = URL.createObjectURL(f);
      preview.onload = () => URL.revokeObjectURL(u);
      preview.src = u;
      preview.hidden = false;
    });

    form.addEventListener("submit", (e) => void handleAddItemSubmit(e));
    form.addEventListener("reset", () => {
      requestAnimationFrame(() => {
        if (!preview) return;
        preview.hidden = true;
        preview.removeAttribute("src");
        showAddItemFormMsg("", false);
        syncAddItemRecordTypes();
      });
    });

    const addDlg = document.getElementById("add-item-dialog");
    const openAdd = document.getElementById("add-item-open");
    const closeAdd = document.getElementById("add-item-close");
    openAdd?.setAttribute("aria-haspopup", "dialog");
    openAdd?.setAttribute("aria-expanded", "false");
    addDlg?.addEventListener("close", () => {
      openAdd?.setAttribute("aria-expanded", "false");
    });
    openAdd?.addEventListener("click", () => {
      if (!addDlg) return;
      try {
        addDlg.showModal();
      } catch {
        /* already open */
      }
      openAdd?.setAttribute("aria-expanded", "true");
      queueMicrotask(() => document.getElementById("add-item-brand")?.focus());
    });
    closeAdd?.addEventListener("click", () => addDlg?.close());
    addDlg?.addEventListener("click", (e) => {
      if (e.target === addDlg) addDlg.close();
    });
  }

  function createCard(item) {
    const variants = getItemColorVariants(item);
    const inOutfit = outfitIdSet().has(item.id);
    const allVariantKeys =
      variants?.map((v) => v.key) ??
      [];
    const takenKeys = new Set(
      currentOutfitSlots.filter((s) => s.itemId === item.id && s.colorKey).map((s) => String(s.colorKey))
    );
    const everyVariantTaken =
      Boolean(variants?.length) && allVariantKeys.length > 0 && allVariantKeys.every((k) => takenKeys.has(k));
    const singleTaken = !variants?.length && outfitSlotKeySet().has(outfitSlotKey({ itemId: item.id }));

    const slotLab = itemSlot(item);
    const recKey = recordCategoryForDrill(item, slotLab);

    const article = document.createElement("article");
    const outfitHighlight = inOutfit && itemEligibleForOutfit(item);
    article.className = "card" + (outfitHighlight ? " card--in-outfit" : "");
    article.setAttribute("role", "listitem");
    article.dataset.itemId = String(item.id);

    const media = document.createElement("div");
    media.className = "card__media card__media--opens-detail";
    if (variants?.length) media.classList.add("card__media--variant-colors");

    const img = document.createElement("img");
    img.className = "card__media-img";
    img.alt = imageAltForItem(item);
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    wireCoverImageWithFallbacks(img, item, {
      host: media,
      onResolved(url) {
        const ti = media.querySelector(".card__gallery-strip .card__gallery-thumb.is-active img");
        if (ti) ti.src = url;
      },
    });

    media.appendChild(img);
    if (!variants?.length) {
      mountHeroGalleryStrip(media, img, item);
    } else if (itemGalleryList(item).length) {
      mountHeroGalleryStrip(media, img, item);
    }

    const rawSe = String(item.season ?? "").trim();
    if (rawSe === "A/W" || rawSe === "S/S") {
      const chip = document.createElement("span");
      chip.className = "card__season-chip";
      chip.textContent = seasonUiLabel(rawSe);
      media.appendChild(chip);
    }

    if (itemEligibleForOutfit(item)) {
      const quick = document.createElement("button");
      quick.type = "button";
      quick.className = "card__quick-outfit";
      quick.dataset.outfitAdd = item.id;
      const blocked = everyVariantTaken || singleTaken;
      if (variants?.length) {
        quick.title = everyVariantTaken ? "Every colour is already in this outfit." : "Add a colour to outfit";
      } else {
        quick.title = singleTaken ? "Already in this outfit." : "Add to outfit";
      }
      quick.textContent = blocked ? "✓" : "+";
      quick.disabled = Boolean(blocked);
      media.appendChild(quick);
    }

    const openHint = "Open piece";
    media.title = openHint;
    function openCardDetail(ev) {
      openItemDetail(String(item.id), ev);
    }
    media.addEventListener("click", (ev) => {
      if (ev.target.closest(".card__quick-outfit")) return;
      if (ev.target.closest(".card__gallery-thumb")) return;
      if (ev.target.closest(".card__season-chip")) return;
      openCardDetail(ev);
    });

    const body = document.createElement("div");
    body.className = "card__body";

    const title = document.createElement("h2");
    title.className = "card__title card__title--opens-detail";
    title.textContent = displayNameWithoutLeadingColor(item);
    title.title = openHint;
    title.tabIndex = 0;
    title.addEventListener("click", openCardDetail);
    title.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      openCardDetail(ev);
    });

    const brand = document.createElement("p");
    brand.className = "card__brand";
    brand.textContent = item.brand;

    const metaLine = document.createElement("p");
    metaLine.className = "card__meta-line";
    const fr = friendlyRecordCategory(recKey) || recKey;
    metaLine.textContent = `${fr} · ${categoryDisplayLabel(slotLab)}`;

    body.appendChild(title);
    body.appendChild(brand);
    body.appendChild(metaLine);

    mountVariantSwatchStrip(body, item);

    const specs = document.createElement("ul");
    specs.className = "card__specs";
    for (const part of specParts(item)) {
      const li = document.createElement("li");
      li.textContent = part;
      specs.appendChild(li);
    }
    if (item.size) {
      const li = document.createElement("li");
      li.textContent = String(item.size).trim();
      specs.appendChild(li);
    }
    if (item.measuredDimensions) {
      const li = document.createElement("li");
      li.textContent = String(item.measuredDimensions).trim();
      specs.appendChild(li);
    }
    if (item.purchaseDate) {
      const li = document.createElement("li");
      li.textContent = formatPurchaseDateForDisplay(item.purchaseDate);
      specs.appendChild(li);
    }

    if (specs.children.length) body.appendChild(specs);

    article.appendChild(media);
    article.appendChild(body);
    return article;
  }

  function isCustomWardrobeItem(item) {
    return item && typeof item.id === "string" && item.id.startsWith("custom-");
  }

  /**
   * List order: when not filtered by drill record-type, outer → jackets → … → bottoms → shoes → …
   * then brand / name. With a drill sub-type active, preserve archive seed order inside that type.
   */
  function compareArchiveGridItems(a, b) {
    const drilled = Boolean(String(subcategoryFilter ?? "").trim());
    if (!drilled) {
      const tax = compareByTaxonomy(a, b);
      if (tax !== 0) return tax;
      const ka = `${String(a?.brand ?? "")}\0${String(a?.name ?? "")}\0${String(a?.id ?? "")}`;
      const kb = `${String(b?.brand ?? "")}\0${String(b?.name ?? "")}\0${String(b?.id ?? "")}`;
      return ka.localeCompare(kb, undefined, { sensitivity: "base" });
    }

    const ca = isCustomWardrobeItem(a);
    const cb = isCustomWardrobeItem(b);
    if (ca !== cb) return ca ? -1 : 1;
    if (ca) {
      const ka = `${String(a?.brand ?? "")}\0${String(a?.name ?? "")}\0${String(a?.id ?? "")}`;
      const kb = `${String(b?.brand ?? "")}\0${String(b?.name ?? "")}\0${String(b?.id ?? "")}`;
      return ka.localeCompare(kb, undefined, { sensitivity: "base" });
    }
    const oa = Number.isFinite(a?.__archiveOrdinal) ? a.__archiveOrdinal : 1e9;
    const ob = Number.isFinite(b?.__archiveOrdinal) ? b.__archiveOrdinal : 1e9;
    if (oa !== ob) return oa - ob;
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), undefined, { sensitivity: "base" });
  }

  function renderGrid() {
    if (!els.grid) return;
    const filtered = applyFilters(items);
    const sorted = [...filtered].sort(compareArchiveGridItems);
    els.grid.innerHTML = "";
    for (const item of sorted) {
      els.grid.appendChild(createCard(item));
    }
    const n = sorted.length;
    const seasonalTotal = countItemsForCurrentSeasonTab();
    const narrow = describeNarrowingFiltersForUi();
    if (els.count) {
      if (narrowingFiltersActive()) {
        els.count.textContent =
          n === seasonalTotal
            ? `${n} piece${n === 1 ? "" : "s"} · ${narrow}`
            : `${n} of ${seasonalTotal} piece${seasonalTotal === 1 ? "" : "s"} · ${narrow}`;
      } else {
        const where =
          seasonNavFilter === "All"
            ? "all seasons"
            : seasonNavFilter === "A/W"
              ? "A/W"
              : "S/S";
        els.count.textContent = `${n} piece${n === 1 ? "" : "s"} in ${where}`;
      }
    }
    if (els.emptyMsg) {
      const onSeasonTab = seasonNavFilter !== "All";
      els.emptyMsg.textContent = narrowingFiltersActive()
        ? onSeasonTab
          ? "Nothing matches that category, type, or search on this season tab."
          : "Nothing matches that category, type, or search."
        : onSeasonTab
          ? "No pieces on this season tab match."
          : "No pieces match.";
    }
    if (els.emptyReset) els.emptyReset.hidden = !narrowingFiltersActive();
    if (els.emptyWrap) els.emptyWrap.hidden = n > 0;
    els.grid.hidden = n === 0;
    syncFilterSummaryBar();
  }

  let dragFromIndex = null;

  function syncOutfitBuilderPanel() {
    const dock = document.getElementById("outfit-dock");
    if (!dock) return;
    dock.classList.toggle("outfit-dock--builder-open", currentOutfitSlots.length > 0);
  }

  function renderOutfitStrip() {
    if (!els.outfitStrip) return;
    els.outfitStrip.innerHTML = "";
    const empty = currentOutfitSlots.length === 0;
    if (els.outfitEmpty) els.outfitEmpty.hidden = !empty;
    if (empty) {
      syncOutfitBuilderPanel();
      return;
    }

    currentOutfitSlots.forEach((pieceSlot, index) => {
      const item = itemById.get(pieceSlot.itemId);
      if (!item) return;
      const proj = itemProjectionForOutfitSlot(item, pieceSlot);
      const variant = getItemColorVariants(item)?.find((v) => v.key === pieceSlot.colorKey);

      const slot = document.createElement("div");
      slot.className = "outfit-slot";
      slot.setAttribute("role", "listitem");
      slot.draggable = true;
      slot.dataset.dragIndex = String(index);

      slot.addEventListener("dragstart", (e) => {
        dragFromIndex = index;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        slot.classList.add("outfit-slot--dragging");
      });

      slot.addEventListener("dragend", () => {
        dragFromIndex = null;
        slot.classList.remove("outfit-slot--dragging");
      });

      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });

      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        const from =
          dragFromIndex != null
            ? dragFromIndex
            : parseInt(e.dataTransfer.getData("text/plain"), 10);
        const to = index;
        if (!Number.isFinite(from)) return;
        reorderOutfit(from, to);
      });

      const thumb = document.createElement("div");
      thumb.className = "outfit-slot__thumb";
      const simg = document.createElement("img");
      simg.alt = "";
      wireCoverImageWithFallbacks(simg, proj, {
        host: thumb,
        missingClass: null,
        onExhausted: () => {
          thumb.style.background = "#e8e4dc";
        },
      });
      thumb.appendChild(simg);

      const meta = document.createElement("div");
      meta.className = "outfit-slot__meta";
      const b = document.createElement("p");
      b.className = "outfit-slot__brand";
      b.textContent = item.brand;
      const nm = document.createElement("p");
      nm.className = "outfit-slot__name";
      nm.textContent = displayNameWithoutLeadingColor(item);
      meta.appendChild(b);
      meta.appendChild(nm);
      if (variant) {
        const col = document.createElement("p");
        col.className = "outfit-slot__colour";
        col.textContent = variant.label;
        meta.appendChild(col);
      }

      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn--small btn--ghost outfit-slot__remove";
      rm.textContent = "Remove";
      rm.dataset.outfitRemoveIndex = String(index);

      slot.appendChild(thumb);
      slot.appendChild(meta);
      slot.appendChild(rm);
      els.outfitStrip.appendChild(slot);
    });
    syncOutfitBuilderPanel();
  }

  function formatSavedDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function renderSavedOutfits() {
    if (!els.savedList) return;
    els.savedList.innerHTML = "";
    const empty = savedOutfits.length === 0;
    els.savedEmpty.hidden = !empty;
    if (empty) return;

    for (const outfit of savedOutfits) {
      const li = document.createElement("li");
      const card = document.createElement("div");
      card.className = "saved-card";

      const main = document.createElement("div");
      main.className = "saved-card__main";
      const title = document.createElement("p");
      title.className = "saved-card__name";
      title.textContent = outfit.name;
      const meta = document.createElement("p");
      meta.className = "saved-card__meta";
      const slots = outfitSlotsFromRecord(outfit);
      const n = slots.filter((s) => itemById.has(s.itemId)).length;
      const dateStr = formatSavedDate(outfit.createdAt);
      meta.textContent = `${n} piece${n === 1 ? "" : "s"}${dateStr ? ` · ${dateStr}` : ""}`;
      main.appendChild(title);
      main.appendChild(meta);

      const thumbs = document.createElement("div");
      thumbs.className = "saved-card__thumbs";
      for (const pieceSlot of slots.slice(0, 8)) {
        const piece = itemById.get(pieceSlot.itemId);
        if (!piece) continue;
        const proj = itemProjectionForOutfitSlot(piece, pieceSlot);
        const im = document.createElement("img");
        im.alt = "";
        im.loading = "lazy";
        thumbs.appendChild(im);
        wireCoverImageWithFallbacks(im, proj, { missingClass: null });
      }

      const act = document.createElement("div");
      act.className = "saved-card__actions";
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "btn btn--small btn--ghost";
      loadBtn.textContent = "Load into outfit";
      loadBtn.dataset.outfitLoad = outfit.id;
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--small btn--ghost";
      editBtn.textContent = "Edit";
      editBtn.title = "Load this outfit into the builder and update it on save.";
      editBtn.dataset.outfitEdit = outfit.id;
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.textContent = "Delete";
      delBtn.dataset.outfitDelete = outfit.id;
      act.appendChild(loadBtn);
      act.appendChild(editBtn);
      act.appendChild(delBtn);

      card.appendChild(main);
      card.appendChild(thumbs);
      card.appendChild(act);
      li.appendChild(card);
      els.savedList.appendChild(li);
    }
  }

  function onOutfitChange() {
    sanitizeCurrentOutfit();
    renderGrid();
    renderOutfitStrip();
  }

  function newEditorVariantKey() {
    const tail =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
        : String(Date.now());
    return `nv-${tail}`;
  }

  /** URL-ish slug for a new variant; falls back to nv-* if empty. */
  function slugVariantKeyBase(label) {
    const s = String(label ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return s.slice(0, 48);
  }

  function syncVariantRemoveButtons(listEl) {
    if (!listEl) return;
    const rows = listEl.querySelectorAll(".item-edit-variant-row");
    const n = rows.length;
    listEl.querySelectorAll(".item-edit-variant-remove").forEach((b) => {
      /** @type {HTMLButtonElement} */ (b).hidden = n <= 1;
    });
  }

  /**
   * @param {HTMLElement} listEl
   * @param {{ key?: string, label?: string, color?: string, image?: string, gallery?: string[], notes?: string }} data
   */
  function appendVariantEditorRow(listEl, data) {
    const key = String(data.key ?? "").trim() || newEditorVariantKey();
    const label = String(data.label ?? "").trim();
    const color = String(data.color ?? "").trim();
    const image = String(data.image ?? "").trim();
    const notes = data.notes != null ? String(data.notes) : "";
    const fs = document.createElement("fieldset");
    fs.className = "item-edit-variant-row";
    if (image) fs.setAttribute("data-prev-image", image);

    const leg = document.createElement("legend");
    leg.className = "item-edit-variant-legend";
    leg.textContent = "Colour";

    const keyIn = document.createElement("input");
    keyIn.type = "hidden";
    keyIn.className = "item-edit-variant-key";
    keyIn.value = key;

    const labelIn = document.createElement("input");
    labelIn.type = "text";
    labelIn.className = "item-edit-variant-label";
    labelIn.maxLength = 80;
    labelIn.placeholder = "Label (outfit picker)";
    labelIn.value = label;

    const colorIn = document.createElement("input");
    colorIn.type = "text";
    colorIn.className = "item-edit-variant-color";
    colorIn.maxLength = 80;
    colorIn.placeholder = "Colour name";
    colorIn.value = color;

    const notesIn = document.createElement("input");
    notesIn.type = "text";
    notesIn.className = "item-edit-variant-notes";
    notesIn.maxLength = 200;
    notesIn.placeholder = "Notes (optional)";
    notesIn.value = notes;

    const coverLab = document.createElement("label");
    coverLab.className = "item-edit-variant-cover-wrap";
    const coverSpan = document.createElement("span");
    coverSpan.className = "item-edit-variant-cover-label";
    coverSpan.textContent = image ? "Replace cover (one file only)" : "Cover image (required, one file)";
    const coverIn = document.createElement("input");
    coverIn.type = "file";
    coverIn.className = "item-edit-variant-cover";
    coverIn.accept = "image/*";
    coverIn.addEventListener("change", () => {
      trimCoverFileInputToOne(coverIn);
    });
    coverLab.appendChild(coverSpan);
    coverLab.appendChild(coverIn);

    const rmCov = document.createElement("button");
    rmCov.type = "button";
    rmCov.className = "btn btn--small btn--ghost item-edit-variant-cover-remove";
    rmCov.textContent = "Remove cover";
    rmCov.hidden = !image;
    rmCov.addEventListener("click", () => {
      fs.removeAttribute("data-prev-image");
      coverSpan.textContent = "Cover image (required)";
      rmCov.hidden = true;
      coverIn.value = "";
    });

    const varGalWrap = document.createElement("div");
    varGalWrap.className = "item-edit-variant-gallery-block";
    const varGalLab = document.createElement("span");
    varGalLab.className = "item-edit-variant-cover-label";
    varGalLab.textContent = "Gallery (remove or keep)";
    varGalWrap.appendChild(varGalLab);
    const varGal = document.createElement("div");
    varGal.className = "item-edit-variant-gallery-existing";
    for (const u of Array.isArray(data.gallery) ? data.gallery.map((x) => String(x ?? "").trim()).filter(Boolean) : []) {
      const grow = document.createElement("div");
      grow.className = "item-edit-gallery-row";
      grow.dataset.galleryUrl = u;
      const gim = document.createElement("img");
      gim.className = "item-edit-gallery-thumb";
      gim.alt = "";
      gim.src = u;
      const grm = document.createElement("button");
      grm.type = "button";
      grm.className = "btn btn--small btn--ghost item-edit-gallery-remove";
      grm.textContent = "Remove";
      grm.addEventListener("click", () => grow.remove());
      grow.appendChild(gim);
      grow.appendChild(grm);
      varGal.appendChild(grow);
    }
    varGalWrap.appendChild(varGal);

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn--small btn--ghost item-edit-variant-remove";
    rm.textContent = "Remove";
    rm.hidden = true;

    rm.addEventListener("click", () => {
      fs.remove();
      syncVariantRemoveButtons(listEl);
    });

    fs.appendChild(leg);
    fs.appendChild(keyIn);
    fs.appendChild(labelIn);
    fs.appendChild(colorIn);
    fs.appendChild(notesIn);
    fs.appendChild(coverLab);
    fs.appendChild(rmCov);
    if (varGal.children.length) fs.appendChild(varGalWrap);
    fs.appendChild(rm);
    listEl.appendChild(fs);
    syncVariantRemoveButtons(listEl);
  }

  /**
   * @param {HTMLFormElement} form
   * @param {object} prev
   * @param {(t: string, err?: boolean) => void} setMsg
   * @returns {Promise<{ key: string, label: string, color: string, image: string, gallery: string[], notes: string }[] | null>}
   */
  async function gatherColorVariantsFromEditForm(form, prev, setMsg) {
    const wrap = form.querySelector("#item-edit-variants-wrap");
    if (!wrap || wrap.dataset.active !== "1") return null;
    const listEl = form.querySelector("#item-edit-variants-list");
    if (!listEl) return null;
    const rows = [...listEl.querySelectorAll(".item-edit-variant-row")];
    if (!rows.length) {
      setMsg("Add at least one colour row.", true);
      return null;
    }
    /** @type {{ key: string, label: string, color: string, image: string, gallery: string[], notes: string }[]} */
    const built = [];
    const prevVars = Array.isArray(prev?.colorVariants) ? prev.colorVariants : [];
    for (const row of rows) {
      const key = row.querySelector(".item-edit-variant-key")?.value?.trim() || "";
      const label = row.querySelector(".item-edit-variant-label")?.value?.trim() || "";
      const color = row.querySelector(".item-edit-variant-color")?.value?.trim() || "";
      const notes = row.querySelector(".item-edit-variant-notes")?.value?.trim() || "";
      const coverIn = row.querySelector(".item-edit-variant-cover");
      trimCoverFileInputToOne(/** @type {HTMLInputElement | null} */ (coverIn));
      const file = coverIn?.files?.[0];
      const prevIm = row.getAttribute("data-prev-image")?.trim() || "";
      let image = prevIm;
      if (file) {
        try {
          image = await fileToStorageDataUrl(file);
        } catch (err) {
          console.warn(err);
          setMsg("Could not process a colour cover image.", true);
          return null;
        }
      }
      if (!key) {
        setMsg("Each colour row needs an internal key (reload and try again).", true);
        return null;
      }
      if (!label) {
        setMsg("Each colour needs a label (shown when picking a colour for outfits).", true);
        return null;
      }
      if (!image) {
        setMsg("Each colour needs a cover image — upload one, or keep an existing row’s image.", true);
        return null;
      }
      const match = prevVars.find((x) => x && String(x.key ?? "").trim() === key);
      let gallery = [];
      const gWrap = row.querySelector(".item-edit-variant-gallery-existing");
      if (gWrap) {
        gallery = [...gWrap.querySelectorAll(".item-edit-gallery-row[data-gallery-url]")]
          .map((n) => String(n.getAttribute("data-gallery-url") ?? "").trim())
          .filter(Boolean);
      } else if (match && Array.isArray(match.gallery)) {
        gallery = match.gallery.map((x) => String(x ?? "").trim()).filter(Boolean);
      }
      built.push({
        key,
        label,
        color: color || label,
        image,
        gallery,
        notes,
      });
    }
    return built;
  }

  function itemEditVariantsActive(form) {
    const wrap = form.querySelector("#item-edit-variants-wrap");
    return Boolean(wrap && wrap.dataset.active === "1");
  }

  async function saveItemDetailEdit(form) {
    const msgEl = document.getElementById("item-detail-edit-msg");
    const setMsg = (t, err) => {
      if (!msgEl) return;
      msgEl.textContent = t || "";
      msgEl.classList.toggle("item-detail__edit-msg--error", Boolean(err));
    };

    const id = detailItemId;
    if (!id) return;
    const prev = itemById.get(id);
    if (!prev) return;
    const isCustom = String(id).startsWith("custom-");

    const brand = form.querySelector("#item-edit-brand")?.value?.trim() || "";
    const name = form.querySelector("#item-edit-name")?.value?.trim() || "";
    const browseSlot = form.querySelector("#item-edit-browse-slot")?.value || "";
    const recordPick = form.querySelector("#item-edit-record-type")?.value?.trim() ?? "";
    const category = recordPick || defaultRecordCategoryForSlot(browseSlot);
    const season = form.querySelector("#item-edit-season")?.value?.trim() || "";
    const fabric = form.querySelector("#item-edit-fabric")?.value?.trim() || "";
    const weight = form.querySelector("#item-edit-weight")?.value?.trim() || "";
    const size = form.querySelector("#item-edit-size")?.value?.trim() || "";
    const measuredDimensions = form.querySelector("#item-edit-measured-dimensions")?.value?.trim() || "";
    const purchaseDate = form.querySelector("#item-edit-purchase-date")?.value?.trim() || "";
    const notes = form.querySelector("#item-edit-notes")?.value?.trim() || "";

    const variantsMode = itemEditVariantsActive(form);
    /** @type {{ key: string, label: string, color: string, image: string, gallery: string[], notes: string }[] | null} */
    let colorVariantsBuilt = null;
    if (variantsMode) {
      setMsg("Processing colour images…", false);
      colorVariantsBuilt = await gatherColorVariantsFromEditForm(form, prev, setMsg);
      if (colorVariantsBuilt == null) return;
    }

    const color =
      variantsMode && colorVariantsBuilt?.length
        ? String(colorVariantsBuilt[0].color ?? colorVariantsBuilt[0].label ?? "").trim()
        : form.querySelector("#item-edit-color")?.value?.trim() || "";

    if (!brand || !name || !browseSlot) {
      setMsg("Brand, name, and section are required.", true);
      return;
    }
    const slotProbe = {
      ...prev,
      category,
      season: season || String(prev.season ?? "").trim(),
    };
    if (itemSlot(slotProbe) !== browseSlot) {
      setMsg(
        'That record type does not fit the chosen section — pick one of the types listed under Record type.',
        true
      );
      return;
    }

    let image = String(prev.image ?? "").trim();
    if (variantsMode && colorVariantsBuilt?.length) {
      image = String(colorVariantsBuilt[0].image ?? "").trim() || image;
    } else {
      const stripCover = form.querySelector("#item-edit-remove-cover")?.value === "1";
      const coverEl = /** @type {HTMLInputElement | null} */ (form.querySelector("#item-edit-cover"));
      trimCoverFileInputToOne(coverEl);
      const coverFile = coverEl?.files?.[0];
      if (coverFile) {
        setMsg("Processing images…", false);
        try {
          image = await fileToStorageDataUrl(coverFile);
        } catch (err) {
          console.warn(err);
          setMsg("Could not process the new cover image.", true);
          return;
        }
      } else if (stripCover) {
        image = "";
      }
    }

    let gallery = [...itemGalleryList(prev)];
    if (!variantsMode) {
      const inner = form.querySelector("#item-edit-gallery-existing .item-edit-gallery-existing-inner");
      if (inner) {
        gallery = [...inner.querySelectorAll(".item-edit-gallery-row[data-gallery-url]")]
          .map((r) => String(r.getAttribute("data-gallery-url") ?? "").trim())
          .filter(Boolean);
      }
    }
    const gFiles = form.querySelector("#item-edit-gallery")?.files
      ? Array.from(form.querySelector("#item-edit-gallery").files)
      : [];
    for (const gf of gFiles.slice(0, 12)) {
      try {
        gallery.push(await fileToStorageDataUrl(gf));
      } catch (e) {
        console.warn(e);
        setMsg("Some new gallery images were skipped.", true);
      }
    }
    gallery = dedupeGalleryUrls(image, gallery, 12);

    const updated = {
      ...prev,
      brand,
      name,
      section: "",
      category,
      season,
      color,
      fabric,
      weight,
      size,
      measuredDimensions,
      purchaseDate,
      notes,
      image,
      pillar: "",
    };
    if (gallery.length) updated.gallery = gallery;
    else delete updated.gallery;

    if (variantsMode && colorVariantsBuilt?.length) {
      updated.colorVariants = colorVariantsBuilt;
    } else {
      delete updated.colorVariants;
    }

    if (isCustom) {
      const list = loadCustomItems();
      const idx = list.findIndex((x) => x.id === id);
      if (idx < 0) {
        setMsg("This piece is no longer in your wardrobe.", true);
        return;
      }
      list[idx] = updated;
      try {
        saveCustomItems(list);
      } catch (e) {
        const err = /** @type {any} */ (e);
        const quota = err && (err.name === "QuotaExceededError" || err.code === 22);
        if (!quota) {
          setMsg("Save failed. Try again.", true);
          return;
        }
        setMsg("Storage almost full — compressing photos once more…", false);
        try {
          list[idx] = await shrinkCustomItemRowForQuota(updated);
          saveCustomItems(list);
        } catch (e2) {
          console.warn(e2);
          setMsg(STORAGE_QUOTA_USER_HINT, true);
          return;
        }
      }
    } else {
      const patch = {
        brand,
        name,
        section: "",
        category,
        season,
        color,
        fabric,
        weight,
        size,
        measuredDimensions,
        purchaseDate,
        notes,
        image,
        pillar: "",
      };
      if (gallery.length) patch.gallery = gallery;
      else patch.gallery = [];
      if (variantsMode && colorVariantsBuilt?.length) {
        patch.colorVariants = colorVariantsBuilt;
      }
      try {
        const all = loadArchiveOverrides();
        all[id] = patch;
        saveArchiveOverrides(all);
      } catch (e) {
        console.warn(e);
        setMsg("Could not save (browser storage may be disabled).", true);
        return;
      }
    }

    setMsg("", false);
    mergeWardrobeFromSources();
    if (document.getElementById("grid")) {
      initFilters();
      onOutfitChange();
      renderGrid();
    }
    const next = itemById.get(id);
    const mount = itemDetailMountRoot();
    if (next && mount) renderItemDetailContent(mount, next, { edit: false });
    replaceItemPageUrl(id, false);
    showToast(isCustom ? "Saved changes." : "Saved changes for this browser (archive override).");
  }

  function renderItemDetailContent(root, item, opts = {}) {
    const edit = Boolean(opts.edit);
    detailItemId = item.id;
    root.innerHTML = "";

    const media = document.createElement("div");
    media.className = "card__media item-detail__media";
    const detailVariants = getItemColorVariants(item);
    if (detailVariants?.length) media.classList.add("card__media--variant-colors");
    const img = document.createElement("img");
    img.className = "card__media-img";
    img.alt = imageAltForItem(item);
    img.decoding = "async";
    img.draggable = false;
    wireCoverImageWithFallbacks(img, item, {
      host: media,
      onResolved(url) {
        const ti = media.querySelector(".card__gallery-strip .card__gallery-thumb.is-active img");
        if (ti) ti.src = url;
      },
    });
    media.appendChild(img);
    if (!detailVariants?.length) {
      mountHeroGalleryStrip(media, img, item);
    } else if (itemGalleryList(item).length) {
      mountHeroGalleryStrip(media, img, item);
    }
    root.appendChild(media);

    if (edit) {
      const wrap = document.createElement("div");
      wrap.className = "item-detail__body item-detail__body--edit";
      if (!String(item.id).startsWith("custom-")) {
        const hint = document.createElement("p");
        hint.className = "item-detail__archive-only";
        hint.style.marginBottom = "0.75rem";
        hint.textContent =
          "Edits are saved in this browser only — they do not change files on disk or your Supabase wardrobe rows.";
        wrap.appendChild(hint);
      }

      const form = document.createElement("form");
      form.id = "item-detail-edit-form";
      form.className = "item-detail__form";
      form.setAttribute("novalidate", "");

      const grid = document.createElement("div");
      grid.className = "item-detail__form-grid";

      function addField(labelText, child) {
        const lab = document.createElement("label");
        lab.className = "field";
        const span = document.createElement("span");
        span.className = "field__label";
        span.textContent = labelText;
        lab.appendChild(span);
        lab.appendChild(child);
        grid.appendChild(lab);
      }

      const brandIn = document.createElement("input");
      brandIn.type = "text";
      brandIn.id = "item-edit-brand";
      brandIn.required = true;
      brandIn.maxLength = 120;
      brandIn.value = String(item.brand ?? "");
      addField("Brand", brandIn);

      const nameIn = document.createElement("input");
      nameIn.type = "text";
      nameIn.id = "item-edit-name";
      nameIn.required = true;
      nameIn.maxLength = 200;
      nameIn.value = String(item.name ?? "");
      addField("Name", nameIn);

      const catSel = document.createElement("select");
      catSel.id = "item-edit-browse-slot";
      catSel.required = true;
      const rawCat = String(item.category ?? "").trim();
      const slotPick = SLOT_OPTIONS.includes(rawCat) ? rawCat : itemSlot(item);
      for (const c of SLOT_OPTIONS) {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = categoryDisplayLabel(c);
        if (c === slotPick) o.selected = true;
        catSel.appendChild(o);
      }
      addField("Section", catSel);

      const recordTypeSel = document.createElement("select");
      recordTypeSel.id = "item-edit-record-type";
      recordTypeSel.title =
        'Same labels as the archive "type" strip — controls filtering and default browse order.';
      const currentRecKey = recordCategoryForDrill(item, slotPick);
      addField("Record type", recordTypeSel);
      fillItemEditRecordTypeSelect(recordTypeSel, slotPick, currentRecKey);
      catSel.addEventListener("change", () => {
        fillItemEditRecordTypeSelect(recordTypeSel, catSel.value, recordTypeSel.value);
      });

      const seaSel = document.createElement("select");
      seaSel.id = "item-edit-season";
      const seasonRows = [
        { value: "All-season", label: "All" },
        { value: "A/W", label: "A/W" },
        { value: "S/S", label: "S/S" },
      ];
      const curSe = String(item.season ?? "").trim();
      const curPick = curSe === "A/W" || curSe === "S/S" ? curSe : "All-season";
      for (const row of seasonRows) {
        const o = document.createElement("option");
        o.value = row.value;
        o.textContent = row.label;
        if (row.value === curPick) o.selected = true;
        seaSel.appendChild(o);
      }
      addField("Season (optional)", seaSel);

      const initialVariants = getItemColorVariants(item);
      const isCustomPiece = String(item.id ?? "").startsWith("custom-");

      /** @type {HTMLLabelElement | null} */
      let colorSingleField = null;

      if (!initialVariants) {
        const colorIn = document.createElement("input");
        colorIn.type = "text";
        colorIn.id = "item-edit-color";
        colorIn.maxLength = 80;
        colorIn.value = String(item.color ?? "");
        const colorLab = document.createElement("label");
        colorLab.className = "field";
        const cspan = document.createElement("span");
        cspan.className = "field__label";
        cspan.textContent = "Color (optional)";
        colorLab.appendChild(cspan);
        colorLab.appendChild(colorIn);
        if (isCustomPiece) {
          const migrateHint = document.createElement("p");
          migrateHint.className = "item-edit-variant-migrate-hint";
          migrateHint.textContent =
            "Same piece in another colour needs its own cover photo — outfits will ask which colour to use.";
          const migrateBtn = document.createElement("button");
          migrateBtn.type = "button";
          migrateBtn.className = "btn btn--small btn--ghost item-edit-enable-variants";
          migrateBtn.textContent = "Add another colour…";
          colorLab.appendChild(migrateHint);
          colorLab.appendChild(migrateBtn);
        }
        grid.appendChild(colorLab);
        colorSingleField = colorLab;
      }

      const variantsWrap = document.createElement("div");
      variantsWrap.id = "item-edit-variants-wrap";
      variantsWrap.className = "field field--span2 item-edit-variants-wrap";
      if (initialVariants) {
        variantsWrap.dataset.active = "1";
        variantsWrap.hidden = false;
      } else {
        variantsWrap.dataset.active = "0";
        variantsWrap.hidden = true;
      }

      if (initialVariants) {
        const variantsIntro = document.createElement("p");
        variantsIntro.className = "item-edit-variants-intro";
        variantsIntro.textContent =
          "Edit each colour’s label and colour text. Keys stay fixed so saved outfits keep working — use “Add another colour” for a new option.";
        variantsWrap.appendChild(variantsIntro);
      }

      const listEl = document.createElement("div");
      listEl.id = "item-edit-variants-list";
      listEl.className = "item-edit-variants-list";

      const addVarBtn = document.createElement("button");
      addVarBtn.type = "button";
      addVarBtn.className = "btn btn--small btn--ghost item-edit-variant-add";
      addVarBtn.textContent = "Add another colour";
      addVarBtn.hidden = !initialVariants;

      if (initialVariants) {
        for (const v of initialVariants) {
          appendVariantEditorRow(listEl, {
            key: v.key,
            label: v.label,
            color: v.color,
            image: v.image,
            gallery: v.gallery,
            notes: v.notes,
          });
        }
      }

      variantsWrap.appendChild(listEl);
      variantsWrap.appendChild(addVarBtn);

      addVarBtn.addEventListener("click", () => {
        appendVariantEditorRow(listEl, {
          key: newEditorVariantKey(),
          label: "",
          color: "",
          image: "",
          gallery: [],
          notes: "",
        });
        variantsWrap.dataset.active = "1";
        variantsWrap.hidden = false;
        addVarBtn.hidden = false;
      });

      if (colorSingleField) {
        const migrateBtn = colorSingleField.querySelector(".item-edit-enable-variants");
        migrateBtn?.addEventListener("click", () => {
          const colorIn = /** @type {HTMLInputElement | null} */ (colorSingleField.querySelector("#item-edit-color"));
          const baseColor = colorIn?.value?.trim() || "";
          const label0 = baseColor || "Colour 1";
          const key0 = slugVariantKeyBase(label0) || "colour-1";
          listEl.innerHTML = "";
          appendVariantEditorRow(listEl, {
            key: key0,
            label: label0,
            color: baseColor,
            image: String(item.image ?? ""),
            gallery: itemGalleryList(item),
            notes: "",
          });
          appendVariantEditorRow(listEl, {
            key: newEditorVariantKey(),
            label: "",
            color: "",
            image: "",
            gallery: [],
            notes: "",
          });
          variantsWrap.dataset.active = "1";
          variantsWrap.hidden = false;
          colorSingleField.hidden = true;
          addVarBtn.hidden = false;
          const coverField = form.querySelector("#item-edit-cover")?.closest("label");
          if (coverField instanceof HTMLElement) coverField.hidden = true;
        });
      }

      grid.appendChild(variantsWrap);

      const fabIn = document.createElement("input");
      fabIn.type = "text";
      fabIn.id = "item-edit-fabric";
      fabIn.maxLength = 80;
      fabIn.value = String(item.fabric ?? "");
      addField("Fabric (optional)", fabIn);

      const wtIn = document.createElement("input");
      wtIn.type = "text";
      wtIn.id = "item-edit-weight";
      wtIn.maxLength = 80;
      wtIn.value = String(item.weight ?? "");
      addField("Weight / specs (optional)", wtIn);

      const sizeIn = document.createElement("input");
      sizeIn.type = "text";
      sizeIn.id = "item-edit-size";
      sizeIn.maxLength = 120;
      sizeIn.value = String(item.size ?? "");
      addField("Size (optional)", sizeIn);

      const measTa = document.createElement("textarea");
      measTa.id = "item-edit-measured-dimensions";
      measTa.rows = 2;
      measTa.maxLength = 500;
      measTa.value = String(item.measuredDimensions ?? "");
      addField("Measured dimensions (optional)", measTa);

      const purchaseIn = document.createElement("input");
      purchaseIn.id = "item-edit-purchase-date";
      const pd = String(item.purchaseDate ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(pd)) {
        purchaseIn.type = "date";
        purchaseIn.value = pd;
      } else {
        purchaseIn.type = "text";
        purchaseIn.maxLength = 80;
        purchaseIn.placeholder = "YYYY-MM-DD or short note";
        purchaseIn.value = pd;
      }
      addField("Purchase date (optional)", purchaseIn);

      if (!initialVariants) {
        const removeCoverIn = document.createElement("input");
        removeCoverIn.type = "hidden";
        removeCoverIn.id = "item-edit-remove-cover";
        removeCoverIn.value = "";
        grid.appendChild(removeCoverIn);

        const curImg = String(item.image ?? "").trim();
        if (curImg) {
          const coverManage = document.createElement("div");
          coverManage.className = "field field--span2 item-edit-cover-manage";
          const prevFig = document.createElement("div");
          prevFig.className = "item-edit-current-cover";
          const preImg = document.createElement("img");
          preImg.className = "item-edit-current-cover-img";
          preImg.alt = "Current cover";
          preImg.src = curImg;
          const rmC = document.createElement("button");
          rmC.type = "button";
          rmC.className = "btn btn--small btn--ghost item-edit-remove-cover-btn";
          rmC.textContent = "Remove cover";
          rmC.addEventListener("click", () => {
            removeCoverIn.value = "1";
            prevFig.remove();
          });
          prevFig.appendChild(preImg);
          prevFig.appendChild(rmC);
          coverManage.appendChild(prevFig);
          grid.appendChild(coverManage);
        }
      }

      const coverLab = document.createElement("label");
      coverLab.className = "field field--file field--span2";
      const coverSpan = document.createElement("span");
      coverSpan.className = "field__label";
      coverSpan.textContent = "New cover image (optional, one file only)";
      const coverIn = document.createElement("input");
      coverIn.type = "file";
      coverIn.id = "item-edit-cover";
      coverIn.accept = "image/*";
      coverLab.appendChild(coverSpan);
      coverLab.appendChild(coverIn);
      grid.appendChild(coverLab);
      coverLab.hidden = Boolean(initialVariants);
      if (!initialVariants) {
        coverIn.addEventListener("change", () => {
          trimCoverFileInputToOne(coverIn, () => {
            const msg = document.getElementById("item-detail-edit-msg");
            if (msg) {
              msg.textContent = "Cover is limited to one image — using the first file only.";
              msg.classList.remove("item-detail__edit-msg--error");
            }
          });
          const h = form.querySelector("#item-edit-remove-cover");
          if (h) h.value = "";
        });
      }

      const galLab = document.createElement("label");
      galLab.className = "field field--file field--span2";
      const galSpan = document.createElement("span");
      galSpan.className = "field__label";
      galSpan.textContent = "Add gallery photos (optional, max 12 total)";
      const galIn = document.createElement("input");
      galIn.type = "file";
      galIn.id = "item-edit-gallery";
      galIn.accept = "image/*";
      galIn.multiple = true;
      galLab.appendChild(galSpan);
      galLab.appendChild(galIn);
      grid.appendChild(galLab);

      if (!initialVariants) {
        const galUrls = itemGalleryList(item);
        if (galUrls.length) {
          const galWrap = document.createElement("div");
          galWrap.id = "item-edit-gallery-existing";
          galWrap.className = "field field--span2 item-edit-gallery-existing";
          const galHead = document.createElement("span");
          galHead.className = "field__label";
          galHead.textContent = "Gallery (remove photos you no longer want)";
          galWrap.appendChild(galHead);
          const inner = document.createElement("div");
          inner.className = "item-edit-gallery-existing-inner";
          for (const u of galUrls) {
            const grow = document.createElement("div");
            grow.className = "item-edit-gallery-row";
            grow.dataset.galleryUrl = u;
            const gim = document.createElement("img");
            gim.className = "item-edit-gallery-thumb";
            gim.alt = "";
            gim.src = u;
            const grm = document.createElement("button");
            grm.type = "button";
            grm.className = "btn btn--small btn--ghost item-edit-gallery-remove";
            grm.textContent = "Remove";
            grm.addEventListener("click", () => grow.remove());
            grow.appendChild(gim);
            grow.appendChild(grm);
            inner.appendChild(grow);
          }
          galWrap.appendChild(inner);
          grid.appendChild(galWrap);
        }
      }

      form.appendChild(grid);

      const notesLab = document.createElement("label");
      notesLab.className = "field field--block";
      const notesSpan = document.createElement("span");
      notesSpan.className = "field__label";
      notesSpan.textContent = "Notes (optional)";
      const notesTa = document.createElement("textarea");
      notesTa.id = "item-edit-notes";
      notesTa.rows = 3;
      notesTa.maxLength = 2000;
      notesTa.value = String(item.notes ?? "");
      notesLab.appendChild(notesSpan);
      notesLab.appendChild(notesTa);
      form.appendChild(notesLab);

      const msg = document.createElement("p");
      msg.id = "item-detail-edit-msg";
      msg.className = "item-detail__edit-msg";
      msg.setAttribute("role", "status");
      form.appendChild(msg);

      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        void saveItemDetailEdit(form);
      });
      form.addEventListener("keydown", (ev) => {
        if (!(ev.ctrlKey || ev.metaKey) || ev.key !== "Enter") return;
        ev.preventDefault();
        void saveItemDetailEdit(form);
      });

      const act = document.createElement("div");
      act.className = "item-detail__form-actions";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.id = "item-detail-delete";
      delBtn.textContent = "Delete";
      delBtn.title = isCustomPiece
        ? "Remove this custom piece from this browser."
        : "Hide this archive row in this browser (does not change seed files or cloud).";
      act.appendChild(delBtn);
      const actPush = document.createElement("div");
      actPush.className = "item-detail__form-actions-push";
      const saveBtn = document.createElement("button");
      saveBtn.type = "submit";
      saveBtn.className = "btn btn--small";
      saveBtn.textContent = "Save changes";
      saveBtn.title = "Save (⌘ Enter or Ctrl+Enter)";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn--small btn--ghost";
      cancelBtn.id = "item-detail-cancel-edit";
      cancelBtn.textContent = "Cancel";
      cancelBtn.title = "Discard changes (Esc)";
      actPush.appendChild(saveBtn);
      actPush.appendChild(cancelBtn);
      act.appendChild(actPush);
      form.appendChild(act);

      const h2 = document.createElement("h2");
      h2.id = "item-detail-heading";
      h2.className = "item-detail__title";
      h2.textContent = "Edit piece";
      wrap.appendChild(h2);
      wrap.appendChild(form);
      root.appendChild(wrap);
      afterItemDetailPageRender(root, true);
      return;
    }

    const body = document.createElement("div");
    body.className = "item-detail__body";

    const title = document.createElement("h2");
    title.id = "item-detail-heading";
    title.className = "item-detail__title";
    title.textContent = displayNameWithoutLeadingColor(item);
    body.appendChild(title);

    const brand = document.createElement("p");
    brand.className = "item-detail__brand";
    brand.textContent = item.brand;
    body.appendChild(brand);

    mountVariantSwatchStrip(body, item);

    if (!itemEligibleForOutfit(item)) {
      const only = document.createElement("p");
      only.className = "item-detail__archive-only";
      only.textContent = "Archive entry — not used in the outfit builder.";
      body.appendChild(only);
    }

    const dl = document.createElement("dl");
    dl.className = "item-detail__meta";

    function addRow(label, value) {
      const v = value == null ? "" : String(value).trim();
      if (!v) return;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    const slotLabel = itemSlot(item);
    addRow("Category", categoryDisplayLabel(slotLabel));
    const rk = recordCategoryForDrill(item, slotLabel);
    addRow("Record type", friendlyRecordCategory(rk) || rk);
    addRow("Season", seasonUiLabel(item.season));
    addRow("Size", item.size);
    addRow("Measured dimensions", item.measuredDimensions);
    {
      const pd = String(item.purchaseDate ?? "").trim();
      if (pd) addRow("Purchase date", formatPurchaseDateForDisplay(pd));
    }
    const specLine = specParts(item).join(" · ");
    if (specLine) addRow("Details", specLine);

    if (dl.children.length) body.appendChild(dl);

    if (item.notes) {
      const nh = document.createElement("h3");
      nh.className = "item-detail__notes-h";
      nh.textContent = "Notes";
      const np = document.createElement("div");
      np.className = "item-detail__notes";
      np.textContent = item.notes;
      body.appendChild(nh);
      body.appendChild(np);
    }

    root.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "item-detail__actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn--small btn--ghost";
    copyBtn.id = "item-detail-copy-text";
    copyBtn.textContent = "Copy text for AI";
    copyBtn.title =
      "Copies text fields only; paths stay as text, embedded images are summarized (not pasted in full).";
    actions.appendChild(copyBtn);

    const isCustom = typeof item.id === "string" && item.id.startsWith("custom-");
    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "btn btn--small";
    ed.id = "item-detail-edit";
    ed.textContent = "Edit";
    actions.appendChild(ed);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn--small btn--danger";
    delBtn.id = "item-detail-delete";
    delBtn.textContent = "Delete";
    delBtn.title = isCustom
      ? "Remove this custom piece from this browser."
      : "Hide this archive row in this browser (does not change seed files or cloud).";
    actions.appendChild(delBtn);
    actions.id = "item-detail-actions";
    root.appendChild(actions);
    afterItemDetailPageRender(root, false);
  }

  function replaceItemPageUrl(id, withEdit) {
    if (document.getElementById("grid")) return;
    const u = new URL("item.html", globalThis.location.href);
    u.searchParams.set("id", String(id));
    if (withEdit) u.searchParams.set("edit", "1");
    else u.searchParams.delete("edit");
    globalThis.history.replaceState(null, "", u.pathname + u.search);
  }

  function persistArchiveListScrollForReturn() {
    if (!document.getElementById("grid")) return;
    try {
      sessionStorage.setItem(
        ARCHIVE_SCROLL_RESTORE_KEY,
        JSON.stringify({
          y: globalThis.scrollY ?? globalThis.pageYOffset ?? 0,
          t: Date.now(),
        })
      );
    } catch {
      /* private mode / disabled storage */
    }
  }

  function persistArchiveBrowseStateForReturn() {
    if (!document.getElementById("grid")) return;
    try {
      sessionStorage.setItem(
        ARCHIVE_BROWSE_RESTORE_KEY,
        JSON.stringify({
          t: Date.now(),
          seasonNav: seasonNavFilter,
          category: String(categoryNavFilter ?? ""),
          subcategory: String(subcategoryFilter ?? "").trim(),
          search: String(els.search?.value ?? "").trim(),
        })
      );
    } catch {
      /* private mode / disabled storage */
    }
  }

  /** Apply category / season / drill / search after a full reload when returning from `item.html`. */
  function consumeArchiveBrowseStateForReturn() {
    if (!document.getElementById("grid")) return;
    let raw = null;
    try {
      raw = sessionStorage.getItem(ARCHIVE_BROWSE_RESTORE_KEY);
      if (raw) sessionStorage.removeItem(ARCHIVE_BROWSE_RESTORE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let o = null;
    try {
      o = JSON.parse(raw);
    } catch {
      return;
    }
    const t = Number(o?.t);
    if (!Number.isFinite(t) || Date.now() - t > ARCHIVE_SCROLL_TTL_MS) return;

    const nav = String(o?.seasonNav ?? "").trim();
    if (nav === "All" || nav === "S/S" || nav === "A/W") seasonNavFilter = nav;

    const cat = String(o?.category ?? "").trim();
    if (!cat) categoryNavFilter = "";
    else if (SLOT_OPTIONS.includes(cat)) categoryNavFilter = cat;

    subcategoryFilter = String(o?.subcategory ?? "").trim();
    const q = String(o?.search ?? "").trim();
    if (els.search && q) els.search.value = q.slice(0, 500);

    try {
      persistSeasonNav();
    } catch {
      /* ignore */
    }
  }

  function consumeAndRestoreArchiveListScroll() {
    if (!document.getElementById("grid")) return;
    let raw = null;
    try {
      raw = sessionStorage.getItem(ARCHIVE_SCROLL_RESTORE_KEY);
      if (raw) sessionStorage.removeItem(ARCHIVE_SCROLL_RESTORE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let o = null;
    try {
      o = JSON.parse(raw);
    } catch {
      return;
    }
    const y = Number(o?.y);
    const t = Number(o?.t);
    if (!Number.isFinite(y) || y < 0) return;
    if (!Number.isFinite(t) || Date.now() - t > ARCHIVE_SCROLL_TTL_MS) return;

    function clampScroll(target) {
      const el = document.documentElement;
      const body = document.body;
      const h = Math.max(
        el?.scrollHeight ?? 0,
        body?.scrollHeight ?? 0,
        el?.offsetHeight ?? 0,
        body?.offsetHeight ?? 0
      );
      const max = Math.max(0, h - globalThis.innerHeight);
      globalThis.scrollTo(0, Math.min(Math.max(0, target), max));
    }

    const run = () => clampScroll(y);
    requestAnimationFrame(run);
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 80);
    setTimeout(run, 280);
  }

  /**
   * @param {string} id
   * @param {MouseEvent | undefined} [fromEvent] — used for modifier-click → new tab
   */
  function openItemDetail(id, fromEvent) {
    if (!id) return;
    const u = new URL("item.html", globalThis.location.href);
    u.searchParams.set("id", String(id));
    const url = u.toString();
    const ev = fromEvent;
    const openNewTab =
      ev instanceof MouseEvent &&
      (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1);
    if (openNewTab) {
      globalThis.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    persistArchiveListScrollForReturn();
    persistArchiveBrowseStateForReturn();
    globalThis.location.assign(url);
  }

  function initItemDetailRootDelegates() {
    const root = itemDetailMountRoot();
    if (!root) return;

    if (!itemDetailDelegatesInstalled) {
      itemDetailDelegatesInstalled = true;
      root.addEventListener("click", (e) => {
        const mount = /** @type {HTMLElement} */ (e.currentTarget);
        const t = /** @type {Element | null} */ (e.target instanceof Element ? e.target : null);
        if (t?.closest("#item-detail-copy-text")) {
          const it = itemById.get(detailItemId);
          if (it) void copyItemPlainTextForAi(it);
          return;
        }
        if (t?.closest("#item-detail-edit")) {
          const it = itemById.get(detailItemId);
          if (it) {
            renderItemDetailContent(mount, it, { edit: true });
            replaceItemPageUrl(it.id, true);
          }
          return;
        }
        if (t?.closest("#item-detail-delete")) {
          const it = itemById.get(detailItemId);
          if (!it) return;
          const custom = String(it.id).startsWith("custom-");
          const msg = custom
            ? "Delete this piece from this browser? Its fields and images are removed and cannot be restored."
            : "Remove this piece from your wardrobe in this browser? It disappears from the grid here; seed files and cloud data are not changed.";
          if (!confirm(msg)) return;
          deleteWardrobePieceFromBrowser(it.id);
          return;
        }
        if (t?.closest("#item-detail-cancel-edit")) {
          const it = itemById.get(detailItemId);
          if (it) {
            renderItemDetailContent(mount, it, { edit: false });
            replaceItemPageUrl(it.id, false);
          }
          return;
        }
      });
    }

    if (!itemDetailPageKeyboardInstalled) {
      itemDetailPageKeyboardInstalled = true;
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (document.querySelector("dialog[open]")) return;
        const mount = itemDetailMountRoot();
        if (!mount?.classList.contains("item-detail__root--page")) return;
        if (document.getElementById("grid")) return;
        if (!document.getElementById("item-detail-edit-form")) return;
        const it = itemById.get(detailItemId);
        if (!it || !mount) return;
        e.preventDefault();
        renderItemDetailContent(mount, it, { edit: false });
        replaceItemPageUrl(it.id, false);
      });
    }
  }

  function runItemDetailPage(root, pageId) {
    const item = itemById.get(pageId);
    const params = new URLSearchParams(globalThis.location.search);
    const wantEdit = params.get("edit") === "1";

    if (!item) {
      root.innerHTML =
        '<div class="item-page-not-found-wrap" role="alert">' +
        '<p class="item-page-not-found">This piece is not in the archive.</p>' +
        '<p class="item-page-not-found__hint">The link may be outdated or the piece was removed.</p>' +
        '<p><a class="btn" href="index.html">Back to archive</a></p>' +
        "</div>";
      document.title = "Piece not found · Timeless Wardrobe";
      globalThis.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    document.title = `${item.brand} — ${displayNameWithoutLeadingColor(item)} · Timeless Wardrobe`;
    renderItemDetailContent(root, item, { edit: wantEdit });
  }

  function syncCategoryTabUI() {
    const nav = document.getElementById("category-nav");
    if (!nav) return;
    nav.querySelectorAll(".category-nav__tab").forEach((tab) => {
      const v = tab.dataset.categoryFilter ?? "";
      const active = v === categoryNavFilter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function syncSeasonTabUI() {
    const nav = document.getElementById("category-nav");
    if (!nav) return;
    nav.querySelectorAll(".season-strip__tab").forEach((tab) => {
      const v = tab.dataset.seasonFilter ?? "";
      const active = v === seasonNavFilter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function isFiltersNarrowViewport() {
    return globalThis.matchMedia?.("(max-width: 720px)")?.matches ?? false;
  }

  function syncFiltersMenuForViewport() {
    const nav = document.getElementById("filters-nav");
    const btn = document.getElementById("filters-menu-btn");
    if (!nav || !btn) return;
    if (!isFiltersNarrowViewport()) {
      nav.classList.remove("filters--menu-open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    } else {
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
      btn.setAttribute("aria-expanded", nav.classList.contains("filters--menu-open") ? "true" : "false");
    }
  }

  function collapseFiltersMenuPanel() {
    const nav = document.getElementById("filters-nav");
    if (!nav || !isFiltersNarrowViewport()) return;
    nav.classList.remove("filters--menu-open");
    const btn = document.getElementById("filters-menu-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
    queueMicrotask(() => {
      const n = document.getElementById("filters-nav");
      if (!n || n.classList.contains("filters--menu-open")) return;
      const y = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
      if (y >= 48) document.body.classList.add("archive-ui--nav-folded");
    });
  }

  function toggleFiltersMenuPanel() {
    const nav = document.getElementById("filters-nav");
    const btn = document.getElementById("filters-menu-btn");
    if (!nav || !btn || !isFiltersNarrowViewport()) return;
    nav.classList.toggle("filters--menu-open");
    const open = nav.classList.contains("filters--menu-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      document.body.classList.remove("archive-ui--nav-folded");
    } else {
      queueMicrotask(() => {
        const n = document.getElementById("filters-nav");
        if (!n || n.classList.contains("filters--menu-open")) return;
        const y = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
        if (y >= 48) document.body.classList.add("archive-ui--nav-folded");
      });
    }
  }

  function initFilters() {
    syncSeasonTabUI();
    syncCategoryTabUI();
    validateSubcategoryFilter();
    renderCategoryDrill();
    syncFiltersMenuForViewport();
    syncFilterSummaryBar();
  }

  let archiveNavScrollFoldLastY = 0;
  let archiveNavScrollFoldTicking = false;

  /** Sticky #filters-nav: compact “folded” chrome while scrolling down on the archive page. */
  function initArchiveNavScrollFold() {
    if (!document.getElementById("grid")) return;
    const nav = document.getElementById("filters-nav");
    if (!nav) return;
    const body = document.body;

    function onScrollNavFold() {
      if (archiveNavScrollFoldTicking) return;
      archiveNavScrollFoldTicking = true;
      requestAnimationFrame(() => {
        archiveNavScrollFoldTicking = false;
        const y = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
        const dy = y - archiveNavScrollFoldLastY;
        if (nav.classList.contains("filters--menu-open")) {
          body.classList.remove("archive-ui--nav-folded");
          archiveNavScrollFoldLastY = y;
          return;
        }
        if (y < 48) {
          body.classList.remove("archive-ui--nav-folded");
        } else if (dy > 6) {
          body.classList.add("archive-ui--nav-folded");
        } else if (dy < -6) {
          body.classList.remove("archive-ui--nav-folded");
        }
        archiveNavScrollFoldLastY = y;
      });
    }

    globalThis.addEventListener("scroll", onScrollNavFold, { passive: true });
    onScrollNavFold();
  }

  function initOutfitVariantDialog() {
    const dlg = document.getElementById("outfit-variant-dialog");
    const sel = document.getElementById("outfit-variant-select");
    const cancel = document.getElementById("outfit-variant-cancel");
    const ok = document.getElementById("outfit-variant-confirm");
    cancel?.addEventListener("click", () => {
      pendingOutfitVariantItemId = null;
      dlg?.close();
    });
    ok?.addEventListener("click", () => {
      const id = pendingOutfitVariantItemId;
      const key = sel?.value?.trim();
      pendingOutfitVariantItemId = null;
      dlg?.close();
      if (id && key) pushOutfitSlot({ itemId: id, colorKey: key });
    });
    dlg?.addEventListener("click", (e) => {
      if (e.target === dlg) {
        pendingOutfitVariantItemId = null;
        dlg.close();
      }
    });
  }

  function wireEvents() {
    els.emptyReset?.addEventListener("click", () => {
      resetNarrowingFilters();
      showToast("Category, type, and search cleared.");
    });

    document.getElementById("filter-summary-clear")?.addEventListener("click", () => {
      resetNarrowingFilters();
      showToast("Filters cleared.");
    });

    const catNav = document.getElementById("category-nav");
    if (catNav) {
      catNav.addEventListener("click", (e) => {
        const seasonTab = e.target.closest(".season-strip__tab");
        if (seasonTab) {
          const v = String(seasonTab.dataset.seasonFilter ?? "").trim();
          seasonNavFilter = v === "A/W" ? "A/W" : v === "All" ? "All" : "S/S";
          persistSeasonNav();
          subcategoryFilter = "";
          syncSeasonTabUI();
          validateSubcategoryFilter();
          renderCategoryDrill();
          renderGrid();
          return;
        }
        const tab = e.target.closest(".category-nav__tab");
        if (!tab) return;
        categoryNavFilter = tab.dataset.categoryFilter ?? "";
        subcategoryFilter = "";
        syncCategoryTabUI();
        renderCategoryDrill();
        renderGrid();
      });
    }

    const drill = document.getElementById("category-drill");
    if (drill) {
      drill.addEventListener("click", (e) => {
        const choice = e.target.closest(".category-drill__choice");
        if (!choice) return;
        subcategoryFilter = choice.dataset.subcategory ?? "";
        renderCategoryDrill();
        renderGrid();
      });
    }

    if (els.grid) {
      els.grid.addEventListener("click", (e) => {
        const outfitBtn = e.target.closest("[data-outfit-add]");
        if (outfitBtn && !outfitBtn.disabled) {
          addToOutfit(outfitBtn.dataset.outfitAdd);
          return;
        }
      });
    }

    if (els.outfitStrip) {
      els.outfitStrip.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-outfit-remove-index]");
        if (!rm) return;
        const idx = parseInt(rm.dataset.outfitRemoveIndex, 10);
        if (!Number.isFinite(idx)) return;
        removeOutfitSlotAt(idx);
      });
    }

    initOutfitVariantDialog();

    if (els.outfitSave) {
      els.outfitSave.addEventListener("click", () => {
        void saveCurrentOutfit();
      });
    }

    if (els.outfitClear) {
      els.outfitClear.addEventListener("click", () => {
        if (!currentOutfitSlots.length && !els.outfitName.value.trim()) {
          showToast("Nothing to clear.");
          return;
        }
        clearOutfit();
      });
    }

    if (els.savedList) {
      els.savedList.addEventListener("click", (e) => {
        const loadBtn = e.target.closest("[data-outfit-load]");
        if (loadBtn) {
          loadSavedIntoBuilder(loadBtn.dataset.outfitLoad);
          return;
        }
        const editBtn = e.target.closest("[data-outfit-edit]");
        if (editBtn) {
          loadSavedIntoBuilder(editBtn.dataset.outfitEdit, { forEdit: true });
          return;
        }
        const delBtn = e.target.closest("[data-outfit-delete]");
        if (delBtn) {
          void deleteSavedOutfit(delBtn.dataset.outfitDelete);
        }
      });
    }

    els.search?.addEventListener("input", renderGrid);

    const filtersNav = document.getElementById("filters-nav");
    const filtersMenuBtn = document.getElementById("filters-menu-btn");
    filtersMenuBtn?.addEventListener("click", () => toggleFiltersMenuPanel());

    if (filtersNav && !filtersMenuDismissListenersInstalled) {
      filtersMenuDismissListenersInstalled = true;
      document.addEventListener(
        "pointerdown",
        (e) => {
          if (!isFiltersNarrowViewport()) return;
          if (!filtersNav.classList.contains("filters--menu-open")) return;
          const t = e.target;
          if (!(t instanceof Element)) return;
          if (filtersNav.contains(t)) return;
          collapseFiltersMenuPanel();
        },
        true
      );
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        collapseFiltersMenuPanel();
      });
      globalThis.matchMedia?.("(max-width: 720px)")?.addEventListener?.("change", () => {
        syncFiltersMenuForViewport();
      });
    }

    initArchiveNavScrollFold();
  }

  function seedItemsFromScript() {
    return typeof WARDROBE_ITEMS !== "undefined" && Array.isArray(WARDROBE_ITEMS)
      ? WARDROBE_ITEMS
      : [];
  }

  async function bootstrap() {
    const url = globalThis.__TW_SUPABASE_URL__;
    const key = globalThis.__TW_SUPABASE_ANON_KEY__;

    if (url && key) {
      try {
        const api = await import("./js/supabase-client.js");
        supabaseClient = api.createBrowserClient(String(url).trim(), String(key).trim());
        if (supabaseClient) {
          let wardrobeFromSupabase = false;
          const res = await api.fetchWardrobeItems(supabaseClient);
          if (res.ok && res.items.length) {
            wardrobeBase = res.items;
            wardrobeFromSupabase = true;
          } else {
            if (!res.ok) {
              console.warn("Supabase wardrobe_items:", res.error);
            } else {
              console.warn(
                "Supabase wardrobe_items returned 0 rows — falling back to data/wardrobe.js; run npm run db:import-seed."
              );
            }
            wardrobeBase = seedItemsFromScript();
          }

          if (wardrobeFromSupabase) {
            const outfitsRes = await api.fetchOutfits(supabaseClient);
            if (outfitsRes.ok) {
              savedOutfits = (outfitsRes.outfits || [])
                .map((o) => normalizeSavedOutfitRecord(o))
                .filter(Boolean);
              persistSavedOutfitsCache();
              useCloudOutfits = true;
            } else {
              console.warn("Supabase outfits:", outfitsRes.error);
              savedOutfits = loadSavedOutfitsFromStorage();
              useCloudOutfits = false;
            }
          } else {
            savedOutfits = loadSavedOutfitsFromStorage();
            useCloudOutfits = false;
          }
        }
      } catch (e) {
        console.warn("Supabase unavailable, using local seed + cache.", e);
        supabaseClient = null;
        useCloudOutfits = false;
        wardrobeBase = seedItemsFromScript();
        savedOutfits = loadSavedOutfitsFromStorage();
      }
    } else {
      wardrobeBase = seedItemsFromScript();
      savedOutfits = loadSavedOutfitsFromStorage();
    }

    mergeWardrobeFromSources();
    await loadArchiveImageManifest();
    if (!items.length) {
      console.warn("No wardrobe items loaded.");
    }

    const itemRoot = document.getElementById("item-detail-root");
    const hasArchiveGrid = Boolean(document.getElementById("grid"));
    const pageId = new URLSearchParams(globalThis.location.search).get("id");
    if (itemRoot && pageId && !hasArchiveGrid) {
      initItemDetailRootDelegates();
      installItemPageBackNavigation();
      runItemDetailPage(itemRoot, pageId);
      return;
    }

    consumeArchiveBrowseStateForReturn();
    initFilters();
    wireEvents();
    syncOutfitSaveButtonLabel();
    initAddItemForm();
    renderGrid();
    renderOutfitStrip();
    renderSavedOutfits();
    consumeAndRestoreArchiveListScroll();
  }

  void bootstrap();
})();
