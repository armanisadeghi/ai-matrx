-- Persist the episode's dialogue script on the episode itself.
--
-- The script previously lived only on pc_studio_runs / agent_run stages, which
-- anonymous public pages cannot read meaningfully. The public episode page's
-- transcript view and per-episode article generation (pc_articles) both need
-- the script at the episode. Written by aidream _persist_episode.

alter table public.pc_episodes
  add column if not exists script text;

comment on column public.pc_episodes.script is
  'Full generated dialogue script (<podcast_dialogue> body) — source for the public transcript and pc_articles generation.';
