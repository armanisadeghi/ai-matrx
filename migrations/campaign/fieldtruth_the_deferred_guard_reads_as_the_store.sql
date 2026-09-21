-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom._claimed_column_guard() e071b27ee3db9b9f984f88e2e46dac034d6e576183ca04e7f7ac77084a8416c0
--
-- FIELD-TRUTH — A DEFERRED CHECK FIRES OUTSIDE THE DOOR THAT CAUSED IT.
--
-- `custom._claimed_column_guard` reads `custom.record` to ask whether every column a Table
-- claims has a Field record. Every other guard on this table is reached THROUGH a
-- SECURITY DEFINER door (`custom.record_update` and its siblings), so it inherits the
-- store's own identity and the read succeeds. A DEFERRED constraint trigger does not: it
-- fires at COMMIT, long after the door has returned, as whoever the caller actually is.
-- From the seat — `authenticated`, which by the closed-schema rule has no SELECT on
-- `custom.record` and must not — the guard died with "permission denied for table record"
-- instead of answering its question. A guard that cannot read is not a guard.
--
-- Found by fieldtruth_green.sql's PART 9, which asks for the deferred check early with
-- SET CONSTRAINTS ALL IMMEDIATE from the seat, which is the same moment COMMIT would ask.
--
-- It reads and raises; it writes nothing and returns no row, so running as the store's own
-- identity gives it exactly the reach it needs to answer and no other.

CREATE OR REPLACE FUNCTION custom._claimed_column_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_missing text[];
  v_list    text;
begin
  if new.data_class <> 'table' or new.deleted_at is not null then
    return null;
  end if;

  -- THE SWITCH, read by name. custom.store_is_open is the ONE resolver of the campaign's
  -- knob custom/system_enabled (custom.assert_store_door reads it through the same
  -- function), and every other guard on this table is behind it. While the store is off for
  -- an organization this check is dormant, exactly like the doors it belongs to.
  if not custom.store_is_open(new.organization_id) then
    return null;
  end if;

  select coalesce(array_agg(distinct e ->> 'name' order by e ->> 'name'), array[]::text[])
    into v_missing
    from jsonb_array_elements(case when jsonb_typeof(new.data -> 'fields') = 'array'
                                   then new.data -> 'fields' else '[]'::jsonb end) e
   where nullif(e ->> 'name', '') is not null
     and not exists (select 1 from custom.record f
                      where f.organization_id = new.organization_id
                        and f.table_id = custom.field_kernel_id()
                        and f.data_class = 'field'
                        and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = new.id::text
                        and f.data ->> 'key' = e ->> 'name');

  if cardinality(v_missing) = 0 then
    return null;
  end if;

  select string_agg(format('"%s"', x), ', ' order by x) into v_list from unnest(v_missing) x;
  raise exception '% says it has a column called %, and there is no such field.',
                  coalesce(nullif(new.data ->> 'name', ''), 'this table'), v_list
    using errcode = '23514',
          hint = 'REC-1 / REC-51: a table''s fields are the one source of truth for its columns, and a column nobody defined has no type, no rules and no validation — it can never hold anything. Define it in the same breath with custom.field_declare (custom.table_declare already does), or take the name off the table.';
end;
$function$;

COMMENT ON FUNCTION custom._claimed_column_guard() IS
  'FIELD-TRUTH: at COMMIT, every column name a Table claims has a Field record. Deferred because both doors write the two halves in two statements, SECURITY DEFINER because a deferred check fires outside the door that caused it, and behind the campaign switch custom/system_enabled like every other guard on custom.record.';
