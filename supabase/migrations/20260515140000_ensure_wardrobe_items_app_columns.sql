-- Repair remote DBs that skipped migrations: add every column the browser app
-- and js/supabase-client.js expect on public.wardrobe_items.
-- Safe to run multiple times (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- Core columns from init (your table may only have a subset, e.g. season).
-- ---------------------------------------------------------------------------
alter table public.wardrobe_items
  add column if not exists section text not null default '';

alter table public.wardrobe_items
  add column if not exists category text not null default '';

alter table public.wardrobe_items
  add column if not exists brand text not null default '';

alter table public.wardrobe_items
  add column if not exists name text not null default '';

alter table public.wardrobe_items
  add column if not exists season text not null default '';

alter table public.wardrobe_items
  add column if not exists colour text not null default '';

alter table public.wardrobe_items
  add column if not exists colour_code text not null default '';

alter table public.wardrobe_items
  add column if not exists fabric text not null default '';

alter table public.wardrobe_items
  add column if not exists weight text not null default '';

alter table public.wardrobe_items
  add column if not exists image text not null default '';

alter table public.wardrobe_items
  add column if not exists notes text not null default '';

alter table public.wardrobe_items
  add column if not exists metadata jsonb;

-- ---------------------------------------------------------------------------
-- Pillar + later migrations
-- ---------------------------------------------------------------------------
alter table public.wardrobe_items
  add column if not exists pillar text not null default '';

update public.wardrobe_items
set pillar = case
  when section like '%A/W%' then 'English Heritage'
  when section like '%S/S%' then 'Mediterranean Leisure'
  else 'Collections'
end
where coalesce(pillar, '') = '';

create index if not exists wardrobe_items_pillar_idx on public.wardrobe_items (pillar);

alter table public.wardrobe_items
  add column if not exists gallery jsonb not null default '[]'::jsonb;

alter table public.wardrobe_items
  add column if not exists size text not null default '';

alter table public.wardrobe_items
  add column if not exists measured_dimensions text not null default '';

alter table public.wardrobe_items
  add column if not exists purchase_date text not null default '';

notify pgrst, 'reload schema';
