-- chair-step: lane FLIP-SEAMS — two new platform tables (the seam catalogue and the append-only press log), two signed-in doors (platform.cutover_seams to read, platform.cutover_seam_press to press) with their platform.client_callable_door rows before their GRANT, two private helpers, one new knob_write_door authority kind ('cutover_seam') so the two seam knobs refuse every other writer by name, and platform.knob_write_door_for taught that kind. Nothing is flipped: every seam of every organization reads OLD until an owner presses it.
-- based-on: platform.knob_write_door_for(text, uuid) ad71fec6a6372bf18a695b2340e55f42d76cbf032ab69268ec1be89ddfe40052
-- lane: FLIP-SEAMS
-- INVERSE: migrations/inverse/flipseams_every_switch_from_old_to_new_is_one_owner_press_down.sql
--
-- LANE FLIP-SEAMS — EVERY SWITCH FROM THE OLD SYSTEM TO THE NEW ONE IS ONE OWNER PRESS.
--
-- THE USE CASE (the owner, 2026-09-23): old and new stand side by side, nothing redirects, he
-- validates each piece on his own data, then ONE flip per piece retires the old — "a super easy
-- move". Until now each piece had its own private switch (a knob any organization admin could set
-- through the Configuration page, a mover flag any lane could run). This file makes the flip ONE
-- primitive:
--
--   * `platform.cutover_seam` — the catalogue of places where old and new coexist ("seams"), each
--     with what the flip does, what must be true first, and how it is reversed, in plain English.
--   * `platform.cutover_seam_press` — every press, append-only: who, when, which way, what the
--     readiness said at that moment, and exactly what the press did (the archived ids, the setting
--     it replaced). A seam's state is its latest completed press; no press = OLD.
--   * `platform.cutover_seams(org)` — THE read door. Every client (the settings screen, the server,
--     a script) reads a seam's state and readiness here and nowhere else.
--   * `platform.cutover_seam_press(seam, org, 'new'|'old', note)` — THE write door. Only an owner of
--     the organization or a platform admin, only from a signed-in browser session (a person at a
--     screen, never a server process, a lane's database connection, or an agent's tool), only when
--     the readiness is met for 'new'. The seam's repoint + archive run inside the press as one
--     step; a failure inside rolls the whole step back and is recorded as a refusal with its reason.
--   * The two seam knobs (`data_tables.older_tables_moved`, `custom.agent_context_reads_the_copy`)
--     declare `platform.cutover_seam_press` as their write door, so `platform.knob_override_set`
--     refuses them by name (DD-221's mechanism) and the Configuration page says where they are set.
--
-- WHAT A LANE OR AGENT CANNOT DO. Pressing needs auth.uid(), a JWT whose role is `authenticated`
-- and that carries a sign-in `session_id`, and a request that arrived with an `Origin` header (a
-- browser page). A direct database connection (db:apply, psql, the Supabase MCP) has no JWT; the
-- server's service key is role `service_role`; neither can press. The honest limit, stated where it
-- lives: an automated browser signed in as an owner is indistinguishable from the owner, which is
-- why every press records who and when, and why the screen is the only place that offers it.

set lock_timeout = '30s';
set statement_timeout = '300s';

-- ── 1. THE CATALOGUE ─────────────────────────────────────────────────────────────────────────────
create table if not exists platform.cutover_seam (
  id               uuid primary key default gen_random_uuid(),
  seam_key         text not null unique,
  sort_order       integer not null,
  title            text not null,
  old_side         text not null,
  new_side         text not null,
  per_organization boolean not null,
  press_kind       text not null check (press_kind in ('owner_press', 'platform_switch', 'already_switched')),
  flip_does        text not null,
  needs_first      text not null,
  reverse_does     text not null,
  -- Facts a lane establishes, not a person presses: [{ "key", "says", "met", "evidence" }].
  -- A lane that finishes one ships a new file setting its `met` with the evidence; never a button.
  prerequisites    jsonb not null default '[]'::jsonb,
  -- A catalogue row, not an entity (like platform.realtime_topic_prefix): the platform's own
  -- organization holds it, and it is changed only by a migration file with its evidence.
  organization_id  uuid not null references iam.organizations(id),
  retired_at       timestamptz,
  registered_at    timestamptz not null default now()
);

comment on table platform.cutover_seam is
  'Every place where an old and a new system coexist (a seam), with what its flip does, what must be true first and how it is reversed. Read through platform.cutover_seams; pressed through platform.cutover_seam_press. Lane FLIP-SEAMS, 2026-09-25.';

create index if not exists cutover_seam_organization_id on platform.cutover_seam (organization_id);

alter table platform.cutover_seam enable row level security;
revoke all on platform.cutover_seam from anon, authenticated;

insert into platform.cutover_seam
  (seam_key, sort_order, title, old_side, new_side, per_organization, press_kind,
   flip_does, needs_first, reverse_does, prerequisites, organization_id)
values
  ('older_tables', 10, 'Data tables',
   'The older data tables on /data',
   'The copies in the new record store on /data-v2 (same ids)',
   true, 'owner_press',
   'Every older table in this organization is archived (never deleted) and points at its copy, so any link to it opens the copy; the organization''s "tables moved" setting turns on. The copies are untouched.',
   'Every older table is copied, no row is missing from a copy, no row was edited in an older table after it was copied, and every feature that reads or writes tables uses the new store.',
   'Exactly the tables this switch archived come back as they were; the "tables moved" setting goes back to what it was. The copies stay, so switching again carries nothing twice.',
   jsonb_build_array(jsonb_build_object(
     'key', 'integrations_repointed',
     'says', 'Every feature that reads or writes tables uses the new store (the agents'' dataset tool, the workflow steps, "save as a table", row-change automations, the browser extension).',
     'met', false,
     'evidence', 'Not yet: 44 of the places that read or write tables still reach the older tables directly. This is checked off when the last of them has moved and a check proves none is left.')),
   '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('agent_context', 20, 'Where agents get their context',
   'The current scopes and context system',
   'The record store''s copy of this organization''s scopes, which follows every edit made in the current screens',
   true, 'owner_press',
   'Every agent turn in this organization reads its scopes and context from the record store''s copy. The current scope screens stay where edits are made and the copy keeps following them; nothing is archived at this switch.',
   'Every scope type, scope and context field is copied, and no edit made in the current screens is still waiting to be copied.',
   'Agents read their context from the current system again, exactly as before.',
   '[]'::jsonb,
   '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('data_screen', 30, 'The Data page',
   '/data, the older list of tables',
   '/data-v2, the new list',
   false, 'platform_switch',
   'The /data list opens /data-v2 for everyone.',
   'Every organization''s data tables have been switched.',
   'The /data list opens the older page again.',
   '[]'::jsonb,
   '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('scopes_screens', 40, 'Scope and context screens',
   'The current scope pages, editors and pickers',
   'The record store''s pages for the same scopes',
   false, 'platform_switch',
   'Every scope screen, editor, picker and integration moves to the record store at once for everyone; the old write doors are refused with a sentence; the copy stops following and the new store becomes the writer.',
   'Agents have read from the copy without a defect, and the switch has been rehearsed with its undo on the development copy.',
   'The old screens become the writer again and everything written since the switch is carried back.',
   '[]'::jsonb,
   '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('saved_views', 50, 'Saved views on tables',
   'The per-organization view-bar tables',
   'The one saved-view store',
   false, 'already_switched',
   'Every view-bar view moved into the one saved-view store under its own id; the older view tables were archived (2026-09-24).',
   'Done.',
   'The move''s own undo (restores exactly what it archived); run by an engineer, not from this page.',
   '[]'::jsonb,
   '39c38960-d30c-4840-b0c1-c9960de95582')
on conflict (seam_key) do nothing;

-- ── 2. THE PRESS LOG (append-only) ───────────────────────────────────────────────────────────────
create table if not exists platform.cutover_seam_press (
  id               uuid primary key default gen_random_uuid(),
  seam_key         text not null references platform.cutover_seam(seam_key),
  organization_id  uuid not null references iam.organizations(id),
  direction        text not null check (direction in ('new', 'old')),
  outcome          text not null check (outcome in ('done', 'refused')),
  refusal          text,
  says             text,
  pressed_by       uuid references auth.users(id),
  pressed_at       timestamptz not null default clock_timestamp(),  -- per press, not per transaction
  readiness        jsonb,
  did              jsonb not null default '{}'::jsonb,
  note             text,
  -- An append-only log row, not an entity: never edited, never archived, never removed.
  constraint cutover_seam_press_done_has_a_person check (outcome <> 'done' or pressed_by is not null),
  constraint cutover_seam_press_refusal_says_why check (outcome <> 'refused' or refusal is not null)
);

create index if not exists cutover_seam_press_latest
  on platform.cutover_seam_press (seam_key, organization_id, pressed_at desc);
create index if not exists cutover_seam_press_organization_id on platform.cutover_seam_press (organization_id);
create index if not exists cutover_seam_press_pressed_by on platform.cutover_seam_press (pressed_by);

comment on table platform.cutover_seam_press is
  'Every press of a seam switch, append-only: who, when, which way, what readiness said, what the press did. A seam''s state for an organization is its latest done press; none = old. Written only by platform.cutover_seam_press.';

alter table platform.cutover_seam_press enable row level security;
revoke all on platform.cutover_seam_press from anon, authenticated;

create or replace function platform._cutover_seam_press_is_append_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  raise exception 'a press of a seam switch is a record of what happened and is never changed or removed'
    using errcode = '42501',
          hint = 'To undo a switch, press it the other way on the organization''s settings page; that is a new row.';
end;
$$;

create trigger cutover_seam_press_is_append_only
  before update or delete on platform.cutover_seam_press
  for each row execute function platform._cutover_seam_press_is_append_only();

-- ── 3. STATE AND READINESS (private) ─────────────────────────────────────────────────────────────
create or replace function platform._cutover_seam_last_done(p_seam text, p_org uuid)
returns platform.cutover_seam_press
language sql
stable
set search_path to 'pg_catalog'
as $$
  select p.* from platform.cutover_seam_press p
   where p.seam_key = p_seam and p.organization_id = p_org and p.outcome = 'done'
   order by p.pressed_at desc, p.id
   limit 1;
$$;

create or replace function platform._cutover_seam_readiness(p_seam text, p_org uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  s platform.cutover_seam;
  v_checks jsonb := '[]'::jsonb;
  v_n bigint; v_c bigint; v_missing bigint; v_stale bigint; v_lag bigint;
  v_tn bigint; v_tc bigint; v_sn bigint; v_sc bigint; v_in bigint; v_ic bigint;
  v_names text;
  v_pre jsonb;
begin
  select * into s from platform.cutover_seam where seam_key = p_seam and retired_at is null;
  if s.seam_key is null then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'known', 'says', 'This switch exists', 'met', false,
                         'detail', format('There is no switch called %s.', p_seam))));
  end if;

  if s.press_kind = 'platform_switch' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'pressed_here', 'says', 'Switched for one organization', 'met', false,
                         'detail', 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.')));
  elsif s.press_kind = 'already_switched' then
    return jsonb_build_object('ready', false, 'checked_at', now(), 'checks', jsonb_build_array(
      jsonb_build_object('key', 'already', 'says', 'Already on the new system', 'met', true,
                         'detail', s.flip_does)));
  end if;

  if p_seam = 'older_tables' then
    select count(*),
           count(*) filter (where exists (
             select 1 from custom.record r
              where r.organization_id = p_org and r.id = d.id
                and r.data_class = 'table' and r.deleted_at is null))
      into v_n, v_c
      from workbench.udt_datasets d
     where d.organization_id = p_org and d.deleted_at is null;

    select string_agg(x.table_name, ', ' order by x.table_name) into v_names
      from (select d.table_name from workbench.udt_datasets d
             where d.organization_id = p_org and d.deleted_at is null
               and not exists (select 1 from custom.record r
                                where r.organization_id = p_org and r.id = d.id
                                  and r.data_class = 'table' and r.deleted_at is null)
             order by d.table_name limit 5) x;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every table is copied into the new system', 'met', v_c = v_n,
      'detail', case when v_n = 0 then 'This organization has no older tables left.'
                     else format('%s of %s tables copied.', v_c, v_n)
                          || case when v_c < v_n then ' Not yet: ' || v_names || case when v_n - v_c > 5 then ', …' else '' end || '.' else '' end end);

    -- Rows of the tables that ARE copied: missing from the copy, or edited in the older table after
    -- the copy was taken (a table copy is a snapshot; it does not follow).
    select count(*) filter (where r.id is null),
           count(*) filter (where r.id is not null and w.updated_at > r.updated_at)
      into v_missing, v_stale
      from workbench.udt_datasets d
      join workbench.udt_dataset_rows w on w.table_id = d.id and w.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = w.id and r.deleted_at is null
     where d.organization_id = p_org and d.deleted_at is null
       and exists (select 1 from custom.record t
                    where t.organization_id = p_org and t.id = d.id
                      and t.data_class = 'table' and t.deleted_at is null);

    v_checks := v_checks
      || jsonb_build_object('key', 'rows_present', 'says', 'No row is missing from a copy',
           'met', v_missing = 0,
           'detail', case when v_missing = 0 then 'Every row of every copied table is in its copy.'
                          else format('%s rows are not in their copies yet. Copying the table again brings them.', v_missing) end)
      || jsonb_build_object('key', 'rows_current', 'says', 'No row was edited in an older table after it was copied',
           'met', v_stale = 0,
           'detail', case when v_stale = 0 then 'Every copy is as current as its older table.'
                          else format('%s rows were edited in the older tables after they were copied. Copying again brings the edits.', v_stale) end);

  elsif p_seam = 'agent_context' then
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_tn, v_tc
      from context.scope_types t
      left join custom.record r on r.organization_id = p_org and r.id = t.id
     where t.organization_id = p_org and t.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_sn, v_sc
      from context.scopes x
      join context.scope_types t on t.id = x.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = x.id
     where x.organization_id = p_org and x.deleted_at is null;
    select count(*), count(*) filter (where r.id is not null and r.deleted_at is null)
      into v_in, v_ic
      from context.context_items i
      join context.scope_types t on t.id = i.scope_type_id and t.deleted_at is null
      left join custom.record r on r.organization_id = p_org and r.id = i.id
     where t.organization_id = p_org and i.deleted_at is null and i.is_active;

    v_checks := v_checks || jsonb_build_object(
      'key', 'copied', 'says', 'Every scope type, scope and context field is copied',
      'met', v_tc = v_tn and v_sc = v_sn and v_ic = v_in,
      'detail', case when v_tn = 0 then 'This organization has no scopes.'
                     else format('%s of %s scope types, %s of %s scopes, %s of %s context fields copied.',
                                 v_tc, v_tn, v_sc, v_sn, v_ic, v_in) end);

    select count(*) into v_lag
      from custom.io_outbox x
     where x.organization_id = p_org and x.event_key = 'context.follow'
       and x.consumed_at is null and x.deleted_at is null;

    v_checks := v_checks || jsonb_build_object(
      'key', 'follow_current', 'says', 'No edit is waiting to be copied', 'met', v_lag = 0,
      'detail', case when v_lag = 0 then 'The copy has every edit made in the current screens.'
                     else format('%s edits made in the current screens are waiting for the copy.', v_lag) end);
  end if;

  for v_pre in select * from jsonb_array_elements(s.prerequisites) loop
    v_checks := v_checks || jsonb_build_object(
      'key', v_pre ->> 'key', 'says', v_pre ->> 'says',
      'met', coalesce((v_pre ->> 'met')::boolean, false),
      'detail', v_pre ->> 'evidence');
  end loop;

  return jsonb_build_object(
    'ready', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'met')::boolean),
    'checked_at', now(),
    'checks', v_checks);
end;
$$;

-- ── 4. WHAT A PRESS DOES (private; runs inside the press, one step) ──────────────────────────────
create or replace function platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$$;

revoke all on function platform._cutover_seam_last_done(text, uuid) from public, anon, authenticated;
revoke all on function platform._cutover_seam_readiness(text, uuid) from public, anon, authenticated;
revoke all on function platform._cutover_seam_apply(text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function platform._cutover_seam_press_is_append_only() from public, anon, authenticated;

-- ── 5. THE READ DOOR ─────────────────────────────────────────────────────────────────────────────
create or replace function platform.cutover_seams(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_is_admin boolean := false;
  v_role text;
  v_may boolean := false;
  v_may_detail text;
  v_out jsonb := '[]'::jsonb;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_latest platform.cutover_seam_press;
  v_ready jsonb;
  v_state text;
begin
  if p_organization_id is null
     or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours',
      'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null then
    -- No person: only the server's own key or a direct database connection may read.
    if v_claims is not null and coalesce(v_claims ->> 'role', '') <> 'service_role' then
      return jsonb_build_object('ok', false, 'reason', 'not_signed_in', 'says', 'Sign in to see this organization''s switches.');
    end if;
    v_may_detail := 'Only an owner of this organization, signed in on its settings page, can press a switch.';
  else
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours',
        'says', 'There is no organization with that id that you belong to.');
    end if;
    v_may := v_role = 'owner' or v_is_admin;
    v_may_detail := case when v_role = 'owner' then 'You are an owner of this organization.'
                         when v_is_admin then 'You are a platform admin.'
                         else 'Only an owner of this organization can press a switch.' end;
  end if;

  for s in select * from platform.cutover_seam where retired_at is null order by sort_order loop
    v_last := platform._cutover_seam_last_done(s.seam_key, p_organization_id);
    select p.* into v_latest from platform.cutover_seam_press p
     where p.seam_key = s.seam_key and p.organization_id = p_organization_id
     order by p.pressed_at desc, p.id limit 1;
    v_state := case when s.press_kind = 'already_switched' then 'new'
                    when v_last.id is null then 'old'
                    else v_last.direction end;
    v_ready := platform._cutover_seam_readiness(s.seam_key, p_organization_id);

    v_out := v_out || jsonb_build_object(
      'key', s.seam_key,
      'title', s.title,
      'old_side', s.old_side,
      'new_side', s.new_side,
      'per_organization', s.per_organization,
      'press_kind', s.press_kind,
      'state', v_state,
      'flip_does', s.flip_does,
      'needs_first', s.needs_first,
      'reverse_does', s.reverse_does,
      'readiness', v_ready,
      'may_flip', v_may and s.press_kind = 'owner_press' and v_state = 'old' and (v_ready ->> 'ready')::boolean,
      'may_reverse', v_may and s.press_kind = 'owner_press' and v_state = 'new',
      'switched', case when v_last.id is null then null else jsonb_build_object(
          'direction', v_last.direction, 'at', v_last.pressed_at,
          'by', (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email) from auth.users u where u.id = v_last.pressed_by),
          'did', v_last.did) end,
      'last_press', case when v_latest.id is null then null else jsonb_build_object(
          'direction', v_latest.direction, 'outcome', v_latest.outcome, 'at', v_latest.pressed_at,
          'refusal', v_latest.refusal, 'says', v_latest.says) end);
  end loop;

  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'checked_at', now(),
                            'may_press', v_may, 'may_press_detail', v_may_detail, 'seams', v_out);
end;
$$;

-- ── 6. THE WRITE DOOR ────────────────────────────────────────────────────────────────────────────
create or replace function platform.cutover_seam_press(p_seam_key text, p_organization_id uuid, p_to text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_role text;
  v_is_admin boolean;
  s platform.cutover_seam;
  v_last platform.cutover_seam_press;
  v_state text;
  v_ready jsonb;
  v_press uuid := gen_random_uuid();
  v_did jsonb;
  v_refusal text;
  v_says text;
begin
  -- Refusals that name no organization of the caller's are answered, never recorded.
  if p_organization_id is null or not exists (select 1 from iam.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
  end if;

  if v_uid is null or v_claims is null then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page. A server, a script or a database connection cannot press it.';
  elsif coalesce(v_claims ->> 'role', '') <> 'authenticated' or coalesce(v_claims ->> 'session_id', '') = '' then
    v_refusal := 'not_a_person';
    v_says := 'A switch is pressed by a person signed in on the organization''s settings page, not with a service key or a minted token.';
  elsif v_headers is null or coalesce(v_headers ->> 'origin', '') = '' then
    v_refusal := 'not_from_the_screen';
    v_says := 'A switch is pressed from the organization''s settings page in a browser. This request did not come from a page.';
  end if;

  if v_refusal is null then
    v_is_admin := public.is_admin();
    select m.role into v_role from iam.organization_member m
     where m.organization_id = p_organization_id and m.user_id = v_uid;
    if v_role is null and not v_is_admin then
      return jsonb_build_object('ok', false, 'reason', 'not_yours', 'says', 'There is no organization with that id that you belong to.');
    end if;
    if v_role is distinct from 'owner' and not v_is_admin then
      v_refusal := 'not_an_owner';
      v_says := 'Only an owner of this organization can press this switch.';
    end if;
  end if;

  if v_refusal is null then
    select * into s from platform.cutover_seam where seam_key = p_seam_key and retired_at is null;
    if s.seam_key is null then
      return jsonb_build_object('ok', false, 'reason', 'unknown_switch', 'says', format('There is no switch called %s.', p_seam_key));
    elsif p_to is null or p_to not in ('new', 'old') then
      v_refusal := 'bad_direction';
      v_says := 'A switch goes to the new system or back to the old one.';
    elsif s.press_kind <> 'owner_press' then
      v_refusal := 'not_pressed_here';
      v_says := case s.press_kind when 'already_switched' then 'This one is already on the new system.'
                  else 'This one switches for everyone at once, in its own rehearsed step, not from an organization''s settings.' end;
    end if;
  end if;

  if v_refusal is null then
    -- One press per seam per organization at a time.
    perform pg_advisory_xact_lock(hashtextextended('cutover_seam:' || p_seam_key || ':' || p_organization_id::text, 0));
    v_last := platform._cutover_seam_last_done(p_seam_key, p_organization_id);
    v_state := coalesce(v_last.direction, 'old');
    if v_state = p_to then
      v_refusal := 'already_there';
      v_says := case p_to when 'new' then 'This organization is already on the new system here.'
                          else 'This organization is already on the old system here.' end;
    elsif p_to = 'new' then
      v_ready := platform._cutover_seam_readiness(p_seam_key, p_organization_id);
      if not (v_ready ->> 'ready')::boolean then
        v_refusal := 'not_ready';
        v_says := 'Not ready yet: ' || (
          select string_agg(c ->> 'says' || ' — ' || coalesce(c ->> 'detail', ''), '; ')
            from jsonb_array_elements(v_ready -> 'checks') c where not (c ->> 'met')::boolean) || '.';
      end if;
    end if;
  end if;

  if v_refusal is not null then
    if p_seam_key in (select seam_key from platform.cutover_seam) then
      insert into platform.cutover_seam_press
        (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
      values
        (v_press, p_seam_key, p_organization_id,
         case when p_to in ('new', 'old') then p_to else 'new' end,
         'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    end if;
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press, 'readiness', v_ready);
  end if;

  begin
    v_did := platform._cutover_seam_apply(p_seam_key, p_organization_id, p_to, v_uid, v_press);
  exception when others then
    v_refusal := 'the_step_failed';
    v_says := 'Nothing was changed: the switch stopped part way and was rolled back whole. ' || sqlerrm;
    insert into platform.cutover_seam_press
      (id, seam_key, organization_id, direction, outcome, refusal, says, pressed_by, readiness, note)
    values
      (v_press, p_seam_key, p_organization_id, p_to, 'refused', v_refusal, v_says, v_uid, v_ready, p_note);
    return jsonb_build_object('ok', false, 'reason', v_refusal, 'says', v_says, 'press_id', v_press);
  end;

  insert into platform.cutover_seam_press
    (id, seam_key, organization_id, direction, outcome, says, pressed_by, readiness, did, note)
  values
    (v_press, p_seam_key, p_organization_id, p_to, 'done',
     case p_to when 'new' then 'Switched to the new system.' else 'Switched back to the old system.' end,
     v_uid, v_ready, v_did, p_note);

  return jsonb_build_object('ok', true, 'press_id', v_press, 'state', p_to, 'did', v_did,
    'says', case p_to when 'new' then 'Switched to the new system.' else 'Switched back to the old system.' end);
end;
$$;

-- ── 7. THE SEAM KNOBS HAVE ONE WRITER ────────────────────────────────────────────────────────────
alter table platform.knob_write_door drop constraint if exists knob_write_door_authority_kind_check;
alter table platform.knob_write_door add constraint knob_write_door_authority_kind_check
  check (authority_kind = any (array['org_steward'::text, 'hr_settings_gate'::text, 'cutover_seam'::text]));

insert into platform.knob_write_door
  (feature_prefix, set_door, clear_door, authority_kind, reason, organization_id)
select v.prefix, 'platform.cutover_seam_press', 'platform.cutover_seam_press', 'cutover_seam', v.reason,
       '39c38960-d30c-4840-b0c1-c9960de95582'
  from (values
    ('data_tables.older_tables_moved',
     'The "data tables" switch from the older tables to the record store. Pressed only by an owner on the organization''s settings page (Data), through platform.cutover_seam_press, which archives the older tables in the same step and records who pressed it and when (lane FLIP-SEAMS).'),
    ('custom.agent_context_reads_the_copy',
     'The "where agents get their context" switch. Pressed only by an owner on the organization''s settings page (Data), through platform.cutover_seam_press, which records who pressed it and when (lane FLIP-SEAMS).')
  ) as v(prefix, reason)
 where not exists (select 1 from platform.knob_write_door d where d.feature_prefix = v.prefix);

CREATE OR REPLACE FUNCTION platform.knob_write_door_for(p_key text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'public', 'hr', 'pg_temp'
AS $function$
-- THE ONE PLACE A SURFACE ASKS "which door writes this key, and may I use it".
--
-- Two answers, never one: a screen that knows the door but not the authority
-- either draws a control the door will refuse (a lying control) or hides one the
-- person is entitled to (the DD-221 defect, from the other side). `may_write` is
-- computed with the SAME predicates the real gates use — never re-stated, never
-- guessed from `org_role`.
--
-- It is STABLE and it writes nothing: `hr._l1_settings_gate` files a denial row
-- in `hr.access_audit` when it refuses, and asking "may I" is not knocking.
declare
  v_row platform.knob_write_door;
  v_uid uuid := auth.uid();
  v_may boolean;
  v_detail text;
begin
  if p_key is null or position('.' in p_key) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_key',
      'detail', 'A settings key is written <feature>.<key>, for example hr.employees.adjusted_service_date_rule.');
  end if;

  -- Longest declared prefix wins; the '' row is the default and matches everything.
  select d.* into v_row
    from platform.knob_write_door d
   where p_key like d.feature_prefix || '%'
   order by length(d.feature_prefix) desc
   limit 1;

  if v_row.feature_prefix is null then
    -- Only reachable if the default row was deleted. Say so; never invent a door.
    return jsonb_build_object('ok', false, 'reason', 'no_door_declared',
      'detail', format('No write door is declared for %s, and the default row is missing from platform.knob_write_door, so there is nothing to write it through.', p_key));
  end if;

  if v_row.authority_kind = 'cutover_seam' then
    -- LANE FLIP-SEAMS: a seam switch is never a settings value. It is pressed on the
    -- organization's settings page (Data) through platform.cutover_seam_press, which
    -- runs the switch's archive step in the same press and records who and when. A
    -- settings screen may show the value; it never writes it, for anybody.
    v_may := case when p_organization_id is null then null else false end;
    v_detail := 'This is switched on the organization''s settings page, under Data, by an owner — not here.';
  elsif p_organization_id is null then
    v_may := null;
    v_detail := 'No organization was named, so no authority was decided.';
  elsif v_uid is null then
    v_may := false;
    v_detail := 'Nobody is signed in.';
  elsif v_row.authority_kind = 'hr_settings_gate' then
    -- hr._l1_settings_gate's own two admissions, in its own order (DD-206).
    if hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
      v_may := true;
      v_detail := 'You hold HR admin standing in this organization.';
    elsif coalesce(hr._l1_org_role(v_uid, p_organization_id, false) in ('owner', 'admin'), false) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'HR settings are HR-admin only.';
    end if;
  elsif v_row.authority_kind = 'org_steward' then
    -- platform.knob_override_set's own test, for every rung but `user`.
    if public.is_admin() then
      v_may := true;
      v_detail := 'You are a platform admin.';
    elsif exists (select 1 from iam.organization_member m
                   where m.organization_id = p_organization_id
                     and m.user_id = v_uid
                     and m.role in ('owner', 'admin')) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'Organization configuration is owner/admin only.';
    end if;
  else
    raise exception 'knob_write_door_for: % declares authority_kind %, which this door does not know how to ask', v_row.feature_prefix, v_row.authority_kind
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'key', p_key,
    'feature_prefix', v_row.feature_prefix,
    'set_door', v_row.set_door,
    'clear_door', v_row.clear_door,
    'authority_kind', v_row.authority_kind,
    'reason', v_row.reason,
    'may_write', v_may,
    'authority_detail', v_detail);
end;
$function$;

-- ── 8. THE DOOR ROWS, THEN THE GRANT ─────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
select 'platform', d.fn, d.args, d.types, d.reason,
       'flipseams_every_switch_from_old_to_new_is_one_owner_press.sql',
       null, true, false,
       jsonb_build_object('version', 1,
         'declared_by', 'flipseams_every_switch_from_old_to_new_is_one_owner_press.sql',
         'declared_at', '2026-09-25 lane FLIP-SEAMS',
         'arguments', d.rules)
  from (values
    ('cutover_seams', 'p_organization_id uuid', array['uuid'::regtype]::oid[],
     'THE read door for every switch from an old system to a new one: each seam''s state for the organization (old until an owner presses it), its readiness measured now, what the flip does and how it is reversed, and whether the caller may press. Members of the organization and platform admins read; the server''s key reads; anyone else is answered not_yours, identical to an invented id.',
     jsonb_build_object('p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
       'check', 'iam.organization_member for auth.uid(), or public.is_admin(); otherwise not_yours before anything is read.',
       'foreign', jsonb_build_object('note', 'another organization and an invented id both answer not_yours with the same sentence.', 'not_a_leak', true, 'same_as_invented', true),
       'verified', '2026-09-25 lane FLIP-SEAMS — written with this body'))),
    ('cutover_seam_press', 'p_seam_key text, p_organization_id uuid, p_to text, p_note text',
     array['text'::regtype, 'uuid'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
     'THE write door for a seam switch: an owner of the organization or a platform admin, signed in (JWT role authenticated with a session_id) and pressing from a page (Origin header), moves one seam to new (only when its readiness is met) or back to old. The seam''s own step (archive the older tables; set the seam''s knob) runs inside the press and is rolled back whole on failure. Every press, done or refused, is one append-only platform.cutover_seam_press row.',
     jsonb_build_object(
       'p_seam_key', jsonb_build_object('type', 'text', 'position', 1, 'check', 'a platform.cutover_seam row; unknown answers unknown_switch.'),
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'organization',
         'check', 'iam.organization_member role owner for auth.uid(), or public.is_admin(); a non-member answers not_yours.',
         'foreign', jsonb_build_object('note', 'another organization and an invented id answer not_yours alike.', 'not_a_leak', true, 'same_as_invented', true),
         'verified', '2026-09-25 lane FLIP-SEAMS — written with this body'),
       'p_to', jsonb_build_object('type', 'text', 'position', 3, 'check', 'new | old'),
       'p_note', jsonb_build_object('type', 'text', 'position', 4, 'check', 'free text kept on the press row')))
  ) as d(fn, args, types, reason, rules)
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'platform' and c.function_name = d.fn and c.identity_args = d.args);

grant execute on function platform.cutover_seams(uuid) to authenticated, service_role;
grant execute on function platform.cutover_seam_press(text, uuid, text, text) to authenticated;
