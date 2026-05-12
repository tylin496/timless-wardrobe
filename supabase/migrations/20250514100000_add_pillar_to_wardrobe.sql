-- Pillar = thesis-level grouping from your manuscript (not a "mood preset"):
-- English Heritage  → A/W – Country Classics block
-- Mediterranean Leisure → S/S – Mediterranean Resort block
-- Collections → Shoes, Watches, Fragrance, Jewellery, Future Pieces

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
