-- Optional styling notes per saved outfit (Styling Board).
alter table public.outfits
  add column if not exists notes text not null default '';
