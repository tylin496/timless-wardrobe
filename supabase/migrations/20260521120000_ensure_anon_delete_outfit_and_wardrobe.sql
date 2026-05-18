-- If cloud delete of custom pieces fails (FK or RLS), re-apply permissive anon policies.
-- Safe to run multiple times. Tighten with auth before any public deploy.

drop policy if exists "outfit_items_all_anon" on public.outfit_items;
create policy "outfit_items_all_anon"
  on public.outfit_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "wardrobe_items_all_anon" on public.wardrobe_items;
create policy "wardrobe_items_all_anon"
  on public.wardrobe_items
  for all
  to anon, authenticated
  using (true)
  with check (true);
