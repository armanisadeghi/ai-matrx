-- scripts/campaign-tests/import_green.sql — LANE IMPORT (PRODUCTS row 9)
--
-- "PULL MY SPREADSHEET IN, AND FILE ANYTHING SENT TO THIS ADDRESS."
--
-- EVERY ASSERTED CLAUSE RUNS AS `authenticated`, THROUGH THE DOORS A SIGNED-IN PERSON
-- REACHES. PART 0 proves the seat before anything else and raises if it is not held. The
-- only statements outside the seat are the FIXTURE (an organization, its memberships, its
-- switch) which no client door creates, and each one says so.
--
-- Run:  <scratchpad>/imp/p.sh -f scripts/campaign-tests/import_green.sql
-- It ends in ROLLBACK and leaves nothing.

-- THE SHARED DATABASE IS SHARED. Several lanes write `custom.record` at once and the
-- server's default lock_timeout is short, so a suite that asserts real behaviour loses to
-- somebody else's DDL rather than to a defect. Waiting is the honest answer; weakening a
-- clause would not be. It is `set local` inside the suite's OWN transaction because the
-- pooler hands each statement a different backend and a session-level SET would not survive
-- to the statement that needs it — measured 2026-09-20, the suite still died at 5 s.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
declare
  c_admin   uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text;
  c_dana_j  text;
  v_boss    text := current_user;
  v_org     uuid;
  v_home    uuid;
  v_acct    uuid;
  v_tbl     uuid;
  v_imp     uuid;
  v_r       jsonb;
  v_plan    jsonb;
  v_col     jsonb;
  v_doc     jsonb;
  v_n       integer;
  v_addr    text;
  v_said    text;
  v_north   uuid;
  v_acme    uuid;
begin
  c_admin_j := jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text;
  c_dana_j  := jsonb_build_object('sub', c_dana,  'role', 'authenticated')::text;
  perform set_config('app.actor_system', 'campaign-test/import_green.sql', true);

  -- ── FIXTURE, as the connected role. No client door makes an organization, a
  --    membership or a knob override, and this suite asserts nothing while it is out here.
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Blue Ridge Recycling',
          'blue-ridge-recycling-green-' || substr(md5(random()::text), 1, 8), 'BRR', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner',  'active', 'organization', v_org),
         (v_org, c_dana,  'member', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true');

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — TAKE THE SEAT AND PROVE IT
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
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
  raise notice 'PART 0 — the seat is authenticated and it is a client seat.';

  -- ── the two tables this suite imports into, built through the doors ─────────
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name', 'IMPORT Home'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Accounts','slug','accounts','type','entity',
    'label_singular','Account','label_plural','Accounts','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  v_north := custom.record_write(v_org, v_acct, jsonb_build_object('title','Northwind Trading'));
  v_acme  := custom.record_write(v_org, v_acct, jsonb_build_object('title','Fairbanks Wholesale Supply'));

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Deals','slug','deals','type','entity',
    'label_singular','Deal','label_plural','Deals','title_field','deal','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','deal')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Deal','key','deal','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Closes','key','closes','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Stage','key','stage','type','select','options', jsonb_build_array('Open','Won','Lost')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Owner','key','owner','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Account','key','account','type','relation','relation_target', v_acct::text));

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE STORE SAYS WHAT EVERY COLUMN IS, READING THIS ORGANIZATION
  -- ════════════════════════════════════════════════════════════════════════════
  v_plan := custom.io_import_plan(v_org, v_tbl, jsonb_build_array(
    jsonb_build_object('header','Deal',    'samples', jsonb_build_array('A','B')),
    jsonb_build_object('header','Amount',  'samples', jsonb_build_array('$1,250.00','$90')),
    jsonb_build_object('header','Region',  'samples', jsonb_build_array('North','South','North','South','North','South')),
    jsonb_build_object('header','Contact', 'samples', jsonb_build_array('admin@admin.com')),
    jsonb_build_object('header','Stranger','samples', jsonb_build_array('dispatch@blueridgerecycling.com'))));

  select c into v_col from jsonb_array_elements(v_plan -> 'columns') c where c ->> 'header' = 'Deal';
  if not (v_col ->> 'matched')::boolean or v_col ->> 'field_key' <> 'deal' then
    raise exception '1a: a column this table already has was not matched: %', v_col;
  end if;
  select c into v_col from jsonb_array_elements(v_plan -> 'columns') c where c ->> 'header' = 'Region';
  if v_col ->> 'type' <> 'select' or not (v_col -> 'options' ? 'North') then
    raise exception '1b: six rows holding two words are a list of choices, and the store said %', v_col;
  end if;
  select c into v_col from jsonb_array_elements(v_plan -> 'columns') c where c ->> 'header' = 'Contact';
  if v_col ->> 'type' <> 'member' then
    raise exception '1c: an address belonging to a member of THIS organization is a person, and the store said %', v_col ->> 'type';
  end if;
  select c into v_col from jsonb_array_elements(v_plan -> 'columns') c where c ->> 'header' = 'Stranger';
  if v_col ->> 'type' <> 'email' then
    raise exception '1d: an address belonging to NOBODY here is an email and not a person, and the store said %', v_col ->> 'type';
  end if;
  raise notice 'PART 1 — matched / choice / person / email, each with its sentence.';

  -- A TABLE THAT DOES NOT EXIST YET is the case the product is named after.
  v_plan := custom.io_import_plan(v_org, null, jsonb_build_array(
    jsonb_build_object('header','Day rate', 'samples', jsonb_build_array('$450.00','$500.00'))));
  select c into v_col from jsonb_array_elements(v_plan -> 'columns') c where c ->> 'header' = 'Day rate';
  if v_col ->> 'type' <> 'currency' or v_col ->> 'unit' <> 'USD' then
    raise exception '1e: a file can be planned before its table exists, and money is money: %', v_col;
  end if;
  if jsonb_array_length(v_plan -> 'fields') <> 0 then
    raise exception '1f: a table that does not exist has no columns, and the plan listed %', v_plan -> 'fields';
  end if;
  raise notice 'PART 1e — a file is planned before the table it is for exists.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE RUN, AND THE THREE OUTCOMES
  -- ════════════════════════════════════════════════════════════════════════════
  v_r := custom.io_import_begin(v_org, v_tbl, 'csv', 'deals.csv', '[]'::jsonb,
           'green-hash-0001', jsonb_build_object('on_duplicate','skip','unmapped','propose'),
           'deal', 2048, false);
  if (v_r ->> 'already')::boolean then
    raise exception '2a: the first run of a file was answered as a repeat: %', v_r;
  end if;
  v_imp := (v_r ->> 'import_id')::uuid;

  v_r := custom.io_import_rows(v_org, v_imp, jsonb_build_array(
    jsonb_build_object('Deal','Roof job','Amount','$1,250.00','Closes','2026-10-01','Stage','Open','Owner','admin@admin.com','Account','Northwind Trading','Region','North'),
    jsonb_build_object('Deal','Yard job','Amount','(45.50)','Closes','11/30/2026','Stage','Won','Owner','admin@admin.com','Account','Fairbanks Wholesale Supply','Region','South'),
    jsonb_build_object('Deal','Bad job','Amount','about a grand','Closes','2026-10-02','Stage','Open'),
    jsonb_build_object('Deal','Ghost job','Amount','$10','Account','Nobody Ltd'),
    jsonb_build_object('Deal','Roof job','Amount','$9','Stage','Lost')
  ), jsonb_build_object('Deal','deal','Amount','amount','Closes','closes','Stage','stage','Owner','owner','Account','account'));

  if (v_r ->> 'rows_written')::int <> 2 then
    raise exception '2b: two rows should have landed and % did: %', v_r ->> 'rows_written', v_r;
  end if;
  if (v_r ->> 'rows_duplicate')::int <> 1 then
    raise exception '2c: the repeated deal should be ONE duplicate and there were %', v_r ->> 'rows_duplicate';
  end if;
  if (v_r ->> 'rows_refused')::int <> 2 then
    raise exception '2d: two rows are unimportable and % were refused', v_r ->> 'rows_refused';
  end if;

  -- A REFUSAL SAYS WHY, AND CARRIES THE ROW.
  select o into v_col from jsonb_array_elements(v_r -> 'outcomes') o
   where o ->> 'outcome' = 'refused' and o -> 'source' ->> 'Deal' = 'Bad job';
  if v_col is null or v_col ->> 'reason' not like '%is a number column and "about a grand" is not a number%' then
    raise exception '2e: the refused row does not say why in the store''s own words: %', v_col;
  end if;
  if v_col -> 'source' ->> 'Amount' <> 'about a grand' then
    raise exception '2f: the refused row does not carry the line of the file it came from: %', v_col;
  end if;
  select o into v_col from jsonb_array_elements(v_r -> 'outcomes') o
   where o ->> 'outcome' = 'refused' and o -> 'source' ->> 'Deal' = 'Ghost job';
  if v_col ->> 'reason' not like 'There is no "Nobody Ltd" for "Account" to point at yet%' then
    raise exception '2g: a name that points at nothing is refused BY NAME, and it said: %', v_col ->> 'reason';
  end if;
  raise notice 'PART 2 — landed 2, already here 1, refused 2, each refusal with its reason and its row.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 3 — WHAT LANDED IS IN THE SHAPE ITS COLUMN WANTS, AND SAYS WHERE IT CAME FROM
  -- ════════════════════════════════════════════════════════════════════════════
  select x.document into v_doc
    from custom.read_records(v_org, v_tbl, false, 20, 0) x
   where x.document ->> 'deal' = 'Yard job';
  if v_doc is null then
    raise exception '3a: the row that landed cannot be read back through the read door';
  end if;
  if (v_doc ->> 'amount')::numeric <> -45.50 then
    raise exception '3b: "(45.50)" is how a spreadsheet writes a negative amount, and the store holds %', v_doc ->> 'amount';
  end if;
  if v_doc ->> 'closes' <> '2026-11-30' then
    raise exception '3c: 11/30/2026 read month-first is 2026-11-30, and the store holds %', v_doc ->> 'closes';
  end if;
  if v_doc -> '_choices' -> 'stage' ->> 'label' <> 'Won' then
    raise exception '3d: the choice should read back as its label and it read %', v_doc -> '_choices' -> 'stage';
  end if;
  -- THROUGH A DOOR, not over the table: this seat holds no privilege on custom.record and
  -- must not — `custom.work_person(..., false)` answers the person-kernel record this
  -- organization keeps for that account, which is exactly what the cell should hold.
  if (v_doc ->> 'owner')::uuid is distinct from custom.work_person(v_org, c_admin, false) then
    raise exception '3e: an email in a person column should be the person this organization keeps, and it is %', v_doc ->> 'owner';
  end if;
  if (v_doc ->> 'account')::uuid <> v_acme then
    raise exception '3f: "Fairbanks Wholesale Supply" in a pointing column should be that record, and it is %', v_doc ->> 'account';
  end if;
  if v_doc -> '_source' ->> 'via' <> 'import' or v_doc -> '_source' ->> 'file' <> 'deals.csv' then
    raise exception '3g: a record that came from a file says so, and this one says %', v_doc -> '_source';
  end if;
  raise notice 'PART 3 — money, date, choice, person, pointer and provenance, all through the read door.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 4 — A RE-IMPORT DOUBLES NOTHING
  -- ════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n from custom.read_records(v_org, v_tbl, false, 200, 0);
  v_r := custom.io_import_begin(v_org, v_tbl, 'csv', 'deals.csv', '[]'::jsonb,
           'green-hash-0001', '{}'::jsonb, 'deal', 2048, false);
  if not (v_r ->> 'already')::boolean then
    raise exception '4a: the same file was opened a second time as a new run: %', v_r;
  end if;
  if v_r ->> 'message' not like 'This file was already imported into this table%' then
    raise exception '4b: the second run does not say when the first one ran: %', v_r ->> 'message';
  end if;
  if (v_r ->> 'import_id')::uuid <> v_imp then
    raise exception '4c: the second run answered a DIFFERENT run id';
  end if;
  if (select count(*) from custom.read_records(v_org, v_tbl, false, 200, 0)) <> v_n then
    raise exception '4d: opening the same file again changed the number of records';
  end if;
  -- AND `force` IS A DELIBERATE ACT, not a default.
  v_r := custom.io_import_begin(v_org, v_tbl, 'csv', 'deals.csv', '[]'::jsonb,
           'green-hash-0001', '{}'::jsonb, 'deal', 2048, true);
  if (v_r ->> 'already')::boolean then
    raise exception '4e: force did not open a new run';
  end if;
  raise notice 'PART 4 — the same file twice writes nothing; force is deliberate.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE COLUMN THIS TABLE DOES NOT HAVE GOES TO THE ONE INBOX
  -- ════════════════════════════════════════════════════════════════════════════
  v_r := custom.io_import_finish(v_org, v_imp, 'propose');
  if (v_r ->> 'columns_offered')::int <> 1 then
    raise exception '5a: the one unmapped column should be offered once and % were', v_r ->> 'columns_offered';
  end if;
  select p into v_col from jsonb_array_elements(v_r -> 'proposals') p where p ->> 'column' = 'Region';
  if v_col ->> 'state' <> 'waiting' or nullif(v_col ->> 'approval_id','') is null then
    raise exception '5b: the offered column is not waiting in the queue: %', v_col;
  end if;
  -- THE SAME INBOX A COLLEAGUE'S REQUEST AND AN AGENT'S PROPOSAL LAND IN.
  select w.title into v_said from custom.work_inbox(v_org, 20, 0, false) w
   where w.item_id = (v_col ->> 'approval_id')::uuid;
  if v_said is null then
    raise exception '5c: the offered column is not in the ONE inbox';
  end if;
  if v_said not like '%Region%' then
    raise exception '5d: the inbox row does not name the column: %', v_said;
  end if;
  raise notice 'PART 5 — the unmapped column is waiting in the one inbox: "%".', v_said;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 6 — THE REPORT A PERSON CLICKS THROUGH
  -- ════════════════════════════════════════════════════════════════════════════
  v_r := custom.io_import_report(v_org, v_imp, 'refused', 10, 0);
  if (v_r ->> 'total')::int <> 2 or jsonb_array_length(v_r -> 'rows') <> 2 then
    raise exception '6a: the refused rows are not readable back: %', v_r;
  end if;
  if (v_r -> 'rows' -> 0 -> 'source') is null then
    raise exception '6b: a refused row without the row is a number nobody can act on';
  end if;
  v_r := custom.io_import_report(v_org, v_imp, 'duplicate', 10, 0);
  if (v_r ->> 'total')::int <> 1 then
    raise exception '6c: the duplicate row is not readable back: %', v_r;
  end if;
  raise notice 'PART 6 — the refused and already-here rows come back WITH the row.';

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 7 — DOOR-19: A TABLE CAN HAVE AN ADDRESS, AND IT SAYS WHAT DNS OWES
  -- ════════════════════════════════════════════════════════════════════════════
  v_r := custom.inbound_declare(v_org, v_tbl, 'deals');
  v_addr := v_r ->> 'address';
  if v_addr not like 'deals%@%' then
    raise exception '7a: the address does not look like an address: %', v_addr;
  end if;
  if v_r ->> 'mail_route' not like '%MX record%' then
    raise exception '7b: an address that cannot say what DNS owes would swallow mail silently: %', v_r ->> 'mail_route';
  end if;
  if not exists (select 1 from jsonb_array_elements(custom.inbound_addresses(v_org, v_tbl)) a
                  where a ->> 'address' = v_addr and (a ->> 'enabled')::boolean) then
    raise exception '7c: the address this organization just made is not in its own list';
  end if;
  v_r := custom.inbound_set(v_org, (v_r ->> 'inbound_id')::uuid, false);
  if v_r ->> 'message' not like '%is off.%' then
    raise exception '7d: switching an address off does not say so: %', v_r ->> 'message';
  end if;
  raise notice 'PART 7 — % exists, says what DNS owes, and can be switched off.', v_addr;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 8 — THE WALLS, FROM A SECOND PERSON'S SEAT (still seated)
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- THE CONTROL: she is a member, so she may ask the store about her own organization.
  begin
    perform custom.io_imports(v_org, null, 10);
  exception when others then
    raise exception '8a: a member of this organization cannot list its imports at all: %', sqlerrm;
  end;

  -- She was shared nothing, so she may not start an import into this Table.
  begin
    perform custom.io_import_begin(v_org, v_tbl, 'csv', 'hers.csv', '[]'::jsonb,
              'dana-hash', '{}'::jsonb, null, null, false);
    raise exception '8b: somebody who was shared nothing opened an import into this table';
  exception when insufficient_privilege then
    raise notice 'PART 8b — she is refused, by the ladder, in the store''s own words.';
  when others then
    if sqlstate = '42501' then
      raise notice 'PART 8b — she is refused, by the ladder, in the store''s own words.';
    else
      raise exception '8b: she was refused for the wrong reason (%): %', sqlstate, sqlerrm;
    end if;
  end;

  -- And she may not give this Table an address, which is an admin's act.
  begin
    perform custom.inbound_declare(v_org, v_tbl, 'hers');
    raise exception '8c: somebody who was shared nothing gave this table an address';
  exception when others then
    if sqlstate = '42501' then
      raise notice 'PART 8c — she cannot give somebody else''s table an address.';
    else
      raise exception '8c: she was refused for the wrong reason (%): %', sqlstate, sqlerrm;
    end if;
  end;

  perform set_config('role', v_boss, true);
  raise notice 'ALL PARTS PASSED (0 seat … 8 the walls).';
end $$;

rollback;
