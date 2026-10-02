-- chair-step: replaces the bodies of custom.record_write and custom.record_write_many (same signatures, still SECURITY DEFINER) so a new record takes its Table's "Shown to by default"; CREATES two helpers (custom._table_row_defaults, custom._row_control_columns — no grant) and four doors (custom.table_row_defaults, custom.table_row_defaults_set, custom.record_row_controls, custom.record_row_controls_set — SECURITY DEFINER), declares the four doors in platform.client_callable_door and GRANTs EXECUTE on them to `authenticated`. No table, column, index, trigger, policy or knob row is touched; the Table's defaults live in its own document (data.row_defaults).
-- lane: CHAIR-DOORS-2 (asked by v6 lane 2 MAKE-HOME, need "store tables enrolled in Shown to / Published to the web / Indexed")
-- based-on: custom.record_write(uuid, uuid, jsonb) a2599ed72dae36c05aaeed295de5da32402852ffe23c0abc37d535a339c0fa3a
-- based-on: custom.record_write_many(uuid, uuid, jsonb[], uuid[]) b0afc3e2645c9a1bf01808d7ad68eb39fb2dee2a2e28bab58c4d79e4dd581e11
--
-- STORE ROWS GET THE SAME ROW CONTROLS AS EVERY ENTITY TABLE (Arman, 2026-10-02, MAKE-HOME rulings 3 + the
-- 11:20 defaults): Shown to, Published to the web, Indexed — a per-Table default applied to every new row,
-- always overridable per row. Defaults when a Table names none: Shown to = the organization's own default
-- (access.shown_to_default/record, "everyone"), Published to the web = off, Indexed = off.
--
-- THE TABLE'S DEFAULTS: its document's `row_defaults` object, {shown_to, published_to_web, indexed}; a key
-- absent = the platform default. Set by custom.table_row_defaults_set — the rung the ladder gives "Shown to":
-- the person who made the Table, or someone with full access (admin) to it.
-- THE ROW: Shown to = custom.record.shown_to (exists; changed through platform.set_shown_to, its own rules);
-- Published to the web = custom.record.published_to_web (editor rung); Indexed = custom.record.search_engine_indexed
-- (platform.set_search_engine_indexed, editor rung). The last two columns are NOT on custom.record yet: the
-- companion file chairdoors2_j_store_rows_carry_published_to_the_web_and_indexed.sql adds them in the chair's
-- watched window. Until it lands both switches answer `available: false` and refuse to be set, by name — a
-- control is absent or honest. Every door here reads those columns only through to_jsonb(row) or inside a
-- branch that cannot run before they exist, so nothing in this file changes when the window lands.
-- THIS FILE stamps Shown to on the two client write doors. Every other insert path (forms, graph writes,
-- imports, checklists...) is covered by the window file's insert trigger, which fills all three.

-- ── helpers (no grant: the doors below and the store's own doors call them) ──────────────────────────
CREATE OR REPLACE FUNCTION custom._table_row_defaults(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- A Table's own row defaults, keys it never set left out. '{}' for a Table that names none.
  select coalesce(jsonb_strip_nulls(case when jsonb_typeof(t.data -> 'row_defaults') = 'object'
                                         then t.data -> 'row_defaults' end), '{}'::jsonb)
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
$function$;
revoke all on function custom._table_row_defaults(uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom._row_control_columns()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Which of the two web switches custom.record carries today (the window file adds both).
  select jsonb_build_object(
    'published_to_web', exists (select 1 from pg_attribute a where a.attrelid = 'custom.record'::regclass
                                   and a.attname = 'published_to_web' and not a.attisdropped),
    'indexed', exists (select 1 from pg_attribute a where a.attrelid = 'custom.record'::regclass
                          and a.attname = 'search_engine_indexed' and not a.attisdropped)
               and exists (select 1 from platform.feature_knob k where k.feature = 'access.indexed_by_default'
                              and k.key = 'record' and k.archived_at is null))
$function$;
revoke all on function custom._row_control_columns() from public, anon, authenticated;

-- ── the Table's defaults ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.table_row_defaults(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_owner uuid;
  v_own   jsonb;
  v_cols  jsonb := custom._row_control_columns();
  v_pub   boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_row_defaults');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_row_defaults');
  select t.created_by into v_owner
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  if not found then
    raise exception 'That table is not in this organization.' using errcode = '02000',
      hint = 'The store is keyed (organization_id, id): open the table from its own organization. Nothing was read.';
  end if;
  v_own := custom._table_row_defaults(p_organization_id, p_table_id);
  v_pub := coalesce((v_own ->> 'published_to_web')::boolean, false);
  return jsonb_build_object(
    'shown_to', v_own -> 'shown_to',
    'published_to_web', v_own -> 'published_to_web',
    'indexed', v_own -> 'indexed',
    'effective', jsonb_build_object(
      'shown_to', coalesce(v_own ->> 'shown_to',
                           platform.shown_to_default('record', p_organization_id, v_me)::text),
      'published_to_web', v_pub,
      'indexed', v_pub and coalesce((v_own ->> 'indexed')::boolean,
                                    platform._search_engine_indexed_default('record', p_organization_id, v_me))),
    'allowed_shown_to', case when v_pub then '["only_me","my_team","everyone","everyone_on_ai_matrx"]'::jsonb
                             else '["only_me","my_team","everyone"]'::jsonb end,
    'available', jsonb_build_object('shown_to', true,
                                    'published_to_web', (v_cols ->> 'published_to_web')::boolean,
                                    'indexed', (v_cols ->> 'indexed')::boolean),
    'can_change', custom.query_is_store_owner() or v_owner = v_me
                  or iam.has_access('record', p_table_id, 'admin'::public.permission_level));
end
$function$;

CREATE OR REPLACE FUNCTION custom.table_row_defaults_set(p_organization_id uuid, p_table_id uuid, p_defaults jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := custom.query_principal();
  v_owner uuid;
  v_cols  jsonb := custom._row_control_columns();
  v_new   jsonb;
  k       text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_row_defaults_set');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_row_defaults_set');
  select t.created_by into v_owner
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null
   for update;
  if not found then
    raise exception 'That table is not in this organization.' using errcode = '02000',
      hint = 'The store is keyed (organization_id, id): open the table from its own organization. Nothing was written.';
  end if;
  -- The rung "Shown to" asks on any record: the person who made it, or someone with full access to it.
  if not (custom.query_is_store_owner() or v_owner = v_me
          or iam.has_access('record', p_table_id, 'admin'::public.permission_level)) then
    raise exception 'Only the person who made this table (or someone with full access to it) can set what its new rows start with.'
      using errcode = '42501', hint = 'Nothing was written. Ask an owner of the table to change it, or to give you full access.';
  end if;
  if p_defaults is null or jsonb_typeof(p_defaults) <> 'object' then
    raise exception 'The row defaults must be an object of shown_to, published_to_web and indexed.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_defaults) loop
    if k not in ('shown_to', 'published_to_web', 'indexed') then
      raise exception 'A table''s row defaults are shown_to, published_to_web and indexed, and "%" is none of them.', k
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
  end loop;
  if jsonb_typeof(p_defaults -> 'shown_to') not in ('string', 'null')
     or (jsonb_typeof(p_defaults -> 'shown_to') = 'string'
         and not (p_defaults ->> 'shown_to' = any (enum_range(null::platform.shown_to)::text[]))) then
    raise exception 'Shown to is one of only_me, my_team, everyone or everyone_on_ai_matrx (or null for the organization''s default).'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  if jsonb_typeof(p_defaults -> 'published_to_web') not in ('boolean', 'null')
     or jsonb_typeof(p_defaults -> 'indexed') not in ('boolean', 'null') then
    raise exception 'Published to the web and Indexed are true, false, or null for the platform default.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  if jsonb_typeof(p_defaults -> 'published_to_web') = 'boolean' and not (v_cols ->> 'published_to_web')::boolean then
    raise exception 'Published to the web is not available for table rows yet.' using errcode = '22023',
      hint = 'custom.table_row_defaults says available.published_to_web = false until the store carries it. Nothing was written.';
  end if;
  if jsonb_typeof(p_defaults -> 'indexed') = 'boolean' and not (v_cols ->> 'indexed')::boolean then
    raise exception 'Indexed is not available for table rows yet.' using errcode = '22023',
      hint = 'custom.table_row_defaults says available.indexed = false until the store carries it. Nothing was written.';
  end if;

  v_new := jsonb_strip_nulls(custom._table_row_defaults(p_organization_id, p_table_id) || p_defaults);
  if v_new ->> 'shown_to' = 'everyone_on_ai_matrx' and not coalesce((v_new ->> 'published_to_web')::boolean, false) then
    raise exception 'Only rows published to the web can be shown to everyone on AI Matrx, so turn on Published to the web first.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  if coalesce((v_new ->> 'indexed')::boolean, false) and not coalesce((v_new ->> 'published_to_web')::boolean, false) then
    raise exception 'Search engines can only index rows published to the web, so turn on Published to the web first.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;

  update custom.record
     set data = case when v_new = '{}'::jsonb then data - 'row_defaults'
                     else jsonb_set(data, '{row_defaults}', v_new, true) end
   where organization_id = p_organization_id and id = p_table_id and table_id = custom.table_kernel_id();
  return custom.table_row_defaults(p_organization_id, p_table_id);
end
$function$;

-- ── one row's controls ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION custom.record_row_controls(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row   jsonb;
  v_cols  jsonb := custom._row_control_columns();
  v_tab   jsonb;
  v_pub   boolean;
  v_edit  boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_row_controls');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_row_controls');
  if not (custom.query_is_store_owner() or iam.has_access('record', p_record_id, 'viewer'::public.permission_level)) then
    raise exception 'You cannot open this record.' using errcode = '42501';
  end if;
  select to_jsonb(r) into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row is null then
    raise exception 'There is no such record in this organization any more.' using errcode = '02000',
      detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;
  v_tab  := custom._table_row_defaults(p_organization_id, (v_row ->> 'table_id')::uuid);
  v_pub  := coalesce((v_row ->> 'published_to_web')::boolean, false);
  v_edit := custom.query_is_store_owner() or iam.has_access('record', p_record_id, 'editor'::public.permission_level);
  return jsonb_build_object(
    'shown_to', platform.shown_to_state('record', p_record_id)
                || jsonb_build_object('table_default', v_tab -> 'shown_to'),
    'published_to_web', jsonb_build_object(
      'available', (v_cols ->> 'published_to_web')::boolean,
      'value', v_pub,
      'table_default', v_tab -> 'published_to_web',
      'can_change', (v_cols ->> 'published_to_web')::boolean and v_edit),
    'indexed', jsonb_build_object(
      'available', (v_cols ->> 'indexed')::boolean,
      'value', v_row -> 'search_engine_indexed',
      'table_default', v_tab -> 'indexed',
      'effective', v_pub and coalesce((v_row ->> 'search_engine_indexed')::boolean,
                     platform._search_engine_indexed_default('record', p_organization_id, (v_row ->> 'created_by')::uuid)),
      'can_change', (v_cols ->> 'indexed')::boolean and v_edit));
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_row_controls_set(p_organization_id uuid, p_record_id uuid, p_controls jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cols  jsonb := custom._row_control_columns();
  v_row   jsonb;
  v_pub   boolean;
  k       text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_row_controls_set');
  if p_controls is null or jsonb_typeof(p_controls) <> 'object' or p_controls = '{}'::jsonb then
    raise exception 'Name at least one of shown_to, published_to_web and indexed.' using errcode = '22023',
      hint = 'Nothing was written.';
  end if;
  for k in select jsonb_object_keys(p_controls) loop
    if k not in ('shown_to', 'published_to_web', 'indexed') then
      raise exception 'A row''s controls are shown_to, published_to_web and indexed, and "%" is none of them.', k
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
  end loop;
  -- The organization wall and the record's existence, before any rung.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_row_controls_set');
  select to_jsonb(r) into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row is null then
    raise exception 'There is no such record in this organization any more.' using errcode = '02000',
      detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  if p_controls ? 'published_to_web' then
    if not (v_cols ->> 'published_to_web')::boolean then
      raise exception 'Published to the web is not available for table rows yet.' using errcode = '22023',
        hint = 'custom.record_row_controls says published_to_web.available = false until the store carries it. Nothing was written.';
    end if;
    if jsonb_typeof(p_controls -> 'published_to_web') <> 'boolean' then
      raise exception 'Published to the web is true or false.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    -- Publishing is an edit-level act (the ladder; platform.set_search_engine_indexed asks the same rung).
    perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_row_controls_set',
                                            'editor'::public.permission_level, 'record');
    v_pub := (p_controls ->> 'published_to_web')::boolean;
    if not v_pub and v_row ->> 'shown_to' = 'everyone_on_ai_matrx'
       and not (p_controls ? 'shown_to' and coalesce(p_controls ->> 'shown_to', '') <> 'everyone_on_ai_matrx') then
      raise exception 'This is shown to everyone on AI Matrx, so choose a narrower Shown to before taking it off the web.'
        using errcode = '22023', hint = 'Send shown_to beside published_to_web = false. Nothing was written.';
    end if;
    if not v_pub and p_controls ? 'shown_to' then
      perform platform.set_shown_to('record', p_record_id, p_controls ->> 'shown_to');
    end if;
    -- Off the web, a row is never indexed: its own choice goes back to the default with it.
    update custom.record
       set published_to_web = v_pub,
           search_engine_indexed = case when v_pub then search_engine_indexed end
     where organization_id = p_organization_id and id = p_record_id;
  end if;

  if p_controls ? 'shown_to' and not (p_controls ? 'published_to_web' and not v_pub) then
    if jsonb_typeof(p_controls -> 'shown_to') not in ('string', 'null') then
      raise exception 'Shown to is one of only_me, my_team, everyone or everyone_on_ai_matrx (or null for the default).'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    perform platform.set_shown_to('record', p_record_id, p_controls ->> 'shown_to');
  end if;

  if p_controls ? 'indexed' then
    if not (v_cols ->> 'indexed')::boolean then
      raise exception 'Indexed is not available for table rows yet.' using errcode = '22023',
        hint = 'custom.record_row_controls says indexed.available = false until the store carries it. Nothing was written.';
    end if;
    if jsonb_typeof(p_controls -> 'indexed') not in ('boolean', 'null') then
      raise exception 'Indexed is true, false, or null for the default.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    perform platform.set_search_engine_indexed('record', p_record_id, (p_controls ->> 'indexed')::boolean);
  end if;

  return custom.record_row_controls(p_organization_id, p_record_id);
end
$function$;

-- ── the two client write doors: a new record takes its Table's "Shown to by default" ────────────────
CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE ENVELOPE KEY COMES OFF FIRST. Before the door predicates, before the undeclared-key
  -- guard, before storage — `custom.record.data` must never hold it.
  p_data := custom._take_op_id(p_data, 'custom.record_write');

  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
  -- CHAIR-DOORS-2 j: and it is shown to whoever its Table's "Shown to by default" names (null = the
  -- organization's default, read at list time, as before).
  insert into custom.record (organization_id, table_id, data, shown_to)
  values (p_organization_id, p_table_id,
          custom._record_defaults_filled(p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb)),
          (custom._table_row_defaults(p_organization_id, p_table_id) ->> 'shown_to')::platform.shown_to)
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_write_many(p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids   uuid[];
  v_n     integer := coalesce(cardinality(p_rows), 0);
  v_clean jsonb[];
  v_seen  text := null;
  v_this  text;
  ord     integer;
  v_shown platform.shown_to;
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    perform set_config('custom.op_id', '', true);
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  -- ONE STATEMENT IS ONE OPERATION. Every row's `_op_id` comes off, and they must AGREE: a
  -- batch is one paste, one import, one click. Two different ids in one statement would make
  -- one notice that could only name one of them, so the other writer would be told to drop an
  -- echo that was never its own — which is the one way an echo filter loses a real change.
  v_clean := array[]::jsonb[];
  for ord in 1..v_n loop
    v_this := case when p_rows[ord] is not null and jsonb_typeof(p_rows[ord]) = 'object'
                   then p_rows[ord] ->> '_op_id' else null end;
    if v_this is not null then
      if v_seen is not null and v_seen <> v_this then
        raise exception 'custom.record_write_many: this batch carries two different _op_id values (% and %), and one statement announces itself once.', left(v_seen, 64), left(v_this, 64)
          using errcode = '22023',
                hint = 'Nothing was written. A batch is ONE client operation — one paste, one import, one click — so every row either carries the same _op_id or carries none. Split the rows into one call per operation, or leave the key out.';
      end if;
      v_seen := v_this;
    end if;
    v_clean := v_clean || case
                 when p_rows[ord] is null or jsonb_typeof(p_rows[ord]) <> 'object' then p_rows[ord]
                 -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
                 else custom._record_defaults_filled(p_organization_id, p_table_id, p_rows[ord] - '_op_id') end;
  end loop;

  -- Validated and remembered ONCE for the batch, through the same one place the single-row
  -- door uses, so a malformed id is refused with the same sentence.
  perform custom._take_op_id(
    case when v_seen is null then '{}'::jsonb else jsonb_build_object('_op_id', v_seen) end,
    'custom.record_write_many');

  if p_ids is null then
    select array_agg(gen_random_uuid() order by s) into v_ids
      from generate_subscripts(v_clean, 1) s;
  else
    v_ids := p_ids;
  end if;

  -- CHAIR-DOORS-2 j: every row of the batch is shown to whoever its Table's "Shown to by default" names.
  v_shown := (custom._table_row_defaults(p_organization_id, p_table_id) ->> 'shown_to')::platform.shown_to;
  insert into custom.record (organization_id, table_id, id, data, shown_to)
  select p_organization_id, p_table_id, v_ids[s], coalesce(v_clean[s], '{}'::jsonb), v_shown
    from generate_subscripts(v_clean, 1) s
   order by s;

  return v_ids;
end
$function$;

-- The door rows FIRST, then the grants (platform.enforce_definer_client_grants fires on the grant).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_row_defaults', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'What a Table''s new rows start with — Shown to, Published to the web, Indexed — its own choices, the effective values, which switches the store carries and whether the caller may change them. Viewer rung on the Table; writes nothing.',
   'chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; every row is read in this organization only.')),
     'p_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Read only as a Table of p_organization_id; custom.assert_may_know_table decides the viewer rung on it.'))))),
  ('custom', 'table_row_defaults_set', 'p_organization_id uuid, p_table_id uuid, p_defaults jsonb',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid],
   'Sets what a Table''s new rows start with (data.row_defaults on the Table). The person who made the Table or someone with full access to it; refuses unknown keys, unavailable switches and combinations the ladder forbids.',
   'chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; every row is read in this organization only.')),
     'p_table_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Read only as a Table of p_organization_id; the maker or full access (iam.has_access admin) decides any change.'))))),
  ('custom', 'record_row_controls', 'p_organization_id uuid, p_record_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid],
   'One store row''s Shown to (platform.shown_to_state plus the Table''s default), Published to the web and Indexed, with whether the caller may change each. Viewer rung on the record; writes nothing.',
   'chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; every row is read in this organization only.')),
     'p_record_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Read only as a row of p_organization_id; iam.has_access viewer decides it before anything is returned.'))))),
  ('custom', 'record_row_controls_set', 'p_organization_id uuid, p_record_id uuid, p_controls jsonb',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid],
   'Overrides one store row''s Shown to (through platform.set_shown_to: its creator or full access), Published to the web (editor) or Indexed (through platform.set_search_engine_indexed: editor).',
   'chairdoors2_j_a_table_gives_its_new_rows_their_row_controls.sql', null, true, false,
   jsonb_build_object('version', '1', 'arguments', jsonb_build_object(
     'p_organization_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'custom.assert_store_door and custom.assert_client_may_reach decide it first; every row is read in this organization only.')),
     'p_record_id', jsonb_build_object('foreign', jsonb_build_object('bounded', true,
       'note', 'Read only as a row of p_organization_id; platform.set_shown_to, custom.assert_client_may_change and platform.set_search_engine_indexed decide each change.')))));

grant execute on function custom.table_row_defaults(uuid, uuid) to authenticated;
grant execute on function custom.table_row_defaults_set(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.record_row_controls(uuid, uuid) to authenticated;
grant execute on function custom.record_row_controls_set(uuid, uuid, jsonb) to authenticated;
