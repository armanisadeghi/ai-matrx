-- pc_studio_runs — persist Podcast Studio generation runs (user-private).
-- Each row is one generation: its request, live-streamed result (title, script,
-- ALL cover + video options, prompts), and a link to the persisted episode.
-- This is what makes a studio creation returnable and gives the user a history,
-- since pc_episodes alone stores neither the transcript nor the alternate options.

create table if not exists public.pc_studio_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  status             text not null default 'running'
                       check (status in ('running','completed','failed')),

  -- what was requested
  input_data_type    text,
  podcast_type       text,
  request            jsonb not null default '{}'::jsonb,

  -- streamed result (rebuilt into the studio view)
  title              text not null default '',
  description        text,
  script             text,
  audio_url          text,
  image_urls         text[] not null default '{}',
  video_urls         text[] not null default '{}',
  image_prompts      text[] not null default '{}',
  video_prompts      text[] not null default '{}',
  selected_cover_url text,

  -- linkage
  show_id            uuid references public.pc_shows(id) on delete set null,
  episode_id         uuid references public.pc_episodes(id) on delete set null,
  episode_slug       text,

  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_pc_studio_runs_user_created
  on public.pc_studio_runs (user_id, created_at desc);

drop trigger if exists pc_studio_runs_updated_at on public.pc_studio_runs;
create trigger pc_studio_runs_updated_at
  before update on public.pc_studio_runs
  for each row execute function public.set_updated_at();

alter table public.pc_studio_runs enable row level security;

drop policy if exists "pc_studio_runs_select" on public.pc_studio_runs;
drop policy if exists "pc_studio_runs_insert" on public.pc_studio_runs;
drop policy if exists "pc_studio_runs_update" on public.pc_studio_runs;
drop policy if exists "pc_studio_runs_delete" on public.pc_studio_runs;
drop policy if exists "pc_studio_runs_service_role" on public.pc_studio_runs;

create policy "pc_studio_runs_select" on public.pc_studio_runs
  for select to authenticated using (user_id = auth.uid());
create policy "pc_studio_runs_insert" on public.pc_studio_runs
  for insert to authenticated with check (user_id = auth.uid());
create policy "pc_studio_runs_update" on public.pc_studio_runs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pc_studio_runs_delete" on public.pc_studio_runs
  for delete to authenticated using (user_id = auth.uid());
create policy "pc_studio_runs_service_role" on public.pc_studio_runs
  for all to service_role using (true) with check (true);
