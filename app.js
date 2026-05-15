(function () {
  const STORAGE_KEY = "timeless-wardrobe-outfits-v1";
  const MAX_OUTFIT_ITEMS = 16;
  const OUTFIT_STORAGE_VERSION = 2;

  /** Split archive rows merged into one id — remap saved outfit lines. */
  const LEGACY_OUTFIT_ITEM_TO_SLOT = new Map([
    ["uniqlo-ocbd-shirt-blue", { itemId: "uniqlo-ocbd-shirt", colourKey: "blue" }],
    ["uniqlo-ocbd-shirt-white", { itemId: "uniqlo-ocbd-shirt", colourKey: "white" }],
    ["uniqlo-ocbd-shirt-pink-stripe", { itemId: "uniqlo-ocbd-shirt", colourKey: "pink-stripe" }],
    ["uniqlo-ocbd-shirt-blue-striped", { itemId: "uniqlo-ocbd-shirt", colourKey: "blue-striped" }],
    ["uniqlo-tuck-trousers-grey", { itemId: "uniqlo-tuck-trousers", colourKey: "grey" }],
    ["uniqlo-tuck-trousers-beige", { itemId: "uniqlo-tuck-trousers", colourKey: "beige" }],
  ]);

  function itemColourCode(item) {
    if (!item || typeof item !== "object") return "";
    return String(item.colourCode ?? item.colorCode ?? item.colour_code ?? item.color_code ?? "").trim();
  }

  /** Broad colour families — archive colour chips + optional per-item / per-variant override. */
  const BASIC_COLOUR_FAMILY_KEYS = ["blue", "brown", "red", "white", "black", "beige", "gold", "silver", "green", "grey"];

  function normalizeStoredBasicColourKey(raw) {
    const v = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (v === "platinum") return "silver";
    return BASIC_COLOUR_FAMILY_KEYS.includes(v) ? v : "";
  }

  /** Uploaded swatch (`previewImage` / `swatchImage`). When set and displayable, grid swatches show it before hex fill, colour-code text, or variant cover. */
  function variantSwatchImageUrl(v) {
    if (!v || typeof v !== "object") return "";
    return String(v.previewImage ?? v.swatchImage ?? "").trim();
  }

  /**
   * Optional `colourVariants` on a wardrobe row (legacy JSON may use `colorVariants`).
   * @returns {{ key: string, label: string, colour: string, colourCode: string, image: string, previewImage: string, gallery: string[], notes: string, basicColour?: string }[] | null}
   */
  function getItemColourVariants(item) {
    let raw = null;
    if (Array.isArray(item?.colourVariants) && item.colourVariants.length) raw = item.colourVariants;
    else if (Array.isArray(item?.colorVariants) && item.colorVariants.length) raw = item.colorVariants;
    else if (
      item?.metadata &&
      typeof item.metadata === "object" &&
      Array.isArray(item.metadata.colourVariants) &&
      item.metadata.colourVariants.length
    )
      raw = item.metadata.colourVariants;
    else if (
      item?.metadata &&
      typeof item.metadata === "object" &&
      Array.isArray(item.metadata.colorVariants) &&
      item.metadata.colorVariants.length
    )
      raw = item.metadata.colorVariants;
    if (!raw) return null;
    const out = [];
    for (const v of raw) {
      if (!v || typeof v !== "object") continue;
      const key = String(v.key ?? "").trim();
      const image = String(v.image ?? "").trim();
      if (!key || !image) continue;
      const bc = normalizeStoredBasicColourKey(v.basicColour ?? v.colourFamily);
      /** @type {{ key: string, label: string, colour: string, colourCode: string, image: string, previewImage: string, gallery: string[], notes: string, basicColour?: string }} */
      const row = {
        key,
        label: String(v.label ?? v.colour ?? v.color ?? key).trim() || key,
        colour: String(v.colour ?? v.color ?? "").trim(),
        colourCode: String(v.colourCode ?? v.colorCode ?? v.colour_code ?? v.color_code ?? "").trim(),
        image,
        previewImage: String(v.previewImage ?? v.swatchImage ?? "").trim(),
        gallery: Array.isArray(v.gallery) ? v.gallery.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
        notes: v.notes != null ? String(v.notes) : "",
      };
      if (bc) row.basicColour = bc;
      out.push(row);
    }
    return out.length ? out : null;
  }

  /** First `#rgb` / `#rrggbb` in colour code, colour name, or label for grid swatches. */
  function extractSwatchHexFromVariant(v) {
    const pools = [
      String(v?.colourCode ?? v?.colorCode ?? v?.colour_code ?? v?.color_code ?? "").trim(),
      String(v?.colour ?? v?.color ?? "").trim(),
      String(v?.label ?? "").trim(),
    ];
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

  /** Relative luminance 0–1 for `#rrggbb` (sRGB). */
  function hexFillLuminance(hex) {
    const s = String(hex ?? "").trim();
    const m = /^#([0-9a-f]{6})$/i.exec(s);
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** One line of human-readable colour info (label, text colour, hex) for captions under swatches. */
  function variantCaptionText(v) {
    if (!v || typeof v !== "object") return "";
    const label = String(v.label ?? "").trim();
    const col = String(v.colour ?? v.color ?? "").trim();
    const hex = extractSwatchHexFromVariant(v);
    const parts = [];
    if (label) parts.push(label);
    if (col && col.toLowerCase() !== label.toLowerCase()) parts.push(col);
    if (hex) {
      const hexShort = hex.toLowerCase();
      const already = parts.some((p) => p.toLowerCase().includes(hexShort));
      if (!already) parts.push(hex);
    }
    return parts.join(" · ") || String(v.key ?? "").trim() || "Colour";
  }

  /**
   * Colour dots for `colourVariants`. When `heroImg` + `heroHost` are set, tap switches the main photo to that variant’s cover (`image`).
   * On the archive grid, use the card’s “+” to add to an outfit. When `addToOutfitOnPick` is true (e.g. item detail page), tap also adds that colour to the outfit if eligible.
   * If only `outfitPick` is set (no hero), tap adds the colour to the outfit.
   * @param {HTMLElement} mountEl
   * @param {object} item
   * @param {{ outfitPick?: boolean, heroImg?: HTMLImageElement | null, heroHost?: HTMLElement | null, addToOutfitOnPick?: boolean, showHeroGallery?: boolean, gridCaption?: "compact", gridMediaOverlay?: boolean, heroInitialColourKey?: string }} [opts]
   * `heroInitialColourKey` — when set (e.g. archive colour filter), marks that variant active and matches hero if it already shows that cover.
   * `gridCaption: "compact"` — archive grid only: short caption for multi-colour rows (swatches carry the rest).
   * `gridMediaOverlay` — archive grid: stack swatches on the hero image (bottom-right), no crop change.
   */
  function mountVariantSwatchStrip(mountEl, item, opts = {}) {
    const variants = getItemColourVariants(item);
    if (!variants?.length) return;
    const heroImg = opts.heroImg ?? null;
    const heroHost = opts.heroHost ?? null;
    const addToOutfitOnPick = Boolean(opts.addToOutfitOnPick);
    const showHeroGallery = opts.showHeroGallery !== false;
    const outfitPick = Boolean(opts.outfitPick) && itemEligibleForOutfit(item);
    const gridCaption = opts.gridCaption;
    const gridMediaOverlay = Boolean(opts.gridMediaOverlay);
    const heroInitialColourKey = String(opts.heroInitialColourKey ?? "").trim();
    const interactive = Boolean(heroImg) || outfitPick;

    const block = document.createElement("div");
    block.className =
      "card__swatch-block" + (gridMediaOverlay ? " card__swatch-block--media-overlay" : "");
    const sw = document.createElement("div");
    sw.className = "card__swatches";
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "Available colours");

    function applyVariantHero(colourKey) {
      if (!heroImg || !heroHost) return;
      const projected = itemProjectionForOutfitSlot(item, { itemId: String(item.id), colourKey: String(colourKey) });
      heroHost.querySelector(".card__gallery-strip")?.remove();
      wireCoverImageWithFallbacks(heroImg, projected, {
        host: heroHost,
        onResolved(url) {
          const ti = heroHost.querySelector(".card__gallery-strip .card__gallery-thumb.is-active img");
          if (ti) ti.src = url;
        },
      });
      if (showHeroGallery && itemGalleryList(projected).length) {
        mountHeroGalleryStrip(heroHost, heroImg, projected);
      }
      heroImg.alt = imageAltForItem(projected);
      sw.querySelectorAll(".card__swatch").forEach((node) => {
        const nk = /** @type {HTMLElement} */ (node).dataset.variantKey;
        node.classList.toggle("is-active", nk === String(colourKey));
      });
    }

    variants.forEach((v, idx) => {
      const lbl = String(v.label ?? v.colour ?? v.color ?? "").trim() || `Colour ${idx + 1}`;
      const colourText = String(v.colour ?? v.color ?? "").trim();
      const hex = extractSwatchHexFromVariant(v);
      const el = interactive ? document.createElement("button") : document.createElement("span");
      if (interactive) {
        /** @type {HTMLButtonElement} */ (el).type = "button";
      }
      el.dataset.variantKey = String(v.key);
      el.className = "card__swatch" + (interactive ? " card__swatch--pick" : "");
      const tip = [lbl, colourText].filter(Boolean).join(" · ");
      if (heroImg) {
        if (addToOutfitOnPick && outfitPick) {
          el.title = tip + " — Show this colour’s cover and add it to the outfit";
          el.setAttribute("aria-label", `Show cover and add ${lbl} to outfit`);
        } else {
          el.title =
            tip +
            (outfitPick ? " — Show this colour’s cover (use + on the photo to add to outfit)" : " — Show this colour’s cover");
          el.setAttribute("aria-label", `Show cover for ${lbl}`);
        }
      } else {
        el.title = tip + (outfitPick ? " — Add this colour to outfit" : "");
        el.setAttribute("aria-label", outfitPick ? `Add ${lbl} to outfit` : lbl);
      }
      const vu = String(variantSwatchImageUrl(v) ?? "").trim();
      const showPreview = vu && isDisplayableCloudImageUrl(vu);

      if (showPreview) {
        const si = document.createElement("img");
        si.src = withWardrobeImageCacheBust(vu, item);
        si.alt = "";
        si.setAttribute("aria-hidden", "true");
        el.appendChild(si);
      } else if (hex) {
        el.style.backgroundColor = hex;
        if (hexFillLuminance(hex) < 0.28) {
          el.style.boxShadow =
            "inset 0 0 0 1px rgba(255, 255, 255, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.22)";
        } else {
          el.style.boxShadow = "inset 0 0 0 1px rgba(0, 0, 0, 0.2)";
        }
      } else {
        const fallback = String(v.image ?? "").trim();
        if (fallback && isDisplayableCloudImageUrl(fallback)) {
          const si = document.createElement("img");
          si.src = withWardrobeImageCacheBust(fallback, item);
          si.alt = "";
          si.setAttribute("aria-hidden", "true");
          el.appendChild(si);
        }
      }
      if (interactive) {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (heroImg) applyVariantHero(v.key);
          if (outfitPick && (addToOutfitOnPick || !heroImg)) {
            pushOutfitSlot({ itemId: String(item.id), colourKey: String(v.key) });
          }
        });
      }
      sw.appendChild(el);
    });

    if (heroImg && heroHost) {
      let initialKey = "";
      if (heroInitialColourKey && variants.some((vv) => String(vv.key) === heroInitialColourKey)) {
        initialKey = heroInitialColourKey;
      }
      if (!initialKey) {
        const mainImg = String(item.image ?? "").trim();
        initialKey =
          String(variants.find((vv) => String(vv.image ?? "").trim() === mainImg)?.key ?? variants[0]?.key ?? "");
      }
      if (initialKey) {
        sw.querySelectorAll(".card__swatch").forEach((node) => {
          if (/** @type {HTMLElement} */ (node).dataset.variantKey === String(initialKey)) {
            node.classList.add("is-active");
          }
        });
      }
    }

    block.appendChild(sw);
    if (!gridMediaOverlay) {
      const cap = document.createElement("p");
      cap.className = "card__swatch-caption";
      if (gridCaption === "compact" && variants.length > 1) {
        cap.textContent = `${variants.length} colours`;
        cap.classList.add("card__swatch-caption--compact");
      } else {
        cap.textContent = variants.map(variantCaptionText).join(" · ");
      }
      block.appendChild(cap);
    }
    mountEl.appendChild(block);
  }

  /** Shallow row shaped for cover / gallery resolution for one outfit slot. */
  function itemProjectionForOutfitSlot(item, slot) {
    const vars = getItemColourVariants(item);
    if (!vars || !slot?.colourKey) return item;
    const v = vars.find((x) => x.key === slot.colourKey);
    if (!v) return item;
    const baseId = String(item.id ?? "");
    const vColour = String(v.colour ?? v.color ?? "").trim();
    const vCode = String(v.colourCode ?? "").trim();
    const vGal = Array.isArray(v.gallery) ? v.gallery : [];
    const itemGal = Array.isArray(item.gallery) ? item.gallery : [];
    return {
      ...item,
      image: v.image,
      colour: vColour || item.colour,
      colourCode: vCode || itemColourCode(item),
      gallery: vGal.length ? vGal : itemGal,
      __coverCacheKey: `${baseId}::${slot.colourKey}`,
    };
  }

  function outfitSlotKey(slot) {
    const id = String(slot?.itemId ?? "").trim();
    const ck = String(slot?.colourKey ?? slot?.colorKey ?? "").trim();
    return `${id}::${ck}`;
  }

  function normalizeOutfitSlot(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") {
      const itemId = raw.trim();
      if (!itemId) return null;
      const leg = LEGACY_OUTFIT_ITEM_TO_SLOT.get(itemId);
      if (leg) return { itemId: leg.itemId, colourKey: leg.colourKey };
      return { itemId };
    }
    if (typeof raw === "object" && raw.itemId != null) {
      let itemId = String(raw.itemId).trim();
      let colourKey = String(raw.colourKey ?? raw.colorKey ?? "").trim();
      const leg = LEGACY_OUTFIT_ITEM_TO_SLOT.get(itemId);
      if (leg) {
        itemId = leg.itemId;
        if (!colourKey) colourKey = String(leg.colourKey ?? "").trim();
      }
      if (!itemId) return null;
      return colourKey ? { itemId, colourKey } : { itemId };
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

  const ARCHIVE_SORT_MODE_KEY = "timeless-wardrobe-archive-sort-v1";
  /** User hid the “browser-only storage” banner; clearing this key shows it again. */
  const LOCAL_DATA_RISK_BANNER_DISMISSED_KEY = "timeless-wardrobe-dismiss-local-risk-v1";
  const PRICE_CURRENCY_CODES = ["TWD", "USD", "JPY", "CNY"];
  const ARCHIVE_SORT_MODES = ["archive", "price-asc", "price-desc", "date-asc", "date-desc"];
  /** Basic colour archive filter: uses stored `basicColour` only when set; otherwise infers from colour / fabric / codes. */
  const BASIC_COLOUR_FILTER_KEY = "timeless-wardrobe-basic-colour-v1";

  /** Approximate FX vs USD — display + cross-currency sort only (not live rates). */
  const FX_TO_USD = { USD: 1, TWD: 0.031, JPY: 0.0067, CNY: 0.14 };

  function loadPersistedArchiveSortMode() {
    try {
      const v = String(localStorage.getItem(ARCHIVE_SORT_MODE_KEY) || "").trim();
      if (ARCHIVE_SORT_MODES.includes(v)) return v;
    } catch {
      /* */
    }
    return "archive";
  }

  function persistArchiveSortMode(v) {
    const ok = ARCHIVE_SORT_MODES.includes(v) ? v : "archive";
    try {
      localStorage.setItem(ARCHIVE_SORT_MODE_KEY, ok);
    } catch {
      /* */
    }
    return ok;
  }

  function loadPersistedBasicColourFilter() {
    try {
      const v = String(localStorage.getItem(BASIC_COLOUR_FILTER_KEY) || "")
        .trim()
        .toLowerCase();
      if (!v) return "";
      if (BASIC_COLOUR_FAMILY_KEYS.includes(v)) return v;
    } catch {
      /* */
    }
    return "";
  }

  function persistBasicColourFilter(raw) {
    const v = String(raw ?? "")
      .trim()
      .toLowerCase();
    const ok = BASIC_COLOUR_FAMILY_KEYS.includes(v) ? v : "";
    try {
      if (ok) localStorage.setItem(BASIC_COLOUR_FILTER_KEY, ok);
      else localStorage.removeItem(BASIC_COLOUR_FILTER_KEY);
    } catch {
      /* */
    }
    return ok;
  }

  function basicColourLabelEn(key) {
    if (!key) return "All";
    return key.slice(0, 1).toUpperCase() + key.slice(1);
  }

  /**
   * @param {HTMLSelectElement | null} sel
   * @param {string} selectedKey
   */
  function fillBasicColourSelectOptions(sel, selectedKey) {
    if (!sel) return;
    const want = normalizeStoredBasicColourKey(selectedKey);
    sel.textContent = "";
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "Auto (from name / code / hex)";
    sel.appendChild(o0);
    for (const k of BASIC_COLOUR_FAMILY_KEYS) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = basicColourLabelEn(k);
      if (k === want) o.selected = true;
      sel.appendChild(o);
    }
    if (!want) o0.selected = true;
  }

  const BASIC_COLOUR_SWATCH_HEX = {
    blue: "#3f67c8",
    brown: "#7b5835",
    red: "#b73a3a",
    white: "#f4f4f1",
    black: "#1b1b1b",
    beige: "#d1bfa3",
    gold: "#c9a227",
    silver: "#b8babf",
    green: "#4f7b56",
    grey: "#8d8e95",
  };

  /**
   * Parse price from form strings or JSON (supports `12.34` and `12,34` as decimal comma).
   * @param {unknown} raw
   * @returns {number | null}
   */
  function parsePriceAmountFlexible(raw) {
    if (raw == null || raw === "") return null;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0) return null;
      return raw;
    }
    const t = String(raw).trim();
    if (!t) return null;
    let s = t.replace(/\s/g, "");
    if (/^\d+[.,]\d+$/.test(s)) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  let archiveSortMode = loadPersistedArchiveSortMode();
  /** Archive list prices are converted to TWD for totals, sort, and card display. */
  const archiveDisplayCurrency = "TWD";
  let basicColourFilter = loadPersistedBasicColourFilter();

  /**
   * Flatten optional price from top-level or `metadata` into `item.price` / `item.priceCurrency`.
   * Amount is stored in `priceCurrency` units (static FX is only used when converting for display/sort).
   * @param {object} item
   */
  function normalizeItemPriceFields(item) {
    if (!item || typeof item !== "object") return item;
    const meta = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : null;
    const raw =
      item.price !== undefined && item.price !== null && item.price !== ""
        ? item.price
        : meta && meta.price !== undefined && meta.price !== null && meta.price !== ""
          ? meta.price
          : null;
    let price = parsePriceAmountFlexible(raw);
    if (!Number.isFinite(price) || price < 0) price = null;
    let cur = String(item.priceCurrency ?? item.price_currency ?? (meta && meta.priceCurrency) ?? "").trim().toUpperCase();
    if (!cur || !PRICE_CURRENCY_CODES.includes(cur)) cur = "TWD";
    const out = { ...item, priceCurrency: cur };
    if (price != null) out.price = price;
    else delete out.price;
    return out;
  }

  /** Default measurement row labels for new pieces (editable). */
  const DEFAULT_MEASUREMENT_LABELS = ["Shoulder", "Chest", "Waist", "Sleeve", "Back Length"];

  function parseMeasurementUnitInput(raw) {
    return String(raw ?? "").trim().toLowerCase() === "mm" ? "mm" : "cm";
  }

  /**
   * @param {object} item
   * @returns {"cm" | "mm"}
   */
  function getMeasurementUnit(item) {
    if (!item || typeof item !== "object") return "cm";
    const top = String(item.measurementUnit ?? "").trim().toLowerCase();
    if (top === "mm") return "mm";
    const meta =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : null;
    const fromMeta = String(meta?.measurementUnit ?? meta?.measurement_unit ?? "").trim().toLowerCase();
    if (fromMeta === "mm") return "mm";
    return "cm";
  }

  /**
   * @param {unknown} raw
   * @returns {{ label: string, value: string }[]}
   */
  function cleanMeasurementRows(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const label = String(/** @type {any} */ (x).label ?? /** @type {any} */ (x).name ?? "").trim();
      const value = String(/** @type {any} */ (x).value ?? /** @type {any} */ (x).cm ?? "").trim();
      if (label || value) out.push({ label, value });
    }
    return out;
  }

  /**
   * @param {string} s
   * @returns {{ label: string, value: string }[]}
   */
  function parseLegacyMeasuredDimensions(s) {
    const t = String(s ?? "").trim();
    if (!t) return [];
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return cleanMeasurementRows(p);
    } catch {
      /* */
    }
    const lines = t.split(/\r?\n/).map((x) => String(x).trim()).filter(Boolean);
    if (!lines.length) return [];
    const parsed = [];
    for (const line of lines) {
      const m = line.match(/^(.+?)\s*[:：]\s*(.*)$/);
      if (m) parsed.push({ label: m[1].trim(), value: m[2].trim() });
      else parsed.push({ label: "", value: line });
    }
    if (parsed.length === 1) {
      const a = parsed[0];
      if (!a.label && a.value && !a.value.includes(":") && !a.value.includes("：")) {
        return [{ label: "Measurements", value: a.value }];
      }
    }
    return cleanMeasurementRows(parsed);
  }

  /**
   * Prefer structured `metadata.measurementRows`, then top-level rows, then legacy text column.
   * @param {object} item
   * @returns {{ label: string, value: string }[]}
   */
  function getMeasurementRows(item) {
    if (!item || typeof item !== "object") return [];
    const meta =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : null;
    if (meta && Array.isArray(meta.measurementRows) && meta.measurementRows.length)
      return cleanMeasurementRows(meta.measurementRows);
    if (Array.isArray(item.measurementRows) && item.measurementRows.length)
      return cleanMeasurementRows(item.measurementRows);
    return parseLegacyMeasuredDimensions(String(item.measuredDimensions ?? item.measured_dimensions ?? "").trim());
  }

  /**
   * @param {{ label: string, value: string }[]} rows
   * @param {"cm" | "mm"} [unit]
   */
  function measurementRowsToSummaryString(rows, unit = "cm") {
    const u = parseMeasurementUnitInput(unit);
    return cleanMeasurementRows(rows)
      .filter((r) => String(r.value ?? "").trim())
      .map((r) => {
        const L = String(r.label ?? "").trim();
        const V = String(r.value ?? "").trim();
        if (L && V) return `${L}: ${V} ${u}`;
        if (L) return L;
        return V ? `${V} ${u}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  /**
   * @param {{ label: string, value: string }[]} rows
   * @param {{ defaultsForEmpty?: boolean }} opts
   */
  function resolveInitialMeasurementRowsForEditor(rows, opts = {}) {
    const cleaned = cleanMeasurementRows(Array.isArray(rows) ? rows : []);
    if (cleaned.length) return cleaned;
    if (opts.defaultsForEmpty) return DEFAULT_MEASUREMENT_LABELS.map((label) => ({ label, value: "" }));
    return [{ label: "", value: "" }];
  }

  /**
   * @param {HTMLElement | null} container
   */
  function readMeasurementRowsFromEditor(container) {
    if (!container) return [];
    const dyn = container.querySelector(".measured-dims-dynamic") || container;
    const out = [];
    for (const row of dyn.querySelectorAll(".measured-dims-row[data-tw-meas-row]")) {
      const label = row.querySelector(".measured-dims-row__label")?.value?.trim() ?? "";
      const value = row.querySelector(".measured-dims-row__value")?.value?.trim() ?? "";
      if (value) out.push({ label, value });
    }
    return out;
  }

  /**
   * @param {HTMLElement} container
   * @param {{ label: string, value: string }[]} rowsToShow
   * @param {{ unitSelectId: string, initialUnit?: string }} opts
   */
  function mountMeasurementRowsEditor(container, rowsToShow, opts) {
    const unitSelectId = String(opts?.unitSelectId ?? "").trim();
    const initialUnit = parseMeasurementUnitInput(opts?.initialUnit ?? "cm");
    container.innerHTML = "";
    const block = document.createElement("div");
    block.className = "measured-dims-block";

    const dyn = document.createElement("div");
    dyn.className = "measured-dims-dynamic";

    let unitSel = /** @type {HTMLSelectElement | null} */ (null);
    if (unitSelectId) {
      const unitRow = document.createElement("div");
      unitRow.className = "measured-dims-unit-row";
      const unitLab = document.createElement("label");
      unitLab.className = "measured-dims-unit-field";
      const unitLabSpan = document.createElement("span");
      unitLabSpan.className = "measured-dims-unit-label";
      unitLabSpan.textContent = "Unit";
      unitSel = document.createElement("select");
      unitSel.id = unitSelectId;
      unitSel.setAttribute("aria-label", "Measurement unit");
      for (const u of ["cm", "mm"]) {
        const o = document.createElement("option");
        o.value = u;
        o.textContent = u;
        if (u === initialUnit) o.selected = true;
        unitSel.appendChild(o);
      }
      unitLab.appendChild(unitLabSpan);
      unitLab.appendChild(unitSel);
      unitRow.appendChild(unitLab);
      block.appendChild(unitRow);
    }

    function syncValuePlaceholders() {
      const u = unitSel ? parseMeasurementUnitInput(unitSel.value) : "cm";
      for (const inp of dyn.querySelectorAll(".measured-dims-row__value")) {
        /** @type {HTMLInputElement} */ (inp).placeholder = u;
      }
    }

    unitSel?.addEventListener("change", syncValuePlaceholders);

    function appendRow(label = "", value = "") {
      const row = document.createElement("div");
      row.className = "measured-dims-row";
      row.dataset.twMeasRow = "1";
      const labIn = document.createElement("input");
      labIn.type = "text";
      labIn.className = "measured-dims-row__label";
      labIn.maxLength = 80;
      labIn.placeholder = "Label";
      labIn.autocomplete = "off";
      labIn.value = label;
      const valIn = document.createElement("input");
      valIn.type = "text";
      valIn.className = "measured-dims-row__value";
      valIn.maxLength = 80;
      valIn.placeholder = unitSel ? parseMeasurementUnitInput(unitSel.value) : "cm";
      valIn.autocomplete = "off";
      valIn.value = value;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn--small btn--ghost measured-dims-row__remove";
      rm.setAttribute("aria-label", "Remove this row");
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        row.remove();
        if (!dyn.querySelector(".measured-dims-row")) appendRow("", "");
      });
      row.appendChild(labIn);
      row.appendChild(valIn);
      row.appendChild(rm);
      dyn.appendChild(row);
    }

    for (const r of rowsToShow) appendRow(String(r.label ?? "").trim(), String(r.value ?? "").trim());

    const toolbar = document.createElement("div");
    toolbar.className = "measured-dims-toolbar";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--small btn--ghost";
    addBtn.textContent = "Add row";
    addBtn.addEventListener("click", () => {
      appendRow("", "");
      syncValuePlaceholders();
    });
    toolbar.appendChild(addBtn);
    block.appendChild(dyn);
    block.appendChild(toolbar);
    container.appendChild(block);
    syncValuePlaceholders();
  }

  function resetAddItemMeasurementBlock() {
    const el = document.getElementById("add-item-measured-dims-block");
    if (!el) return;
    mountMeasurementRowsEditor(el, resolveInitialMeasurementRowsForEditor([], { defaultsForEmpty: false }), {
      unitSelectId: "add-item-measurement-unit",
      initialUnit: "cm",
    });
    const hid = document.getElementById("add-item-measured-dimensions");
    if (hid) hid.value = "";
  }

  /**
   * @param {object} item
   */
  function formatMeasurementRowsBrief(item) {
    const rows = getMeasurementRows(item).filter((r) => String(r.value ?? "").trim());
    if (!rows.length) {
      const leg = String(item.measuredDimensions ?? "").trim();
      return leg || "";
    }
    const u = getMeasurementUnit(item);
    return rows
      .map((r) => {
        const L = String(r.label ?? "").trim();
        const V = String(r.value ?? "").trim();
        if (L && V) return `${L} ${V} ${u}`;
        return L || (V ? `${V} ${u}` : "");
      })
      .filter(Boolean)
      .join(" · ");
  }

  /**
   * @param {HTMLElement} body
   * @param {object} item
   */
  function appendMeasurementDisplaySection(body, item) {
    const rows = getMeasurementRows(item).filter((r) => String(r.value ?? "").trim());
    const hasRows = rows.length > 0;
    const legacy = String(item.measuredDimensions ?? "").trim();
    if (!hasRows && !legacy) return;

    const sec = document.createElement("section");
    sec.className = "item-detail__measurements";
    const uDisp = getMeasurementUnit(item);
    const h = document.createElement("h3");
    h.className = "item-detail__measurements-title";
    h.textContent = `Measurements (${uDisp})`;
    sec.appendChild(h);
    const dl = document.createElement("dl");
    dl.className = "item-detail__measurements-dl";
    if (hasRows) {
      for (const r of rows) {
        const L = String(r.label ?? "").trim();
        const V = String(r.value ?? "").trim();
        if (!L && !V) continue;
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = L || "—";
        dd.textContent = V ? `${V} ${uDisp}` : "—";
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
    } else {
      const dt = document.createElement("dt");
      dt.textContent = "Notes";
      const dd = document.createElement("dd");
      dd.className = "item-detail__measurements-legacy";
      dd.textContent = legacy;
      dl.appendChild(dt);
      dl.appendChild(dd);
    }
    if (!dl.children.length) return;
    sec.appendChild(dl);
    body.appendChild(sec);
  }

  /**
   * Flatten structured measurements onto the item for UI / sorting.
   * @param {object} item
   */
  function normalizeMeasurementFields(item) {
    if (!item || typeof item !== "object") return item;
    const rows = getMeasurementRows(item).filter((r) => String(r.value ?? "").trim());
    const out = { ...item };
    if (rows.length) {
      out.measurementRows = rows;
      out.measurementUnit = getMeasurementUnit(item);
    } else {
      delete out.measurementRows;
      delete out.measurementUnit;
    }
    return out;
  }

  /** Price + optional structured measurements (see `metadata.measurementRows`). */
  function normalizeItemDerivedFields(item) {
    return normalizeMeasurementFields(normalizeItemPriceFields(item));
  }

  function convertPriceAmount(amount, fromC, toC) {
    if (!Number.isFinite(amount)) return null;
    const a = String(fromC ?? "TWD").toUpperCase();
    const b = String(toC ?? "TWD").toUpperCase();
    const fa = FX_TO_USD[a] ?? 1;
    const ta = FX_TO_USD[b] ?? 1;
    return (amount * fa) / ta;
  }

  /**
   * Display-only rounding for archive / cards / spend total.
   * Currencies without minor units (0 fraction digits, e.g. JPY/KRW/TWD) are half-up rounded on screen.
   * `item.price` storage stays unchanged.
   */
  function formatMoneyInCurrency(amount, currencyCode) {
    if (!Number.isFinite(amount)) return "";
    const raw = String(currencyCode ?? "TWD").trim();
    const code = /^[A-Za-z]{3}/.test(raw) ? raw.slice(0, 3).toUpperCase() : "TWD";
    let fractionDigits = 2;
    try {
      const resolved = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
      }).resolvedOptions();
      if (Number.isFinite(resolved.maximumFractionDigits)) {
        fractionDigits = resolved.maximumFractionDigits;
      }
    } catch {
      fractionDigits = code === "TWD" ? 0 : 2;
    }
    const roundedAmount = fractionDigits === 0 ? Math.round(Number(amount)) : Number(amount);

    if (code === "TWD") {
      try {
        return new Intl.NumberFormat("zh-TW", {
          style: "currency",
          currency: "TWD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(Math.round(roundedAmount));
      } catch {
        return `NT$${Math.round(roundedAmount).toLocaleString("zh-TW")}`;
      }
    }

    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: fractionDigits,
      }).format(roundedAmount);
    } catch {
      if (fractionDigits === 0) return `${code} ${Math.round(roundedAmount)}`;
      const scale = 10 ** Math.min(3, Math.max(1, fractionDigits));
      return `${code} ${Math.round(roundedAmount * scale) / scale}`;
    }
  }

  /** Stored `item.price` is per colourway; multiply for spend / sort when `colourVariants` exist. */
  function archivePriceColourVariantCount(item) {
    const vars = getItemColourVariants(item);
    return vars?.length ? vars.length : 1;
  }

  function formattedArchivePriceLine(item, opts = {}) {
    const brief = Boolean(opts?.brief);
    const p = item?.price;
    if (!Number.isFinite(Number(p))) return "";
    const from = String(item?.priceCurrency ?? "TWD").toUpperCase();
    const convertedUnit = convertPriceAmount(Number(p), from, archiveDisplayCurrency);
    if (!Number.isFinite(convertedUnit)) return "";
    const n = archivePriceColourVariantCount(item);
    const convertedTotal = convertedUnit * n;

    const unitShown = formatMoneyInCurrency(convertedUnit, archiveDisplayCurrency);
    const totalShown = formatMoneyInCurrency(convertedTotal, archiveDisplayCurrency);

    if (n <= 1) {
      if (from !== archiveDisplayCurrency) {
        const raw = formatMoneyInCurrency(Number(p), from);
        if (brief) return unitShown;
        return `${unitShown} (${raw})`;
      }
      return unitShown;
    }

    if (from !== archiveDisplayCurrency) {
      const rawUnit = formatMoneyInCurrency(Number(p), from);
      const rawTotalFmt = formatMoneyInCurrency(Number(p) * n, from);
      if (brief) return totalShown;
      return `${totalShown} (${n} × ${unitShown}; ${rawTotalFmt} = ${n} × ${rawUnit})`;
    }

    if (brief) return totalShown;
    return `${totalShown} (${n} × ${unitShown})`;
  }

  function purchaseDateSortMs(item) {
    const s = String(item?.purchaseDate ?? "").trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    const t = new Date(`${m[1]}T12:00:00`).getTime();
    return Number.isNaN(t) ? null : t;
  }

  function priceSortComparableInDisplayCurrency(item) {
    const p = item?.price;
    if (!Number.isFinite(Number(p))) return null;
    const from = String(item?.priceCurrency ?? "TWD").toUpperCase();
    const unit = convertPriceAmount(Number(p), from, archiveDisplayCurrency);
    if (!Number.isFinite(unit)) return null;
    const v = unit * archivePriceColourVariantCount(item);
    return Number.isFinite(v) ? v : null;
  }

  /** Sum price in current display currency for a list. */
  function sumPriceInDisplayCurrency(list) {
    let total = 0;
    for (const it of list || []) {
      const v = priceSortComparableInDisplayCurrency(it);
      if (Number.isFinite(v)) total += v;
    }
    return total;
  }

  /** Seed / Supabase rows only — merged with local + file custom rows into `items`. */
  /** @type {object[]} */
  let wardrobeBase = [];

  /**
   * `"cloud"` — `wardrobeBase` came from a full `wardrobe_items` fetch (edits mirror rows in that table).
   * `"seed"` — bundled `data/wardrobe.js`; cloud may still hold `custom-*` rows and any mirrored catalogue edits.
   */
  let wardrobeCatalogueSource = /** @type {"seed" | "cloud"} */ ("seed");

  /** Data pipeline mode: `cloud` = Supabase-backed single source; `local` = browser/file fallback. */
  let storageMode = /** @type {"cloud" | "local"} */ ("local");

  function isCloudModeActive() {
    return storageMode === "cloud" && isSupabaseReady();
  }

  /** All rows last loaded from Supabase `wardrobe_items` (not only `custom-*`). */
  /** @type {object[]} */
  let cloudBackedCustomItems = [];

  /** Custom rows from `data/custom-items.json` (same shape as localStorage custom list). */
  /** @type {object[]} */
  let fileBackedCustomItems = [];


  /** Top-level archive category (filter + add-item). */
  const SLOT_CLOTHING = "Clothing";
  const SLOT_ACCESSORIES = "Accessories";
  const SLOT_WATCHES = "Watches";
  const SLOT_FRAGRANCE = "Fragrance";

  const SLOT_OPTIONS = [
    SLOT_CLOTHING,
    SLOT_ACCESSORIES,
    SLOT_WATCHES,
    SLOT_FRAGRANCE,
  ];

  /**
   * When a row has no specific record type, pick the first real `category` seen in seed for that browse tab
   * (stable sort by `RECORD_CATEGORY_RANK`). If seed has none for a tab, use a safe static leaf.
   */
  const STATIC_RECORD_FALLBACK_BY_SLOT = {
    [SLOT_CLOTHING]: "Tops",
    [SLOT_ACCESSORIES]: "Hats",
    [SLOT_WATCHES]: "Watches",
    [SLOT_FRAGRANCE]: "Fragrance",
  };

  /** Legacy `category` values that only encoded browse tab — mapped for `itemSlot()` and migration off storage. */
  const LEGACY_UNSPEC_CATEGORY_TO_SLOT = {
    "Unspecified clothing": SLOT_CLOTHING,
    "Unspecified accessories": SLOT_ACCESSORIES,
    "Unspecified footwear": SLOT_ACCESSORIES,
    "Unspecified watches": SLOT_WATCHES,
    "Unspecified Jewellery": SLOT_ACCESSORIES,
    "Unspecified perfume": SLOT_FRAGRANCE,
  };

  /** @type {Record<string, string>} First concrete record-type per browse slot from seed (recomputed in `mergeWardrobeFromSources`). */
  let slotRecordFallbackCategory = {};

  function categoryDisplayLabel(slot) {
    if (slot === SLOT_CLOTHING) return "Clothing";
    if (slot === SLOT_WATCHES) return "Watches";
    if (slot === SLOT_FRAGRANCE) return "Fragrance";
    return slot;
  }

  /** Seed / DB `category` → short browse label in drill-down grid. */
  const RECORD_CATEGORY_LABELS = {
    Jackets: "Jackets",
    Outerwear: "Outerwear",
    "Mid Layer": "Layering",
    "Inner Layer": "Layering",
    Shirts: "Shirts & Tops",
    Bottoms: "Trousers",
    Tops: "Shirts & Tops",
    Footwear: "Footwear",
    Fragrance: "Fragrance",
    Jewellery: "Jewellery",
    Necklace: "Jewellery",
    Bracelet: "Jewellery",
    Ring: "Jewellery",
    Beater: "Watches",
    "Dress watch": "Watches",
    "Dive watch": "Watches",
    "Sports watch": "Watches",
    Watches: "Watches",
    Accessories: "Accessories",
    "Small accessories": "Small Accessories",
    Bags: "Bags",
    Hats: "Caps & Hats",
    Eyewear: "Eyewear",
    Sunglasses: "Eyewear",
    Glasses: "Eyewear",
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
    lines.push(`Name (display line): ${displayNameWithoutLeadingColour(item)}`);
    lines.push(`Browse category: ${categoryDisplayLabel(itemSlot(item))}`);
    lines.push(`Record category: ${recordCategoryForDrill(item, itemSlot(item))}`);
    lines.push(`Season: ${seasonUiLabel(item.season)}`);
    lines.push(`Colour: ${String(item.colour ?? "").trim()}`);
    lines.push(`Fabric: ${String(item.fabric ?? "").trim()}`);
    lines.push(`Weight / specs: ${String(item.weight ?? "").trim()}`);
    lines.push(`Size: ${String(item.size ?? "").trim()}`);
    {
      const rows = getMeasurementRows(item).filter((r) => String(r.value ?? "").trim());
      if (rows.length) {
        const u = getMeasurementUnit(item);
        lines.push(`Measurements (${u}):`);
        for (const r of rows) {
          const L = String(r.label ?? "").trim();
          const V = String(r.value ?? "").trim();
          if (L || V) lines.push(`  ${L || "—"}: ${V ? `${V} ${u}` : "—"}`);
        }
      } else {
        lines.push(`Measured dimensions: ${String(item.measuredDimensions ?? "").trim() || "(none)"}`);
      }
    }
    {
      const pd = String(item.purchaseDate ?? "").trim();
      lines.push(`Purchase date: ${pd ? formatPurchaseDateForDisplay(pd) : "(none)"}`);
    }
    {
      const p = item?.price;
      if (Number.isFinite(Number(p))) {
        const cur = String(item?.priceCurrency ?? "TWD").toUpperCase();
        const n = archivePriceColourVariantCount(item);
        const total = Number(p) * n;
        lines.push(
          n > 1
            ? `Price: ${formatMoneyInCurrency(total, cur)} (${n} × ${formatMoneyInCurrency(Number(p), cur)} per colour)`
            : `Price: ${formatMoneyInCurrency(Number(p), cur)}`
        );
      } else {
        lines.push("Price: (none)");
      }
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
    if (
      cat === "Watches" ||
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
      cat === "Jewellery" ||
      cat === "Necklace" ||
      cat === "Bracelet" ||
      cat === "Ring" ||
      cat === "項鏈" ||
      cat === "手鏈" ||
      cat === "戒指"
    )
      return SLOT_ACCESSORIES;
    if (cat === "Footwear") return SLOT_ACCESSORIES;
    if (cat === "Future") return SLOT_ACCESSORIES;
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
    if (
      rawCat === "Bags" ||
      rawCat === "Hats" ||
      rawCat === "帽子" ||
      rawCat === "Eyewear" ||
      rawCat === "Sunglasses" ||
      rawCat === "Glasses" ||
      rawCat === "Eyeglasses"
    ) {
      return SLOT_ACCESSORIES;
    }

    if (rawCat === "Clothing (incl. shoes)") return SLOT_CLOTHING;

    if (LEGACY_SLOT_LABEL[rawCat]) return LEGACY_SLOT_LABEL[rawCat];
    if (rawCat === "典藏·配件" || rawCat === "Archive · Accessories") return inferAccessoryBucket(item);
    if (Object.prototype.hasOwnProperty.call(LEGACY_ENGLISH_GRANULAR_SLOT, rawCat)) {
      return LEGACY_ENGLISH_GRANULAR_SLOT[rawCat];
    }
    if (SLOT_OPTIONS.includes(rawCat)) return rawCat;

    if (rawCat === "Footwear") return SLOT_ACCESSORIES;
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
      rawCat === "Jewellery" ||
      rawCat === "Necklace" ||
      rawCat === "Bracelet" ||
      rawCat === "Ring" ||
      rawCat === "Eyewear" ||
      rawCat === "Sunglasses" ||
      rawCat === "Glasses" ||
      rawCat === "Eyeglasses" ||
      rawCat === "項鏈" ||
      rawCat === "手鏈" ||
      rawCat === "戒指"
    ) {
      return SLOT_ACCESSORIES;
    }
    if (rawCat === "Future") return SLOT_ACCESSORIES;

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
    return (
      slotRecordFallbackCategory[s] ||
      STATIC_RECORD_FALLBACK_BY_SLOT[s] ||
      STATIC_RECORD_FALLBACK_BY_SLOT[SLOT_CLOTHING]
    );
  }

  /** Outfit builder: clothing, shoes, watches, and accessories — jewellery and perfume stay archive-only. */
  function itemEligibleForOutfit(item) {
    if (!item) return false;
    const s = itemSlot(item);
    return s === SLOT_CLOTHING || s === SLOT_WATCHES || s === SLOT_ACCESSORIES;
  }

  /** Browse column order when viewing All (or a main tab without a record-type drill). */
  const BROWSE_SLOT_RANK = {
    [SLOT_CLOTHING]: 0,
    [SLOT_ACCESSORIES]: 1,
    [SLOT_WATCHES]: 2,
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
    Watches: 50,
    Beater: 50,
    "Dress watch": 50,
    "Dive watch": 50,
    "Sports watch": 50,
    Fragrance: 9,
    Jewellery: 14,
    Necklace: 14,
    Bracelet: 14,
    Ring: 14,
    Accessories: 13,
    "Small accessories": 13,
    Bags: 12,
    Footwear: 13,
    Eyewear: 15,
    Sunglasses: 15,
    Glasses: 15,
    Hats: 16,
  };

  /** Record types always listed in add/edit `<select>` for these slots (even with zero items). */
  const KNOWN_RECORD_TYPES_BY_SLOT = {
    [SLOT_ACCESSORIES]: ["Bags", "Footwear", "Jewellery", "Eyewear", "Hats"],
    [SLOT_WATCHES]: ["Watches"],
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
    const ca = String(recordCategoryForDrill(a, itemSlot(a)) ?? "");
    const cb = String(recordCategoryForDrill(b, itemSlot(b)) ?? "");
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

  function initSupabaseClientFromConfig() {
    const cfg = globalThis.APP_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || "").trim();
    const key = String(cfg.SUPABASE_ANON_KEY || "").trim();

    if (!url || !key) {
      console.warn("Supabase config missing — APP_CONFIG.SUPABASE_URL or APP_CONFIG.SUPABASE_ANON_KEY is empty. Running local-only mode.");
      return null;
    }

    if (!globalThis.supabase?.createClient) {
      console.warn("Supabase JS SDK not loaded — make sure the Supabase CDN script is loaded before app.js.");
      return null;
    }

    try {
      const client = globalThis.supabase.createClient(url, key);
      console.info("Supabase client initialized.");
      return client;
    } catch (err) {
      console.warn("Could not initialize Supabase client.", err);
      return null;
    }
  }

  supabaseClient = initSupabaseClientFromConfig();
  globalThis.__WARDROBE_SUPABASE_DEBUG__ = () => ({
    hasAppConfig: Boolean(globalThis.APP_CONFIG),
    hasSupabaseUrl: Boolean(String(globalThis.APP_CONFIG?.SUPABASE_URL || "").trim()),
    hasSupabaseAnonKey: Boolean(String(globalThis.APP_CONFIG?.SUPABASE_ANON_KEY || "").trim()),
    hasSupabaseSdk: Boolean(globalThis.supabase?.createClient),
    hasClient: Boolean(supabaseClient),
    isReady: isSupabaseReady(),
    wardrobeItemsUpsertSpelling: "uk-first-us-fallback",
  });

  const WARDROBE_TABLE = "wardrobe_items";
  const WARDROBE_IMAGE_BUCKET = "wardrobe-images";

  function isSupabaseReady() {
    return Boolean(supabaseClient?.from && supabaseClient?.storage?.from);
  }

  /** Postgres `jsonb` / drivers sometimes return gallery as a JSON string instead of an array. */
  function normalizeGalleryFromDb(raw) {
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) {
          return p.map((x) => String(x ?? "").trim()).filter(Boolean);
        }
      } catch {
        /* ignore */
      }
    }
    return [];
  }

  function normalizeCloudItemRow(row) {
    if (!row || typeof row !== "object") return null;
    const id = String(row.id ?? "").trim();
    if (!id) return null;
    const brandRaw = String(row.brand ?? "").trim();
    const nameRaw = String(row.name ?? "").trim();
    const brand = brandRaw || "[No brand]";
    const name = nameRaw || "[Untitled]";
    const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : null;
    const cvFromMeta =
      meta && Array.isArray(meta.colourVariants) && meta.colourVariants.length
        ? meta.colourVariants
        : meta && Array.isArray(meta.colorVariants) && meta.colorVariants.length
          ? meta.colorVariants
          : null;
    const colourVariants =
      Array.isArray(row.colourVariants) && row.colourVariants.length
        ? row.colourVariants
        : Array.isArray(row.colorVariants) && row.colorVariants.length
          ? row.colorVariants
          : cvFromMeta && cvFromMeta.length
            ? cvFromMeta
            : null;
    const out = {
      ...row,
      id,
      brand,
      name,
      category: String(row.category ?? "").trim(),
      season: normalizeStoredItemSeason(row.season),
      colour: String(row.colour ?? row.color ?? "").trim(),
      colourCode: String(row.colour_code ?? row.color_code ?? "").trim(),
      fabric: String(row.fabric ?? "").trim(),
      weight: String(row.weight ?? "").trim(),
      size: String(row.size ?? "").trim(),
      measuredDimensions: String(row.measured_dimensions ?? row.measuredDimensions ?? "").trim(),
      purchaseDate: String(row.purchase_date ?? row.purchaseDate ?? "").trim(),
      image: String(row.image ?? "").trim(),
      gallery: normalizeGalleryFromDb(row.gallery),
      notes: String(row.notes ?? ""),
      metadata: row.metadata ?? null,
      __source: "supabase",
    };
    if (colourVariants) out.colourVariants = colourVariants;
    const ts =
      String(row.updated_at ?? row.updatedAt ?? "").trim() || String(row.created_at ?? row.createdAt ?? "").trim();
    if (ts) out.updatedAt = ts;
    return normalizeItemDerivedFields(out);
  }

  /** Strip legacy variant keys inside `metadata` before writing JSONB. */
  function sanitizeWardrobeMetadataForPostgres(meta) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const m = /** @type {Record<string, unknown>} */ ({ ...meta });
    if (Array.isArray(m.colourVariants) && m.colourVariants.length) {
      delete m.colorVariants;
    } else if (Array.isArray(m.colorVariants) && m.colorVariants.length) {
      m.colourVariants = m.colorVariants;
      delete m.colorVariants;
    } else {
      delete m.colourVariants;
      delete m.colorVariants;
    }
    return Object.keys(m).length ? m : null;
  }

  /**
   * Normalise any in-memory item (edit save merges `…prev`) so `itemToCloudRow` does not see stray `color` / camelCase DB keys.
   * @param {object} item
   */
  function coerceLooseWardrobeItemForCloudWrite(item) {
    if (!item || typeof item !== "object") return /** @type {any} */ ({});
    const x = /** @type {Record<string, unknown>} */ ({ ...item });
    delete x.__source;
    const ct = String(x.colour ?? x.color ?? "").trim();
    x.colour = ct;
    delete x.color;
    x.colourCode = itemColourCode(/** @type {any} */ (x));
    delete x.colorCode;
    delete x.color_code;
    delete x.colour_code;
    if (!Array.isArray(x.colourVariants) || !x.colourVariants.length) {
      if (Array.isArray(x.colorVariants) && x.colorVariants.length) x.colourVariants = x.colorVariants;
    }
    delete x.colorVariants;
    return /** @type {any} */ (x);
  }

  /** PostgREST column allowlist for `wardrobe_items` upsert (British spelling). */
  const WARDROBE_ITEMS_UPSERT_KEYS_UK = [
    "id",
    "pillar",
    "section",
    "category",
    "brand",
    "name",
    "season",
    "colour",
    "colour_code",
    "fabric",
    "weight",
    "size",
    "measured_dimensions",
    "purchase_date",
    "image",
    "gallery",
    "notes",
    "metadata",
  ];

  /** Same row shape with American column names (legacy DBs PostgREST still exposes). */
  const WARDROBE_ITEMS_UPSERT_KEYS_US = [
    "id",
    "pillar",
    "section",
    "category",
    "brand",
    "name",
    "season",
    "color",
    "color_code",
    "fabric",
    "weight",
    "size",
    "measured_dimensions",
    "purchase_date",
    "image",
    "gallery",
    "notes",
    "metadata",
  ];

  /**
   * PostgREST error: missing colour column on wardrobe_items (wrong spelling vs cache).
   * @param {unknown} err
   * @returns {"" | "colour" | "colour_code" | "color" | "color_code"}
   */
  function missingWardrobeItemsColourColumnFromPostgrest(err) {
    const d = formatSupabaseUserMessage(err);
    const m = d.match(/Could not find the '(colour|colour_code|color|color_code)' column of 'wardrobe_items'/i);
    return m ? /** @type {"colour" | "colour_code" | "color" | "color_code"} */ (m[1].toLowerCase()) : "";
  }

  /**
   * @param {Record<string, unknown>} raw from {@link itemToCloudRow}
   * @param {"uk" | "us"} spelling
   */
  function pickWardrobeItemsUpsertPayload(raw, spelling = "uk") {
    const keys = spelling === "us" ? WARDROBE_ITEMS_UPSERT_KEYS_US : WARDROBE_ITEMS_UPSERT_KEYS_UK;
    const o = /** @type {Record<string, unknown>} */ ({});
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) o[k] = raw[k];
    }
    if (spelling === "us") {
      delete o.colour;
      delete o.colour_code;
    } else {
      delete o.color;
      delete o.color_code;
    }
    return o;
  }

  /**
   * @param {object} item
   * @param {"uk" | "us"} spelling DB column spelling PostgREST expects for this upsert.
   */
  function itemToCloudRow(item, spelling = "uk") {
    const meta =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? { ...item.metadata } : {};
    if (Array.isArray(item.colourVariants) && item.colourVariants.length) {
      meta.colourVariants = item.colourVariants;
      delete meta.basicColour;
    } else {
      delete meta.colourVariants;
      delete meta.colorVariants;
      const bc = normalizeStoredBasicColourKey(item.basicColour ?? meta.basicColour);
      if (bc) meta.basicColour = bc;
      else delete meta.basicColour;
    }
    const pNum = parsePriceAmountFlexible(item.price != null ? item.price : meta?.price);
    if (Number.isFinite(pNum) && pNum >= 0) {
      meta.price = pNum;
      meta.priceCurrency = String(item.priceCurrency ?? "TWD").trim().toUpperCase() || "TWD";
    } else {
      delete meta.price;
      delete meta.priceCurrency;
    }
    const mSrc =
      Array.isArray(item.measurementRows) && item.measurementRows.length
        ? item.measurementRows
        : Array.isArray(meta.measurementRows) && meta.measurementRows.length
          ? meta.measurementRows
          : null;
    const mrows = cleanMeasurementRows(mSrc || []);
    if (mrows.length) {
      meta.measurementRows = mrows;
    } else {
      delete meta.measurementRows;
    }
    const mu = parseMeasurementUnitInput(item.measurementUnit ?? meta.measurementUnit);
    if (mrows.length) {
      if (mu === "mm") meta.measurementUnit = "mm";
      else delete meta.measurementUnit;
    } else {
      delete meta.measurementUnit;
    }
    const metadataOut = sanitizeWardrobeMetadataForPostgres(meta);
    const colourText = String(item.colour ?? item.color ?? "").trim();
    const codeText = itemColourCode(item);
    const measuredSummary = mrows.length
      ? measurementRowsToSummaryString(mrows, mu)
      : String(item.measuredDimensions ?? item.measured_dimensions ?? "").trim();
    const base = {
      id: String(item.id ?? "").trim(),
      pillar: String(item.pillar ?? "").trim(),
      section: String(item.section ?? "").trim(),
      category: String(item.category ?? "").trim(),
      brand: String(item.brand ?? "").trim(),
      name: String(item.name ?? "").trim(),
      season: normalizeStoredItemSeason(item.season),
      fabric: String(item.fabric ?? "").trim(),
      weight: String(item.weight ?? "").trim(),
      size: String(item.size ?? "").trim(),
      measured_dimensions: measuredSummary,
      purchase_date: String(item.purchaseDate ?? item.purchase_date ?? "").trim(),
      image: String(item.image ?? "").trim(),
      gallery: Array.isArray(item.gallery) ? item.gallery : [],
      notes: String(item.notes ?? ""),
      metadata: metadataOut,
    };
    if (spelling === "us") {
      return { ...base, color: colourText, color_code: codeText };
    }
    return { ...base, colour: colourText, colour_code: codeText };
  }

  /** Canonical DB row for `wardrobe_items` upsert (coerce → cloud row → allowlist only). */
  function wardrobeItemsStrictUpsertRowFromItem(item, spelling = "uk") {
    const coerced = coerceLooseWardrobeItemForCloudWrite(item);
    return pickWardrobeItemsUpsertPayload(itemToCloudRow(coerced, spelling), spelling);
  }

  function safeStorageSegment(value, fallback = "item") {
    const cleaned = String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return cleaned || fallback;
  }

  function fileExtensionFromFile(file) {
    const name = String(file?.name ?? "").trim();
    const m = name.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    const type = String(file?.type ?? "").toLowerCase();
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    return "jpg";
  }

  /**
   * Readable object path under `wardrobe-images` (Supabase Storage file browser).
   * `{itemId}/` = one wardrobe row; `main/` = row cover + gallery; `variants/` = per colour key.
   *
   * @param {string} itemId
   * @param {File} file
   * @param {{ type: "main_cover" } | { type: "main_gallery", index: number } | { type: "variant_cover", key: string } | { type: "variant_preview", key: string }} slot
   * @returns {string} object path (no bucket prefix)
   */
  function wardrobeImageStorageObjectPath(itemId, file, slot) {
    const root = safeStorageSegment(itemId);
    const ext = fileExtensionFromFile(file);
    if (!slot || slot.type === "main_cover") {
      return `${root}/main/cover.${ext}`;
    }
    if (slot.type === "main_gallery") {
      const n = Math.min(99, Math.max(1, Math.floor(Number(slot.index) || 1)));
      return `${root}/main/gallery/${String(n).padStart(2, "0")}.${ext}`;
    }
    if (slot.type === "variant_cover" || slot.type === "variant_preview") {
      const vk = safeStorageSegment(String(slot.key ?? "").trim(), "variant");
      const role = slot.type === "variant_preview" ? "preview" : "cover";
      return `${root}/variants/${vk}/${role}.${ext}`;
    }
    return `${root}/main/cover.${ext}`;
  }

  /**
   * @param {File} file
   * @param {string} itemId
   * @param {{ type: "main_cover" } | { type: "main_gallery", index: number } | { type: "variant_cover", key: string } | { type: "variant_preview", key: string }} slot
   */
  async function uploadWardrobeImageFileToCloud(file, itemId, slot = /** @type {const} */ ({ type: "main_cover" })) {
    if (!isSupabaseReady()) throw new Error("Supabase is not ready.");
    if (!file) return "";
    const path = wardrobeImageStorageObjectPath(itemId, file, slot);

    const { error } = await supabaseClient.storage.from(WARDROBE_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: true,
      contentType: file.type || `image/${fileExtensionFromFile(file)}`,
    });
    if (error) {
      const where =
        slot?.type === "main_cover"
          ? "main cover"
          : slot?.type === "main_gallery"
            ? `main gallery #${Math.max(1, Math.floor(Number(slot.index) || 1))}`
            : slot?.type === "variant_cover"
              ? `variant cover (${String(slot.key ?? "").trim() || "unknown key"})`
              : slot?.type === "variant_preview"
                ? `variant preview (${String(slot.key ?? "").trim() || "unknown key"})`
                : "image";
      const detail = formatSupabaseUserMessage(error);
      throw new Error(
        `Supabase Storage upload failed at ${where} [${WARDROBE_IMAGE_BUCKET}/${path}]${detail ? `: ${detail}` : ""}`
      );
    }

    const { data } = supabaseClient.storage.from(WARDROBE_IMAGE_BUCKET).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  /** Bust browser/CDN cache for Supabase Storage wardrobe images (same path after upsert). */
  function wardrobeImageCacheBustToken(item) {
    if (!item || typeof item !== "object") return "";
    const o = /** @type {any} */ (item);
    if (typeof o.__displayNonce === "number" && Number.isFinite(o.__displayNonce)) {
      return String(Math.floor(o.__displayNonce));
    }
    const u = String(o.updatedAt ?? o.updated_at ?? "").trim();
    if (u) return u.slice(0, 120);
    const c = String(o.createdAt ?? o.created_at ?? "").trim();
    if (c) return c.slice(0, 120);
    return "";
  }

  function withWardrobeImageCacheBust(url, item) {
    const raw = String(url ?? "").trim();
    if (!raw) return "";
    if (!storagePathFromWardrobeImageUrl(raw)) return raw;
    const token = wardrobeImageCacheBustToken(item);
    if (!token) return raw;
    try {
      const u = new URL(raw);
      u.searchParams.set("cb", token);
      return u.href;
    } catch {
      const sep = raw.includes("?") ? "&" : "?";
      return `${raw}${sep}cb=${encodeURIComponent(token)}`;
    }
  }

  function clearCoverResolutionCacheForItem(itemId) {
    const sid = String(itemId ?? "").trim();
    if (!sid) return;
    for (const k of [...coverResolutionCache.keys()]) {
      if (k === sid || k.startsWith(`${sid}::`)) coverResolutionCache.delete(k);
    }
  }

  function stampWardrobeItemMediaNonce(row, nonce = Date.now()) {
    const o = /** @type {any} */ (row);
    if (!o || typeof o !== "object") return nonce;
    const t = typeof nonce === "number" && Number.isFinite(nonce) ? Math.floor(nonce) : Date.now();
    o.__displayNonce = t;
    clearCoverResolutionCacheForItem(String(o.id ?? ""));
    return t;
  }

  function storagePathFromWardrobeImageUrl(url) {
    const s = String(url ?? "").trim().split("?")[0];
    if (!s || !/^https?:\/\//i.test(s)) return "";
    const esc = WARDROBE_IMAGE_BUCKET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `/storage/v1/(?:object/public|render/image/public)/${esc}/(.+)$`,
      "i"
    );
    const m = s.match(re);
    if (!m) return "";
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  async function deleteWardrobeImageUrlFromCloud(url) {
    if (!isSupabaseReady()) return false;
    const path = storagePathFromWardrobeImageUrl(url);
    if (!path) return false;
    const { error } = await supabaseClient.storage.from(WARDROBE_IMAGE_BUCKET).remove([path]);
    if (error) {
      console.warn("Could not delete wardrobe image from Supabase Storage.", error);
      return false;
    }
    return true;
  }

  async function deleteWardrobeItemImagesFromCloud(item) {
    if (!item || !isSupabaseReady()) return;
    const urls = [];
    const seen = new Set();
    function add(u) {
      const s = String(u ?? "").trim();
      if (!s || seen.has(s)) return;
      seen.add(s);
      urls.push(s);
    }
    add(item.image);
    for (const u of itemGalleryList(item)) {
      add(u);
    }
    const variants = getItemColourVariants(item);
    if (variants) {
      for (const v of variants) {
        add(v.image);
        add(v.previewImage);
        for (const u of v.gallery || []) add(u);
      }
    }
    const cloudUrls = urls.filter(storagePathFromWardrobeImageUrl);
    if (!cloudUrls.length) return;
    await Promise.allSettled(cloudUrls.map(deleteWardrobeImageUrlFromCloud));
  }

  /** Public URLs in our `wardrobe-images` bucket referenced by a row (cover, gallery, colour variants). */
  function collectSupabaseWardrobeImageUrls(item) {
    if (!item) return [];
    const out = [];
    const seen = new Set();
    function add(u) {
      const s = String(u ?? "").trim();
      if (!s || seen.has(s)) return;
      if (!storagePathFromWardrobeImageUrl(s)) return;
      seen.add(s);
      out.push(s);
    }
    add(item.image);
    for (const u of itemGalleryList(item)) add(u);
    const variants = getItemColourVariants(item);
    if (variants) {
      for (const v of variants) {
        add(v.image);
        add(v.previewImage);
        for (const u of v.gallery || []) add(u);
      }
    }
    return out;
  }

  /** After a successful save, remove Storage objects that the row no longer references. */
  async function deleteSupabaseImagesNoLongerUsed(prevItem, nextItem, nextItemAlt) {
    if (!isSupabaseReady()) return;
    const keep = new Set([
      ...collectSupabaseWardrobeImageUrls(nextItem),
      ...(nextItemAlt ? collectSupabaseWardrobeImageUrls(nextItemAlt) : []),
    ]);
    const drop = collectSupabaseWardrobeImageUrls(prevItem).filter((u) => !keep.has(u));
    if (!drop.length) return;
    await Promise.allSettled(drop.map((u) => deleteWardrobeImageUrlFromCloud(u)));
  }

  async function loadWardrobeItemsFromCloud() {
    if (!isSupabaseReady()) return [];
    const { data, error } = await supabaseClient
      .from(WARDROBE_TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Could not load Supabase wardrobe items.", error);
      return [];
    }
    const rawRows = data || [];
    console.info("[wardrobe_items] Supabase raw row count:", rawRows.length);
    const normalized = rawRows
      .map((row) => {
        const out = normalizeCloudItemRow(row);
        if (!out) {
          const id = row && typeof row === "object" ? String(row.id ?? "").trim() : "";
          console.warn("[wardrobe_items] dropped row (normalizeCloudItemRow):", id || "(no id)", row);
        }
        return out;
      })
      .filter(Boolean);
    console.info("[wardrobe_items] after normalize:", normalized.length);
    if (rawRows.length !== normalized.length) {
      console.warn(
        `[wardrobe_items] ${rawRows.length - normalized.length} row(s) dropped — usually empty id/brand/name in DB`
      );
    }
    return normalized;
  }

  /**
   * Supabase is canonical: push any rows that still exist only outside cloud
   * (seed catalogue + browser/file custom rows) into `wardrobe_items`.
   * Skips any id listed in `archive_hidden_ids` so user-deleted catalogue rows are not revived by deferred backfill.
   * @param {object[]} cloudRows current rows fetched from Supabase (or a snapshot thereof)
   * @returns {Promise<{ synced: number, failed: number }>}
   */
  async function syncMissingRowsToSupabase(cloudRows) {
    if (!isSupabaseReady()) return { synced: 0, failed: 0 };
    const cloudIds = new Set((cloudRows || []).map((r) => String(r?.id ?? "").trim()).filter(Boolean));
    const buriedIds = loadArchiveHiddenIds();

    /** @type {Map<string, object>} */
    const candidatesById = new Map();
    const pushCandidate = (row) => {
      if (!row || typeof row !== "object") return;
      const id = String(row.id ?? "").trim();
      if (!id || cloudIds.has(id) || buriedIds.has(id) || candidatesById.has(id)) return;
      candidatesById.set(id, normalizeItemDerivedFields({ ...row }));
    };

    for (const row of seedItemsFromScript()) pushCandidate(row);
    for (const row of await loadFileBackedCustomItems()) pushCandidate(row);
    for (const row of loadLocalStorageCustomOnly()) pushCandidate(row);

    let synced = 0;
    let failed = 0;
    for (const row of candidatesById.values()) {
      try {
        const saved = await saveWardrobeItemToCloud(row);
        cloudIds.add(String(saved.id ?? "").trim());
        synced += 1;
      } catch (e) {
        failed += 1;
        console.warn("syncMissingRowsToSupabase failed for row:", row?.id, e);
      }
    }
    return { synced, failed };
  }

  /** Upsert one custom row to `wardrobe_items` and return the normalized row from Postgres. */
  async function saveWardrobeItemToCloud(item) {
    if (!isSupabaseReady()) throw new Error("Supabase is not ready.");
    /** Prefer British columns; if PostgREST / DB only exposes American names, retry once. */
    const spellings = /** @type {const} */ (["uk", "us"]);
    let lastErr = /** @type {any} */ (null);
    for (const sp of spellings) {
      const row = wardrobeItemsStrictUpsertRowFromItem(item, sp);
      const { data, error } = await supabaseClient.from(WARDROBE_TABLE).upsert(row, { onConflict: "id" }).select("*").single();
      if (!error) {
        const norm = normalizeCloudItemRow(data);
        if (!norm) throw new Error("Supabase returned an invalid wardrobe row.");
        return norm;
      }
      lastErr = error;
      const missing = missingWardrobeItemsColourColumnFromPostgrest(error);
      const tryAlternate =
        (sp === "uk" && (missing === "colour" || missing === "colour_code")) ||
        (sp === "us" && (missing === "color" || missing === "color_code"));
      if (tryAlternate) continue;
      throw error;
    }
    throw lastErr;
  }

  /** @type {object[]} */
  let items = [];

  /** Increments whenever `mergeWardrobeFromSources()` rebuilds rows (invalidates main grid structural cache). */
  let wardrobeRevision = 0;

  /** Document-level dismiss listeners for the mobile filters panel (installed once). */
  let filtersMenuDismissListenersInstalled = false;

  /** After a cover loads, remember the working URL for gallery / outfit UI. */
  const coverResolutionCache = new Map();

  /** @type {Map<string, object>} */
  const itemById = new Map();

  function rebuildItemIndex() {
    itemById.clear();
    for (const i of items) itemById.set(i.id, i);
  }

  function normalizeCustomItemRows(arr) {
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
      .map((x) => ({
        ...x,
        image: String(x.image ?? "").trim(),
        season: normalizeStoredItemSeason(x.season),
        colourCode: String(x.colourCode ?? x.colorCode ?? x.colour_code ?? x.color_code ?? "").trim(),
      }));
  }

  function loadLocalStorageCustomOnly() {
    try {
      const raw = localStorage.getItem(CUSTOM_ITEMS_KEY);
      if (!raw) return [];
      return normalizeCustomItemRows(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  /** Remove custom rows with these ids from `localStorage` only (does not change `cloudBackedCustomItems`). */
  function stripCustomIdsFromLocalStorage(ids) {
    const drop = new Set((ids || []).map((x) => String(x ?? "").trim()).filter(Boolean));
    if (!drop.size) return false;
    try {
      const cur = loadLocalStorageCustomOnly();
      const next = cur.filter((r) => r && !drop.has(String(r.id)));
      if (next.length === cur.length) return false;
      localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** Write only browser-local custom rows to `data/custom-items.json` when dev API is up (no cloud dump). */
  async function mirrorLocalCustomItemsToProjectFile() {
    return await syncCustomItemsToProjectFile(loadLocalStorageCustomOnly());
  }

  /** Local custom rows for local mode, or cloud rows only for cloud mode. */
  function loadCustomItems() {
    const cloudRows = Array.isArray(cloudBackedCustomItems) ? cloudBackedCustomItems : [];
    const fromLs = loadLocalStorageCustomOnly();
    const fileRows = fileBackedCustomItems;

    if (isCloudModeActive()) {
      return [...cloudRows];
    }

    const localIds = new Set(fromLs.map((r) => String(r.id)));
    const fileOnly = fileRows.filter((r) => r && r.id != null && !localIds.has(String(r.id)));
    return [...fromLs, ...fileOnly];
  }

  async function syncCustomItemsToProjectFile(rows) {
    try {
      const res = await fetch("/api/custom-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) return false;
      fileBackedCustomItems = normalizeCustomItemRows(rows);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Persist browser-only custom rows (no Supabase): `localStorage` + optional `data/custom-items.json` via dev server.
   * When Supabase is on, canonical custom pieces live in `wardrobe_items`; drop the local duplicate list to save quota.
   * @param {unknown[]} rows
   * @returns {Promise<boolean>} without Supabase: `true` if project JSON was written; with Supabase: `true` after clearing redundant local cache.
   */
  async function commitCustomItems(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (isSupabaseReady()) {
      try {
        localStorage.removeItem(CUSTOM_ITEMS_KEY);
      } catch {
        /* ignore */
      }
      return true;
    }
    try {
      localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(list));
    } catch (e) {
      throw e;
    }
    return await syncCustomItemsToProjectFile(list);
  }

  function downloadCustomItemsJsonForRepo() {
    const rows = loadCustomItems();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    const u = URL.createObjectURL(blob);
    a.href = u;
    a.download = "custom-items.json";
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(u);
    showToast("Save as data/custom-items.json in the project to version custom pieces.");
  }

  /**
   * One-file snapshot of browser-only state (custom rows, archive overrides, hidden ids, outfits, UI prefs).
   * Does not replace Supabase sync — use when cloud is off or as an extra safety copy.
   */
  function downloadBrowserWardrobeBackupJson() {
    const payload = {
      _schema: "timeless-wardrobe-browser-backup-v1",
      exportedAt: new Date().toISOString(),
      supabaseConfigured: Boolean(isSupabaseReady()),
      customItems: loadCustomItems(),
      archiveOverrides: loadArchiveOverrides(),
      archiveHiddenIds: [...loadArchiveHiddenIds()],
      outfits: {
        version: OUTFIT_STORAGE_VERSION,
        outfits: savedOutfits.map((o) => ({
          id: o.id,
          name: o.name,
          createdAt: o.createdAt,
          slots: o.slots,
        })),
      },
      seasonNav: readSeasonNavFromLocalStorage(),
      archiveSortMode: loadPersistedArchiveSortMode(),
      displayCurrency: "TWD",
      basicColourFilter: loadPersistedBasicColourFilter(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    const u = URL.createObjectURL(blob);
    a.href = u;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `timeless-wardrobe-browser-backup-${stamp}.json`;
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(u);
    showToast(
      "Backup downloaded — store it outside the browser (cloud drive or git). Clearing site data will not remove that file."
    );
  }

  /** @type {boolean} */
  let localDataRiskBannerWired = false;

  function installLocalDataRiskBanner() {
    if (localDataRiskBannerWired) return;
    localDataRiskBannerWired = true;

    const el = document.getElementById("local-data-risk-banner");
    const refreshVisibility = () => {
      if (!el) return;
      if (isSupabaseReady()) {
        el.hidden = true;
        return;
      }
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(LOCAL_DATA_RISK_BANNER_DISMISSED_KEY) === "1";
      } catch {
        /* private mode */
      }
      el.hidden = dismissed;
    };

    refreshVisibility();

    document.getElementById("local-data-backup-json")?.addEventListener("click", () => {
      downloadBrowserWardrobeBackupJson();
    });
    document.getElementById("local-data-risk-dismiss")?.addEventListener("click", () => {
      try {
        localStorage.setItem(LOCAL_DATA_RISK_BANNER_DISMISSED_KEY, "1");
      } catch {
        /* */
      }
      refreshVisibility();
    });
    document.getElementById("data-note-backup-json")?.addEventListener("click", () => {
      downloadBrowserWardrobeBackupJson();
    });
  }

  /** Push merged custom rows (browser + file) into `data/custom-items.json` when `npm run dev` is running. */
  async function pullBrowserCustomItemsIntoProjectFile() {
    const rows = isSupabaseReady() ? loadLocalStorageCustomOnly() : loadCustomItems();
    let synced = false;
    try {
      if (isSupabaseReady()) {
        synced = await syncCustomItemsToProjectFile(rows);
      } else {
        synced = await commitCustomItems(rows);
      }
    } catch (e) {
      console.warn(e);
      showToast("Could not update browser storage — check space or privacy settings.");
      return;
    }
    if (synced) {
      mergeWardrobeFromSources();
      if (document.getElementById("grid")) {
        initFilters();
        onOutfitChange();
        renderGrid();
      }
      showToast("Browser custom pieces are now saved in data/custom-items.json.");
    } else {
      showToast("Start the app with npm run dev from the project folder, then try again.");
    }
  }

  function readSeasonNavFromLocalStorage() {
    try {
      const v = localStorage.getItem(SEASON_NAV_STORAGE_KEY);
      if (v === "A/W" || v === "S/S" || v === "All") return v;
    } catch {
      /* private mode / disabled */
    }
    return "All";
  }

  function loadPersistedSeasonNav() {
    return readSeasonNavFromLocalStorage();
  }

  /** Season strip (A/W · S/S · All) stays in localStorage only — ephemeral UI, not synced to Supabase. */
  function persistSeasonNav() {
    try {
      localStorage.setItem(SEASON_NAV_STORAGE_KEY, seasonNavFilter);
    } catch {
      /* ignore */
    }
  }

  /** In-memory archive state; persisted to Supabase when configured (else localStorage). */
  /** @type {Record<string, object>} */
  let archiveOverridesState = {};
  /** @type {Set<string>} */
  let archiveHiddenState = new Set();

  function readArchiveOverridesFromLocalStorageRaw() {
    try {
      const raw = localStorage.getItem(ITEM_ARCHIVE_OVERRIDES_KEY);
      if (!raw) return {};
      const p = JSON.parse(raw);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }

  function readArchiveHiddenIdsFromLocalStorageRaw() {
    try {
      const raw = localStorage.getItem(ARCHIVE_HIDDEN_IDS_KEY);
      if (!raw) return [];
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return [];
      return p.map((x) => String(x));
    } catch {
      return [];
    }
  }

  function installArchiveStateFromPayload(overrides, hiddenIds) {
    archiveOverridesState =
      overrides && typeof overrides === "object" && !Array.isArray(overrides) ? { ...overrides } : {};
    archiveHiddenState = new Set(Array.isArray(hiddenIds) ? hiddenIds.map((x) => String(x)) : []);
  }

  function applySeasonNavFromLocalStorage() {
    const v = readSeasonNavFromLocalStorage();
    if (v === "A/W" || v === "S/S" || v === "All") {
      seasonNavFilter = v;
    }
  }

  function hydrateArchiveStateFromLocalStorageOnly() {
    installArchiveStateFromPayload(
      readArchiveOverridesFromLocalStorageRaw(),
      readArchiveHiddenIdsFromLocalStorageRaw()
    );
    applySeasonNavFromLocalStorage();
  }

  async function flushWardrobeAppStateToSupabase() {
    if (!isSupabaseReady()) return;
    const row = {
      id: "default",
      archive_overrides: archiveOverridesState,
      archive_hidden_ids: [...archiveHiddenState],
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient.from("wardrobe_app_state").upsert(row, { onConflict: "id" });
    if (error) throw error;
  }

  async function hydrateArchiveAndSeasonState() {
    if (!isSupabaseReady()) {
      hydrateArchiveStateFromLocalStorageOnly();
      return;
    }

    const lsOv = readArchiveOverridesFromLocalStorageRaw();
    const lsH = readArchiveHiddenIdsFromLocalStorageRaw();

    const { data, error } = await supabaseClient
      .from("wardrobe_app_state")
      .select("archive_overrides, archive_hidden_ids")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.warn("wardrobe_app_state:", error);
      hydrateArchiveStateFromLocalStorageOnly();
      return;
    }

    if (!data) {
      installArchiveStateFromPayload(lsOv, lsH);
      applySeasonNavFromLocalStorage();
      try {
        await flushWardrobeAppStateToSupabase();
        localStorage.removeItem(ITEM_ARCHIVE_OVERRIDES_KEY);
        localStorage.removeItem(ARCHIVE_HIDDEN_IDS_KEY);
      } catch (e) {
        console.warn("wardrobe_app_state bootstrap insert:", e);
      }
      return;
    }

    let overrides =
      data.archive_overrides && typeof data.archive_overrides === "object" && !Array.isArray(data.archive_overrides)
        ? { ...data.archive_overrides }
        : {};
    let hidden = Array.isArray(data.archive_hidden_ids) ? data.archive_hidden_ids.map((x) => String(x)) : [];
    let migrated = false;

    if (!Object.keys(overrides).length && Object.keys(lsOv).length) {
      overrides = { ...lsOv };
      migrated = true;
    }
    if (!hidden.length && lsH.length) {
      hidden = [...lsH];
      migrated = true;
    }

    installArchiveStateFromPayload(overrides, hidden);
    applySeasonNavFromLocalStorage();

    if (migrated) {
      try {
        await flushWardrobeAppStateToSupabase();
        localStorage.removeItem(ITEM_ARCHIVE_OVERRIDES_KEY);
        localStorage.removeItem(ARCHIVE_HIDDEN_IDS_KEY);
      } catch (e) {
        console.warn("Migrate archive state to Supabase failed.", e);
      }
    } else if (Object.keys(lsOv).length || lsH.length) {
      try {
        localStorage.removeItem(ITEM_ARCHIVE_OVERRIDES_KEY);
        localStorage.removeItem(ARCHIVE_HIDDEN_IDS_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  function loadArchiveOverrides() {
    return { ...archiveOverridesState };
  }

  async function saveArchiveOverrides(map) {
    archiveOverridesState = map && typeof map === "object" && !Array.isArray(map) ? { ...map } : {};
    if (!isSupabaseReady()) {
      try {
        localStorage.setItem(ITEM_ARCHIVE_OVERRIDES_KEY, JSON.stringify(archiveOverridesState));
      } catch (e) {
        const q = /** @type {any} */ (e);
        if (q?.name === "QuotaExceededError" || q?.code === 22) {
          const ex = /** @type {any} */ (new Error("quota"));
          ex.archiveOverrides = true;
          throw ex;
        }
        throw e;
      }
      return;
    }
    await flushWardrobeAppStateToSupabase();
  }

  /**
   * Full in-memory row for cloud upsert when editing a catalogue (non-custom) piece.
   * @param {object} prev
   * @param {Record<string, unknown>} patch same shape as archive override patch
   */
  function mergeArchivePatchIntoFullItem(prev, patch) {
    if (!prev || typeof prev !== "object") return /** @type {any} */ ({});
    const id = String(prev.id ?? "").trim();
    const out = /** @type {Record<string, unknown>} */ ({ ...prev });
    for (const k of Object.keys(patch)) {
      if (k === "metadata") continue;
      out[k] = patch[k];
    }
    out.id = id;
    if (Object.prototype.hasOwnProperty.call(patch, "metadata")) {
      if (patch.metadata == null) delete out.metadata;
      else out.metadata = patch.metadata;
    }
    return /** @type {any} */ (out);
  }

  function loadArchiveHiddenIds() {
    return new Set(archiveHiddenState);
  }

  async function saveArchiveHiddenIds(set) {
    archiveHiddenState = new Set(set);
    if (!isSupabaseReady()) {
      try {
        localStorage.setItem(ARCHIVE_HIDDEN_IDS_KEY, JSON.stringify([...archiveHiddenState]));
      } catch (e) {
        throw e;
      }
      return;
    }
    await flushWardrobeAppStateToSupabase();
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
    const mergedList = isCloudModeActive() ? [...mergedBase] : [...loadCustomItems(), ...mergedBase];
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
      if (raw === canon) return normalizeItemDerivedFields(row2);
      return normalizeItemDerivedFields({ ...row2, category: canon });
    });
    rebuildItemIndex();
    coverResolutionCache.clear();
    wardrobeRevision += 1;
    syncHeaderSearchCategoryPreviews();
  }

  /**
   * Header search "Popular categories" cards: show one real cover per slot (archive order).
   */
  function syncHeaderSearchCategoryPreviews() {
    const gridHost = document.querySelector(".site-header__search-category-grid");
    if (!gridHost) return;
    for (const slot of SLOT_OPTIONS) {
      const card = /** @type {HTMLElement | null} */ (
        gridHost.querySelector(`a.site-header__search-category-card[data-category-jump="${slot}"]`)
      );
      if (!card) continue;
      const media = card.querySelector(".site-header__search-category-card__media");
      if (!(media instanceof HTMLElement)) continue;
      media.replaceChildren();
      media.classList.remove("site-header__search-category-card__media--missing");
      const pool = items.filter((it) => itemSlot(it) === slot);
      if (!pool.length) {
        media.classList.add("site-header__search-category-card__media--missing");
        continue;
      }
      const pick = [...pool].sort(compareGridItems)[0];
      if (!pick) {
        media.classList.add("site-header__search-category-card__media--missing");
        continue;
      }
      const img = document.createElement("img");
      img.className = "site-header__search-category-card__img";
      img.alt = "";
      img.decoding = "async";
      img.loading = "lazy";
      img.draggable = false;
      media.appendChild(img);
      wireCoverImageWithFallbacks(img, pick, {
        host: media,
        missingClass: "site-header__search-category-card__media--missing",
      });
    }
  }

  /** @type {{ itemId: string, colourKey?: string }[]} */
  let currentOutfitSlots = [];

  /** @type {{ id: string, name: string, slots: { itemId: string, colourKey?: string }[], createdAt: string }[]} */
  let savedOutfits = [];

  /** When set, the next "Save outfit" updates this saved row instead of creating a new one. */
  let editingSavedOutfitId = null;

  let toastTimer = null;

  /** @type {Element | null} */
  let archiveFilterDrawerFocusReturn = null;
  let archiveFilterDrawerOpenRaf = 0;

  /** @type {boolean} */
  let useCloudOutfits = false;
  let spendTotalAnimRaf = 0;
  let spendTotalAnimToken = 0;
  let spendTotalCurrentValue = 0;
  let outfitDockUserToggled = false;

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
    categoryChip: document.getElementById("filter-category-chip"),
    categoryChipText: document.getElementById("filter-category-chip-text"),
    searchChip: document.getElementById("filter-search-chip"),
    searchChipText: document.getElementById("filter-search-chip-text"),
    colourChip: document.getElementById("filter-colour-chip"),
    colourChipText: document.getElementById("filter-colour-chip-text"),
    subcategoryChip: document.getElementById("filter-subcategory-chip"),
    subcategoryChipText: document.getElementById("filter-subcategory-chip-text"),
    search: document.getElementById("filter-search"),
    searchClear: document.getElementById("filter-search-clear"),
    outfitStrip: document.getElementById("outfit-strip"),
    outfitEmpty: document.getElementById("outfit-empty"),
    outfitName: document.getElementById("outfit-name"),
    outfitSave: document.getElementById("outfit-save"),
    outfitClear: document.getElementById("outfit-clear"),
    outfitToast: document.getElementById("outfit-toast"),
    savedList: document.getElementById("saved-outfits-list"),
    savedEmpty: document.getElementById("saved-outfits-empty"),
    spendTotal: document.getElementById("filter-spend-total"),
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

  /**
   * item.html hero zoom in-place (inside media frame), with pointer pan.
   * @param {HTMLElement} media
   * @param {HTMLImageElement} heroImg
   */
  function wireInlineItemHeroZoom(media, heroImg) {
    if (!(media instanceof HTMLElement) || !(heroImg instanceof HTMLImageElement)) return;
    media.classList.add("item-detail__media--zoomable");
    heroImg.classList.add("item-detail__hero-img--zoomable");
    heroImg.tabIndex = 0;
    heroImg.title = "Click to zoom, move mouse to inspect details";

    const setOriginFromEvent = (ev) => {
      const rect = media.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      const px = Math.max(0, Math.min(100, x));
      const py = Math.max(0, Math.min(100, y));
      heroImg.style.setProperty("--hero-zoom-x", `${px}%`);
      heroImg.style.setProperty("--hero-zoom-y", `${py}%`);
    };

    const openZoom = () => {
      media.classList.add("item-detail__media--zoomed");
      heroImg.classList.add("item-detail__hero-img--zoomed");
      heroImg.title = "Click to zoom out";
    };
    const closeZoom = () => {
      media.classList.remove("item-detail__media--zoomed");
      heroImg.classList.remove("item-detail__hero-img--zoomed");
      heroImg.style.removeProperty("--hero-zoom-x");
      heroImg.style.removeProperty("--hero-zoom-y");
      heroImg.title = "Click to zoom, move mouse to inspect details";
    };
    const toggleZoom = () => {
      if (media.classList.contains("item-detail__media--zoomed")) closeZoom();
      else openZoom();
    };

    heroImg.addEventListener("click", (ev) => {
      ev.preventDefault();
      toggleZoom();
    });
    heroImg.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        toggleZoom();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        closeZoom();
      }
    });
    media.addEventListener("pointermove", (ev) => {
      if (!media.classList.contains("item-detail__media--zoomed")) return;
      setOriginFromEvent(ev);
    });
  }

  function itemDetailIsPageRoot(root) {
    return root?.classList?.contains("item-detail__root--page") ?? false;
  }

  /** Scroll and focus for standalone item.html (not dialog). */
  function afterItemDetailPageRender(root, edit) {
    if (!itemDetailIsPageRoot(root)) return;
    globalThis.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (!edit) return;
    queueMicrotask(() => {
      document.getElementById("item-edit-brand")?.focus();
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

  function extractHexDigitsFromColourText(s) {
    const out = [];
    const re = /#([0-9a-f]{3})\b|#([0-9a-f]{6})\b/gi;
    let m;
    const str = String(s ?? "");
    while ((m = re.exec(str))) {
      let h = (m[1] || m[2] || "").toLowerCase();
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      if (/^[0-9a-f]{6}$/.test(h)) out.push(h);
    }
    return out;
  }

  function hexRgbToBasicFamily(hex6) {
    if (!/^[0-9a-f]{6}$/i.test(hex6)) return null;
    const r = parseInt(hex6.slice(0, 2), 16) / 255;
    const g = parseInt(hex6.slice(2, 4), 16) / 255;
    const b = parseInt(hex6.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let s = 0;
    if (d > 1e-5) s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hh = 0;
    if (d > 1e-5) {
      if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) hh = ((b - r) / d + 2) / 6;
      else hh = ((r - g) / d + 4) / 6;
    }
    if (l > 0.93 && s < 0.09) return "white";
    if (l < 0.11) return "black";
    if (s < 0.11 && l > 0.15 && l < 0.88) return "grey";
    if (hh < 0.03 || hh > 0.97) return "red";
    if (hh < 0.085) return "brown";
    if (hh < 0.17) return "beige";
    if (hh < 0.52) return "green";
    if (hh < 0.78) return "blue";
    return "red";
  }

  /**
   * Map one text segment (already lowercased is ok) to basic families. Hex codes in the string win first.
   * @param {string} segment
   * @returns {Set<string>}
   */
  function basicFamiliesFromColourSegment(segment) {
    const fams = new Set();
    const raw = String(segment ?? "").trim();
    if (!raw) return fams;
    for (const hx of extractHexDigitsFromColourText(raw)) {
      const f = hexRgbToBasicFamily(hx);
      if (f) fams.add(f);
    }
    const t = raw.toLowerCase();
    const textOnly = t.replace(/#[0-9a-f]{3,6}\b/gi, " ");
    if (!textOnly.trim() && fams.size) return fams;

    const specific = [
      [/navy|steel\s*blue|steel-blue|powder\s+blue|air\s*force|indigo|denim|azure|cobalt|sapphire|teal|turquoise|aqua|aquamarine|blue|丹寧|天藍|藍色|藍/, "blue"],
      [/brown|chocolate|espresso|mocha|cognac|mahogany|tobacco|chestnut|camel(?!\s*hair)|hazel\b|咖|咖啡色|咖啡|棕|褐色/, "brown"],
      [/yellow\s*gold|rose\s*gold|white\s*gold|\by\.?\s*g\.?\b|\byg\b|\b18k\b|\b14k\b|\b9k\b|\bgold\b|pvd\s*gold|黃金/, "gold"],
      [/\bplatinum\b|\bpt950\b|950\s*pt|sterling|925|\bsilver\b(?!\s*[-–]?\s*(?:grey|gray))|\bargent\b|白金|鉑金|銀(?!灰)/, "silver"],
      [/burgundy|maroon|wine|oxblood|scarlet|crimson|ruby|brick|terracotta|coral|salmon|magenta|fuchsia|rose(?!\s*gold)|pink|burgundy|red|紅|紅色|酒紅|玫瑰|粉|珊瑚/, "red"],
      [/white|ivory|optic\s*white|snow\b(?!\s*wash)|off\s*-?\s*white|cream(?!\s*cotton)|ecru|奶白|雪白|米白|白色|白/, "white"],
      [/black|noir|jet\b|ink\b|黑色|黑/, "black"],
      [/beige|tan\b|khaki|sand|oat|latte|natural(?!\s*waist)|bone|stone-wash|camel|khaki|米色|卡其|駝|奶茶|駝色/, "beige"],
      [/olive|sage|mint|moss|hunter|emerald|jade|forest|green|橄欖|橄欖綠|墨綠|草綠|綠|綠色/, "green"],
      [/grey|gray|charcoal|graphite|pewter|slate|heather|melange|anthracite|ash|銀灰|灰色|灰/, "grey"],
    ];
    for (const [re, fam] of specific) {
      if (re.test(textOnly)) {
        fams.add(fam);
        return fams;
      }
    }
    if (/orange|tangerine|mustard|yellow|lemon|marigold|柑橘|橙|黃|芥/.test(textOnly)) {
      fams.add("beige");
      return fams;
    }
    if (/violet|purple|lavender|plum|eggplant|aubergine|薰衣草|紫/.test(textOnly)) {
      fams.add("blue");
      return fams;
    }
    return fams;
  }

  /** User-picked broad colour(s) from item / metadata / variants (normalized keys). */
  /** @returns {Set<string>} */
  function explicitItemBasicColourFamilies(item) {
    const s = new Set();
    if (!item || typeof item !== "object") return s;
    const meta =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : null;
    const top = normalizeStoredBasicColourKey(item.basicColour ?? meta?.basicColour);
    if (top) s.add(top);
    const vars = getItemColourVariants(item);
    if (vars) {
      for (const v of vars) {
        const vb = normalizeStoredBasicColourKey(v.basicColour);
        if (vb) s.add(vb);
      }
    }
    return s;
  }

  /** @param {Set<string>} fams */
  function addRawChunksToBasicColourFamilySet(raw, fams) {
    const s = String(raw ?? "").trim();
    if (!s) return;
    const chunks = s
      .split(/[,/&·+]|\/+|\s+-\s+|\s+and\s+|\s+·\s+|[／、]/i)
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    const parts = chunks.length ? chunks : [s];
    for (const p of parts) {
      for (const f of basicFamiliesFromColourSegment(p)) fams.add(f);
    }
  }

  /** Inferred families from colour / fabric / codes only (no stored `basicColour`). */
  /** @returns {Set<string>} */
  function inferItemBasicColourFamiliesFromContent(item) {
    const fams = new Set();
    addRawChunksToBasicColourFamilySet(item?.colour, fams);
    addRawChunksToBasicColourFamilySet(item?.fabric, fams);
    addRawChunksToBasicColourFamilySet(itemColourCode(item), fams);
    const vars = getItemColourVariants(item);
    if (vars) {
      for (const v of vars) {
        addRawChunksToBasicColourFamilySet(v.label, fams);
        addRawChunksToBasicColourFamilySet(v.colour || v.color, fams);
        addRawChunksToBasicColourFamilySet(v.colourCode || v.colorCode, fams);
      }
    }
    return fams;
  }

  /**
   * Families used for archive colour chips and filter. If the user set broad colour anywhere
   * (item, metadata, or a variant), only those keys are used; otherwise text/hex inference.
   * @returns {Set<string>}
   */
  function inferItemBasicColourFamilies(item) {
    const explicit = explicitItemBasicColourFamilies(item);
    if (explicit.size > 0) return new Set(explicit);
    return inferItemBasicColourFamiliesFromContent(item);
  }

  /**
   * Broad-colour families for one colour variant (stored `basicColour` or text inferred from that row only).
   * @returns {Set<string>}
   */
  function colourFamiliesForVariantFields(v) {
    const fams = new Set();
    if (!v || typeof v !== "object") return fams;
    const vb = normalizeStoredBasicColourKey(v.basicColour);
    if (vb) {
      fams.add(vb);
      return fams;
    }
    addRawChunksToBasicColourFamilySet(v.label, fams);
    addRawChunksToBasicColourFamilySet(v.colour, fams);
    addRawChunksToBasicColourFamilySet(v.color, fams);
    addRawChunksToBasicColourFamilySet(v.colourCode, fams);
    addRawChunksToBasicColourFamilySet(v.colorCode, fams);
    return fams;
  }

  /** First variant whose families include `bucket` (e.g. active archive colour filter). */
  function firstVariantKeyMatchingBasicColourBucket(item, bucket) {
    if (!bucket) return "";
    const vars = getItemColourVariants(item);
    if (!vars?.length) return "";
    for (const v of vars) {
      if (colourFamiliesForVariantFields(v).has(bucket)) return String(v.key);
    }
    return "";
  }

  function itemMatchesBasicColourFilter(item, bucket) {
    if (!bucket) return true;
    const fams = inferItemBasicColourFamilies(item);
    if (fams.size === 0) return false;
    return fams.has(bucket);
  }

  /**
   * Colour chips should reflect current context (season/category/type/search), excluding colour itself.
   * This lets users drill by category first, then see only relevant colours.
   * @returns {Set<string>}
   */
  function availableBasicColourFamiliesForCurrentContext() {
    const f = getFilters();
    const out = new Set();
    for (const item of items) {
      if (!itemPassesSeasonNav(item, f.seasonNav)) continue;
      if (f.category && itemSlot(item) !== f.category) continue;
      if (f.subcategory && !itemMatchesDrillSubcategory(item, f.category, f.subcategory)) continue;
      if (!itemMatchesSearch(item, f.search)) continue;
      for (const fam of inferItemBasicColourFamilies(item)) out.add(fam);
    }
    return out;
  }

  /** @returns {Map<string, number>} */
  function basicColourFamilyCountsForCurrentContext() {
    const f = getFilters();
    const out = new Map();
    for (const item of items) {
      if (!itemPassesSeasonNav(item, f.seasonNav)) continue;
      if (f.category && itemSlot(item) !== f.category) continue;
      if (f.subcategory && !itemMatchesDrillSubcategory(item, f.category, f.subcategory)) continue;
      if (!itemMatchesSearch(item, f.search)) continue;
      for (const fam of inferItemBasicColourFamilies(item)) {
        out.set(fam, (out.get(fam) ?? 0) + 1);
      }
    }
    return out;
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
      item.colour,
      itemColourCode(item),
      item.fabric,
      item.weight,
      item.size,
      item.measuredDimensions,
      formatMeasurementRowsBrief(item),
      ...getMeasurementRows(item).flatMap((r) => [r.label, r.value]),
      item.purchaseDate,
      item.notes,
      ...(Number.isFinite(Number(item.price))
        ? [String(item.price), String(item.priceCurrency ?? "")]
        : []),
      ...(getItemColourVariants(item)?.map((v) =>
        [v.label, v.colour, v.color, v.colourCode, v.key].filter(Boolean).join(" ")
      ) ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  /** Basic colour archive filter: enabled on the archive grid (all category tabs + “All”); hidden on `item.html`. */
  function allowArchiveBasicColourFilter() {
    return Boolean(document.getElementById("grid"));
  }

  function getFilters() {
    const allowColour = allowArchiveBasicColourFilter();
    return {
      seasonNav: seasonNavFilter,
      category: categoryNavFilter,
      subcategory: subcategoryFilter,
      search: normalizeSearch(els.search?.value ?? ""),
      basicColour: allowColour ? basicColourFilter : "",
    };
  }

  /** Category / record-type drill / search / colour — not the season tab. */
  function narrowingFiltersActive() {
    const allowColour = allowArchiveBasicColourFilter();
    return Boolean(
      categoryNavFilter ||
        String(subcategoryFilter ?? "").trim() ||
        normalizeSearch(els.search?.value ?? "") ||
        (allowColour && basicColourFilter)
    );
  }

  function describeNarrowingFiltersForUiSansSearch() {
    const bits = [];
    if (categoryNavFilter) bits.push(categoryDisplayLabel(categoryNavFilter));
    const sub = String(subcategoryFilter ?? "").trim();
    if (sub) bits.push(friendlyRecordCategory(sub) || sub);
    if (allowArchiveBasicColourFilter() && basicColourFilter) bits.push(basicColourLabelEn(basicColourFilter));
    return bits.join(" · ");
  }

  function syncSearchKeywordChip() {
    const rawQ = els.search?.value?.trim() ?? "";
    const btn = els.searchChip;
    const textEl = els.searchChipText;
    if (!btn || !textEl) return;
    if (rawQ) {
      textEl.textContent = rawQ;
      btn.hidden = false;
      btn.setAttribute("aria-label", `Remove search “${rawQ}”`);
    } else {
      textEl.textContent = "";
      btn.hidden = true;
      btn.removeAttribute("aria-label");
    }
  }

  function syncCategoryFilterChip() {
    const btn = els.categoryChip;
    const textEl = els.categoryChipText;
    if (!btn || !textEl) return;
    if (categoryNavFilter) {
      const label = categoryDisplayLabel(categoryNavFilter) || categoryNavFilter;
      textEl.textContent = label;
      btn.hidden = false;
      btn.setAttribute("aria-label", `Remove category filter “${label}”`);
    } else {
      textEl.textContent = "";
      btn.hidden = true;
      btn.removeAttribute("aria-label");
    }
  }

  function syncColourFilterChip() {
    const btn = els.colourChip;
    const textEl = els.colourChipText;
    if (!btn || !textEl) return;
    const allowColour = allowArchiveBasicColourFilter();
    if (allowColour && basicColourFilter) {
      const label = basicColourLabelEn(basicColourFilter);
      textEl.textContent = label;
      btn.hidden = false;
      btn.setAttribute("aria-label", `Remove colour filter “${label}”`);
    } else {
      textEl.textContent = "";
      btn.hidden = true;
      btn.removeAttribute("aria-label");
    }
  }

  function syncSubcategoryFilterChip() {
    const btn = els.subcategoryChip;
    const textEl = els.subcategoryChipText;
    if (!btn || !textEl) return;
    const raw = String(subcategoryFilter ?? "").trim();
    if (raw) {
      const label = friendlyRecordCategory(raw) || raw;
      textEl.textContent = label;
      btn.hidden = false;
      btn.setAttribute("aria-label", `Remove subcategory filter “${label}”`);
    } else {
      textEl.textContent = "";
      btn.hidden = true;
      btn.removeAttribute("aria-label");
    }
  }

  function clearArchiveKeywordSearchThenRender(options = {}) {
    const { focusInput = true } = options;
    if (!els.search) return;
    cancelSearchGridDebounce();
    els.search.value = "";
    syncFilterSearchClearVisibility();
    renderGrid();
    if (focusInput) els.search.focus();
  }

  function countItemsForCurrentSeasonTab() {
    return items.filter((it) => itemPassesSeasonNav(it, seasonNavFilter)).length;
  }

  function resetNarrowingFilters() {
    cancelSearchGridDebounce();
    categoryNavFilter = "";
    subcategoryFilter = "";
    basicColourFilter = persistBasicColourFilter("");
    if (els.search) els.search.value = "";
    syncFilterSearchClearVisibility();
    syncBasicColourFilterChipUi();
    syncCategoryTabUI();
    validateSubcategoryFilter();
    renderCategoryDrill();
    syncFiltersMenuForViewport();
    renderGrid();
    collapseFiltersMenuPanel();
  }

  /** Logo / home: full archive UI defaults — season, filters, colour, sort order, display currency. */
  function resetAllArchiveFilters() {
    seasonNavFilter = "All";
    persistSeasonNav();
    syncSeasonTabUI();
    archiveSortMode = persistArchiveSortMode("archive");
    const sortSel = document.getElementById("archive-sort");
    if (sortSel) sortSel.value = archiveSortMode;
    document.body.classList.remove("archive-ui--nav-folded");
    closeArchiveFilterDrawer();
    resetNarrowingFilters();
  }

  /** Season tab: "All" shows everything; S/S vs A/W use exact match plus `All-season` / blank / item `All`. */
  function itemPassesSeasonNav(item, nav) {
    if (nav === "All") return true;
    const s = String(item.season ?? "").trim();
    if (nav === "S/S") return s === "S/S" || s === "All-season" || s === "All" || s === "";
    if (nav === "A/W") return s === "A/W" || s === "All-season" || s === "All" || s === "";
    return true;
  }

  /** UI / export: blank, `All-season`, or `All` → label "All seasons". */
  function seasonUiLabel(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "All-season" || s === "All") return "All seasons";
    if (s === "A/W" || s === "S/S") return s;
    return s;
  }

  /** Stored value for “all seasons” on a piece; matches add/edit season `<select>` default. */
  const DEFAULT_STORED_SEASON = "All-season";

  /** Empty or legacy `All` → `All-season` for DB / JSON rows. */
  function normalizeStoredItemSeason(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "All") return DEFAULT_STORED_SEASON;
    return s;
  }

  /** Display `purchaseDate` (often ISO YYYY-MM-DD) for cards and detail. */
  function formatPurchaseDateForDisplay(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    const split = /^(\d{4}-\d{2}-\d{2})(?:\s*[·•]\s*(.+))?$/;
    const m = s.match(split);
    if (m) {
      try {
        const d = new Date(`${m[1]}T12:00:00`);
        if (!Number.isNaN(d.getTime())) {
          const pretty = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
          const note = m[2] != null ? String(m[2]).trim() : "";
          return note ? `${pretty} · ${note}` : pretty;
        }
      } catch {
        /* fall through */
      }
    }
    return s;
  }

  /** Split stored `purchaseDate` (ISO date, optional note) for date picker + text note fields. */
  function splitPurchaseDateForForm(stored) {
    const s = String(stored ?? "").trim();
    if (!s) return { date: "", note: "" };
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m) return { date: "", note: s };
    const datePart = m[1];
    let rest = s.slice(datePart.length).trim();
    if (rest.startsWith("T")) {
      rest = rest.replace(/^T[\d:.+\-Z]+/i, "").trim();
    }
    rest = rest.replace(/^[·•\-\s]+/, "").replace(/^\((.*)\)$/, "$1").trim();
    return { date: datePart, note: rest };
  }

  /** Combine date picker + optional note back into one stored string. */
  function joinPurchaseDateFromForm(date, note) {
    const d = String(date ?? "").trim();
    const n = String(note ?? "").trim();
    if (d && n) return `${d} · ${n}`;
    if (d) return d;
    return n;
  }

  function poolItemsForDrillSubcategories(opts = {}) {
    const respectCategory = opts.respectCategory !== false;
    let pool = items;
    pool = pool.filter((i) => itemPassesSeasonNav(i, seasonNavFilter));
    if (respectCategory && categoryNavFilter) pool = pool.filter((i) => itemSlot(i) === categoryNavFilter);
    return pool;
  }

  /**
   * Record types removed from the Watches drill — fold old `category` values into concrete keys.
   * @param {string} raw
   */
  function mapRemovedWatchRecordTypesToConcrete(raw) {
    const r = String(raw ?? "").trim();
    if (r === "Watches") return "Watches";
    if (r === "Everyday") return "Watches";
    if (r === "Beater") return "Watches";
    if (r === "Dress watch") return "Watches";
    if (r === "Dive watch") return "Watches";
    if (r === "Sports watch") return "Watches";
    return r;
  }

  /**
   * Legacy jewellery record types removed from the UI — fold into concrete drill keys.
   * @param {string} raw
   */
  function mapJewelleryFutureToConcreteDrillKey(raw) {
    const r = String(raw ?? "").trim();
    if (r === "Future") return "Jewellery";
    if (r === "Jewellery" || r === "Jewellery") return "Jewellery";
    if (r === "Necklace" || r === "Bracelet" || r === "Ring") return "Jewellery";
    return r;
  }

  /**
   * Stable record-type key for drill chips, filtering, and display under `browseSlot`.
   * Empty category or tab-only `category` maps to the first concrete type for that tab from seed (see `slotRecordFallbackCategory`).
   */
  function recordCategoryForDrill(item, browseSlot) {
    const slot = String(browseSlot ?? "").trim() || itemSlot(item);
    let raw = String(item?.category ?? "").trim();

    if (slot === SLOT_ACCESSORIES) {
      if (raw === "項鏈" || raw === "手鏈" || raw === "戒指") raw = "Jewellery";
      if (raw === "Sunglasses" || raw === "Glasses" || raw === "Eyeglasses") raw = "Eyewear";
      raw = mapJewelleryFutureToConcreteDrillKey(raw);
      if (raw === "Footwear") return "Footwear";
      if (raw === "Small accessories" || raw === "帽子") return "Hats";
      if (
        raw === "Watches" ||
        raw === "Everyday" ||
        raw === "Beater" ||
        raw === "Dress watch" ||
        raw === "Dive watch" ||
        raw === "Sports watch" ||
        raw === "潛水錶"
      ) {
        return "Hats";
      }
    }
    if (slot === SLOT_WATCHES) {
      if (raw === "潛水錶") raw = "Watches";
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
    if (r === "項鏈" || r === "手鏈" || r === "戒指") return "Jewellery";
    if (r === "潛水錶") return "Watches";
    if (r === "Small accessories") return "Hats";
    if (r === "帽子") return "Hats";
    return r;
  }

  /**
   * Populate record-type `<select>`: keys from the pool plus `preferKey` when valid; always includes the section fallback.
   */
  function fillItemEditRecordTypeSelect(selectEl, browseSlot, preferKey) {
    const slot = String(browseSlot ?? "").trim() || SLOT_CLOTHING;
    let prev = legacyZhRecordCategoryToEn(preferKey);
    if (slot === SLOT_ACCESSORIES) {
      prev = mapJewelleryFutureToConcreteDrillKey(prev);
    }
    if (slot === SLOT_WATCHES) prev = mapRemovedWatchRecordTypesToConcrete(prev);
    const pool = items.filter((i) => itemSlot(i) === slot);
    const fall = defaultRecordCategoryForSlot(slot);
    let keys = drillSubcategoryKeysFromPool(slot, pool);
    const knownExtra = KNOWN_RECORD_TYPES_BY_SLOT[slot];
    if (knownExtra?.length) keys = sortRecordTypeKeysForSlot(slot, [...keys, ...knownExtra]);
    if (slot === SLOT_ACCESSORIES) {
      keys = keys.filter((k) => k && !["Jewellery", "Jewellery", "Future"].includes(k));
      keys = keys.filter((k) => k && !["Everyday", "Watches", "Beater", "Dress watch", "Dive watch", "Sports watch"].includes(k));
      if (!keys.includes("Jewellery")) keys.push("Jewellery");
      keys = sortRecordTypeKeysForSlot(slot, keys);
    }
    if (slot === SLOT_WATCHES) {
      keys = ["Watches"];
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
    if (categoryNavFilter === SLOT_ACCESSORIES) {
      const j = mapJewelleryFutureToConcreteDrillKey(sub);
      if (j !== sub) {
        subcategoryFilter = j;
        sub = j;
      }
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

  /** Avoid `aria-hidden` + focused descendant (Chrome blocks and UX breaks); call before hiding `#category-drill`. */
  function blurActiveElementIfInsideCategoryDrill() {
    const drill = document.getElementById("category-drill");
    if (!drill) return;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && drill.contains(ae)) {
      ae.blur();
    }
  }

  function renderCategoryDrill() {
    const drill = document.getElementById("category-drill");
    const grid = document.getElementById("category-drill-grid");
    if (!drill || !grid) return;

    validateSubcategoryFilter();

    function hideDrillStrip() {
      blurActiveElementIfInsideCategoryDrill();
      drill.hidden = true;
      grid.innerHTML = "";
    }

    if (!categoryNavFilter) {
      hideDrillStrip();
      return;
    }

    const seasonalPool = poolItemsForDrillSubcategories();
    if (!seasonalPool.length) {
      subcategoryFilter = "";
      hideDrillStrip();
      return;
    }

    const typeKeys = [...new Set(drillSubcategoryKeysFromPool(categoryNavFilter, seasonalPool).filter(Boolean))];
    const typeEntries = [];
    const seenTypeLabels = new Set();
    for (const raw of typeKeys) {
      const label = friendlyRecordCategory(raw) || raw;
      if (seenTypeLabels.has(label)) continue;
      seenTypeLabels.add(label);
      typeEntries.push({ raw, label });
    }

    /** No sub-type strip when there is nothing to choose or only one record type (main tabs are enough). */
    if (typeEntries.length <= 1) {
      subcategoryFilter = "";
      hideDrillStrip();
      return;
    }

    grid.innerHTML = "";

    function appendChoice(rawValue, label) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "category-drill__choice";
      const active = subcategoryFilter === rawValue;
      if (active) b.classList.add("is-active");
      b.dataset.subcategory = rawValue;
      b.textContent = label;
      grid.appendChild(b);
    }

    for (const { raw, label } of typeEntries) {
      appendChoice(raw, label);
    }

    if (grid.childElementCount <= 0) {
      subcategoryFilter = "";
      hideDrillStrip();
      return;
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
      if (!itemMatchesBasicColourFilter(item, f.basicColour)) return false;
      return true;
    });
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Title line: when a descriptive colour is set and the name repeats it at the start, strip it (colour lives in specs).
   * Does not strip when the leading colour is the first half of a compound material (e.g. Camel Hair, Navy Wool).
   */
  function displayNameWithoutLeadingColour(item) {
    const name = String(item?.name ?? "").trim();
    const col = String(item?.colour ?? "").trim();
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
    const dn = displayNameWithoutLeadingColour(item);
    const col = String(item?.colour ?? "").trim();
    if (col) {
      return `${item.brand} — ${dn} (${col})`;
    }
    return `${item.brand} — ${dn}`;
  }

  function specParts(item, opts = {}) {
    const forGrid = Boolean(opts.forGridCard);
    const parts = [];
    const vars = getItemColourVariants(item);
    if (vars?.length) {
      if (!forGrid) {
        parts.push(`${vars.length} colours: ${vars.map((v) => v.label).join(", ")}`);
      }
    } else {
      if (item.colour) parts.push(item.colour);
    }
    if (forGrid) {
      const w = String(item.weight ?? "").trim();
      if (w) parts.push(w);
    } else {
      if (item.fabric) parts.push(item.fabric);
      if (item.weight) parts.push(item.weight);
    }
    return parts;
  }

  /** Native tooltip for grid cards — full fabric/weight/size/measure/date/price without cluttering the layout. */
  function buildCardNativeTitleSummary(item) {
    const bits = [];
    const brand = String(item?.brand ?? "").trim();
    const name = displayNameWithoutLeadingColour(item);
    if (brand) bits.push(brand);
    if (name) bits.push(name);
    for (const p of specParts(item)) bits.push(p);
    if (item.fabric) bits.push(String(item.fabric).trim());
    if (item.weight) bits.push(String(item.weight).trim());
    if (item.size) bits.push(String(item.size).trim());
    const mb = formatMeasurementRowsBrief(item);
    if (mb) bits.push(mb);
    if (item.purchaseDate) bits.push(formatPurchaseDateForDisplay(item.purchaseDate));
    const pl = formattedArchivePriceLine(item);
    if (pl) bits.push(pl);
    let s = bits.filter(Boolean).join(" · ");
    if (s.length > 480) s = s.slice(0, 477) + "…";
    return s;
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

  function isDisplayableCloudImageUrl(u) {
    const s = String(u ?? "").trim();
    return s.startsWith("data:") || s.startsWith("blob:") || /^https?:\/\//i.test(s);
  }

  /**
   * Ordered URLs to try for the cover: primary plus gallery / variant images (https, data, or blob only).
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
      for (const u of itemGalleryList(item)) {
        if (isDisplayableCloudImageUrl(u)) add(u);
      }
      const vars = getItemColourVariants(item);
      if (vars) {
        for (const v of vars) {
          const u = String(v?.image ?? "").trim();
          if (isDisplayableCloudImageUrl(u)) add(u);
        }
      }
      return out.map((u) => withWardrobeImageCacheBust(u, item));
    }

    if (!isDisplayableCloudImageUrl(primary)) {
      return [];
    }

    add(primary);
    for (const u of itemGalleryList(item)) {
      if (isDisplayableCloudImageUrl(u)) add(u);
    }
    const vars = getItemColourVariants(item);
    if (vars) {
      for (const v of vars) {
        const u = String(v?.image ?? "").trim();
        if (isDisplayableCloudImageUrl(u)) add(u);
      }
    }
    return out.map((u) => withWardrobeImageCacheBust(u, item));
  }

  function effectiveCoverSrc(item) {
    const cacheKey =
      item?.__coverCacheKey != null
        ? String(item.__coverCacheKey)
        : item?.id != null
          ? String(item.id)
          : "";

    if (cacheKey && coverResolutionCache.has(cacheKey)) {
      return coverResolutionCache.get(cacheKey);
    }

    const src = String(item?.image ?? "").trim();
    if (!isDisplayableCloudImageUrl(src)) return "";
    return withWardrobeImageCacheBust(src, item);
  }

  /**
   * Try `buildCoverCandidates` in order until one loads. Optionally cache working URL on `item.id`.
   * @param {{ host?: HTMLElement, missingClass?: string | null, onResolved?: (url: string) => void, onExhausted?: () => void }} [opts]
   */
  function wireCoverImageWithFallbacks(img, item, opts) {
    const prevAbort = /** @type {(() => void) | undefined} */ (/** @type {any} */ (img).__twCoverWireAbort);
    if (typeof prevAbort === "function") {
      try {
        prevAbort();
      } catch {
        /* ignore */
      }
    }

    const host = opts?.host;
    const missingClass = opts?.missingClass !== undefined ? opts.missingClass : "card__media--missing";
    const onResolved = opts?.onResolved;
    const onExhausted = opts?.onExhausted;
    const candidates = buildCoverCandidates(item);
    if (!candidates.length) {
      /** @type {any} */ (img).__twCoverWireAbort = undefined;
      if (host && missingClass) host.classList.add(missingClass);
      onExhausted?.();
      img.removeAttribute("src");
      return;
    }

    let idx = 0;
    let done = false;
    function cacheKeyForItem() {
      return item?.__coverCacheKey != null
        ? String(item.__coverCacheKey)
        : item?.id != null
          ? String(item.id)
          : "";
    }
    function cleanup() {
      if (done) return;
      done = true;
      img.removeEventListener("error", onErr);
      img.removeEventListener("load", onLoad);
      /** @type {any} */ (img).__twCoverWireAbort = undefined;
    }
    function finishFail() {
      cleanup();
      const ck = cacheKeyForItem();
      if (ck) coverResolutionCache.delete(ck);
      if (host && missingClass) host.classList.add(missingClass);
      onExhausted?.();
      img.removeAttribute("src");
    }
    function finishSuccess() {
      cleanup();
      if (host && missingClass) host.classList.remove(missingClass);
      const url = img.currentSrc || img.src;
      const ck = cacheKeyForItem();
      if (ck) coverResolutionCache.set(ck, url);
      onResolved?.(url);
    }
    function tryNext() {
      idx += 1;
      if (idx >= candidates.length) {
        finishFail();
        return;
      }
      img.src = candidates[idx];
    }
    function onLoad() {
      if (!img.naturalWidth && !img.naturalHeight) {
        tryNext();
        return;
      }
      finishSuccess();
    }
    function onErr() {
      tryNext();
    }

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onErr);
    img.src = candidates[0];

    /** @type {any} */ (img).__twCoverWireAbort = () => {
      cleanup();
    };
  }

  /** Thumbnail strip to swap the hero `img` (grid card or detail dialog). */
  function mountHeroGalleryStrip(mediaEl, heroImgEl, item) {
    const extras = itemGalleryList(item).filter(isDisplayableCloudImageUrl);
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
    const firstCover = buildCoverCandidates(item)[0] ?? "";
    if (firstCover) mainTi.src = firstCover;
    mainTi.alt = "";
    mainTi.draggable = false;
    mainBtn.appendChild(mainTi);
    mainBtn.addEventListener("click", () => {
      const src = effectiveCoverSrc(item);
      if (src) heroImgEl.src = src;
      else heroImgEl.removeAttribute("src");
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
      ti.src = withWardrobeImageCacheBust(url, item);
      ti.alt = "";
      ti.draggable = false;
      btn.appendChild(ti);
      btn.addEventListener("click", () => {
        heroImgEl.src = withWardrobeImageCacheBust(url, item);
        heroImgEl.alt = `${item.brand} — ${displayNameWithoutLeadingColour(item)} (detail)`;
        setActive(btn);
      });
      strip.appendChild(btn);
    });

    mediaEl.appendChild(strip);
  }

  function showToast(msg) {
    const toastEl = els.outfitToast || document.getElementById("outfit-toast");
    if (!toastEl) return;
    const text = String(msg ?? "").trim();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    toastEl.textContent = text;
    if (text) {
      toastEl.hidden = false;
      toastTimer = setTimeout(() => {
        toastEl.textContent = "";
        toastEl.hidden = true;
        toastTimer = null;
      }, 3800);
    } else {
      toastEl.hidden = true;
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
    if (supabaseClient && useCloudOutfits) {
      return;
    }
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
        "Only clothing, shoes, watches, and accessories go into outfits — jewellery and perfume stay in the archive."
      );
      return;
    }
    const k = outfitSlotKey(slot);
    if (outfitSlotKeySet().has(k)) {
      showToast("This colour is already in this outfit.");
      return;
    }
    if (currentOutfitSlots.length >= MAX_OUTFIT_ITEMS) {
      showToast(`Outfits are limited to ${MAX_OUTFIT_ITEMS} pieces.`);
      return;
    }
    currentOutfitSlots.push(slot);
    onOutfitChange();
    if (!document.getElementById("outfit-strip")) {
      showToast("Added to outfit — open the archive to see the outfit builder.");
    } else {
      showToast("Added to outfit.");
    }
  }

  function openOutfitVariantPicker(itemId) {
    const item = itemById.get(itemId);
    const vars = item ? getItemColourVariants(item) : null;
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
      title.textContent = `${item.brand} — ${displayNameWithoutLeadingColour(item)}`;
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
    const vars = getItemColourVariants(item);
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
      s.colourKey ? { itemId: s.itemId, colourKey: s.colourKey } : { itemId: s.itemId }
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

  /** Target max decoded size per embedded photo (local JSON + uploads). Tune here (bytes). */
  const STORAGE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

  /**
   * Approximate binary size of a `data:*;base64,…` payload (decoded bytes).
   * @param {string} dataUrl
   */
  function dataUrlDecodedByteLength(dataUrl) {
    const s = String(dataUrl ?? "");
    const marker = "base64,";
    const idx = s.indexOf(marker);
    if (idx === -1) return 0;
    const b64 = s.slice(idx + marker.length);
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
  }

  /**
   * Read a file as a data URL without re-encoding (for small files under `STORAGE_IMAGE_MAX_BYTES`).
   * @param {File} file
   * @returns {Promise<string>}
   */
  function fileToRawDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || typeof file !== "object") {
        reject(new Error("Invalid file"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error instanceof Error ? reader.error : new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Resize / re-encode an image via canvas and return a data URL.
   * PNG / WebP / GIF default to PNG when not `preferJpeg`, so alpha is kept until size forces JPEG.
   * @param {File} file
   * @param {number | { maxSide?: number, maxWidth?: number, quality?: number, forcePng?: boolean, preferJpeg?: boolean }} [opts]
   * @returns {Promise<string>}
   */
  function fileToResizedDataUrl(file, opts) {
    let o = {};
    if (typeof opts === "number") o = { maxSide: opts };
    else if (opts && typeof opts === "object") o = opts;

    const quality = typeof o.quality === "number" ? o.quality : 0.82;
    const forcePng = Boolean(o.forcePng);
    const preferJpeg = Boolean(o.preferJpeg);
    const maxSide = typeof o.maxSide === "number" ? o.maxSide : typeof o.maxWidth === "number" ? null : 1920;
    const maxWidthLegacy = typeof o.maxWidth === "number" ? o.maxWidth : null;

    const mime = String(file?.type ?? "").toLowerCase();
    const fileName = String(file?.name ?? "").toLowerCase();
    const looksAlphaCapable =
      !preferJpeg &&
      (forcePng ||
        mime === "image/png" ||
        mime === "image/webp" ||
        mime === "image/gif" ||
        fileName.endsWith(".png") ||
        fileName.endsWith(".webp") ||
        fileName.endsWith(".gif"));
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

  /** After `QuotaExceededError`: one aggressive re-encode (still HD-class before tiny fallbacks). */
  const QUOTA_SHRINK_MAX_SIDE = 1280;
  const QUOTA_SHRINK_QUALITY = 0.72;

  /**
   * Encode for storage: under `STORAGE_IMAGE_MAX_BYTES` (decoded). Small files stay lossless as raw data URLs.
   * @param {File} file
   * @param {{ preferJpeg?: boolean }} [codecOpts] Gallery slots pass `preferJpeg: true` (smaller, no alpha path).
   * @returns {Promise<string>}
   */
  async function fileToStorageDataUrl(file, codecOpts) {
    const extra = codecOpts && typeof codecOpts === "object" ? codecOpts : {};
    const cap = STORAGE_IMAGE_MAX_BYTES;

    try {
      const raw = await fileToRawDataUrl(file);
      if (raw.startsWith("data:image") && dataUrlDecodedByteLength(raw) <= cap) {
        return raw;
      }
    } catch {
      /* fall through to canvas */
    }

    let maxSide = 2560;
    let quality = 0.88;
    let preferJpeg = Boolean(extra.preferJpeg);
    /** @type {string} */
    let last = "";

    for (let i = 0; i < 40; i++) {
      last = await fileToResizedDataUrl(file, { ...extra, maxSide, quality, preferJpeg });
      if (dataUrlDecodedByteLength(last) <= cap) {
        return last;
      }
      const isPng = last.startsWith("data:image/png");
      if (isPng && !preferJpeg) {
        maxSide = Math.max(320, Math.round(maxSide * 0.83));
        if (maxSide <= 420) {
          preferJpeg = true;
        }
      } else {
        if (quality > 0.42) {
          quality = Math.max(0.35, quality - 0.055);
        } else {
          maxSide = Math.max(320, Math.round(maxSide * 0.83));
        }
      }
    }
    return last;
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
    if (Array.isArray(next.colourVariants) && next.colourVariants.length) {
      next.colourVariants = await Promise.all(
        next.colourVariants.map(async (v) => {
          const nv = { ...v };
          if (nv.image) nv.image = await shrinkDataUrlForStorage(String(nv.image));
          if (nv.previewImage) nv.previewImage = await shrinkDataUrlForStorage(String(nv.previewImage));
          if (Array.isArray(nv.gallery) && nv.gallery.length) {
            nv.gallery = (
              await Promise.all(nv.gallery.map((u) => (u ? shrinkDataUrlForStorage(String(u)) : "")))
            ).filter(Boolean);
          }
          return nv;
        })
      );
    } else if (Array.isArray(next.colorVariants) && next.colorVariants.length) {
      next.colourVariants = await Promise.all(
        next.colorVariants.map(async (v) => {
          const nv = { ...v };
          if (nv.image) nv.image = await shrinkDataUrlForStorage(String(nv.image));
          if (nv.previewImage) nv.previewImage = await shrinkDataUrlForStorage(String(nv.previewImage));
          if (Array.isArray(nv.gallery) && nv.gallery.length) {
            nv.gallery = (
              await Promise.all(nv.gallery.map((u) => (u ? shrinkDataUrlForStorage(String(u)) : "")))
            ).filter(Boolean);
          }
          return nv;
        })
      );
      delete next.colorVariants;
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
   * `outfit_items.item_id` references `wardrobe_items.id` with ON DELETE RESTRICT — Postgres
   * rejects deleting a row that still appears in any saved outfit. Remove those links first.
   * If RLS blocks deletes, PostgREST can return success with 0 rows removed — we detect that and throw.
   */
  async function unlinkCloudOutfitsReferencingWardrobeItem(itemId) {
    const sid = String(itemId ?? "").trim();
    if (!sid || !isSupabaseReady()) return;
    const { error } = await supabaseClient.from("outfit_items").delete().eq("item_id", sid);
    if (error) throw error;
    const { count, error: countErr } = await supabaseClient
      .from("outfit_items")
      .select("item_id", { count: "exact", head: true })
      .eq("item_id", sid);
    if (countErr) {
      console.warn("outfit_items count after unlink:", countErr);
    } else if (count != null && count > 0) {
      const blocked = new Error(
        "Saved outfits still reference this piece in the database (DELETE on outfit_items removed no rows — check Supabase RLS: anon needs DELETE on outfit_items, see migrations/20250513000000_init_wardrobe.sql)."
      );
      /** @type {any} */ (blocked).code = "OUTFIT_ITEMS_UNLINK_BLOCKED";
      throw blocked;
    }
    savedOutfits = savedOutfits.map((o) => {
      const slots = Array.isArray(o.slots) ? o.slots : [];
      const next = slots.filter((s) => String(s.itemId ?? "") !== sid);
      if (next.length === slots.length) return o;
      return { ...o, slots: next };
    });
  }

  function formatSupabaseUserMessage(err) {
    if (err == null) return "";
    const o = /** @type {any} */ (err);
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
    if (typeof o.error_description === "string") return o.error_description.trim();
    try {
      return JSON.stringify(o);
    } catch {
      return String(o);
    }
  }

  /** Short line for wardrobe_items upsert failures (add / edit / duplicate). */
  const CLOUD_WRITE_REQUIRED_MESSAGE =
    "Cloud save is required. Supabase is not connected yet — configure js/tw-supabase-config.js (URL + anon key) and retry.";

  function messageForCloudUploadFailure(context, err) {
    const detail = formatSupabaseUserMessage(err);
    if (!detail) return `Cloud upload failed (${context}).`;
    if (/row-level security|violates row-level security policy|permission denied/i.test(detail)) {
      return (
        `Cloud upload failed (${context}): ${detail}. ` +
        "Check Supabase Storage bucket policy for `wardrobe-images` (INSERT/UPDATE/SELECT for current role)."
      );
    }
    return `Cloud upload failed (${context}): ${detail}`;
  }

  function isSupabaseSchemaTableMissingError(detail, tableName) {
    const d = String(detail ?? "").trim();
    if (!d || !tableName) return false;
    const esc = String(tableName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`Could not find the table 'public\\.${esc}' in the schema cache`, "i").test(d);
  }

  function messageForFailedWardrobeUpsert(err) {
    const o = /** @type {any} */ (err);
    let detail = formatSupabaseUserMessage(err);
    if (!detail && typeof o?.details === "string" && o.details.trim()) detail = o.details.trim();
    if (!detail) {
      return "Supabase save failed — check project URL, anon key, and network. If the DB is new, run pending migrations (see supabase/migrations).";
    }
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(detail)) {
      const tail = detail.length > 90 ? `${detail.slice(0, 87)}…` : detail;
      return (
        `Supabase unreachable (${tail}). ` +
        `Net::ERR_FAILED / HTTP 522 usually means the edge timed out, the project is paused, or a brief outage — not a missing CORS rule in this app (failed responses often omit Access-Control-Allow-Origin, so DevTools shows a misleading CORS message). ` +
        `Open the Supabase dashboard: resume the project if needed, confirm URL and anon key, then retry. See https://status.supabase.com for incidents.`
      );
    }
    if (/row-level security|violates row-level security policy|permission denied/i.test(detail)) {
      return (
        `Supabase save failed: ${detail}. ` +
        "Your current DB policy likely allows wardrobe_items SELECT only. " +
        "Allow INSERT/UPDATE for the role used by this app (anon/authenticated), or save through a server/Edge Function using service role."
      );
    }
    const d = detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
    let msg = `Supabase save failed: ${d}`;
    if (/schema cache/i.test(detail) && /color_code|colour_code|\bcolour\b|\bcolor\b/i.test(detail)) {
      msg +=
        " Run migration `20260613180000_wardrobe_items_ensure_british_colour_columns.sql` if `colour_code` is missing in Postgres; then SQL: NOTIFY pgrst, 'reload schema'; or wait ~1 min.";
    }
    return msg;
  }

  function toastCloudDeleteFailure(step, err) {
    const detail = formatSupabaseUserMessage(err);
    const hint =
      step === "unlink"
        ? "Unlink failed"
        : step === "row"
          ? "Delete row failed"
          : "Delete failed";
    const max = 220;
    const tail = detail ? `: ${detail}` : "";
    const msg = `${hint}${tail}`.slice(0, max);
    showToast(msg);
    console.warn(`deleteWardrobePieceFromBrowser (${step})`, err);
  }

  /**
   * Remove a wardrobe piece via Supabase only: unlink outfit refs, delete referenced Storage objects, DELETE
   * the `wardrobe_items` row. If Supabase is not ready, refuses (no offline delete).
   * The id is always saved to `archive_hidden_ids` so `syncMissingRowsToSupabase` never re-upserts seed/file rows with the same id
   * (critical when the catalogue comes only from Supabase). With seed-merge catalogue, hidden ids still suppress resurgence after reload.
   */
  async function deleteWardrobePieceFromBrowser(id) {
    const sid = String(id);
    if (!sid) return;

    if (!isSupabaseReady()) {
      showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
      return;
    }

    const isCustom = sid.startsWith("custom-");

    currentOutfitSlots = currentOutfitSlots.filter((s) => s.itemId !== sid);

    const prevCloud = cloudBackedCustomItems.slice();
    cloudBackedCustomItems = cloudBackedCustomItems.filter((x) => String(x.id) !== sid);

    try {
      const item = itemById.get(sid) || items.find((x) => String(x?.id ?? "") === String(sid));

      try {
        await unlinkCloudOutfitsReferencingWardrobeItem(sid);
      } catch (e1) {
        cloudBackedCustomItems = prevCloud;
        toastCloudDeleteFailure("unlink", e1);
        return;
      }
      try {
        await deleteWardrobeItemImagesFromCloud(item);
      } catch (eImg) {
        console.warn("Image cleanup before delete (continuing):", eImg);
      }
      const { error } = await supabaseClient.from(WARDROBE_TABLE).delete().eq("id", sid);
      if (error) throw error;

      wardrobeBase = wardrobeBase.filter((row) => String(row?.id ?? "") !== sid);

      if (isCustom) {
        stripCustomIdsFromLocalStorage([sid]);
        await mirrorLocalCustomItemsToProjectFile();
      }

      try {
        const all = loadArchiveOverrides();
        if (Object.prototype.hasOwnProperty.call(all, sid)) {
          delete all[sid];
          await saveArchiveOverrides(all);
        }
      } catch (e) {
        console.warn(e);
      }

      const hidden = loadArchiveHiddenIds();
      hidden.add(sid);
      await saveArchiveHiddenIds(hidden);
    } catch (e) {
      cloudBackedCustomItems = prevCloud;
      try {
        if (useCloudOutfits && isSupabaseReady()) {
          const api = await import("./js/supabase-client.js");
          const res = await api.fetchOutfits(supabaseClient);
          if (res.ok) {
            savedOutfits = (res.outfits || [])
              .map((o) => normalizeSavedOutfitRecord(o))
              .filter(Boolean);
          }
        }
      } catch (e2) {
        console.warn("fetchOutfits after delete failure", e2);
      }
      toastCloudDeleteFailure("row", e);
      return;
    }

    mergeWardrobeFromSources();

    if (document.getElementById("grid")) {
      initFilters();
      onOutfitChange();
      renderSavedOutfits();
    }

    showToast("Piece removed.");

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
    const season = normalizeStoredItemSeason(document.getElementById("add-item-season")?.value?.trim() || "");
    const colourVal = document.getElementById("add-item-colour")?.value?.trim() || "";
    const colourCodeInput = document.getElementById("add-item-colour-code")?.value?.trim() || "";
    const fabric = document.getElementById("add-item-fabric")?.value?.trim() || "";
    const weight = document.getElementById("add-item-weight")?.value?.trim() || "";
    const size = document.getElementById("add-item-size")?.value?.trim() || "";
    const mRows = readMeasurementRowsFromEditor(document.getElementById("add-item-measured-dims-block"));
    const measureUnit = parseMeasurementUnitInput(document.getElementById("add-item-measurement-unit")?.value);
    const measuredDimensions = mRows.length ? measurementRowsToSummaryString(mRows, measureUnit) : "";
    const purchaseDate = joinPurchaseDateFromForm(
      document.getElementById("add-item-purchase-date")?.value?.trim() || "",
      document.getElementById("add-item-purchase-date-note")?.value?.trim() || ""
    );
    const priceRaw = document.getElementById("add-item-price")?.value?.trim() || "";
    const priceCur =
      String(document.getElementById("add-item-price-currency")?.value ?? "TWD").trim().toUpperCase() || "TWD";
    let priceVal = parsePriceAmountFlexible(priceRaw);
    if (!Number.isFinite(priceVal) || priceVal < 0) priceVal = null;
    const notes = document.getElementById("add-item-notes")?.value?.trim() || "";
    const photosInput = document.getElementById("add-item-photos");
    const photoFiles = photosInput?.files ? Array.from(photosInput.files) : [];
    const file = photoFiles[0];
    const galleryFiles = photoFiles.slice(1);
    if (!brand || !name || !browseSlot) {
      showAddItemFormMsg("Fill required fields (brand, name, section).", true);
      return;
    }
    if (itemSlot({ category, season: season || "" }) !== browseSlot) {
      showAddItemFormMsg("Pick a record type that fits the selected section.", true);
      return;
    }
    if (!isSupabaseReady()) {
      showAddItemFormMsg(CLOUD_WRITE_REQUIRED_MESSAGE, true);
      showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
      return;
    }

    if (file || galleryFiles.length) showAddItemFormMsg("Processing images…", false);

    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `custom-${crypto.randomUUID()}`
        : `custom-${Date.now()}`;

    let dataUrl = "";
    if (file) {
      try {
        dataUrl = isSupabaseReady()
          ? await uploadWardrobeImageFileToCloud(file, newId, { type: "main_cover" })
          : await fileToStorageDataUrl(file);
      } catch (err) {
        console.warn(err);
        showAddItemFormMsg(messageForCloudUploadFailure("main cover", err), true);
        return;
      }
    }
    const MAX_GALLERY = 12;
    /** @type {string[]} */
    const galleryUrls = [];
    const gallerySlice = galleryFiles.slice(0, MAX_GALLERY);
    for (let gi = 0; gi < gallerySlice.length; gi++) {
      const gf = gallerySlice[gi];
      try {
        galleryUrls.push(
          isSupabaseReady()
            ? await uploadWardrobeImageFileToCloud(gf, newId, { type: "main_gallery", index: gi + 1 })
            : await fileToStorageDataUrl(gf, { preferJpeg: true })
        );
      } catch (err) {
        console.warn(err);
        showAddItemFormMsg(messageForCloudUploadFailure(`gallery image #${gi + 1}`, err), true);
      }
    }

    const galleryDeduped = galleryUrls.filter((u) => u && u !== dataUrl);

    const colourTrim = String(colourVal ?? "").trim();
    const colourCodeTrim = String(colourCodeInput ?? "").trim();
    const basicPick = normalizeStoredBasicColourKey(document.getElementById("add-item-basic-colour")?.value ?? "");
    const newItem = {
      id: newId,
      brand,
      name,
      section: "",
      category,
      season,
      colour: colourTrim,
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
    if (colourCodeTrim) newItem.colourCode = colourCodeTrim;
    if (basicPick) newItem.basicColour = basicPick;
    if (priceVal != null) {
      newItem.price = priceVal;
      newItem.priceCurrency = PRICE_CURRENCY_CODES.includes(priceCur) ? priceCur : "TWD";
    }
    if (mRows.length) {
      newItem.measurementRows = mRows;
      newItem.measurementUnit = measureUnit;
      newItem.metadata = {
        ...(newItem.metadata && typeof newItem.metadata === "object" ? newItem.metadata : {}),
        measurementRows: mRows,
        measurementUnit: measureUnit,
      };
    }

    try {
      const savedCloudItem = await saveWardrobeItemToCloud(newItem);
      stampWardrobeItemMediaNonce(savedCloudItem);
      upsertWardrobeBaseRowInMemory(savedCloudItem);
      cloudBackedCustomItems = [
        savedCloudItem,
        ...cloudBackedCustomItems.filter((x) => String(x.id) !== String(savedCloudItem.id)),
      ];

      mergeWardrobeFromSources();
      initFilters();
      renderGrid();
      form.reset();
      resetAddItemMeasurementBlock();
      showAddItemFormMsg("Saved to Supabase.", false);
      showToast("Saved to cloud.");
      document.getElementById("add-item-dialog")?.close();
      return;
    } catch (err) {
      console.warn(err);
      showAddItemFormMsg(`Cloud row save failed: ${messageForFailedWardrobeUpsert(err)}`, true);
      return;
    }
  }

  /**
   * Clone any visible piece into a new `custom-*` row (same image URLs / data; name gets " (copy)").
   * Archive seed rows become a new custom entry; does not change seed files.
   */
  function buildDuplicateCustomItem(src) {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `custom-${crypto.randomUUID()}`
        : `custom-${Date.now()}`;
    const nameBase = String(src?.name ?? "").trim();
    const dupName = nameBase ? `${nameBase} (copy)` : "Untitled (copy)";

    const main = String(src?.image ?? "").trim();
    const galleryDeduped = dedupeGalleryUrls(main, itemGalleryList(src), 12);

    /** @type {Record<string, unknown>} */
    const dup = {
      id,
      brand: String(src?.brand ?? "").trim(),
      name: dupName,
      section: String(src?.section ?? "").trim(),
      category: String(src?.category ?? "").trim(),
      season: normalizeStoredItemSeason(src?.season),
      colour: String(src?.colour ?? src?.color ?? "").trim(),
      fabric: String(src?.fabric ?? "").trim(),
      weight: String(src?.weight ?? "").trim(),
      size: String(src?.size ?? "").trim(),
      measuredDimensions: String(src?.measuredDimensions ?? src?.measured_dimensions ?? "").trim(),
      purchaseDate: String(src?.purchaseDate ?? src?.purchase_date ?? "").trim(),
      image: main,
      notes: String(src?.notes ?? "").trim(),
      pillar: String(src?.pillar ?? "").trim(),
    };
    if (Number.isFinite(Number(src?.price))) {
      dup.price = Number(src.price);
      dup.priceCurrency = PRICE_CURRENCY_CODES.includes(String(src?.priceCurrency ?? "").trim().toUpperCase())
        ? String(src.priceCurrency).trim().toUpperCase()
        : "TWD";
    }
    if (galleryDeduped.length) dup.gallery = galleryDeduped;

    const cc = itemColourCode(src);
    if (cc) dup.colourCode = cc;
    const bcTop = normalizeStoredBasicColourKey(
      src?.basicColour ??
        (src?.metadata && typeof src.metadata === "object" && !Array.isArray(src.metadata)
          ? /** @type {any} */ (src.metadata).basicColour
          : "")
    );
    if (bcTop) dup.basicColour = bcTop;

    const mr = getMeasurementRows(src);
    const mu = getMeasurementUnit(src);
    if (mr.length) {
      dup.measurementRows = mr;
      dup.measurementUnit = mu;
      dup.metadata =
        src?.metadata && typeof src.metadata === "object" && !Array.isArray(src.metadata)
          ? { ...src.metadata, measurementRows: mr, measurementUnit: mu }
          : { measurementRows: mr, measurementUnit: mu };
    } else if (src?.metadata && typeof src.metadata === "object" && !Array.isArray(src.metadata)) {
      dup.metadata = { ...src.metadata };
    }

    const vars = getItemColourVariants(src);
    if (vars?.length) {
      dup.colourVariants = vars.map((v) => {
        const vim = String(v.image ?? "").trim();
        const g = dedupeGalleryUrls(vim, Array.isArray(v.gallery) ? v.gallery : [], 12);
        const col = String(v.colour ?? v.color ?? "").trim();
        const bv = normalizeStoredBasicColourKey(v.basicColour);
        return {
          key: String(v.key ?? "").trim(),
          label: String(v.label ?? "").trim(),
          colour: col,
          colourCode: String(v.colourCode ?? "").trim(),
          image: vim,
          previewImage: String(v.previewImage ?? "").trim(),
          notes: String(v.notes ?? "").trim(),
          gallery: g,
          ...(bv ? { basicColour: bv } : {}),
        };
      });
    }

    return /** @type {typeof src} */ (dup);
  }

  /** Insert one new custom row using the same paths as “Add a piece” (Supabase vs localStorage + optional shrink). */
  async function persistNewCustomItemRow(row) {
    if (!isSupabaseReady()) throw new Error(CLOUD_WRITE_REQUIRED_MESSAGE);
    const saved = await saveWardrobeItemToCloud(row);
    stampWardrobeItemMediaNonce(saved);
    upsertWardrobeBaseRowInMemory(saved);
    cloudBackedCustomItems = [
      saved,
      ...cloudBackedCustomItems.filter((x) => String(x.id) !== String(saved.id)),
    ];
    mergeWardrobeFromSources();
    return String(saved.id);
  }

  function initAddItemForm() {
    const form = document.getElementById("add-item-form");
    const cat = document.getElementById("add-item-category");
    const recordSel = document.getElementById("add-item-record-type");
    const photosInput = document.getElementById("add-item-photos");
    const preview = document.getElementById("add-item-preview");
    if (!form || !cat || !recordSel) return;
    cat.innerHTML = "";
    for (const c of SLOT_OPTIONS) {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = categoryDisplayLabel(c);
      cat.appendChild(o);
    }

    function syncAddItemRecordTypes(preferRecordType = "") {
      fillItemEditRecordTypeSelect(recordSel, cat.value, preferRecordType);
    }

    function applyCurrentBrowseContextToAddItemForm() {
      const slot = String(categoryNavFilter ?? "").trim();
      if (!slot || !SLOT_OPTIONS.includes(slot)) {
        syncAddItemRecordTypes("");
        return;
      }
      cat.value = slot;
      const prefer = String(subcategoryFilter ?? "").trim();
      syncAddItemRecordTypes(prefer);
    }
    cat.addEventListener("change", () => syncAddItemRecordTypes(""));
    syncAddItemRecordTypes();

    photosInput?.addEventListener("change", () => {
      const f = photosInput.files?.[0];
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
        resetAddItemMeasurementBlock();
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
      applyCurrentBrowseContextToAddItemForm();
      try {
        addDlg.showModal();
      } catch {
        /* already open */
      }
      openAdd?.setAttribute("aria-expanded", "true");
      queueMicrotask(() => {
        document.getElementById("add-item-brand")?.focus();
        resetAddItemMeasurementBlock();
      });
    });
    closeAdd?.addEventListener("click", () => addDlg?.close());
    addDlg?.addEventListener("click", (e) => {
      if (e.target === addDlg) addDlg.close();
    });

    document.getElementById("add-item-export-custom-json")?.addEventListener("click", () => {
      downloadCustomItemsJsonForRepo();
    });
    document.getElementById("add-item-sync-custom-to-project")?.addEventListener("click", () => {
      void pullBrowserCustomItemsIntoProjectFile();
    });

    resetAddItemMeasurementBlock();
  }

  function createCard(item) {
    const variants = getItemColourVariants(item);
    const inOutfit = outfitIdSet().has(item.id);
    const allVariantKeys =
      variants?.map((v) => v.key) ??
      [];
    const takenKeys = new Set(
      currentOutfitSlots.filter((s) => s.itemId === item.id && s.colourKey).map((s) => String(s.colourKey))
    );
    const everyVariantTaken =
      Boolean(variants?.length) && allVariantKeys.length > 0 && allVariantKeys.every((k) => takenKeys.has(k));
    const singleTaken = !variants?.length && outfitSlotKeySet().has(outfitSlotKey({ itemId: item.id }));

    const slotLab = itemSlot(item);
    const recKey = recordCategoryForDrill(item, slotLab);

    const colourBucket = getFilters().basicColour;
    const variantKeyForHero =
      variants?.length && colourBucket ? firstVariantKeyMatchingBasicColourBucket(item, colourBucket) : "";
    const cardCoverItem =
      variantKeyForHero ? itemProjectionForOutfitSlot(item, { itemId: String(item.id), colourKey: variantKeyForHero }) : item;

    const article = document.createElement("article");
    const outfitHighlight = inOutfit && itemEligibleForOutfit(item);
    article.className = "card" + (outfitHighlight ? " card--in-outfit" : "");
    article.setAttribute("role", "listitem");
    article.dataset.itemId = String(item.id);

    const media = document.createElement("div");
    media.className = "card__media card__media--opens-detail";
    if (variants?.length) media.classList.add("card__media--variant-colours");

    const img = document.createElement("img");
    img.className = "card__media-img";
    img.alt = imageAltForItem(cardCoverItem);
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    wireCoverImageWithFallbacks(img, cardCoverItem, {
      host: media,
      onResolved(url) {
        const ti = media.querySelector(".card__gallery-strip .card__gallery-thumb.is-active img");
        if (ti) ti.src = url;
      },
    });

    media.appendChild(img);

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
        quick.title = everyVariantTaken ? "Every colour is already in this outfit." : "Add a colour to this outfit";
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
      if (ev.target.closest(".card__swatch--pick")) return;
      if (ev.target.closest(".card__swatch-block--media-overlay")) return;
      if (ev.target.closest(".card__gallery-thumb")) return;
      if (ev.target.closest(".card__season-chip")) return;
      openCardDetail(ev);
    });

    const body = document.createElement("div");
    body.className = "card__body";

    const title = document.createElement("h2");
    title.className = "card__title card__title--opens-detail";
    title.textContent = displayNameWithoutLeadingColour(item);
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

    mountVariantSwatchStrip(media, item, {
      outfitPick: true,
      heroImg: img,
      heroHost: media,
      showHeroGallery: false,
      gridCaption: variants?.length > 1 ? "compact" : undefined,
      gridMediaOverlay: true,
      heroInitialColourKey: variantKeyForHero || undefined,
    });

    const specs = document.createElement("ul");
    specs.className = "card__specs";
    for (const part of specParts(item, { forGridCard: true })) {
      const li = document.createElement("li");
      li.textContent = part;
      specs.appendChild(li);
    }
    if (item.size) {
      const li = document.createElement("li");
      li.textContent = String(item.size).trim();
      specs.appendChild(li);
    }
    const showPurchaseOnCard = archiveSortMode === "date-asc" || archiveSortMode === "date-desc";
    if (showPurchaseOnCard && item.purchaseDate) {
      const li = document.createElement("li");
      li.textContent = formatPurchaseDateForDisplay(item.purchaseDate);
      specs.appendChild(li);
    }

    if (specs.children.length) body.appendChild(specs);

    {
      const priceBrief = formattedArchivePriceLine(item, { brief: true });
      if (priceBrief) {
        const priceEl = document.createElement("p");
        priceEl.className = "card__price-subtle";
        priceEl.textContent = priceBrief;
        const priceFull = formattedArchivePriceLine(item);
        if (priceFull !== priceBrief) priceEl.title = priceFull;
        body.appendChild(priceEl);
      }
    }

    article.appendChild(media);
    article.appendChild(body);
    {
      const summary = buildCardNativeTitleSummary(item);
      if (summary) article.title = summary;
    }
    return article;
  }

  /** Structural key for main grid: invalidates when wardrobe, filters, sort, or currency changes. */
  let lastGridStructuralKey = "";

  /** Outfit slots key: when only this changes, patch card UI in place. */
  let lastGridOutfitKey = "";

  function buildArchiveGridStructuralKey(sorted, searchNorm) {
    const ids = sorted.map((x) => String(x.id)).join("\x1f");
    return [
      seasonNavFilter,
      categoryNavFilter,
      String(subcategoryFilter ?? "").trim(),
      searchNorm,
      basicColourFilter,
      archiveSortMode,
      archiveDisplayCurrency,
      String(wardrobeRevision),
      String(sorted.length),
      ids,
    ].join("\x1e");
  }

  function buildArchiveGridOutfitKey() {
    return currentOutfitSlots.map((s) => `${s.itemId}\x1d${s.colourKey ?? ""}`).join("\x1c");
  }

  /** @returns {boolean} false if DOM order/id mismatch — caller should full-rebuild grid. */
  function syncArchiveGridCardsOutfitUi(sorted) {
    if (!els.grid) return false;
    const rows = els.grid.querySelectorAll(":scope > .card[data-item-id]");
    if (rows.length !== sorted.length) return false;
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const article = rows[i];
      if (!(article instanceof HTMLElement)) return false;
      if (article.dataset.itemId !== String(item.id)) return false;

      const inOutfit = outfitIdSet().has(item.id);
      const outfitHighlight = inOutfit && itemEligibleForOutfit(item);
      article.classList.toggle("card--in-outfit", Boolean(outfitHighlight));

      const quick = article.querySelector(".card__quick-outfit");
      if (!quick) continue;

      const variants = getItemColourVariants(item);
      const allVariantKeys = variants?.map((v) => v.key) ?? [];
      const takenKeys = new Set(
        currentOutfitSlots.filter((s) => s.itemId === item.id && s.colourKey).map((s) => String(s.colourKey))
      );
      const everyVariantTaken =
        Boolean(variants?.length) && allVariantKeys.length > 0 && allVariantKeys.every((k) => takenKeys.has(k));
      const singleTaken = !variants?.length && outfitSlotKeySet().has(outfitSlotKey({ itemId: item.id }));

      const blocked = everyVariantTaken || singleTaken;
      quick.textContent = blocked ? "✓" : "+";
      /** @type {HTMLButtonElement} */ (quick).disabled = Boolean(blocked);
      if (variants?.length) {
        quick.title = everyVariantTaken ? "Every colour is already in this outfit." : "Add a colour to this outfit";
      } else {
        quick.title = singleTaken ? "Already in this outfit." : "Add to outfit";
      }
    }
    return true;
  }

  function isCustomWardrobeItem(item) {
    return item && typeof item.id === "string" && item.id.startsWith("custom-");
  }

  function compareGridItems(a, b) {
    if (archiveSortMode === "price-asc" || archiveSortMode === "price-desc") {
      const pa = priceSortComparableInDisplayCurrency(a);
      const pb = priceSortComparableInDisplayCurrency(b);
      if (pa == null && pb == null) return compareArchiveGridItems(a, b);
      if (pa == null) return 1;
      if (pb == null) return -1;
      const cmp = pa - pb;
      if (cmp !== 0) return archiveSortMode === "price-desc" ? -cmp : cmp;
      return compareArchiveGridItems(a, b);
    }
    if (archiveSortMode === "date-asc" || archiveSortMode === "date-desc") {
      const da = purchaseDateSortMs(a);
      const db = purchaseDateSortMs(b);
      if (da == null && db == null) return compareArchiveGridItems(a, b);
      if (da == null) return 1;
      if (db == null) return -1;
      const cmp = da - db;
      if (cmp !== 0) return archiveSortMode === "date-desc" ? -cmp : cmp;
      return compareArchiveGridItems(a, b);
    }
    return compareArchiveGridItems(a, b);
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
    const sorted = [...filtered].sort(compareGridItems);
    syncBasicColourFilterChipUi();
    syncCategoryFilterChip();
    syncColourFilterChip();
    syncSubcategoryFilterChip();
    const searchNorm = normalizeSearch(els.search?.value ?? "");
    const structuralKey = buildArchiveGridStructuralKey(sorted, searchNorm);
    const outfitKey = buildArchiveGridOutfitKey();

    if (structuralKey === lastGridStructuralKey && outfitKey === lastGridOutfitKey) {
      return;
    }

    const canPatchOutfitOnly =
      structuralKey === lastGridStructuralKey &&
      outfitKey !== lastGridOutfitKey &&
      els.grid.childElementCount === sorted.length;

    if (canPatchOutfitOnly && syncArchiveGridCardsOutfitUi(sorted)) {
      lastGridOutfitKey = outfitKey;
    } else {
      lastGridStructuralKey = structuralKey;
      lastGridOutfitKey = outfitKey;
      updateFilterSpendTotal(filtered);
      const frag = document.createDocumentFragment();
      for (const item of sorted) frag.appendChild(createCard(item));
      els.grid.replaceChildren(frag);
    }

    const n = sorted.length;
    const seasonalTotal = countItemsForCurrentSeasonTab();
    if (els.count) {
      if (narrowingFiltersActive()) {
        els.count.textContent =
          n === seasonalTotal
            ? `${n} piece${n === 1 ? "" : "s"}`
            : `${n} of ${seasonalTotal} piece${seasonalTotal === 1 ? "" : "s"}`;
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
          ? "Nothing matches that category, type, colour, or search on this season tab."
          : "Nothing matches that category, type, colour, or search."
        : onSeasonTab
          ? "No pieces on this season tab match."
          : "No pieces match.";
    }
    if (els.emptyReset) els.emptyReset.hidden = !narrowingFiltersActive();
    if (els.emptyWrap) els.emptyWrap.hidden = n > 0;
    els.grid.hidden = n === 0;
  }

  function updateFilterSpendTotal(filteredItems) {
    const el = els.spendTotal;
    if (!el) return;
    const total = sumPriceInDisplayCurrency(filteredItems);
    const prefix = narrowingFiltersActive() ? "Filtered spend" : "Visible spend";
    const reduce = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    if (!Number.isFinite(total)) {
      el.textContent = `${prefix}: ${formatMoneyInCurrency(0, archiveDisplayCurrency)}`;
      return;
    }

    const token = ++spendTotalAnimToken;
    if (spendTotalAnimRaf) cancelAnimationFrame(spendTotalAnimRaf);

    if (reduce) {
      spendTotalCurrentValue = total;
      el.textContent = `${prefix}: ${formatMoneyInCurrency(total, archiveDisplayCurrency)}`;
      return;
    }

    const start = spendTotalCurrentValue;
    const delta = total - start;
    const duration = 420;
    const t0 = performance.now();
    function step(now) {
      if (token !== spendTotalAnimToken) return;
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + delta * eased;
      el.textContent = `${prefix}: ${formatMoneyInCurrency(next, archiveDisplayCurrency)}`;
      if (p < 1) {
        spendTotalAnimRaf = requestAnimationFrame(step);
      } else {
        spendTotalCurrentValue = total;
        spendTotalAnimRaf = 0;
      }
    }
    spendTotalAnimRaf = requestAnimationFrame(step);
  }

  /** Search box: avoid rebuilding the whole grid on every keystroke (main-thread jank). */
  let searchGridDebounceTimer = null;

  function cancelSearchGridDebounce() {
    if (searchGridDebounceTimer != null) {
      clearTimeout(searchGridDebounceTimer);
      searchGridDebounceTimer = null;
    }
  }

  function syncFilterSearchClearVisibility() {
    const btn = els.searchClear;
    if (btn) {
      const q = String(els.search?.value ?? "").trim();
      btn.hidden = !q;
    }
    syncSearchKeywordChip();
  }

  function scheduleRenderGridFromSearchInput() {
    syncFilterSearchClearVisibility();
    if (searchGridDebounceTimer != null) clearTimeout(searchGridDebounceTimer);
    searchGridDebounceTimer = setTimeout(() => {
      searchGridDebounceTimer = null;
      renderGrid();
    }, 180);
  }

  function flushSearchGridDebounceIfPending() {
    if (searchGridDebounceTimer == null) return;
    cancelSearchGridDebounce();
    renderGrid();
  }

  let dragFromIndex = null;

  function syncOutfitBuilderPanel() {
    const dock = document.getElementById("outfit-dock");
    if (!dock) return;
    dock.classList.toggle("outfit-dock--builder-open", currentOutfitSlots.length > 0);
    const shouldShow = outfitDockUserToggled || currentOutfitSlots.length > 0;
    dock.hidden = !shouldShow;
    const savedBtn = document.getElementById("site-header-saved-toggle");
    if (savedBtn) {
      savedBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
      savedBtn.setAttribute("aria-label", shouldShow ? "Close saved outfits" : "Open saved outfits");
    }
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
      const variant = getItemColourVariants(item)?.find((v) => v.key === pieceSlot.colourKey);

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
      nm.textContent = displayNameWithoutLeadingColour(item);
      meta.appendChild(b);
      meta.appendChild(nm);
      if (variant) {
        const col = document.createElement("p");
        col.className = "outfit-slot__colour";
        col.textContent = variantCaptionText(variant) || variant.label;
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
   * @param {{ key?: string, label?: string, colour?: string, colourCode?: string, basicColour?: string, image?: string, previewImage?: string, gallery?: string[], notes?: string }} data
   */
  function appendVariantEditorRow(listEl, data) {
    const key = String(data.key ?? "").trim() || newEditorVariantKey();
    const label = String(data.label ?? "").trim();
    const colourVal = String(data.colour ?? data.color ?? "").trim();
    const colourCode = String(data.colourCode ?? data.colour_code ?? data.color_code ?? "").trim();
    const image = String(data.image ?? "").trim();
    const previewImg = String(data.previewImage ?? "").trim();
    const notes = data.notes != null ? String(data.notes) : "";
    const fs = document.createElement("fieldset");
    fs.className = "item-edit-variant-row";
    if (image) fs.setAttribute("data-prev-image", image);
    if (previewImg) fs.setAttribute("data-prev-preview", previewImg);

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

    const colourIn = document.createElement("input");
    colourIn.type = "text";
    colourIn.className = "item-edit-variant-colour";
    colourIn.maxLength = 80;
    colourIn.placeholder = "Colour name";
    colourIn.value = colourVal;

    const codeIn = document.createElement("input");
    codeIn.type = "text";
    codeIn.className = "item-edit-variant-colour-code";
    codeIn.maxLength = 80;
    codeIn.placeholder = "Colour code (#hex, SKU…)";
    codeIn.value = colourCode;

    const basicSel = document.createElement("select");
    basicSel.className = "item-edit-variant-basic-colour";
    basicSel.setAttribute("aria-label", "Broad colour (archive filter)");
    fillBasicColourSelectOptions(basicSel, String(data.basicColour ?? "").trim());

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

    const previewLab = document.createElement("label");
    previewLab.className = "item-edit-variant-preview-wrap";
    const previewSpan = document.createElement("span");
    previewSpan.className = "item-edit-variant-cover-label";
    previewSpan.textContent = previewImg
      ? "Replace colour preview (optional, swatch only)"
      : "Colour preview (optional — if empty, strip uses hex from colour code / name, then the code text)";
    const previewIn = document.createElement("input");
    previewIn.type = "file";
    previewIn.className = "item-edit-variant-preview";
    previewIn.accept = "image/*";
    previewIn.addEventListener("change", () => {
      trimCoverFileInputToOne(previewIn);
      delete fs.dataset.previewRemoved;
    });
    previewLab.appendChild(previewSpan);
    previewLab.appendChild(previewIn);

    const rmPrev = document.createElement("button");
    rmPrev.type = "button";
    rmPrev.className = "btn btn--small btn--ghost item-edit-variant-preview-remove";
    rmPrev.textContent = "Remove colour preview";
    rmPrev.hidden = !previewImg;
    rmPrev.addEventListener("click", () => {
      fs.dataset.previewRemoved = "1";
      fs.removeAttribute("data-prev-preview");
      previewSpan.textContent = "Colour preview (optional — if empty, strip uses hex from colour code / name, then the code text)";
      rmPrev.hidden = true;
      previewIn.value = "";
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
    fs.appendChild(colourIn);
    fs.appendChild(codeIn);
    fs.appendChild(basicSel);
    fs.appendChild(notesIn);
    fs.appendChild(coverLab);
    fs.appendChild(rmCov);
    fs.appendChild(previewLab);
    fs.appendChild(rmPrev);
    if (varGal.children.length) fs.appendChild(varGalWrap);
    fs.appendChild(rm);
    listEl.appendChild(fs);
    syncVariantRemoveButtons(listEl);
  }

  /**
   * @param {HTMLFormElement} form
   * @param {object} prev
   * @param {(t: string, err?: boolean) => void} setMsg
   * @param {{ cloudItemId?: string }} [opts]
   * @returns {Promise<{ key: string, label: string, colour: string, colourCode: string, image: string, previewImage?: string, gallery: string[], notes: string }[] | null>}
   */
  async function gatherColourVariantsFromEditForm(form, prev, setMsg, opts = {}) {
    const wrap = form.querySelector("#item-edit-variants-wrap");
    if (!wrap || wrap.dataset.active !== "1") return null;
    const listEl = form.querySelector("#item-edit-variants-list");
    if (!listEl) return null;
    const rawRows = [...listEl.querySelectorAll(".item-edit-variant-row")];
    const rows = rawRows.filter((row) => {
      const lab = row.querySelector(".item-edit-variant-label")?.value?.trim() || "";
      const col = row.querySelector(".item-edit-variant-colour")?.value?.trim() || "";
      const code = row.querySelector(".item-edit-variant-colour-code")?.value?.trim() || "";
      const nts = row.querySelector(".item-edit-variant-notes")?.value?.trim() || "";
      const prevIm = row.getAttribute("data-prev-image")?.trim() || "";
      const prevPr = row.getAttribute("data-prev-preview")?.trim() || "";
      const coverIn = row.querySelector(".item-edit-variant-cover");
      const file = coverIn?.files?.[0];
      const previewIn = row.querySelector(".item-edit-variant-preview");
      const previewFile = previewIn?.files?.[0];
      const gWrap = row.querySelector(".item-edit-variant-gallery-existing");
      const hasGal = Boolean(gWrap?.querySelector(".item-edit-gallery-row[data-gallery-url]"));
      return Boolean(lab || col || code || nts || prevIm || prevPr || file || previewFile || hasGal);
    });
    if (!rows.length) {
      setMsg("Add at least one colour row with a cover image.", true);
      return null;
    }
    /** @type {{ key: string, label: string, colour: string, colourCode: string, image: string, previewImage?: string, gallery: string[], notes: string }[]} */
    const built = [];
    const prevVars = getItemColourVariants(prev) || [];
    for (const row of rows) {
      const key = row.querySelector(".item-edit-variant-key")?.value?.trim() || "";
      const label = row.querySelector(".item-edit-variant-label")?.value?.trim() || "";
      const colourTxt = row.querySelector(".item-edit-variant-colour")?.value?.trim() || "";
      const colourCode = row.querySelector(".item-edit-variant-colour-code")?.value?.trim() || "";
      const notes = row.querySelector(".item-edit-variant-notes")?.value?.trim() || "";
      const coverIn = row.querySelector(".item-edit-variant-cover");
      trimCoverFileInputToOne(/** @type {HTMLInputElement | null} */ (coverIn));
      const file = coverIn?.files?.[0];
      const prevIm = row.getAttribute("data-prev-image")?.trim() || "";
      let image = prevIm;
      if (file) {
        try {
          const cloudId = opts?.cloudItemId && isSupabaseReady() ? String(opts.cloudItemId).trim() : "";
          image = cloudId
            ? await uploadWardrobeImageFileToCloud(file, cloudId, { type: "variant_cover", key })
            : await fileToStorageDataUrl(file);
        } catch (err) {
          console.warn(err);
          setMsg(messageForCloudUploadFailure(`variant cover (${key || "unknown key"})`, err), true);
          return null;
        }
      }
      if (!key) {
        setMsg("Each colour row needs an internal key (reload and try again).", true);
        return null;
      }
      const outLabel = (label || colourTxt).trim();
      if (!outLabel) {
        setMsg(
          "Each row needs a label or a colour name — fill at least one per row (used when picking a colour for outfits).",
          true
        );
        return null;
      }
      if (!image) {
        setMsg("Each row needs a cover image — upload one, or keep an existing row’s image.", true);
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

      const previewRemoved = row.dataset.previewRemoved === "1";
      const previewInEl = row.querySelector(".item-edit-variant-preview");
      trimCoverFileInputToOne(/** @type {HTMLInputElement | null} */ (previewInEl));
      const previewFile2 = previewInEl?.files?.[0];
      const prevPr = row.getAttribute("data-prev-preview")?.trim() || "";
      let previewImage = "";
      if (!previewRemoved) {
        previewImage = prevPr;
        if (previewFile2) {
          try {
            const cloudId = opts?.cloudItemId && isSupabaseReady() ? String(opts.cloudItemId).trim() : "";
            previewImage = cloudId
              ? await uploadWardrobeImageFileToCloud(previewFile2, cloudId, { type: "variant_preview", key })
              : await fileToStorageDataUrl(previewFile2);
          } catch (err) {
            console.warn(err);
            setMsg(messageForCloudUploadFailure(`variant preview (${key || "unknown key"})`, err), true);
            return null;
          }
        } else if (!previewImage && match) {
          previewImage = String(match.previewImage ?? "").trim();
        }
      }

      const rowObj = {
        key,
        label: label.trim() || outLabel,
        colour: colourTxt.trim() || outLabel,
        colourCode: colourCode.trim(),
        image,
        gallery,
        notes,
      };
      if (previewImage) rowObj.previewImage = previewImage;
      const basicV = normalizeStoredBasicColourKey(
        /** @type {HTMLSelectElement | null} */ (row.querySelector(".item-edit-variant-basic-colour"))?.value ?? ""
      );
      if (basicV) rowObj.basicColour = basicV;
      built.push(rowObj);
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
    let keepFinalWarningMessage = false;

    const id = detailItemId;
    if (!id) return;
    const prev = itemById.get(id);
    if (!prev) return;
    const isCustom = String(id).startsWith("custom-");
    if (!isSupabaseReady()) {
      setMsg(CLOUD_WRITE_REQUIRED_MESSAGE, true);
      showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
      return;
    }

    const brand = form.querySelector("#item-edit-brand")?.value?.trim() || "";
    const name = form.querySelector("#item-edit-name")?.value?.trim() || "";
    const browseSlot = form.querySelector("#item-edit-browse-slot")?.value || "";
    const recordPick = form.querySelector("#item-edit-record-type")?.value?.trim() ?? "";
    const category = recordPick || defaultRecordCategoryForSlot(browseSlot);
    const season = normalizeStoredItemSeason(
      form.querySelector("#item-edit-season")?.value?.trim() || String(prev.season ?? "").trim()
    );
    const fabric = form.querySelector("#item-edit-fabric")?.value?.trim() || "";
    const weight = form.querySelector("#item-edit-weight")?.value?.trim() || "";
    const size = form.querySelector("#item-edit-size")?.value?.trim() || "";
    const measHost = form.querySelector("#item-edit-measured-dims-block");
    const mRows = readMeasurementRowsFromEditor(measHost instanceof HTMLElement ? measHost : null);
    const measureUnit = parseMeasurementUnitInput(form.querySelector("#item-edit-measurement-unit")?.value);
    const measuredDimensions = mRows.length ? measurementRowsToSummaryString(mRows, measureUnit) : "";
    const purchaseDate = joinPurchaseDateFromForm(
      form.querySelector("#item-edit-purchase-date")?.value?.trim() || "",
      form.querySelector("#item-edit-purchase-date-note")?.value?.trim() || ""
    );
    const priceRaw = form.querySelector("#item-edit-price")?.value?.trim() || "";
    const priceCur = String(form.querySelector("#item-edit-price-currency")?.value ?? "TWD").trim().toUpperCase() || "TWD";
    let priceVal = parsePriceAmountFlexible(priceRaw);
    if (!Number.isFinite(priceVal) || priceVal < 0) priceVal = null;
    const notes = form.querySelector("#item-edit-notes")?.value?.trim() || "";
    const basicSel = /** @type {HTMLSelectElement | null} */ (form.querySelector("#item-edit-basic-colour"));
    const basicPickSingle = normalizeStoredBasicColourKey(basicSel?.value ?? "");

    const variantsMode = itemEditVariantsActive(form);
    /** @type {{ key: string, label: string, colour: string, colourCode: string, image: string, previewImage?: string, gallery: string[], notes: string }[] | null} */
    let colourVariantsBuilt = null;
    if (variantsMode) {
      setMsg("Processing colour images…", false);
      colourVariantsBuilt = await gatherColourVariantsFromEditForm(form, prev, setMsg, { cloudItemId: id });
      if (colourVariantsBuilt == null) return;
    }

    const primaryColour =
      variantsMode && colourVariantsBuilt?.length
        ? String(colourVariantsBuilt[0].colour ?? colourVariantsBuilt[0].label ?? "").trim()
        : form.querySelector("#item-edit-colour")?.value?.trim() || "";

    const colourCode =
      variantsMode && colourVariantsBuilt?.length
        ? String(colourVariantsBuilt[0].colourCode ?? "").trim()
        : form.querySelector("#item-edit-colour-code")?.value?.trim() || "";

    if (!brand || !name || !browseSlot) {
      setMsg("Brand, name, and section are required.", true);
      return;
    }
    const slotProbe = {
      ...prev,
      category,
      season,
    };
    if (itemSlot(slotProbe) !== browseSlot) {
      setMsg(
        'That record type does not fit the chosen section — pick one of the types listed under Record type.',
        true
      );
      return;
    }

    let image = String(prev.image ?? "").trim();
    if (!(variantsMode && colourVariantsBuilt?.length)) {
      const stripCover = form.querySelector("#item-edit-remove-cover")?.value === "1";
      const coverEl = /** @type {HTMLInputElement | null} */ (form.querySelector("#item-edit-cover"));
      trimCoverFileInputToOne(coverEl);
      const coverFile = coverEl?.files?.[0];
      if (coverFile) {
        setMsg("Processing images…", false);
        try {
          image = isSupabaseReady()
            ? await uploadWardrobeImageFileToCloud(coverFile, id, { type: "main_cover" })
            : await fileToStorageDataUrl(coverFile);
        } catch (err) {
          console.warn(err);
          setMsg(
            `${messageForCloudUploadFailure("main cover", err)} — keeping the previous cover and continuing other fields.`,
            true
          );
          keepFinalWarningMessage = true;
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
        const url = isSupabaseReady()
          ? await uploadWardrobeImageFileToCloud(gf, id, { type: "main_gallery", index: gallery.length + 1 })
          : await fileToStorageDataUrl(gf, { preferJpeg: true });
        gallery.push(url);
      } catch (e) {
        console.warn(e);
        setMsg(messageForCloudUploadFailure(`gallery image #${gallery.length + 1}`, e), true);
      }
    }
    gallery = dedupeGalleryUrls(image, gallery, 12);

    const colourTrim = String(primaryColour ?? "").trim();
    const colourCodeTrim = String(colourCode ?? "").trim();
    const updated = {
      ...prev,
      brand,
      name,
      section: String(prev.section ?? ""),
      category,
      season,
      fabric,
      weight,
      size,
      measuredDimensions,
      purchaseDate,
      notes,
      image,
      pillar: String(prev.pillar ?? ""),
    };
    if (colourTrim) {
      updated.colour = colourTrim;
    } else {
      delete updated.colour;
    }
    if (colourCodeTrim) updated.colourCode = colourCodeTrim;
    else {
      delete updated.colourCode;
      delete updated.color_code;
    }
    if (priceVal != null) {
      updated.price = priceVal;
      updated.priceCurrency = PRICE_CURRENCY_CODES.includes(priceCur) ? priceCur : "TWD";
    } else {
      delete updated.price;
      delete updated.priceCurrency;
    }
    if (gallery.length) updated.gallery = gallery;
    else delete updated.gallery;

    if (variantsMode && colourVariantsBuilt?.length) {
      updated.colourVariants = colourVariantsBuilt;
      delete updated.basicColour;
    } else {
      delete updated.colourVariants;
      if (basicPickSingle) updated.basicColour = basicPickSingle;
      else delete updated.basicColour;
    }

    const prevMeta =
      prev.metadata && typeof prev.metadata === "object" && !Array.isArray(prev.metadata) ? { ...prev.metadata } : {};
    if (priceVal != null) {
      prevMeta.price = priceVal;
      prevMeta.priceCurrency = PRICE_CURRENCY_CODES.includes(priceCur) ? priceCur : "TWD";
    } else {
      delete prevMeta.price;
      delete prevMeta.priceCurrency;
    }
    if (mRows.length) {
      prevMeta.measurementRows = mRows;
      prevMeta.measurementUnit = measureUnit;
      updated.measurementRows = mRows;
      updated.measurementUnit = measureUnit;
    } else {
      delete prevMeta.measurementRows;
      delete prevMeta.measurementUnit;
      delete updated.measurementRows;
      delete updated.measurementUnit;
    }
    if (variantsMode && colourVariantsBuilt?.length) {
      delete prevMeta.basicColour;
    } else if (basicPickSingle) {
      prevMeta.basicColour = basicPickSingle;
    } else {
      delete prevMeta.basicColour;
    }
    if (Object.keys(prevMeta).length) updated.metadata = prevMeta;
    else delete updated.metadata;

    /** When saving a custom piece, whether `data/custom-items.json` was updated (npm run dev). */
    let customProjectSynced = true;
    let customCloudSynced = false;
    /** After custom or catalogue mirror save, cloud refresh already merged + rendered the grid. */
    let didCloudListRefresh = false;
    let archiveCloudRowSaved = false;
    let archiveSavedAsOverride = false;

    if (isCustom) {
      const inWardrobe = loadCustomItems().some((x) => String(x.id) === id);
      if (!inWardrobe) {
        setMsg("This piece is no longer in your wardrobe.", true);
        return;
      }

      try {
        const saved = await saveWardrobeItemToCloud(updated);
        const mediaBust = stampWardrobeItemMediaNonce(saved);
        upsertWardrobeBaseRowInMemory(saved);
        stripCustomIdsFromLocalStorage([id]);
        await mirrorLocalCustomItemsToProjectFile();
        customCloudSynced = true;
        customProjectSynced = false;
        await deleteSupabaseImagesNoLongerUsed(prev, saved, updated);
        try {
          await refreshCloudBackedCustomItems();
          didCloudListRefresh = true;
          const hit = cloudBackedCustomItems.find((x) => String(x.id) === String(id));
          if (hit) /** @type {any} */ (hit).__displayNonce = mediaBust;
        } catch (re) {
          console.warn(re);
          cloudBackedCustomItems = [
            saved,
            ...cloudBackedCustomItems.filter((x) => String(x.id) !== String(saved.id)),
          ];
          const hit2 = cloudBackedCustomItems.find((x) => String(x.id) === String(id));
          if (hit2) /** @type {any} */ (hit2).__displayNonce = mediaBust;
        }
      } catch (e) {
        console.warn(e);
        setMsg(`Cloud row save failed: ${messageForFailedWardrobeUpsert(e)}`, true);
        return;
      }
    } else {
      const patch = {
        brand,
        name,
        section: String(prev.section ?? ""),
        category,
        season,
        colour: colourTrim,
        colourCode: colourCodeTrim,
        fabric,
        weight,
        size,
        measuredDimensions,
        purchaseDate,
        notes,
        image,
        pillar: String(prev.pillar ?? ""),
      };
      if (priceVal != null) {
        patch.price = priceVal;
        patch.priceCurrency = PRICE_CURRENCY_CODES.includes(priceCur) ? priceCur : "TWD";
      } else {
        patch.price = null;
        patch.priceCurrency = null;
      }
      if (gallery.length) patch.gallery = gallery;
      else patch.gallery = [];
      if (variantsMode && colourVariantsBuilt?.length) {
        patch.colourVariants = colourVariantsBuilt;
      }
      {
        const baseMeta =
          prev.metadata && typeof prev.metadata === "object" && !Array.isArray(prev.metadata)
            ? { ...prev.metadata }
            : {};
        if (priceVal != null) {
          baseMeta.price = priceVal;
          baseMeta.priceCurrency = PRICE_CURRENCY_CODES.includes(priceCur) ? priceCur : "TWD";
        } else {
          delete baseMeta.price;
          delete baseMeta.priceCurrency;
        }
        if (mRows.length) {
          baseMeta.measurementRows = mRows;
          baseMeta.measurementUnit = measureUnit;
        } else {
          delete baseMeta.measurementRows;
          delete baseMeta.measurementUnit;
        }
        if (variantsMode && colourVariantsBuilt?.length) {
          delete baseMeta.basicColour;
        } else if (basicPickSingle) {
          baseMeta.basicColour = basicPickSingle;
        } else {
          delete baseMeta.basicColour;
        }
        if (Object.keys(baseMeta).length) patch.metadata = baseMeta;
        else if (prev.metadata && typeof prev.metadata === "object" && !Array.isArray(prev.metadata))
          patch.metadata = null;
      }

      try {
        const mergedForCloud = normalizeItemDerivedFields(mergeArchivePatchIntoFullItem(prev, patch));
        const saved = await saveWardrobeItemToCloud(mergedForCloud);
        archiveCloudRowSaved = true;
        upsertWardrobeBaseRowInMemory(saved);
        try {
          const allOv = loadArchiveOverrides();
          if (Object.prototype.hasOwnProperty.call(allOv, id)) {
            delete allOv[id];
            await saveArchiveOverrides(allOv);
          }
        } catch (clearOvErr) {
          console.warn("Could not clear stale archive override after cloud save.", clearOvErr);
        }
        cloudBackedCustomItems = [
          saved,
          ...cloudBackedCustomItems.filter((x) => String(x?.id ?? "") !== String(saved.id)),
        ];
        try {
          await deleteSupabaseImagesNoLongerUsed(prev, saved, mergedForCloud);
        } catch (imgErr) {
          console.warn("Image cleanup after catalogue save (continuing):", imgErr);
        }
        await refreshCloudBackedCustomItems();
        didCloudListRefresh = true;
      } catch (e) {
        setMsg(`Cloud row save failed: ${messageForFailedWardrobeUpsert(e)}`, true);
        keepFinalWarningMessage = true;
        return;
      }
    }

    if (!keepFinalWarningMessage && !(isCustom && isSupabaseReady() && !customCloudSynced)) {
      setMsg("", false);
    }
    if (!didCloudListRefresh) {
      mergeWardrobeFromSources();
      if (document.getElementById("grid")) {
        initFilters();
        onOutfitChange();
        renderGrid();
      }
    }
    const next = itemById.get(id);
    const mount = itemDetailMountRoot();
    const returnToArchiveAfterSave = Boolean(mount && itemDetailIsPageRoot(mount));
    if (!returnToArchiveAfterSave) {
      if (next && mount) renderItemDetailContent(mount, next, { edit: false });
      replaceItemPageUrl(id, false);
    }
    if (isSupabaseReady()) {
      if (!isCustom && !archiveCloudRowSaved && archiveSavedAsOverride) {
        showToast("Saved as override (cloud row write failed).");
        return;
      }
      showToast("Saved to your wardrobe (Supabase).");
    } else if (isCustom) {
      showToast(
        customProjectSynced
          ? "Saved changes (and project file)."
          : "Saved changes in this browser/origin only. Run npm run dev to mirror to data/custom-items.json."
      );
    } else {
      showToast(
        "Saved in this browser/origin only (domain/protocol/port). Add Supabase (js/tw-supabase-config.js) to sync your wardrobe, or keep backups via “Download backup JSON”."
      );
    }
    if (returnToArchiveAfterSave) globalThis.location.assign(new URL("index.html", globalThis.location.href));
  }

  /** PDP-style trail: site → section → record type (matches archive tabs / drill). */
  function buildItemDetailBreadcrumbNav(item) {
    const nav = document.createElement("nav");
    nav.className = "item-detail__breadcrumb";
    nav.setAttribute("aria-label", "Breadcrumb");

    const slotLabel = itemSlot(item);
    const sectionLabel = categoryDisplayLabel(slotLabel);
    const rk = recordCategoryForDrill(item, slotLabel);
    const typeLabel = friendlyRecordCategory(rk) || rk;

    function appendSep() {
      const s = document.createElement("span");
      s.className = "item-detail__breadcrumb-sep";
      s.setAttribute("aria-hidden", "true");
      s.textContent = "/";
      nav.appendChild(s);
    }

    const home = document.createElement("a");
    home.className = "item-detail__breadcrumb-link";
    home.href = "index.html";
    home.textContent = "Timeless Wardrobe";
    nav.appendChild(home);

    appendSep();

    const sec = document.createElement("a");
    sec.className = "item-detail__breadcrumb-link";
    sec.href = "index.html";
    sec.textContent = sectionLabel;
    nav.appendChild(sec);

    appendSep();

    const cur = document.createElement("span");
    cur.className = "item-detail__breadcrumb-current";
    cur.textContent = typeLabel;
    nav.appendChild(cur);

    return nav;
  }

  /** Chip quick-pick for record type; mirrors `<select id="item-edit-record-type">` options (hidden when ≤1 choice). */
  function syncItemEditSubcategoryChipsFromSelect(recordTypeSel, stripRoot, chipsInner) {
    if (!stripRoot || !chipsInner || !recordTypeSel) return;
    chipsInner.replaceChildren();
    const unique = [];
    const seen = new Set();
    for (let i = 0; i < recordTypeSel.options.length; i++) {
      const raw = String(recordTypeSel.options[i].value ?? "").trim();
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      unique.push(raw);
    }
    if (unique.length <= 1) {
      stripRoot.hidden = true;
      return;
    }
    stripRoot.hidden = false;
    const current = String(recordTypeSel.value ?? "").trim();
    for (const raw of unique) {
      const opt = [...recordTypeSel.options].find((o) => String(o.value ?? "").trim() === raw);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "category-drill__choice";
      if (raw === current) b.classList.add("is-active");
      b.textContent = opt ? String(opt.textContent ?? "").trim() : friendlyRecordCategory(raw) || raw;
      b.title = raw;
      b.addEventListener("click", () => {
        recordTypeSel.value = raw;
        recordTypeSel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      chipsInner.appendChild(b);
    }
  }

  function renderItemDetailContent(root, item, opts = {}) {
    const edit = Boolean(opts.edit);
    detailItemId = item.id;
    root.innerHTML = "";

    const media = document.createElement("div");
    media.className = "card__media item-detail__media";
    const detailVariants = getItemColourVariants(item);
    if (detailVariants?.length) media.classList.add("card__media--variant-colours");
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

    if (root.classList.contains("item-detail__root--page")) {
      wireInlineItemHeroZoom(media, img);
    }

    root.appendChild(media);

    if (edit) {
      const wrap = document.createElement("div");
      wrap.className = "item-detail__body item-detail__body--edit";
      wrap.appendChild(buildItemDetailBreadcrumbNav(item));
      if (!String(item.id).startsWith("custom-")) {
        const hint = document.createElement("p");
        hint.className = "item-detail__archive-only";
        hint.style.marginBottom = "0.75rem";
        hint.textContent =
          "Saving updates this piece’s row in Supabase (`wardrobe_items`) for this archive id.";
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

      /** Narrow label+control for row strips (season / fabric / price…). */
      function appendStripField(strip, labelText, child) {
        const lab = document.createElement("label");
        lab.className = "field item-edit-strip-field";
        const span = document.createElement("span");
        span.className = "field__label";
        span.textContent = labelText;
        lab.appendChild(span);
        lab.appendChild(child);
        strip.appendChild(lab);
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

      const subtypeStrip = document.createElement("div");
      subtypeStrip.className = "field field--span2 item-edit-subtype-strip";
      subtypeStrip.hidden = true;
      const stLabel = document.createElement("span");
      stLabel.className = "field__label";
      stLabel.textContent = "Subcategory (quick pick)";
      const subtypeInner = document.createElement("div");
      subtypeInner.className = "category-drill__grid item-edit-subtype-chips";
      subtypeInner.setAttribute("role", "group");
      subtypeInner.setAttribute("aria-label", "Record type quick pick");
      subtypeStrip.appendChild(stLabel);
      subtypeStrip.appendChild(subtypeInner);
      grid.appendChild(subtypeStrip);

      function refreshSubtypeChips() {
        syncItemEditSubcategoryChipsFromSelect(recordTypeSel, subtypeStrip, subtypeInner);
      }

      catSel.addEventListener("change", () => {
        fillItemEditRecordTypeSelect(recordTypeSel, catSel.value, recordTypeSel.value);
        refreshSubtypeChips();
      });
      recordTypeSel.addEventListener("change", () => {
        refreshSubtypeChips();
      });
      refreshSubtypeChips();

      const initialVariants = getItemColourVariants(item);
      const isCustomPiece = String(item.id ?? "").startsWith("custom-");

      /** @type {HTMLElement | null} */
      let colourSingleField = null;

      const colourBlock = document.createElement("div");
      colourBlock.className = "field--span2 item-edit-single-colour-block";
      colourBlock.hidden = Boolean(initialVariants);

      const colourNameInput = document.createElement("input");
      colourNameInput.type = "text";
      colourNameInput.id = "item-edit-colour";
      colourNameInput.maxLength = 80;
      colourNameInput.autocomplete = "off";
      colourNameInput.value = String(item.colour ?? item.color ?? "");

      const colourNameLab = document.createElement("label");
      colourNameLab.className = "field";
      const cspan = document.createElement("span");
      cspan.className = "field__label";
      cspan.textContent = "Colour (optional)";
      colourNameLab.appendChild(cspan);
      colourNameLab.appendChild(colourNameInput);

      const colourCodeInput = document.createElement("input");
      colourCodeInput.type = "text";
      colourCodeInput.id = "item-edit-colour-code";
      colourCodeInput.maxLength = 80;
      colourCodeInput.autocomplete = "off";
      colourCodeInput.placeholder = "#hex, SKU…";
      colourCodeInput.value = itemColourCode(item);

      const colourCodeLab = document.createElement("label");
      colourCodeLab.className = "field";
      const ccspan = document.createElement("span");
      ccspan.className = "field__label";
      ccspan.textContent = "Colour code (optional)";
      colourCodeLab.appendChild(ccspan);
      colourCodeLab.appendChild(colourCodeInput);

      const itemMetaForBasic =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata : null;
      const initialBasic = normalizeStoredBasicColourKey(item.basicColour ?? itemMetaForBasic?.basicColour);

      const basicSel = document.createElement("select");
      basicSel.id = "item-edit-basic-colour";
      basicSel.className = "item-edit-basic-colour";
      fillBasicColourSelectOptions(basicSel, initialBasic);
      const basicLab = document.createElement("label");
      basicLab.className = "field";
      const bspan = document.createElement("span");
      bspan.className = "field__label";
      bspan.textContent = "Broad colour (optional)";
      basicLab.appendChild(bspan);
      basicLab.appendChild(basicSel);

      colourBlock.appendChild(colourNameLab);
      colourBlock.appendChild(colourCodeLab);
      colourBlock.appendChild(basicLab);

      if (isCustomPiece) {
        const migrateHint = document.createElement("p");
        migrateHint.className = "item-edit-variant-migrate-hint";
        migrateHint.textContent =
          "Same piece in another colour needs its own cover photo — outfits will ask which colour to use.";
        const migrateBtn = document.createElement("button");
        migrateBtn.type = "button";
        migrateBtn.className = "btn btn--small btn--ghost item-edit-enable-variants";
        migrateBtn.textContent = "Add another colour…";
        colourBlock.appendChild(migrateHint);
        colourBlock.appendChild(migrateBtn);
      }
      grid.appendChild(colourBlock);
      colourSingleField = colourBlock;

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
          "This piece keeps one primary cover for the archive grid; each colour has its own variant cover. The colour strip uses an uploaded preview if set, otherwise a hex value from the colour code or name, otherwise the code text, and only then the variant cover. Keys stay fixed — use “Add another colour…” for a new option.";
        variantsWrap.appendChild(variantsIntro);
      }

      const listEl = document.createElement("div");
      listEl.id = "item-edit-variants-list";
      listEl.className = "item-edit-variants-list";

      const addVarBtn = document.createElement("button");
      addVarBtn.type = "button";
      addVarBtn.className = "btn btn--small btn--ghost item-edit-variant-add";
      addVarBtn.textContent = "Add another colour…";
      addVarBtn.hidden = !initialVariants;
      const disableVariantsBtn = document.createElement("button");
      disableVariantsBtn.type = "button";
      disableVariantsBtn.className = "btn btn--small btn--ghost item-edit-variant-disable";
      disableVariantsBtn.textContent = "Use single colour";
      disableVariantsBtn.hidden = !initialVariants || !colourSingleField;

      if (initialVariants) {
        for (const v of initialVariants) {
          appendVariantEditorRow(listEl, {
            key: v.key,
            label: v.label,
            colour: v.colour ?? v.color,
            colourCode: v.colourCode,
            basicColour: v.basicColour,
            image: v.image,
            previewImage: v.previewImage,
            gallery: v.gallery,
            notes: v.notes,
          });
        }
      }

      variantsWrap.appendChild(listEl);
      variantsWrap.appendChild(addVarBtn);
      variantsWrap.appendChild(disableVariantsBtn);

      addVarBtn.addEventListener("click", () => {
        appendVariantEditorRow(listEl, {
          key: newEditorVariantKey(),
          label: "",
          colour: "",
          colourCode: "",
          image: "",
          previewImage: "",
          gallery: [],
          notes: "",
        });
        variantsWrap.dataset.active = "1";
        variantsWrap.hidden = false;
        addVarBtn.hidden = false;
        disableVariantsBtn.hidden = !colourSingleField;
      });

      disableVariantsBtn.addEventListener("click", () => {
        if (!colourSingleField) return;
        const firstRow = listEl.querySelector(".item-edit-variant-row");
        if (firstRow) {
          const firstLabel = firstRow.querySelector(".item-edit-variant-label")?.value?.trim() || "";
          const firstColour = firstRow.querySelector(".item-edit-variant-colour")?.value?.trim() || "";
          const firstCode = firstRow.querySelector(".item-edit-variant-colour-code")?.value?.trim() || "";
          const colourNameEl = /** @type {HTMLInputElement | null} */ (colourSingleField.querySelector("#item-edit-colour"));
          const codeIn = /** @type {HTMLInputElement | null} */ (colourSingleField.querySelector("#item-edit-colour-code"));
          if (colourNameEl) colourNameEl.value = firstColour || firstLabel || colourNameEl.value;
          if (codeIn) codeIn.value = firstCode || codeIn.value;
          const firstBasic = /** @type {HTMLSelectElement | null} */ (firstRow.querySelector(".item-edit-variant-basic-colour"));
          const singleBasic = /** @type {HTMLSelectElement | null} */ (colourSingleField.querySelector("#item-edit-basic-colour"));
          if (singleBasic) fillBasicColourSelectOptions(singleBasic, firstBasic?.value ?? "");
        }
        variantsWrap.dataset.active = "0";
        variantsWrap.hidden = true;
        colourSingleField.hidden = false;
        addVarBtn.hidden = true;
        disableVariantsBtn.hidden = true;
        const coverField = form.querySelector("#item-edit-cover")?.closest("label");
        if (coverField instanceof HTMLElement) coverField.hidden = false;
      });

      if (colourSingleField) {
        const migrateBtn = colourSingleField.querySelector(".item-edit-enable-variants");
        migrateBtn?.addEventListener("click", () => {
          const colourNameEl = /** @type {HTMLInputElement | null} */ (
            colourSingleField.querySelector("#item-edit-colour")
          );
          const codeIn = /** @type {HTMLInputElement | null} */ (colourSingleField.querySelector("#item-edit-colour-code"));
          const baseColour = colourNameEl?.value?.trim() || "";
          const baseCode = codeIn?.value?.trim() || "";
          const basicTop = /** @type {HTMLSelectElement | null} */ (colourSingleField.querySelector("#item-edit-basic-colour"));
          const basicFromSingle = normalizeStoredBasicColourKey(basicTop?.value ?? "");
          const label0 = baseColour || "Colour 1";
          const key0 = slugVariantKeyBase(label0) || "colour-1";
          listEl.innerHTML = "";
          appendVariantEditorRow(listEl, {
            key: key0,
            label: label0,
            colour: baseColour,
            colourCode: baseCode,
            basicColour: basicFromSingle,
            image: String(item.image ?? ""),
            previewImage: "",
            gallery: itemGalleryList(item),
            notes: "",
          });
          appendVariantEditorRow(listEl, {
            key: newEditorVariantKey(),
            label: "",
            colour: "",
            colourCode: "",
            image: "",
            previewImage: "",
            gallery: [],
            notes: "",
          });
          variantsWrap.dataset.active = "1";
          variantsWrap.hidden = false;
          colourSingleField.hidden = true;
          addVarBtn.hidden = false;
          disableVariantsBtn.hidden = false;
          const coverField = form.querySelector("#item-edit-cover")?.closest("label");
          if (coverField instanceof HTMLElement) coverField.hidden = true;
        });
      }

      grid.appendChild(variantsWrap);

      const seaSel = document.createElement("select");
      seaSel.id = "item-edit-season";
      const seasonRows = [
        { value: "All-season", label: "All seasons" },
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

      const fabIn = document.createElement("input");
      fabIn.type = "text";
      fabIn.id = "item-edit-fabric";
      fabIn.maxLength = 80;
      fabIn.value = String(item.fabric ?? "");

      const wtIn = document.createElement("input");
      wtIn.type = "text";
      wtIn.id = "item-edit-weight";
      wtIn.maxLength = 80;
      wtIn.value = String(item.weight ?? "");

      const sizeIn = document.createElement("input");
      sizeIn.type = "text";
      sizeIn.id = "item-edit-size";
      sizeIn.maxLength = 120;
      sizeIn.value = String(item.size ?? "");

      const specStrip = document.createElement("div");
      specStrip.className = "item-edit-spec-strip";
      appendStripField(specStrip, "Season (optional)", seaSel);
      appendStripField(specStrip, "Fabric (optional)", fabIn);
      appendStripField(specStrip, "Weight / specs (optional)", wtIn);
      appendStripField(specStrip, "Size (optional)", sizeIn);
      grid.appendChild(specStrip);

      const pd = String(item.purchaseDate ?? "").trim();
      const { date: purchaseDateValue, note: purchaseNoteValue } = splitPurchaseDateForForm(pd);
      const purchaseWrap = document.createElement("div");
      purchaseWrap.className = "item-edit-purchase-fields";
      const purchaseIn = document.createElement("input");
      purchaseIn.type = "date";
      purchaseIn.id = "item-edit-purchase-date";
      purchaseIn.value = purchaseDateValue;
      const purchaseNoteIn = document.createElement("input");
      purchaseNoteIn.type = "text";
      purchaseNoteIn.id = "item-edit-purchase-date-note";
      purchaseNoteIn.maxLength = 80;
      purchaseNoteIn.autocomplete = "off";
      purchaseNoteIn.placeholder = "Optional note (e.g. approximate, gift)";
      purchaseNoteIn.value = purchaseNoteValue;
      purchaseWrap.appendChild(purchaseIn);
      purchaseWrap.appendChild(purchaseNoteIn);

      const priceWrap = document.createElement("div");
      priceWrap.className = "item-edit-price-row";
      const priceIn = document.createElement("input");
      priceIn.type = "number";
      priceIn.id = "item-edit-price";
      priceIn.min = "0";
      priceIn.step = "any";
      priceIn.inputMode = "decimal";
      priceIn.placeholder = "e.g. 199 or 199.5";
      priceIn.autocomplete = "off";
      if (Number.isFinite(Number(item.price))) priceIn.value = String(item.price);
      const priceCurSel = document.createElement("select");
      priceCurSel.id = "item-edit-price-currency";
      priceCurSel.setAttribute("aria-label", "Price currency");
      const priceCurrencyPick = PRICE_CURRENCY_CODES.includes(String(item.priceCurrency ?? "").trim().toUpperCase())
        ? String(item.priceCurrency).trim().toUpperCase()
        : "TWD";
      for (const c of PRICE_CURRENCY_CODES) {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        if (c === priceCurrencyPick) o.selected = true;
        priceCurSel.appendChild(o);
      }
      priceWrap.appendChild(priceIn);
      priceWrap.appendChild(priceCurSel);

      const acquisitionStrip = document.createElement("div");
      acquisitionStrip.className = "item-edit-acquisition-strip";
      const purchaseField = document.createElement("label");
      purchaseField.className = "field";
      const pudLab = document.createElement("span");
      pudLab.className = "field__label";
      pudLab.textContent = "Purchase date (optional)";
      purchaseField.appendChild(pudLab);
      purchaseField.appendChild(purchaseWrap);
      acquisitionStrip.appendChild(purchaseField);

      const priceField = document.createElement("label");
      priceField.className = "field";
      const priceLab = document.createElement("span");
      priceLab.className = "field__label";
      priceLab.textContent = "Price (optional)";
      priceField.appendChild(priceLab);
      priceField.appendChild(priceWrap);
      acquisitionStrip.appendChild(priceField);
      grid.appendChild(acquisitionStrip);

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

      const measWrap = document.createElement("label");
      measWrap.className = "field field--block item-edit-measurements-wrap";
      const measSpan = document.createElement("span");
      measSpan.className = "field__label";
      measSpan.textContent = "Measurements (optional)";
      const measBlockHost = document.createElement("div");
      measBlockHost.id = "item-edit-measured-dims-block";
      measBlockHost.className = "item-edit-measured-dims-host";
      measWrap.appendChild(measSpan);
      measWrap.appendChild(measBlockHost);
      form.appendChild(measWrap);
      mountMeasurementRowsEditor(
        measBlockHost,
        resolveInitialMeasurementRowsForEditor(getMeasurementRows(item), { defaultsForEmpty: false }),
        { unitSelectId: "item-edit-measurement-unit", initialUnit: getMeasurementUnit(item) }
      );

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
      const dupBtn = document.createElement("button");
      dupBtn.type = "button";
      dupBtn.className = "btn btn--small btn--ghost";
      dupBtn.id = "item-detail-duplicate";
      dupBtn.textContent = "Duplicate";
      dupBtn.title =
        "Save a copy as a new custom piece (same photos and fields; name gets “ (copy)”) — opens the copy here for editing.";
      actPush.appendChild(dupBtn);
      act.appendChild(actPush);

      const delWrap = document.createElement("div");
      delWrap.className = "item-detail__form-danger";
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.id = "item-detail-delete";
      delBtn.textContent = "Delete piece…";
      delBtn.title =
        "Remove this piece from Supabase (outfit links cleared; cloud images removed where applicable; cannot be undone).";
      delWrap.appendChild(delBtn);
      act.appendChild(delWrap);
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

    body.appendChild(buildItemDetailBreadcrumbNav(item));

    const title = document.createElement("h2");
    title.id = "item-detail-heading";
    title.className = "item-detail__title";
    if (root.classList.contains("item-detail__root--page")) {
      title.classList.add("item-detail__title--product");
      title.tabIndex = -1;
    }
    title.textContent = displayNameWithoutLeadingColour(item);
    body.appendChild(title);

    const brand = document.createElement("p");
    brand.className = "item-detail__brand";
    brand.textContent = item.brand;
    body.appendChild(brand);

    mountVariantSwatchStrip(body, item, { outfitPick: true, heroImg: img, heroHost: media, addToOutfitOnPick: true });

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

    addRow("Season", seasonUiLabel(item.season));
    addRow("Size", item.size);
    {
      const pd = String(item.purchaseDate ?? "").trim();
      if (pd) addRow("Purchase date", formatPurchaseDateForDisplay(pd));
    }
    {
      const pl = formattedArchivePriceLine(item);
      if (pl) addRow("Price", pl);
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

    appendMeasurementDisplaySection(body, item);

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

    const ed = document.createElement("button");
    ed.type = "button";
    ed.className = "btn btn--small";
    ed.id = "item-detail-edit";
    ed.textContent = "Edit";
    if (!isSupabaseReady()) {
      ed.disabled = true;
      ed.title = CLOUD_WRITE_REQUIRED_MESSAGE;
    }
    actions.appendChild(ed);
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
          basicColour: String(basicColourFilter ?? "").trim(),
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

    const bc = String(o?.basicColour ?? "")
      .trim()
      .toLowerCase();
    if (BASIC_COLOUR_FAMILY_KEYS.includes(bc)) {
      basicColourFilter = persistBasicColourFilter(bc);
    } else {
      basicColourFilter = persistBasicColourFilter("");
    }
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
        if (t?.closest("#item-detail-duplicate")) {
          const it = itemById.get(detailItemId);
          if (!it) return;
          if (!isSupabaseReady()) {
            showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
            return;
          }
          const dupBtnEl = /** @type {HTMLButtonElement | null} */ (mount.querySelector("#item-detail-duplicate"));
          if (dupBtnEl) dupBtnEl.disabled = true;
          void (async () => {
            try {
              const dup = buildDuplicateCustomItem(it);
              const newId = await persistNewCustomItemRow(dup);
              const next = itemById.get(newId);
              if (!next) {
                showToast("Duplicate saved but the new piece could not be shown — refresh the page.");
                return;
              }
              renderItemDetailContent(mount, next, { edit: true });
              replaceItemPageUrl(newId, true);
              document.title = `${next.brand} — ${displayNameWithoutLeadingColour(next)} · Timeless Wardrobe`;
              showToast("Duplicate saved — edit this copy below.");
            } catch (err) {
              console.warn("duplicate piece", err);
              showToast(messageForFailedWardrobeUpsert(err));
            } finally {
              if (dupBtnEl) dupBtnEl.disabled = false;
            }
          })();
          return;
        }
        if (t?.closest("#item-detail-edit")) {
          const it = itemById.get(detailItemId);
          if (!it) return;
          if (!isSupabaseReady()) {
            showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
            return;
          }
          renderItemDetailContent(mount, it, { edit: true });
          replaceItemPageUrl(it.id, true);
          return;
        }
        if (t?.closest("#item-detail-delete")) {
          const it = itemById.get(detailItemId);
          if (!it) return;
          if (!isSupabaseReady()) {
            showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
            return;
          }
          const msg =
            "Delete this piece from Supabase? Links in saved outfits are removed first (`outfit_items`). Then we delete Storage objects only when the image URL maps to your wardrobe-images bucket—external URLs stay. Finally we delete the `wardrobe_items` row; nothing here can restore it.";
          if (!confirm(msg)) return;
          void deleteWardrobePieceFromBrowser(it.id);
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

  /**
   * On item.html, one stale in-memory pass can happen right after add/edit navigation.
   * Retry once by refreshing sources before declaring "not found".
   * @param {string} pageId
   * @returns {Promise<object | null>}
   */
  async function resolveItemForDetailPage(pageId) {
    if (!pageId) return null;
    let hit = itemById.get(pageId);
    if (hit) return hit;

    try {
      if (isCloudModeActive()) {
        await refreshCloudBackedCustomItems();
      } else {
        fileBackedCustomItems = await loadFileBackedCustomItems();
        mergeWardrobeFromSources();
      }
    } catch (e) {
      console.warn("Detail page refresh before lookup failed:", e);
    }
    hit = itemById.get(pageId);
    return hit || null;
  }

  async function runItemDetailPage(root, pageId) {
    const item = await resolveItemForDetailPage(pageId);
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

    document.title = `${item.brand} — ${displayNameWithoutLeadingColour(item)} · Timeless Wardrobe`;
    const wantEditRequested = wantEdit;
    let allowEdit = wantEditRequested;
    if (wantEditRequested && !isSupabaseReady()) {
      showToast(CLOUD_WRITE_REQUIRED_MESSAGE);
      allowEdit = false;
      replaceItemPageUrl(item.id, false);
    }
    renderItemDetailContent(root, item, { edit: allowEdit });
  }

  function syncCategoryTabUI() {
    const filter = String(categoryNavFilter ?? "").trim();
    const jumpMatches = (el) => String(el.getAttribute("data-category-jump") ?? "").trim() === filter;

    document.querySelectorAll(".site-header__nav-link[data-category-jump]").forEach((el) => {
      const active = jumpMatches(el);
      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });

    document.querySelectorAll(".site-header__mobile-link[data-category-jump]").forEach((el) => {
      const active = jumpMatches(el);
      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });

    document
      .querySelectorAll(".site-header__search-aside-link[data-category-jump], .site-header__search-category-card[data-category-jump]")
      .forEach((el) => {
        el.classList.toggle("is-active", jumpMatches(el));
      });

    const subF = String(subcategoryFilter ?? "").trim();
    document.querySelectorAll(".site-header__submenu-link[data-category-jump]").forEach((el) => {
      const jump = String(el.getAttribute("data-category-jump") ?? "").trim();
      const sub = String(el.getAttribute("data-subcategory-jump") ?? "").trim();
      const activeRow = jump === filter && (!sub || sub === subF);
      el.classList.toggle("is-active", activeRow);
    });
  }

  function syncSeasonTabUI() {
    const nav = document.getElementById("season-nav");
    if (nav) {
      nav.querySelectorAll(".season-strip__tab").forEach((tab) => {
        const v = tab.dataset.seasonFilter ?? "";
        const active = v === seasonNavFilter;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
    const mini = document.getElementById("season-nav-mini");
    if (mini) {
      mini.querySelectorAll(".site-header__season-mini-tab").forEach((tab) => {
        const v = tab.dataset.seasonFilter ?? "";
        const active = v === seasonNavFilter;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }
  }

  /** Match archive mobile PLP + compact header (`max-width: 900px` in CSS / `isHeaderCompactLayout`). */
  function isFiltersNarrowViewport() {
    return globalThis.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  }

  /** After changing category / type filters, bring the archive list back into view from the top. */
  function scrollArchiveViewportTop() {
    try {
      const reduce = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
      globalThis.scrollTo({ top: 0, left: 0, behavior: reduce ? "auto" : "smooth" });
    } catch {
      globalThis.scrollTo(0, 0);
    }
  }

  function syncFiltersMenuForViewport() {
    const nav = document.getElementById("filters-nav");
    const btn = document.getElementById("filters-menu-btn");
    if (!nav) return;
    if (!btn) {
      nav.classList.remove("filters--menu-open");
      return;
    }
    if (!isFiltersNarrowViewport()) {
      nav.classList.remove("filters--menu-open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    } else {
      btn.removeAttribute("aria-hidden");
      btn.tabIndex = 0;
      btn.setAttribute("aria-expanded", nav.classList.contains("filters--menu-open") ? "true" : "false");
      document.body.classList.remove("archive-ui--nav-folded");
    }
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
    if (open) {
      document.body.classList.remove("archive-ui--nav-folded");
    }
  }

  function initFilters() {
    syncSeasonTabUI();
    syncCategoryTabUI();
    validateSubcategoryFilter();
    renderCategoryDrill();
    syncFiltersMenuForViewport();
    wireArchiveBrowseToolControls();
    syncFilterSearchClearVisibility();
  }

  function syncBasicColourFilterChipUi() {
    const chipWrap = document.getElementById("archive-colour-chips");
    const chipBlock = chipWrap?.closest(".items-toolbar__colour-block");
    if (!chipWrap) return;
    const allowColour = allowArchiveBasicColourFilter();
    if (chipBlock) chipBlock.hidden = !allowColour;
    chipWrap.hidden = !allowColour;
    if (!allowColour) {
      chipWrap.replaceChildren();
      return;
    }
    const available = availableBasicColourFamiliesForCurrentContext();
    const counts = basicColourFamilyCountsForCurrentContext();
    const keys = [""];
    for (const k of BASIC_COLOUR_FAMILY_KEYS) {
      if (available.has(k) || basicColourFilter === k) keys.push(k);
    }
    chipWrap.replaceChildren();
    for (const key of keys) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "colour-filter-chip";
      if (!key) b.classList.add("colour-filter-chip--all");
      b.dataset.basicColour = key;
      const on = basicColourFilter === key;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", key ? `Filter colour: ${basicColourLabelEn(key)}` : "Show all colours");

      if (key) {
        const sw = document.createElement("span");
        sw.className = "colour-filter-chip__swatch";
        sw.style.setProperty("--chip-swatch-color", BASIC_COLOUR_SWATCH_HEX[key] || "#888");
        b.appendChild(sw);
      }

      const txt = document.createElement("span");
      txt.className = "colour-filter-chip__text";
      txt.textContent = basicColourLabelEn(key);
      b.appendChild(txt);
      if (key) {
        const cnt = document.createElement("span");
        cnt.className = "colour-filter-chip__count";
        cnt.textContent = `(${counts.get(key) ?? 0})`;
        b.appendChild(cnt);
      }

      b.addEventListener("click", () => {
        let next = "";
        if (key === "") next = "";
        else if (basicColourFilter === key) next = "";
        else next = key;
        basicColourFilter = persistBasicColourFilter(next);
        renderGrid();
      });
      chipWrap.appendChild(b);
    }
  }

  function openArchiveFilterDrawer() {
    const root = document.getElementById("archive-filter-drawer");
    const openBtn = document.getElementById("archive-filter-drawer-open");
    if (!root || !openBtn) return;
    if (!root.hasAttribute("hidden")) return;
    if (archiveFilterDrawerOpenRaf) {
      cancelAnimationFrame(archiveFilterDrawerOpenRaf);
      archiveFilterDrawerOpenRaf = 0;
    }
    archiveFilterDrawerFocusReturn = document.activeElement;
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    archiveFilterDrawerOpenRaf = requestAnimationFrame(() => {
      archiveFilterDrawerOpenRaf = 0;
      if (root.hasAttribute("hidden")) return;
      root.classList.add("archive-filter-drawer--visible");
      openBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("archive-ui--filter-drawer");
      document.getElementById("archive-filter-drawer-close")?.focus();
    });
  }

  function closeArchiveFilterDrawer() {
    const root = document.getElementById("archive-filter-drawer");
    const openBtn = document.getElementById("archive-filter-drawer-open");
    if (!root) return;
    if (archiveFilterDrawerOpenRaf) {
      cancelAnimationFrame(archiveFilterDrawerOpenRaf);
      archiveFilterDrawerOpenRaf = 0;
    }
    if (root.hasAttribute("hidden")) {
      document.body.classList.remove("archive-ui--filter-drawer");
      return;
    }

    const sheet = root.querySelector(".archive-filter-drawer__sheet");
    const finalize = () => {
      if (root.hasAttribute("hidden")) return;
      root.setAttribute("hidden", "");
      root.setAttribute("aria-hidden", "true");
      root.classList.remove("archive-filter-drawer--visible");
      openBtn?.setAttribute("aria-expanded", "false");
      document.body.classList.remove("archive-ui--filter-drawer");
      const el = archiveFilterDrawerFocusReturn;
      archiveFilterDrawerFocusReturn = null;
      if (el && typeof el.focus === "function") {
        try {
          el.focus();
        } catch {
          /* ignore */
        }
      }
    };

    if (!root.classList.contains("archive-filter-drawer--visible")) {
      finalize();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      sheet?.removeEventListener("transitionend", onTrans);
      clearTimeout(safety);
      finalize();
    };
    const onTrans = (e) => {
      if (e.target !== sheet || e.propertyName !== "transform") return;
      finish();
    };
    sheet?.addEventListener("transitionend", onTrans);
    const safety = setTimeout(finish, 420);
    root.classList.remove("archive-filter-drawer--visible");
  }

  function wireArchiveBrowseToolControls() {
    const sortSel = document.getElementById("archive-sort");
    if (sortSel && sortSel.dataset.twSortWired !== "1") {
      sortSel.dataset.twSortWired = "1";
      sortSel.value = archiveSortMode;
      sortSel.addEventListener("change", () => {
        archiveSortMode = persistArchiveSortMode(sortSel.value);
        renderGrid();
      });
    }

    const drawerOpen = document.getElementById("archive-filter-drawer-open");
    const drawerRoot = document.getElementById("archive-filter-drawer");
    if (drawerRoot && drawerOpen && drawerRoot.dataset.twDrawerUiWired !== "1") {
      drawerRoot.dataset.twDrawerUiWired = "1";
      drawerOpen.addEventListener("click", () => openArchiveFilterDrawer());
      document.getElementById("archive-filter-drawer-backdrop")?.addEventListener("click", () => closeArchiveFilterDrawer());
      document.getElementById("archive-filter-drawer-close")?.addEventListener("click", () => closeArchiveFilterDrawer());
      document.getElementById("archive-filter-drawer-done")?.addEventListener("click", () => closeArchiveFilterDrawer());
      if (document.body.dataset.twFilterDrawerEscapeWired !== "1") {
        document.body.dataset.twFilterDrawerEscapeWired = "1";
        document.addEventListener(
          "keydown",
          (e) => {
            if (e.key !== "Escape") return;
            const r = document.getElementById("archive-filter-drawer");
            if (!r || r.hasAttribute("hidden")) return;
            closeArchiveFilterDrawer();
          },
          true
        );
      }
    }

    const chipWrap = document.getElementById("archive-colour-chips");
    if (chipWrap && chipWrap.dataset.twColourWired !== "1") {
      chipWrap.dataset.twColourWired = "1";
      syncBasicColourFilterChipUi();
    }
  }

  function forceCloseHeaderSearchOverlay() {
    const headerSearchWrap = document.getElementById("site-header-search-wrap");
    const headerSearchBtn = document.getElementById("site-header-search-btn");
    if (!headerSearchWrap?.classList.contains("is-open")) return;
    headerSearchWrap.classList.remove("is-open");
    headerSearchWrap.setAttribute("aria-hidden", "true");
    headerSearchBtn?.setAttribute("aria-expanded", "false");
    headerSearchBtn?.setAttribute("aria-label", "Open search");
    document.body.classList.remove("archive-ui--header-search-open");
  }

  /** Safety: release scroll lock if drawer/search are not actually open (handles fast open/close races). */
  function ensureBodyScrollUnlockedWhenNoOverlay() {
    const drawerRoot = document.getElementById("archive-filter-drawer");
    const drawerOpen = !!drawerRoot && !drawerRoot.hasAttribute("hidden");
    const headerSearchOpen = document.getElementById("site-header-search-wrap")?.classList.contains("is-open");
    if (!drawerOpen && !headerSearchOpen) {
      document.body.classList.remove("archive-ui--filter-drawer");
    }
  }

  /** Desktop (wider than 900px): scroll direction toggles `archive-ui--nav-folded` (hides branding shell). Search stays in the expanded header with filters — no floating magnifier while folded. */
  const ENABLE_ARCHIVE_NAV_SCROLL_FOLD = true;

  let archiveNavScrollFoldLastY = 0;
  let archiveNavScrollFoldTicking = false;

  /** Scroll fold: hide desktop header chrome while scrolling down on the archive page (`#filters-nav` removed — optional menu state kept for compatibility). */
  function initArchiveNavScrollFold(afterWindowScrollFold) {
    if (!ENABLE_ARCHIVE_NAV_SCROLL_FOLD) {
      document.body.classList.remove("archive-ui--nav-folded");
      return;
    }
    if (!document.getElementById("grid")) return;
    const filtersNav = document.getElementById("filters-nav");
    const body = document.body;

    function onScrollNavFold() {
      afterWindowScrollFold?.();
      if (archiveNavScrollFoldTicking) return;
      archiveNavScrollFoldTicking = true;
      requestAnimationFrame(() => {
        try {
          archiveNavScrollFoldTicking = false;
          if (isFiltersNarrowViewport()) {
            body.classList.remove("archive-ui--nav-folded");
            archiveNavScrollFoldLastY = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
            return;
          }
          if (body.classList.contains("archive-ui--header-submenu-open")) {
            body.classList.remove("archive-ui--nav-folded");
            archiveNavScrollFoldLastY = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
            return;
          }
          const y = globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
          const dy = y - archiveNavScrollFoldLastY;
          if (filtersNav?.classList.contains("filters--menu-open")) {
            body.classList.remove("archive-ui--nav-folded");
            archiveNavScrollFoldLastY = y;
            return;
          }
          const folded = body.classList.contains("archive-ui--nav-folded");
          if (y < 48) {
            if (folded) body.classList.remove("archive-ui--nav-folded");
          } else if (dy > 6) {
            if (!folded) {
              body.classList.add("archive-ui--nav-folded");
              forceCloseHeaderSearchOverlay();
            }
          } else if (dy < -6) {
            if (folded) body.classList.remove("archive-ui--nav-folded");
          }
          archiveNavScrollFoldLastY = y;
        } catch {
          /* ignore */
        }
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
      if (id && key) pushOutfitSlot({ itemId: id, colourKey: key });
    });
    dlg?.addEventListener("click", (e) => {
      if (e.target === dlg) {
        pendingOutfitVariantItemId = null;
        dlg.close();
      }
    });
  }

  function wireEvents() {
    const jumpHeaderCategory = (jump) => {
      categoryNavFilter = SLOT_OPTIONS.includes(jump) ? jump : "";
      subcategoryFilter = "";
      syncCategoryTabUI();
      validateSubcategoryFilter();
      renderCategoryDrill();
      renderGrid();
      scrollArchiveViewportTop();
    };

    let headerSubmenuHideTimer = 0;
    let headerSubmenuSwitchAnimTimer = 0;
    let headerSubmenuOpenAnimTimer = 0;
    let headerSubmenuActiveSlot = "";
    const cancelHeaderSubmenuHide = () => {
      if (!headerSubmenuHideTimer) return;
      clearTimeout(headerSubmenuHideTimer);
      headerSubmenuHideTimer = 0;
    };
    const scheduleHeaderSubmenuHide = (delayMs = 90) => {
      cancelHeaderSubmenuHide();
      headerSubmenuHideTimer = setTimeout(() => {
        headerSubmenuHideTimer = 0;
        hideHeaderSubmenu();
      }, delayMs);
    };

    const hideHeaderSubmenu = () => {
      cancelHeaderSubmenuHide();
      if (headerSubmenuSwitchAnimTimer) {
        clearTimeout(headerSubmenuSwitchAnimTimer);
        headerSubmenuSwitchAnimTimer = 0;
      }
      if (headerSubmenuOpenAnimTimer) {
        clearTimeout(headerSubmenuOpenAnimTimer);
        headerSubmenuOpenAnimTimer = 0;
      }
      const wrap = document.getElementById("site-header-submenu");
      if (!wrap) return;
      wrap.hidden = true;
      wrap.classList.remove("site-header__submenu--opening");
      wrap.classList.remove("site-header__submenu--switching");
      document.body.classList.remove("archive-ui--header-submenu-open");
      headerSubmenuActiveSlot = "";
      const title = document.getElementById("site-header-submenu-title");
      const links = document.getElementById("site-header-submenu-links");
      const preview = document.getElementById("site-header-submenu-preview");
      if (title) title.textContent = "";
      if (links) links.replaceChildren();
      if (preview) preview.replaceChildren();
    };

    const headerMenuBtn = document.getElementById("site-header-menu-btn");
    const headerMobilePanel = document.getElementById("site-header-mobile-panel");
    const siteHeaderEl = document.querySelector(".site-header");
    const headerSearchBtn = document.getElementById("site-header-search-btn");
    const headerSearchWrap = document.getElementById("site-header-search-wrap");
    const headerSearchInput = /** @type {HTMLInputElement | null} */ (document.getElementById("filter-search"));
    let fullscreenSearchArmScrollDismissMs = 0;
    const closeHeaderSearch = ({ clear = false } = {}) => {
      if (!headerSearchWrap) return;
      const wasOpen = headerSearchWrap.classList.contains("is-open");
      const ae = document.activeElement;
      const refocusMagnifier =
        wasOpen &&
        !!headerSearchBtn &&
        ae instanceof Element &&
        (ae === headerSearchInput || headerSearchWrap.contains(ae));
      fullscreenSearchArmScrollDismissMs = 0;
      headerSearchWrap.classList.remove("is-open");
      headerSearchWrap.setAttribute("aria-hidden", "true");
      headerSearchBtn?.setAttribute("aria-expanded", "false");
      headerSearchBtn?.setAttribute("aria-label", "Open search");
      document.body.classList.remove("archive-ui--header-search-open");
      if (clear && headerSearchInput) {
        cancelSearchGridDebounce();
        headerSearchInput.value = "";
        syncFilterSearchClearVisibility();
        renderGrid();
      }
      if (refocusMagnifier) queueMicrotask(() => headerSearchBtn?.focus({ preventScroll: true }));
      ensureBodyScrollUnlockedWhenNoOverlay();
    };

    function isHeaderSearchDropdownLayout() {
      return globalThis.matchMedia?.("(min-width: 901px)")?.matches ?? false;
    }

    function isHeaderCompactLayout() {
      return globalThis.matchMedia?.("(max-width: 900px)")?.matches ?? false;
    }

    function syncMobileCategoryPanelTop() {
      if (!isHeaderCompactLayout() || !siteHeaderEl) return;
      const h = Math.ceil(siteHeaderEl.getBoundingClientRect().height) + 2;
      document.documentElement.style.setProperty("--site-header-mobile-panel-top", `${Math.max(h, 48)}px`);
    }

    function closeMobileCategoryPanel() {
      if (!headerMobilePanel) return;
      headerMobilePanel.classList.remove("is-open");
      headerMobilePanel.setAttribute("aria-hidden", "true");
      headerMobilePanel.querySelectorAll(".site-header__mobile-link.is-open").forEach((el) => el.classList.remove("is-open"));
      headerMobilePanel.querySelectorAll(".site-header__mobile-submenu.is-open").forEach((el) => el.classList.remove("is-open"));
      headerMenuBtn?.setAttribute("aria-expanded", "false");
      headerMenuBtn?.setAttribute("aria-label", "Open categories menu");
      document.body.classList.remove("archive-ui--mobile-nav-open");
    }

    function openMobileCategoryPanel() {
      if (!headerMobilePanel) return;
      syncMobileCategoryPanelTop();
      headerMobilePanel.classList.add("is-open");
      headerMobilePanel.setAttribute("aria-hidden", "false");
      document.body.classList.add("archive-ui--mobile-nav-open");
      headerMenuBtn?.setAttribute("aria-expanded", "true");
      headerMenuBtn?.setAttribute("aria-label", "Close categories menu");
      requestAnimationFrame(() => {
        syncMobileCategoryPanelTop();
      });
    }

    const renderHeaderSubmenuPreview = (slot, subcategory) => {
      const preview = document.getElementById("site-header-submenu-preview");
      if (!preview) return;
      const pool = items.filter((it) => itemPassesSeasonNav(it, seasonNavFilter) && itemSlot(it) === slot);
      const sub = String(subcategory ?? "").trim();
      const matches = pool
        .filter((it) => (!sub ? true : recordCategoryForDrill(it, slot) === sub))
        .sort(compareGridItems)
        .slice(0, 4);
      preview.replaceChildren();
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "site-header__submenu-preview-empty";
        empty.textContent = "No items in this type yet.";
        preview.appendChild(empty);
        return;
      }
      for (const item of matches) {
        const a = document.createElement("a");
        a.className = "site-header__submenu-preview-card";
        const detailUrl = new URL("item.html", globalThis.location.href);
        detailUrl.searchParams.set("id", String(item.id));
        a.href = detailUrl.toString();
        const media = document.createElement("div");
        media.className = "site-header__submenu-preview-media";
        const im = document.createElement("img");
        im.alt = imageAltForItem(item);
        im.loading = "lazy";
        wireCoverImageWithFallbacks(im, item, { host: media, missingClass: null });
        media.appendChild(im);
        const nm = document.createElement("p");
        nm.className = "site-header__submenu-preview-name";
        nm.textContent = `${item.brand} · ${displayNameWithoutLeadingColour(item)}`;
        a.appendChild(media);
        a.appendChild(nm);
        preview.appendChild(a);
      }
    };

    const showHeaderSubmenuForCategory = (jump) => {
      cancelHeaderSubmenuHide();
      const searchW = document.getElementById("site-header-search-wrap");
      if (searchW?.classList.contains("is-open")) closeHeaderSearch();
      const slot = String(jump ?? "").trim();
      const wrap = document.getElementById("site-header-submenu");
      const title = document.getElementById("site-header-submenu-title");
      const links = document.getElementById("site-header-submenu-links");
      if (!wrap || !title || !links) return;
      if (!slot || !SLOT_OPTIONS.includes(slot)) {
        hideHeaderSubmenu();
        return;
      }
      const openingNow = wrap.hidden;
      if (openingNow) {
        if (headerSubmenuOpenAnimTimer) {
          clearTimeout(headerSubmenuOpenAnimTimer);
          headerSubmenuOpenAnimTimer = 0;
        }
        wrap.classList.remove("site-header__submenu--opening");
      }
      const switchingSlot = !wrap.hidden && headerSubmenuActiveSlot && headerSubmenuActiveSlot !== slot;
      if (switchingSlot) {
        if (headerSubmenuSwitchAnimTimer) {
          clearTimeout(headerSubmenuSwitchAnimTimer);
          headerSubmenuSwitchAnimTimer = 0;
        }
        wrap.classList.remove("site-header__submenu--switching");
        void wrap.offsetWidth;
        wrap.classList.add("site-header__submenu--switching");
        headerSubmenuSwitchAnimTimer = setTimeout(() => {
          headerSubmenuSwitchAnimTimer = 0;
          wrap.classList.remove("site-header__submenu--switching");
        }, 320);
      }

      const seasonalPool = poolItemsForDrillSubcategories({ respectCategory: false });
      const keys = [...new Set(drillSubcategoryKeysFromPool(slot, seasonalPool).filter(Boolean))];
      const dedupedEntries = [];
      const seenLabels = new Set();
      for (const raw of keys) {
        const label = friendlyRecordCategory(raw) || raw;
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);
        dedupedEntries.push({ raw, label });
      }
      const hasPreviewOnly = slot === SLOT_FRAGRANCE || slot === SLOT_WATCHES;
      if (dedupedEntries.length <= 1 && !hasPreviewOnly) {
        hideHeaderSubmenu();
        return;
      }

      wrap.classList.toggle("site-header__submenu--preview-only", hasPreviewOnly);
      links.replaceChildren();
      title.textContent = "";
      if (hasPreviewOnly) {
        renderHeaderSubmenuPreview(slot, "");
        wrap.hidden = false;
        if (openingNow) {
          void wrap.offsetWidth;
          wrap.classList.add("site-header__submenu--opening");
          headerSubmenuOpenAnimTimer = setTimeout(() => {
            headerSubmenuOpenAnimTimer = 0;
            wrap.classList.remove("site-header__submenu--opening");
          }, 560);
        }
        document.body.classList.add("archive-ui--header-submenu-open");
        headerSubmenuActiveSlot = slot;
        return;
      }

      dedupedEntries.forEach(({ raw, label }, idx) => {
        const a = document.createElement("a");
        a.href = "#main";
        a.className = "site-header__submenu-link";
        a.textContent = label;
        a.setAttribute("data-category-jump", slot);
        a.setAttribute("data-subcategory-jump", raw);
        if (idx === 0) a.classList.add("is-active");
        a.addEventListener("pointerenter", () => {
          links.querySelectorAll(".site-header__submenu-link.is-active").forEach((n) => n.classList.remove("is-active"));
          a.classList.add("is-active");
          renderHeaderSubmenuPreview(slot, raw);
        });
        a.addEventListener("focus", () => {
          links.querySelectorAll(".site-header__submenu-link.is-active").forEach((n) => n.classList.remove("is-active"));
          a.classList.add("is-active");
          renderHeaderSubmenuPreview(slot, raw);
        });
        links.appendChild(a);
      });
      renderHeaderSubmenuPreview(slot, dedupedEntries[0]?.raw || "");
      wrap.hidden = false;
      if (openingNow) {
        void wrap.offsetWidth;
        wrap.classList.add("site-header__submenu--opening");
        headerSubmenuOpenAnimTimer = setTimeout(() => {
          headerSubmenuOpenAnimTimer = 0;
          wrap.classList.remove("site-header__submenu--opening");
        }, 560);
      }
      document.body.classList.add("archive-ui--header-submenu-open");
      headerSubmenuActiveSlot = slot;
    };

    const headerCategoryNav = document.querySelector(".site-header__primary-nav");
    const headerBrandNav = document.querySelector(".site-header__brand-nav");
    if (headerCategoryNav) {
      headerCategoryNav.addEventListener("click", (e) => {
        const link = e.target.closest("[data-category-jump]");
        if (!link) return;
        e.preventDefault();
        const jump = String(link.getAttribute("data-category-jump") ?? "").trim();
        jumpHeaderCategory(jump);
        hideHeaderSubmenu();
      });
      headerCategoryNav.addEventListener("pointerover", (e) => {
        if (isFiltersNarrowViewport()) return;
        closeHeaderSearch();
        const link = e.target.closest("[data-category-jump]");
        if (!link) return;
        const jump = String(link.getAttribute("data-category-jump") ?? "").trim();
        showHeaderSubmenuForCategory(jump);
      });
      headerCategoryNav.addEventListener("focusin", (e) => {
        if (isFiltersNarrowViewport()) return;
        const link = e.target.closest("[data-category-jump]");
        if (!link) return;
        const jump = String(link.getAttribute("data-category-jump") ?? "").trim();
        showHeaderSubmenuForCategory(jump);
      });
    }

    const headerHome = document.getElementById("site-header-home");
    headerHome?.addEventListener("click", (e) => {
      e.preventDefault();
      resetAllArchiveFilters();
      hideHeaderSubmenu();
      closeMobileCategoryPanel();
      collapseFiltersMenuPanel();
      scrollArchiveViewportTop();
    });

    const headerSubmenuRoot = document.getElementById("site-header-submenu");

    siteHeaderEl?.addEventListener("pointerenter", () => {
      if (isFiltersNarrowViewport()) return;
      cancelHeaderSubmenuHide();
    });

    headerSubmenuRoot?.addEventListener("pointerenter", () => {
      if (isFiltersNarrowViewport()) return;
      cancelHeaderSubmenuHide();
    });

    headerSubmenuRoot?.addEventListener("pointerleave", (e) => {
      if (isFiltersNarrowViewport()) return;
      const to = e.relatedTarget;
      if (!(to instanceof Element)) {
        scheduleHeaderSubmenuHide(260);
        return;
      }
      if (siteHeaderEl?.contains(to)) return;
      scheduleHeaderSubmenuHide(100);
    });

    headerCategoryNav?.addEventListener("pointerleave", (e) => {
      if (isFiltersNarrowViewport()) return;
      const sub = document.getElementById("site-header-submenu");
      if (!sub || sub.hidden) return;
      const to = e.relatedTarget;
      if (!(to instanceof Element)) {
        scheduleHeaderSubmenuHide(260);
        return;
      }
      if (sub.contains(to)) return;
      if (headerCategoryNav.contains(to)) return;
      if (siteHeaderEl?.contains(to)) return;
      scheduleHeaderSubmenuHide(100);
    });

    /** Tap / click outside the header closes the mega panel (hover alone uses pointerleave above). */
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (isFiltersNarrowViewport()) return;
        const sub = document.getElementById("site-header-submenu");
        if (!sub || sub.hidden) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (siteHeaderEl?.contains(t)) return;
        hideHeaderSubmenu();
      },
      true
    );

    const headerSubmenuLinks = document.getElementById("site-header-submenu-links");
    headerSubmenuLinks?.addEventListener("click", (e) => {
      const link = e.target.closest("[data-category-jump]");
      if (!link) return;
      e.preventDefault();
      const jump = String(link.getAttribute("data-category-jump") ?? "").trim();
      const sub = String(link.getAttribute("data-subcategory-jump") ?? "").trim();
      categoryNavFilter = SLOT_OPTIONS.includes(jump) ? jump : "";
      subcategoryFilter = sub;
      syncCategoryTabUI();
      validateSubcategoryFilter();
      renderCategoryDrill();
      renderGrid();
      scrollArchiveViewportTop();
      hideHeaderSubmenu();
    });
    headerSubmenuLinks?.addEventListener("focusout", () => {
      if (isFiltersNarrowViewport()) return;
      queueMicrotask(() => {
        const active = document.activeElement;
        const wrap = document.querySelector(".site-header__inner");
        if (!(active instanceof Element) || !wrap?.contains(active)) {
          hideHeaderSubmenu();
        }
      });
    });

    headerSearchBtn?.addEventListener("click", () => {
      if (!headerSearchWrap) return;
      const open = !headerSearchWrap.classList.contains("is-open");
      headerSearchWrap.classList.toggle("is-open", open);
      headerSearchWrap.setAttribute("aria-hidden", open ? "false" : "true");
      headerSearchBtn.setAttribute("aria-expanded", open ? "true" : "false");
      headerSearchBtn.setAttribute("aria-label", open ? "Close search" : "Open search");
      if (open) {
        fullscreenSearchArmScrollDismissMs = Date.now();
        hideHeaderSubmenu();
        closeMobileCategoryPanel();
        if (isHeaderSearchDropdownLayout()) {
          document.body.classList.add("archive-ui--header-search-open");
        }
        queueMicrotask(() => headerSearchInput?.focus());
      } else {
        closeHeaderSearch();
      }
    });
    document.getElementById("site-header-search-close")?.addEventListener("click", () => {
      closeHeaderSearch();
    });
    headerSearchWrap?.addEventListener("click", (e) => {
      const chip = /** @type {HTMLElement | null} */ (e.target.closest("[data-trending-search]"));
      if (chip && headerSearchWrap.contains(chip)) {
        e.preventDefault();
        const q = String(chip.getAttribute("data-trending-search") ?? "").trim();
        if (headerSearchInput && q) {
          headerSearchInput.value = q;
          syncFilterSearchClearVisibility();
          scheduleRenderGridFromSearchInput();
          queueMicrotask(() => headerSearchInput.focus());
        }
        return;
      }
      const a = e.target.closest(".site-header__search-aside-link[data-category-jump], .site-header__search-category-card[data-category-jump]");
      if (!a || !headerSearchWrap?.contains(a)) return;
      e.preventDefault();
      const jump = String(a.getAttribute("data-category-jump") ?? "").trim();
      jumpHeaderCategory(jump);
      hideHeaderSubmenu();
      closeHeaderSearch();
    });
    headerMenuBtn?.addEventListener("click", () => {
      if (!headerMobilePanel) return;
      const open = !headerMobilePanel.classList.contains("is-open");
      if (open) {
        closeHeaderSearch();
        hideHeaderSubmenu();
        openMobileCategoryPanel();
      } else {
        closeMobileCategoryPanel();
      }
    });
    headerMobilePanel?.addEventListener("click", (e) => {
      const link = e.target.closest("[data-category-jump]");
      if (!link) return;
      e.preventDefault();
      const jump = String(link.getAttribute("data-category-jump") ?? "").trim();
      const topLevel = link.classList.contains("site-header__mobile-link");
      if (topLevel && SLOT_OPTIONS.includes(jump)) {
        const seasonalPool = poolItemsForDrillSubcategories({ respectCategory: false });
        const keys = [...new Set(drillSubcategoryKeysFromPool(jump, seasonalPool).filter(Boolean))];
        const old = link.nextElementSibling;
        if (old?.classList?.contains("site-header__mobile-submenu")) {
          const open = !old.classList.contains("is-open");
          headerMobilePanel.querySelectorAll(".site-header__mobile-link.is-open").forEach((el) => el.classList.remove("is-open"));
          headerMobilePanel
            .querySelectorAll(".site-header__mobile-submenu.is-open")
            .forEach((el) => el.classList.remove("is-open"));
          if (open) {
            old.classList.add("is-open");
            link.classList.add("is-open");
          }
          return;
        }
        if (keys.length > 1) {
          const sub = document.createElement("div");
          sub.className = "site-header__mobile-submenu is-open";
          for (const k of keys) {
            const a = document.createElement("a");
            a.href = "#main";
            a.className = "site-header__mobile-submenu-link";
            a.setAttribute("data-category-jump", jump);
            a.setAttribute("data-subcategory-jump", k);
            a.textContent = friendlyRecordCategory(k) || k;
            sub.appendChild(a);
          }
          headerMobilePanel.querySelectorAll(".site-header__mobile-link.is-open").forEach((el) => el.classList.remove("is-open"));
          headerMobilePanel
            .querySelectorAll(".site-header__mobile-submenu.is-open")
            .forEach((el) => el.classList.remove("is-open"));
          link.classList.add("is-open");
          link.after(sub);
          return;
        }
      }
      const sub = String(link.getAttribute("data-subcategory-jump") ?? "").trim();
      categoryNavFilter = SLOT_OPTIONS.includes(jump) ? jump : "";
      subcategoryFilter = sub;
      syncCategoryTabUI();
      validateSubcategoryFilter();
      renderCategoryDrill();
      renderGrid();
      scrollArchiveViewportTop();
      closeMobileCategoryPanel();
      collapseFiltersMenuPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (headerMobilePanel?.classList.contains("is-open")) {
        closeMobileCategoryPanel();
      }
      if (headerSearchWrap?.classList.contains("is-open")) {
        closeHeaderSearch();
      }
      const sub = document.getElementById("site-header-submenu");
      if (sub && !sub.hidden) {
        hideHeaderSubmenu();
      }
    });
    /** Enter or scroll collapses fullscreen search overlay (results underneath look odd if it stays open). */
    const dismissFullscreenSearchUnlessClosed = () => {
      if (!headerSearchWrap?.classList.contains("is-open")) return;
      const armed = fullscreenSearchArmScrollDismissMs;
      if (armed && Date.now() - armed < 160) return;
      closeHeaderSearch();
    };

    headerSearchWrap?.addEventListener(
      "wheel",
      () => {
        if (isHeaderSearchDropdownLayout()) return;
        dismissFullscreenSearchUnlessClosed();
      },
      { passive: true, capture: true }
    );
    document.addEventListener("click", (e) => {
      if (!headerMobilePanel?.classList.contains("is-open")) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (headerMobilePanel.contains(t)) return;
      if (headerMenuBtn?.contains(t)) return;
      closeMobileCategoryPanel();
    });
    document.addEventListener("click", (e) => {
      if (!headerSearchWrap?.classList.contains("is-open")) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      const surface = t.closest(".site-header__search-surface");
      if (surface) return;
      if (headerSearchBtn?.contains(t)) return;
      closeHeaderSearch();
    });
    if (document.body.dataset.twStrictFilePickerClickWired !== "1") {
      document.body.dataset.twStrictFilePickerClickWired = "1";
      document.addEventListener(
        "click",
        (e) => {
          const t = e.target;
          if (!(t instanceof Element)) return;
          const label = t.closest("label.field--file");
          if (!label) return;
          const input = label.querySelector('input[type="file"]');
          if (!input) return;
          if (t === input) return;
          e.preventDefault();
        },
        true
      );
    }
    globalThis.matchMedia?.("(max-width: 900px)")?.addEventListener?.("change", (ev) => {
      if (ev.matches) return;
      closeMobileCategoryPanel();
      hideHeaderSubmenu();
      closeHeaderSearch();
      ensureBodyScrollUnlockedWhenNoOverlay();
    });

    if (isFiltersNarrowViewport()) {
      closeMobileCategoryPanel();
      closeHeaderSearch();
      ensureBodyScrollUnlockedWhenNoOverlay();
    }

    globalThis.addEventListener(
      "resize",
      () => {
        if (headerMobilePanel?.classList.contains("is-open")) syncMobileCategoryPanelTop();
      },
      { passive: true }
    );

    const seasonMini = document.getElementById("season-nav-mini");
    seasonMini?.addEventListener("click", (e) => {
      const tab = e.target.closest(".site-header__season-mini-tab");
      if (!tab) return;
      const v = String(tab.dataset.seasonFilter ?? "").trim();
      if (v !== "S/S" && v !== "A/W") return;
      seasonNavFilter = seasonNavFilter === v ? "All" : v;
      persistSeasonNav();
      subcategoryFilter = "";
      syncSeasonTabUI();
      validateSubcategoryFilter();
      renderCategoryDrill();
      renderGrid();
    });

    const savedToggleBtn = document.getElementById("site-header-saved-toggle");
    savedToggleBtn?.addEventListener("click", () => {
      const dock = document.getElementById("outfit-dock");
      if (!dock) return;
      outfitDockUserToggled = dock.hidden;
      syncOutfitBuilderPanel();
    });

    els.emptyReset?.addEventListener("click", () => {
      resetNarrowingFilters();
      showToast("Category, type, and search cleared.");
    });

    const seasonNav = document.getElementById("season-nav");
    if (seasonNav) {
      seasonNav.addEventListener("click", (e) => {
        const seasonTab = e.target.closest(".season-strip__tab");
        if (!seasonTab) return;
        const v = String(seasonTab.dataset.seasonFilter ?? "").trim();
        if (v !== "S/S" && v !== "A/W") return;
        seasonNavFilter = seasonNavFilter === v ? "All" : v;
        persistSeasonNav();
        subcategoryFilter = "";
        syncSeasonTabUI();
        validateSubcategoryFilter();
        renderCategoryDrill();
        renderGrid();
      });
    }

    const categoryDrill = document.getElementById("category-drill");
    if (categoryDrill) {
      categoryDrill.addEventListener("click", (e) => {
        const choice = e.target.closest(".category-drill__choice");
        if (!choice) return;
        subcategoryFilter = choice.dataset.subcategory ?? "";
        renderCategoryDrill();
        renderGrid();
        scrollArchiveViewportTop();
        collapseFiltersMenuPanel();
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

    els.search?.addEventListener("input", scheduleRenderGridFromSearchInput);
    els.search?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.isComposing) return;
      e.preventDefault();
      flushSearchGridDebounceIfPending();
      if (headerSearchWrap?.classList.contains("is-open")) closeHeaderSearch();
    });
    els.search?.addEventListener("blur", flushSearchGridDebounceIfPending);

    els.searchChip?.addEventListener("click", () => clearArchiveKeywordSearchThenRender());

    els.colourChip?.addEventListener("click", () => {
      if (!basicColourFilter) return;
      basicColourFilter = persistBasicColourFilter("");
      renderGrid();
    });

    els.categoryChip?.addEventListener("click", () => {
      if (!categoryNavFilter) return;
      categoryNavFilter = "";
      subcategoryFilter = "";
      syncCategoryTabUI();
      renderCategoryDrill();
      renderGrid();
    });

    els.subcategoryChip?.addEventListener("click", () => {
      if (!String(subcategoryFilter ?? "").trim()) return;
      subcategoryFilter = "";
      renderCategoryDrill();
      renderGrid();
    });

    els.searchClear?.addEventListener("click", () => clearArchiveKeywordSearchThenRender());

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
      globalThis.matchMedia?.("(max-width: 900px)")?.addEventListener?.("change", () => {
        syncFiltersMenuForViewport();
      });
    }

    initArchiveNavScrollFold(dismissFullscreenSearchUnlessClosed);

    globalThis.addEventListener("pageshow", (e) => {
      const pe = /** @type {PageTransitionEvent} */ (e);
      if (!pe.persisted) return;
      if (!document.getElementById("grid")) return;
      void (async () => {
        try {
          if (isSupabaseReady()) {
            await hydrateArchiveAndSeasonState();
          }
          await refreshCloudBackedCustomItems();
          renderOutfitStrip();
          renderSavedOutfits();
        } catch (err) {
          console.warn("bfcache restore refresh failed", err);
        }
      })();
    });
  }

  function seedItemsFromScript() {
    return typeof WARDROBE_ITEMS !== "undefined" && Array.isArray(WARDROBE_ITEMS)
      ? WARDROBE_ITEMS
      : [];
  }

  async function loadFileBackedCustomItems() {
    try {
      const res = await fetch("data/custom-items.json", { cache: "no-store" });
      if (!res.ok) return [];
      return normalizeCustomItemRows(await res.json());
    } catch (e) {
      console.warn("data/custom-items.json", e);
      return [];
    }
  }

  /** Merge cloud `wardrobe_items` rows into in-memory catalogue by `id` (seed catalogue + extra cloud rows). */
  function mergeWardrobeBaseWithFetchedCloudRows(cloudRows) {
    if (!Array.isArray(cloudRows) || !cloudRows.length) return;
    const byId = new Map();
    for (const raw of cloudRows) {
      const n =
        raw && typeof raw === "object" && raw.__source === "supabase"
          ? normalizeItemDerivedFields({ ...raw })
          : normalizeCloudItemRow(raw);
      if (n) byId.set(String(n.id), { ...n });
    }
    wardrobeBase = wardrobeBase.map((row) => {
      if (!row || row.id == null) return row;
      const hit = byId.get(String(row.id));
      return hit ? { ...hit } : { ...row };
    });
    const have = new Set(wardrobeBase.map((r) => String(r?.id ?? "")));
    for (const [iid, row] of byId) {
      if (!have.has(iid)) {
        wardrobeBase.push({ ...row });
        have.add(iid);
      }
    }
  }

  /** Upsert one normalized row in `wardrobeBase` so UI can reflect successful cloud save immediately. */
  function upsertWardrobeBaseRowInMemory(row) {
    const id = String(row?.id ?? "").trim();
    if (!id) return;
    let replaced = false;
    wardrobeBase = wardrobeBase.map((r) => {
      if (String(r?.id ?? "") !== id) return r;
      replaced = true;
      return { ...row };
    });
    if (!replaced) wardrobeBase.push({ ...row });
  }

  async function refreshCloudBackedCustomItems() {
    if (!isCloudModeActive()) {
      cloudBackedCustomItems = [];
      mergeWardrobeFromSources();
      if (document.getElementById("grid")) {
        initFilters();
        onOutfitChange();
        renderGrid();
      }
      return cloudBackedCustomItems;
    }
    cloudBackedCustomItems = await loadWardrobeItemsFromCloud();
    if (cloudBackedCustomItems.length) {
      stripCustomIdsFromLocalStorage(cloudBackedCustomItems.map((r) => String(r?.id ?? "")));
      if (wardrobeCatalogueSource === "cloud") {
        wardrobeBase = cloudBackedCustomItems.map((r) => ({ ...r }));
      } else {
        mergeWardrobeBaseWithFetchedCloudRows(cloudBackedCustomItems);
      }
    }
    mergeWardrobeFromSources();
    if (document.getElementById("grid")) {
      initFilters();
      onOutfitChange();
      renderGrid();
    }
    return cloudBackedCustomItems;
  }

  /**
   * Defer sync work so the homepage can paint (`mergeWardrobeFromSources` → `renderGrid`) first.
   * Falls back where `requestIdleCallback` is unavailable (Safari older builds).
   * @param {() => void} fn
   */
  function scheduleHomepageDeferredWork(fn) {
    const ric = globalThis.requestIdleCallback;
    if (typeof ric === "function") {
      ric.call(globalThis, fn, { timeout: 4800 });
    } else {
      globalThis.requestAnimationFrame(() => {
        globalThis.setTimeout(fn, 400);
      });
    }
  }

  async function bootstrap() {
    let deferredSeedSyncSnapshot = /** @type {object[] | null} */ (null);
    const cfg = globalThis.APP_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || globalThis.__TW_SUPABASE_URL__ || "").trim();
    const key = String(cfg.SUPABASE_ANON_KEY || globalThis.__TW_SUPABASE_ANON_KEY__ || "").trim();

    if (url && key) {
      try {
        const api = await import("./js/supabase-client.js");
        supabaseClient = api.createBrowserClient(String(url).trim(), String(key).trim());
        if (supabaseClient) {
          storageMode = "cloud";
          let wardrobeFromSupabase = false;
          /** @type {Promise<{ ok: boolean, outfits?: unknown, error?: string }> | null} */
          let outfitsFetchPromise = null;
          const res = await api.fetchWardrobeItems(supabaseClient);
          if (res.ok && res.items.length) {
            wardrobeBase = res.items;
            wardrobeFromSupabase = true;
            wardrobeCatalogueSource = "cloud";
            deferredSeedSyncSnapshot = wardrobeBase.slice();
            outfitsFetchPromise = api.fetchOutfits(supabaseClient);
          } else {
            if (!res.ok) {
              console.warn("Supabase wardrobe_items:", res.error);
            } else {
              console.warn(
                "Supabase wardrobe_items returned 0 rows — falling back to data/wardrobe.js; run npm run db:import-seed."
              );
            }
            wardrobeBase = seedItemsFromScript();
            const cloudBackfillReportBlocking = await syncMissingRowsToSupabase([]);
            if (cloudBackfillReportBlocking && (cloudBackfillReportBlocking.synced > 0 || cloudBackfillReportBlocking.failed > 0)) {
              console.info(
                `Supabase backfill completed — synced: ${cloudBackfillReportBlocking.synced}, failed: ${cloudBackfillReportBlocking.failed}.`
              );
            }
            const cloudReloaded = await loadWardrobeItemsFromCloud();
            if (cloudReloaded.length) {
              wardrobeBase = cloudReloaded;
              wardrobeFromSupabase = true;
              wardrobeCatalogueSource = "cloud";
              outfitsFetchPromise = api.fetchOutfits(supabaseClient);
            } else {
              wardrobeCatalogueSource = "seed";
            }
          }

          if (wardrobeFromSupabase) {
            const outfitsRes = outfitsFetchPromise
              ? await outfitsFetchPromise
              : await api.fetchOutfits(supabaseClient);
            if (outfitsRes.ok) {
              savedOutfits = (outfitsRes.outfits || [])
                .map((o) => normalizeSavedOutfitRecord(o))
                .filter(Boolean);
              persistSavedOutfitsCache();
              useCloudOutfits = true;
            } else {
              const outfitsErr = String(outfitsRes.error || "").trim();
              if (
                isSupabaseSchemaTableMissingError(outfitsErr, "outfits") ||
                isSupabaseSchemaTableMissingError(outfitsErr, "outfit_items")
              ) {
                console.info(
                  "Supabase outfits tables not found yet (outfits/outfit_items). Falling back to browser-saved outfits."
                );
              } else {
                console.warn("Supabase outfits:", outfitsRes.error);
              }
              savedOutfits = loadSavedOutfitsFromStorage();
              useCloudOutfits = false;
            }
          } else {
            savedOutfits = loadSavedOutfitsFromStorage();
            useCloudOutfits = false;
          }
        }
      } catch (e) {
        deferredSeedSyncSnapshot = null;
        console.warn("Supabase unavailable, using local seed + cache.", e);
        supabaseClient = null;
        storageMode = "local";
        useCloudOutfits = false;
        wardrobeBase = seedItemsFromScript();
        wardrobeCatalogueSource = "seed";
        savedOutfits = loadSavedOutfitsFromStorage();
      }
    } else {
      storageMode = "local";
      wardrobeBase = seedItemsFromScript();
      wardrobeCatalogueSource = "seed";
      savedOutfits = loadSavedOutfitsFromStorage();
    }

    await hydrateArchiveAndSeasonState();

    if (isCloudModeActive()) {
      fileBackedCustomItems = [];
      if (wardrobeCatalogueSource === "cloud" && wardrobeBase.length) {
        cloudBackedCustomItems = wardrobeBase.map((r) => (r && typeof r === "object" ? { ...r } : /** @type {any} */ (r)));
        stripCustomIdsFromLocalStorage(cloudBackedCustomItems.map((r) => String(r?.id ?? "")));
      } else {
        cloudBackedCustomItems = await loadWardrobeItemsFromCloud();
        if (cloudBackedCustomItems.length) {
          stripCustomIdsFromLocalStorage(cloudBackedCustomItems.map((r) => String(r?.id ?? "")));
          mergeWardrobeBaseWithFetchedCloudRows(cloudBackedCustomItems);
        }
      }
    } else {
      fileBackedCustomItems = await loadFileBackedCustomItems();
      cloudBackedCustomItems = [];
    }
    mergeWardrobeFromSources();
    if (!items.length) {
      console.warn("No wardrobe items loaded.");
    }

    const seedSyncDeferredSnapshot = deferredSeedSyncSnapshot;
    deferredSeedSyncSnapshot = null;
    if (seedSyncDeferredSnapshot != null && isSupabaseReady()) {
      scheduleHomepageDeferredWork(() => {
        void (async () => {
          try {
            const report = await syncMissingRowsToSupabase(seedSyncDeferredSnapshot);
            if (report && ((report.synced ?? 0) > 0 || (report.failed ?? 0) > 0)) {
              console.info(
                `Supabase seed backfill (deferred): synced: ${report.synced}, failed: ${report.failed}.`
              );
            }
            if ((report?.synced ?? 0) > 0 && isCloudModeActive()) {
              await refreshCloudBackedCustomItems();
            }
          } catch (err) {
            console.warn("Deferred seed→cloud sync failed:", err);
          }
        })();
      });
    }

    const itemRoot = document.getElementById("item-detail-root");
    const hasArchiveGrid = Boolean(document.getElementById("grid"));
    const pageId = new URLSearchParams(globalThis.location.search).get("id");
    if (itemRoot && pageId && !hasArchiveGrid) {
      initItemDetailRootDelegates();
      installItemPageBackNavigation();
      await runItemDetailPage(itemRoot, pageId);
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
    syncOutfitBuilderPanel();
    consumeAndRestoreArchiveListScroll();
    if (hasArchiveGrid) {
      installLocalDataRiskBanner();
    }
  }

  void bootstrap();
})();
