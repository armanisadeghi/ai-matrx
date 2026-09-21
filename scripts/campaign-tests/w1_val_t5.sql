-- W1-VAL — VAL-1…VAL-8 EXECUTED against the MAIN database. T5's two phone numbers as
-- ranked alternates inside ONE document with their sources, a provenance pointer interned
-- once per save, all four reasons for absence round-tripping distinguishably, an actor
-- outside user/agent/system refused by name, and a version id on every value read.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_t5.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered
-- by no sweep, and its single transaction ends in ROLLBACK, so it leaves the database exactly
-- as it found it. Everything it makes — one disposable organization, its Home, its Table, its
-- Fields, its records and one knob override — disappears with it.
--
-- 🚨 THE MAIN DATABASE (SEAT-SUITES, 2026-09-19). This file used to refuse to run anywhere
-- but the rehearsal branch. That branch carries 226 of schema `custom`'s 332 functions, grants
-- `authenticated` 29 of the 103 it holds on main, and has no `custom.field_declare` — the door
-- a person adds a column with — at all, so the store these clauses are about is not there. The
-- owner's 2026-09-18 ruling is that there is no production and everything is the main database.
--
-- 🚨 THE SEAT (SEAT-SUITES, 2026-09-19). Every clause used to run as the role that OWNS
-- `custom.record`, reading and writing the table directly. In that seat
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing, and the STORED document is what
-- gets asserted — a shape no screen has ever seen. It now takes the seat `authenticated` in
-- PART 0 and asks every clause through the door a signed-in person reaches:
--   · `update custom.record set data = …`      →  `custom.record_update`
--   · `select data from custom.record …`       →  `custom.read_record` (the door's own shape:
--       it resolves the interned pointer and hands back `_alternates`, and it never returns
--       `_values` or `_sources`)
--   · `custom.record_values`                   →  `custom.read_record` (no client grant on the
--       former; the read door IS the plain read)
--   · the Field rows it INSERTed                →  `custom.field_declare`
--   · counting the table's rows                 →  `custom.read_records`
-- There is not one table privilege on anything in schema `custom` for `authenticated`, so
-- every read below is a function or it does not happen. The three vocabularies
-- (`custom.absence_reasons`, `custom.actor_vocabulary`, `custom.retired_actor_words`) carry no
-- client grant either — a real gap, reported, not papered over — so they are READ as the
-- connected role, which asserts nothing, and every write that uses them is made from the seat.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGES, NAMED (rule 3).
--   · Delete `- '_values' - '_sources'` from the read door → J fails: the plain read starts
--     returning the envelope block as if it were one of the record's own values.
--   · Delete the `custom.source_pointer` lookup in `custom.intern_provenance` (mint a new
--     pointer every time) → B fails: ten values stop naming one source.
--   · Widen `custom.value_alternate_keys()` by one word → D fails: a confidence score walks
--     into an alternate and ruling (a) is gone.
--   · Delete the `v_map ? v_word` branch from `custom.actor_word` → F fails: `human` stops
--     being refused with `user` printed and becomes a plain unknown word.
--   · Make `custom.value_versions` return `coalesce(prior,0)+1` unconditionally → G3 fails:
--     re-asserting the same value invents a version nobody wrote.
--   · Drop `record_value_envelope` → H fails.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE, everywhere it could matter (rule 3): the
-- version assertions ask for 1, then 2, then 2 again from the same row; every refusal is
-- paired with the same write made legal, which LANDS; and PART 5 asks the same doors as
-- test@test.com, who is refused, with one control she can do.
--
-- THE IDENTITIES. admin@admin.com owns the disposable organization, test@test.com is a member
-- of it. It signs nobody in and reads no credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_obo     constant text := '39c38960-d30c-4840-b0c1-c9960de95583';
  v_org       uuid := gen_random_uuid();
  v_home      uuid;
  v_person    uuid;
  v_rec       uuid;
  v_rec2      uuid;
  v_rows_before integer;
  v_rows_after  integer;
  v_doc       jsonb;
  v_j         jsonb;
  v_vals      jsonb;
  v_src       jsonb;
  v_n         integer;
  v_v         integer;
  v_txt       text;
  v_msg       text;
  v_word      text;
  v_i         integer;
  v_caught    text;
  v_absence   text[];
  v_actors    text[];
  v_retired   jsonb;
  v_boss      text := current_user;   -- the connected role, for the reads no client door covers
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'w1_val_t5.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;

  -- WHO IS WRITING. `platform.associations` refuses an automated write that does not name the
  -- system doing it, and the store reaches that table through its containment triggers.
  perform set_config('app.actor_system', 'campaign-test/w1_val_t5', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- THE THREE VOCABULARIES, read as the connected role because no client grant reaches them.
  -- Nothing about the product is asserted here; every write that uses these words is made from
  -- the seat, below.
  v_absence := custom.absence_reasons();
  v_actors  := custom.actor_vocabulary();
  v_retired := custom.retired_actor_words();

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Ridgeline Physical Therapy', 'ridgeline-physical-therapy-' || substr(v_org::text, 1, 8), 'RPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_val_t5');
  -- A Home has no client door of its own.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Ridgeline Physical Therapy — Clinic'))
  returning id into v_home;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE — a Person table with four fields and ten more, declared AND
  -- DEFINED through the store's own doors, exactly as an organization would.
  -- ══════════════════════════════════════════════════════════════════════════
  v_person := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Patients', 'slug', 'patients', 'type', 'entity',
    'label_singular', 'Patient', 'label_plural', 'Patients',
    'title_field', 'full_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','full_name'), jsonb_build_object('name','phone'),
                                jsonb_build_object('name','email'), jsonb_build_object('name','notes')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','full_name','label','Full name','plain','text'));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','phone','label','Phone','plain','text'));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','email','label','Email','plain','text'));
  perform custom.field_declare(v_org, v_person, jsonb_build_object('key','notes','label','Notes','plain','text'));
  for v_i in 1..10 loop
    perform custom.field_declare(v_org, v_person,
      jsonb_build_object('key','bulk_' || v_i, 'label','Bulk ' || v_i, 'plain','text'));
  end loop;

  -- ══════════════════════════════════════════════════════════════════════════
  -- A. T5 — TWO CHENS. The surviving Person carries BOTH phone numbers, the
  --    second as a ranked alternate, each with the source it came from, INSIDE
  --    ONE DOCUMENT. VAL-1 · VAL-3 · VAL-4.
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_rows_before from custom.read_records(v_org, v_person, true, 500, 0);

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

  select count(*) into v_rows_after from custom.read_records(v_org, v_person, true, 500, 0);
  -- NEVER A SEPARATE ROW PER VALUE (VAL-4). One record written, one row the read door hands
  -- back. Two values, two sources, one row. If alternates were rows this would be three.
  if v_rows_after - v_rows_before <> 1 then
    raise exception 'VAL-4: writing one record with a value and an alternate added % records to the table. Alternates live inside the record''s single document, never a row per value.',
                    v_rows_after - v_rows_before;
  end if;

  -- THE DOOR'S OWN SHAPE, which is what a person is shown: `custom.read_record` resolves the
  -- interned pointer and hands back `_alternates -> <key>` as a ranked list carrying the
  -- SOURCE. The old suite read `custom.record.data::text` and asserted the STORED shape
  -- (`_values`, `_sources`, `src`), which needs a table privilege no person holds.
  v_doc := custom.read_record(v_org, v_rec, true);
  if (v_doc ->> 'phone') <> '+1-415-555-0101' then
    raise exception 'T5: the surviving phone number is not what the read door hands back: %', v_doc;
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> '_alternates' -> 'phone','[]'::jsonb)) x
                  where x -> 'value' = '"+1-415-555-0102"'::jsonb
                    and (x ->> 'rank')::int = 2
                    and (x -> 'source' ->> 'system') = 'Vantage HR') then
    raise exception 'T5: the second Chen''s number is not a ranked alternate naming where it came from, in the SAME document: %', v_doc;
  end if;

  -- THE SAME TWO NUMBERS, THROUGH THE READ a merge field uses.
  select value, alternates, value_version, source into v_j, v_vals, v_v, v_src
    from custom.value_read(v_org, v_rec, 'phone');
  if v_j <> to_jsonb('+1-415-555-0101'::text) then
    raise exception 'T5: the read returns % as the phone number', v_j;
  end if;
  if (v_src ->> 'system') <> 'Meridian Health' then
    raise exception 'T5: the surviving number came from the practitioner record and the door says %', v_src;
  end if;
  if jsonb_array_length(v_vals) <> 1
     or (v_vals -> 0 -> 'value') <> to_jsonb('+1-415-555-0102'::text)
     or (v_vals -> 0 -> 'source' ->> 'system') <> 'Vantage HR' then
    raise exception 'T5: the read returns % as the other candidate', v_vals;
  end if;
  if v_v <> 1 then raise exception 'DYN-8: a first write is version %, and it is 1', v_v; end if;
  raise notice 'A. T5 — one record, two numbers, two sources, one document, all of it out of the doors a person has.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- B. VAL-1 — INTERNED ONCE PER SAVE. Ten fields, ONE source. Measured here and
  --    printed, never quoted from a cell.
  -- ══════════════════════════════════════════════════════════════════════════
  v_doc := jsonb_build_object('_actor', 'system', 'full_name', 'Bulk Chen');
  v_j   := '{}'::jsonb;
  for v_i in 1..10 loop
    v_doc := v_doc || jsonb_build_object('bulk_' || v_i, 'value ' || v_i);
    v_j   := v_j || jsonb_build_object('bulk_' || v_i, jsonb_build_object(
               'src', jsonb_build_object('kind', 'import', 'file', 'chen-2026-09.csv')));
  end loop;
  v_rec2 := custom.record_write(v_org, v_person, v_doc || jsonb_build_object('_values', v_j));

  -- THE DOOR'S ANSWER: ten values, and the description each one names is ONE description.
  select count(distinct source::text) into v_n
    from custom.record_values_versioned(v_org, v_rec2) where field_key like 'bulk\_%';
  if v_n <> 1 then
    raise exception 'VAL-1: ten values from ONE source name % different descriptions through the read door. "Interned once per save" is the whole claim.', v_n;
  end if;
  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec2)
   where field_key like 'bulk\_%' and source ->> 'file' = 'chen-2026-09.csv';
  if v_n <> 10 then
    raise exception 'VAL-1: % of the ten values name the file they came from', v_n;
  end if;

  -- What interning BUYS is a storage fact the doors do not expose, so it is measured as the
  -- connected role, printed, and asserted on by nothing.
  perform set_config('role', v_boss, true);
  select data into v_doc from custom.record where organization_id = v_org and id = v_rec2;
  raise notice 'B. VAL-1 — 10 values, 1 interned source. Pointer % bytes; document % bytes; the same document with the description stamped on every value would be % bytes.',
    length((v_doc -> '_values' -> 'bulk_1' ->> 'src')) + length('"src":""'),
    length(v_doc::text),
    length((select jsonb_object_agg(e.key, (e.value - 'src')
              || jsonb_build_object('src', v_doc -> '_sources' -> (e.value ->> 'src')))
              from jsonb_each(v_doc -> '_values') e)::text)
      + length((v_doc - '_values' - '_sources')::text);
  perform set_config('role', 'authenticated', true);

  -- Interning is IDEMPOTENT: re-saving through the door mints nothing new.
  perform custom.record_update(v_org, v_rec2, jsonb_build_object('_actor','system','full_name','Bulk Chen'));
  select count(distinct source::text) into v_n
    from custom.record_values_versioned(v_org, v_rec2) where field_key like 'bulk\_%';
  if v_n <> 1 then
    raise exception 'VAL-1: re-saving an interned document minted a second description (% now)', v_n;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- C. VAL-2 — ALL FOUR REASONS FOR ABSENCE, each round-tripping as itself.
  -- ══════════════════════════════════════════════════════════════════════════
  foreach v_word in array v_absence loop
    perform custom.record_update(v_org, v_rec, jsonb_build_object(
      '_actor', 'user', 'email', null,
      '_values', jsonb_build_object('email', jsonb_build_object('absent', v_word))));
    select absent_reason, value into v_txt, v_j from custom.value_read(v_org, v_rec, 'email');
    if v_txt is distinct from v_word then
      raise exception 'VAL-2: "%" was written as the reason the email is missing and "%" came back. Every one of the four is distinguishable or none of them is.', v_word, v_txt;
    end if;
    -- "no value" out of the read door is SQL null or the JSON word null, and never a value:
    -- clearing a key through `custom.record_update` leaves `email: null` in the document
    -- rather than taking the key out, which is the shape the door hands back.
    if coalesce(v_j, 'null'::jsonb) <> 'null'::jsonb then
      raise exception 'VAL-2: the email is said to be missing ("%") and the read still returns %', v_word, v_j;
    end if;
  end loop;
  if (select count(distinct x) from unnest(v_absence) x) <> 4 then
    raise exception 'VAL-2: the vocabulary is not four distinct words';
  end if;

  -- A word outside the four is refused BY NAME, at the door, and the four are printed.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object(
      '_actor', 'user', 'notes', null,
      '_values', jsonb_build_object('notes', jsonb_build_object('absent', 'dunno'))));
    raise exception 'VAL-2: "dunno" was accepted as a reason a value is missing';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%dunno%' or v_msg not like '%never asked%' then
      raise exception 'VAL-2: the refusal must name what was offered and list the four reasons, and it said: %', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL (rule 14): the same write with a legal word LANDS.
  perform custom.record_update(v_org, v_rec, jsonb_build_object(
    '_actor', 'user', 'notes', null,
    '_values', jsonb_build_object('notes', jsonb_build_object('absent', 'refused'))));
  select absent_reason into v_txt from custom.value_read(v_org, v_rec, 'notes');
  if v_txt <> 'refused' then raise exception 'VAL-2: the positive control did not land (%)', v_txt; end if;
  raise notice 'C. VAL-2 — all four reasons round-trip through the write and read doors, a fifth is refused naming it, the control lands.';

  -- A value CANNOT both be present and be missing.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user','notes','something'));
    raise exception 'VAL-2: a value that is both written and said to be missing was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%both holds a value%' then
      raise exception 'VAL-2: wrong refusal for present-and-absent: %', v_msg;
    end if;
  end;
  -- Nothing to clear: the contradictory write was REFUSED, so the document still says the
  -- notes are missing because they were refused, and the `_values` the clauses below hand the
  -- door replaces that block wholesale — which is what `data || patch` means at the top level.

  -- ══════════════════════════════════════════════════════════════════════════
  -- D. VAL-3 under ruling (a) — A RANK, NEVER A CONFIDENCE.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('phone', jsonb_build_object('alternates',
        jsonb_build_array(jsonb_build_object('value','+1-415-555-0102','rank',2,'confidence',0.82))))));
    raise exception 'VAL-3/D-3: a confidence score was accepted inside an alternate';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%confidence%' or v_msg not like '%rank%' then
      raise exception 'VAL-3/D-3: the refusal must name the word it refused and say what an alternate holds, and it said: %', v_msg;
    end if;
  end;
  -- PAIRED POSITIVE CONTROL: the same alternate without the score LANDS.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
    '_values', jsonb_build_object('phone', jsonb_build_object('alternates',
      jsonb_build_array(jsonb_build_object('value','+1-415-555-0102','rank',2))))));

  -- A rank is an ORDER, so two candidates cannot hold the same one.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('phone', jsonb_build_object('alternates',
        jsonb_build_array(jsonb_build_object('value','+1-415-555-0102','rank',2),
                          jsonb_build_object('value','+1-415-555-0103','rank',2))))));
    raise exception 'VAL-3: two alternates claiming rank 2 were accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%rank 2%' then raise exception 'VAL-3: wrong refusal for a duplicate rank: %', v_msg; end if;
  end;
  -- PAIRED POSITIVE CONTROL: distinct ranks LAND, and BOTH come back ordered.
  perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
    '_values', jsonb_build_object('phone', jsonb_build_object('alternates',
      jsonb_build_array(jsonb_build_object('value','+1-415-555-0103','rank',3),
                        jsonb_build_object('value','+1-415-555-0102','rank',2))))));
  select alternates into v_vals from custom.value_read(v_org, v_rec, 'phone');
  if jsonb_array_length(v_vals) <> 2
     or (v_vals -> 0 ->> 'rank') <> '2' or (v_vals -> 1 ->> 'rank') <> '3' then
    raise exception 'VAL-3: the alternates do not come back in rank order: %', v_vals;
  end if;
  raise notice 'D. VAL-3 — a confidence is refused by name, a duplicate rank is refused, two ranked alternates land in order.';

  -- An alternate is a candidate for the SAME field, so it is the same kind of value.
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('phone', jsonb_build_object('alternates',
        jsonb_build_array(jsonb_build_object('value', jsonb_build_array('a','b'), 'rank', 2))))));
    raise exception 'VAL-3: a list was accepted as an alternate for a single-value field';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%one value%' then raise exception 'VAL-3: wrong refusal for an unpromotable alternate: %', v_msg; end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- E. VAL-5 / VAL-6 — VISIBILITY AND ACCESS ARE NEVER PER VALUE.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('phone', jsonb_build_object('visibility','private'))));
    raise exception 'VAL-5: a per-value visibility was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%visibility%' or v_msg not like '%contained record%' then
      raise exception 'VAL-5/VAL-6: the refusal must name the word and print the remedy — a value that must be secret goes in a contained record with its own visibility. It said: %', v_msg;
    end if;
  end;
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('phone', jsonb_build_object('secret', true))));
    raise exception 'VAL-6: a per-value secret flag was accepted';
  exception when check_violation then null;
  end;
  -- PAIRED POSITIVE CONTROL: the record's OWN visibility is where the word lives, and a person
  -- moves it through the sharing door, not by writing a column.
  v_j := custom.share_lane_set(v_org, v_rec, 'mine');
  if (v_j ->> 'lane') is distinct from 'mine' then
    raise exception 'VAL-5: the record''s own visibility lane did not move through the sharing door: %', v_j;
  end if;
  -- and BACK, so the clause is not one door that answers the same word whatever it is asked.
  v_j := custom.share_lane_set(v_org, v_rec, 'organization');
  if (v_j ->> 'lane') is distinct from 'organization' then
    raise exception 'VAL-5: the sharing door answers "%" whatever lane it is given', v_j ->> 'lane';
  end if;
  raise notice 'E. VAL-5/VAL-6 — visibility and a secret flag are refused inside a value, and the record''s own lane still moves through the sharing door.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- F. VAL-7 / VAL-8 — THE ACTOR VOCABULARY, ENFORCED AT THE DOOR.
  -- ══════════════════════════════════════════════════════════════════════════
  foreach v_word in array v_actors loop
    v_rec2 := custom.record_write(v_org, v_person, jsonb_build_object(
      '_actor', v_word,
      '_on_behalf_of', case when v_word = 'agent' then c_obo end,
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
      '_actor', 'robot', 'full_name', 'Nope'));
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
        '_actor', v_word, 'full_name', 'Nope'));
      raise exception 'VAL-9(c): the retired word "%" was accepted as an author', v_word;
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%' || v_word || '%'
         or v_msg not like '%' || (v_retired ->> v_word) || '%' then
        raise exception 'VAL-9(c): refusing "%" must print "%" as the word to use instead, and it said: %',
                        v_word, v_retired ->> v_word, v_msg;
      end if;
    end;
  end loop;

  -- On behalf of somebody, without being an agent, is refused.
  begin
    perform custom.record_write(v_org, v_person, jsonb_build_object(
      '_actor', 'user', '_on_behalf_of', c_obo, 'full_name', 'Nope'));
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
    raise exception 'DYN-8: a caller wrote version 99 into a first write and the store kept %', v_v;
  end if;
  raise notice 'F. VAL-7/VAL-8 — three words land through the write door, three retired words are refused naming the replacement, "robot" is refused, a forged author and a forged version do not survive.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- G. THE VERSION ID — readable on every read, and it moves only when the
  --    VALUE moves. Three readings of the same row: 1, then 2, then 2.
  -- ══════════════════════════════════════════════════════════════════════════
  v_rec2 := custom.record_write(v_org, v_person, jsonb_build_object(
    '_actor', 'user', 'full_name', 'Versioned', 'phone', '+1-415-555-0400',
    '_values', jsonb_build_object('phone', jsonb_build_object('src', jsonb_build_object('kind', 'typed_in')))));
  select value_version into v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_v <> 1 then raise exception 'DYN-8 (G1): a first write is version %, expected 1', v_v; end if;

  perform custom.record_update(v_org, v_rec2, jsonb_build_object('_actor','user','phone','+1-415-555-0401'));
  select value_version into v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_v <> 2 then raise exception 'DYN-8 (G2): the value changed and the version is %, expected 2', v_v; end if;

  -- The SAME value, asserted again, by a DIFFERENT actor. Not a new version of anything.
  perform custom.record_update(v_org, v_rec2, jsonb_build_object('_actor','agent','_on_behalf_of', c_obo));
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
  -- H. THE ENVELOPE CHECK CONSTRAINT — this lane's production clause. A catalogue
  --    read is nobody's screen, so it steps out of the seat and says so.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('role', v_boss, true);
  select count(*) into v_n from pg_constraint
   where conname = 'record_value_envelope' and contype = 'c'
     and conrelid in (select inhrelid from pg_inherits where inhparent = 'custom.record'::regclass);
  select count(*) into v_i from pg_constraint
   where conname = 'record_value_envelope' and contype = 'c' and conrelid = 'custom.record'::regclass;
  perform set_config('role', 'authenticated', true);
  if v_n <> 16 then raise exception 'the envelope constraint is on % of the sixteen partitions', v_n; end if;
  if v_i <> 1 then raise exception 'the envelope constraint is not on custom.record itself'; end if;
  raise notice 'H. record_value_envelope is in pg_constraint on custom.record and on all 16 partitions.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- J. THE PLAIN READ DOES NOT LEAK THE ENVELOPE. `custom.record_values` holds no
  --    client grant, so the plain read a person actually gets is the read DOOR.
  -- ══════════════════════════════════════════════════════════════════════════
  v_doc := custom.read_record(v_org, v_rec, true);
  if v_doc ? '_values' or v_doc ? '_sources' then
    raise exception 'the read door returns the envelope block as if it were one of the record''s own values: %',
                    (select array_agg(k) from jsonb_object_keys(v_doc) k);
  end if;
  if not (v_doc ? 'phone') then
    raise exception 'the read door lost the record''s actual values: %', v_doc;
  end if;
  raise notice 'J. the read door returns the record''s values and not the envelope.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- K. AN ENVELOPE FOR A FIELD NOBODY DECLARED is provenance nobody can read.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('_actor','user',
      '_values', jsonb_build_object('fax', jsonb_build_object('absent','none'))));
    raise exception 'an envelope for an undeclared field was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%fax%' then
      raise exception 'the refusal for an undeclared envelope key must name it, and it said: %', v_msg;
    end if;
  end;
  raise notice 'K. an envelope for a field this table does not declare is refused, naming it.';

  -- ══════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON.
  -- `test@test.com` is a member of this organization and was made an admin of nothing. Every
  -- refusal above is a STORE RULE; this one is the ACCESS question, which the old seat could
  -- not ask at all: as the owner of `custom.record`, `custom.assert_client_may_reach`
  -- returned true on its first line for every organization on the database.
  -- ══════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 5a. She cannot give this Table another column — the shape is an admin's.
  v_caught := null;
  begin
    perform custom.field_declare(v_org, v_person, jsonb_build_object('key','sneaked','label','Sneaked in','plain','text'));
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5a: test@test.com added a column to a table she is not an admin of';
  end if;

  -- 5b. Nor delete a record nobody shared with her.
  v_caught := null;
  begin
    perform custom.record_delete(v_org, v_rec2);
  exception when others then v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '5b: test@test.com deleted a record nobody shared with her';
  end if;

  -- 5c. THE CONTROL, so 5a and 5b are not a door that refuses her everything: the record she
  --     IS given, she reads, with its provenance.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec2, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select value_version into v_v from custom.value_read(v_org, v_rec2, 'phone');
  if v_v is null then
    raise exception '5c: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'PART 5 — test@test.com is refused a column and a delete, and reads the record shared with her at version %.', v_v;

  raise notice '=== W1-VAL — VAL-1..VAL-8 all executed on the MAIN database from the seat `authenticated`, and this transaction rolls back. ===';
end;
$t$;

rollback;
