-- Single-row app preferences: archive edits + hidden seed ids (no season tab — that stays local).
-- Browser uses anon key; tighten with auth before public deploy.

create table if not exists public.wardrobe_app_state (
  id text primary key default 'default',
  archive_overrides jsonb not null default '{}'::jsonb,
  archive_hidden_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.wardrobe_app_state (id) values ('default') on conflict (id) do nothing;

alter table public.wardrobe_app_state enable row level security;

drop policy if exists "wardrobe_app_state_all_anon" on public.wardrobe_app_state;
create policy "wardrobe_app_state_all_anon"
  on public.wardrobe_app_state
  for all
  to anon, authenticated
  using (true)
  with check (true);
