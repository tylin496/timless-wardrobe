-- British spelling for wardrobe + outfit line items (matches browser `itemToCloudRow`).
-- Merges legacy American column names when both exist, then drops the old column.

-- wardrobe_items: descriptive colour
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'color'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'colour'
  ) then
    update public.wardrobe_items
    set colour = coalesce(nullif(trim(colour), ''), trim(color));
    alter table public.wardrobe_items drop column color;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'color'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'colour'
  ) then
    alter table public.wardrobe_items rename column color to colour;
  end if;
end $$;

-- wardrobe_items: colour code (hex / SKU)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'color_code'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'colour_code'
  ) then
    update public.wardrobe_items
    set colour_code = coalesce(nullif(trim(colour_code), ''), trim(color_code));
    alter table public.wardrobe_items drop column color_code;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'color_code'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wardrobe_items' and column_name = 'colour_code'
  ) then
    alter table public.wardrobe_items rename column color_code to colour_code;
  end if;
end $$;

-- outfit_items: which variant key is chosen for this slot
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outfit_items' and column_name = 'color_key'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outfit_items' and column_name = 'colour_key'
  ) then
    update public.outfit_items
    set colour_key = coalesce(nullif(trim(colour_key), ''), trim(color_key));
    alter table public.outfit_items drop column color_key;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outfit_items' and column_name = 'color_key'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'outfit_items' and column_name = 'colour_key'
  ) then
    alter table public.outfit_items rename column color_key to colour_key;
  end if;
end $$;

notify pgrst, 'reload schema';
