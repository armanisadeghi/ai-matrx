-- NO `-- target:` HEADER, deliberately, and the reason is in the file rather than in a
-- lane's head. This file writes HISTORY ROWS — inserts into `history.row_versions` and
-- `history.capture_window` — and those are not registry tables, so the production allow-list
-- refuses them by name. They are also the whole point: a backfill that cannot write the rows
-- it is a backfill of is nothing. A file with no `-- target:` line is production-only by
-- definition and is judged for the non-additive statement CLASSES instead, which is the right
-- judgement here: nothing in this file drops, revokes, rewrites a live body it did not
-- declare, or touches a row anybody else's code owns. It is the same shape as
-- `doorfix_the_retired_promotion_knob_says_so.sql`.
--
-- GUARD-SWITCH 2 — A KNOB CHANGE IS RECORDED, IN THE ONE HISTORY STORE.
--
-- VIS-2 left this behind, in its own words: "`custom.visibility_as_of` reports the membership
-- arm with `replayed = false`: the knob registry keeps no history, so today's knob values are
-- applied to that day and the row says so." An audit answer that quietly applies today's
-- settings to a date in the past is the confident wrong answer VIS-16 exists to refuse, and
-- saying so in a `reason` string is honest but is not an answer.
--
-- WHAT WAS ALREADY THERE, AND WHY IT IS NOT THIS. `platform.knob_override_audit` records
-- overrides (519 rows, live) — but it records ONLY overrides, never the platform value a knob
-- resolves from; it is not partitioned or retained with the rest of history; and it is not
-- the shape `custom.record_state_as_of` and `history.who_could_see` replay from. A second
-- history store answering a different half of the same question is the parallel layer this
-- platform refuses. It stays exactly as it is, as the administrative audit trail it is.
--
-- WHAT THIS FILE LANDS, all through the machinery `history.*` already has:
--
--   · Two capture windows, `platform.feature_knob` and `platform.knob_override`, so a replay
--     can tell "the knob did not change" from "nobody was recording" — the same distinction
--     `history.assert_watching` already draws for records and grants.
--   · `platform.knob_history_row_id(feature, key, scope_kind, scope_id)` — history keys rows
--     by a uuid and a knob's identity is a tuple, so the tuple is hashed into a STABLE uuid.
--     Same knob, same rung, same id, for ever, which is what makes
--     `distinct on (row_id) ... order by occurred_at desc` — the exact walk the grant arm and
--     the record arm already use — answer "its value then".
--   · `platform._knob_history_capture()`, an AFTER trigger on BOTH registry tables, writing
--     `history.row_versions` rows IN THE SAME TRANSACTION as the knob write. Not a job, not a
--     queue: a knob change that committed while its history row did not would be exactly the
--     silent gap this exists to close.
--   · `platform.knob_value_as_of(feature, key, organization, at)` — the read. It returns the
--     value AND whether it was replayed, never one without the other.
--   · THE BACKFILL: one row per current value, platform values and overrides alike, stamped
--     NOW — which is the honest claim. We know what every knob says today; we do not know
--     what it said yesterday, and a backfill stamped with an older date would invent that.
--     So a replay of a moment before this file ran answers `replayed = false` and says why.
--
-- RETENTION. `history.prune` is the only thing that deletes from `history.row_versions`, and
-- its candidate set is `entity_type = 'custom.record'` joined to `custom.record` — so a knob
-- row is not a prune candidate under any scope, any organization or any floor, and the
-- retention floor (`history.retention_floor_days`, 30 days minimum, raise-only) is respected
-- by construction rather than by a promise. HIS-4's rule for the Migration log — the record
-- of a structural change is never pruned — is the same reasoning: a knob change IS a
-- structural change to what people can see.
--
-- ADDITIVE: two capture-window rows, three new functions, two new triggers, and inserts into
-- an existing partitioned table. It drops nothing and revokes nothing, and with no knob ever
-- written again every existing reader answers exactly as it does today.
--
-- INVERSE: migrations/inverse/guardswitch_a_knob_change_is_recorded_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ══════════════════════════════════════════════════════ THE KNOB'S IDENTITY, AS A ROW ID
create or replace function platform.knob_history_row_id(
  p_feature text, p_key text, p_scope_kind text default null, p_scope_id uuid default null)
returns uuid
language sql
immutable
set search_path to 'pg_catalog'
as $$
  -- A knob is identified by (feature, key, rung, rung id) and history keys a row by a uuid.
  -- md5 of the tuple IS that uuid: deterministic, collision-free for this purpose, and
  -- reproducible from the knob alone — so a reader can ask for a knob's history without
  -- having to look up an id somewhere first. `platform` is the platform rung, which has no id.
  select md5('platform.knob:' || p_feature || '/' || p_key || '/' ||
             coalesce(p_scope_kind, 'platform') || '/' ||
             coalesce(p_scope_id::text, '-'))::uuid;
$$;


-- ═══════════════════════════════════════ THE WRITER — IN THE SAME TRANSACTION, ALWAYS
create or replace function platform._knob_history_capture()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_row  jsonb;
  v_old  jsonb;
  v_op   text;
  v_rid  uuid;
  v_org  uuid;
  v_kind text;
begin
  if tg_table_name = 'knob_override' then
    if tg_op = 'DELETE' then
      v_row := to_jsonb(old); v_op := 'DELETE';
    else
      v_row := to_jsonb(new);
      v_op  := case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
      if tg_op = 'UPDATE' and (to_jsonb(new) -> 'value') is not distinct from (to_jsonb(old) -> 'value') then
        -- The contentless-update guard `history.record_capture` already applies: a snapshot
        -- identical to its predecessor in the only field that changes what a knob RESOLVES
        -- is not a version of anything.
        return new;
      end if;
    end if;
    v_rid  := platform.knob_history_row_id(v_row ->> 'feature', v_row ->> 'key',
                                           v_row ->> 'scope_kind', nullif(v_row ->> 'scope_id', '')::uuid);
    v_org  := nullif(v_row ->> 'organization_id', '')::uuid;
    v_kind := 'platform.knob_override';
  else
    -- platform.feature_knob: the PLATFORM value every organization resolves from when it has
    -- no override. Only the columns that change what the knob resolves to are a version;
    -- a label or a review date is not.
    if tg_op = 'DELETE' then
      v_row := to_jsonb(old); v_op := 'DELETE';
    else
      v_row := to_jsonb(new); v_old := to_jsonb(old);
      v_op  := case when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
      if tg_op = 'UPDATE'
         and (v_row -> 'value')          is not distinct from (v_old -> 'value')
         and (v_row -> 'default_value')  is not distinct from (v_old -> 'default_value')
         and (v_row -> 'overridable_by') is not distinct from (v_old -> 'overridable_by')
         and (v_row -> 'allowed_values') is not distinct from (v_old -> 'allowed_values')
         and (v_row -> 'bound_value')    is not distinct from (v_old -> 'bound_value') then
        return new;
      end if;
    end if;
    v_rid  := platform.knob_history_row_id(v_row ->> 'feature', v_row ->> 'key', null, null);
    v_org  := null;
    v_kind := 'platform.feature_knob';
  end if;

  insert into history.row_versions
         (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
  values (v_kind, v_rid, v_org, 1, v_op, v_row,
          coalesce(nullif(current_setting('app.user_id', true), '')::uuid,
                   nullif(v_row ->> 'updated_by', '')::uuid,
                   (select auth.uid())),
          platform.actor_tier());

  -- The window opens on the first change actually recorded, never on the apply — so a replay
  -- can tell "nothing happened" from "nobody was watching".
  insert into history.capture_window (entity_type, note)
  values (v_kind, 'GUARD-SWITCH: a knob change is recorded, so "who could see this on that day" replays the settings of that day rather than today''s')
  on conflict (entity_type) do nothing;

  return coalesce(new, old);
end;
$$;

create or replace trigger knob_history_capture_tg
  after insert or update or delete on platform.knob_override
  for each row execute function platform._knob_history_capture();

create or replace trigger knob_history_capture_tg
  after insert or update or delete on platform.feature_knob
  for each row execute function platform._knob_history_capture();


-- ══════════════════════════════════════════════════════════════════════ THE READ
create or replace function platform.knob_value_as_of(
  p_feature text, p_key text, p_organization_id uuid, p_at timestamptz)
returns table(value jsonb, replayed boolean)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $$
-- WHAT DID THIS KNOB SAY AT THAT MOMENT, and is that a replay or today's answer?
--
-- `replayed = true` means both windows were open at p_at and the answer came out of
-- `history.row_versions`. `replayed = false` means history was not watching yet, and the
-- value returned is the LIVE resolution — the same answer as before this machinery existed,
-- with the flag that says so. It never returns null-and-silent: a caller that cannot tell
-- "unknown" from "false" is how a knob-shaped hole becomes a wrong audit answer.
declare
  v_window timestamptz;
  v_base   jsonb;
  v_over   jsonb;
  v_found  boolean := false;
  v_del    boolean;
  v_kinds  text[];
begin
  select w.opened_at into v_window
    from history.capture_window w where w.entity_type = 'platform.feature_knob';

  if v_window is not null and p_at >= v_window then
    select coalesce(h.row_data -> 'value', h.row_data -> 'default_value'),
           array(select jsonb_array_elements_text(coalesce(h.row_data -> 'overridable_by', '[]'::jsonb)))
      into v_base, v_kinds
      from history.row_versions h
     where h.entity_type = 'platform.feature_knob'
       and h.row_id = platform.knob_history_row_id(p_feature, p_key, null, null)
       and h.occurred_at <= p_at
       and h.operation <> 'DELETE'
     order by h.occurred_at desc, h.id desc
     limit 1;
    v_found := v_base is not null;
  end if;

  if not v_found then
    -- HISTORY WAS NOT WATCHING. Today's answer, and it says so.
    return query select platform.knob_resolve(p_feature, p_key, p_organization_id), false;
    return;
  end if;

  if p_organization_id is not null and v_kinds @> array['organization'] then
    select h.row_data -> 'value', h.operation = 'DELETE'
      into v_over, v_del
      from history.row_versions h
     where h.entity_type = 'platform.knob_override'
       and h.row_id = platform.knob_history_row_id(p_feature, p_key, 'organization', p_organization_id)
       and h.occurred_at <= p_at
     order by h.occurred_at desc, h.id desc
     limit 1;
    if v_over is not null and not coalesce(v_del, false) then
      return query select v_over, true;
      return;
    end if;
  end if;

  return query select v_base, true;
end;
$$;


-- ════════════════════════════════════════ THE BACKFILL — TODAY, AND ONLY CLAIMING TODAY
insert into history.row_versions
       (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
select 'platform.feature_knob',
       platform.knob_history_row_id(k.feature, k.key, null, null),
       null, 1, 'INSERT', to_jsonb(k), null, 'system'
  from platform.feature_knob k
 where not exists (
   select 1 from history.row_versions h
    where h.entity_type = 'platform.feature_knob'
      and h.row_id = platform.knob_history_row_id(k.feature, k.key, null, null));

insert into history.row_versions
       (entity_type, row_id, organization_id, version, operation, row_data, actor_id, actor_tier)
select 'platform.knob_override',
       platform.knob_history_row_id(o.feature, o.key, o.scope_kind, o.scope_id),
       o.organization_id, 1, 'INSERT', to_jsonb(o), o.updated_by, 'system'
  from platform.knob_override o
 where not exists (
   select 1 from history.row_versions h
    where h.entity_type = 'platform.knob_override'
      and h.row_id = platform.knob_history_row_id(o.feature, o.key, o.scope_kind, o.scope_id));

-- The windows open WITH the backfill, at the same moment: the earliest thing this store knows
-- about a knob is what it said when the backfill ran, and `history.assert_watching` will
-- refuse — correctly — any question about a moment before it.
insert into history.capture_window (entity_type, note)
values ('platform.feature_knob',  'GUARD-SWITCH backfill, 2026-09-19: one row per knob at its value then. Nothing before this moment is known about a knob, and a replay of an earlier moment says replayed = false rather than guessing.'),
       ('platform.knob_override', 'GUARD-SWITCH backfill, 2026-09-19: one row per override at its value then. Nothing before this moment is known about an override.')
on conflict (entity_type) do nothing;


-- ═══════════════════════════════════ THE ACCESS DECISION, DECLARED IN DATA (DD-223)
-- `platform.knob_value_as_of` is SECURITY DEFINER because it reads `history.row_versions`,
-- which no client role can see. It decides nothing itself and it must not: it answers what a
-- knob said, for any organization it is handed. Its callers — `iam.member_lane_open_as_of`
-- and `iam.member_default_level_as_of`, and through them `custom.visibility_as_of` — are
-- where the organization wall and the owner/admin test live.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'knob_value_as_of',
   'p_feature text, p_key text, p_organization_id uuid, p_at timestamp with time zone',
   array['text'::regtype, 'text'::regtype, 'uuid'::regtype, 'timestamptz'::regtype]::oid[],
   'What one knob said at one moment. p_organization_id is an organization id and is checked against NOTHING here by design — a null one asks for the platform value, and any other one asks what that organization''s override said; the function makes no access decision at all. p_feature/p_key name a registry row and an unknown pair answers the live resolution with replayed = false. p_at is the moment; a moment before the capture window answers today''s value with replayed = false rather than guessing.',
   'migrations/campaign/guardswitch_a_knob_change_is_recorded.sql (lane GUARD-SWITCH)',
   'server_only: it reports any organization''s settings history with no access decision of its own, by design — it is the replay primitive the membership arm of custom.visibility_as_of walks with, and that door is where the organization wall and the owner/admin test live. A client door onto it would hand any signed-in person any organization''s settings history.',
   false, false)
on conflict do nothing;
