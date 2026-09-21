-- scripts/campaign-tests/limitsfix_red.sql — LANE LIMITS-FIX's RED TWIN.
--
-- A suite that only ever goes green proves nothing. This file asserts that each thing the
-- lane made possible STILL FAILS when the thing it rests on is taken away — so the new
-- behaviour is a decision the store makes, not a check that quietly stopped running.
--
-- It is the same farm as the green suite: Cedar Hollow Farm Share, a CSA vegetable farm in
-- the Willamette Valley packing a weekly produce box for its subscribers. It takes the seat
-- (`authenticated`) and runs inside ONE transaction that ends in ROLLBACK.
--
-- Run: <scratchpad>/prod.sh -f scripts/campaign-tests/limitsfix_red.sql

\set ON_ERROR_STOP on
begin;
set local lock_timeout = '120s';
set local statement_timeout = '600s';

do $red$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_boxes uuid; v_red integer := 0; v_n integer; v_msg text;
begin
  if (select system_identifier from pg_control_system()) <> 7642734024280108049 then
    raise exception 'limitsfix_red.sql runs on the MAIN database only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
  perform set_config('app.actor_system', 'campaign-test/limitsfix_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cedar Hollow Farm Share', 'cedar-hollow-red-'||substr(v_org::text,1,8), 'CHF', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/limitsfix_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Hollow Farm')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'RED FAILED — this suite is not in the seat; it is %', current_user;
  end if;

  -- ── RED 1 — A FIELD THAT CANNOT BE MADE TAKES THE WHOLE TABLE WITH IT. ────────────────
  -- Materialising the declared fields must be ALL of them or none. A table that half exists
  -- — some columns real, the rest only named — is the exact state this lane removed, so it
  -- must not be reachable by declaring one bad column among good ones.
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','share_boxes', 'type','entity', 'slug','share_boxes',
      'label_singular','Weekly Share Box', 'label_plural','Weekly Share Boxes',
      'display','list', 'ordered', false, 'weight','light',
      'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
      'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
      'title_field','box_week', 'parent_id', v_home::text,
      'fields', jsonb_build_array(
        jsonb_build_object('name','box_week','type','datetime'),
        jsonb_build_object('name','crate_temperature','type','thermometer'))));
    raise notice 'RED 1 NOT RED — a column of a kind that does not exist was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%no kind of column called%' then
      raise notice 'RED 1 refused, but for the wrong reason: %', v_msg;
    else
      v_red := v_red + 1;
    end if;
  end;
  -- AND NOTHING OF THAT TABLE SURVIVES. The refusal happens inside a plpgsql exception
  -- block, which is a subtransaction, so the table row AND the Field rows written before
  -- the bad column are rolled back together — atomicity is structural here, not hopeful.
  -- Proven by counting the tables this organization can see: the refused one is not there.
  -- (The count itself is not asserted from the seat: `custom.record` is not readable as
  -- `authenticated` by design, and reaching around the doors to check would be the very
  -- thing `check:suites-take-the-seat` exists to stop. The subtransaction rollback is what
  -- makes it true, and RED 3 below proves the shape guard still runs at all.)

  -- ── RED 2 — A RELATION STILL HAS TO POINT AT A TABLE, UNDER EITHER WORD. ──────────────
  -- `target_table` is a synonym, not a back door: the new spelling must be judged by the
  -- same rule as the old one, or the synonym is a way past the check.
  v_boxes := custom.table_declare(v_org, jsonb_build_object(
    'name','share_boxes', 'type','entity', 'slug','share_boxes',
    'label_singular','Weekly Share Box', 'label_plural','Weekly Share Boxes',
    'display','list', 'ordered', false, 'weight','light',
    'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
    'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
    'title_field','box_week', 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name','box_week','type','datetime'))));

  begin
    perform custom.field_declare(v_org, v_boxes, jsonb_build_object(
      'name','collected_at', 'type','relation', 'target_table', v_home::text));
    raise notice 'RED 2 NOT RED — `target_table` pointed a column at a record that is not a Table.';
  exception when sqlstate '23503' then
    v_red := v_red + 1;
  end;

  -- ── RED 3 — A TABLE THAT DECLARES NO COLUMNS IS STILL REFUSED. ────────────────────────
  -- The whole materialisation rests on "every table names at least one column". If that
  -- stopped being true, a table could be born with nothing and nobody would be told.
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','empty_boxes', 'type','entity', 'slug','empty_boxes',
      'label_singular','Empty Box', 'label_plural','Empty Boxes',
      'display','list', 'ordered', false, 'weight','light',
      'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
      'default_sort', '[]'::jsonb, 'title_field','box_week', 'parent_id', v_home::text,
      'fields', '[]'::jsonb));
    raise notice 'RED 3 NOT RED — a table with no columns was accepted.';
  exception when sqlstate '23514' then
    v_red := v_red + 1;
  end;

  -- ── RED 4 — THE COMBINED ANSWER IS NOT USED FOR A SINGLE PROBLEM. ─────────────────────
  -- If every refusal became "1 things need fixing", every screen and suite reading the
  -- original sentences would break, which is why the combining is conditional.
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name','share_boxes', 'type','entity', 'slug','share_boxes',
      'label_singular','Weekly Share Box', 'label_plural','Weekly Share Boxes',
      'display','postcard', 'ordered', false, 'weight','light',
      'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
      'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
      'title_field','box_week', 'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name','box_week','type','datetime'))));
    raise notice 'RED 4 NOT RED — an unknown display was accepted.';
  exception when sqlstate '23514' then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%things need fixing%' then
      raise notice 'RED 4 NOT RED — one problem was dressed up as a list: %', v_msg;
    else
      v_red := v_red + 1;
    end if;
  end;

  -- ── RED 5 — THE ORGANIZATION WALL STILL STANDS IN FRONT OF ALL OF IT. ─────────────────
  -- Every clause above runs inside one organization. None of this may be reachable in an
  -- organization the caller is not a member of.
  begin
    perform custom.table_declare(gen_random_uuid(), jsonb_build_object(
      'name','share_boxes', 'type','entity', 'slug','share_boxes',
      'label_singular','Weekly Share Box', 'label_plural','Weekly Share Boxes',
      'display','list', 'ordered', false, 'weight','light',
      'retention_days', 2555, 'row_order','sorted', 'agent_writable', true,
      'default_sort', jsonb_build_array(jsonb_build_object('field','box_week','direction','desc')),
      'title_field','box_week', 'parent_id', v_home::text,
      'fields', jsonb_build_array(jsonb_build_object('name','box_week','type','datetime'))));
    raise notice 'RED 5 NOT RED — a table was declared in an organization nobody belongs to.';
  exception when others then
    v_red := v_red + 1;
  end;

  if v_red <> 5 then
    raise exception 'RED TWIN FAILED — only % of 5 clauses went red; a guard this lane depends on has stopped biting.', v_red;
  end if;
  raise notice 'RED TWIN PASSED — all 5 clauses refused, from the seat `authenticated`.';
end
$red$;

rollback;
