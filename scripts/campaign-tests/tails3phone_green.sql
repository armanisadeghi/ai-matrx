-- scripts/campaign-tests/tails3phone_green.sql — LANE TAILS-3's GREEN SUITE for
-- `tails3_a_phone_number_may_be_written_the_way_people_write_it.sql`.
--
-- THE USE CASE (owner's law, 2026-09-21: no fake test data). Harborline Veterinary House
-- Calls is a mobile small-animal vet practice working the Oakland hills: no clinic, one van,
-- two vets, and every appointment starts with a client giving a phone number. Its Clients
-- table holds the household, the pet, the number to call when the van is ten minutes out,
-- and a back line for the day-boarding kennel that has an extension. People write their own
-- phone numbers however they were taught to, and the practice cannot refuse a client because
-- of a parenthesis. Every name, column and value below is that practice's, the people are
-- synthesized, the numbers are 555 reservations, and the whole suite runs inside ONE
-- transaction that ends in ROLLBACK, so the main database is untouched.
--
-- IT TAKES THE SEAT. Everything after PART 0 runs as `authenticated` — the role PostgREST
-- gives a signed-in person — and every write goes through `custom.record_write`, the real
-- door, so these clauses are about the PRODUCT and not about the store's internals.
--
-- Run: psql <main dsn> -f scripts/campaign-tests/tails3phone_green.sql
-- Its RED twin is scripts/campaign-tests/tails3phone_red.sql, which asserts the SAME ten
-- spellings against the pattern this lane replaced and fails on the first one.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'tails3phone_green.sql'
\set requires 'exec:custom.table_declare'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_clients uuid;
  v_msg     text;
  v_rules   jsonb;
  v_pattern text;
  v_n       integer;
  v_pass    integer := 0;
  v_row     uuid;
  r         record;
begin
  perform set_config('app.actor_system', 'campaign-test/tails3phone_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harborline Veterinary House Calls',
     'harborline-veterinary-house-calls-'||substr(v_org::text,1,8), 'HVH', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
    values (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note)
    values ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/tails3phone_green');
  insert into custom.record (organization_id, table_id, data)
    values (v_org, null, jsonb_build_object('name','Harborline Veterinary House Calls'))
    returning id into v_home;

  -- THE PATTERN ITSELF IS AN INTERNAL. `custom.phone_pattern()` lives in a schema declared
  -- closed, so the client never calls it — it reaches the client already inside the Field
  -- document, which is the only way a rule is ever meant to travel. It is read HERE, as the
  -- owner, and compared from the seat below against what the Field actually carries.
  v_pattern := custom.phone_pattern();

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'PART 0 FAILED — this suite is not in the seat; it is %', current_user;
  end if;
  raise notice 'PART 0 PASSED — running as %, the role a signed-in person holds.', current_user;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — THE PRACTICE DECLARES ITS CLIENTS TABLE, WITH TWO PHONE COLUMNS.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_clients := custom.table_declare(v_org, jsonb_build_object(
    'name','clients', 'type','entity', 'slug','clients',
    'label_singular','Client', 'label_plural','Clients',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','household','direction','asc')),
    'title_field','household', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','household','type','text'),
      jsonb_build_object('name','pet_name','type','text'),
      jsonb_build_object('name','mobile','type','phone'),
      jsonb_build_object('name','kennel_line','type','phone'))));

  select count(*) into v_n from custom.applicable_fields(v_org, v_clients, null);
  if v_n <> 4 then
    raise exception 'PART 1 FAILED — four columns were declared and the store answers %.', v_n;
  end if;
  raise notice 'PART 1 PASSED — the Clients table exists with its two phone columns.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — THE PHONE COLUMN CARRIES THE NEW PATTERN, FROM THE ONE PLACE.
  -- Not "a pattern": the pattern `custom.phone_pattern()` holds, so a lane that changes one
  -- and not the other is caught here rather than by a customer.
  -- ════════════════════════════════════════════════════════════════════════════════════
  select f.data -> 'rules' into v_rules
    from custom.applicable_fields(v_org, v_clients, null) f
   where f.data ->> 'key' = 'mobile';
  if not exists (select 1 from jsonb_array_elements(coalesce(v_rules,'[]'::jsonb)) rule
                  where rule ->> 'kind' = 'pattern' and (rule ->> 'value') = v_pattern) then
    raise exception 'PART 2 FAILED — a new phone column''s pattern Rule is %, not the one custom.phone_pattern() holds.', v_rules;
  end if;
  raise notice 'PART 2 PASSED — a new phone column validates against custom.phone_pattern().';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — SEVEN REAL SPELLINGS, EACH ONE A CLIENT OF THIS PRACTICE, EACH ONE ACCEPTED
  --          THROUGH THE REAL DOOR FROM THE SEAT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  for r in
    select * from (values
      ('Okafor household',   'Biscuit',  '(415) 555-0178'),
      ('Delgado household',  'Rosie',    '415-555-0178'),
      ('Ruiz household',     'Miso',     '+1 415 555 0178'),
      ('Abernathy household','Pip',      '+44 20 7946 0958'),
      ('Nakamura household', 'Yuzu',     '415.555.0178'),
      ('Fontaine household', 'Clementine','(415)555-0178 x204'),
      ('Osei household',     'Kofi',     '4155550178')
    ) as t(household, pet, phone)
  loop
    begin
      v_row := custom.record_write(v_org, v_clients, jsonb_build_object(
        'household', r.household, 'pet_name', r.pet, 'mobile', r.phone));
    exception when others then
      get stacked diagnostics v_msg = message_text;
      raise exception 'PART 3 FAILED — the practice could not save %''s number written "%": %',
        r.household, r.phone, v_msg;
    end;
    if v_row is null then
      raise exception 'PART 3 FAILED — "%" was accepted and no record came back.', r.phone;
    end if;
    v_pass := v_pass + 1;
  end loop;
  if v_pass <> 7 then
    raise exception 'PART 3 FAILED — % of 7 spellings landed.', v_pass;
  end if;
  raise notice 'PART 3 PASSED — all 7 ordinary spellings of a phone number were accepted through custom.record_write, from the seat.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — AND THREE THINGS THAT ARE NOT PHONE NUMBERS ARE STILL REFUSED, IN WORDS.
  -- A pattern that accepts everything is not a fix, it is the absence of one.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_pass := 0;
  for r in
    select * from (values
      ('Whitlock household', 'Argos',  'call me on the landline'),
      ('Ingram household',   'Sable',  'dana.ingram@harborlinemail.example'),
      ('Petrakis household', 'Olive',  '415')
    ) as t(household, pet, phone)
  loop
    begin
      perform custom.record_write(v_org, v_clients, jsonb_build_object(
        'household', r.household, 'pet_name', r.pet, 'mobile', r.phone));
      raise exception 'PART 4 FAILED — "%" is not a phone number and the store took it.', r.phone;
    exception when sqlstate '23514' then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%not written the way this field expects%' then
        raise exception 'PART 4 FAILED — "%" was refused for the wrong reason: %', r.phone, v_msg;
      end if;
      v_pass := v_pass + 1;
    end;
  end loop;
  if v_pass <> 3 then
    raise exception 'PART 4 FAILED — % of 3 non-numbers were refused.', v_pass;
  end if;
  raise notice 'PART 4 PASSED — a sentence, an email address and a three-digit stub are each refused, in the product''s own words.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — THE KENNEL'S BACK LINE HAS AN EXTENSION, AND THE STORE KEEPS IT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_row := custom.record_write(v_org, v_clients, jsonb_build_object(
    'household','Harborline day boarding', 'pet_name','(kennel desk)',
    'mobile','+1 (415) 555-0178 ext. 204', 'kennel_line','415 555 0179 x12'));
  -- read back through the CLIENT door, not the table: this clause is about what a person
  -- sees on the record they just saved.
  select (custom.record_resolve(v_org, v_row) -> 'data' ->> 'mobile') into v_msg;
  if v_msg <> '+1 (415) 555-0178 ext. 204' then
    raise exception 'PART 5 FAILED — the practice typed "+1 (415) 555-0178 ext. 204" and the store kept "%".', v_msg;
  end if;
  raise notice 'PART 5 PASSED — an extension is accepted and the spelling the person typed is what came back.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — ONE CANONICAL FORM, ONE DISPLAY SPELLING, BOTH IN ONE PLACE.
  -- Five spellings of the SAME number are one number to the store, and the display function
  -- is what any surface asks when it holds a canonical number and must show it to a person.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'postgres', true);   -- the two helpers are internals of a closed schema
  if (select count(distinct custom.phone_canonical(p))
        from unnest(array['(415) 555-0178','415-555-0178','415.555.0178','(415)555-0178','4155550178']) p) <> 1 then
    raise exception 'PART 6 FAILED — five spellings of one number canonicalise to more than one value.';
  end if;
  if custom.phone_canonical('+1 (415) 555-0178 ext. 204') <> '+14155550178x204' then
    raise exception 'PART 6 FAILED — the canonical form of the kennel line is %.',
      custom.phone_canonical('+1 (415) 555-0178 ext. 204');
  end if;
  if custom.phone_display('4155550178') <> '(415) 555-0178'
     or custom.phone_display('+14155550178x204') <> '+1 (415) 555-0178 ext. 204'
     or custom.phone_display('+442079460958') <> '+442079460958' then
    raise exception 'PART 6 FAILED — the display spellings are %, %, %.',
      custom.phone_display('4155550178'), custom.phone_display('+14155550178x204'),
      custom.phone_display('+442079460958');
  end if;
  raise notice 'PART 6 PASSED — one canonical form for one number, and one display spelling that invents no grouping it cannot justify.';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — NO PHONE FIELD ANYWHERE IN THIS STORE STILL CARRIES EITHER OLD PATTERN.
  -- The class, not the instance: the door was fixed AND the rows that already existed were
  -- moved forward, so this clause is what would catch a third spelling appearing later.
  -- ════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'postgres', true);   -- a census across organizations, not a seat read
  select count(*) into v_n
    from custom.record fld, jsonb_array_elements(coalesce(fld.data -> 'rules','[]'::jsonb)) rule
   where fld.data_class = 'field' and fld.deleted_at is null
     and rule ->> 'kind' = 'pattern'
     and (rule ->> 'value') in ('^[+0-9][0-9 ()\-\.]{4,}$', '^[+]?[0-9 ().-]{7,20}$');
  if v_n <> 0 then
    raise exception 'PART 7 FAILED — % phone Field rows still carry one of the two old patterns.', v_n;
  end if;
  raise notice 'PART 7 PASSED — not one Field row in the store still carries either old phone pattern.';

  raise notice 'GREEN — 8 of 8 parts passed.';
end;
$t$;

rollback;
