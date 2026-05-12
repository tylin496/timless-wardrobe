-- Optional sizing fields (label size + flat / measured dimensions text).

alter table public.wardrobe_items
  add column if not exists size text not null default '';

alter table public.wardrobe_items
  add column if not exists measured_dimensions text not null default '';

comment on column public.wardrobe_items.size is 'Label size (e.g. EU 48, US 10.5 E, ring HK size).';

comment on column public.wardrobe_items.measured_dimensions is
  'Optional: actual / flat measurements (chest, waist, inseam, etc.).';
