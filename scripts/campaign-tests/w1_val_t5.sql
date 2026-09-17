-- W1-VAL — VAL-1…VAL-8 EXECUTED against the rehearsal branch. T5's two phone numbers as
-- ranked alternates inside ONE document with their sources, a provenance pointer interned
-- once per save, all four reasons for absence round-tripping distinguishably, an actor
-- outside user/agent/system refused by name, and a version id on every value read.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_t5.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the branch exactly
-- as it found it.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3).
--   · Delete `- '_values' - '_sources'` from `custom.record_values` → J fails: the plain read
--     starts returning the envelope block as if it were one of the record's own values.
--   · Delete the `custom.source_pointer` lookup in `custom.intern_provenance` (mint a new
--     pointer every time) → B fails: two pointers for one source, and the envelope law's own
--     "the same source is written twice" refusal fires.
--   · Widen `custom.value_alternate_keys()` by one word → D fails: a confidence score walks
--     into an alternate and ruling (a) is gone.
--   · Delete the `v_map ? v_word` branch from `custom.actor_word` → F fails: `human` stops
--     being refused with `user` printed and becomes a plain unknown word.
--   · Make `custom.value_versions` return `coalesce(prior,0)+1` unconditionally → G2 fails:
--     re-asserting the same value invents a version nobody wrote.
--   · Drop `record_value_envelope` → H fails.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): the
-- version assertions ask for 1, then 2, then 2 again from the same row; the absence
-- assertions ask for all FOUR words and get four different answers; the actor assertions
-- accept three words and refuse three more, each with a DIFFERENT message. `return expected`
-- survives none of them.
--
-- EVERY REFUSAL IS PAIRED WITH A POSITIVE CONTROL that performs the same write successfully
-- (rule 14), so a refusal proved by a typo would fail its own pair. Its RED twin is
-- `w1_val_red.sql`, which removes this lane's constraint and trigger inside a rolled-back
-- transaction and proves the same writes then LAND.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org       constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_person    uuid;
  v_f_phone   uuid;
  v_f_email   uuid;
  v_f_notes   uuid;
  v_rec       uuid;
  v_rec2      uuid;
  v_rows_before integer;
  v_rows_after  integer;
  v_raw       text;
  v_doc       jsonb;
  v_j         jsonb;
  v_n         integer;
  v_v         integer;
  v_txt       text;
  v_msg       text;
  v_word      text;
  v_i         integer;
  v_fields    jsonb := '[]'::jsonb;
  v_vals      jsonb;
  v_ptr_bytes integer;
  v_interned  integer;
  v_stamped   integer;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_val_t5.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE — a Person table with three fields, declared through the store's
  -- own door, exactly as an organization would declare it.
  -- ══════════════════════════════════════════════════════════════════════════
  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-VAL Person', 'slug', 'w1_val_person', 'type', 'entity',
    'label_singular', 'Person', 'label_plural', 'People',
    'title_field', 'full_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','full_name'), jsonb_build_object('name','phone'),
                                jsonb_build_object('name','email'), jsonb_build_object('name','notes'))
              || (select coalesce(jsonb_agg(jsonb_build_object('name', 'bulk_' || i)), '[]'::jsonb)
                    from generate_series(1, 10) i),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'full_name', 'label', 'Full name', 'type', 'text', 'sort', 10,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'phone', 'label', 'Phone', 'type', 'text', 'sort', 20,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person))
  returning id into v_f_phone;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'email', 'label', 'Email', 'type', 'text', 'sort', 30,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person))
  returning id into v_f_email;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'notes', 'label', 'Notes', 'type', 'text', 'sort', 40,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person))
  returning id into v_f_notes;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. T5 — TWO CHENS. The surviving Person carries BOTH phone numbers, the
  --    second as a ranked alternate, each with the source it came from, INSIDE
  --    ONE DOCUMENT. VAL-1 · VAL-3 · VAL-4.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_rows_before from custom.record where organization_id = v_org;

  v_rec := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'user',
    'full_name', 'Wei Chen',
    'phone', '+1-415-555-0101',
    '_values', jsonb_build_object(
      'phone', jsonb_build_object(
        'src', jsonb_build_object('kind', 'practitioner_record', 'system', 'Meridian Health'),
        'alternates', jsonb_build_array(
          jsonb_build_object('value', '+1-415-555-0102', 'rank', 2,
                             'src', jsonb_build_object('kind', 'employee_record', 'system', 'Vantage HR')))))));

  select count(*) into v_rows_after from custom.record where organization_id = v_org;
  -- NEVER A SEPARATE ROW PER VALUE (VAL-4). One record written, one row. Two values, two
  -- sources, one row. If alternates were rows this would be three or more.
  if v_rows_after - v_rows_before <> 1 then
    raise exception 'VAL-4: writing one record with a value and an alternate added % rows. Alternates live inside the record''s single document, never a row per value.',
                    v_rows_after - v_rows_before;
  end if;

  -- READ THE DOCUMENT RAW — not through a helper that could be hiding the shape.
  select data::text into v_raw from custom.record where organization_id = v_org and id = v_rec;
  if v_raw not like '%+1-415-555-0101%' then
    raise exception 'T5: the surviving phone number is not in the record''s raw document: %', v_raw;
  end if;
  if v_raw not like '%+1-415-555-0102%' then
    raise exception 'T5: the second Chen''s phone number is not in the SAME raw document: %', v_raw;
  end if;
  if v_raw not like '%Meridian Health%' or v_raw not like '%Vantage HR%' then
    raise exception 'T5: each number must carry the source it came from, and the raw document names % ', v_raw;
  end if;

  select data into v_doc from custom.record where organization_id = v_org and id = v_rec;
  -- The two sources are TWO interned entries, and the two values point at one each.
  if (select count(*) from jsonb_object_keys(v_doc -> '_sources')) <> 2 then
    raise exception 'T5: the document holds % interned sources, and the two numbers came from two places',
                    (select count(*) from jsonb_object_keys(v_doc -> '_sources'));
  end if;
  if (v_doc -> '_sources' -> (v_doc -> '_values' -> 'phone' ->> 'src') ->> 'system') <> 'Meridian Health' then
    raise exception 'T5: the surviving number points at %, and it came from the practitioner record',
                    v_doc -> '_sources' -> (v_doc -> '_values' -> 'phone' ->> 'src');
  end if;
  if (v_doc -> '_sources' -> (v_doc -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'src') ->> 'system') <> 'Vantage HR' then
    raise exception 'T5: the alternate points at %, and it came from the employee record',
                    v_doc -> '_sources' -> (v_doc -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'src');
  end if;
  if (v_doc -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'rank')::int <> 2 then
    raise exception 'T5: the alternate''s rank is %, and the surviving value ranks first', v_doc -> '_values' -> 'phone' -> 'alternates' -> 0 ->> 'rank';
  end if;

  -- THE SAME TWO NUMBERS, THROUGH THE READ a merge field uses.
  select value, alternates, value_version into v_j, v_vals, v_v
    from custom.value_read(v_org, v_rec, 'phone');
  if v_j <> to_jsonb('+1-415-555-0101'::text) then
    raise exception 'T5: the read returns % as the phone number', v_j;
  end if;
  if jsonb_array_length(v_vals) <> 1
     or (v_vals -> 0 -> 'value') <> to_jsonb('+1-415-555-0102'::text)
     or (v_vals -> 0 -> 'source' ->> 'system') <> 'Vantage HR' then
    raise exception 'T5: the read returns % as the other candidate', v_vals;
  end if;
  if v_v <> 1 then raise exception 'DYN-8: a first write is version %, and it is 1', v_v; end if;
  raise notice 'A. T5 — one row, two numbers, two sources, one document. Raw bytes: %', length(v_raw);

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. VAL-1 — INTERNED ONCE PER SAVE. Ten fields, ONE source. Measured here and
  --    printed, never quoted from a cell.
  -- ══════════════════════════════════════════════════════════════════════════
  for v_i in 1..10 loop
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
      'key', 'bulk_' || v_i, 'label', 'Bulk ' || v_i, 'type', 'text', 'sort', 100 + v_i,
      'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_person));
  end loop;

  v_doc := jsonb_build_object('_actor', 'system');
  v_j   := '{}'::jsonb;
  for v_i in 1..10 loop
    v_doc := v_doc || jsonb_build_object('bulk_' || v_i, 'value ' || v_i);
    v_j   := v_j || jsonb_build_object('bulk_' || v_i, jsonb_build_object(
               'src', jsonb_build_object('kind', 'import', 'file', 'chen-2026-09.csv')));
  end loop;
  v_rec2 := custom.record_write(v_org, v_person, v_doc || jsonb_build_object('_values', v_j));

  select data into v_doc from custom.record where organization_id = v_org and id = v_rec2;
  v_interned := (select count(*) from jsonb_object_keys(v_doc -> '_sources'));
  if v_interned <> 1 then
    raise exception 'VAL-1: ten values from ONE source interned % descriptions. "Interned once per save" is the whole claim.', v_interned;
  end if;
  -- Every one of the ten points at that one entry.
  if (select count(*) from jsonb_each(v_doc -> '_values') e
       where e.value ->> 'src' = (select k from jsonb_object_keys(v_doc -> '_sources') k)) <> 10 then
    raise exception 'VAL-1: the ten values do not all point at the one interned source';
  end if;
  v_ptr_bytes := length((v_doc -> '_values' -> 'bulk_1' ->> 'src')) + length('"src":""');
  raise notice 'B. VAL-1 — 10 values, 1 interned source. Pointer % bytes; document % bytes; the same document with the description stamped on every value would be % bytes.',
    v_ptr_bytes,
    length(v_doc::text),
    length((select jsonb_object_agg(e.key, (e.value - 'src')
              || jsonb_build_object('src', v_doc -> '_sources' -> (e.value ->> 'src')))
              from jsonb_each(v_doc -> '_values') e)::text)
      + length((v_doc - '_values' - '_sources')::text);

  -- Interning is IDEMPOTENT: re-saving the already-interned document mints nothing.
  update custom.record set data = v_doc where organization_id = v_org and id = v_rec2;
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec2;
  if (select count(*) from jsonb_object_keys(v_doc -> '_sources')) <> 1 then
    raise exception 'VAL-1: re-saving an interned document minted a second pointer';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. VAL-2 — ALL FOUR REASONS FOR ABSENCE, each round-tripping as itself.
  -- ══════════════════════════════════════════════════════════════════════════
  foreach v_word in array custom.absence_reasons() loop
    update custom.record
       set data = (data - 'email') || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values',
                       coalesce(data -> '_values', '{}'::jsonb)
                       || jsonb_build_object('email', jsonb_build_object('absent', v_word)))
     where organization_id = v_org and id = v_rec;

    select absent_reason, value into v_txt, v_j from custom.value_read(v_org, v_rec, 'email');
    if v_txt is distinct from v_word then
      raise exception 'VAL-2: "%" was written as the reason the email is missing and "%" came back. Every one of the four is distinguishable or none of them is.', v_word, v_txt;
    end if;
    if v_j is not null then
      raise exception 'VAL-2: the email is said to be missing ("%") and the read still returns %', v_word, v_j;
    end if;
  end loop;
  -- The four are FOUR, not one word four times.
  if (select count(distinct x) from unnest(custom.absence_reasons()) x) <> 4 then
    raise exception 'VAL-2: the vocabulary is not four distinct words';
  end if;

  -- A word outside the four is refused BY NAME, and the four are printed.
  begin
    update custom.record
       set data = (data - 'notes') || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values',
                       coalesce(data -> '_values', '{}'::jsonb)
                       || jsonb_build_object('notes', jsonb_build_object('absent', 'dunno')))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-2: "dunno" was accepted as a reason a value is missing';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%dunno%' or v_msg not like '%never asked%' then
      raise exception 'VAL-2: the refusal must name what was offered and list the four reasons, and it said: %', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL (rule 14): the same write with a legal word LANDS.
  update custom.record
     set data = (data - 'notes') || jsonb_build_object('_actor', 'user')
                || jsonb_build_object('_values',
                     coalesce(data -> '_values', '{}'::jsonb)
                     || jsonb_build_object('notes', jsonb_build_object('absent', 'refused')))
   where organization_id = v_org and id = v_rec;
  select absent_reason into v_txt from custom.value_read(v_org, v_rec, 'notes');
  if v_txt <> 'refused' then raise exception 'VAL-2: the positive control did not land (%)', v_txt; end if;
  raise notice 'C. VAL-2 — all four reasons round-trip, a fifth is refused naming it, the control lands.';

  -- A value CANNOT both be present and be missing.
  begin
    update custom.record
       set data = data || jsonb_build_object('notes', 'something')
                  || jsonb_build_object('_actor', 'user')
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-2: a value that is both written and said to be missing was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%both holds a value%' then
      raise exception 'VAL-2: wrong refusal for present-and-absent: %', v_msg;
    end if;
  end;
  -- Clear the contradiction so the rest of the suite writes a legal document.
  update custom.record
     set data = (data - 'notes') || jsonb_build_object('_actor', 'user')
                || jsonb_build_object('_values', (data -> '_values') - 'notes')
   where organization_id = v_org and id = v_rec;

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. VAL-3 under ruling (a) — A RANK, NEVER A CONFIDENCE.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'phone', (data -> '_values' -> 'phone') || jsonb_build_object('alternates',
                         jsonb_build_array(jsonb_build_object(
                           'value', '+1-415-555-0102', 'rank', 2, 'confidence', 0.82)))))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-3/D-3: a confidence score was accepted inside an alternate';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%confidence%' or v_msg not like '%rank%' then
      raise exception 'VAL-3/D-3: the refusal must name the word it refused and say what an alternate holds, and it said: %', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL: the same alternate without the score LANDS.
  update custom.record
     set data = data || jsonb_build_object('_actor', 'user')
                || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                     'phone', (data -> '_values' -> 'phone') || jsonb_build_object('alternates',
                       jsonb_build_array(jsonb_build_object('value', '+1-415-555-0102', 'rank', 2)))))
   where organization_id = v_org and id = v_rec;

  -- A rank is an ORDER, so two candidates cannot hold the same one.
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'phone', (data -> '_values' -> 'phone') || jsonb_build_object('alternates',
                         jsonb_build_array(jsonb_build_object('value', '+1-415-555-0102', 'rank', 2),
                                           jsonb_build_object('value', '+1-415-555-0103', 'rank', 2)))))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-3: two alternates claiming rank 2 were accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%rank 2%' then raise exception 'VAL-3: wrong refusal for a duplicate rank: %', v_msg; end if;
  end;
  -- PAIRED POSITIVE CONTROL: distinct ranks LAND, and BOTH come back ordered.
  update custom.record
     set data = data || jsonb_build_object('_actor', 'user')
                || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                     'phone', (data -> '_values' -> 'phone') || jsonb_build_object('alternates',
                       jsonb_build_array(jsonb_build_object('value', '+1-415-555-0103', 'rank', 3),
                                         jsonb_build_object('value', '+1-415-555-0102', 'rank', 2)))))
   where organization_id = v_org and id = v_rec;
  select alternates into v_vals from custom.value_read(v_org, v_rec, 'phone');
  if jsonb_array_length(v_vals) <> 2
     or (v_vals -> 0 ->> 'rank') <> '2' or (v_vals -> 1 ->> 'rank') <> '3' then
    raise exception 'VAL-3: the alternates do not come back in rank order: %', v_vals;
  end if;
  raise notice 'D. VAL-3 — a confidence is refused by name, a duplicate rank is refused, two ranked alternates land in order.';

  -- An alternate is a candidate for the SAME field, so it is the same kind of value.
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'phone', (data -> '_values' -> 'phone') || jsonb_build_object('alternates',
                         jsonb_build_array(jsonb_build_object('value', jsonb_build_array('a','b'), 'rank', 2)))))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-3: a list was accepted as an alternate for a single-value field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%one value%' then raise exception 'VAL-3: wrong refusal for an unpromotable alternate: %', v_msg; end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. VAL-5 / VAL-6 — VISIBILITY AND ACCESS ARE NEVER PER VALUE.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'phone', (data -> '_values' -> 'phone') || jsonb_build_object('visibility', 'private')))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-5: a per-value visibility was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%visibility%' or v_msg not like '%contained record%' then
      raise exception 'VAL-5/VAL-6: the refusal must name the word and print the remedy — a value that must be secret goes in a contained record with its own visibility. It said: %', v_msg;
    end if;
  end;
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'phone', (data -> '_values' -> 'phone') || jsonb_build_object('secret', true)))
     where organization_id = v_org and id = v_rec;
    raise exception 'VAL-6: a per-value secret flag was accepted';
  exception when check_violation then null;
  end;
  -- PAIRED POSITIVE CONTROL: the record's OWN visibility is where the word lives, and it moves.
  update custom.record set visibility = 'personal', data = data || jsonb_build_object('_actor', 'user')
   where organization_id = v_org and id = v_rec;
  select count(*) into v_n from custom.record
   where organization_id = v_org and id = v_rec and visibility = 'personal';
  if v_n <> 1 then raise exception 'VAL-5: the record''s own visibility did not move'; end if;
  update custom.record set visibility = 'internal' where organization_id = v_org and id = v_rec;
  raise notice 'E. VAL-5/VAL-6 — visibility and a secret flag are refused inside a value, and the record''s own visibility still moves.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. VAL-7 / VAL-8 — THE ACTOR VOCABULARY, ENFORCED AT THE DOOR.
  -- ══════════════════════════════════════════════════════════════════════════
  -- All three legal words LAND, through the one door, and each reads back as itself.
  foreach v_word in array custom.actor_vocabulary() loop
    v_rec2 := custom.record_write(v_org, v_person, jsonb_build_object(
      '_actor', v_word,
      '_on_behalf_of', case when v_word = 'agent' then '39c38960-d30c-4840-b0c1-c9960de95583' end,
      'full_name', 'Actor ' || v_word,
      'phone', '+1-415-555-0200',
      '_values', jsonb_build_object('phone', jsonb_build_object(
        'src', jsonb_build_object('kind', 'typed_in')))));
    select actor, on_behalf_of into v_txt, v_msg from custom.value_read(v_org, v_rec2, 'phone');
    if v_txt <> v_word then
      raise exception 'VAL-8: the write declared % and the value says %', v_word, v_txt;
    end if;
    if v_word = 'agent' and v_msg is null then
      raise exception 'VAL-8: an agent write carries who it acted for, and this one carries nothing';
    end if;
    if v_word <> 'agent' and v_msg is not null then
      raise exception 'VAL-8: a % write carries on-behalf-of %, and only an agent acts for somebody', v_word, v_msg;
    end if;
  end loop;

  -- A word outside the three is refused BY NAME, at the door.
  begin
    perform custom.record_write(v_org, v_person, jsonb_build_object(
      '_actor', 'robot', 'full_name', 'Nope',
      '_values', jsonb_build_object('full_name', jsonb_build_object())));
    raise exception 'VAL-8: "robot" was accepted as an author';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%robot%' or v_msg not like '%user, agent, system%' then
      raise exception 'VAL-8: the refusal must name what was offered and the vocabulary, and it said: %', v_msg;
    end if;
  end;

  -- The THREE RETIRED WORDS are refused with the replacement PRINTED — ruling (c).
  foreach v_word in array array['human', 'ai', 'code'] loop
    begin
      perform custom.record_write(v_org, v_person, jsonb_build_object(
        '_actor', v_word, 'full_name', 'Nope',
        '_values', jsonb_build_object('full_name', jsonb_build_object())));
      raise exception 'VAL-9(c): the retired word "%" was accepted as an author', v_word;
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%' || v_word || '%'
         or v_msg not like '%' || (custom.retired_actor_words() ->> v_word) || '%' then
        raise exception 'VAL-9(c): refusing "%" must print "%" as the word to use instead, and it said: %',
                        v_word, custom.retired_actor_words() ->> v_word, v_msg;
      end if;
    end;
  end loop;

  -- On behalf of somebody, without being an agent, is refused.
  begin
    perform custom.record_write(v_org, v_person, jsonb_build_object(
      '_actor', 'user', '_on_behalf_of', '39c38960-d30c-4840-b0c1-c9960de95583',
      'full_name', 'Nope', '_values', jsonb_build_object('full_name', jsonb_build_object())));
    raise exception 'VAL-8: a user write on behalf of somebody else was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Only an agent%' then
      raise exception 'VAL-8: wrong refusal for on-behalf-of on a non-agent write: %', v_msg;
    end if;
  end;

  -- NOBODY CHOOSES AN AUTHOR. A caller that stamps a different actor into the envelope gets
  -- the truth of its own write back, not the one it typed.
  v_rec2 := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'system', 'full_name', 'Forged',
    'phone', '+1-415-555-0300',
    '_values', jsonb_build_object('phone', jsonb_build_object('actor', 'user', 'ver', 99))));
  select actor, value_version into v_txt, v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_txt <> 'system' then
    raise exception 'VAL-8: a caller chose its own author and the store believed it (%)', v_txt;
  end if;
  if v_v <> 1 then
    raise exception 'DYN-8: a caller wrote version 99 into a first write and the store kept % ', v_v;
  end if;
  raise notice 'F. VAL-7/VAL-8 — three words land, three retired words are refused naming the replacement, "robot" is refused, a forged author and a forged version do not survive.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. THE VERSION ID — readable on every read, and it moves only when the
  --    VALUE moves. Three readings of the same row: 1, then 2, then 2.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec2 := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'user', 'full_name', 'Versioned', 'phone', '+1-415-555-0400',
    '_values', jsonb_build_object('phone', jsonb_build_object('src', jsonb_build_object('kind', 'typed_in')))));
  select value_version into v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_v <> 1 then raise exception 'DYN-8 (G1): a first write is version %, expected 1', v_v; end if;

  update custom.record set data = data || jsonb_build_object('phone', '+1-415-555-0401')
                                       || jsonb_build_object('_actor', 'user')
   where organization_id = v_org and id = v_rec2;
  select value_version into v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_v <> 2 then raise exception 'DYN-8 (G2): the value changed and the version is %, expected 2', v_v; end if;

  -- The SAME value, asserted again, by a DIFFERENT actor. Not a new version of anything.
  update custom.record set data = data || jsonb_build_object('_actor', 'agent')
                                       || jsonb_build_object('_on_behalf_of', '39c38960-d30c-4840-b0c1-c9960de95583')
   where organization_id = v_org and id = v_rec2;
  select value_version, actor into v_v, v_txt from custom.value_read(v_org, v_rec2, 'phone');
  if v_v <> 2 then raise exception 'DYN-8 (G3): the same value re-asserted is version %, expected 2', v_v; end if;
  if v_txt <> 'agent' then raise exception 'VAL-7 (G3): the re-assertion''s author is %, expected agent', v_txt; end if;

  -- EVERY value read carries one. Not one endpoint — the read.
  if exists (select 1 from custom.record_values_versioned(v_org, v_rec2) where value_version is null) then
    raise exception 'DYN-8: a value came back with no version id';
  end if;
  if (select count(*) from custom.record_values_versioned(v_org, v_rec2)) < 2 then
    raise exception 'DYN-8: the versioned read returned fewer values than the record holds';
  end if;
  raise notice 'G. DYN-8 — version 1, then 2 on a change, then still 2 on a re-assertion by another actor; every value read carries one.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- H. THE ENVELOPE CHECK CONSTRAINT — this lane's production clause, on the branch.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from pg_constraint
   where conname = 'record_value_envelope' and contype = 'c'
     and conrelid in (select inhrelid from pg_inherits where inhparent = 'custom.record'::regclass)
  ;
  if v_n <> 16 then
    raise exception 'the envelope constraint is on % of the sixteen partitions', v_n;
  end if;
  select count(*) into v_n from pg_constraint
   where conname = 'record_value_envelope' and contype = 'c' and conrelid = 'custom.record'::regclass;
  if v_n <> 1 then raise exception 'the envelope constraint is not on custom.record itself'; end if;
  raise notice 'H. record_value_envelope is in pg_constraint on custom.record and on all 16 partitions.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THE PLAIN READ DOES NOT LEAK THE ENVELOPE.
  -- ══════════════════════════════════════════════════════════════════════════
  v_j := custom.record_values(v_org, v_rec);
  if v_j ? '_values' or v_j ? '_sources' then
    raise exception 'the plain read returns the envelope block as if it were one of the record''s own values: %',
                    (select array_agg(k) from jsonb_object_keys(v_j) k);
  end if;
  if not (v_j ? 'phone') then
    raise exception 'the plain read lost the record''s actual values: %', v_j;
  end if;
  raise notice 'J. custom.record_values returns the record''s values and not the envelope.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- K. AN ENVELOPE FOR A FIELD NOBODY DECLARED is provenance nobody can read.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update custom.record
       set data = data || jsonb_build_object('_actor', 'user')
                  || jsonb_build_object('_values', (data -> '_values') || jsonb_build_object(
                       'fax', jsonb_build_object('absent', 'none')))
     where organization_id = v_org and id = v_rec;
    raise exception 'an envelope for an undeclared field was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%fax%' then
      raise exception 'the refusal for an undeclared envelope key must name it, and it said: %', v_msg;
    end if;
  end;
  raise notice 'K. an envelope for a field this table does not declare is refused, naming it.';

  raise notice '=== W1-VAL — VAL-1..VAL-8 all executed on the branch, and this transaction rolls back. ===';
end;
$t$;

rollback;
