-- Optional colour variant when the same wardrobe row represents multiple physical colours.

alter table public.outfit_items
  add column if not exists color_key text;

comment on column public.outfit_items.color_key is
  'Matches item.colorVariants[].key when the outfit slot picks a specific colour; null = default row cover.';
