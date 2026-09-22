-- additive: yes
--
-- chair-step: it REPLACES `custom.applicable_fields` — one function, answer-for-answer identical,
--   with its memo holding the Field IDS instead of the Field ROWS. Nothing is dropped, nothing is
--   revoked, no row of anybody's data is touched. The inverse is
--   `migrations/inverse/writeperf4_a_fact_about_the_table_is_read_once_down.sql`, which restores
--   the pre-wave-1 body.
--
-- WRITE-PERF-4 WAVE 1 — THE FIELDS ARE NAMED ONCE, AND READ FROM THE STORE.
--
-- MEASURED. Even out of its own slot, a hit on `custom.applicable_fields` cost 254 us on a
-- 17-field table, and the plan's own anchor table says why: 148 us of that is the `::jsonb` CAST
-- of a 16 KB text and the rest is `jsonb_populate_recordset` rebuilding 17 composite rows. A GUC
-- holds TEXT, so a hit ALWAYS re-parses, and no caching shape gets under that floor —
-- "148 us is the floor for 'hand me this table's fields'".
--
-- SO STOP PUTTING THE ROWS IN THE MEMO. The expensive question this function answers is WHICH
-- Field rows apply — a predicate over `applies_to_types` and `custom.choice_synonyms`, which is
-- the part worth remembering. The ROWS themselves are seven or seventeen rows of `custom.record`,
-- sitting in this backend's own buffers, reachable by the table's primary key
-- `(organization_id, id)`. Reading them is an index scan of a handful of rows; parsing them out of
-- a jsonb text is 148 us of CPU that produces the same tuples.
--
-- The memo now holds the ANSWER TO THE QUESTION — the list of Field ids — and the rows come from
-- the store. It is strictly MORE current than before, not less: a Field row edited after the memo
-- was taken is now read fresh rather than served out of a snapshot of itself. The invalidation is
-- unchanged and is still the authority for the id list: every Field row write runs
-- `_aa_memo_clear` BEFORE ROW, which empties the memo, so a Field added, retyped or retired
-- earlier in the SAME STATEMENT changes the ids too, not just the rows.
--
-- WHAT DOES NOT CHANGE. The predicate is character for character what it was, including
-- `custom.choice_synonyms` and the `applies_to_types` clause; the three door asserts still run
-- FIRST, before any read, so a foreign organization id and an invented one still answer
-- identically; the function still returns `setof custom.record` with no ORDER BY, exactly as
-- before (it never promised an order and no caller reads one).
--
-- based-on: custom.applicable_fields(uuid, uuid, text) c3a6e6abddd3e6f9786f6900d5ef0877b036727c405d2ed48a2e9576293de95a

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
  v_ids   jsonb;
  v_hit   text;
begin
  -- The decision comes BEFORE the read, so a foreign organization id and an invented one
  -- answer identically: both are refused, neither is told whether the table exists.
  perform custom.assert_store_door(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.applicable_fields');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.applicable_fields');

  -- THE SAME TABLE, ALREADY READ IN THIS TRANSACTION. The three lines above ran first, so this
  -- is a shortcut through the READ and never through the DECISION. What is remembered is WHICH
  -- Fields apply; the rows themselves come from the store, by primary key. See the header.
  v_key := 'af:' || coalesce(p_organization_id::text, '-') || ':' ||
                    coalesce(p_table_id::text, '-') || ':' || coalesce(p_record_type, '');
  v_hit := platform.memo_k_get(v_key);
  if v_hit is not null then
    return query
      select f.* from custom.record f
       where f.organization_id = p_organization_id
         and f.id = any (array(select x::uuid from jsonb_array_elements_text(v_hit::jsonb) x));
    return;
  end if;

  -- T8. The record's type value is the option's KEY; whoever declared "Radius applies to a
  -- Circle" may have written the word, the key or the option's id. All of them name the same
  -- choice, so the question is asked with all of them. This is the clause the seventh pass
  -- failed: "asking what columns THIS record has answers without Radius".
  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms(p_organization_id, p_table_id, p_record_type) end;

  select coalesce(jsonb_agg(to_jsonb(q.id)), '[]'::jsonb) into v_ids from (
    select f.id
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and (jsonb_array_length(coalesce(f.data -> 'applies_to_types', '[]'::jsonb)) = 0
            or (p_record_type is not null
                and coalesce(f.data -> 'applies_to_types', '[]'::jsonb) ?| v_types))) q;

  perform platform.memo_k_put(v_key, v_ids::text);
  return query
    select f.* from custom.record f
     where f.organization_id = p_organization_id
       and f.id = any (array(select x::uuid from jsonb_array_elements_text(v_ids) x));
end $function$;
