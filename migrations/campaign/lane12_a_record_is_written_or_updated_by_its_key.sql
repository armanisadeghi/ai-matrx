-- target: clone,production
-- additive: yes
--   It ADDS one new function and one platform.client_callable_door row, and nothing else:
--     · custom.record_upsert(uuid, uuid, text[], jsonb, integer)   the door: write the record this
--                                          key names, or update it when it is already there — in
--                                          one call, race-safe
--   No table, column, trigger, policy or grant is touched; nothing is dropped, replaced or revoked.
--   The grant is its own chair-step file, `lane12_the_new_table_and_record_doors_can_be_reached.sql`.
--   The inverse is `migrations/inverse/lane12_a_record_is_written_or_updated_by_its_key_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
--
-- LANE PLATFORM-APP-DATA (v6 lane 12), wave 1, item 4.
--
-- THE USE CASE. A front-desk page writes "the callback for (541) 555-0183" without first reading
-- whether one exists. Read-then-write from a browser is two calls and a race: two tabs both read
-- "none" and both write. This door does it in one call and one transaction.
--
-- WHY THE KEY MUST CARRY A UNIQUE RULE. "The record this key names" is only one record when the
-- table promises the key is unique; on any other column it is a guess. So every key column must
-- carry a `unique` rule (custom.table_unique_rule_fields) or the call is refused by the column's
-- name with the remedy. That is also what makes the race safe: the lock taken here is the SAME
-- advisory lock custom._unique_rule_holds takes for that (organization, table, key, value) —
-- hash of `org|table|key|lower(btrim(value))` — so two upserts of one key serialize, the second
-- one finds the first one's committed record and updates it, and a plain record_write of the same
-- value racing an upsert is still refused by the rule. Several keys are locked in key order.
--
-- NOTHING IS WRITTEN BY HAND. An existing live record goes through custom.record_update (its
-- access check, its compare-and-swap when p_expected_version is given, its stale-write sentence);
-- a missing one through custom.record_write (its access check, its defaults). Answers the
-- record's id either way.

create function custom.record_upsert(p_organization_id uuid, p_table_id uuid, p_key text[], p_data jsonb,
                                     p_expected_version integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_rules jsonb;
  v_keys  text[];
  v_key   text;
  v_label text;
  v_text  text;
  v_id    uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_upsert');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_upsert');
  if p_table_id is null then
    raise exception 'Say which table to write into.'
      using errcode = '22004', hint = 'Nothing was written.';
  end if;
  -- THE TABLE'S OWN WALL FIRST, as custom.record_write asks it: a Table she may not add records to
  -- is refused here, before its rules or its records are read — the same 42501 an invented id gets.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_upsert',
                                          'editor'::public.permission_level, 'table');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'The values to write must be an object of column key to value.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  select coalesce(array_agg(distinct btrim(k) order by btrim(k)), '{}'::text[]) into v_keys
    from unnest(coalesce(p_key, '{}'::text[])) k
   where nullif(btrim(k), '') is not null;
  if cardinality(v_keys) = 0 then
    raise exception 'Say which column finds the record.'
      using errcode = '22023',
            hint = 'Name the unique column (for example the phone number) that says which record this is. Nothing was written.';
  end if;

  v_rules := custom.table_unique_rule_fields(p_organization_id, p_table_id);

  foreach v_key in array v_keys loop
    select coalesce(nullif(f ->> 'label', ''), v_key) into v_label
      from jsonb_array_elements(v_rules) f
     where f ->> 'key' = v_key
     limit 1;
    if v_label is null then
      select coalesce(nullif(r.data ->> 'label', ''), v_key) into v_label
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = custom.field_kernel_id()
         and r.data_class = 'field'
         and r.deleted_at is null
         and r.data ->> 'entity_definition_id' = p_table_id::text
         and r.data ->> 'key' = v_key
       limit 1;
      raise exception '"%" can''t find a record: it isn''t a unique column.', coalesce(v_label, v_key)
        using errcode = '23514',
              hint = format('Turn on Unique for %s in its column settings, then write again. Nothing was written.', coalesce(v_label, v_key));
    end if;

    v_text := lower(btrim(p_data ->> v_key));
    if v_text is null or v_text = '' then
      raise exception '"%" needs a value: it says which record this is.', v_label
        using errcode = '22023', hint = 'Nothing was written.';
    end if;

    -- THE SAME LOCK custom._unique_rule_holds TAKES for this value: re-entrant in this
    -- transaction, and the one a racing write of the same value waits on.
    perform pg_advisory_xact_lock(
      hashtextextended(p_organization_id::text || '|' || p_table_id::text || '|' || v_key || '|' || v_text, 0));
    v_label := null;
  end loop;

  select x.id into v_id
    from custom.record x
   where x.organization_id = p_organization_id
     and x.table_id = p_table_id
     and x.deleted_at is null
     and not exists (select 1 from unnest(v_keys) k
                      where lower(btrim(x.data ->> k)) is distinct from lower(btrim(p_data ->> k)))
   order by x.created_at, x.id
   limit 1;

  if v_id is not null then
    perform custom.record_update(p_organization_id, v_id, p_data, p_expected_version);
    return v_id;
  end if;
  return custom.record_write(p_organization_id, p_table_id, p_data);
end;
$function$;

comment on function custom.record_upsert(uuid, uuid, text[], jsonb, integer) is
  'Lane PLATFORM-APP-DATA: write the record a unique key names, or update it through custom.record_update when it is already there; serialized on the same advisory lock custom._unique_rule_holds takes; refuses a key column without a unique rule by name.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'record_upsert',
   'p_organization_id uuid, p_table_id uuid, p_key text[], p_data jsonb, p_expected_version integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text[]'::regtype::oid, 'jsonb'::regtype::oid, 'int4'::regtype::oid],
   'Takes an organization, a Table, the unique key columns and the values. Refuses unless custom.assert_store_door and custom.assert_client_may_reach admit the caller and every key column carries a unique rule; then updates the live record holding those key values through custom.record_update, or writes one through custom.record_write — each asks its own access question as the caller.',
   'lane12_a_record_is_written_or_updated_by_its_key.sql', null, true, false,
   '{"version": 1, "arguments": {"p_organization_id": {"type": "uuid", "check": "this body decides it with custom.assert_client_may_change(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.", "entity": "organization", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 1, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-02 lane PLATFORM-APP-DATA — read from this body"}, "p_table_id": {"type": "uuid", "check": "this body decides it with custom.assert_client_may_change(arg2) — the record ladder at editor on the Table, decided before the Table is admitted to exist, and that call stands before every other use of this argument in the body.", "entity": "custom_record", "foreign": {"sqlstate": "42501", "same_as_invented": true}, "position": 2, "optional": false, "null_rule": {"sqlstate": "22004"}, "verified": "2026-10-02 lane PLATFORM-APP-DATA — read from this body"}}, "declared_at": "2026-10-02 lane PLATFORM-APP-DATA", "declared_by": "lane12_a_record_is_written_or_updated_by_its_key.sql"}'::jsonb)
on conflict do nothing;
