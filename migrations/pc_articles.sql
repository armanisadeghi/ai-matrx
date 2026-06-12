-- Companion articles per podcast episode (design: features/podcasts/docs/BLOG_PER_EPISODE.md).
--
-- kind='blog'        — the SEO blog article (public at /podcast/[slug]/blog).
-- kind='show_notes'  — structured show notes (rendered on the episode page).
-- One row per (episode, kind); regenerating replaces content in place.
--
-- RLS mirrors the existing pc_* posture (permissive; tightening is part of the
-- platform-wide security overhaul — see KNOWN_DEFECTS.md D2).

create table if not exists public.pc_articles (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.pc_shows(id) on delete set null,
  episode_id uuid not null references public.pc_episodes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'blog' check (kind in ('blog', 'show_notes')),
  slug text unique,
  title text not null default '',
  content_markdown text not null default '',
  og_image_url text,
  canonical_url text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, kind)
);

create index if not exists pc_articles_episode_idx on public.pc_articles (episode_id);
create index if not exists pc_articles_show_idx on public.pc_articles (show_id);

alter table public.pc_articles enable row level security;

drop policy if exists pc_articles_public_select on public.pc_articles;
create policy pc_articles_public_select on public.pc_articles
  for select using (true);

drop policy if exists pc_articles_auth_insert on public.pc_articles;
create policy pc_articles_auth_insert on public.pc_articles
  for insert to authenticated with check (true);

drop policy if exists pc_articles_auth_update on public.pc_articles;
create policy pc_articles_auth_update on public.pc_articles
  for update to authenticated using (true) with check (true);

drop policy if exists pc_articles_auth_delete on public.pc_articles;
create policy pc_articles_auth_delete on public.pc_articles
  for delete to authenticated using (true);

comment on table public.pc_articles is
  'Per-episode companion content (blog article / show notes), generated from the episode transcript by the podcast_blog_writer / podcast_show_notes_generator agents.';
