-- Drop season_nav from wardrobe_app_state (season A/W strip stays in localStorage only).

alter table public.wardrobe_app_state
  drop column if exists season_nav;
