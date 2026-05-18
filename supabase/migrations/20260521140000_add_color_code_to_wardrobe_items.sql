-- Separate product / hex "colour code" from descriptive colour text (`color` column).
alter table public.wardrobe_items
  add column if not exists color_code text not null default '';

comment on column public.wardrobe_items.color_code is 'Optional colour code: hex (#rrggbb), SKU, or supplier code — distinct from descriptive color text.';

notify pgrst, 'reload schema';
