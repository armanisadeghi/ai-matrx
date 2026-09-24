-- target: branch,production
-- additive: yes
--   It ADDS two functions — `custom.table_kept_for_derived(jsonb, boolean, boolean)` (pure) and
--   `custom.table_placement(uuid, uuid, jsonb, boolean)` (read-only) — and REPLACES two bodies,
--   each declared below with the body it was written against:
--     · custom._table_shape_guard()        judges kept_by_the_app / kept_for / offered_as_context when present
--     · custom.table_list_everywhere(uuid) every entry of the table pickers' one list carries the placement
--   custom.scope_table_provision (G11) is NOT replaced: the `scope_binding` key it already writes
--   on the way in IS the placement (kept, for the context system, bound to that scope).
--   No table, column, trigger, policy or grant is touched; nothing is dropped, revoked or
--   written. Every existing Table document stays byte-for-byte what it is and reads the same
--   placement it has today. The view and the facts door are the chair-step file
--   `sc1p_the_facts_door_says_who_keeps_each_table.sql`, which runs after this one; the
--   classification of existing tables is `sc1p_every_table_a_feature_made_says_so.sql`.
--   The inverse is `migrations/inverse/sc1p_each_table_says_who_keeps_it_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom._table_shape_guard() b67ca16b5be8f7bf0b0765f4668570f3d59ebf99042cbf08de8f2ee8138b8b0e
-- based-on: custom.table_list_everywhere(uuid) 1e655a740a52d81b6ecedbf3446db65ba55ef08ee43427677b2615fef03c2483
--
-- LANE SC-1 PLACEMENT (the scopes and context transition, SCOPES-CONTEXT-TRANSITION.md §2.3 P1,
-- §4 brief SC-1, amended by SCOPES-CONTEXT-TRANSITION-ATTACK.md H5 / SC-1'), chaired by the
-- Unified Data System program.
--
-- THE USE CASE. Titanium's scopes — Clients, Departments and Team Members — are about to be
-- copied into the record store (lane SC-2), one Table per scope type. Without this file its
-- organization hub would list Clients, Departments and Team Members beside its own
-- spreadsheets, every table picker would offer them, and nothing would say which of its
-- Tables the context picker may offer. The owner (2026-09-23): "the user will not see it as data
-- in a normal view; the data will be associated properly with where we need it. There should be
-- options for someone to see all, but not at random."
--
-- THE SHAPE — ONE FLAG, EXTENDED, NEVER A SECOND ONE (attack H5). A Table's document may carry:
--   kept_by_the_app     the store's existing flag (custom._options_table_for has stamped it since
--                       HUB-FIX; the hub's "Kept by the app" section reads it). true = the app or
--                       one of its features keeps the Table; absent = the organization's own.
--   kept_for            NEW, optional: WHICH feature, one lower-case word — context, education,
--                       dictionary, … Only on a kept Table. Where the older facts already say it,
--                       it is DERIVED and never stored: a column's choices from the Field graph
--                       (custom.table_is_options_table — one choices Table can outlive or be shared
--                       by its Field), a scope's own table from `scope_binding`, checklist steps /
--                       booking holds / workflow states from `work_kind`, the app's own tables from
--                       their `records_ui_` slug, the kernel from its class.
--   offered_as_context  NEW, optional: whether the context picker offers the Table. Absent = false;
--                       the scopes mover marks every scope-type Table true.
-- THE REFERENCE IS THE IDENTITY ALREADY THERE. A scope's own Table is tied to its scope by
-- `scope_binding.scope_id` (G11); a workflow's state Table by its `parent_id`; a choices Table by
-- the list Field whose config names it. No second key repeats any of them.
-- The Table document takes any key (custom._undeclared_key_guard judges only records OF a Table,
-- and the Table kernel is a code kernel), so no declaration is needed; custom._table_shape_guard
-- judges the three keys.
--
-- LOCKS. create function / create or replace function only — no table lock. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function custom.table_kept_for_derived(p_data jsonb, p_is_kernel boolean, p_is_options boolean)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- WHICH FEATURE KEEPS A TABLE, read off what the door that made it already wrote — never off
  -- `kept_by_the_app` or `kept_for` themselves, so the classification backfill and its inverse
  -- can ask "what do the older facts say" and get the same answer before and after.
  select case
    when p_is_kernel then 'store'
    when coalesce(p_data ->> 'slug', '') like 'records\_ui\_%' then 'app'
    when p_data ? 'scope_binding' then 'context'
    when p_data ->> 'work_kind' = 'checklist_step' then 'checklists'
    when p_data ->> 'work_kind' = 'slot' then 'bookings'
    when p_data ->> 'work_kind' = 'state' then 'workflow'
    when p_is_options then 'choices'
  end
$fn$;

comment on function custom.table_kept_for_derived(jsonb, boolean, boolean) is
  'SC-1 PLACEMENT. The feature that keeps a Table as the older facts on its document say it: the '
  'kernel (store), the app''s own records_ui_ tables (app), a scope''s own table (scope_binding → '
  'context), checklist steps, booking holds, workflow states (work_kind), or a column''s choices '
  '(the Field graph, custom.table_is_options_table). Null = nothing says so. Pure.';

create function custom.table_placement(p_organization_id uuid, p_table_id uuid, p_data jsonb,
                                       p_is_kernel boolean default false)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- WHO KEEPS A TABLE, AND WHETHER THE CONTEXT PICKER OFFERS IT (lane SC-1 PLACEMENT).
  --   kept_by_the_app     the store's one flag: true = the app or one of its features keeps it,
  --                       false = the organization's own. Stored, or read off the older facts.
  --   kept_for            WHICH feature: the stored word (context, education, dictionary, …),
  --                       else the one the older facts say, else `app`. Null when not kept.
  --   offered_as_context  whether the context picker offers the Table. Stored, else false: only
  --                       a Table somebody marked (a scope type the mover lands) is a context.
  select jsonb_build_object(
           'kept_by_the_app', d.kept,
           'kept_for', case when d.kept then coalesce(nullif(btrim(p_data ->> 'kept_for'), ''), d.word, 'app') end,
           'offered_as_context',
             case when jsonb_typeof(p_data -> 'offered_as_context') = 'boolean'
                  then (p_data ->> 'offered_as_context')::boolean else false end)
    from (select w.word,
                 (w.word is not null
                  or coalesce(p_data ->> 'kept_by_the_app', '') = 'true'
                  or coalesce(btrim(p_data ->> 'kept_for'), '') <> '') as kept
            from (select custom.table_kept_for_derived(
                           p_data, p_is_kernel,
                           case when p_is_kernel then false
                                -- the Field graph, asked here and not through custom.table_is_options_table: that
                                -- function is WRITE-PERF-4's and its inverse removes it
                                -- (check:inverses-leave-the-ground-standing, clause d).
                                else exists (select 1 from custom.record f
                                              where f.organization_id = p_organization_id
                                                and f.table_id = custom.field_kernel_id()
                                                and f.deleted_at is null
                                                and f.data ->> 'type' = 'list'
                                                and f.data -> 'config' ->> 'options_table_id' = p_table_id::text) end) as word) w) d
$fn$;

comment on function custom.table_placement(uuid, uuid, jsonb, boolean) is
  'SC-1 PLACEMENT. {kept_by_the_app, kept_for, offered_as_context} for one Table: the Table '
  'document''s own keys when present, otherwise what the door that made it already wrote '
  '(custom.table_kept_for_derived). Read by custom.table, custom.table_facts and '
  'custom.table_list_everywhere, so every reader places a Table the same way.';

create or replace function custom._table_shape_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  d            jsonb := new.data;
  -- ── LIMITS-FIX 2026-09-21: EVERY PROBLEM WITH THIS TABLE, IN ONE ANSWER. ───────────────
  -- This guard used to stop at the FIRST thing wrong, so declaring one table meant a
  -- round trip per missing key against the live database. Real-data crew D hit four in a
  -- row (retention_days, default_sort, agent_writable, and a name on each field) declaring
  -- a podcast episode pipeline on 2026-09-21; reproducing it for this fix cost five more
  -- (type, slug, label, display, weight) before the row was even written. A person filling
  -- in a form is told everything that is wrong with it at once, and so is a caller here.
  --
  -- ONE problem still raises the EXACT sentence and hint it always did, byte for byte, so
  -- nothing that asserts on those messages changes. Only TWO OR MORE are combined.
  v_bad        text[] := '{}';
  v_bad_hints  text[] := '{}';
  v_i          integer;
  v_all        text;
  v_type       text;
  v_title      text;
  v_fields     jsonb;
  v_home       uuid;
  v_home_type  text;
  v_names      text[];
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  -- Only Tables, and only Tables an organization DECLARED. REC-27: the kernel's nine are
  -- "defined in code, not data" — W1-STORE wrote eight of them before this guard existed
  -- and W1-FIELD adds the ninth, so a `kernel` row is exempt and the view supplies its
  -- defaults. THE BOUND OF THAT EXEMPTION, named rather than left implied: the only writer
  -- that can set data_class at all is the schema owner, because schema `custom` is revoked
  -- from PUBLIC, anon, authenticated and service_role and the one client door
  -- (custom.record_write) cannot set data_class. A tenant cannot reach this branch.
  if new.table_id is distinct from custom.table_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  v_type := d ->> 'type';
  if v_type is null or v_type not in ('entity', 'detail') then
    v_bad := array_append(v_bad, format('a table is an entity or a detail, and this one says %s', custom.said(v_type, 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: type ∈ {entity, detail}.')::text);
  end if;
  if v_type = 'detail' and coalesce(d ->> 'parent_token', '') = '' then
    v_bad := array_append(v_bad, format('a detail table has to say what it is a detail of'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token is required when type is detail.')::text);
  end if;
  if v_type <> 'detail' and d ? 'parent_token' then
    v_bad := array_append(v_bad, format('only a detail table has a parent table'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: parent_token belongs to type detail and to nothing else.')::text);
  end if;

  if coalesce(d ->> 'name', '') = '' then
    v_bad := array_append(v_bad, format('a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1.')::text);
  end if;
  if coalesce(d ->> 'slug', '') !~ '^[a-z][a-z0-9_]*$' then
    v_bad := array_append(v_bad, format('a table needs a slug made of lower-case letters, digits and underscores'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: slug.')::text);
  end if;
  if coalesce(d ->> 'label_singular', '') = '' or coalesce(d ->> 'label_plural', '') = '' then
    v_bad := array_append(v_bad, format('a table needs both of its labels - one thing and many things'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: label_singular and label_plural.')::text);
  end if;

  if coalesce(d ->> 'display', '') not in ('list', 'page') then
    v_bad := array_append(v_bad, format('a table shows its records as a list or as a page, and this one says %s',
                    custom.said(d ->> 'display', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: display. T4 turns a list into a page and migrates nothing.')::text);
  end if;
  if jsonb_typeof(d -> 'ordered') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether its records are ordered'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: ordered.')::text);
  end if;
  if coalesce(d ->> 'weight', '') not in ('heavy', 'light') then
    v_bad := array_append(v_bad, format('a table is heavy or light, and this one says %s', custom.said(d ->> 'weight', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: heavy|light.')::text);
  end if;
  if jsonb_typeof(d -> 'retention_days') is distinct from 'number' then
    v_bad := array_append(v_bad, format('a table has to say how long it keeps its history'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: retention.')::text);
  end if;
  -- W3-HIST (HIS-3): the floor is READ, never a literal (rule 15). Thirty days is the
  -- PLATFORM floor, and an organization that raised its own is entitled to have that
  -- honoured here too — the knob is `extensibility / user_tables.history_retention_floor_days`,
  -- raise-only, min 30. With a literal here an organization at sixty days could still declare
  -- a thirty-day table and lose thirty days of history it had already decided to keep.
  -- This body's own switch is `custom/system_enabled`, read through custom.assert_store_door
  -- above; the history writer's is `custom/row_versions_guard`.
  declare
    v_floor integer;
  begin
    -- THE GUARD, READ IN THE BODY. While `custom/system_enabled` resolves false this
    -- comparison is byte-for-byte the behaviour it has always had — the literal thirty — so
    -- the OFF path answers identically and §6.6's requirement for touching a live body is
    -- something a verifier can execute rather than something this lane asserts. Switched ON,
    -- the organization's own floor is honoured here too.
    if custom.store_is_open(new.organization_id) then
      v_floor := history.retention_floor_days(new.organization_id);
    else
      v_floor := 30;
    end if;
    -- Only ask the floor question when a NUMBER was actually given: collecting the
    -- type problem above instead of raising means this line is now reached with a
    -- non-number, and `::numeric` would abort with a cast error nobody asked for.
    if jsonb_typeof(d -> 'retention_days') = 'number'
       and (d ->> 'retention_days')::numeric < v_floor then
      v_bad := array_append(v_bad, format('History here is kept for at least %s days, so this table cannot keep only %s.',
                      v_floor, d ->> 'retention_days'));
      v_bad_hints := array_append(v_bad_hints, (format('REC-1 / T14 / HIS-3: %s days is the retention floor — thirty is the platform minimum and an organization may only ever raise it. Give this table %s or more.', v_floor, v_floor))::text);
    end if;
  end;

  -- REC-N-17: a default sort AND a manual row order, both load-bearing.
  if jsonb_typeof(d -> 'default_sort') is distinct from 'array' then
    v_bad := array_append(v_bad, format('a table has to say how its records are sorted by default'));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: default_sort is an array of {field, direction}.')::text);
  end if;
  if coalesce(d ->> 'row_order', '') not in ('manual', 'sorted') then
    v_bad := array_append(v_bad, format('a table orders its rows by hand or by its sort, and this one says %s',
                    custom.said(d ->> 'row_order', 'nothing')));
      v_bad_hints := array_append(v_bad_hints, ('REC-N-17: manual row order.')::text);
  end if;

  if jsonb_typeof(d -> 'agent_writable') is distinct from 'boolean' then
    v_bad := array_append(v_bad, format('a table has to say whether an agent may write to it'));
      v_bad_hints := array_append(v_bad_hints, ('REC-66: agent_writable, default true, is declared rather than guessed.')::text);
  end if;

  -- REC-1: its fields. REC-2: exactly one of them is the title.
  v_fields := d -> 'fields';
  if jsonb_typeof(v_fields) is distinct from 'array' or jsonb_array_length(v_fields) = 0 then
    v_bad := array_append(v_bad, format('a table has to declare its fields'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  -- Same reason: `jsonb_array_elements` on a non-array aborts, so the questions that
  -- read the list are asked only when there is a list to read. The missing-fields problem
  -- is already collected above, and the caller is told about it in the same answer.
  if jsonb_typeof(v_fields) = 'array' then
    select array_agg(f ->> 'name') into v_names from jsonb_array_elements(v_fields) f;
  end if;
  if v_names is not null and array_position(v_names, null) is not null then
    v_bad := array_append(v_bad, format('every field of a table needs a name'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: fields.')::text);
  end if;
  v_title := d ->> 'title_field';
  if v_title is null then
    v_bad := array_append(v_bad, format('a table needs a title field, or its records cannot be shown as chips'));
      v_bad_hints := array_append(v_bad_hints, ('REC-2.')::text);
  end if;
  if v_title is not null and v_names is not null and not (v_title = any (v_names)) then
    v_bad := array_append(v_bad, format('the title field %s is not one of this table''s fields', v_title));
      v_bad_hints := array_append(v_bad_hints, ('REC-2: the title field names one of the table''s own fields.')::text);
  end if;

  -- REC-1 and REC-14: exactly ONE Home, and the Home IS the parent, so "exactly one Home"
  -- and "zero or one parent" are ONE stored fact and the Home tree is REC-7's tree.
  v_home := custom.containment_parent(d);
  if v_home is null then
    v_bad := array_append(v_bad, format('a table has to live somewhere - give it a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-1: exactly one Home, stored as this record''s parent_id. Additional Homes are relations (REC-3, REC-26).')::text);
  end if;
  -- REC-11: a detail Table's records inherit only and cannot be Homes.
  select t.data ->> 'type' into v_home_type
    from custom.record h
    join custom.record t
      on t.organization_id = h.organization_id and t.id = h.table_id
   where h.organization_id = new.organization_id and h.id = v_home;
  if v_home_type = 'detail' then
    v_bad := array_append(v_bad, format('a detail record cannot be a home'));
      v_bad_hints := array_append(v_bad_hints, ('REC-11: a detail table inherits only - its records take no direct shares and cannot be Homes.')::text);
  end if;

  -- ── SC-1 PLACEMENT (2026-09-23): WHO KEEPS THIS TABLE, AND WHETHER THE PICKER OFFERS IT. ──
  -- `kept_by_the_app` is the store's one flag for a Table the app or one of its features keeps
  -- (custom._options_table_for has always stamped it). Beside it, optionally, `kept_for` names
  -- WHICH feature in one lower-case word (context, education, dictionary, …) — only on a Table
  -- that is kept — and `offered_as_context` says whether the context picker offers the Table.
  -- Each is judged only when present; absent is the default (custom.table_placement).
  -- Judged only while the organization's store is switched on (custom/system_enabled), exactly
  -- like the rest of the store's own shape rules; switched off, the document is stored as written.
  if coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
    if d ? 'kept_by_the_app' and jsonb_typeof(d -> 'kept_by_the_app') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being kept by the app'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_by_the_app is true or false.')::text);
    end if;
    if d ? 'kept_for' and (jsonb_typeof(d -> 'kept_for') is distinct from 'string'
                           or coalesce(d ->> 'kept_for', '') !~ '^[a-z][a-z_]*$') then
      v_bad := array_append(v_bad, format('the feature that keeps a table is named in one lower-case word, and this one says %s',
                      custom.said(d ->> 'kept_for', 'nothing')));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: kept_for is a word such as context, education or dictionary.')::text);
    end if;
    if d ? 'kept_for' and d ->> 'kept_by_the_app' is distinct from 'true' then
      v_bad := array_append(v_bad, format('only a table the app keeps says which feature keeps it'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: say kept_by_the_app = true beside kept_for, or take kept_for off.')::text);
    end if;
    if d ? 'offered_as_context' and jsonb_typeof(d -> 'offered_as_context') is distinct from 'boolean' then
      v_bad := array_append(v_bad, format('a table says yes or no to being offered in the context picker'));
        v_bad_hints := array_append(v_bad_hints, ('SC-1: offered_as_context is true or false.')::text);
    end if;
  end if;

  -- ── THE ONE ANSWER. ───────────────────────────────────────────────────────────────────
  -- Exactly one problem raises the sentence and the hint this guard has always raised, so
  -- every suite and every screen that reads those words is unchanged. Two or more are
  -- numbered into a single refusal, each with its own meaning, so a caller fixes the whole
  -- table in one more attempt instead of one attempt per key.
  if array_length(v_bad, 1) = 1 then
    raise exception '%', v_bad[1] using errcode = '23514', hint = v_bad_hints[1];
  elsif array_length(v_bad, 1) > 1 then
    v_all := '';
    for v_i in 1 .. array_length(v_bad, 1) loop
      v_all := v_all || format('%s. %s (%s)', v_i, v_bad[v_i], v_bad_hints[v_i]);
      if v_i < array_length(v_bad, 1) then v_all := v_all || '  '; end if;
    end loop;
    raise exception 'This table cannot be declared yet - % things need fixing: %',
                    array_length(v_bad, 1), v_all
      using errcode = '23514',
            hint = 'Every problem with the table is listed above, so one more attempt can fix all of them. Nothing was created.';
  end if;

  return new;
end;
$function$;

create or replace function custom.table_list_everywhere(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records')
           -- SC-1 PLACEMENT: who keeps it, and whether the context picker offers it.
           || custom.table_placement(t.organization_id, t.id, t.data, false) as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  older as (
    select jsonb_build_object(
             'id', ut.id, 'table_name', ut.table_name, 'description', ut.description,
             'version', ut.version, 'user_id', ut.user_id, 'is_public', ut.is_public,
             'row_ordering_config', ut.row_ordering_config, 'visibility', ut.visibility::text,
             'organization_id', ut.organization_id, 'created_at', ut.created_at,
             'updated_at', ut.updated_at,
             'last_activity_at', greatest(ut.updated_at, ut.created_at,
                                   (select max(r.updated_at) from workbench.udt_dataset_rows r where r.table_id = ut.id),
                                   (select max(f.updated_at) from workbench.udt_dataset_fields f where f.table_id = ut.id)),
             'row_count', (select count(*) from workbench.udt_dataset_rows where table_id = ut.id),
             'field_count', (select count(*) from workbench.udt_dataset_fields where table_id = ut.id),
             'store', 'older',
             -- An older table is always a person's own.
             'kept_by_the_app', false, 'kept_for', null, 'offered_as_context', false) as doc
      from workbench.udt_datasets ut
     where ut.user_id = v_me
       and ut.organization_id = p_organization_id
       and ut.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    from (select doc from store union all select doc from older) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;
