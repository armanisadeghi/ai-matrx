-- War Room polymorphic M2M association table, shaped like ctx_scope_assignments.
--
-- Collapses ctx_war_room_tiles.task_id / note_id / project_id AND the three link
-- tables (ctx_war_room_tile_notes / _audio_sessions / _attachments) into ONE table
-- so a container (room = session, or thread = tile) can hold ANY resource type, M2M.
-- This mirrors the scope-assignment shape (polymorphic entity_type + entity_id) so
-- the imminent platform-wide relationship refactor absorbs it trivially.
--
-- Idempotent: re-appliable (IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS,
-- ON CONFLICT DO NOTHING). The old columns/tables are dropped in a later migration
-- only after the code cutover is verified.

create table if not exists public.ctx_war_room_assignments (
  id uuid primary key default gen_random_uuid(),
  container_type text not null check (container_type in ('room','thread')),
  container_id uuid not null,
  entity_type text not null check (entity_type in (
    'project','task','note','conversation','studio_session','user_file','document'
  )),
  entity_id uuid not null,
  position integer not null default 0,
  is_active boolean not null default true,
  label text,
  metadata jsonb,
  user_id uuid not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (container_type, container_id, entity_type, entity_id)
);

create index if not exists ctx_wra_container_idx
  on public.ctx_war_room_assignments (container_type, container_id);
create index if not exists ctx_wra_entity_idx
  on public.ctx_war_room_assignments (entity_type, entity_id);
create index if not exists ctx_wra_active_idx
  on public.ctx_war_room_assignments (container_id) where is_active;

-- Resolve a container to its owning War Room session (SECURITY DEFINER so RLS can
-- always find the session; check_resource_access does the actual authorization).
create or replace function public.wr_assignment_session_id(p_container_type text, p_container_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_container_type = 'room' then p_container_id
    when p_container_type = 'thread'
      then (select t.session_id from public.ctx_war_room_tiles t where t.id = p_container_id)
    else null::uuid
  end;
$$;

alter table public.ctx_war_room_assignments enable row level security;

drop policy if exists ctx_wra_service_role on public.ctx_war_room_assignments;
create policy ctx_wra_service_role on public.ctx_war_room_assignments
  for all to service_role using (true) with check (true);

drop policy if exists ctx_wra_select on public.ctx_war_room_assignments;
create policy ctx_wra_select on public.ctx_war_room_assignments
  for select using (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and check_resource_access('ctx_war_room_sessions'::text, s.id, 'viewer'::permission_level,
                                  s.user_id, null::uuid, s.project_id, s.organization_id)
    )
  );

drop policy if exists ctx_wra_public_read on public.ctx_war_room_assignments;
create policy ctx_wra_public_read on public.ctx_war_room_assignments
  for select using (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and s.is_public = true and s.is_deleted = false
    )
  );

drop policy if exists ctx_wra_insert on public.ctx_war_room_assignments;
create policy ctx_wra_insert on public.ctx_war_room_assignments
  for insert with check (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and check_resource_access('ctx_war_room_sessions'::text, s.id, 'editor'::permission_level,
                                  s.user_id, null::uuid, s.project_id, s.organization_id)
    )
  );

drop policy if exists ctx_wra_update on public.ctx_war_room_assignments;
create policy ctx_wra_update on public.ctx_war_room_assignments
  for update using (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and check_resource_access('ctx_war_room_sessions'::text, s.id, 'editor'::permission_level,
                                  s.user_id, null::uuid, s.project_id, s.organization_id)
    )
  ) with check (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and check_resource_access('ctx_war_room_sessions'::text, s.id, 'editor'::permission_level,
                                  s.user_id, null::uuid, s.project_id, s.organization_id)
    )
  );

drop policy if exists ctx_wra_delete on public.ctx_war_room_assignments;
create policy ctx_wra_delete on public.ctx_war_room_assignments
  for delete using (
    exists (
      select 1 from public.ctx_war_room_sessions s
      where s.id = public.wr_assignment_session_id(container_type, container_id)
        and check_resource_access('ctx_war_room_sessions'::text, s.id, 'editor'::permission_level,
                                  s.user_id, null::uuid, s.project_id, s.organization_id)
    )
  );

-- ── Backfill (idempotent) — link tables first (authoritative is_active/position),
--    then the single-FK fallbacks, then the room-level project. ────────────────
insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'thread', n.tile_id, 'note', n.note_id, n.user_id, n.is_active, n.position
from public.ctx_war_room_tile_notes n
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'thread', a.tile_id, 'studio_session', a.studio_session_id, a.user_id, a.is_active, a.position
from public.ctx_war_room_tile_audio_sessions a
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position, label, metadata)
select 'thread', at.tile_id, at.entity_type, at.entity_id, at.user_id, true, at.position, at.label, at.metadata
from public.ctx_war_room_tile_attachments at
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'thread', t.id, 'task', t.task_id, t.user_id, true, 0
from public.ctx_war_room_tiles t
where t.task_id is not null
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'thread', t.id, 'project', t.project_id, t.user_id, true, 0
from public.ctx_war_room_tiles t
where t.project_id is not null
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'thread', t.id, 'note', t.note_id, t.user_id, true, 0
from public.ctx_war_room_tiles t
where t.note_id is not null
on conflict (container_type, container_id, entity_type, entity_id) do nothing;

insert into public.ctx_war_room_assignments
  (container_type, container_id, entity_type, entity_id, user_id, is_active, position)
select 'room', s.id, 'project', s.project_id, s.user_id, true, 0
from public.ctx_war_room_sessions s
where s.project_id is not null
on conflict (container_type, container_id, entity_type, entity_id) do nothing;
