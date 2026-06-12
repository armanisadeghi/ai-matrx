-- ============================================================================
-- Reusable "public media URL" guard — a database-edge fence.
--
-- PROBLEM IT KILLS: code persisted an EXPIRING signed S3 URL into a column the
-- public web reads (e.g. pc_episodes.image_url). The signature expires → broken
-- images for anonymous viewers, silently, days later.
--
-- HOW IT WORKS: a DB designer REGISTERS (table, column) pairs that must always
-- hold a durable/public URL. A single generic trigger then watches every write
-- to those tables; if a registered column receives a non-durable URL it (a) RAISES
-- A LOUD WARNING (Postgres / Supabase logs — "this should never have made it
-- here") and (b) queues a heal job. It is NON-BLOCKING by design: it never
-- rejects the write (that would lose the real media), it surfaces the defect
-- loudly and records it for healing. A healer (frontend owner-session today; a
-- pg_cron + pg_net + backend publish endpoint tomorrow) flips the file public and
-- rewrites the column with the permanent CDN URL.
--
-- REUSABLE: register any (table, column) — works for any future table.
-- ============================================================================

create or replace function public.mtx_is_durable_media_url(url text)
returns boolean
language sql
immutable
as $$
  select case
    when url is null or url = '' then true
    when url ~* '[?&](x-amz-signature|x-amz-credential|expires|signature)=' then false
    else true
  end;
$$;

comment on function public.mtx_is_durable_media_url(text) is
  'True if a media URL is permanent (CDN/public/external/empty); false for signed, time-limited S3 URLs that expire. Used by the public-media-URL guard.';

create table if not exists public.mtx_public_url_guard (
  id           uuid primary key default gen_random_uuid(),
  table_name   text not null,
  column_name  text not null,
  note         text,
  created_at   timestamptz not null default now(),
  unique (table_name, column_name)
);

comment on table public.mtx_public_url_guard is
  'Registry for the public-media-URL guard. Add a (table_name, column_name) row, then attach the mtx_public_url_guard_trigger to that table. Every write is checked: a non-durable URL raises a loud WARNING and is queued in mtx_media_heal_queue.';

create table if not exists public.mtx_media_heal_queue (
  id           uuid primary key default gen_random_uuid(),
  table_name   text not null,
  row_id       text not null,
  column_name  text not null,
  bad_value    text,
  status       text not null default 'pending'
                 check (status in ('pending','healing','healed','failed')),
  error        text,
  created_at   timestamptz not null default now(),
  healed_at    timestamptz
);

comment on table public.mtx_media_heal_queue is
  'Audit + work queue for the public-media-URL guard. A row per (table,row,column) that received a non-durable URL. A healer publishes the underlying file and rewrites the column with the permanent CDN URL, then marks it healed.';

create unique index if not exists idx_mtx_media_heal_pending
  on public.mtx_media_heal_queue (table_name, row_id, column_name)
  where status = 'pending';

create index if not exists idx_mtx_media_heal_status
  on public.mtx_media_heal_queue (status, created_at);

alter table public.mtx_media_heal_queue enable row level security;
drop policy if exists "mtx_media_heal_read" on public.mtx_media_heal_queue;
drop policy if exists "mtx_media_heal_service" on public.mtx_media_heal_queue;
create policy "mtx_media_heal_read" on public.mtx_media_heal_queue
  for select to authenticated using (true);
create policy "mtx_media_heal_service" on public.mtx_media_heal_queue
  for all to service_role using (true) with check (true);

create or replace function public.mtx_public_url_guard_trigger()
returns trigger
language plpgsql
as $$
declare
  guarded record;
  val text;
  row_json jsonb := to_jsonb(NEW);
begin
  for guarded in
    select column_name from public.mtx_public_url_guard where table_name = TG_TABLE_NAME
  loop
    val := row_json ->> guarded.column_name;
    if not public.mtx_is_durable_media_url(val) then
      raise warning '[MEDIA-DURABILITY] %.% on row % received a NON-PUBLIC / expiring URL that must never have been written here (signed S3 link). value=%',
        TG_TABLE_NAME, guarded.column_name, (row_json ->> 'id'), left(val, 100);
      insert into public.mtx_media_heal_queue (table_name, row_id, column_name, bad_value)
        values (TG_TABLE_NAME, (row_json ->> 'id'), guarded.column_name, val)
        on conflict (table_name, row_id, column_name) where (status = 'pending') do nothing;
    end if;
  end loop;
  return NEW;
end;
$$;

comment on function public.mtx_public_url_guard_trigger() is
  'Generic AFTER INSERT/UPDATE trigger. For each (table,column) in mtx_public_url_guard matching this table, validates the new value via mtx_is_durable_media_url; a non-durable value raises a loud WARNING and enqueues a heal job. Non-blocking.';

drop trigger if exists pc_episodes_public_url_guard on public.pc_episodes;
create trigger pc_episodes_public_url_guard
  after insert or update on public.pc_episodes
  for each row execute function public.mtx_public_url_guard_trigger();

insert into public.mtx_public_url_guard (table_name, column_name, note) values
  ('pc_episodes', 'image_url',     'public episode cover — anonymous web reads it'),
  ('pc_episodes', 'og_image_url',  'social preview — must be permanent'),
  ('pc_episodes', 'thumbnail_url', 'list thumbnail — must be permanent'),
  ('pc_episodes', 'audio_url',     'episode audio — public playback'),
  ('pc_episodes', 'video_url',     'episode video background — public playback')
on conflict (table_name, column_name) do nothing;

-- To protect another table later:
--   insert into public.mtx_public_url_guard(table_name, column_name) values ('my_table','my_url_col');
--   create trigger my_table_public_url_guard after insert or update on public.my_table
--     for each row execute function public.mtx_public_url_guard_trigger();
