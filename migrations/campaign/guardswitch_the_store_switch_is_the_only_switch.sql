-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- based-on: platform.relations_are_on(uuid) 5874f67d2ad155950a464e5620b499e1f1eb5c850e272e0bba50872ae0f5d08e
-- based-on: platform.assert_relations_door(uuid) 11e4254a1d5d46070c5b5b229ff5102b3e4ac9c3498ae3d251efb944556238d4
-- based-on: custom._entity_custom_fields_guard() 139052a902897e049a45cc929dca4fca7988ffe626191a062a8444ebe1fa6996
-- based-on: platform._doctrine_field_shape_guard() 459b85d3c384b17ac52813bc10a580ca3d6b8f5f536092d11d8534db8fb17e28
-- based-on: history.capture_is_open(uuid) 221abfd7ac96a299d704ef9bf234c1af2c912e8ec700b4598a70a79281117007
-- based-on: history.who_could_see(uuid, uuid, timestamp with time zone) a44ab7c486890de46adea698d2dc6814718e58321bf613566bc96b2a4dc9e5a6
-- based-on: history.prune(uuid, text, uuid, boolean) 7139d2c9eec51877c222f7ff1cb3348c5cb2e17fe58aa72b0b813d4e37f4d6dd
--
-- GUARD-SWITCH 1 — THE CLASS DOOR-FIX's B1 OPENED, CLOSED FOR EVERY OTHER PER-OBJECT GUARD.
--
-- B1 (2026-09-19, DOOR-FIX) found `custom/field_index_guard`: a per-object knob, false
-- platform-wide, `overridable_by = {}` — no rung anywhere could turn it on — standing in
-- front of a rule the store is supposed to enforce. Its words, kept: "A per-object knob with
-- no route to being turned on is not a switch; it is an outage with a name." The fix was to
-- read the organization's OWN switch, `custom/system_enabled`, through `custom.store_is_open`.
--
-- THAT WAS ONE INSTANCE. MEASURED LIVE on the main database today, the class has eight
-- members — every `custom/*_guard` row in `platform.feature_knob`, all `false`, all
-- `overridable_by = {}`:
--
--   custom/field_index_guard             fixed by B1; this file does not touch it again
--   custom/associations_guard            THE RELATION SURFACE — fixed here
--   custom/entity_custom_fields_guard    CUSTOM FIELDS ON A STANDARD TABLE — fixed here
--   custom/row_versions_guard            THE STORE'S HISTORY WRITER — fixed here
--   custom/accessible_entity_ids_guard   census only, see below
--   custom/emergency_door_guard          census only, see below
--   custom/signup_provisioning_guard     census only, see below
--   custom/entity_types_guard            census only, see below
--
-- THE FOUR THIS FILE DOES NOT MOVE, AND WHY — a census with a reason, not a silence.
--   · `custom/accessible_entity_ids_guard` is read by `iam.accessible_entity_ids(type,
--     level, depth, public)`, which takes NO organization. There is no organization rung to
--     follow; it answers for the calling person across every organization at once.
--   · `custom/emergency_door_guard` is read by `iam.emergency_door_pending()`, likewise with
--     no organization in scope.
--   · `custom/signup_provisioning_guard` gates SIGNUP (`public._provision_new_user_personal_org`,
--     `billing.resolve_tier`, two membership triggers). At signup there is no organization
--     yet whose store switch could be read, and the reads pass `null` for that reason.
--   · `custom/entity_types_guard` gates `iam.converge_legacy_column`, which RENAMES a column
--     live app code reads. That is the one class the campaign stops at, whatever a switch
--     says. It stays off and stays platform-wide, deliberately.
--
-- WHAT CHANGES, AND WHAT DOES NOT. Nothing is relaxed and no check is removed. An
-- organization whose store is OFF sees exactly what it sees today — `custom.store_is_open`
-- resolves `custom/system_enabled` at the organization rung and, like every other reader of
-- it, treats a switch it cannot READ as CLOSED rather than open. What changes is that an
-- organization whose store is ON now gets the rules these guards were holding shut: the
-- organization wall and the relation contract on `platform.associations`, the custom-fields
-- validation and doctrine shape rules on its standard tables, and its own history.
--
-- AND IT IS ORGANIZATION-OVERRIDABLE, which is the whole point: `custom/system_enabled`
-- carries `overridable_by = {organization}`, so the switch screen's ramp
-- (/administration/database/unified-data-ramp, `platform.unified_data_store_set`) turns all
-- of them on for one organization at a time. Before this file there was no rung, anywhere,
-- that could turn any of them on.
--
-- The three knob rows are relabelled in
-- migrations/campaign/guardswitch_the_retired_guard_knobs_say_so.sql — a knob row still
-- claiming to govern something nothing reads is a lie on a settings screen.
--
-- INVERSE: migrations/inverse/guardswitch_the_store_switch_is_the_only_switch_down.sql

set lock_timeout = '3s';
set statement_timeout = '120s';


-- ═════════════════════════════════════════ 1. THE RELATION SURFACE (associations_guard)
-- One function answers "are relations on here" for all three readers —
-- platform.enforce_relation_edge (the contract AND the organization wall, REL-12/VIS-34),
-- platform.trg_reachability_on_association, and platform.assert_relations_door — so the
-- class is fixed in one body rather than in three.
create or replace function platform.relations_are_on(p_organization_id uuid default null::uuid)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_on boolean;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move: THE ORGANIZATION'S OWN SYSTEM SWITCH, not a second
  -- knob nobody can turn on. `custom/associations_guard` was false platform-wide with
  -- `overridable_by = {}`, so the relation contract — including the organization wall, which
  -- is the half VIS-2 recorded as dark — could never run for anybody. `custom.store_is_open`
  -- resolves `custom/system_enabled` at the organization rung and treats a switch it cannot
  -- READ as closed, never open, which is the same posture this function already had.
  v_on := custom.store_is_open(p_organization_id);
  return v_on;
end;
$$;

create or replace function platform.assert_relations_door(p_organization_id uuid default null::uuid)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_owner oid;
  v_who   name := coalesce(nullif(current_setting('role', true), 'none'), session_user);
begin
  -- ONE QUESTION NOW, not two. `platform.relations_are_on` IS the store switch after
  -- GUARD-SWITCH, so the second arm this function used to carry (an organization whose store
  -- is open may ask this surface even while custom/associations_guard is off) has become the
  -- first arm. It is kept as one read rather than two identical ones.
  if platform.relations_are_on(p_organization_id) then
    return;
  end if;
  -- Read the owner from the catalogue, never as a role literal (rule 15).
  select c.relowner into v_owner from pg_class c where c.oid = 'platform.associations'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;
  raise exception 'Relations are switched off, so this is not answering "%" yet.', v_who
    using errcode = '42501',
          hint = 'This organization''s record store is switched off — custom/system_enabled resolves false for it — so the relation surface over platform.associations takes callers only from the role that owns that table. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp); there is no separate relations switch any more (GUARD-SWITCH, 2026-09-19). Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$$;


-- ═══════════════════════════════ 2. CUSTOM FIELDS ON A STANDARD TABLE (entity_custom_fields_guard)
create or replace function custom._entity_custom_fields_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_org uuid;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move. This used to read `custom/entity_custom_fields_guard`,
  -- which was false platform-wide with no rung that could turn it on, so a `custom_fields`
  -- document on a standard Entity table was never validated for anybody. It now follows the
  -- organization's own store switch: an organization whose store is OFF answers byte for byte
  -- as it does today, and an organization whose store is ON has its custom fields checked.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if v_org is null then
    return new;
  end if;
  if not custom.store_is_open(v_org) then
    return new;
  end if;
  perform custom.validate_custom_fields(tg_argv[0], v_org, to_jsonb(new) -> 'custom_fields');
  return new;
end;
$$;

create or replace function platform._doctrine_field_shape_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_on    boolean;
  v_hit   record;
  v_key   text := lower(coalesce(new.field_key, ''));
  v_name  text := lower(coalesce(new.display_name, ''));
begin
  -- GUARD-SWITCH (2026-09-19), B1's move: the same switch the rest of the custom-fields layer
  -- follows. Off for this organization, this guard passes everything through exactly as it
  -- does today; on, REC-39 / REC-30 / REC-31 are enforced for it.
  v_on := custom.store_is_open(new.organization_id);
  if not v_on then
    return new;
  end if;

  -- REC-39 FIRST, because it refuses a field of ANY type: a private column on a shared table is
  -- wrong even when its type is right.
  select * into v_hit
    from platform.doctrine_shape_vocabulary() d
   where d.kind = 'private'
     and (v_key like '%' || d.word || '%' or v_name like '%' || replace(d.word, '_', ' ') || '%')
   limit 1;
  if found then
    raise exception 'REC-39: "%" is a per-person field on an organization''s table', new.field_key
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = 'REC-39' and d2.sentence is not null limit 1);
  end if;
  if coalesce((new.display_config ->> 'per_user')::boolean, false)
     or coalesce((new.display_config ->> 'private_to_creator')::boolean, false) then
    raise exception 'REC-39: "%" declares itself per-person (display_config per_user / private_to_creator) on an organization''s table', new.field_key
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = 'REC-39' and d2.sentence is not null limit 1);
  end if;

  -- REC-30 and REC-31 refuse only a SCALAR declaration. A field that already IS a relation --
  -- user_reference, entity_reference or file -- is the right answer and passes untouched.
  if new.field_type in ('user_reference', 'entity_reference', 'file') then
    return new;
  end if;

  select * into v_hit
    from platform.doctrine_shape_vocabulary() d
   where d.kind in ('person', 'picture')
     and (v_key like '%' || d.word || '%' or v_name like '%' || replace(d.word, '_', ' ') || '%')
   limit 1;
  if found then
    raise exception '%: "%" is declared % but it names a %',
      v_hit.law, new.field_key, new.field_type,
      case v_hit.kind when 'person' then 'person' else 'picture' end
      using errcode = 'check_violation',
            hint = (select d2.sentence from platform.doctrine_shape_vocabulary() d2
                     where d2.law = v_hit.law and d2.sentence is not null limit 1)
                   || ' (the field type this wants is ' || v_hit.remedy_type || ')';
  end if;

  return new;
end;
$$;


-- ═══════════════════════════════════════════ 3. THE STORE'S HISTORY (row_versions_guard)
create or replace function history.capture_is_open(p_organization_id uuid default null::uuid)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $$
declare
  v_knob boolean;
begin
  -- GUARD-SWITCH (2026-09-19), B1's move. This used to read `custom/row_versions_guard`, a
  -- knob false platform-wide with no rung that could turn it on, so history capture ran only
  -- for the role that OWNS the store. It now follows the organization's own store switch, so
  -- an organization on the store records its own changes — which is what makes
  -- `custom.visibility_as_of` and `history.record_at` answerable for it at all.
  v_knob := custom.store_is_open(p_organization_id);
  if v_knob then
    return true;
  end if;

  -- THE ONE DOOR PREDICATE, unchanged. It raises 42501 when the store is shut to this caller,
  -- and returns silently when the store is open or the caller owns it — which is exactly the
  -- question "should this write be recorded". Turning its refusal into `false` here, rather
  -- than writing a second knob read, is what keeps ONE door in this schema.
  begin
    perform custom.assert_store_door(p_organization_id, 'history.row_versions');
    return true;
  exception when insufficient_privilege then
    return false;
  end;
end;
$$;


-- The two other readers that NAMED the retired knob in a sentence a person reads. Neither
-- decision moves: both already asked `history.capture_is_open`, which IS the store switch now.
-- What moves is the remedy they print, which pointed at a knob nobody could turn on.
CREATE OR REPLACE FUNCTION history.who_could_see(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(principal_kind text, principal_id uuid, level text, via_kind text, via_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_doc     jsonb;
  v_node    uuid := p_record_id;
  v_depth   integer := 0;
  v_ceiling integer;
  v_chain   uuid[] := array[]::uuid[];
begin
  -- RULE 16, AND IT IS THE HARD HALF OF VIS-16. A replay of a window the store was not
  -- recording would be a guess with a query's confidence, so both halves must have been
  -- watching: the record's own versions AND the grant rows.
  perform history.assert_watching('custom.record', p_at);
  perform history.assert_watching('iam.permissions', p_at);

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2), THROUGH THE ONE PREDICATE. GUARD-SWITCH
  -- (2026-09-19): the second, direct read of the retired custom/row_versions_guard that used
  -- to stand beside this one is gone — `history.capture_is_open` now follows the
  -- organization's own `custom/system_enabled`. While the store is shut to this caller
  -- nothing has been written for this organization to replay FROM, and an audit answered out
  -- of a store that was not recording is the confident wrong answer VIS-16 exists to refuse.
  if not history.capture_is_open(p_organization_id) then
    raise exception 'History is not recording for this organization, so there is nothing to replay.'
      using errcode = '42501',
            hint = 'This organization''s record store is switched off (custom/system_enabled resolves false for it) and this caller does not own the store, so nothing has been recorded to replay. Nothing was guessed at. Turn the store on for this organization on the switch screen (/administration/database/unified-data-ramp); a caller never turns it on for itself.';
  end if;

  -- The CONTAINMENT CHAIN AS IT STOOD THEN — not as it stands now. A record moved into a
  -- different parent since D would otherwise be answered with today's parent's audience,
  -- which is the wrong answer to the only question anybody asks this for.
  v_ceiling := custom.containment_depth_ceiling(p_organization_id);
  loop
    v_chain := v_chain || v_node;
    v_doc := (history.record_at(p_organization_id, v_node, p_at)) -> 'data';
    exit when v_doc is null;
    v_node := nullif(v_doc ->> 'parent_id', '')::uuid;
    exit when v_node is null;
    exit when v_node = any (v_chain);          -- a loop in the past is still a loop
    v_depth := v_depth + 1;
    exit when v_depth > v_ceiling;
  end loop;

  return query
  -- (1) Everyone a grant named, on the record or on anything it was inside at the time.
  select case when g.granted_to_user_id is not null then 'user'
              when g.granted_to_organization_id is not null then 'organization'
              else 'public' end,
         coalesce(g.granted_to_user_id, g.granted_to_organization_id),
         g.level,
         case when c.node = p_record_id then 'record' else 'container' end,
         c.node
    from unnest(v_chain) as c(node)
    cross join lateral history.grants_at('record', c.node, p_at) g
  union
  -- (2) The organization's own members, when the record's visibility at the time let them
  --     see it. Visibility is read from the REPLAYED document, never from the live row — ONCE,
  --     and as text: the document may carry it at the top or inside `data`, and a `coalesce`
  --     over one of each was a plan-time type error that made this whole function unusable.
  --     `in (…)` over a NULL is false, so "the replay states nothing" excludes the member
  --     rung exactly as it should.
  select 'user', m.user_id, 'viewer', 'organization', p_organization_id
    from iam.organization_member m
   where m.organization_id = p_organization_id
     and coalesce((history.record_at(p_organization_id, p_record_id, p_at)) -> 'data' ->> 'visibility',
                  (history.record_at(p_organization_id, p_record_id, p_at)) ->> 'visibility')
         in ('internal', 'public');
end;
$function$;

CREATE OR REPLACE FUNCTION history.prune(p_organization_id uuid, p_scope text DEFAULT 'values'::text, p_table_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_days     integer;
  v_cutoff   timestamptz;
  v_count    bigint := 0;
  v_started  timestamptz := clock_timestamp();
begin
  -- HIS-4, AND IT IS THE FIRST THING THIS FUNCTION DOES. No argument, no organization, no
  -- table and no privilege reaches past this line.
  if p_scope = 'migration_log' then
    raise exception 'The Migration log is never pruned — not by a table, not by an organization, not by this function.'
      using errcode = '0A000',
            hint = 'HIS-4: every structural change ever made here stays on the record permanently, which is what makes an old Migration undoable at all (HIS-8) and what lets anybody ask what this data used to look like. Value history is what retention shortens: call this with ''values'', or with ''structure'' for the definitions'' own version rows. If the log has grown beyond what this database should hold, that is a capacity decision for a person, not a prune a caller may ask for.';
  end if;

  if p_scope is null or p_scope not in ('values', 'structure') then
    raise exception 'history.prune: % is not something this store prunes.', coalesce(p_scope, 'nothing')
      using errcode = '22023',
            hint = 'The scopes are ''values'' (records'' value history) and ''structure'' (Tables'', Fields'' and Rules'' own version rows). ''migration_log'' is refused by name — HIS-4.';
  end if;

  if p_organization_id is null then
    raise exception 'history.prune: which organization''s history?'
      using errcode = '22004',
            hint = 'Retention is resolved per organization, so a prune that spans organizations would apply one organization''s floor to another''s history.';
  end if;

  -- The guard, by name, through the one predicate — a prune while the store is switched off
  -- would delete rows nothing can currently read. GUARD-SWITCH (2026-09-19): the switch this
  -- names is the organization's own custom/system_enabled, read through
  -- `history.capture_is_open`; the old custom/row_versions_guard is retired and decides nothing.
  if not history.capture_is_open(p_organization_id) then
    raise exception 'The history store is not open here, so nothing was pruned.'
      using errcode = '42501',
            hint = 'This organization''s record store is switched off (custom/system_enabled resolves false for it) and this caller does not own the store. Nothing was deleted. Turn the store on for this organization on the switch screen; a caller never turns it on for itself.';
  end if;

  v_days := case when p_table_id is null
                 then history.retention_floor_days(p_organization_id)
                 else history.retention_days(p_organization_id, p_table_id) end;
  v_cutoff := now() - make_interval(days => v_days);

  with candidate as (
    select v.id,
           row_number() over (partition by v.row_id order by v.occurred_at desc, v.id desc) as recency_rank
      from history.row_versions v
      join custom.record r
        on r.organization_id = v.organization_id and r.id = v.row_id
     where v.entity_type = 'custom.record'
       and v.organization_id = p_organization_id
       and v.occurred_at < v_cutoff
       and (p_table_id is null or r.table_id = p_table_id)
       and (case when p_scope = 'values' then r.data_class = 'record'
                 else r.data_class <> 'record' end)
       -- HIS-4 AGAIN, AS A PREDICATE RATHER THAN AS A PROMISE: a row-version a Migration
       -- names is part of the Migration log's evidence and is never a prune candidate, even
       -- under 'values', even past retention. An undo that finds its inverse and not the
       -- rows it describes is an undo that lies.
       and not exists (select 1 from history.migration_log m
                        where m.organization_id = v.organization_id
                          and v.id between coalesce(m.row_version_lo, v.id) and coalesce(m.row_version_hi, v.id))
  ),
  doomed as (
    -- The same policy the live trim already applies to the other store: the two most recent
    -- versions of a row survive whatever retention says, so "what did this look like before
    -- the last change" is always answerable.
    select id from candidate where recency_rank > 2
  ),
  gone as (
    delete from history.row_versions
     where not p_dry_run and id in (select id from doomed)
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end
    into v_count;

  return jsonb_build_object(
    'function', 'history.prune',
    'scope', p_scope,
    'organization_id', p_organization_id,
    'table_id', p_table_id,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'policy', 'keep the two most recent versions of every row, and everything inside retention; never a row the Migration log names (HIS-4)',
    'dry_run', p_dry_run,
    'rows_pruned', v_count,
    'duration_ms', extract(millisecond from (clock_timestamp() - v_started))::int,
    'at', now());
end;
$function$;
