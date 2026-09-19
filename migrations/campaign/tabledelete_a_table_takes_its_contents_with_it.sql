-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- TABLE-DELETE — A TABLE TAKES ITS FIELDS, ITS SAVED VIEWS, ITS RULES AND ITS RECORDS WITH IT.
--
-- WHAT WAS WRONG, MEASURED ON THE MAIN DATABASE 2026-09-19
-- --------------------------------------------------------
-- DOOR-FIX made `custom.delete_rule` the one place that knows what deleting a record means,
-- and `custom.record_delete` consult it. The rule knew about a Home its Tables live in, about
-- containment, and about relations. It knew NOTHING about a TABLE. So deleting a Table through
-- the door marked one row deleted and left its Fields, its saved views, its Rules and its
-- records behind — and those Fields could then never be deleted through ANY door, because
-- `custom._field_shape_guard` refuses a write to a Field whose Table this organization does not
-- have ("the field probe_owner_0 says it belongs to a table this organization does not have"),
-- and a soft delete IS an update of that row. Lane LATENCY hit this, had to clean up in raw
-- SQL, and wrote it down. Census at the time of this file: 132 live Field records across 2
-- organizations whose Table is deleted, undeletable through the store.
--
-- THE FIX, IN THE ONE RULE
-- ------------------------
-- 1. `custom.table_contents(organization, table)` is the ONE place that says what belongs to a
--    Table: its Fields (`entity_definition_id`), its Rules (`scope_table_id`), its saved views
--    (a record whose `subject` is that Table) and its records (`table_id`). It carries the
--    order they have to go in.
-- 2. `custom.delete_rule` gains a TABLE arm. It refuses BY NAME when a formula, a Rule or a
--    relation OUTSIDE this Table depends on one of its Fields — the same refusal, the same
--    sentence shape, as REC-18 already gives for a single Field. Otherwise the contents are
--    what this delete has to take with it, and they come back in `cascade_to` exactly like a
--    contained record does, so ONE migration row records the whole operation and
--    `history.migration_undo` restores the whole set.
-- 3. `custom.record_delete` deletes a TABLE'S contents BEFORE it marks the Table deleted
--    (records, then saved views, then Rules, then Fields). Every guard on `custom.record` then
--    sees a live Table while the things that name it go, so nothing has to be switched off.
--    For every other record the container still goes first, which is what stops a containment
--    loop. A depth counter refuses a delete that nests more than 64 deep rather than looping.
-- 4. THE ALREADY-STRANDED are freed by the companion file,
--    `tabledelete_a_retirement_is_not_a_change_of_shape.sql`.
-- 5. REC-18 ASKS THE STORE, NOT A LEGACY COLUMN. `custom.field_dependants` decided what was a
--    Field, a Rule or a Merge Field by `data_class`, which is 'field' for 55 rows and 'record'
--    for the 1020 Fields written through `custom.record_write`. Every guard in this schema
--    decides by `table_id` against the kernel, so this function does too, and REC-18 stops
--    being a law that happens to hold for 5% of the Fields in the database. It also ignores a
--    dependant whose own Table is gone: an orphan cannot keep its neighbour hostage.
--
-- INVERSE: migrations/inverse/tabledelete_a_table_takes_its_contents_with_it_down.sql
--
-- based-on: custom.delete_rule(uuid, uuid, boolean) c4424775ebac18e60a75050cf9c24592c20872c1112c49110a0fa9397e176c51
-- based-on: custom.record_delete(uuid, uuid) 5373aa807db49d0489054c0f2bcffb4fde27efd8634f14fc5420d53be5c66b5d
-- based-on: custom.field_dependants(uuid, uuid) 46926a719f36537c19d792d11b0115a1b10ef130a58ea9ef3799c860981a7f30

set lock_timeout = '3s';
set statement_timeout = '5min';

-- ─────────────────────────────────────────────────────────────────────────────
-- Is that Table still here? Asked by name, so "gone" means one thing everywhere.
--
-- NONE OF THE FOUR HELPERS BELOW IS SECURITY DEFINER, deliberately. They are read
-- helpers with no decision of their own, and they are called from two places that
-- already decided: `custom.delete_rule`, which IS definer and therefore sees the
-- whole organization, and `custom.field_dependants`, which is not and therefore sees
-- exactly what its caller may see. Making them definer would hand a client the
-- store's own eyes for nothing, and would need a client_callable_door row and a
-- GRANT to keep field_dependants working at all.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.table_is_live(p_organization_id uuid, p_table_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.table_id = custom.table_kernel_id()
                    and t.deleted_at is null);
$fn$;

comment on function custom.table_is_live(uuid, uuid) is
  'Whether that id is a Table record of this organization that has not been deleted. TABLE-DELETE: the one sentence "its table is gone" is asked here rather than spelled out at each caller.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Which Table does this record belong to, and is that Table gone? A Field says so
-- with entity_definition_id, a Rule with scope_table_id, an ordinary record with
-- its own table_id. A record that names no Table is not an orphan; it is free.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.owning_table(p_organization_id uuid, p_record_id uuid)
returns uuid
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_row custom.record%rowtype;
  v_txt text;
begin
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if v_row.id is null or v_row.data_class = 'kernel' then
    return null;
  end if;

  if v_row.table_id = custom.field_kernel_id() then
    v_txt := nullif(v_row.data ->> 'entity_definition_id', '');
  elsif v_row.table_id = custom.rule_kernel_id() then
    v_txt := nullif(v_row.data ->> 'scope_table_id', '');
  elsif v_row.data ? 'layout' and nullif(v_row.data ->> 'subject', '') is not null then
    v_txt := v_row.data ->> 'subject';
  elsif v_row.table_id is not null
        and v_row.table_id not in (custom.table_kernel_id(), custom.field_kernel_id(),
                                   custom.rule_kernel_id(), custom.organization_kernel_id(),
                                   custom.person_kernel_id(), custom.file_kernel_id(),
                                   custom.merge_field_kernel_id()) then
    return v_row.table_id;
  else
    return null;
  end if;

  -- A document says what it belongs to in text. Text that is not an id names nothing.
  if v_txt is null or v_txt !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return v_txt::uuid;
end;
$fn$;

comment on function custom.owning_table(uuid, uuid) is
  'The Table this record belongs to: a Field''s entity_definition_id, a Rule''s scope_table_id, a saved view''s subject, an ordinary record''s table_id. NULL when it belongs to no Table. TABLE-DELETE.';

create function custom.owning_table_gone(p_organization_id uuid, p_record_id uuid)
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select case
           when custom.owning_table(p_organization_id, p_record_id) is null then false
           else not custom.table_is_live(p_organization_id,
                                         custom.owning_table(p_organization_id, p_record_id))
         end;
$fn$;

comment on function custom.owning_table_gone(uuid, uuid) is
  'True when this record names a Table that is no longer a live Table of this organization — a stranded Field, Rule, saved view or row. TABLE-DELETE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT BELONGS TO A TABLE. One place, one order: its records go first, then its
-- saved views, then its Rules, then its Fields — so that while each one is being
-- retired the Table and the Fields it is validated against are all still there.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.table_contents(p_organization_id uuid, p_table_id uuid)
returns table (record_id uuid, kind text, goes_at integer)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select r.id, 'record'::text, 1
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = p_table_id
     and r.id <> p_table_id
  union
  select r.id, 'saved view'::text, 2
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.data ? 'layout'
     and r.data ->> 'subject' = p_table_id::text
     and r.id <> p_table_id
  union
  select r.id, 'rule'::text, 3
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.rule_kernel_id()
     and r.data ->> 'scope_table_id' = p_table_id::text
  union
  select r.id, 'field'::text, 4
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.field_kernel_id()
     and r.data ->> 'entity_definition_id' = p_table_id::text;
$fn$;

comment on function custom.table_contents(uuid, uuid) is
  'Everything that belongs to a Table — its records, its saved views, its Rules, its Fields — in the order a delete has to take them. TABLE-DELETE: the one answer to "what is in this table", used by custom.delete_rule and by the stranded-row census.';

-- ─────────────────────────────────────────────────────────────────────────────
-- REC-18 asks the store what a Field is. `data_class` is 'field' for the Fields
-- written through custom.field and 'record' for the Fields written through
-- custom.record_write; `table_id` against the kernel is what every guard in this
-- schema asks, so it is what this asks. And an orphan holds nothing hostage.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.field_dependants(p_organization_id uuid, p_field_id uuid)
returns table(kind text, dependant_id uuid, label text, how text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_key   text;
  v_table uuid;
begin
  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way.
  select case when r.table_id = custom.rule_kernel_id() then 'rule'
              when r.table_id = custom.merge_field_kernel_id() then 'merge field'
              else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class <> 'kernel'
     and r.table_id in (custom.rule_kernel_id(), custom.field_kernel_id(),
                        custom.merge_field_kernel_id())
     and (coalesce((r.data -> 'expr')::text, '')   like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'config')::text, '') like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'rules')::text, '')  like '%' || p_field_id::text || '%'
       or coalesce(r.data ->> 'target_field_id', '') = p_field_id::text)
     and not custom.owning_table_gone(p_organization_id, r.id)
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.field_kernel_id()
     and r.data_class <> 'kernel'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key)
     and not custom.owning_table_gone(p_organization_id, r.id);
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE DELETE RULE, with the Table arm it was missing.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.delete_rule(p_organization_id uuid, p_record_id uuid, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  -- The callers of this rule (custom.record_delete, custom.migrate_delete) are behind
  -- custom/system_enabled through custom.assert_store_door; the rule itself only decides.
  v_row       custom.record%rowtype;
  v_names     text;
  v_cascade   uuid[] := '{}';
  v_contents  uuid[] := '{}';
  v_is_table  boolean := false;
  v_detached  integer := 0;
  v_effects   jsonb;
  v_child     uuid;
begin
  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('cascade_to', '[]'::jsonb, 'detached', 0,
                              'contents_first', false,
                              'note', 'nothing here to delete');
  end if;

  -- ── REC-18. A Field a Rule or a formula depends on is refused, NAMING the dependant,
  --    because "this field is in use" tells a person nothing about what to go and change.
  --    A Field is a Field because it lives in the Field kernel, not because of data_class.
  if v_row.table_id = custom.field_kernel_id() and v_row.data_class <> 'kernel' then
    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from custom.field_dependants(p_organization_id, p_record_id) d;
    if v_names is not null then
      raise exception 'This field is used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: a Rule or a formula that reads a Field it can no longer find is a calculation that silently stops being right. Change or remove what depends on it first, and then this delete goes through.';
    end if;
  end if;

  -- ── TABLE-DELETE. A TABLE IS A CONTAINER. Its Fields, its saved views, its Rules and its
  --    records have no existence without it, so they go with it — in the same transaction,
  --    under this same rule, recorded as ONE operation. What is refused is the same thing
  --    REC-18 refuses for one Field: something OUTSIDE this Table that reads one of its
  --    Fields. Inside the Table, a formula reading its neighbour is going too, so it is not
  --    an obstacle; it is part of the set.
  if v_row.table_id = custom.table_kernel_id() and v_row.data_class <> 'kernel' then
    v_is_table := true;
    select coalesce(array_agg(c.record_id order by c.goes_at, c.record_id), '{}')
      into v_contents
      from custom.table_contents(p_organization_id, p_record_id) c;

    select string_agg(distinct d.kind || ' "' || d.label || '"', ', ') into v_names
      from unnest(v_contents) f
      join lateral custom.field_dependants(p_organization_id, f) d on true
     where not (d.dependant_id = any (v_contents))
       and d.dependant_id <> p_record_id;
    if v_names is not null then
      raise exception 'This table''s fields are used by %, so it was not deleted.', v_names
        using errcode = '23503',
              hint = 'REC-18 / T7: deleting this table would take fields that a Rule, a formula or a relation somewhere else still reads, and a calculation that can no longer find its field silently stops being right. Change or remove what depends on them first, and then this delete goes through — it will take this table''s fields, saved views, rules and records with it, in one operation you can undo.';
    end if;
  end if;

  -- ── REC-13. A Home is a RECORD, and the Tables living there have a say. The default is
  --    restrict, stated here rather than inherited from a nullable column.
  select string_agg(distinct coalesce(t.data ->> 'name', h.table_id::text), ', ') into v_names
    from custom.tables_at_home(p_organization_id, array[p_record_id]) h
    left join custom.record t
      on t.organization_id = p_organization_id and t.id = h.table_id and t.deleted_at is null
   where coalesce(t.data ->> 'on_delete', 'restrict') = 'restrict';
  if v_names is not null then
    raise exception 'This is home to %, so it was not deleted.', v_names
      using errcode = '23503',
            hint = 'REC-13 / T7: deleting a place that tables live in would take those tables and everything in them. The default is to refuse. Move those tables to another home first, or set them to cascade deliberately.';
  end if;

  -- ── REC-12, through W1-REL's own function. It RESTRICTS by name, detaches the set_null
  --    edges itself and RETURNS what must be cascaded; it deletes nothing — the door does.
  begin
    if p_apply then
      v_effects := platform.relation_on_delete(p_organization_id, p_record_id);
      v_detached := coalesce((v_effects ->> 'detached')::integer, 0);
      select coalesce(array_agg((x #>> '{}')::uuid), '{}') into v_cascade
        from jsonb_array_elements(coalesce(v_effects -> 'cascade_to', '[]'::jsonb)) x;
    else
      select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'restrict';
      if v_names is not null then
        raise exception 'this is still used by %, so it was not deleted', v_names
          using errcode = '23503',
                hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
      end if;
      select coalesce(array_agg(x.other_id), '{}') into v_cascade
        from platform.relation_delete_effects(p_organization_id, p_record_id) x
       where x.action = 'cascade' and x.other_type = 'record';
      v_effects := jsonb_build_object('detached', 0, 'cascade_to', to_jsonb(v_cascade));
    end if;
  exception when undefined_function then
    -- The relation surface is not on this database at all. That is a fact about the database,
    -- not a rule, and it is carried back in the answer rather than swallowed.
    v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this database');
  end;

  -- ── REC-12 for CONTAINMENT: the 500 serial numbers inside Widget. A contained record has no
  --    independent existence, so it goes with its container. This is not a relation's
  --    `on_delete` — it is what containment MEANS, and it is the cascade T7 names first.
  for v_child in
    select e.child_id from custom.containment_edges(p_organization_id) e
     where e.parent_id = p_record_id and e.via = 'contained'
  loop
    if not (v_child = any (v_cascade)) then
      v_cascade := v_cascade || v_child;
    end if;
  end loop;

  -- A Table's contents lead, because the door takes them before the Table itself.
  if v_is_table then
    select coalesce(array_agg(x order by ord), '{}') into v_cascade
      from (select x, ord from unnest(v_contents) with ordinality as c(x, ord)
            union all
            select x, ord + 1000000 from unnest(v_cascade) with ordinality as d(x, ord)
                   where not (x = any (v_contents))) s;
  end if;

  return jsonb_build_object('cascade_to', to_jsonb(v_cascade),
                            'detached', v_detached,
                            'contents_first', v_is_table,
                            'relation_effects', coalesce(v_effects, '{}'::jsonb));
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- THE DOOR. A Table's contents go BEFORE the Table; everything else goes after
-- its container, which is what stops a containment loop.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_delete(p_organization_id uuid, p_record_id uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);
  return v_at;
end
$fn$;
