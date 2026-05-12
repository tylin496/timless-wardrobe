# Supabase setup (Timeless Wardrobe MVP)

## What this gives you

- **`wardrobe_items`**: canonical archive rows (large seed imported once with the service role).
- **`outfits` / `outfit_items`**: saved looks with stable order (`sort_order`).
- **Browser**: loads `@supabase/supabase-js` from `esm.sh` via `js/supabase-client.js` (dynamic `import()`). If URL/key are missing or wardrobe fetch returns no rows, the app falls back to `data/wardrobe.js` + `localStorage` as before.

## 1. Create the database

1. Open your Supabase project → **SQL Editor**.
2. Paste the contents of `supabase/migrations/20250513000000_init_wardrobe.sql` and run it.
3. Paste the contents of `supabase/migrations/20250514100000_add_pillar_to_wardrobe.sql` and run it (adds `pillar` for thesis-line grouping: English Heritage / Mediterranean Leisure / Collections).
4. Paste the contents of `supabase/migrations/20250515120000_add_gallery_to_wardrobe.sql` and run it (adds `gallery` JSON array for extra images per item; `image` stays the cover).
5. Paste the contents of `supabase/migrations/20250518120000_wardrobe_size_measured.sql` and run it (adds optional `size` and `measured_dimensions` text columns).

(Alternatively use the Supabase CLI: `supabase db push` if you link a project — not required for this MVP.)

## 2. Environment variables

See **`.env.example`**.

- **`SUPABASE_URL`** / **`SUPABASE_ANON_KEY`**: used in the browser via `js/tw-supabase-config.js` (copy values from Dashboard → **Settings → API**). The vanilla static site does not read `.env` at runtime; copy the public values into that file (or inject them with a build step).
- **`SUPABASE_SERVICE_ROLE_KEY`**: **server-only**. Used by `npm run db:import-seed`. Never ship this in static HTML or commit it.

## 3. Import the seed (service role)

```bash
cd /path/to/timeless-wardrobe
npm install
cp .env.example .env   # then fill SUPABASE_* including SERVICE_ROLE
npm run db:import-seed
```

Optional JSON path:

```bash
npm run export:wardrobe-json
USE_JSON=1 npm run db:import-seed
```

## 4. Row Level Security (caveats)

The migration enables RLS with **prototype** policies:

- **`wardrobe_items`**: `anon` / `authenticated` may **SELECT** only. Writes use **`service_role`** (bypasses RLS) for the import script — keep that key secret.
- **`outfits` / `outfit_items`**: `anon` may **insert/update/delete** so a static site with only the anon key can manage outfits.

**Security:** anyone who has your **anon key** and project URL can change outfits tables. For a private archive this is often acceptable; if the key leaks, rotate it in the dashboard. **Replace these policies with auth (e.g. magic link) or Edge Functions + service role before a public deploy.** Comments in the SQL file repeat this.

## 5. Offline behaviour

- Empty `js/tw-supabase-config.js` URL/key → full offline: seed + `localStorage`.
- Configured client but **0** `wardrobe_items` rows → wardrobe falls back to `data/wardrobe.js`; outfits stay **`localStorage`** until the wardrobe loads successfully from Supabase and outfit fetch succeeds.

## 6. Later (Vercel / build)

You can replace `tw-supabase-config.js` with a build step that inlines `VITE_SUPABASE_*` or similar; keep the same global names or adjust `app.js` accordingly.
