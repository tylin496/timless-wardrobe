-- Timeless Wardrobe — initial schema + RLS (personal prototype).
-- Replace anon write policies with auth (magic link / JWT) before any public deploy.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.wardrobe_items (
  id text primary key,
  section text not null default '',
  category text not null default '',
  brand text not null default '',
  name text not null default '',
  season text not null default '',
  color text not null default '',
  fabric text not null default '',
  weight text not null default '',
  image text not null default '',
  notes text not null default '',
  metadata jsonb
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  item_id text not null references public.wardrobe_items (id) on delete restrict,
  sort_order int not null,
  primary key (outfit_id, sort_order),
  constraint outfit_items_sort_order_non_negative check (sort_order >= 0)
);

create index if not exists outfit_items_item_id_idx on public.outfit_items (item_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- SECURITY NOTE (MVP / private prototype):
-- - anon may SELECT wardrobe_items (read-only archive).
-- - anon may INSERT/UPDATE/DELETE outfits + outfit_items so a static site with
--   only the anon key can sync outfits. Anyone with your anon key and project URL
--   can modify outfits. Rotate the anon key if exposed; replace with authenticated
--   policies before public deploy. Prefer service role + serverless API for writes
--   in production.

alter table public.wardrobe_items enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

-- wardrobe_items: public read for anon (replace with auth-scoped read later).
drop policy if exists "wardrobe_items_select_anon" on public.wardrobe_items;
create policy "wardrobe_items_select_anon"
  on public.wardrobe_items
  for select
  to anon, authenticated
  using (true);

-- No INSERT/UPDATE/DELETE on wardrobe_items for anon — use service role import script.

drop policy if exists "wardrobe_items_service_all" on public.wardrobe_items;
create policy "wardrobe_items_service_all"
  on public.wardrobe_items
  for all
  to service_role
  using (true)
  with check (true);

-- outfits / outfit_items: full CRUD for anon (prototype only; see comment above).

drop policy if exists "outfits_all_anon" on public.outfits;
create policy "outfits_all_anon"
  on public.outfits
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "outfit_items_all_anon" on public.outfit_items;
create policy "outfit_items_all_anon"
  on public.outfit_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "outfits_all_service" on public.outfits;
create policy "outfits_all_service"
  on public.outfits
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "outfit_items_all_service" on public.outfit_items;
create policy "outfit_items_all_service"
  on public.outfit_items
  for all
  to service_role
  using (true)
  with check (true);
