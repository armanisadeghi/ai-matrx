-- target: clone,production
-- additive: yes
--   It ADDS one new function and one platform.client_callable_door row, and nothing else:
--     · custom.table_ensure(uuid, jsonb)   the door: find this organization's Table by its slug, or
--                                          make it (Home, Table, columns) — in ONE transaction,
--                                          serialized per (organization, slug), idempotent
--   No table, column, trigger, policy or grant is touched; nothing is dropped, replaced or revoked.
--   The grant is its own chair-step file, `lane12_the_new_table_and_record_doors_can_be_reached.sql`.
--   The inverse is `migrations/inverse/lane12_two_first_saves_make_one_table_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
--
-- LANE PLATFORM-APP-DATA (v6 lane 12), wave 1, item 3.
--
-- THE USE CASE. Two browser tabs of the same front-desk page save their first callback at the
-- same moment. Each looks for "front_desk_callback_log", finds nothing, and makes it — and the
-- organization now has two tables of that address, each holding half the calls. Measured on the
-- clone on 2026-10-02 through the real doors as admin@admin.com: two concurrent births, two
-- tables. Sixteen (organization, slug) groups on the main database already carry the scar.
--
-- THE FIX. One door that finds-or-makes, holding a transaction-scoped advisory lock on
-- hash(organization, slug) across the find AND the make, so the second caller waits, then FINDS
-- the first caller's committed table (each statement of a volatile function reads a fresh
-- snapshot). It makes nothing by hand: the Home through custom.record_write, the Table through
-- custom.table_declare, every column through custom.field_declare — the same doors, the same
-- guards and the same refusals a person's "Create table" walks, now in one transaction, so a
-- column the store refuses takes the Table and its Home back with it.
--
-- IDEMPOTENT. A second call with the same spec answers the same table. A column it names that
-- the table does not have yet is added; a column the table already has is left exactly as it is
-- (never retyped, never dropped). No unique index on slug is added (the existing duplicates would
-- refuse it); where duplicates exist the OLDEST live one is the table, the same pick
-- custom.table_find makes.
--
-- p_spec: the table_declare spec (name, slug, type, labels, title_field, …) with `fields` as an
-- array of full custom.field_declare specs (key, label, type, rules, options, …). A missing slug
-- is derived from the name exactly as @ai-matrx/records' tokenFor() derives it.
-- Answers {"table_id", "home_id", "created"}.

create function custom.table_ensure(p_organization_id uuid, p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_slug    text := nullif(btrim(p_spec ->> 'slug'), '');
  v_fields  jsonb := case when jsonb_typeof(p_spec -> 'fields') = 'array' then p_spec -> 'fields' else '[]'::jsonb end;
  v_field   jsonb;
  v_table   uuid;
  v_home    uuid;
  v_created boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_ensure');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_ensure');

  if v_name is null then
    raise exception 'Give the table a name.'
      using errcode = '22023',
            hint = 'A table is found by its slug and made with its name. Nothing was made.';
  end if;
  if v_slug is null then
    v_slug := coalesce(nullif(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), '_'), 48), ''), 'table');
  end if;

  -- THE LOCK IS THE WHOLE RACE GUARANTEE. Held until this transaction ends; the second caller
  -- reads the first one's committed table below instead of making its own.
  perform pg_advisory_xact_lock(
    hashtextextended('custom.table_ensure|' || p_organization_id::text || '|' || v_slug, 0));

  select r.id, (r.data ->> 'parent_id')::uuid into v_table, v_home
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = custom.table_kernel_id()
     and r.data_class = 'table'
     and r.deleted_at is null
     and r.data ->> 'slug' = v_slug
   order by r.created_at, r.id
   limit 1;

  if v_table is not null then
    -- A table she may not know is refused in the read door's own words, never re-made beside it.
    perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.table_ensure');
  else
    v_home := custom.record_write(p_organization_id, custom.person_kernel_id(),
                                  jsonb_build_object('name', v_name || ' Home'));
    v_table := custom.table_declare(
      p_organization_id,
      (p_spec - 'fields')
        || jsonb_build_object(
             'slug', v_slug,
             'parent_id', v_home,
             'fields', coalesce((select jsonb_agg(jsonb_build_object('name', f ->> 'key') order by n)
                                   from jsonb_array_elements(v_fields) with ordinality e(f, n)
                                  where nullif(f ->> 'key', '') is not null), '[]'::jsonb)));
    v_created := true;
  end if;

  -- THE COLUMNS, through the column door. On a new table every one is defined (the sketches
  -- table_declare made are filled in); on an existing table only a key it does not have yet is
  -- added — a column already defined is never touched.
  for v_field in select f from jsonb_array_elements(v_fields) f loop
    if v_created or not exists (
         select 1 from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id = custom.field_kernel_id()
            and r.data_class = 'field'
            and r.deleted_at is null
            and r.data ->> 'entity_definition_id' = v_table::text
            and r.data ->> 'key' = v_field ->> 'key'
            and not coalesce((r.data ->> 'declared_with_table')::boolean, false)) then
      perform custom.field_declare(p_organization_id, v_table, v_field);
    end if;
  end loop;

  return jsonb_build_object('table_id', v_table, 'home_id', v_home, 'created', v_created);
end;
$function$;

comment on function custom.table_ensure(uuid, jsonb) is
  'Lane PLATFORM-APP-DATA: find this organization''s Table by its slug or make it (Home via record_write, Table via table_declare, columns via field_declare) in one transaction under pg_advisory_xact_lock(hash(organization, slug)); idempotent, adds missing columns, never retypes or drops one.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_ensure',
   'p_organization_id uuid, p_spec jsonb',
   array['uuid'::regtype::oid, 'jsonb'::regtype::oid],
   'Takes an organization and a table spec. Refuses unless custom.assert_store_door and custom.assert_client_may_reach admit the caller; finds the Table of that slug (refusing through custom.assert_may_know_table one she may not know) or makes it through custom.record_write, custom.table_declare and custom.field_declare, each of which asks its own access question as the caller. Serialized per (organization, slug) by an advisory lock.',
   'lane12_two_first_saves_make_one_table.sql', null, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-02 lane PLATFORM-APP-DATA — read from this body"}}, "declared_at": "2026-10-02 lane PLATFORM-APP-DATA", "declared_by": "lane12_two_first_saves_make_one_table.sql"}'::jsonb)
on conflict do nothing;
