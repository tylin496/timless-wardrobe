-- Browser “Add piece” uses the anon key + upsert on wardrobe_items.
-- Init migration only allowed SELECT for anon on this table; add write policies here.
--
-- SECURITY: Same trade-off as outfits_all_anon — anyone with your project URL + anon
-- key can INSERT/UPDATE/DELETE rows. Use auth + tighter policies before a public deploy.

drop policy if exists "wardrobe_items_all_anon" on public.wardrobe_items;
create policy "wardrobe_items_all_anon"
  on public.wardrobe_items
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Optional: remove the old read-only policy so only one permissive policy applies per role.
-- (Keeps behaviour the same; avoids duplicate SELECT policies.)
drop policy if exists "wardrobe_items_select_anon" on public.wardrobe_items;
