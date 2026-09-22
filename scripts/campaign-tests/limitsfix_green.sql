-- scripts/campaign-tests/limitsfix_green.sql — LANE LIMITS-FIX's GREEN SUITE.
--
-- THE USE CASE (owner's law, 2026-09-21: no fake test data). Cedar Hollow Farm Share is a
-- CSA vegetable farm in the Willamette Valley. Every week it packs a produce box for each
-- subscriber and needs to know what went into which box, where it was collected, and how
-- many shares that week carried. Its second table is the pickup sites the boxes go to. Every
-- name, column and value below is that farm's, and the whole suite runs inside ONE
-- transaction that ends in ROLLBACK, so the main database is untouched.
--
-- IT TAKES THE SEAT. Everything after PART 0 runs as `authenticated` — the role PostgREST
-- gives a signed-in person — so these clauses are about the PRODUCT and not about the store's
-- internals. Setup before PART 0 runs as the owner, exactly as storet_green.sql does.
--
-- Run: <scratchpad>/prod.sh -f scripts/campaign-tests/limitsfix_green.sql

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'limitsfix_green.sql'
\set requires 'grant:authenticated:custom.table_declare'
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
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_boxes uuid; v_sites uuid; v_rel uuid; v_extra uuid; v_kennel uuid;
  v_n integer; v_msg text; v_keys text[]; v_types text[]; v_want text;
  v_begin jsonb; v_res jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/limitsfix_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cedar Hollow Farm Share', 'cedar-hollow-farm-share-'||substr(v_org::text,1,8), 'CHF', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/limitsfix_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Hollow Farm')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'PART 0 FAILED — this suite is not in the seat; it is %', current_user;
  end if;
  raise notice 'PART 0 PASSED — running as %, the role a signed-in person holds.', current_user;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — EVERY PROBLEM WITH THE TABLE, IN ONE ANSWER.
  -- The farmer's first attempt leaves out five things. Before this lane that was five
  -- round trips against the live database, one sentence at a time.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','share_boxes', 'type','entity', 'slug','share_boxes',
      'label_singular','Share Box', 'label_plural','Share Boxes',
      'display','list', 'ordered', false,
      'title_field','box_week', 'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name','box_week','type','datetime'))));
    raise exception 'PART 1 FAILED — a spec missing weight, retention_days, default_sort, row_order and agent_writable was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%5 things need fixing%' then
      raise exception 'PART 1 FAILED — five things are wrong and the refusal was: %', v_msg;
    end if;
    foreach v_want in array array['heavy or light','how long it keeps its history',
                                  'how its records are sorted by default','orders its rows by hand',
                                  'whether an agent may write to it'] loop
      if position(v_want in v_msg) = 0 then
        raise exception 'PART 1 FAILED — the one answer never mentions "%": %', v_want, v_msg;
      end if;
    end loop;
  end;
  raise notice 'PART 1 PASSED — five problems, one refusal, each one named with its meaning.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — ONE PROBLEM STILL SAYS EXACTLY WHAT IT ALWAYS SAID.
  -- Nothing that reads these words has to change, which is why the combining is conditional.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','share_boxes', 'type','entity', 'slug','Share Boxes',
      'label_singular','Share Box', 'label_plural','Share Boxes',
      'display','list', 'ordered', false, 'weight','light',
      'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
      'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
      'title_field','box_week', 'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name','box_week','type','datetime'))));
    raise exception 'PART 2 FAILED — a slug with spaces and capitals was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a table needs a slug made of lower-case letters, digits and underscores' then
      raise exception 'PART 2 FAILED — the single-problem sentence changed, and it is now: %', v_msg;
    end if;
  end;
  raise notice 'PART 2 PASSED — one problem, the original sentence, byte for byte.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — THE FIELDS A TABLE DECLARES EXIST, IMMEDIATELY, IN THE ORDER THEY WERE WRITTEN.
  -- This is the clause real-data crew D failed on 2026-09-21: four columns declared, a row
  -- written using all four, and `fields()` answering an empty array.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_boxes := custom.table_declare(v_org, jsonb_build_object(
    'name','share_boxes', 'type','entity', 'slug','share_boxes',
    'label_singular','Weekly Share Box', 'label_plural','Weekly Share Boxes',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
    'title_field','box_week', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','box_week','type','datetime'),
      jsonb_build_object('name','pickup_site','type','text'),
      jsonb_build_object('name','subscriber_count','type','number'),
      jsonb_build_object('name','packing_notes','type','long_text'))));

  select count(*) into v_n from custom.applicable_fields(v_org, v_boxes, null);
  if v_n <> 4 then
    raise exception 'PART 3 FAILED — the farm declared four columns and the store answers %.', v_n;
  end if;
  select array_agg(f.data ->> 'key' order by (f.data ->> 'sort')::numeric)
    into v_keys from custom.applicable_fields(v_org, v_boxes, null) f;
  if v_keys <> array['box_week','pickup_site','subscriber_count','packing_notes'] then
    raise exception 'PART 3 FAILED — the columns came back in the wrong order: %', v_keys;
  end if;
  raise notice 'PART 3 PASSED — four columns declared, four columns readable, in the order the farmer wrote them.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — ONE WORD FOR WHAT A PERSON READS ON THE COLUMN.
  -- The table spec's word is `name`; the field door used to answer only to `label` and told
  -- a caller sending `name` that "a field needs a name".
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_extra := custom.field_declare(v_org, v_boxes,
    jsonb_build_object('name','share_size','type','text'));
  if v_extra is null then
    raise exception 'PART 4 FAILED — field_declare answered nothing for a field named with `name`.';
  end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_boxes, null)
   where (data ->> 'key') = 'share_size';
  if v_n <> 1 then
    raise exception 'PART 4 FAILED — the share size column is not readable after being declared with `name`.';
  end if;
  raise notice 'PART 4 PASSED — `name` and `label` mean the same thing at both doors.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 5 — A COLUMN THAT POINTS AT ANOTHER OF THE FARM'S OWN TABLES, NAMED EITHER WAY.
  -- Real-data crew E reported this was impossible; it was possible under one spelling only.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_sites := custom.table_declare(v_org, jsonb_build_object(
    'name','pickup_sites', 'type','entity', 'slug','pickup_sites',
    'label_singular','Pickup Site', 'label_plural','Pickup Sites',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','site_name','direction','asc')),
    'title_field','site_name', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','site_name','type','text'),
      jsonb_build_object('name','host_contact','type','text'))));

  v_rel := custom.field_declare(v_org, v_boxes, jsonb_build_object(
    'name','collected_at', 'type','relation', 'target_table', v_sites::text));
  select array_agg(f.data ->> 'relation_target') into v_types
    from custom.applicable_fields(v_org, v_boxes, null) f where f.data ->> 'key' = 'collected_at';
  if v_types is null or v_types[1] is distinct from v_sites::text then
    raise exception 'PART 5 FAILED — a relation named with `target_table` does not point at the Pickup Sites table: %', v_types;
  end if;
  raise notice 'PART 5 PASSED — a table-to-table relation declares from the seat, under either word.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 6 — THE FARM CAN ACTUALLY USE IT: a real week's box, written and read back.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  perform custom.record_write(v_org, v_sites, jsonb_build_object(
    'site_name','Hollis Street Co-op', 'host_contact','Marisol Venn', 'parent_id', v_home::text));
  perform custom.record_write(v_org, v_boxes, jsonb_build_object(
    'box_week','2026-09-16T00:00:00Z', 'pickup_site','Hollis Street Co-op',
    'subscriber_count', 148, 'share_size','Full share',
    'packing_notes','Delicata squash came in light this week; made up the weight with chard.',
    'parent_id', v_home::text));
  select count(*) into v_n from custom.read_records(v_org, v_boxes, false, 50, 0);
  if v_n <> 1 then
    raise exception 'PART 6 FAILED — the week''s box was written and the store reads back % rows.', v_n;
  end if;
  raise notice 'PART 6 PASSED — the farm declared its table, its columns and its relation, and packed a box through the doors.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 7 — A COLUMN CALLED `name`, AND DECLARING IT TWICE.
  -- Real-data crew E2: New record and import both refused with 23505 on a table whose own
  -- column is literally called `name`. Real-data crew A: 409 on a brand-new table's own
  -- default Title, because the create path declares it and the import path declares it
  -- again. Both are one thing — saying the same true thing twice was read as a
  -- contradiction. The farm's boarding kennel neighbour has exactly that column.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_kennel := custom.table_declare(v_org, jsonb_build_object(
    'name','boarders', 'type','entity', 'slug','boarders',
    'label_singular','Boarder', 'label_plural','Boarders',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','name','direction','asc')),
    'title_field','name', 'parent_id', v_home::text,
    'fields', jsonb_build_array(
      jsonb_build_object('name','name','type','text'),
      jsonb_build_object('name','breed','type','text'),
      jsonb_build_object('name','nightly_rate','type','currency'))));
  select count(*) into v_n from custom.applicable_fields(v_org, v_kennel, null);
  if v_n <> 3 then
    raise exception 'PART 7 FAILED — a table whose own column is called "name" has % columns.', v_n;
  end if;

  -- the same column, declared again, is the same column
  if custom.field_declare(v_org, v_kennel, jsonb_build_object('name','name','type','text')) is null then
    raise exception 'PART 7 FAILED — re-declaring the same column answered nothing.';
  end if;
  select count(*) into v_n from custom.applicable_fields(v_org, v_kennel, null);
  if v_n <> 3 then
    raise exception 'PART 7 FAILED — re-declaring the same column made a second one (% now).', v_n;
  end if;

  -- but a DIFFERENT type is a real conflict and is still refused
  begin
    perform custom.field_declare(v_org, v_kennel, jsonb_build_object('name','name','type','number'));
    raise exception 'PART 7 FAILED — retyping a live column to a number was accepted silently.';
  exception when sqlstate '23505' then
    null;
  end;
  perform custom.record_write(v_org, v_kennel, jsonb_build_object(
    'name','Biscuit', 'breed','Border Collie', 'nightly_rate', 48, 'parent_id', v_home::text));
  raise notice 'PART 7 PASSED — a column called `name` works, declaring it twice is idempotent, retyping it is refused.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- PART 8 — AN IMPORT ROW WITH NOTHING IN IT IS NOT A RECORD.
  -- Real-data crew C: the import "silently writes fully-empty rows when nothing maps".
  -- Crew E2 hit its mirror image — "Write N rows" reporting success and persisting none.
  -- The farm's supplier sends a price list with a stray blank line and a column the farm's
  -- table has never had.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_begin := custom.io_import_begin(v_org, v_boxes, 'csv', 'hollis-street-week-38.csv',
               jsonb_build_array('Box Week','Pickup Site','Subscriber Count'));
  v_res := custom.io_import_rows(v_org, (v_begin ->> 'import_id')::uuid, jsonb_build_array(
    jsonb_build_object('Box Week','2026-09-23','Pickup Site','Hollis Street Co-op','Subscriber Count','151'),
    jsonb_build_object(),
    jsonb_build_object('Truck Bay','North dock','Driver Note','back gate code 4417')
  ), jsonb_build_object('Box Week','box_week','Pickup Site','pickup_site','Subscriber Count','subscriber_count'));

  select count(*) into v_n from jsonb_array_elements(v_res -> 'outcomes') e
   where e ->> 'outcome' = 'landed';
  if v_n <> 1 then
    raise exception 'PART 8 FAILED — one of the three rows is a real week and % landed.', v_n;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_res -> 'outcomes') e
   where e ->> 'outcome' = 'refused' and e ->> 'reason' like '%nothing to save%';
  if v_n <> 2 then
    raise exception 'PART 8 FAILED — the blank line and the unmatched line should both be refused with a reason; % were.', v_n;
  end if;
  -- AND THE OFFER SURVIVES THE REFUSAL: a column this table has never had is still proposed,
  -- so refusing the row never costs the person the chance to add the column.
  if not exists (select 1 from jsonb_array_elements(coalesce(v_res -> 'proposals','[]'::jsonb)) p
                  where p ->> 'column' = 'Truck Bay') then
    raise exception 'PART 8 FAILED — refusing the row also threw away the offer to add its column.';
  end if;
  raise notice 'PART 8 PASSED — the real week landed, the blank line and the unmatched line were refused by name, and their columns are still offered.';

  raise notice 'ALL PARTS PASSED — from the seat `authenticated`, through the doors a signed-in person reaches.';
end
$t$;

rollback;
