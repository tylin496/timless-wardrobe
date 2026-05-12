-- Optional extra images per item (URLs or data URLs). Main cover remains `image`.

alter table public.wardrobe_items
  add column if not exists gallery jsonb not null default '[]'::jsonb;
