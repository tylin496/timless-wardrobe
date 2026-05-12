/**
 * Browser Supabase URL + anon key for Timeless Wardrobe.
 * Copy anon key from Dashboard → Settings → API → Project API keys (anon, public).
 * Leave anon empty for offline-only mode (seed + localStorage); URL alone is ignored until key is set.
 */
globalThis.__TW_SUPABASE_URL__ =
  globalThis.__TW_SUPABASE_URL__ || "https://yyzrzmbsxphlhoqzikjn.supabase.co";
globalThis.__TW_SUPABASE_ANON_KEY__ = globalThis.__TW_SUPABASE_ANON_KEY__ || "";
