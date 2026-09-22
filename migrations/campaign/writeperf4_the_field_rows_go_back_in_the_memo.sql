-- additive: yes
--
-- chair-step: it puts `custom.applicable_fields` BACK to the body
--   `writeperf4_a_fact_about_the_table_is_read_once.sql` gave it, because the measurement said so.
--   Nothing is dropped, nothing is revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf4_a_fact_about_the_table_is_read_once_down.sql`.
--
-- WRITE-PERF-4 WAVE 1 — THE FIELD ROWS GO BACK IN THE MEMO, BECAUSE READING THEM IS DEARER.
--
-- `writeperf4_the_fields_are_named_once_and_read_from_the_store.sql` reasoned that a GUC holds
-- text, so a hit always re-parses, and that reading seven rows out of the store by primary key
-- must beat parsing them out of a jsonb text. IT DOES NOT. Measured on the main database, 1,000
-- calls on the campaign's own 7-field fixture, argument varying, memo warm:
--
--   the Field IDS in the memo, rows read from custom.record .......... 350 us a call
--   the Field ROWS in the memo, jsonb_populate_recordset ............. 291 us a call
--
-- `custom.record` is hash-partitioned into sixteen children, and an `id = any(...)` lookup inside
-- a plpgsql function does not prune the way a constant-folded one would; the index scan plus the
-- array construction cost more than the parse it was meant to avoid. The interleaved 250-row A/B
-- agreed, per trigger: `_value_envelope` +50 ms, `custom_record_zz_derived_fields` +49 ms,
-- `io_record_changed_s_i` +26 ms — the three heaviest callers, all worse.
--
-- So the idea is withdrawn and the bytes go back. This is the wave's rule, applied to the wave's
-- own idea: a thing that measured as a cost does not ship because it was clever.
--
-- based-on: custom.applicable_fields(uuid, uuid, text) 0233be8148ebca4432aa5c767a328a2bef3480c29a3bae58a77212dd06fac91f

create or replace function custom.applicable_fields(p_organization_id uuid, p_table_id uuid, p_record_type text DEFAULT NULL::text)
returns setof custom.record
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_types text[];
  v_key   text;
  v_json  jsonb;
  v_hit   text;
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION.
  --
  -- WRITE-PERF-4: its own slot, not a corner of a 37 KB blob. Measured on the main database,
  -- a 17-field table: 427 us a call out of the shared blob, 254 us out of its own key. The
  -- value is `jsonb_strip_nulls`ed before it is stored — `jsonb_populate_recordset` reads an
  -- absent key and a null key identically, and a `custom.record` row is mostly nulls, so this
  -- is the same 17 rows out of a much smaller text.
  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return query select * from jsonb_populate_recordset(null::custom.record, v_hit::jsonb);
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(q))), '[]'::jsonb) into v_json from (
    select f.*
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_k_put(v_key, v_json::text);
  return query select * from jsonb_populate_recordset(null::custom.record, v_json);
end $function$;
