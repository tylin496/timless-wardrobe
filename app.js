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
  const SEASON_NAV_STORAGE_KEY = "timeless-wardrobe-season-nav-v1";
  /** Same-tab return from `item.html` → restore main list scroll (short TTL avoids stale jumps). */
  const ARCHIVE_SCROLL_RESTORE_KEY = "timeless-wardrobe-archive-scroll-v1";
  const ARCHIVE_SCROLL_TTL_MS = 20 * 60 * 1000;

  /** Seed / Supabase rows only — merged with `loadCustomItems()` into `items`. */
  /** @type {object[]} */
  let wardrobeBase = [];

  /** Top-level archive category (filter + add-item). */
  const SLOT_CLOTHING = "Clothing";
  const SLOT_SHOES = "Shoes";
  const SLOT_JEWELRY = "Jewelry";
  const SLOT_WATCHES = "Watches";
  const SLOT_FRAGRANCE = "Fragrance";

  const SLOT_OPTIONS = [SLOT_CLOTHING, SLOT_SHOES, SLOT_JEWELRY, SLOT_WATCHES, SLOT_FRAGRANCE];

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
    Watches: "Watches",
    Fragrance: "Perfume",
    Jewellery: "Jewelry",
    Jewelry: "Jewelry",
    Future: "Planned pieces & rings",
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
    lines.push(`Record category: ${String(item.category ?? "").trim()}`);
    lines.push(`Season: ${String(item.season ?? "").trim()}`);
    lines.push(`Color: ${String(item.color ?? "").trim()}`);
    lines.push(`Fabric: ${String(item.fabric ?? "").trim()}`);
    lines.push(`Weight / specs: ${String(item.weight ?? "").trim()}`);
    lines.push(`Size: ${String(item.size ?? "").trim()}`);
    lines.push(`Measured dimensions: ${String(item.measuredDimensions ?? "").trim()}`);
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
    if (cat === "Fragrance") return SLOT_FRAGRANCE;
    if (cat === "Jewellery" || cat === "Jewelry") return SLOT_JEWELRY;
    if (cat === "Footwear") return SLOT_SHOES;
    if (cat === "Future") return SLOT_JEWELRY;
    return SLOT_CLOTHING;
  }

  function itemSlot(item) {
    if (!item) return SLOT_CLOTHING;
    const rawCat = String(item.category ?? "").trim();
    const season = String(item.season ?? "");

    if (rawCat === "Clothing (incl. shoes)") return SLOT_CLOTHING;

    if (LEGACY_SLOT_LABEL[rawCat]) return LEGACY_SLOT_LABEL[rawCat];
    if (rawCat === "典藏·配件" || rawCat === "Archive · Accessories") return inferAccessoryBucket(item);
    if (Object.prototype.hasOwnProperty.call(LEGACY_ENGLISH_GRANULAR_SLOT, rawCat)) {
      return LEGACY_ENGLISH_GRANULAR_SLOT[rawCat];
    }
    if (SLOT_OPTIONS.includes(rawCat)) return rawCat;

    if (rawCat === "Footwear") return SLOT_SHOES;
    if (rawCat === "Watches") return SLOT_WATCHES;
    if (rawCat === "Fragrance") return SLOT_FRAGRANCE;
    if (rawCat === "Jewellery" || rawCat === "Jewelry") return SLOT_JEWELRY;
    if (rawCat === "Future") return SLOT_JEWELRY;

    if (season === "S/S" || season === "A/W") return SLOT_CLOTHING;
    return SLOT_CLOTHING;
  }

  /** Outfit builder: clothing, shoes, and watches — jewelry & fragrance are archive-only. */
  function itemEligibleForOutfit(item) {
    if (!item) return false;
    const s = itemSlot(item);
    return s === SLOT_CLOTHING || s === SLOT_SHOES || s === SLOT_WATCHES;
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
      return arr.filter(
        (x) =>
          x &&
          typeof x.id === "string" &&
          typeof x.brand === "string" &&
          typeof x.name === "string" &&
          typeof x.image === "string"
      );
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
      if (v === "A/W" || v === "S/S") return v;
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

  function mergeWardrobeFromSources() {
    const ov = loadArchiveOverrides();
    const mergedBase = wardrobeBase.map((row, idx) => {
      if (!row || row.id == null) return row;
      const id = String(row.id);
      const patch = ov[id];
      const base = patch && typeof patch === "object" ? { ...row, ...patch, id } : { ...row };
      return { ...base, __archiveOrdinal: idx };
    });
    items = [...loadCustomItems(), ...mergedBase];
    rebuildItemIndex();
    coverResolutionCache.clear();
    rebuildArchiveImagePathList();
  }

  /** @type {{ itemId: string, colorKey?: string }[]} */
  let currentOutfitSlots = [];

  /** @type {{ id: string, name: string, slots: { itemId: string, colorKey?: string }[], createdAt: string }[]} */
  let savedOutfits = [];

  let toastTimer = null;

  /** @type {boolean} */
  let useCloudOutfits = false;

  /** Active category tab value (matches `itemSlot()`; empty string = all). */
  let categoryNavFilter = "";

  /** Top strip: always "S/S" or "A/W" — narrows archive before category tabs (persisted in localStorage). */
  let seasonNavFilter = loadPersistedSeasonNav();

  /** Within main category: filter by seed `category` (e.g. Jackets); empty = all types. */
  let subcategoryFilter = "";

  /**
   * After "Show filters", keep full chrome (tabs + drill) visible until the mobile sheet is dismissed
   * or another filter interaction clears this flag.
   */
  let keepFiltersChromeVisible = false;

  /** Item id currently shown in the detail dialog (for edit / duplicate actions). */
  let detailItemId = null;

  const els = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty-state"),
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

  function itemDetailMountRoot() {
    return document.getElementById("item-detail-root");
  }

  let itemDetailDelegatesInstalled = false;

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
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

  /** S/S vs A/W: exact match, `All-season`, or blank season (visible in both tabs). */
  function itemPassesSeasonNav(item, nav) {
    const s = String(item.season ?? "").trim();
    if (nav === "S/S") return s === "S/S" || s === "All-season" || s === "";
    if (nav === "A/W") return s === "A/W" || s === "All-season" || s === "";
    return true;
  }

  function poolItemsForDrillSubcategories() {
    let pool = items;
    pool = pool.filter((i) => itemPassesSeasonNav(i, seasonNavFilter));
    if (categoryNavFilter) pool = pool.filter((i) => itemSlot(i) === categoryNavFilter);
    return pool;
  }

  function validateSubcategoryFilter() {
    if (!subcategoryFilter) return;
    const cats = new Set(
      poolItemsForDrillSubcategories()
        .map((i) => String(i.category ?? "").trim())
        .filter(Boolean)
    );
    if (!cats.has(subcategoryFilter)) subcategoryFilter = "";
  }

  function renderCategoryDrill() {
    const drill = document.getElementById("category-drill");
    const titleEl = document.getElementById("category-drill-title");
    const grid = document.getElementById("category-drill-grid");
    if (!drill || !titleEl || !grid) return;

    validateSubcategoryFilter();

    if (!categoryNavFilter) {
      drill.hidden = true;
      drill.setAttribute("aria-hidden", "true");
      grid.innerHTML = "";
      return;
    }

    drill.hidden = false;
    drill.removeAttribute("aria-hidden");
    titleEl.textContent = categoryDisplayLabel(categoryNavFilter);

    const pool = poolItemsForDrillSubcategories();
    const rawCats = uniqueSorted(pool.map((i) => String(i.category ?? "").trim()).filter(Boolean));

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
    for (const raw of rawCats) {
      appendChoice(raw, friendlyRecordCategory(raw), false);
    }
  }

  function applyFilters(list) {
    const f = getFilters();
    return list.filter((item) => {
      if (!itemPassesSeasonNav(item, f.seasonNav)) return false;
      if (f.category && itemSlot(item) !== f.category) return false;
      if (f.subcategory && String(item.category ?? "").trim() !== f.subcategory) return false;
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
    if (!primary) return [];
    const out = [];
    const seen = new Set();
    function add(u) {
      const x = String(u ?? "").trim();
      if (!x || seen.has(x)) return;
      seen.add(x);
      out.push(x);
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
      img.remove();
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
        img.remove();
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
      showToast("Only clothing, shoes, and watches go into outfits — jewelry and fragrance stay in the archive.");
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
    onOutfitChange();
    showToast("Outfit cleared.");
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

  function loadSavedIntoBuilder(id) {
    const found = savedOutfits.find((o) => o.id === id);
    if (!found) return;
    const rawSlots = outfitSlotsFromRecord(found);
    const valid = rawSlots.filter((slot) => {
      const it = itemById.get(slot.itemId);
      return it && itemEligibleForOutfit(it);
    });
    const before = rawSlots.length;
    currentOutfitSlots = valid;
    onOutfitChange();
    const skipped = before - valid.length;
    if (skipped > 0) {
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
   * Resize an uploaded image and return a data URL.
   *
   * PNG / WebP / GIF inputs are re-encoded as **PNG** so any alpha channel (e.g. background
   * removal) is preserved. JPEG / other inputs default to JPEG to keep storage small. Pass
   * `forcePng: true` to force PNG output regardless of source.
   *
   * @param {File} file
   * @param {{ maxWidth?: number, quality?: number, forcePng?: boolean }} [opts]
   * @returns {Promise<string>}
   */
  function fileToResizedDataUrl(file, opts) {
    const maxWidth =
      typeof opts === "number" ? opts : opts && typeof opts.maxWidth === "number" ? opts.maxWidth : 1200;
    const quality = opts && typeof opts.quality === "number" ? opts.quality : 0.82;
    const forcePng = Boolean(opts && opts.forcePng);
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
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
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

  function deleteCustomItem(id) {
    if (!id || !String(id).startsWith("custom-")) return;
    currentOutfitSlots = currentOutfitSlots.filter((s) => s.itemId !== id);
    const next = loadCustomItems().filter((x) => x.id !== id);
    saveCustomItems(next);
    mergeWardrobeFromSources();
    initFilters();
    onOutfitChange();
    showToast("Custom piece removed.");
    if (!document.getElementById("grid") && detailItemId === id) {
      globalThis.location.href = "index.html";
    }
  }

  async function handleAddItemSubmit(ev) {
    ev.preventDefault();
    const form = /** @type {HTMLFormElement} */ (ev.target);
    const brand = document.getElementById("add-item-brand")?.value?.trim() || "";
    const name = document.getElementById("add-item-name")?.value?.trim() || "";
    const category = document.getElementById("add-item-category")?.value || "";
    const season = document.getElementById("add-item-season")?.value?.trim() || "";
    const color = document.getElementById("add-item-color")?.value?.trim() || "";
    const fabric = document.getElementById("add-item-fabric")?.value?.trim() || "";
    const weight = document.getElementById("add-item-weight")?.value?.trim() || "";
    const size = document.getElementById("add-item-size")?.value?.trim() || "";
    const measuredDimensions =
      document.getElementById("add-item-measured-dimensions")?.value?.trim() || "";
    const notes = document.getElementById("add-item-notes")?.value?.trim() || "";
    const fileInput = document.getElementById("add-item-image");
    const file = fileInput?.files?.[0];
    if (!brand || !name || !category || !file) {
      showAddItemFormMsg("Fill required fields and choose a cover image.", true);
      return;
    }
    showAddItemFormMsg("Processing images…", false);
    let dataUrl;
    try {
      dataUrl = await fileToResizedDataUrl(file);
    } catch (err) {
      console.warn(err);
      showAddItemFormMsg("Could not process this image. Try JPEG or PNG.", true);
      return;
    }

    const galleryInput = document.getElementById("add-item-gallery");
    const galleryFiles = galleryInput?.files ? Array.from(galleryInput.files) : [];
    const MAX_GALLERY = 12;
    /** @type {string[]} */
    const galleryUrls = [];
    for (const gf of galleryFiles.slice(0, MAX_GALLERY)) {
      try {
        galleryUrls.push(await fileToResizedDataUrl(gf));
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
      if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
        showAddItemFormMsg("Storage full: images are still too large. Try smaller files or crop first.", true);
      } else {
        showAddItemFormMsg("Save failed. Try again.", true);
      }
      return;
    }

    mergeWardrobeFromSources();
    initFilters();
    renderGrid();
    form.reset();
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
    const imgInput = document.getElementById("add-item-image");
    const preview = document.getElementById("add-item-preview");
    if (!form || !cat) return;
    cat.innerHTML = "";
    for (const c of SLOT_OPTIONS) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = categoryDisplayLabel(c);
      cat.appendChild(o);
    }

    imgInput?.addEventListener("change", () => {
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
      });
    });

    const addDlg = document.getElementById("add-item-dialog");
    const openAdd = document.getElementById("add-item-open");
    const closeAdd = document.getElementById("add-item-close");
    openAdd?.addEventListener("click", () => {
      if (!addDlg) return;
      try {
        addDlg.showModal();
      } catch {
        /* already open */
      }
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

    const article = document.createElement("article");
    const outfitHighlight = inOutfit && itemEligibleForOutfit(item);
    article.className = "card" + (outfitHighlight ? " card--in-outfit" : "");
    article.setAttribute("role", "listitem");
    article.dataset.itemId = String(item.id);

    if (item.season) {
      const intro = document.createElement("div");
      intro.className = "card__intro";
      const seasonP = document.createElement("p");
      seasonP.className = "card__season";
      seasonP.textContent = item.season;
      intro.appendChild(seasonP);
      article.appendChild(intro);
    }

    const media = document.createElement("div");
    media.className = "card__media";

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
    mountHeroGalleryStrip(media, img, item);

    const body = document.createElement("div");
    body.className = "card__body";

    const catP = document.createElement("p");
    catP.className = "card__category";
    catP.textContent = categoryDisplayLabel(itemSlot(item));
    const rawCat = String(item.category ?? "").trim();
    if (rawCat && !SLOT_OPTIONS.includes(rawCat)) {
      catP.title = `Record field: ${rawCat}`;
    }

    const brand = document.createElement("p");
    brand.className = "card__brand";
    brand.textContent = item.brand;

    const title = document.createElement("h2");
    title.className = "card__title";
    title.textContent = displayNameWithoutLeadingColor(item);

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

    body.appendChild(catP);
    body.appendChild(brand);
    body.appendChild(title);
    if (specs.children.length) body.appendChild(specs);

    if (item.notes) {
      const notes = document.createElement("p");
      notes.className = "card__notes";
      notes.textContent = item.notes;
      body.appendChild(notes);
    }

    const actions = document.createElement("div");
    actions.className = "card__actions";
    if (itemEligibleForOutfit(item)) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn--small";
      if (variants?.length) {
        addBtn.textContent = inOutfit ? "Add another colour…" : "Add to outfit…";
        addBtn.disabled = everyVariantTaken;
        addBtn.title = everyVariantTaken ? "All colours are already in this outfit." : "Choose colour for this outfit.";
      } else {
        addBtn.textContent = inOutfit ? "In outfit" : "Add to outfit";
        addBtn.disabled = singleTaken;
      }
      addBtn.dataset.outfitAdd = item.id;
      actions.appendChild(addBtn);
    } else {
      const note = document.createElement("p");
      note.className = "card__outfit-note";
      note.textContent = "Archive — not for outfits";
      actions.appendChild(note);
    }
    if (typeof item.id === "string" && item.id.startsWith("custom-")) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.textContent = "Delete";
      delBtn.dataset.customDelete = item.id;
      actions.appendChild(delBtn);
    }
    body.appendChild(actions);

    article.appendChild(media);
    article.appendChild(body);
    return article;
  }

  function isCustomWardrobeItem(item) {
    return item && typeof item.id === "string" && item.id.startsWith("custom-");
  }

  /**
   * Stable list order: custom pieces first (by brand / name / id), then archive rows in seed / `wardrobeBase` order.
   */
  function compareArchiveGridItems(a, b) {
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
    if (els.count) {
      els.count.textContent = `${n} piece${n === 1 ? "" : "s"}`;
    }
    els.empty.hidden = n > 0;
    els.grid.hidden = n === 0;
  }

  let dragFromIndex = null;

  function renderOutfitStrip() {
    if (!els.outfitStrip) return;
    els.outfitStrip.innerHTML = "";
    const empty = currentOutfitSlots.length === 0;
    els.outfitEmpty.hidden = !empty;
    if (empty) return;

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
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.textContent = "Delete";
      delBtn.dataset.outfitDelete = outfit.id;
      act.appendChild(loadBtn);
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

  function duplicateArchiveItemToCustom(sourceId) {
    const src = itemById.get(sourceId);
    if (!src || (typeof sourceId === "string" && sourceId.startsWith("custom-"))) return;
    const image = String(src.image ?? "").trim();
    if (!image) {
      showToast("This archive row has no image to copy.");
      return;
    }
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `custom-${crypto.randomUUID()}`
        : `custom-${Date.now()}`;
    const gallery = itemGalleryList(src);
    const copy = {
      id,
      brand: String(src.brand ?? "").trim(),
      name: String(src.name ?? "").trim(),
      section: "",
      category: String(src.category ?? "").trim() || itemSlot(src),
      season: String(src.season ?? "").trim(),
      color: String(src.color ?? "").trim(),
      fabric: String(src.fabric ?? "").trim(),
      weight: String(src.weight ?? "").trim(),
      size: String(src.size ?? "").trim(),
      measuredDimensions: String(src.measuredDimensions ?? "").trim(),
      image,
      gallery: gallery.length ? gallery : undefined,
      notes: String(src.notes ?? "").trim(),
      pillar: "",
      ...(Array.isArray(src.colorVariants) && src.colorVariants.length
        ? { colorVariants: JSON.parse(JSON.stringify(src.colorVariants)) }
        : {}),
    };
    const list = loadCustomItems();
    list.unshift(copy);
    try {
      saveCustomItems(list);
    } catch (e) {
      showToast("Could not save the copy (storage may be full).");
      return;
    }
    mergeWardrobeFromSources();
    if (document.getElementById("grid")) {
      initFilters();
      onOutfitChange();
      renderGrid();
    }
    const u = new URL("item.html", globalThis.location.href);
    u.searchParams.set("id", copy.id);
    u.searchParams.set("edit", "1");
    showToast("Copy added to your wardrobe — opening editor…");
    persistArchiveListScrollForReturn();
    globalThis.location.assign(u.toString());
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
    const category = form.querySelector("#item-edit-category")?.value || "";
    const season = form.querySelector("#item-edit-season")?.value?.trim() || "";
    const color = form.querySelector("#item-edit-color")?.value?.trim() || "";
    const fabric = form.querySelector("#item-edit-fabric")?.value?.trim() || "";
    const weight = form.querySelector("#item-edit-weight")?.value?.trim() || "";
    const size = form.querySelector("#item-edit-size")?.value?.trim() || "";
    const measuredDimensions = form.querySelector("#item-edit-measured-dimensions")?.value?.trim() || "";
    const notes = form.querySelector("#item-edit-notes")?.value?.trim() || "";

    if (!brand || !name || !category) {
      setMsg("Brand, name, and category are required.", true);
      return;
    }

    let image = String(prev.image ?? "").trim();
    const coverFile = form.querySelector("#item-edit-cover")?.files?.[0];
    if (coverFile) {
      setMsg("Processing images…", false);
      try {
        image = await fileToResizedDataUrl(coverFile);
      } catch (err) {
        console.warn(err);
        setMsg("Could not process the new cover image.", true);
        return;
      }
    }

    let gallery = [...itemGalleryList(prev)];
    const gFiles = form.querySelector("#item-edit-gallery")?.files
      ? Array.from(form.querySelector("#item-edit-gallery").files)
      : [];
    for (const gf of gFiles.slice(0, 12)) {
      try {
        gallery.push(await fileToResizedDataUrl(gf));
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
      notes,
      image,
      pillar: "",
    };
    if (gallery.length) updated.gallery = gallery;
    else delete updated.gallery;

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
        if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
          setMsg("Storage full: try smaller images or fewer photos.", true);
        } else {
          setMsg("Save failed. Try again.", true);
        }
        return;
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
        notes,
        image,
        pillar: "",
      };
      if (gallery.length) patch.gallery = gallery;
      else patch.gallery = [];
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
    mountHeroGalleryStrip(media, img, item);
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
      catSel.id = "item-edit-category";
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
      addField("Category", catSel);

      const seaSel = document.createElement("select");
      seaSel.id = "item-edit-season";
      const seasons = ["", "A/W", "S/S", "All-season"];
      const curSe = String(item.season ?? "").trim();
      for (const s of seasons) {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s || "—";
        if (s === curSe) o.selected = true;
        seaSel.appendChild(o);
      }
      addField("Season (optional)", seaSel);

      const colorIn = document.createElement("input");
      colorIn.type = "text";
      colorIn.id = "item-edit-color";
      colorIn.maxLength = 80;
      colorIn.value = String(item.color ?? "");
      addField("Color (optional)", colorIn);

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

      const coverLab = document.createElement("label");
      coverLab.className = "field field--file field--span2";
      const coverSpan = document.createElement("span");
      coverSpan.className = "field__label";
      coverSpan.textContent = "New cover image (optional)";
      const coverIn = document.createElement("input");
      coverIn.type = "file";
      coverIn.id = "item-edit-cover";
      coverIn.accept = "image/*";
      coverLab.appendChild(coverSpan);
      coverLab.appendChild(coverIn);
      grid.appendChild(coverLab);

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

      const act = document.createElement("div");
      act.className = "item-detail__form-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "submit";
      saveBtn.className = "btn btn--small";
      saveBtn.textContent = "Save changes";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn--small btn--ghost";
      cancelBtn.id = "item-detail-cancel-edit";
      cancelBtn.textContent = "Cancel";
      act.appendChild(saveBtn);
      act.appendChild(cancelBtn);
      form.appendChild(act);

      const h2 = document.createElement("h2");
      h2.id = "item-detail-heading";
      h2.className = "item-detail__title";
      h2.textContent = "Edit piece";
      wrap.appendChild(h2);
      wrap.appendChild(form);
      root.appendChild(wrap);
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
    const rawCat = String(item.category ?? "").trim();
    if (rawCat && rawCat !== slotLabel) addRow("Record type", rawCat);
    addRow("Season", item.season || "");
    addRow("Size", item.size);
    addRow("Measured dimensions", item.measuredDimensions);
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
    if (!isCustom) {
      const du = document.createElement("button");
      du.type = "button";
      du.className = "btn btn--small";
      du.id = "item-detail-duplicate";
      du.textContent = "Duplicate to my wardrobe";
      actions.appendChild(du);
    }
    root.appendChild(actions);
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
    globalThis.location.assign(url);
  }

  function initItemDetailRootDelegates() {
    const root = itemDetailMountRoot();
    if (!root || itemDetailDelegatesInstalled) return;
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
      if (t?.closest("#item-detail-duplicate")) {
        duplicateArchiveItemToCustom(detailItemId);
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

  function runItemDetailPage(root, pageId) {
    const item = itemById.get(pageId);
    const params = new URLSearchParams(globalThis.location.search);
    const wantEdit = params.get("edit") === "1";

    if (!item) {
      root.innerHTML =
        '<p class="item-page-not-found">This piece is not in the archive.</p><p><a class="btn btn--ghost" href="index.html">← Back to archive</a></p>';
      document.title = "Piece not found · Timeless Wardrobe";
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
    syncFiltersChromeVisibility();
  }

  function syncFiltersChromeVisibility() {
    const nav = document.getElementById("filters-nav");
    const showBtn = document.getElementById("filters-show-chrome");
    if (!nav || !showBtn) return;
    const hideChrome = Boolean(categoryNavFilter) && !keepFiltersChromeVisible;
    nav.classList.toggle("filters--chrome-hidden", hideChrome);
    showBtn.hidden = !hideChrome;
  }

  function collapseFiltersMenuPanel() {
    const nav = document.getElementById("filters-nav");
    if (!nav || !isFiltersNarrowViewport()) return;
    nav.classList.remove("filters--menu-open");
    const btn = document.getElementById("filters-menu-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function toggleFiltersMenuPanel() {
    const nav = document.getElementById("filters-nav");
    const btn = document.getElementById("filters-menu-btn");
    if (!nav || !btn || !isFiltersNarrowViewport()) return;
    nav.classList.toggle("filters--menu-open");
    const open = nav.classList.contains("filters--menu-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open && categoryNavFilter) {
      keepFiltersChromeVisible = false;
      syncFiltersChromeVisibility();
    }
  }

  function initFilters() {
    syncSeasonTabUI();
    syncCategoryTabUI();
    validateSubcategoryFilter();
    renderCategoryDrill();
    syncFiltersMenuForViewport();
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
    const catNav = document.getElementById("category-nav");
    if (catNav) {
      catNav.addEventListener("click", (e) => {
        const seasonTab = e.target.closest(".season-strip__tab");
        if (seasonTab) {
          seasonNavFilter = seasonTab.dataset.seasonFilter === "A/W" ? "A/W" : "S/S";
          persistSeasonNav();
          subcategoryFilter = "";
          syncSeasonTabUI();
          validateSubcategoryFilter();
          renderCategoryDrill();
          renderGrid();
          syncFiltersChromeVisibility();
          return;
        }
        const tab = e.target.closest(".category-nav__tab");
        if (!tab) return;
        keepFiltersChromeVisible = false;
        categoryNavFilter = tab.dataset.categoryFilter ?? "";
        subcategoryFilter = "";
        syncCategoryTabUI();
        renderCategoryDrill();
        renderGrid();
        syncFiltersChromeVisibility();
      });
    }

    const drill = document.getElementById("category-drill");
    if (drill) {
      drill.addEventListener("click", (e) => {
        if (e.target.closest("#category-drill-back")) {
          keepFiltersChromeVisible = false;
          categoryNavFilter = "";
          subcategoryFilter = "";
          syncCategoryTabUI();
          renderCategoryDrill();
          renderGrid();
          syncFiltersChromeVisibility();
          return;
        }
        const choice = e.target.closest(".category-drill__choice");
        if (!choice) return;
        keepFiltersChromeVisible = false;
        subcategoryFilter = choice.dataset.subcategory ?? "";
        renderCategoryDrill();
        renderGrid();
        collapseFiltersMenuPanel();
        syncFiltersChromeVisibility();
      });
    }

    if (els.grid) {
      els.grid.addEventListener("click", (e) => {
        const del = e.target.closest("[data-custom-delete]");
        if (del) {
          const cid = del.dataset.customDelete;
          if (
            cid &&
            confirm(
              "Delete this custom piece? Its fields and images are removed from this browser and cannot be restored."
            )
          ) {
            deleteCustomItem(cid);
          }
          return;
        }
        const outfitBtn = e.target.closest("[data-outfit-add]");
        if (outfitBtn && !outfitBtn.disabled) {
          addToOutfit(outfitBtn.dataset.outfitAdd);
          return;
        }
        if (e.target.closest(".card__actions")) return;
        if (e.target.closest(".card__gallery-thumb")) return;
        const card = e.target.closest(".card[data-item-id]");
        if (card) {
          openItemDetail(card.dataset.itemId, e);
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

    document.getElementById("filters-show-chrome")?.addEventListener("click", () => {
      keepFiltersChromeVisible = true;
      const nav = document.getElementById("filters-nav");
      const showBtn = document.getElementById("filters-show-chrome");
      if (nav) nav.classList.remove("filters--chrome-hidden");
      if (showBtn) showBtn.hidden = true;
      if (isFiltersNarrowViewport() && nav) {
        nav.classList.add("filters--menu-open");
        if (filtersMenuBtn) filtersMenuBtn.setAttribute("aria-expanded", "true");
      }
      syncFiltersMenuForViewport();
    });

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
          if (categoryNavFilter) {
            keepFiltersChromeVisible = false;
            syncFiltersChromeVisibility();
          }
        },
        true
      );
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        collapseFiltersMenuPanel();
        if (categoryNavFilter) {
          keepFiltersChromeVisible = false;
          syncFiltersChromeVisibility();
        }
      });
      globalThis.matchMedia?.("(max-width: 720px)")?.addEventListener?.("change", () => {
        syncFiltersMenuForViewport();
      });
    }
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
      runItemDetailPage(itemRoot, pageId);
      return;
    }

    initFilters();
    wireEvents();
    initAddItemForm();
    renderGrid();
    renderOutfitStrip();
    renderSavedOutfits();
    consumeAndRestoreArchiveListScroll();
  }

  void bootstrap();
})();
