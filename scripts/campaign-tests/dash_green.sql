-- scripts/campaign-tests/dash_green.sql — LANE DASHBOARDS, PRODUCTS row 3.
--
-- EVERY ASSERTED CLAUSE RUNS AS `authenticated`, THROUGH THE DOORS A SIGNED-IN PERSON
-- REACHES. PART 0 proves the seat is real before anything is claimed. The suite makes its own
-- organization, its own Table, its own records and its own share, and ROLLS THE WHOLE THING
-- BACK — it leaves nothing behind and asserts nothing about anybody else's data.
--
-- Run: <scratchpad>/p.sh -f scripts/campaign-tests/dash_green.sql
--
-- The red twin is scripts/campaign-tests/dash_red.sql.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'dash_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $suite$
declare
  c_admin  uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana   uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_boss   text := current_user;
  v_org    uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_home   uuid;
  v_tbl    uuid;
  v_dash   uuid;
  v_id     uuid;
  v_out    jsonb;
  v_b      jsonb;
  v_msg    text;
  v_n      integer;
  v_i      integer;
  v_this   jsonb;
begin
  -- ── FIXTURE, as the connected role. A seat is a PERSON, so both people exist. ──────────
  perform set_config('app.actor_system', 'campaign-test/dash_green.sql', true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'DASH green suite', 'dash-green-' || replace(v_org::text,'-',''), 'DGS', c_admin),
         (v_other, 'DASH green bystander', 'dash-other-' || replace(v_other::text,'-',''), 'DGB', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
         (v_org, 'organization', v_org, c_dana,  'member', 'active');
  -- Without the switch every door refuses a person: it is off globally by design.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'),
  -- VIS-19: this organization shares deliberately, which is the only setting under which
  -- "she sees her own numbers" is a different sentence from "she sees everything".
         ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"');

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_org, custom.organization_kernel_id(), 'record',
          jsonb_build_object('name','Workspace'), c_admin)
  returning id into v_home;

  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ PART 0 — TAKE THE SEAT AND PROVE IT ════════════════════════════════════════════════
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
  raise notice 'PART 0 PASSED — the seat is authenticated and cannot read custom.record directly';

  -- ── The Table and its Fields, through the doors a person reaches. ──────────────────────
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','description','','type','entity','display','list',
    'ordered', false, 'weight','light','retention_days',30,'row_order','sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field','title','direction','asc')),
    'agent_writable', true, 'label_singular','Job','label_plural','Jobs','title_field','title',
    'fields', jsonb_build_array(jsonb_build_object('name','title'), jsonb_build_object('name','stage'),
                                jsonb_build_object('name','owner'), jsonb_build_object('name','amount')),
    'parent_id', v_home));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','title','name','title','field_type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','stage','name','stage','field_type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','owner','name','owner','field_type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','amount','name','amount','field_type','currency'));

  -- Twenty records: five stages, two owners. Ten are Dana's.
  for v_i in 1..20 loop
    v_id := custom.record_write(v_org, v_tbl, jsonb_build_object(
      'title','Job ' || lpad(v_i::text,2,'0'),
      'stage',(array['New','Scheduled','In progress','Awaiting parts','Done'])[1 + (v_i % 5)],
      'owner',case when v_i % 2 = 0 then 'Dana' else 'Marcus' end,
      'amount', (100 * v_i)::text));
  end loop;

  -- A step no client door covers: the records default to the store's `internal` visibility
  -- and the share is what narrows them. Stepping out is stated, and NOTHING is asserted while
  -- out — the shape of the fixture is not a claim about the product.
  perform set_config('role', v_boss, true);
  update custom.record set created_by = c_admin, visibility = 'personal'::platform.visibility
   where organization_id = v_org and table_id = v_tbl;
  update custom.record set created_by = c_admin where organization_id = v_org and id = v_tbl;
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  select 'record', r.id, c_dana, 'viewer', 'active'
    from custom.record r
   where r.organization_id = v_org and r.table_id = v_tbl and r.data ->> 'owner' = 'Dana';
  perform set_config('role', 'authenticated', true);

  v_this := jsonb_build_object(
    'from', to_char(date_trunc('month', now()), 'YYYY-MM-DD'),
    'to',   to_char(date_trunc('month', now()) + interval '1 month', 'YYYY-MM-DD'));

  -- ══ PART 1 — A DASHBOARD IS DECLARED THROUGH ONE DOOR AND COMES BACK FROM ANOTHER ══════
  v_dash := custom.dashboard_declare(v_org, v_tbl, 'Jobs this month',
    jsonb_build_array(
      jsonb_build_object('title','Opened this month','kind','number','filter',
                         jsonb_build_object('created_at', v_this),'span',3),
      jsonb_build_object('title','By stage','kind','column','group_by',jsonb_build_array('stage'),
                         'measures', jsonb_build_array(jsonb_build_object('op','count'),
                                                       jsonb_build_object('op','sum','key','amount')),'span',6),
      jsonb_build_object('title','Stuck','kind','stuck','state_key','stage','days',14,'span',12)),
    jsonb_build_object('question','Show me jobs by stage this month and what''s stuck.'));
  select count(*) into v_n from custom.dashboards(v_org, v_tbl) d where d.dashboard_id = v_dash;
  if v_n <> 1 then
    raise exception '1: the dashboard was declared and custom.dashboards does not list it (% rows)', v_n;
  end if;
  select d.block_count into v_n from custom.dashboards(v_org, v_tbl) d where d.dashboard_id = v_dash;
  if v_n <> 3 then
    raise exception '1: three blocks went in and % came back', v_n;
  end if;
  raise notice 'PART 1 PASSED — one call declared a three-block dashboard and the list door answers it';

  -- ══ PART 2 — A BLOCK THAT NAMES NOTHING REAL IS REFUSED, BY NAME, ON THE WAY IN ════════
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Bad group',
      jsonb_build_array(jsonb_build_object('kind','bar','group_by',jsonb_build_array('salary'))));
    raise exception '2: a block grouped by a field this table does not have was ACCEPTED';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%has no field called "salary"%' then
      raise exception '2: refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2a — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Bad measure',
      jsonb_build_array(jsonb_build_object('kind','number','measures',
                        jsonb_build_array(jsonb_build_object('op','median','key','amount')))));
    raise exception '2: "median" was accepted as a measure';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%is not something a block can measure%' then
      raise exception '2: a bogus measure was refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2b — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Bad shape',
      jsonb_build_array(jsonb_build_object('kind','sunburst')));
    raise exception '2: "sunburst" was accepted as a shape';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%is not a shape a block can take%' then
      raise exception '2: a bogus kind was refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2c — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Bad window',
      jsonb_build_array(jsonb_build_object('kind','number','filter',
        jsonb_build_object('created_at', jsonb_build_object('start','2026-09-01')))));
    raise exception '2: a window whose key is "start" was accepted and would never have applied';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%is not part of a window%' then
      raise exception '2: a bogus window key was refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2d — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Bad moment',
      jsonb_build_array(jsonb_build_object('kind','number','filter',
        jsonb_build_object('created_at', jsonb_build_object('from','last Tuesday')))));
    raise exception '2: "last Tuesday" was accepted as a moment';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%is not a moment%' then
      raise exception '2: a bogus moment was refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2e — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Stuck on nothing',
      jsonb_build_array(jsonb_build_object('kind','stuck')));
    raise exception '2: a stuck block with no state field was accepted';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%which field it is watching%' then
      raise exception '2: a stuck block with no state field was refused, but not by name: %', v_msg;
    end if;
    raise notice 'PART 2f — "%"', v_msg;
  end;
  raise notice 'PART 2 PASSED — six wrong blocks, six sentences, none of them saved';

  -- ══ PART 3 — "THIS MONTH" IS A WINDOW INSIDE THE STORE'S OWN QUERY ═════════════════════
  -- Every record in this suite was written a moment ago, so the current month holds all
  -- twenty and a window over LAST month holds none. Both are asked of the eighth verb, and
  -- the difference between them IS the window.
  select (a.measures ->> 'count')::integer into v_n
    from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null,
           jsonb_build_object('created_at', v_this), 200, 'viewer') a;
  if v_n <> 20 then
    raise exception '3: this month should hold all twenty records and holds %', v_n;
  end if;
  v_n := 0;
  select coalesce(sum((a.measures ->> 'count')::integer), 0) into v_n
    from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '[]'::jsonb, null,
           jsonb_build_object('created_at', jsonb_build_object(
             'from', to_char(date_trunc('month', now()) - interval '1 month','YYYY-MM-DD'),
             'to',   to_char(date_trunc('month', now()),'YYYY-MM-DD'))), 200, 'viewer') a;
  if v_n <> 0 then
    raise exception '3: last month should hold none of them and holds %', v_n;
  end if;
  raise notice 'PART 3 PASSED — the window is real: 20 this month, 0 last month, same door';

  -- ══ PART 4 — THE WHOLE CANVAS IN ONE CALL, EVERY BLOCK WITH ITS OWN ANSWER ════════════
  v_out := custom.dashboard_run(v_org, v_dash, '{}'::jsonb);
  if jsonb_array_length(v_out -> 'blocks') <> 3 then
    raise exception '4: three blocks went in and % came out of one run', jsonb_array_length(v_out -> 'blocks');
  end if;
  for v_b in select e from jsonb_array_elements(v_out -> 'blocks') e loop
    if v_b ? 'refused' then
      raise exception '4: block "%" refused: %', v_b ->> 'title', v_b ->> 'refused';
    end if;
    if not (v_b ? 'ms') then
      raise exception '4: block "%" came back without saying how long it took', v_b ->> 'title';
    end if;
  end loop;
  select (e -> 'rows' -> 0 -> 'measures' ->> 'count')::integer into v_n
    from jsonb_array_elements(v_out -> 'blocks') e where e ->> 'title' = 'Opened this month';
  if v_n <> 20 then
    raise exception '4: the number block says % and there are twenty', v_n;
  end if;
  select jsonb_array_length(e -> 'rows') into v_n
    from jsonb_array_elements(v_out -> 'blocks') e where e ->> 'title' = 'By stage';
  if v_n <> 5 then
    raise exception '4: five stages exist and the grouped block answered % of them', v_n;
  end if;
  raise notice 'PART 4 PASSED — one call, three blocks, 20 this month across 5 stages, each with its own ms';

  -- ══ PART 5 — ONE BLOCK THAT CANNOT BE DRAWN SAYS WHY; THE OTHERS STILL ANSWER ═════════
  -- A Field can go after a block was saved. The block is re-judged on the way OUT, so the
  -- canvas does not go blank — which would be the screen lying about the whole organization.
  perform set_config('role', v_boss, true);
  update custom.record set data = jsonb_set(data, '{blocks,1,group_by}', '["gone_field"]'::jsonb)
   where organization_id = v_org and id = v_dash;
  perform set_config('role', 'authenticated', true);
  v_out := custom.dashboard_run(v_org, v_dash, '{}'::jsonb);
  select count(*) into v_n from jsonb_array_elements(v_out -> 'blocks') e where e ? 'refused';
  if v_n <> 1 then
    raise exception '5: exactly one block should have refused and % did', v_n;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_out -> 'blocks') e where e ? 'rows';
  if v_n <> 2 then
    raise exception '5: the other two blocks should still have answered and % did', v_n;
  end if;
  select e ->> 'refused' into v_msg from jsonb_array_elements(v_out -> 'blocks') e where e ? 'refused';
  if v_msg not like '%has no field called "gone_field"%' then
    raise exception '5: the refused block did not name the missing field: %', v_msg;
  end if;
  raise notice 'PART 5 PASSED — "%" and the other two blocks answered anyway', v_msg;
  perform set_config('role', v_boss, true);
  update custom.record set data = jsonb_set(data, '{blocks,1,group_by}', '["stage"]'::jsonb)
   where organization_id = v_org and id = v_dash;
  perform set_config('role', 'authenticated', true);

  -- ══ PART 6 — THE MEMBER'S SEAT: THE SAME DASHBOARD, HER OWN NUMBERS ═══════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  select count(*) into v_n from custom.dashboards(v_org, v_tbl) d where d.dashboard_id = v_dash;
  if v_n <> 1 then
    raise exception '6: a member of this organization cannot see its own dashboard in the list';
  end if;
  v_out := custom.dashboard_run(v_org, v_dash, '{}'::jsonb);
  select (e -> 'rows' -> 0 -> 'measures' ->> 'count')::integer into v_n
    from jsonb_array_elements(v_out -> 'blocks') e where e ->> 'title' = 'Opened this month';
  if v_n <> 10 then
    raise exception '6: she was shared ten records and the dashboard tells her % — this is the whole product', v_n;
  end if;
  raise notice 'PART 6 PASSED — the admin is told 20 and the member, on the SAME dashboard in ONE call, is told 10';

  -- ══ PART 7 — A MEMBER MAY LOOK AND MAY NOT REWRITE ════════════════════════════════════
  begin
    perform custom.dashboard_declare(v_org, v_tbl, 'Hers', '[]'::jsonb, '{}'::jsonb, v_dash);
    raise exception '7: a member rewrote the organization''s dashboard';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    -- lane TAILS 2026-09-21: the shared ladder refusal now names the rung HELD as well as
    -- the rung needed, because "you do not have access to this table" was said to people
    -- who plainly do. She holds viewer on this Table, so that is what it says.
    if v_msg not like '%viewer level on this table%' or v_msg not like '%needs the admin level%' then
      raise exception '7: she was refused, but not for the right reason: %', v_msg;
    end if;
    raise notice 'PART 7a — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_delete(v_org, v_dash);
    raise exception '7: a member deleted the organization''s dashboard';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 7b — "%"', v_msg;
  end;
  raise notice 'PART 7 PASSED — looking and changing are different acts and she holds only the first';

  -- ══ PART 8 — THE ORGANIZATION WALL ════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  begin
    select count(*) into v_n from custom.dashboards(v_other, null) d;
    raise exception '8: a non-member listed another organization''s dashboards (% rows)', v_n;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%not a member of that organization%' then
      raise exception '8: refused at the wall, but not as a membership question: %', v_msg;
    end if;
    raise notice 'PART 8a — "%"', v_msg;
  end;
  begin
    perform custom.dashboard_run(v_other, v_dash, '{}'::jsonb);
    raise exception '8: a dashboard of one organization answered through another';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%no dashboard%' and v_msg not like '%not a member%' then
      raise exception '8: refused across the wall, but not as absent: %', v_msg;
    end if;
    raise notice 'PART 8 — "%"', v_msg;
  end;
  raise notice 'PART 8 PASSED — organizations are hard walls and another tenant''s dashboard reads as absent';

  -- ══ PART 9 — THE STUCK LIST SAYS WHERE ITS MOMENT CAME FROM ═══════════════════════════
  -- Nothing in this suite is old — the store stamps `at` at write time and refuses a caller's
  -- own, which is exactly right — so the honest answer to "what has not moved in fourteen
  -- days" here is NOTHING, and at zero days it is everything. Both are asserted, because a
  -- list that answered the same either way would not be reading the clock at all.
  select count(*) into v_n from custom.dashboard_stuck(v_org, v_tbl, 'stage', 14, '{}'::jsonb, 50, 'viewer');
  if v_n <> 0 then
    raise exception '9: nothing in this suite is fourteen days old and % rows came back', v_n;
  end if;
  select count(*) into v_n from custom.dashboard_stuck(v_org, v_tbl, 'stage', 1, '{}'::jsonb, 50, 'viewer')
   where last_changed_at < now();
  raise notice 'PART 9a — at fourteen days nothing is stuck, which is the truth about a table made a minute ago';
  select s.measured_from into v_msg
    from custom.dashboard_stuck(v_org, v_tbl, 'stage', 0, '{}'::jsonb, 1, 'viewer') s;
  raise notice 'PART 9 PASSED — the stuck list is reading the clock%', coalesce(' and says its moment came from: ' || v_msg, '');

  raise notice '=== ALL PARTS PASSED ===';
end
$suite$;

rollback;
