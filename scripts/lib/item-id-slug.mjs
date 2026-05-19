/**
 * Slug rules for wardrobe item ids (match product `name`, aligned with catalogue lock).
 */

/** @param {string} s */
export function slug(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/** @param {string} colour */
export function colourSlug(colour) {
  const raw = String(colour ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("#")) return slug(raw.replace(/^#/, ""));
  return slug(raw);
}

/**
 * Pick the lock id for a row when multiple lock ids share the same name slug.
 * @param {Record<string, unknown>} item
 * @param {string[]} candidates — unused lock ids matching name slug
 */
export function pickLockIdForItem(item, candidates) {
  const list = [...candidates].filter(Boolean);
  if (list.length === 1) return list[0];

  const cSlug = colourSlug(String(item.colour ?? ""));
  if (cSlug) {
    const exact = list.find((lid) => lid === `${slug(item.name)}-${cSlug}` || lid.endsWith(`-${cSlug}`));
    if (exact) return exact;
    const partial = list.find((lid) => cSlug.split("-").some((w) => w.length > 2 && lid.includes(w)));
    if (partial) return partial;
  }

  return list.sort()[0];
}

/**
 * @param {Record<string, unknown>} item
 * @param {string[]} lockIds — full frozen manifest
 * @param {Set<string>} assigned
 */
export function resolveTargetIdFromLock(item, lockIds, assigned) {
  const nameSlug = slug(item.name);
  const candidates = lockIds.filter(
    (lid) => lid === nameSlug || lid.startsWith(`${nameSlug}-`)
  );
  const free = candidates.filter((lid) => !assigned.has(lid));
  if (!free.length) {
    throw new Error(`No lock id for "${item.name}" (${item.id})`);
  }
  const pick = pickLockIdForItem(item, free);
  assigned.add(pick);
  return pick;
}

/**
 * Propose id for a new piece: slug(name), then -2, -3 if taken.
 * @param {string} name
 * @param {Set<string>} taken
 */
export function proposeItemIdFromName(name, taken) {
  const base = slug(name);
  if (!base) return "";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const cand = `${base}-${n}`;
    if (!taken.has(cand)) return cand;
  }
  return `${base}-${Date.now()}`;
}
