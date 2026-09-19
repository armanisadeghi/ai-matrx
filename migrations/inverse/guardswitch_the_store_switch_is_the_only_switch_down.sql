-- INVERSE of migrations/campaign/guardswitch_the_store_switch_is_the_only_switch.sql
--
-- It restores the seven bodies exactly as they stood before GUARD-SWITCH — each one read
-- back from the live database and hashed into that file's `-- based-on:` lines, which is what
-- makes "exactly" checkable rather than claimed. Running it puts the three per-object guard
-- knobs back in charge, which means the relation contract, the custom-fields layer and the
-- store's history writer go dark again for every organization, because none of those knobs
-- has a rung that can turn it on. That is the state this file exists to undo; it is written
-- because rule 27 requires an inverse, not because anybody should want it.
--
-- HOW IT IS RUN: the bodies are re-created from `pg_get_functiondef` output captured at
-- 2026-09-19 (see scratchpad `gs/`), so this file is long and literal on purpose.
\echo 'guardswitch inverse: restoring the pre-GUARD-SWITCH bodies'

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
