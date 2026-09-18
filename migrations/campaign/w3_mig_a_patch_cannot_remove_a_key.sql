-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.migrate_split(uuid,uuid,text[],text) 02e2c2f1a8525dbd395da991486a5ab90a2494a03c996b9896751eb1526d5d9b
--
-- W3-MIG, part four — THE SPLIT COPIED INSTEAD OF MOVING, AND REPORTED A MOVE.
--
-- MEASURED (branch, 2026-09-18, scripts/campaign-tests/w3_mig_c18.sql PART 6):
--   REC-22: the moved key is still on the keeper — "555-9999"
--
-- `custom.record_update` is a MERGE — its body is `set data = data || p_patch` — so handing it
-- a document with a key REMOVED removes nothing. The split created the new record, reported
-- `"moved": ["phone"]`, and left the value on both sides. Two records, one value, and a
-- success sentence: a person splitting a record to separate two things would have got two
-- copies of both and been told it worked.
--
-- THE CLASS: a verb that removes a key by handing the shortened document to a merge. This
-- file's `custom.migrate_split` is the only one in schema `custom` with that shape —
-- `custom.migrate_retype` already writes its shortened document with a direct UPDATE for the
-- same reason (it also has to move `table_id`, which is not in `data` at all), and every other
-- verb here only ever ADDS or REPLACES keys, which is exactly what a merge does correctly.
--
-- THE FIX, and why a direct UPDATE is the right one rather than a workaround: the door has
-- already judged this caller on the first line of the verb, and every BEFORE trigger on
-- `custom.record` — the envelope, the shape guards, the validation, the containment guard —
-- runs on this write exactly as on any other. What is skipped is `custom.record_update`'s
-- optimistic-concurrency argument, which this verb never passed anyway.
--
-- BASED ON, VERIFIED: the body below is the one this file replaces, with only the keeper's
-- write changed.

create or replace function custom.migrate_split(p_organization_id uuid, p_record_id uuid, p_moved_keys text[],
                                                p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row  custom.record%rowtype;
  v_new  uuid;
  v_keep jsonb;
  v_side jsonb := '{}'::jsonb;
  v_key  text;
  v_log  uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_split');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to split.', p_record_id using errcode = '02000';
  end if;
  if p_moved_keys is null or array_length(p_moved_keys, 1) is null then
    raise exception 'A split has to say what moves to the other side.'
      using errcode = '22004',
            hint = 'REC-22: name the fields that go to the new record. Everything else stays where it is, on the id that everything already points at.';
  end if;

  v_keep := v_row.data;
  foreach v_key in array p_moved_keys loop
    if v_row.data ? v_key then
      v_side := v_side || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- The value's envelope goes with the value. Leaving it behind would be a record
      -- carrying provenance for something it no longer holds.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  -- REC-22: ONE SIDE KEEPS THE ID, and it is the original record — never a new pair of ids
  -- with the old one pointing at one of them, because every relation, bookmark and citation
  -- out there already names it.
  v_new := custom.record_write(p_organization_id, v_row.table_id,
             v_side || jsonb_build_object('parent_id', nullif(v_row.data ->> 'parent_id', '')));

  v_log := history.migration_record(p_organization_id, 'split', v_row.data_class, p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id::text,
                                'patch', v_row.data, 'delete_after', v_new::text),
             coalesce(p_note, format('split %s off into %s', array_to_string(p_moved_keys, ', '), v_new)));

  -- A SPLIT MOVES. `custom.record_update` is `data || patch`, so a shortened document handed
  -- to it removes nothing and the value stays on both sides — measured 2026-09-18. The write
  -- is direct, and every BEFORE trigger on custom.record still runs on it.
  update custom.record r
     set data = v_keep
   where r.organization_id = p_organization_id and r.id = p_record_id;

  -- The NEW side is recorded as having come from the keeper. The keeper's own id is NOT
  -- aliased: `custom.resolve_id` answers with it, because it never stopped being a record.
  insert into custom.record_alias (organization_id, old_id, new_id, verb, reason, migration_id)
  values (p_organization_id, v_new, p_record_id, 'split',
          coalesce(p_note, 'split off from the record that kept the id'), v_log)
  on conflict (organization_id, old_id) do nothing;

  return jsonb_build_object('verb', 'split', 'kept_the_id', p_record_id, 'new_record', v_new,
                            'migration_id', v_log, 'moved', to_jsonb(p_moved_keys),
                            'old_id_resolves_to', custom.resolve_id(p_organization_id, p_record_id),
                            'at', now());
end;
$fn$;

comment on function custom.migrate_split(uuid, uuid, text[], text) is
  'REC-22: one record becomes two and ONE SIDE KEEPS THE ID — the original, because everything out there already names it. The moved keys and their envelopes LEAVE the keeper (a shortened document handed to custom.record_update removes nothing: that merge left the value on both sides). The new side is recorded in custom.record_alias as having come from it, which is provenance and never a redirect of the id that stayed.';
