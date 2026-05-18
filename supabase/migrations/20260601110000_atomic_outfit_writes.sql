-- Keep outfit composition changes atomic.
--
-- The browser can only issue separate PostgREST requests; deleting line items before
-- a later update/insert fails can permanently empty saved outfits. This RPC runs the
-- outfit metadata update, line-item delete, and replacement insert in one database
-- transaction. The FK change lets wardrobe item deletes remove outfit links inside
-- the same DELETE statement instead of requiring a client-side pre-unlink.

do $$
declare
  fk_name text;
begin
  for fk_name in
    select c.conname
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where c.contype = 'f'
      and child_ns.nspname = 'public'
      and child.relname = 'outfit_items'
      and parent_ns.nspname = 'public'
      and parent.relname = 'wardrobe_items'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = child.oid
            and a.attname = 'item_id'
            and not a.attisdropped
        )
      ]::smallint[]
  loop
    execute format('alter table public.outfit_items drop constraint %I', fk_name);
  end loop;

  alter table public.outfit_items
    add constraint outfit_items_item_id_fkey
    foreign key (item_id)
    references public.wardrobe_items (id)
    on delete cascade;
end $$;

create or replace function public.update_outfit_with_items(
  p_outfit_id uuid,
  p_name text,
  p_notes text default '',
  p_slots jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_outfit_id is null then
    raise exception 'outfit id is required' using errcode = '22023';
  end if;

  p_slots := coalesce(p_slots, '[]'::jsonb);
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'p_slots must be a JSON array' using errcode = '22023';
  end if;

  update public.outfits
  set
    name = coalesce(p_name, ''),
    notes = coalesce(p_notes, '')
  where id = p_outfit_id;

  if not found then
    raise exception 'outfit % was not found or is not writable', p_outfit_id using errcode = 'P0002';
  end if;

  delete from public.outfit_items
  where outfit_id = p_outfit_id;

  insert into public.outfit_items (outfit_id, item_id, sort_order, colour_key)
  select
    p_outfit_id,
    nullif(trim(slot.value ->> 'itemId'), ''),
    slot.ordinality::int - 1,
    nullif(trim(coalesce(slot.value ->> 'colourKey', slot.value ->> 'colorKey', '')), '')
  from jsonb_array_elements(p_slots) with ordinality as slot(value, ordinality)
  where nullif(trim(slot.value ->> 'itemId'), '') is not null;

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(p_slots) then
    raise exception 'every outfit slot requires itemId' using errcode = '22023';
  end if;
end;
$$;

grant execute on function public.update_outfit_with_items(uuid, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
