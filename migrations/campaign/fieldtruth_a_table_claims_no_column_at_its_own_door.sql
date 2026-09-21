-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.record_update(uuid, uuid, jsonb, integer) fd645b35038d14796ca12c7cc63b82cb2010eff49e9c6182a3438544d4e522e9
--
-- FIELD-TRUTH — A TABLE CLAIMS NO COLUMN IT NEVER DEFINED, ASKED AT THE DOOR.
--
-- This replaces the DEFERRED CONSTRAINT TRIGGER this lane added an hour earlier and is
-- applied BEFORE it comes off, so the rule is never unenforced in between.
--
-- WHY THE TRIGGER HAD TO GO. Postgres queues a pending event for every row a deferrable
-- trigger sees, and `CREATE INDEX` refuses to run while its table has pending trigger
-- events. `custom.promote_field` creates a real index — that is what a promoted or unique
-- column IS — so any transaction that wrote to `custom.record` and then promoted a column
-- died with *"cannot CREATE INDEX "record_p03" because it has pending trigger events"*.
-- `custom.work_slots_declare` does exactly that: a slots Table, three columns, then
-- `slot_key` promoted to a unique index, all in one call. Booking pages hold slots through
-- it. `SET CONSTRAINTS ALL IMMEDIATE` before each index would have worked and would have
-- left a landmine for every future door that creates one, and a safe path beside an unsafe
-- one is not a fix.
--
-- WHERE THE RULE LIVES NOW. Crew E's actual path is `custom.record_update` on a Table row's
-- `fields` array, "accepted with no cross-check — the table now declares a field name
-- (`client_site`, `pickup`) with no Field definition behind it, and nothing catches or
-- reports the mismatch". So the door asks, at the END of the call, once the write has
-- landed: every name this Table claims has a Field record, or the call is refused and rolls
-- back with the names. It is asked ONLY when the patch actually touches `fields`, so an
-- ordinary record edit pays nothing.
--
-- WHAT IS NOT COVERED, said out loud rather than implied: a platform function that INSERTs a
-- Table row directly is not asked here. There are four, they are censused in
-- `fieldtruth_a_state_table_declares_its_four_columns.sql`, and all four now create their
-- Field rows in the same call. `pnpm check:store-doors-decide` and
-- `scripts/campaign-tests/fieldtruth_products_green.sql` are what keep that true.
--
-- REC-1 / REC-51.

CREATE FUNCTION custom.assert_columns_are_defined(p_organization_id uuid, p_record_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record;
  v_missing text[];
  v_list    text;
begin
  -- Only when the write actually touched the column list. Every other edit pays nothing.
  if p_patch is null or not (p_patch ? 'fields') then
    return;
  end if;

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;
  if v_row.id is null or v_row.data_class <> 'table' or v_row.deleted_at is not null then
    return;
  end if;

  select coalesce(array_agg(distinct e ->> 'name' order by e ->> 'name'), array[]::text[])
    into v_missing
    from jsonb_array_elements(case when jsonb_typeof(v_row.data -> 'fields') = 'array'
                                   then v_row.data -> 'fields' else '[]'::jsonb end) e
   where nullif(e ->> 'name', '') is not null
     and not exists (select 1 from custom.record f
                      where f.organization_id = p_organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.data_class = 'field'
                        and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = p_record_id::text
                        and f.data ->> 'key' = e ->> 'name');

  if cardinality(v_missing) = 0 then
    return;
  end if;

  select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_missing) x;
  raise exception '% says it has a column called %, and there is no such field.',
                  coalesce(nullif(v_row.data ->> 'name', ''), 'this table'), v_list
    using errcode = '23514',
          hint = 'REC-1 / REC-51: a table''s fields are the one source of truth for its columns, and a column nobody defined has no type, no rules and no validation — it can never hold anything. Define it with custom.field_declare, which adds the name and the definition together, or leave the name off the table.';
end;
$function$;

-- WHO MAY CALL IT, IN DATA. Nobody outside the store: it is the tail of
-- `custom.record_update`, which has already decided the organization and the row before it
-- writes anything. It reads and raises; it writes nothing and hands back no rows.
INSERT INTO platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
VALUES
  ('custom', 'assert_columns_are_defined',
   'p_organization_id uuid, p_record_id uuid, p_patch jsonb',
   ARRAY['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
   'p_organization_id is the organization custom.record_update already admitted the caller to through custom.assert_client_may_change; p_record_id is a row inside that organization and is read only as (p_organization_id, p_record_id), so it can never name a row elsewhere. A NULL organization or record id reads nothing and the function returns without raising, because there is no Table to judge.',
   'fieldtruth_a_table_claims_no_column_at_its_own_door.sql',
   'server_only: the tail of custom.record_update and nothing else. It is reached only after that door has decided the organization and the row, it returns void, and it exists to raise a refusal — a client calling it directly could learn nothing it cannot already read and could change nothing at all, so no client lane is opened for it.',
   false, false)
ON CONFLICT DO NOTHING;

COMMENT ON FUNCTION custom.assert_columns_are_defined(uuid, uuid, jsonb) IS
  'FIELD-TRUTH: every column name a Table claims has a Field record. Asked by custom.record_update at the end of a call that touched `fields`, because the deferred constraint trigger that used to ask it blocked every CREATE INDEX on custom.record. Behind the campaign switch custom/system_enabled through the doors that call it.';

CREATE OR REPLACE FUNCTION custom.record_update(p_organization_id uuid, p_record_id uuid, p_patch jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_new       integer;
  v_current   integer;
  v_contested jsonb;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_update');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_update');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_update: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'custom.record_update: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(p_patch), 'nothing')
      using errcode = '22023';
  end if;

  -- THE OPT-IN POSTURE, KEPT. A write that declares no base revision behaves exactly as a
  -- direct UPDATE always has: last-write-wins.
  if p_expected_version is null then
    update custom.record
       set data = data || p_patch
     where organization_id = p_organization_id and id = p_record_id and deleted_at is null
    returning version into v_new;
    if v_new is null then
      raise exception 'There is no record % in this organization any more.', p_record_id
        using errcode = '02000',
              hint = 'It was deleted, or it never existed here. The store is keyed (organization_id, id), so a record from another organization is not found by this one.';
    end if;
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  -- THE COMPARE-AND-SWAP.
  update custom.record
     set data = data || p_patch
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
     and version = p_expected_version
  returning version into v_new;
  if v_new is not null then
    perform custom.assert_columns_are_defined(p_organization_id, p_record_id, p_patch);
    return v_new;
  end if;

  select r.version into v_current
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_current is null then
    raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was written. The record is gone, so there is nothing to merge into: keep your work somewhere else, or write it as a new record.';
  end if;

  select jsonb_object_agg(k.key, r.data -> k.key) into v_contested
    from custom.record r, lateral jsonb_object_keys(p_patch) k(key)
   where r.organization_id = p_organization_id and r.id = p_record_id;

  raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                  p_expected_version, v_current
    using errcode = 'PT409',
          detail = jsonb_build_object('expected_version', p_expected_version,
                                      'current_version',  v_current,
                                      'contested_fields', coalesce(v_contested, '{}'::jsonb))::text,
          hint = format('Nothing was overwritten and nothing was lost - their work is still there and yours is still in your hands. Look at what changed (it is in this error, field by field), decide keep-mine, keep-theirs or merged, and write it again against version %s. Resolution is just another write.', v_current);
end
$function$

;
