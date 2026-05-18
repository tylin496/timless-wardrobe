-- Optional purchase date (ISO YYYY-MM-DD from date picker, or free text from imports).

alter table public.wardrobe_items
  add column if not exists purchase_date text not null default '';

comment on column public.wardrobe_items.purchase_date is 'Purchase / acquisition date (typically YYYY-MM-DD).';
