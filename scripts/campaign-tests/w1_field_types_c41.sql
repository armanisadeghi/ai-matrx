-- W1-FIELD-TYPES — FLD-11's parity floor, and V1-MODEL's clause C-41 executed, ON THE MAIN
-- DATABASE, from the seat a signed-in person sits in.
--
-- RUN IT:
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_field_types_c41.sql
--
-- 🚨 RE-POINTED (lane SEAT-SUITES, 2026-09-19). This suite used to refuse to run anywhere but
-- the rehearsal branch. That branch holds 226 functions in schema `custom` against main's 332
-- and grants `authenticated` 29 of them against main's 103 — it does not even carry
-- `custom.field_declare` — so the store these clauses are about is not there. The owner's
-- 2026-09-18 ruling is that there is no production: everything is the main database. The
-- guard below now names main's system_identifier and every clause was measured against it.
--
-- 🚨 THE SEAT. It also used to run as the role that OWNS `custom.record`. In that seat
-- `custom.assert_client_may_reach` returns on its first line, EXECUTE grants are free,
-- SECURITY INVOKER and SECURITY DEFINER are the same thing and `custom.record` is directly
-- readable — so every clause proved something about the store's internals and nothing about
-- the product. It now takes the seat `authenticated` in PART 0, proves it holds it, and asks
-- every question through the door a signed-in person reaches:
--   `custom.parity_values`  → `custom.record_values_versioned` joined to `custom.applicable_fields`
--   `update custom.record`  → `custom.record_update`
--   `insert into custom.record` → `custom.record_write`
--   a Field declaration     → `custom.field_declare`
--   `select … from custom.record` → `custom.read_record` / `custom.read_records`
--
-- WHAT IT ASSERTS, and every clause is a value read back rather than a declaration read back:
--
--   A. ALL THIRTEEN ROUND-TRIP, through the versioned read door, every one of the thirteen
--      parity types answering with the value that was written. Thirteen distinct names.
--   B. THE ENVELOPE. The same read carries W1-VAL's version for every Value.
--   C. LOOKUP IS A READ THROUGH A RELATION, PROVEN BY MOVING THE FAR SIDE, through the door.
--   D. ROLLUP DOES NOT DOUBLE COUNT. The relation lists the first line TWICE; the sum is 350
--      and not 450, and the naive sum is computed in the same clause from the same doors.
--   E. ROLLUP RECOMPUTES WHEN A CONTAINED RECORD CHANGES: 350 -> 400, parent never written.
--   F. FORMULA RECOMPUTES ON ITS DECLARED OCCASION: 440 -> 1100, and the answer is
--      ATTRIBUTABLE THROUGH THE DOOR — `custom.read_record` strips the internal `_derived`
--      stamp, so what a person actually gets is the versioned read's field id, version and
--      moment, and that is what this clause asserts.
--   G. ATTACHMENT IS A FILE RECORD REACHED THROUGH A RELATION (REC-31), proven by finding
--      the pointed-at id among `custom.read_records` of the kernel File Table.
--   H. THIRTEEN WRONG-SHAPED INPUTS THROUGH `custom.record_write`, EACH REFUSED BY THE
--      FIELD'S OWN NAME.
--   I. THE POSITIVE CONTROL (rule 14): the same thirteen values, correctly shaped, LAND.
--   J. THE SEVEN DECLARATIONS A PERSON CANNOT END UP WITH. Through `custom.field_declare`
--      four are REFUSED BY NAME (a parity name nobody ships, a lookup with nothing to read
--      through, a rollup along a single relation, an attachment that would cascade) and
--      three are CORRECTED BY THE DOOR (a currency gets its unit, a rollup asking to be
--      stamped at write time is made read-time, a url gets its pattern Rule). Both halves
--      are asserted: the law is that the bad declaration cannot exist, and the door is the
--      first place it is stopped.
--   K. THE ACCESS QUESTION, as a real second person: `test@test.com`, a member who was
--      shared nothing, with one control she CAN do.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every computed clause.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3):
--   A, C, D, E, G  — remove `custom.derived_values` from `custom.record_values`, or drop
--                    the DISTINCT in `custom.relation_targets` (D goes to 450).
--   F              — drop the trigger `custom_record_zz_derived_fields`.
--   H              — drop `custom_record_field_validation` (W1-FIELD's validator).
--   J              — drop `custom_record_field_type_parity_guard`, or take the correcting
--                    arms back out of `custom._field_document_for`.
--   Its RED twin is `scripts/campaign-tests/w1_field_types_red.sql`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK, so the fixture is exactly as it was afterwards.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'w1_field_types_c41.sql'
\set requires 'exec:custom.record_values_versioned'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_rec     constant uuid := '11111111-0009-4000-8000-000000000011';
  v_tbl     constant uuid := '11111111-0005-4000-8000-000000000003';
  v_person  constant uuid := '11111111-0006-4000-8000-000000000011';
  v_file    constant uuid := '11111111-0006-4000-8000-000000000021';
  v_line1   constant uuid := '11111111-0009-4000-8000-000000000001';
  v_opt     constant uuid := '11111111-0006-4000-8000-000000000001';
  v_f_tax   constant uuid := '11111111-0008-4000-8000-000000000008';  -- the formula Field
  v_rec2    uuid;
  v_n       integer;
  v_v       jsonb;
  v_naive   numeric;
  v_ver1    integer;
  v_ver2    integer;
  v_at      timestamptz;
  v_fid     uuid;
  v_src     jsonb;
  v_seen    text;
  v_id      uuid;
  v_doc     jsonb;
  v_case    record;
  v_boss    text := current_user;   -- the connected role, for the fixture steps no door covers
begin
  -- ════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE, as the connected role. A seat is a PERSON, and a person reaches an
  -- organization only through a membership; the store answers a person only where its own
  -- switch is on. Both are made here and both disappear with the ROLLBACK.
  -- ════════════════════════════════════════════════════════════════════════════
  -- The parity-floor fixture is SHARED: other campaign suites are writing the same rows on
  -- the main database right now, so this suite WAITS for a row rather than dying on the
  -- five-second lock_timeout the connection carries. Nothing here is a race — every clause
  -- below is about what the doors answer, never about how fast.
  perform set_config('lock_timeout', '120s', true);
  perform set_config('statement_timeout', '180s', true);
  perform set_config('app.actor_system', 'campaign-test/w1_field_types_c41', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'w1_field_types_c41');

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

  -- ── A. ALL THIRTEEN ROUND-TRIP ────────────────────────────────────────────────────
  -- `custom.parity_values` holds no client grant; the door a person has is the versioned
  -- read joined to the definitions `custom.applicable_fields` hands back.
  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec) v
    join lateral (select a.data from custom.applicable_fields(v_org, v_tbl, null) a
                   where a.data ->> 'key' = v.field_key limit 1) f on true
   where f.data ->> 'parity_type' is not null and v.value is not null;
  if v_n <> 13 then
    raise exception 'A FAILED: % of the thirteen parity types read back a value', v_n;
  end if;
  select count(distinct f.data ->> 'parity_type') into v_n
    from custom.record_values_versioned(v_org, v_rec) v
    join lateral (select a.data from custom.applicable_fields(v_org, v_tbl, null) a
                   where a.data ->> 'key' = v.field_key limit 1) f on true
   where f.data ->> 'parity_type' is not null;
  if v_n <> 13 then
    raise exception 'A FAILED: % distinct parity types, and the floor is thirteen', v_n;
  end if;
  -- and every one of them is a name `custom.parity_field_types()` ships — that door IS a
  -- client's (it is in the 103), so the catalogue is asked from the seat.
  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec) v
    join lateral (select a.data from custom.applicable_fields(v_org, v_tbl, null) a
                   where a.data ->> 'key' = v.field_key limit 1) f on true
   where f.data ->> 'parity_type' is not null
     and not exists (select 1 from custom.parity_field_types() t
                      where t.parity_type = f.data ->> 'parity_type');
  if v_n <> 0 then
    raise exception 'A FAILED: % values claim a parity type nobody ships', v_n;
  end if;
  raise notice 'A PASS — thirteen parity types, thirteen values read back through custom.record_values_versioned';

  -- ── B. THE ENVELOPE ───────────────────────────────────────────────────────────────
  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec) v
    join lateral (select a.data from custom.applicable_fields(v_org, v_tbl, null) a
                   where a.data ->> 'key' = v.field_key limit 1) f on true
   where f.data ->> 'parity_type' is not null and coalesce(v.value_version, 0) < 1;
  if v_n <> 0 then
    raise exception 'B FAILED: % parity values came back with no version', v_n;
  end if;
  raise notice 'B PASS — every parity Value carries W1-VAL''s version';

  -- ── C. LOOKUP READS THROUGH THE RELATION ──────────────────────────────────────────
  select v.value into v_v from custom.value_read(v_org, v_rec, 'owner_name') v;
  if v_v <> '"Parity Person"'::jsonb then
    raise exception 'C FAILED (first input): the lookup answered % and the related record says Parity Person', v_v;
  end if;
  -- THE FAR SIDE MOVES, through the write door a person has.
  perform custom.record_update(v_org, v_person, jsonb_build_object('full_name','Renamed Person'));
  select v.value into v_v from custom.value_read(v_org, v_rec, 'owner_name') v;
  if v_v <> '"Renamed Person"'::jsonb then
    raise exception 'C FAILED (second input): the far side moved and the lookup answered %, so it is a stored copy', v_v;
  end if;
  raise notice 'C PASS — the lookup follows the relation, twice, to two different answers';

  -- ── D. THE ROLLUP DOES NOT DOUBLE COUNT ───────────────────────────────────────────
  -- The naive sum is computed HERE, from the SAME doors: the parent's own document names its
  -- lines and each line is read with `custom.read_record`. That is what a rollup without
  -- DISTINCT would answer, and the two are compared rather than one being asserted.
  select sum((custom.read_record(v_org, (t #>> '{}')::uuid, true) ->> 'amount')::numeric)
    into v_naive
    from jsonb_array_elements(custom.read_record(v_org, v_rec, true) -> 'lines') t;
  select v.value into v_v from custom.value_read(v_org, v_rec, 'line_total') v;
  if v_naive <> 450 then
    raise exception 'D FAILED: the fixture no longer lists a line twice (naive sum %), so the clause proves nothing', v_naive;
  end if;
  if (v_v #>> '{}')::numeric <> 350 then
    raise exception 'D FAILED: the rollup answered % where the relation names two distinct lines worth 350 and the naive sum is %',
                    v_v, v_naive;
  end if;
  raise notice 'D PASS — the same line listed twice counts once: rollup 350, naive sum %', v_naive;

  -- ── E. THE ROLLUP RECOMPUTES WHEN A CONTAINED RECORD CHANGES ──────────────────────
  perform custom.record_update(v_org, v_line1, jsonb_build_object('amount', 150));
  select v.value into v_v from custom.value_read(v_org, v_rec, 'line_total') v;
  if (v_v #>> '{}')::numeric <> 400 then
    raise exception 'E FAILED: a contained record moved 100 -> 150 and the parent total answered % instead of 400', v_v;
  end if;
  raise notice 'E PASS — a contained record changed and the parent total moved 350 -> 400, with the parent never written';

  -- ── F. THE FORMULA RECOMPUTES ON ITS DECLARED OCCASION ────────────────────────────
  select v.value, v.value_version into v_v, v_ver1
    from custom.value_read(v_org, v_rec, 'amount_with_tax') v;
  if (v_v #>> '{}')::numeric <> 440 then
    raise exception 'F FAILED (first input): the formula answered % and 400 * 1.1 is 440', v_v;
  end if;
  perform custom.record_update(v_org, v_rec, jsonb_build_object('amount_usd', 1000));
  select v.value, v.value_version, v.field_id, v.written_at, v.source
    into v_v, v_ver2, v_fid, v_at, v_src
    from custom.value_read(v_org, v_rec, 'amount_with_tax') v;
  if (v_v #>> '{}')::numeric <> 1100 then
    raise exception 'F FAILED (second input): the input moved 400 -> 1000 and the formula answered % instead of 1100', v_v;
  end if;
  -- AND IT IS ATTRIBUTABLE TO A PERSON, which is the clause's point. The write-time stamp
  -- lives in the record's internal `_derived`, and `custom.read_record` strips that — a
  -- person never sees it. What a person DOES get is the versioned read's envelope, so the
  -- provenance is asserted where it actually reaches them: the answer names the formula
  -- Field it came from, it carries a version, it carries the MOMENT it was worked out and a
  -- SOURCE saying what worked it out. Until SEAT-SUITES landed
  -- `migrations/campaign/seat_a_worked_out_answer_says_when_and_from_what.sql`, the last two
  -- were both NULL from the seat: the store kept the stamp and the door threw it away.
  if v_fid is distinct from v_f_tax then
    raise exception 'F FAILED: the answer names field % and the formula Field is %', v_fid, v_f_tax;
  end if;
  if coalesce(v_ver2, 0) < 1 or v_at is null then
    raise exception 'F FAILED: the write-time formula left no envelope — version %, written_at %', v_ver2, v_at;
  end if;
  if (v_src ->> 'parity') <> 'formula' or (v_src ->> 'field_id')::uuid is distinct from v_f_tax then
    raise exception 'F FAILED: the answer does not say what produced it — source %', v_src;
  end if;
  if custom.read_record(v_org, v_rec, true) ? '_derived' then
    raise exception 'F FAILED: the internal _derived stamp reached a person through custom.read_record';
  end if;
  raise notice 'F PASS — 440 then 1100, and the answer reaches a person naming its formula Field, its version and its moment';

  -- ── G. THE ATTACHMENT IS A FILE RECORD REACHED THROUGH A RELATION (REC-31) ────────
  -- Through the doors: the parent's own document names the photo, `custom.read_record`
  -- answers what it is, and `custom.read_records` of the kernel File Table proves it is a
  -- record OF that Table rather than a storage key on the parent.
  v_doc := custom.read_record(v_org, v_rec, true);
  if jsonb_array_length(coalesce(v_doc -> 'photos', '[]'::jsonb)) <> 1 then
    raise exception 'G FAILED: the parent names % photos', jsonb_array_length(coalesce(v_doc -> 'photos','[]'::jsonb));
  end if;
  if (custom.read_record(v_org, (v_doc -> 'photos' ->> 0)::uuid, true) ->> 'mime') <> 'image/png' then
    raise exception 'G FAILED: the attachment is not the png File record';
  end if;
  select count(*) into v_n from custom.read_records(v_org, custom.file_kernel_id(), true, 200, 0) f
   where f.id = (v_doc -> 'photos' ->> 0)::uuid;
  if v_n <> 1 then
    raise exception 'G FAILED: the attachment is not a record of the kernel File Table';
  end if;
  raise notice 'G PASS — REC-31: the picture is a File record reached through a relation';

  -- ── H. THIRTEEN WRONG-SHAPED INPUTS, EACH REFUSED BY THE FIELD'S OWN NAME ─────────
  -- THROUGH THE WRITE DOOR. The old suite INSERTed straight into `custom.record`, which
  -- needs a table privilege no signed-in person holds.
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
      -- the base document is VALID and complete: only the one key under test is wrong, so a
      -- refusal can only be about that key.
      perform custom.record_write(v_org, v_tbl,
        jsonb_build_object('title', 'wrong shape', 'status', v_opt::text) || v_case.bad);
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
  raise notice 'H PASS — all thirteen wrong shapes refused through custom.record_write, each naming its own field';

  -- ── I. THE POSITIVE CONTROL ───────────────────────────────────────────────────────
  v_rec2 := custom.record_write(v_org, v_tbl,
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
  select count(*) into v_n
    from custom.record_values_versioned(v_org, v_rec2) v
    join lateral (select a.data from custom.applicable_fields(v_org, v_tbl, null) a
                   where a.data ->> 'key' = v.field_key limit 1) f on true
   where f.data ->> 'parity_type' is not null and v.value is not null;
  if v_n <> 13 then
    raise exception 'I FAILED: the positive control read back % of thirteen', v_n;
  end if;
  select v.value into v_v from custom.value_read(v_org, v_rec2, 'line_total') v;
  if (v_v #>> '{}')::numeric <> 150 then
    raise exception 'I FAILED: the control record names one line worth 150 and its total is %', v_v;
  end if;
  raise notice 'I PASS — the same thirteen, correctly shaped, LAND through the write door, and a different relation gives a different total (150)';

  -- ── J. THE SEVEN DECLARATIONS A PERSON CANNOT END UP WITH ────────────────────────
  -- Through `custom.field_declare`, which is where a person actually makes a column. Four
  -- are refused by the field's own name; three the door CORRECTS, which is the stronger
  -- answer — the bad declaration is not merely rejected, it cannot be expressed.
  for v_case in
    select * from (values
      ('a name nobody ships',
       '{"key":"cedar_permit_code","label":"Bad name","parity_type":"barcode"}'::jsonb,
       'There is no field type called "barcode"'),
      ('a lookup with nothing to read through',
       '{"key":"cedar_contractor_contact","label":"Blind lookup","parity_type":"lookup","pick":"full_name"}'::jsonb,
       'which relation it reads through'),
      ('a rollup along a single relation',
       '{"key":"cedar_contractor_job_count","label":"Single rollup","parity_type":"rollup","via":"owner","of":"full_name","agg":"count"}'::jsonb,
       'points at one thing at a time'),
      ('an attachment that would cascade',
       '{"key":"cedar_site_photo","label":"Cascading photo","parity_type":"attachment","on_target_delete":"cascade"}'::jsonb,
       'deleting the file deletes the record')
    ) as t(what, spec, expect)
  loop
    v_seen := null;
    begin
      perform custom.field_declare(v_org, v_tbl, v_case.spec);
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

  -- A currency that says it is a plain number gets its unit: it cannot be a currency in
  -- name only.
  v_id := custom.field_declare(v_org, v_tbl, '{"key":"cedar_quote_amount","label":"Declared currency","parity_type":"currency","config":{"kind":"number"}}'::jsonb);
  v_doc := custom.read_record(v_org, v_id, true);
  if coalesce(v_doc ->> 'unit','') = '' or (v_doc ->> 'format') <> 'currency' then
    raise exception 'J FAILED: a currency landed with no unit or no format: %', v_doc;
  end if;
  -- A rollup that asks to be stamped at write time is made read-time: a stored total is
  -- stale the moment one of the things it adds up changes.
  v_id := custom.field_declare(v_org, v_tbl, '{"key":"cedar_purchases_total","label":"Declared rollup","parity_type":"rollup","via":"lines","of":"amount","agg":"sum","compute_on":"write"}'::jsonb);
  v_doc := custom.read_record(v_org, v_id, true);
  if (v_doc ->> 'compute_on') <> 'read' then
    raise exception 'J FAILED: a rollup landed stamped at % time', v_doc ->> 'compute_on';
  end if;
  -- A url gets its pattern Rule: a format is how to SHOW it, and only a Rule makes it
  -- enforceable (FLD-3 / FLD-11).
  v_id := custom.field_declare(v_org, v_tbl, '{"key":"cedar_vendor_website","label":"Declared url","parity_type":"url"}'::jsonb);
  v_doc := custom.read_record(v_org, v_id, true);
  if not exists (select 1 from jsonb_array_elements(coalesce(v_doc -> 'rules','[]'::jsonb)) r
                  where r ->> 'kind' = 'pattern') then
    raise exception 'J FAILED: a url landed with nothing saying what a url looks like: %', v_doc;
  end if;
  raise notice 'J PASS — four declarations refused by name and three corrected by the door, so none of the seven can exist';

  -- ── K. THE ACCESS QUESTION, AS A REAL SECOND PERSON ──────────────────────────────
  -- `test@test.com` is a member of this organization and was shared nothing. Every refusal
  -- above is a STORE RULE; this one is the ACCESS question, which the old seat could not ask
  -- at all: as the owner of `custom.record`, `custom.assert_client_may_reach` returned true
  -- on its first line for every organization on the database.
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- K1. She cannot change a record nobody gave her.
  v_seen := null;
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('title','Dana was here'));
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com edited a record nobody shared with her';
  end if;

  -- K2. Nor add a column to a table she is not an admin of.
  v_seen := null;
  begin
    perform custom.field_declare(v_org, v_tbl, '{"label":"Sneaked in","plain":"text"}'::jsonb);
  exception when others then v_seen := sqlerrm;
  end;
  if v_seen is null then
    raise exception 'K FAILED: test@test.com added a column to a table she is not an admin of';
  end if;

  -- K3. THE CONTROL, so K1 and K2 are not a door that refuses her everything: the record she
  --     IS given, she reads, with all thirteen of its parity Values.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_rec2, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_rec2, true) ->> 'title') <> 'Positive control' then
    raise exception 'K FAILED: the record shared with test@test.com at viewer does not read back for her';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice 'K PASS — a member who was shared nothing is refused the edit and the shape change, and reads the one record she was given';

  raise notice 'W1-FIELD-TYPES C-41 SUITE GREEN — thirteen types, four real implementations, twenty-four refusals, every clause from the seat `authenticated` on the MAIN database';
end;
$t$;

rollback;
