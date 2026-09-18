-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.migrate_retype(uuid,uuid,text,text) f358b111729d66df20c4ca260792d2f638f319d107f33b5a00aba2f13f249b59
--
-- W3-MIG, part five — A VALUE THAT LEAVES TAKES ITS PROVENANCE WITH IT.
--
-- MEASURED (branch, 2026-09-18, scripts/campaign-tests/w3_mig_c18.sql PART 7):
--   ERROR: This record carries where "phone" came from, and this table has no field called
--          "phone". Provenance nobody can read is worse than none.
--
-- `custom.migrate_retype` moved the misfit values out of `data` and left their envelopes in
-- `_values`. W1-VAL's guard refused the write, by name, which is the guard working — a record
-- on the Widget table saying where its phone number came from, when Widget has no phone, is
-- exactly the orphan provenance that check exists to stop.
--
-- THE CLASS AND ITS CENSUS: a verb that removes a value without removing its envelope. Two
-- verbs in this lane move values out of a document — `custom.migrate_split` (fixed in
-- `w3_mig_a_patch_cannot_remove_a_key.sql`, same session, same class) and this one. There is
-- no third: `merge` and `extract_parent` only ever ADD keys, `rename` and `reparent` replace
-- one, and `delete`, `promote`, `demote` and `purge` do not touch a document's shape.
--
-- THE MISFIT IS STILL NOT LOST, which is the whole of FLD-4 and REC-N-18. The value and its
-- envelope are in `history.row_versions` as the record stood before this verb ran, and the
-- value itself is inside the inverse stored on the Migration log with the reason — so the undo
-- puts it back and a person can read what it was and why it went. What is removed is the
-- dangling envelope on a document that no longer holds the value.
--
-- BASED ON, VERIFIED: the body below is the one this file replaces, with only the misfit loop
-- changed.

create or replace function custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text,
                                                 p_note text default null)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The Values already written stay exactly where they are; this verb does
  --    not walk the records and coerce them.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that do not fit are in History as they were, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'values', 'unchanged — nothing is coerced and nothing is deleted (FLD-4)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly. The value
      -- and this envelope are both in history.row_versions as the record stood a moment ago,
      -- and the value is in the inverse below with the reason, so nothing is lost.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  -- The table_id is not part of `data`, so it is not something custom.record_update can move.
  -- The door above has already judged this caller, and every BEFORE trigger on the table —
  -- the shape guards, the validation, the envelope — runs on this write exactly as on any
  -- other, which is what makes the target Table's rules apply from the first moment.
  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$fn$;

comment on function custom.migrate_retype(uuid, uuid, text, text) is
  'REC-N-18 / T9 and FLD-4 / T12, one verb with two arms. A RECORD retyped to another Table KEEPS ITS ID, keeps every Value the target accepts, and sends each misfit — value AND envelope together, or W1-VAL refuses the orphan provenance — to History with the reason, inside the stored inverse. A FIELD retyped changes what it behaves as and coerces nothing: the Values that no longer fit stay exactly as they were.';
