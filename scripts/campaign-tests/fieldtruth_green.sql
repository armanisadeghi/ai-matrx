-- scripts/campaign-tests/fieldtruth_green.sql — LANE FIELD-TRUTH's SUITE.
--
-- THE USE CASE (owner's law, 2026-09-21: no fake test data). Kestrel Ridge Orchard is a
-- forty-acre cider-apple orchard above Hood River, Oregon. Picking crews bring in bins by
-- lot, each lot one variety off one named block of the orchard — Upper Kestrel, Creek
-- Bottom, The Bench — and the packing shed weighs and codes every lot before it goes to the
-- press. Every name, column and value below is that orchard's. The whole suite runs inside
-- ONE transaction that ends in ROLLBACK, so the main database is untouched.
--
-- WHAT IT PROVES. The defect the real-data crews hit: `custom.record_write` took a value for
-- a key nobody had declared, kept it, read it back — and showed it in no grid and in no
-- agent tool's schema, because both read the Table's Field rows. PART 1 is that clause, and
-- it is the one that ran RED on the live database before
-- `fieldtruth_a_record_carries_only_declared_fields.sql` was applied: the orchard's `block`
-- was accepted and stored with no column to show it.
--
-- WHERE EACH CLAUSE SITS, and why. PARTS 0–4, 6b and 7a are the PRODUCT and run in THE SEAT
-- — `authenticated`, the role PostgREST gives a signed-in person — through the doors alone,
-- reading with `custom.record_values_versioned` because `custom.record` itself is not
-- readable from the seat and a suite that reached past the doors would be proving something
-- no person can see. PARTS 5, 6a, 7b and 8's census are about the STORE'S OWN TAXONOMY —
-- `custom.table_column_source` and `custom.undeclared_keys` are internals with no client
-- grant, exactly as the closed-schema rule requires — so they are asked as the owner.
--
-- Run: <scratchpad>/prod.sh -f scripts/campaign-tests/fieldtruth_green.sql

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '120s';
set local statement_timeout = '600s';

create temporary table _ft_ids (k text primary key, v uuid) on commit drop;
-- The seat half reads the ids the owner half made. It is a scratch table inside this
-- transaction, never part of the store, so the grant says only "this suite may see its own
-- notes" — every clause about the product still goes through the doors.
grant select on _ft_ids to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE ORCHARD, AND THE WORLD AS IT WAS BEFORE THE DOOR EXISTED. Owner section.
-- ═══════════════════════════════════════════════════════════════════════════════════════
do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_home  uuid; v_lots uuid; v_notes uuid; v_press uuid; v_old uuid;
  v_msg   text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'fieldtruth_green.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/fieldtruth_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Kestrel Ridge Orchard', 'kestrel-ridge-orchard-'||substr(v_org::text,1,8), 'KRO', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/fieldtruth_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Kestrel Ridge Orchard')) returning id into v_home;

  v_lots := custom.table_declare(v_org, jsonb_build_object(
    'name','harvest_lots', 'type','entity', 'slug','harvest_lots',
    'label_singular','Harvest Lot', 'label_plural','Harvest Lots',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','lot_code','direction','desc')),
    'title_field','lot_code', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','lot_code','type','text'),
      jsonb_build_object('name','variety','type','text'),
      jsonb_build_object('name','bins_picked','type','range'))));

  -- ── PART 5 — A KERNEL TABLE IS DEFINED IN CODE AND KEEPS ITS OWN KEYS. ────────────────
  -- 936 live records belong to one of the nine kernel Tables and NONE of them has a Field
  -- row. A blanket refusal would have taken every Person in the platform with it.
  if custom.table_column_source(v_org, custom.person_kernel_id()) <> 'code' then
    raise exception 'PART 5 FAILED — the Person kernel says its columns come from %',
      custom.table_column_source(v_org, custom.person_kernel_id());
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (v_org, custom.person_kernel_id(),
          jsonb_build_object('name','Marisol Okafor','full_name','Marisol Okafor','role','Packing shed lead'));
  raise notice 'PART 5 PASSED — a kernel Table''s record keeps the keys platform code writes.';

  -- ── PART 6a — A DOCUMENT TABLE SAYS SO, AND ITS OWN KEYS PASS. ───────────────────────
  -- The orchard keeps free-text shed notes whose shape nobody wants to be a column.
  v_notes := custom.table_declare(v_org, jsonb_build_object(
    'name','shed_notes', 'type','entity', 'slug','shed_notes',
    'label_singular','Shed Note', 'label_plural','Shed Notes',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 365, 'row_order','sorted', 'agent_writable', true,
    'columns','free_form',
    'default_sort', jsonb_build_array(jsonb_build_object('field','headline','direction','desc')),
    'title_field','headline', 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name','headline','type','text'))));
  perform custom.record_write(v_org, v_notes, jsonb_build_object(
    'headline','Press line down Tuesday', 'shift','swing', 'fixed_by','Okafor'));
  if custom.table_column_source(v_org, v_notes) <> 'free_form' then
    raise exception 'PART 6a FAILED — the notes table does not read as free-form.';
  end if;
  if custom.table_column_source(v_org, v_lots) <> 'fields' then
    raise exception 'PART 6a FAILED — a table that said nothing does not default to its fields.';
  end if;
  raise notice 'PART 6a PASSED — a document Table declares itself; silence still means the doctrine.';

  -- ── PART 7b — PLATFORM KEYS BELONG TO THE STORE, NOT TO ANY TABLE. ──────────────────
  if cardinality(custom.undeclared_keys(v_org, v_lots,
       jsonb_build_object('lot_code','x','parent_id','y','_values','{}'::jsonb,'_source','{}'::jsonb))) <> 0 then
    raise exception 'PART 7b FAILED — a platform key was called undeclared.';
  end if;
  if custom.undeclared_keys(v_org, v_lots, jsonb_build_object('lot_code','x','block','y')) <> array['block'] then
    raise exception 'PART 7b FAILED — the census does not name the one key that has no column.';
  end if;
  raise notice 'PART 7b PASSED — parent_id and the `_` envelopes are the store''s, never a column.';

  -- ── PART 8, SETUP — A PRESS RUN WRITTEN BEFORE THE DOOR EXISTED. ────────────────────
  -- The table is born free-form, takes a row carrying a `brix` reading no column knows
  -- about, and is then closed — exactly the sequence every live table went through when
  -- this lane landed. PART 8 asks, from the seat, whether that record can still be edited.
  v_press := custom.table_declare(v_org, jsonb_build_object(
    'name','press_runs', 'type','entity', 'slug','press_runs',
    'label_singular','Press Run', 'label_plural','Press Runs',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'columns','free_form',
    'default_sort', jsonb_build_array(jsonb_build_object('field','run_code','direction','desc')),
    'title_field','run_code', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','run_code','type','text'),
      jsonb_build_object('name','gallons','type','range'))));
  v_old := custom.record_write(v_org, v_press, jsonb_build_object(
    'run_code','PR-24-07', 'gallons', 320, 'brix', 14));
  update custom.record set data = data - 'columns', version = version + 1
   where organization_id = v_org and id = v_press;
  if custom.table_column_source(v_org, v_press) <> 'fields' then
    raise exception 'PART 8 SETUP FAILED — the press-run table is not closed, so PART 8 proves nothing.';
  end if;
  if custom.undeclared_keys(v_org, v_press,
       (select data from custom.record where organization_id = v_org and id = v_old)) <> array['brix'] then
    raise exception 'PART 8 SETUP FAILED — the old press run does not carry the orphan key this clause is about.';
  end if;

  insert into _ft_ids (k, v) values
    ('org', v_org), ('home', v_home), ('lots', v_lots), ('notes', v_notes),
    ('press', v_press), ('old', v_old);
end $t$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- THE SEAT. Everything below is what a signed-in person can actually do.
-- ═══════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;

do $t$
declare
  v_org  uuid := (select v from _ft_ids where k = 'org');
  v_lots uuid := (select v from _ft_ids where k = 'lots');
  v_old  uuid := (select v from _ft_ids where k = 'old');
  v_home uuid := (select v from _ft_ids where k = 'home');
  v_rec  uuid; v_child uuid;
  v_msg  text; v_hint text; v_n integer; v_want text;
begin
  -- ── PART 0 — THE SEAT. ──────────────────────────────────────────────────────────────
  if current_user <> 'authenticated' then
    raise exception 'PART 0 FAILED — this half is not in the seat; it is %', current_user;
  end if;
  raise notice 'PART 0 PASSED — running as %, the role a signed-in person holds.', current_user;

  -- ── PART 1 — A VALUE WITH NO COLUMN IS REFUSED, BY NAME, WITH THE REMEDY. ───────────
  -- THE DEFECT ITSELF. The packing shed types the orchard block beside the lot. Nobody
  -- declared a Block column, so before this lane the value was stored and then lived where
  -- no grid, no export and no agent tool would ever show it.
  begin
    perform custom.record_write(v_org, v_lots, jsonb_build_object(
      'lot_code','KR-24-118', 'variety','Kingston Black', 'bins_picked', 9,
      'block','Upper Kestrel'));
    raise exception 'PART 1 FAILED — "block" is not a column of Harvest Lots and the write was accepted anyway. This is the defect: the value is stored and invisible.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    if position('"block"' in v_msg) = 0 then
      raise exception 'PART 1 FAILED — the refusal never names the key: %', v_msg;
    end if;
    if position('Harvest Lot' in v_msg) = 0 then
      raise exception 'PART 1 FAILED — the refusal never names the table: %', v_msg;
    end if;
    if position('custom.field_declare' in v_hint) = 0 then
      raise exception 'PART 1 FAILED — the refusal carries no remedy: %', v_hint;
    end if;
  end;
  raise notice 'PART 1 PASSED — a value with no column is refused, naming the key, the table and what to do.';

  -- ── PART 2 — EVERY UNDECLARED KEY IN ONE ANSWER. ────────────────────────────────────
  -- One round trip per mistake is what cost crew D five calls to reproduce a four-key
  -- problem, and it is the thing LIMITS-FIX fixed on the table door.
  begin
    perform custom.record_write(v_org, v_lots, jsonb_build_object(
      'lot_code','KR-24-119', 'block','Creek Bottom', 'picker_crew','Ramos', 'brix', 14));
    raise exception 'PART 2 FAILED — three undeclared keys were accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    foreach v_want in array array['"block"','"brix"','"picker_crew"'] loop
      if position(v_want in v_msg) = 0 then
        raise exception 'PART 2 FAILED — the one answer never mentions %: %', v_want, v_msg;
      end if;
    end loop;
  end;
  raise notice 'PART 2 PASSED — three problems, one refusal, each key named.';

  -- ── PART 3 — DECLARE THE COLUMN AND THE SAME WRITE GOES THROUGH. ────────────────────
  -- The refusal is a door, not a wall: the remedy it names actually works, from the seat.
  perform custom.field_declare(v_org, v_lots, jsonb_build_object(
    'key','block', 'label','Orchard Block', 'type','text', 'sort', 400));
  v_rec := custom.record_write(v_org, v_lots, jsonb_build_object(
    'lot_code','KR-24-118', 'variety','Kingston Black', 'bins_picked', 9,
    'block','Upper Kestrel'));
  if (select v.value #>> '{}' from custom.record_values_versioned(v_org, v_rec) v
       where v.field_key = 'block') is distinct from 'Upper Kestrel' then
    raise exception 'PART 3 FAILED — the lot was written without its block.';
  end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_lots, null) f where f.data ->> 'key' = 'block';
  if v_n <> 1 then
    raise exception 'PART 3 FAILED — Orchard Block is not a column of the table (% found).', v_n;
  end if;
  raise notice 'PART 3 PASSED — the remedy the refusal named works, and the value is now a column anyone can see.';

  -- ── PART 4 — THE BATCH DOOR AND THE UPDATE DOOR INHERIT THE SAME SENTENCE. ──────────
  -- The refusal lives on custom.record, so every door onto it — and the agent CRUD tools,
  -- the packages and PostgREST, which all arrive at the same table — says the same thing.
  begin
    perform custom.record_write_many(v_org, v_lots, array[
      jsonb_build_object('lot_code','KR-24-120','variety','Yarlington Mill','bins_picked',6),
      jsonb_build_object('lot_code','KR-24-121','variety','Dabinett','press_date','2026-10-02')
    ]::jsonb[], null);
    raise exception 'PART 4a FAILED — a batch carrying an undeclared "press_date" was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if position('"press_date"' in v_msg) = 0 then
      raise exception 'PART 4a FAILED — the batch refusal never names the key: %', v_msg;
    end if;
  end;
  begin
    perform custom.record_update(v_org, v_rec, jsonb_build_object('press_date','2026-10-02'));
    raise exception 'PART 4b FAILED — an update adding an undeclared "press_date" was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if position('"press_date"' in v_msg) = 0 then
      raise exception 'PART 4b FAILED — the update refusal never names the key: %', v_msg;
    end if;
  end;
  raise notice 'PART 4 PASSED — record_write_many and record_update refuse it in the same words.';

  -- ── PART 6b — ONLY THE TWO WORDS EXIST. ─────────────────────────────────────────────
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','bad_words', 'type','entity', 'slug','bad_words',
      'label_singular','Bad Word', 'label_plural','Bad Words',
      'display','list', 'ordered', false, 'weight','light',
      'retention_days', 365, 'row_order','sorted', 'agent_writable', true,
      'columns','whatever',
      'default_sort', jsonb_build_array(jsonb_build_object('field','headline','direction','desc')),
      'title_field','headline', 'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name','headline','type','text'))));
    raise exception 'PART 6b FAILED — a table said its columns come from "whatever" and was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if position('free-form' in v_msg) = 0 then
      raise exception 'PART 6b FAILED — the refusal does not name the two words: %', v_msg;
    end if;
  end;
  raise notice 'PART 6b PASSED — a third word for where a table''s columns come from is refused.';

  -- ── PART 7a — CONTAINMENT STILL WORKS FROM THE SEAT. ────────────────────────────────
  -- Half a lot goes to the press separately; `parent_id` is the store's, not a column, and
  -- a door that refused it would have broken containment for every table in the platform.
  v_child := custom.record_write(v_org, v_lots, jsonb_build_object(
    'lot_code','KR-24-118-B', 'variety','Kingston Black', 'bins_picked', 2,
    'block','Upper Kestrel', 'parent_id', v_rec::text));
  if (select v.value #>> '{}' from custom.record_values_versioned(v_org, v_child) v
       where v.field_key = 'parent_id') is distinct from v_rec::text then
    raise exception 'PART 7a FAILED — the split lot did not keep its parent.';
  end if;
  raise notice 'PART 7a PASSED — parent_id is the store''s key and containment is untouched.';

  -- ── PART 8 — AN OLD ORPHAN KEY DOES NOT BRICK THE RECORD IT IS ON. ──────────────────
  -- A row written before this door existed can still be edited: the key it carries is a row
  -- to REPAIR, never a reason a person can never save that record again. A key this write
  -- ADDS or CHANGES is this write's doing and is still refused — that is PART 4b.
  perform custom.record_update(v_org, v_old, jsonb_build_object('gallons', 335));
  if (select (v.value #>> '{}')::numeric from custom.record_values_versioned(v_org, v_old) v
       where v.field_key = 'gallons') <> 335 then
    raise exception 'PART 8 FAILED — the edit did not land.';
  end if;
  if (select v.value #>> '{}' from custom.record_values_versioned(v_org, v_old) v
       where v.field_key = 'brix') is null then
    raise exception 'PART 8 FAILED — the orphan value was lost by an unrelated edit.';
  end if;
  raise notice 'PART 8 PASSED — a record carrying an old orphan key is still editable, and the orphan value is not lost.';

  -- ── PART 9 — A TABLE CANNOT CLAIM A COLUMN IT NEVER DEFINED. ────────────────────────
  -- The same one-source-of-truth rule read from the other side. Real-data crew E put
  -- `client_site` into a table's `fields` array with no Field record behind it and nothing
  -- said a word. The check is DEFERRED, because both doors legitimately write the two halves
  -- in two statements — PART 3 above declared a column through custom.field_declare with
  -- this trigger live — so the suite asks for it early with SET CONSTRAINTS ALL IMMEDIATE,
  -- which is the same moment COMMIT would ask.
  begin
    perform custom.record_update(v_org, v_lots, jsonb_build_object('fields',
      (select jsonb_agg(e) || jsonb_build_array(jsonb_build_object('name','press_date'))
         from jsonb_array_elements(
                (select jsonb_agg(jsonb_build_object('name', f.data ->> 'key'))
                   from custom.applicable_fields(v_org, v_lots, null) f)) e)));
    set constraints all immediate;
    raise exception 'PART 9 FAILED — Harvest Lots now claims a "press_date" column that no field defines, and nothing said a word.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if position('"press_date"' in v_msg) = 0 then
      raise exception 'PART 9 FAILED — the refusal never names the claimed column: %', v_msg;
    end if;
  end;
  set constraints all deferred;
  raise notice 'PART 9 PASSED — a table that ends a transaction claiming an undefined column is refused, by name.';

  raise notice 'ALL PARTS PASSED — Kestrel Ridge Orchard.';
end $t$;

reset role;
rollback;
\echo '>>> rolled back — the main database is untouched'
