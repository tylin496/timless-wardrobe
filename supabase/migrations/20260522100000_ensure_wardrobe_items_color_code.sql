-- Optional dedicated column (some projects add this migration). The browser app also
-- stores colour codes in `metadata->colorCode` so PostgREST works without this column.

alter table public.wardrobe_items
  add column if not exists color_code text not null default '';

comment on column public.wardrobe_items.color_code is 'Optional colour code: hex (#rrggbb), SKU, or supplier code — distinct from descriptive color text.';

notify pgrst, 'reload schema';
