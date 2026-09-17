-- W1-FIELD-TYPES — FLD-11's parity floor, and V1-MODEL's clause C-41 executed.
--
-- WHAT IT ASSERTS, and every clause is a value read back rather than a declaration read back:
--
--   A. ALL THIRTEEN ROUND-TRIP. The fixture record is read through custom.parity_values and
--      every one of the thirteen parity types answers with the value that was written, its
--      behaviour, its unit and its format. Thirteen distinct names, no nulls.
--   B. THE ENVELOPE. The same read carries W1-VAL's version and author for every Value, so
--      a parity Value is an ordinary Value of the store and not a shape beside it.
--   C. LOOKUP IS A READ THROUGH A RELATION, PROVEN BY MOVING THE FAR SIDE. The related
--      Person's name is changed and the lookup answers the NEW name — a stored copy would
--      answer the old one.
--   D. ROLLUP DOES NOT DOUBLE COUNT. The relation lists the first line TWICE; the sum is 350
--      and not 450. The naive sum is computed in the same clause, so the two are compared
--      rather than one being asserted.
--   E. ROLLUP RECOMPUTES WHEN A CONTAINED RECORD CHANGES. A line's amount moves 100 -> 150
--      and the parent's total moves 350 -> 400, with the parent NEVER WRITTEN.
--   F. FORMULA RECOMPUTES WHEN ONE OF ITS INPUTS CHANGES, and it is DECLARED (FLD-9):
--      amount_usd 400 -> 1000 and amount_with_tax 440 -> 1100, stamped into _derived at
--      write time with the field id, the parity type and the moment.
--   G. ATTACHMENT IS A FILE RECORD REACHED THROUGH A RELATION (REC-31), joined from the
--      stored value to a record of the kernel `File` Table — not a storage key on the parent.
--   H. THIRTEEN WRONG-SHAPED INPUTS, EACH REFUSED BY THE FIELD'S OWN NAME. One per parity
--      type; the message must contain the field's label, or the clause fails.
--   I. THE POSITIVE CONTROL (rule 14): the same thirteen values, correctly shaped, are
--      written to a second record and LAND — so H proves a refusal and not a broken store.
--   J. THE DECLARATIONS THAT CANNOT BE MADE: a parity name nobody ships, a declaration that
--      contradicts what the field actually says, a lookup with nothing to read through, a
--      rollup along a single relation, a rollup stamped at write time, an attachment that
--      would cascade, a url with no pattern Rule — seven refusals, each naming the field.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every computed clause: the
-- lookup is read twice with two different expected names, the rollup four times with 350,
-- 400 and the deliberately-wrong 450, and the formula twice with 440 and 1100. A body that
-- returned a constant, or `return expected`, survives none of them.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   A, C, D, E, G  — remove `custom.derived_values` from `custom.record_values`, or drop
--                    the DISTINCT in `custom.relation_targets` (D goes to 450).
--   F              — drop the trigger `custom_record_zz_derived_fields`.
--   H              — drop `custom_record_field_validation` (W1-FIELD's validator).
--   J              — drop `custom_record_field_type_parity_guard`.
-- All of that is exactly what `migrations/inverse/w1_field_types_the_parity_floor_down.sql`
-- does, so the RED is the rule-27 inverse itself, never a hand-weakened copy. The separate
-- `w1_field_types_red.sql` runs the refusals inside a disposable `zz_w1_field_types_red`
-- schema with the two guards removed, and shows each of them LANDING.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK, so the fixture is exactly as it was afterwards.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_types_c41.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec     constant uuid := '11111111-0009-4000-8000-000000000011';
  v_rec2    constant uuid := '11111111-0009-4000-8000-000000000099';
  v_tbl     constant uuid := '11111111-0005-4000-8000-000000000003';
  v_person  constant uuid := '11111111-0006-4000-8000-000000000011';
  v_file    constant uuid := '11111111-0006-4000-8000-000000000021';
  v_line1   constant uuid := '11111111-0009-4000-8000-000000000001';
  v_opt     constant uuid := '11111111-0006-4000-8000-000000000001';
  v_n       integer;
  v_v       jsonb;
  v_naive   numeric;
  v_msg     text;
  v_seen    text;
  v_case    record;
begin
  -- ── A. ALL THIRTEEN ROUND-TRIP ────────────────────────────────────────────────────
  select count(*) into v_n
    from custom.parity_values(v_org, v_rec) p
   where p.parity_type is not null and p.value is not null;
  if v_n <> 13 then
    raise exception 'A FAILED: % of the thirteen parity types read back a value', v_n;
  end if;
  select count(distinct p.parity_type) into v_n from custom.parity_values(v_org, v_rec) p
   where p.parity_type is not null;
  if v_n <> 13 then
    raise exception 'A FAILED: % distinct parity types, and the floor is thirteen', v_n;
  end if;
  -- and every one of them is a name `custom.parity_field_types()` ships
  select count(*) into v_n
    from custom.parity_values(v_org, v_rec) p
   where p.parity_type is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = p.parity_type);
  if v_n <> 0 then
    raise exception 'A FAILED: % values claim a parity type nobody ships', v_n;
  end if;
  raise notice 'A PASS — thirteen parity types, thirteen values read back';

  -- ── B. THE ENVELOPE ───────────────────────────────────────────────────────────────
  select count(*) into v_n from custom.parity_values(v_org, v_rec) p
   where p.parity_type is not null and coalesce(p.value_version, 0) < 1;
  if v_n <> 0 then
    raise exception 'B FAILED: % parity values came back with no version', v_n;
  end if;
  raise notice 'B PASS — every parity Value carries W1-VAL''s version';

  -- ── C. LOOKUP READS THROUGH THE RELATION ──────────────────────────────────────────
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'owner_name';
  if v_v <> '"Parity Person"'::jsonb then
    raise exception 'C FAILED (first input): the lookup answered % and the related record says Parity Person', v_v;
  end if;
  update custom.record set data = jsonb_set(data, '{full_name}', '"Renamed Person"'::jsonb)
   where organization_id = v_org and id = v_person;
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'owner_name';
  if v_v <> '"Renamed Person"'::jsonb then
    raise exception 'C FAILED (second input): the far side moved and the lookup answered %, so it is a stored copy', v_v;
  end if;
  raise notice 'C PASS — the lookup follows the relation, twice, to two different answers';

  -- ── D. THE ROLLUP DOES NOT DOUBLE COUNT ───────────────────────────────────────────
  -- The naive sum, computed HERE from the same document, is what a rollup without DISTINCT
  -- would answer. The two are compared rather than one being asserted.
  select sum((custom.record_values(v_org, (t #>> '{}')::uuid) ->> 'amount')::numeric)
    into v_naive
    from custom.record r, jsonb_array_elements(r.data -> 'lines') t
   where r.organization_id = v_org and r.id = v_rec;
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'line_total';
  if v_naive <> 450 then
    raise exception 'D FAILED: the fixture no longer lists a line twice (naive sum %), so the clause proves nothing', v_naive;
  end if;
  if (v_v #>> '{}')::numeric <> 350 then
    raise exception 'D FAILED: the rollup answered % where the relation names two distinct lines worth 350 and the naive sum is %',
                    v_v, v_naive;
  end if;
  raise notice 'D PASS — the same line listed twice counts once: rollup 350, naive sum %', v_naive;

  -- ── E. THE ROLLUP RECOMPUTES WHEN A CONTAINED RECORD CHANGES ──────────────────────
  update custom.record set data = jsonb_set(data, '{amount}', '150'::jsonb)
   where organization_id = v_org and id = v_line1;
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'line_total';
  if (v_v #>> '{}')::numeric <> 400 then
    raise exception 'E FAILED: a contained record moved 100 -> 150 and the parent total answered % instead of 400', v_v;
  end if;
  raise notice 'E PASS — a contained record changed and the parent total moved 350 -> 400, with the parent never written';

  -- ── F. THE FORMULA RECOMPUTES ON ITS DECLARED OCCASION ────────────────────────────
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'amount_with_tax';
  if (v_v #>> '{}')::numeric <> 440 then
    raise exception 'F FAILED (first input): the formula answered % and 400 * 1.1 is 440', v_v;
  end if;
  update custom.record set data = jsonb_set(data, '{amount_usd}', '1000'::jsonb)
   where organization_id = v_org and id = v_rec;
  select p.value into v_v from custom.parity_values(v_org, v_rec) p where p.field_key = 'amount_with_tax';
  if (v_v #>> '{}')::numeric <> 1100 then
    raise exception 'F FAILED (second input): the input moved 400 -> 1000 and the formula answered % instead of 1100', v_v;
  end if;
  -- and it is DECLARED: the answer is stamped where a reader can see when and by what.
  select r.data -> '_derived' -> 'amount_with_tax' into v_v
    from custom.record r where r.organization_id = v_org and r.id = v_rec;
  if v_v is null or (v_v ->> 'parity') <> 'formula' or (v_v ->> 'at') is null
     or (v_v ->> 'field_id') <> '11111111-0008-4000-8000-000000000008' then
    raise exception 'F FAILED: the write-time formula left no provenance: %', v_v;
  end if;
  raise notice 'F PASS — 440 then 1100, stamped into _derived with its field, its parity type and its moment';

  -- ── G. THE ATTACHMENT IS A FILE RECORD REACHED THROUGH A RELATION (REC-31) ────────
  select count(*) into v_n
    from custom.record r, jsonb_array_elements(r.data -> 'photos') t
    join custom.record f
      on f.organization_id = v_org
     and f.id = (t #>> '{}')::uuid
     and f.table_id = custom.file_kernel_id()
   where r.organization_id = v_org and r.id = v_rec
     and f.data ->> 'mime' = 'image/png';
  if v_n <> 1 then
    raise exception 'G FAILED: the attachment resolved to % File records', v_n;
  end if;
  raise notice 'G PASS — REC-31: the picture is a File record reached through a relation';

  -- ── H. THIRTEEN WRONG-SHAPED INPUTS, EACH REFUSED BY THE FIELD'S OWN NAME ─────────
  for v_case in
    select * from (values
      ('select',       'status',          '{"status":"11111111-0006-4000-8000-000000000021"}'::jsonb, 'Status'),
      ('multi_select', 'tags',            '{"tags":"11111111-0006-4000-8000-000000000001"}'::jsonb,   'Tags'),
      ('member',       'owner',           '{"owner":"11111111-0006-4000-8000-000000000021"}'::jsonb,  'Owner'),
      ('attachment',   'photos',          '{"photos":["11111111-0006-4000-8000-000000000011"]}'::jsonb,'Photos'),
      ('lookup',       'owner_name',      '{"owner_name":"typed in by hand"}'::jsonb,                 'Owner name'),
      ('rollup',       'line_total',      '{"line_total":9999}'::jsonb,                               'Line total'),
      ('formula',      'amount_with_tax', '{"amount_with_tax":1}'::jsonb,                             'Amount with tax'),
      ('url',          'homepage',        '{"homepage":"aimatrx dot com"}'::jsonb,                    'Homepage'),
      ('email',        'contact_email',   '{"contact_email":"admin at admin"}'::jsonb,                'Contact email'),
      ('phone',        'contact_phone',   '{"contact_phone":"call me maybe"}'::jsonb,                 'Contact phone'),
      ('currency',     'amount_usd',      '{"amount_usd":"four hundred dollars"}'::jsonb,             'Amount'),
      ('percent',      'completion',      '{"completion":140}'::jsonb,                                'Completion'),
      ('datetime',     'due',             '{"due":"next Thursday-ish"}'::jsonb,                       'Due')
    ) as t(parity, key, bad, label)
  loop
    v_seen := null;
    begin
      insert into custom.record (id, organization_id, table_id, data_class, data)
      values (gen_random_uuid(), v_org, v_tbl, 'record',
              -- the base document is VALID and complete: only the one key under test is
              -- wrong, so a refusal can only be about that key.
              (jsonb_build_object('title', 'wrong shape', 'status', v_opt::text) || v_case.bad));
    exception when others then
      v_seen := sqlerrm;
    end;
    if v_seen is null then
      raise exception 'H FAILED (%): a wrong-shaped % was accepted', v_case.parity, v_case.key;
    end if;
    if position(v_case.label in v_seen) = 0 then
      raise exception 'H FAILED (%): refused, but the message does not name the field "%": %',
                      v_case.parity, v_case.label, v_seen;
    end if;
    raise notice 'H % — refused by name: %', v_case.parity, v_seen;
  end loop;
  raise notice 'H PASS — all thirteen wrong shapes refused, each naming its own field';

  -- ── I. THE POSITIVE CONTROL ───────────────────────────────────────────────────────
  insert into custom.record (id, organization_id, table_id, data_class, data)
  values (v_rec2, v_org, v_tbl, 'record',
          jsonb_build_object(
            'title', 'Positive control',
            'status', v_opt::text,
            'tags', jsonb_build_array(v_opt::text),
            'owner', v_person::text,
            'photos', jsonb_build_array(v_file::text),
            'lines', jsonb_build_array(v_line1::text),
            'homepage', 'https://aimatrx.com/control',
            'contact_email', 'test@test.com',
            'contact_phone', '+1 555 999 0000',
            'amount_usd', 20,
            'completion', 5,
            'due', '2027-01-01T00:00:00Z'));
  select count(*) into v_n from custom.parity_values(v_org, v_rec2) p
   where p.parity_type is not null and p.value is not null;
  if v_n <> 13 then
    raise exception 'I FAILED: the positive control read back % of thirteen', v_n;
  end if;
  select p.value into v_v from custom.parity_values(v_org, v_rec2) p where p.field_key = 'line_total';
  if (v_v #>> '{}')::numeric <> 150 then
    raise exception 'I FAILED: the control record names one line worth 150 and its total is %', v_v;
  end if;
  raise notice 'I PASS — the same thirteen, correctly shaped, LAND, and a different relation gives a different total (150)';

  -- ── J. THE DECLARATIONS THAT CANNOT BE MADE ───────────────────────────────────────
  for v_case in
    select * from (values
      ('a name nobody ships',
       '{"key":"title","label":"Bad name","parity_type":"barcode","type":"text","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'not one of the field types this system ships'),
      ('a declaration that contradicts itself',
       '{"key":"title","label":"Fake currency","parity_type":"currency","type":"range","multi":false,"dated":false,"rules":[],"config":{"kind":"number"},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'calls itself a currency'),
      ('a lookup with nothing to read through',
       '{"key":"title","label":"Blind lookup","parity_type":"lookup","type":"formula","compute_on":"read","multi":false,"dated":false,"rules":[],"config":{"pick":"full_name"},"source":"synced","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'which relation it reads through'),
      ('a rollup along a single relation',
       '{"key":"title","label":"Single rollup","parity_type":"rollup","type":"formula","compute_on":"read","multi":false,"dated":false,"rules":[],"config":{"via":"owner","of":"full_name","agg":"count"},"source":"formula","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'points at one thing at a time'),
      ('a rollup stamped at write time',
       '{"key":"title","label":"Stale rollup","parity_type":"rollup","type":"formula","compute_on":"write","multi":false,"dated":false,"rules":[],"config":{"via":"lines","of":"amount","agg":"sum"},"source":"formula","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'out of date the moment one of them changed'),
      ('an attachment that would cascade',
       '{"key":"title","label":"Cascading photo","parity_type":"attachment","type":"relation","relation_target":"11111111-0000-4000-8000-000000000006","relation_max":1,"on_target_delete":"cascade","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'deleting the file deletes the record'),
      ('a url with no pattern Rule',
       '{"key":"title","label":"Loose url","parity_type":"url","type":"text","format":"url","multi":false,"dated":false,"rules":[],"config":{},"source":"manual","sensitivity":"internal","context_policy":"include","depends_on":[],"applies_to_types":[]}'::jsonb,
       'nothing says what a url looks like')
    ) as t(what, decl, expect)
  loop
    v_seen := null;
    begin
      insert into custom.record (id, organization_id, table_id, data_class, data)
      values (gen_random_uuid(), v_org, custom.field_kernel_id(), 'field',
              v_case.decl || jsonb_build_object('entity_definition_id', v_tbl::text));
    exception when others then
      v_seen := sqlerrm;
    end;
    if v_seen is null then
      raise exception 'J FAILED (%): the declaration was accepted', v_case.what;
    end if;
    if position(v_case.expect in v_seen) = 0 then
      raise exception 'J FAILED (%): refused with the wrong reason: %', v_case.what, v_seen;
    end if;
    raise notice 'J % — %', v_case.what, v_seen;
  end loop;
  raise notice 'J PASS — seven declarations that cannot be made, each refused by name';

  raise notice 'W1-FIELD-TYPES C-41 SUITE GREEN — thirteen types, four real implementations, twenty refusals';
end;
$t$;

rollback;
