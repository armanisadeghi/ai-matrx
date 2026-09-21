-- GUARD-SWITCH — THE RED TWIN. Every claim the green suite makes, made FALSE again by putting
-- the pre-GUARD-SWITCH bodies back — inside ONE transaction that is ROLLED BACK, so nothing
-- here survives the run. A guard you cannot show failing is not a guard.
--
-- RUN IT exactly like the green suite:
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/guardswitch_red.sql
--
-- Each block RAISES if the old body still behaves like the new one — that is, the block is
-- GREEN only when the defect it names is present, which is what makes it a red twin rather
-- than a second green suite. The bodies restored below are the ones in
-- migrations/inverse/guardswitch_*_down.sql, so running this also proves those inverses are
-- valid SQL against the live catalogue.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). A red twin proves the green suite's clauses
-- flip, so it must ask them in the SAME seat the green suite asks them in — otherwise one half
-- of the pair would be measuring the defect against the store's internals while the other
-- measures the fix against the product, and the pair would not be a pair. So the fixtures are
-- built and the blocks are asked from the seat `authenticated`, proved in PART 0, exactly as
-- `guardswitch_green.sql` does: the knob writes go through `platform.knob_override_set`, the
-- tables and records through `custom.table_declare` and `custom.record_write`, and the
-- cross-organization edges through the INSERT on `platform.associations` that a signed-in
-- person really holds.
--
-- THREE THINGS STEP OUT OF THE SEAT AND SAY WHY, asserting nothing about a person while out:
--   · the restored bodies above — `CREATE OR REPLACE FUNCTION` is DDL on functions the store
--     owns, and no client door covers it;
--   · the two Home records and the one relation FIELD — a Home is made by the onboarding path,
--     and `custom.field_declare` CANNOT declare a column pointing at another TABLE at all
--     (only `member` and `attachment`, which overwrite the target with the Person and File
--     kernels). That is a real finding of this lane, reported, not papered over;
--   · RED 3 (a `pg_proc` census) and RED 4 (`history.capture_window` and
--     `platform.knob_value_as_of`, which `platform.client_callable_door` DECLARES server-only
--     in those words). RED 5 asks `custom.visibility_as_of`, the door that register names as
--     the one a person reaches that truth through, and it is asked from the seat.

\set ON_ERROR_STOP on
\timing off

begin;
-- SEAT-SUITES 2026-09-19: MINUTES of headroom, not seconds. This transaction replaces a dozen
-- function bodies and then writes records through the doors, on a LIVE database where several
-- other campaign lanes are touching `custom.record` at the same time (one was mid-`drop
-- trigger` when this was measured). A 20-second lock wait made the file die in its fixtures
-- with `canceling statement due to lock timeout`, which reads exactly like a red block that
-- did not flip and is not one. Nothing here is asserted on time.
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'guardswitch_red_suite', true);

-- ─────────────────────────── the pre-GUARD-SWITCH bodies, restored inside this transaction
-- store's history writer go dark again for every organization, because none of those knobs
-- has a rung that can turn it on. That is the state this file exists to undo; it is written
-- because rule 27 requires an inverse, not because anybody should want it.
--
-- HOW IT IS RUN: the bodies are re-created from `pg_get_functiondef` output captured at
-- 2026-09-19 (see scratchpad `gs/`), so this file is long and literal on purpose.

CREATE OR REPLACE FUNCTION platform.relations_are_on(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on boolean;
begin
  -- The established read (§6b.4b, and `custom.store_is_open`'s own words): knob_resolve
  -- answers jsonb and `#>> '{}'` takes the scalar out. `platform.knob_resolve` is SECURITY
  -- INVOKER and `has_table_privilege('anon','platform.feature_knob','SELECT')` is false, so for
  -- a role that merely cannot SEE the row it RAISES `P0001 ... is not seeded`, which reads like
  -- a missing knob and is not one. A switch this reader cannot read is OFF, never on.
  begin
    v_on := coalesce((platform.knob_resolve('custom', 'associations_guard', p_organization_id) #>> '{}')::boolean,
                     false);
  exception when others then
    v_on := false;
  end;
  return v_on;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform.assert_relations_door(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name := coalesce(nullif(current_setting('role', true), 'none'), session_user);
begin
  if platform.relations_are_on(p_organization_id) then
    return;
  end if;
  -- THE RECORD STORE'S OWN ARM. REC-12 — what a relation says when the thing it points at is
  -- deleted — is a rule of the store, not a second product, and `custom.record_delete` cannot
  -- honour it without asking here. So an organization whose store is open
  -- (custom/system_enabled) may ask this surface even while custom/associations_guard is off.
  -- An organization whose store is CLOSED reaches nothing: custom.assert_store_door refuses
  -- that caller before any delete gets this far.
  if p_organization_id is not null and custom.store_is_open(p_organization_id) then
    return;
  end if;
  -- Read the owner from the catalogue, never as a role literal (rule 15).
  select c.relowner into v_owner from pg_class c where c.oid = 'platform.associations'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;
  raise exception 'Relations are switched off, so this is not answering "%" yet.', v_who
    using errcode = '42501',
          hint = 'Neither custom/associations_guard nor custom/system_enabled resolves true for this organization. While both are false, the relation surface over platform.associations belongs to the campaign that owns it and takes callers only from the role that owns platform.associations. The switch checklist turns a knob on; a lane never does. Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._entity_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  -- RULE 4''s FOURTH EXCEPTION AND NOTHING ELSE: while custom/entity_custom_fields_guard is
  -- OFF this body returns NEW untouched, so every existing write of this table answers
  -- exactly as it did against the go-signal capture. The knob resolves false on both
  -- databases and is turned on by the switch checklist, never by a lane.
  begin
    v_org := to_jsonb(new) ->> 'organization_id';
  exception when others then
    v_org := null;
  end;
  if not coalesce((platform.knob_resolve('custom', 'entity_custom_fields_guard', v_org) #>> '{}')::boolean, false) then
    return new;
  end if;
  if v_org is null then
    return new;
  end if;
  perform custom.validate_custom_fields(tg_argv[0], v_org, to_jsonb(new) -> 'custom_fields');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION platform._doctrine_field_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_hit   record;
  v_key   text := lower(coalesce(new.field_key, ''));
  v_name  text := lower(coalesce(new.display_name, ''));
begin
  -- THE KNOB. False on both databases today, so this guard passes everything through until the
  -- switch step turns the custom-fields layer on.
  select coalesce(
           (platform.knob_resolve('custom', 'entity_custom_fields_guard', new.organization_id) #>> '{}')::boolean,
           false)
    into v_on;
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
$function$
;

CREATE OR REPLACE FUNCTION history.capture_is_open(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_knob boolean;
begin
  -- The campaign's OFF switch for this writer, by name, so §6b.2's "a guarded body names its
  -- guard" is satisfied by a body that actually reads it rather than by a comment.
  begin
    v_knob := coalesce((platform.knob_resolve('custom', 'row_versions_guard', p_organization_id) #>> '{}')::boolean,
                       false);
  exception when others then
    -- §6b.4b: a knob this writer cannot SEE raises P0001 and reads like a missing knob.
    -- A switch that cannot be read is CLOSED.
    v_knob := false;
  end;
  if v_knob then
    return true;
  end if;

  -- THE ONE DOOR PREDICATE. It raises 42501 when the store is shut to this caller, and
  -- returns silently when the store is open or the caller owns it — which is exactly the
  -- question "should this write be recorded". Turning its refusal into `false` here, rather
  -- than writing a second knob read, is what keeps ONE door in this schema.
  begin
    perform custom.assert_store_door(p_organization_id, 'history.row_versions');
    return true;
  exception when insufficient_privilege then
    return false;
  end;
end;
$function$
;

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

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2). `custom/row_versions_guard` is the campaign
  -- switch for this store's writer: while it resolves false and the caller does not own the
  -- store, nothing has been written for this organization to replay FROM, and an audit answered
  -- out of a store that was not recording is the confident wrong answer VIS-16 exists to refuse.
  if not coalesce((platform.knob_resolve('custom', 'row_versions_guard', p_organization_id) #>> '{}')::boolean, false)
     and not history.capture_is_open(p_organization_id) then
    raise exception 'History is not recording for this organization, so there is nothing to replay.'
      using errcode = '42501',
            hint = 'custom/row_versions_guard resolves false and this caller does not own the store. Nothing was guessed at. The switch checklist turns the knob on; a caller never does.';
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
$function$
;

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

  -- The guard, by name, through the one predicate — a prune while the campaign is switched
  -- off would delete rows nothing can currently read.
  if not history.capture_is_open(p_organization_id) then
    raise exception 'The history store is not open here, so nothing was pruned.'
      using errcode = '42501',
            hint = 'custom/row_versions_guard resolves false and this caller does not own the store. Nothing was deleted. The switch checklist turns the knob on; a caller never does.';
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
$function$
;

CREATE OR REPLACE FUNCTION platform.custom_field_index_ddl(p_definition_id uuid, p_concurrently boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  d record; v_schema text; v_table text; v_col text; v_expr text;
  v_pred text; v_soft boolean; v_on boolean;
BEGIN
  SELECT * INTO d FROM platform.custom_field_definition WHERE id = p_definition_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'custom_field_index_ddl: definition % does not exist', p_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- RULING (a): THE GUARD IS ON THE GENERATOR. A switch this caller cannot read is CLOSED,
  -- and it says so with the key and the remedy rather than handing back DDL to run.
  BEGIN
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', d.organization_id) #>> '{}')::boolean, false);
  EXCEPTION WHEN OTHERS THEN
    v_on := false;
  END;
  IF NOT v_on THEN
    RAISE EXCEPTION 'promoting a custom field to an index is switched off here'
      USING ERRCODE = '0A000',
            HINT = 'custom/field_index_guard resolves false for this organization, so no index DDL was generated and nothing was changed. The switch checklist turns the knob on; a lane never does.';
  END IF;

  IF d.target_kind = 'entity_table' THEN
    SELECT et.schema_name, et.table_name, et.has_soft_delete INTO v_schema, v_table, v_soft
      FROM platform.entity_types et WHERE et.token = d.target_token;
    IF v_schema IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: token % is not registered', d.target_token
        USING ERRCODE = 'check_violation';
    END IF;

    -- THE COLUMN IS READ, NEVER GUESSED. Both names are live in this database — `custom` on
    -- the hr.* and seo.* tables, `custom_fields` on crm.party, custom.record and
    -- users.user_form_profile — so a literal is right for one half and builds an index over a
    -- column that does not exist for the other.
    SELECT a.attname INTO v_col
      FROM pg_attribute a
     WHERE a.attrelid = format('%I.%I', v_schema, v_table)::regclass
       AND a.attname IN ('custom_fields', 'custom')
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY CASE a.attname WHEN 'custom_fields' THEN 0 ELSE 1 END
     LIMIT 1;
    IF v_col IS NULL THEN
      RAISE EXCEPTION 'custom_field_index_ddl: %.% has nowhere to keep custom fields', v_schema, v_table
        USING ERRCODE = 'undefined_column',
              HINT = 'A table takes custom fields through a jsonb column named custom_fields (the canonical name) or custom (the older one). This table has neither, so an index over one would be a statement that cannot run.';
    END IF;

    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid';
  ELSE
    v_schema := 'platform'; v_table := 'custom_record'; v_soft := true;
    v_col  := 'data';
    v_pred := 'organization_id = ' || quote_literal(d.organization_id::text) || '::uuid'
           || ' AND entity_definition_id = ' || quote_literal(d.target_definition_id::text) || '::uuid';
  END IF;

  v_expr := platform.custom_field_index_expr(d.field_type, d.field_key, v_col);
  IF v_expr IS NULL THEN
    RAISE EXCEPTION 'custom_field_index_ddl: field_type % is not promotable', d.field_type
      USING ERRCODE = 'check_violation',
            HINT = 'multi_select and file values are served by the GIN containment index on the whole column; promoting them would index a shape, not a value.';
  END IF;

  IF v_soft THEN v_pred := v_pred || ' AND deleted_at IS NULL'; END IF;

  RETURN 'CREATE ' || CASE WHEN d.is_unique THEN 'UNIQUE ' ELSE '' END
      || 'INDEX ' || CASE WHEN p_concurrently THEN 'CONCURRENTLY ' ELSE '' END
      || 'IF NOT EXISTS ' || quote_ident(platform.custom_field_index_name(p_definition_id))
      || ' ON ' || quote_ident(v_schema) || '.' || quote_ident(v_table)
      || ' (' || v_expr || ') WHERE ' || v_pred;
END $function$;

CREATE OR REPLACE FUNCTION custom.visibility_as_of(p_organization_id uuid, p_record_id uuid, p_at timestamp with time zone)
 RETURNS TABLE(principal_kind text, principal_id uuid, level permission_level, through_kind text, through_id uuid, reason text, replayed boolean, held_from timestamp with time zone, held_to timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_me        uuid := custom.query_principal();
  v_from_rec  timestamptz;
  v_from_grn  timestamptz;
  v_from      timestamptz;
  v_state     jsonb;
  v_replayed  boolean;
  v_nodes     uuid[] := '{}';
  v_flags     boolean[] := '{}';
  v_frontier  uuid[];
  v_next      uuid[];
  v_depth     integer := 0;
  v_parent    uuid;
  v_id        uuid;
  v_capped    boolean := false;
  v_vis       text;
  r           record;
  v_member_default public.permission_level;
  v_lane_open boolean;
begin
  -- THE WALL, then the authority. Reading who ELSE could see something is an audit question.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.visibility_as_of');
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can ask who could see a record.'
      using errcode = '42501',
            hint = 'VIS-16 / VIS-N-3: "who could see this on that day" is an audit question about other people. A member can ask what THEY can see (custom.query_can_see); this door answers about everybody.';
  end if;

  if p_at is null then
    raise exception 'Asking who could see a record needs a moment to ask about.'
      using errcode = '22023', hint = 'Pass a timestamp, for example custom.visibility_as_of(org, record, ''2026-09-19 12:00Z'').';
  end if;

  -- BEFORE HISTORY BEGINS, IT REFUSES. Answering from the live tables would report today's
  -- grants as that day's, which is the one wrong answer this door must never give.
  select w.opened_at into v_from_rec from history.capture_window w where w.entity_type = 'custom.record';
  select w.opened_at into v_from_grn from history.capture_window w where w.entity_type = 'iam.permissions';
  v_from := greatest(coalesce(v_from_rec, 'infinity'::timestamptz), coalesce(v_from_grn, 'infinity'::timestamptz));
  if v_from is null or p_at < v_from then
    raise exception 'History for this store starts at %, so who could see a record on % cannot be answered.',
      coalesce(to_char(v_from, 'YYYY-MM-DD HH24:MI TZ'), 'no date at all — no capture window is open'),
      to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '22023',
            hint = 'VIS-16: the answer is replayed from history.row_versions, never read from the live tables. Reading the live tables for an older date would report today''s grants as that day''s, which is worse than no answer. Ask about a moment at or after the date above.';
  end if;

  select s.state, s.replayed into v_state, v_replayed
    from custom.record_state_as_of(p_record_id, p_at) s;
  if v_state is null or (v_state ->> 'organization_id')::uuid is distinct from p_organization_id then
    raise exception 'There was no record % in this organization at %.',
      p_record_id, to_char(p_at, 'YYYY-MM-DD HH24:MI TZ')
      using errcode = '02000',
            hint = 'It had not been created yet, it belonged to another organization then, or it never existed.';
  end if;
  v_vis := v_state ->> 'visibility';

  -- ARM 1 — THE OWNER, as the record recorded them then (VIS-25).
  if nullif(v_state ->> 'created_by', '') is not null then
    principal_kind := 'user';
    principal_id   := (v_state ->> 'created_by')::uuid;
    level          := iam.top_content_level();
    through_kind   := 'ownership';
    through_id     := p_record_id;
    reason         := 'They created this record, which is the top rung of the ladder and needs no grant row.';
    replayed       := v_replayed;
    return next;
  end if;

  -- THE WALK UP, REPLAYED. Containment parents and carrying relations as they stood then.
  v_nodes := array[p_record_id]; v_flags := array[v_replayed];
  v_frontier := array[p_record_id];
  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < c_max_depth loop
    v_depth := v_depth + 1;
    v_next := '{}';
    foreach v_id in array v_frontier loop
      select s.state, s.replayed into v_state, v_replayed
        from custom.record_state_as_of(v_id, p_at) s;
      continue when v_state is null;

      -- the containment parent, off the record's own document
      v_parent := custom.containment_parent(v_state -> 'data');
      if v_parent is not null and not (v_nodes @> array[v_parent]) then
        v_next := v_next || v_parent; v_nodes := v_nodes || v_parent; v_flags := v_flags || v_replayed;
      end if;

      -- every carrying relation that pointed AT this node then. A relation is a record, so
      -- this is the same history, asked the other way round.
      for r in
        select distinct (x.state -> 'data' ->> 'from')::uuid as container
          from custom.record c
          cross join lateral custom.record_state_as_of(c.id, p_at) x
         where c.organization_id = p_organization_id
           and c.data_class = 'relation'
           and x.state is not null
           and x.state ->> 'data_class' = 'relation'
           and coalesce((x.state -> 'data' ->> 'carrying')::boolean, false)
           and coalesce(x.state -> 'data' ->> 'kind', 'referenced') <> 'owned'
           and nullif(x.state -> 'data' ->> 'to', '') = v_id::text
           and nullif(x.state ->> 'deleted_at', '') is null
      loop
        if r.container is not null and not (v_nodes @> array[r.container]) then
          v_next := v_next || r.container; v_nodes := v_nodes || r.container; v_flags := v_flags || true;
        end if;
      end loop;
    end loop;
    if coalesce(array_length(v_nodes, 1), 0) > c_max_nodes then
      v_capped := true;
      exit;
    end if;
    v_frontier := v_next;
  end loop;
  if v_depth >= c_max_depth and coalesce(array_length(v_frontier, 1), 0) > 0 then
    v_capped := true;
  end if;

  if v_capped then
    principal_kind := 'ceiling';
    principal_id   := null;
    level          := null;
    through_kind   := 'walk';
    through_id     := p_record_id;
    reason         := format('The replayed walk up from this record hit its ceiling (%s hops or %s containers), so the answer below may be SHORT: a grant on a container further up would not be listed. It is reported rather than hidden.',
                             c_max_depth, c_max_nodes);
    replayed       := true;
    return next;
  end if;

  -- ARM 2 — THE GRANTS, replayed on the record and on every container it was inside then.
  return query
    with live as (
      select distinct on (h.row_id) h.row_id, h.row_data, h.operation
        from history.row_versions h
       where h.entity_type = 'iam.permissions'
         and h.occurred_at <= p_at
       order by h.row_id, h.occurred_at desc, h.id desc
    ), held as (
      select l.row_data as g
        from live l
       where l.operation <> 'DELETE'
         and coalesce(l.row_data ->> 'status', 'active') = 'active'
         and (nullif(l.row_data ->> 'expires_at', '') is null
              or (l.row_data ->> 'expires_at')::timestamptz > p_at)
         and l.row_data ->> 'resource_type' = 'record'
         and (l.row_data ->> 'resource_id')::uuid = any (v_nodes)
    )
    select case when nullif(h.g ->> 'granted_to_user_id', '') is not null then 'user'
                when nullif(h.g ->> 'granted_to_organization_id', '') is not null then 'organization'
                else 'everyone' end,
           coalesce(nullif(h.g ->> 'granted_to_user_id', '')::uuid,
                    nullif(h.g ->> 'granted_to_organization_id', '')::uuid),
           (h.g ->> 'permission_level')::public.permission_level,
           case when (h.g ->> 'resource_id')::uuid = p_record_id then 'grant' else 'container' end,
           (h.g ->> 'resource_id')::uuid,
           case when (h.g ->> 'resource_id')::uuid = p_record_id
                then 'A grant held directly on this record at that moment.'
                else 'A grant held at that moment on a container this record was inside, which carried down to it. What each edge conveys (custom.carrying_rule.conveys_max) is a live registry with no history, so the level shown is the grant''s own and VIS-3''s minimum-along-the-path is not applied here.' end,
           true,
           -- SEAT-SUITES 2026-09-19: `held_from` / `held_to` are columns a LATER lane added to
           -- the shipped `custom.visibility_as_of`. This is the body from BEFORE this lane, so
           -- it has no answer for them and says null rather than inventing one. Postgres
           -- refuses `create or replace` that changes a return type, so the restored body has
           -- to carry today's column list — and it did not, which is why this red twin failed
           -- to run at all on the main database before this was fixed (measured 2026-09-19,
           -- 42P13 "cannot change return type of existing function", on origin/main's own
           -- bytes). Nothing about what RED 5 asserts — `replayed` — changes.
           null::timestamptz, null::timestamptz
      from held h;

  -- ARM 3 — MEMBERSHIP, as the organization stood then, and only where the record's own
  -- visibility admitted the organization lane at all (DD-136).
  if coalesce(nullif(v_vis, ''), 'internal')::platform.visibility >= 'internal'::platform.visibility then
    v_lane_open := iam.member_lane_open(p_organization_id);
    v_member_default := iam.member_default_level(p_organization_id, nullif(v_state ->> 'table_id', '')::uuid);
    return query
      with live as (
        select distinct on (h.row_id) h.row_id, h.row_data, h.operation
          from history.row_versions h
         where h.entity_type = 'membership'
           and h.occurred_at <= p_at
         order by h.row_id, h.occurred_at desc, h.id desc
      ), mem as (
        select l.row_data as m
          from live l
         where l.operation not in ('DELETE', 'SOFT_DELETE')
           and nullif(l.row_data ->> 'deleted_at', '') is null
           and coalesce(l.row_data ->> 'status', 'active') = 'active'
           and l.row_data ->> 'container_type' = 'organization'
           and (l.row_data ->> 'container_id')::uuid = p_organization_id
      )
      select 'user',
             (m.m ->> 'user_id')::uuid,
             case when m.m ->> 'role' in ('owner', 'admin') then iam.top_content_level()
                  else v_member_default end,
             'organization',
             p_organization_id,
             case when m.m ->> 'role' in ('owner', 'admin')
                  then format('They were an %s of this organization at that moment, which reaches every record the organization can see.', m.m ->> 'role')
                  when not v_lane_open
                  then 'They were a member of this organization at that moment. This organization now says membership alone shows nothing (its "What members can see by default" setting), and that setting keeps no history — so this is TODAY''S answer applied to that day, not a replay.'
                  else 'They were a member of this organization at that moment, and membership alone reached this record. The level comes from custom/member_default_level, which keeps no history — so the level is today''s, applied to that day.' end,
             false,
             null::timestamptz, null::timestamptz
        from mem m
       where m.m ->> 'role' in ('owner', 'admin')
          or (v_lane_open and v_member_default is not null);
  end if;
end;
$function$

;



-- ═════════════════ AND THE OLD WORLD, not only the old BODIES, for this transaction only
-- SEAT-SUITES 2026-09-19. A red twin restores the state the defect lived in, and the bodies
-- are only half of that state: the four retired guard knobs stood at FALSE platform-wide with
-- `overridable_by = {}`, which is the "outage with a name" RED 1 exists to show. On the main
-- database today `custom/associations_guard` carries `value = true` (set 2026-09-16, after this
-- lane), so with the old body restored `platform.relations_are_on` answered TRUE for every
-- organization and RED 1 could not be red — measured 2026-09-19, and NOT caused by anything
-- this file asserts. The pre-lane value is put back here, inside the same transaction that is
-- rolled back, so the whole old world is standing when the five blocks are asked. This is
-- operator work on the knob register: it is done as the connected role, before the seat is
-- taken, and nothing is asserted while it happens.
update platform.feature_knob set value = 'false'::jsonb
 where feature = 'custom'
   and key in ('associations_guard', 'entity_custom_fields_guard',
               'row_versions_guard', 'field_index_guard');

-- ═══════════════════════════════════════════════════ THE FIXTURES, for this transaction only
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-0000000ded01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-0000000ded02';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_korg constant uuid := '11111111-0000-4000-8000-000000000004';
  v_red integer := 0;
  v_hq_a uuid; v_hq_b uuid; v_tbl_a uuid; v_tbl_b uuid;
  v_rec_a uuid; v_rec_b uuid; v_fld uuid;
  v_n bigint;
  v_res jsonb;
  v_val jsonb; v_rep boolean; r record; v_seen boolean := false; v_replayed boolean;
  v_boss text := current_user;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_a, 'GUARD-SWITCH Red A', 'guardswitch-red-a', 'GRA', v_admin),
         (v_b, 'GUARD-SWITCH Red B', 'guardswitch-red-b', 'GRB', v_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_a, 'organization', v_a, v_admin, 'owner',  'active'),
         (v_a, 'organization', v_a, v_dana,  'member', 'active'),
         (v_b, 'organization', v_b, v_admin, 'owner',  'active');

  -- The two Homes: made by the onboarding path, not by a browser, so they are made here,
  -- BEFORE the seat is taken, and nothing is asserted while that is true.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, v_korg, 'record', jsonb_build_object('name', 'Red HQ A'), v_admin) returning id into v_hq_a;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_b, v_korg, 'record', jsonb_build_object('name', 'Red HQ B'), v_admin) returning id into v_hq_b;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- Both stores on, and A has already said yes to cross-organization links — through the
  -- settings screen's own door, as an owner of each organization.
  v_res := platform.knob_override_set('custom', 'system_enabled', 'organization', v_a, v_a,
                                      'true'::jsonb, 'guardswitch_red fixtures');
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'the fixture could not switch A''s store on through the settings door: %', v_res; end if;
  v_res := platform.knob_override_set('custom', 'system_enabled', 'organization', v_b, v_b,
                                      'true'::jsonb, 'guardswitch_red fixtures');
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'the fixture could not switch B''s store on through the settings door: %', v_res; end if;
  v_res := platform.knob_override_set('custom', 'cross_organization_links', 'organization',
                                      v_a, v_a, 'true'::jsonb, 'guardswitch_red fixtures');
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'the fixture could not open A''s side of the wall through the settings door: %', v_res; end if;

  v_tbl_a := custom.table_declare(v_a, jsonb_build_object(
    'name', 'Case', 'slug', 'gs_red_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'),
                                jsonb_build_object('name', 'supplier', 'kind', 'relation')),
    'title_field', 'title', 'parent_id', v_hq_a::text,
    'cross_organization_relations', true));
  v_tbl_b := custom.table_declare(v_b, jsonb_build_object(
    'name', 'Supplier', 'slug', 'gs_red_supplier', 'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq_b::text));

  v_rec_a := custom.record_write(v_a, v_tbl_a, jsonb_build_object('title', 'Red Case'));
  v_rec_b := custom.record_write(v_b, v_tbl_b, jsonb_build_object('title', 'Red Supplier'));

  -- THE ONE FIXTURE WITH NO CLIENT DOOR (see the header): `custom.field_declare` cannot make a
  -- column that points at another Table, so this Field row steps out of the seat. Nothing is
  -- asserted while it is out.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'supplier', 'label', 'Supplier', 'sort', 10, 'type', 'relation',
    'multi', false, 'dated', false, 'required', false, 'source', 'manual',
    'config', jsonb_build_object('target_mode', 'any'),
    'relation_target', v_tbl_a::text, 'relation_max', 5, 'on_target_delete', 'set_null',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
    'sensitivity', 'internal', 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_tbl_a::text), v_admin)
  returning id into v_fld;
  perform set_config('role', 'authenticated', true);

  -- ══ RED 1 — THE OUTAGE WITH A NAME. Both organizations are ON the store, and with the old
  -- body the relation surface still reads OFF, for everybody, with no rung anywhere to change
  -- it. Turning custom/associations_guard on for an organization does nothing at all, because
  -- the knob carries overridable_by = {} — and asked through the settings screen's own door,
  -- as an OWNER of the organization, the answer is a refusal with a reason: there is no rung
  -- to turn. That is the shape of the outage, stated from the seat a person sits in.
  if platform.relations_are_on(v_a) then
    raise exception 'RED 1 IS NOT RED — the old body reads relations ON for an organization on the store.'; end if;
  v_res := platform.knob_override_set('custom', 'associations_guard', 'organization', v_a, v_a,
                                      'true'::jsonb, 'guardswitch_red RED 1');
  if coalesce((v_res ->> 'ok')::boolean, false) and platform.relations_are_on(v_a) then
    raise exception 'RED 1 IS NOT RED — the per-object guard turned out to have an organization rung after all.'; end if;
  if platform.relations_are_on(v_a) then
    raise exception 'RED 1 IS NOT RED — relations came on for this organization without the store switch.'; end if;
  v_red := v_red + 1;

  -- ══ RED 2 — AND BECAUSE IT READS OFF, THE WALL IS DARK. The same edge the green suite's 2a
  -- has refused three times is ACCEPTED here, written by the same signed-in person, with the
  -- INSERT privilege `authenticated` really holds: organization B never opted in, and gate two
  -- of platform.enforce_relation_edge returns NEW untouched before the wall is ever asked.
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
  if not exists (select 1 from platform.associations
                  where organization_id = v_a and source_id = v_rec_a and target_id = v_rec_b) then
    raise exception 'RED 2 IS NOT RED — the cross-organization edge did not land.'; end if;
  -- and the rest of the contract is dark with it: a role that matches no field is waved through
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'vendor', v_fld, 'campaign', v_admin);
  v_red := v_red + 1;

  -- ══ RED 3 — THE CENSUS THE GREEN SUITE'S 1c RUNS, FAILING. With the old bodies back, the
  -- four retired guard knobs are read again — including `custom/field_index_guard` by
  -- `platform.custom_field_index_ddl`, the fifth reader DOOR-FIX's B1 did not see, which is
  -- the reason 1c is a catalogue census and not a list somebody maintains by hand.
  -- IT STEPS OUT OF THE SEAT, like the green suite's 1c: reading every function body on the
  -- database out of `pg_proc` is not a product question and no client door covers it.
  perform set_config('role', v_boss, true);
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc like '%knob_resolve(''custom'', ''associations_guard''%'
      or p.prosrc like '%knob_resolve(''custom'', ''entity_custom_fields_guard''%'
      or p.prosrc like '%knob_resolve(''custom'', ''row_versions_guard''%'
      or p.prosrc like '%knob_resolve(''custom'', ''field_index_guard''%';
  if v_n = 0 then
    raise exception 'RED 3 IS NOT RED — the old bodies are back and nothing reads the retired guards.'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'platform' and p.proname = 'custom_field_index_ddl'
                    and p.prosrc like '%field_index_guard%') then
    raise exception 'RED 3 IS NOT RED — the fifth reader is not reading the retired knob.'; end if;

  -- ══ RED 4 — THE REGISTRY WITH NO MEMORY. Take the knob history away and the as-of read
  -- cannot replay: it hands back today's value and says replayed = false, which is exactly
  -- what VIS-2 recorded and what made the audit door's membership rows unreliable.
  -- STILL OUT OF THE SEAT, and it says why: `history.capture_window` carries no client grant
  -- of any kind, and `platform.client_callable_door` DECLARES `platform.knob_value_as_of`
  -- server-only — "a client door onto it would hand any signed-in person any organization's
  -- settings history". This lane does not overturn that ruling to make a red block convenient.
  -- RED 5, below, IS the person's door and it goes back into the seat.
  delete from history.capture_window where entity_type in ('platform.feature_knob', 'platform.knob_override');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'member_default_visibility', 'organization', v_a, v_a, '"shared_only"'::jsonb);
  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, now()) k;
  if v_rep then
    raise exception 'RED 4 IS NOT RED — with no capture window the read still claimed to be a replay.'; end if;
  delete from platform.knob_override
   where feature = 'custom' and key = 'member_default_visibility' and organization_id = v_a;
  v_red := v_red + 1;
  v_red := v_red + 1;

  -- ══ RED 5 — THE DOOR THAT APPLIED TODAY TO YESTERDAY, ASKED AS A PERSON. The
  -- pre-GUARD-SWITCH custom.visibility_as_of is restored above; every membership row it
  -- returns is marked replayed = false, whatever the settings history says, because it never
  -- looks. This is the one client door in this file, so it is asked from the seat — as an
  -- OWNER of organization A, which is who the audit view is for.
  perform set_config('role', 'authenticated', true);
  for r in select * from custom.visibility_as_of(v_a, v_rec_a, now()) loop
    if r.principal_kind = 'user' and r.principal_id = v_dana and r.through_kind = 'organization' then
      v_seen := true; v_replayed := r.replayed;
    end if;
  end loop;
  if not v_seen then
    raise exception 'RED 5 could not run — the membership arm returned no row for the member.'; end if;
  if v_replayed then
    raise exception 'RED 5 IS NOT RED — the old door already marked the membership row replayed.'; end if;
  v_red := v_red + 1;

  -- ══ AND THE SEAT IS A REAL SEAT. Not a red block — this lane did not touch access, so there
  -- is nothing here to flip. It is here because a file that merely SAYS `set local role
  -- authenticated` and asks everything of the store's internals is a fake, and the cheapest
  -- proof that this one is not is a second person hitting a wall the first walks through.
  declare
    c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
    v_caught text;
  begin
    perform set_config('request.jwt.claims', c_dana_j, true);
    -- Dana is a plain member: she may not ask who could see a record.
    v_caught := null;
    begin
      perform 1 from custom.visibility_as_of(v_a, v_rec_a, now());
    exception when others then v_caught := sqlerrm;
    end;
    if v_caught is null then
      raise exception 'ACCESS: test@test.com read the whole visibility audit of organization A.'; end if;
    -- nor rewrite what the organization shows its members
    v_res := platform.knob_override_set('custom', 'member_default_visibility', 'organization',
                                        v_a, v_a, '"all_records"'::jsonb, 'guardswitch_red access');
    if coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'ACCESS: test@test.com, a plain member, rewrote this organization''s member-visibility setting: %', v_res; end if;
    -- THE CONTROL: she is a member, so she reads the switch that governs every door she uses,
    -- and the record her organization's default lets her see.
    if not custom.store_is_open(v_a) then
      raise exception 'ACCESS: a member of this organization cannot read the switch that governs every door she uses.'; end if;
    if (custom.read_record(v_a, v_rec_a, true) ->> 'title') <> 'Red Case' then
      raise exception 'ACCESS: a member of an organization whose default is all_records cannot read one of its records.'; end if;
    perform set_config('request.jwt.claims', c_admin_j, true);
    raise notice '[SEAT] the wall is real for a second person, and it is not a wall against everyone.';
  end;

  raise notice '% of 5 blocks are RED (the defect each asserts is present in the old bodies)', v_red;
  if v_red <> 5 then raise exception 'the red twin did not reach five blocks'; end if;
end $t$;

rollback;

do $t$
declare
  v_n bigint;
begin
  -- NOTHING SURVIVED. The transaction above was rolled back, bodies and fixtures alike.
  select (select count(*) from iam.organizations
           where id in ('9a5d0000-0000-4a00-8a00-0000000ded01', '9a5d0000-0000-4a00-8a00-0000000ded02'))
       + (select count(*) from custom.record
           where organization_id in ('9a5d0000-0000-4a00-8a00-0000000ded01', '9a5d0000-0000-4a00-8a00-0000000ded02'))
    into v_n;
  if v_n <> 0 then raise exception 'ROLLBACK FAILED — % fixture row(s) survived.', v_n; end if;
  if not platform.relations_are_on(null) is not null then null; end if;
  if (select count(*) from history.capture_window
       where entity_type in ('platform.feature_knob', 'platform.knob_override')) <> 2 then
    raise exception 'ROLLBACK FAILED — the knob capture windows did not come back.'; end if;
  if (select coalesce(value, default_value) from platform.feature_knob
       where feature = 'custom' and key = 'associations_guard') is distinct from 'true'::jsonb then
    raise exception 'ROLLBACK FAILED — the platform value of custom/associations_guard did not come back; this file lowered it for its own transaction and it must be exactly as it was.'; end if;
  raise notice 'ROLLBACK VERIFIED — no fixture survived and the shipped bodies are back';
end $t$;
