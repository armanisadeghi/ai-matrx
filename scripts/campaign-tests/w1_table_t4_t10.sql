-- W1-TABLE — T4, T10 and the containment refusals, against the REHEARSAL BRANCH.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_table_t4_t10.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is
-- discovered by no sweep, and its single transaction ends in ROLLBACK, so it leaves the
-- branch exactly as it found it. It is also the one place this lane's laws are executed
-- rather than asserted in prose.
--
-- WHAT MAKES IT FAIL. Every assertion below is a POSITIVE query with a stated expected
-- value, and the refusal assertions compare the TRIGGER'S OWN MESSAGE — never the mere
-- presence of an error, which a typo would also produce. The production change that makes
-- each one fail is named beside it. Its RED twin is `w1_table_red.sql`, which turns each
-- guard off inside a rolled-back transaction and proves the same writes then LAND.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization, the Matrx System
-- organization, with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org        constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_kernel_org constant uuid := '11111111-0000-4000-8000-000000000004';  -- kernel Table `Organization`
  v_hq         uuid;
  v_color      uuid;
  v_red        uuid;
  v_paint_tbl  uuid;
  v_paint      uuid;
  v_rel        uuid;
  v_project    uuid;
  v_x          uuid;
  v_y          uuid;
  v_risk       uuid;
  v_incident   uuid;
  v_note_tbl   uuid;
  v_note       uuid;
  v_r1         uuid;
  v_r2         uuid;
  v_i1         uuid;
  v_prev       uuid;
  v_next       uuid;
  v_relcount_before integer;
  v_relcount_after  integer;
  v_n          integer;
  v_txt        text;
  v_msg        text;
  v_ok         boolean;
  v_ids        uuid[];
begin
  -- Nothing here may create a Postgres relation. T4's law is "nothing migrates", and the
  -- whole ruling is that a Table is a ROW: if this count moves, the projection has quietly
  -- become a second relation and every other assertion in this file is beside the point.
  select count(*) into v_relcount_before
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom';

  -- A Home for everything below: one record of the kernel Table `Organization`.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_kernel_org, 'record', jsonb_build_object('name', 'W1-TABLE HQ'))
  returning id into v_hq;

  -- ════════════════════════════════════════════════════════════════════════════
  -- T4 — CATEGORY GROWS UP (REC-1, REC-2, REC-25, REC-66, REC-N-17)
  -- "Red is a record of Color, display: list, title field only. Two years and many
  --  records later, Color gains hex and shade Fields and becomes display: page. Every
  --  record still relates to the same Red. Nothing migrates."
  -- ════════════════════════════════════════════════════════════════════════════

  v_color := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Color', 'slug', 'color',
    'label_singular', 'Colour', 'label_plural', 'Colours',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted',
    'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name',
    'parent_id', v_hq::text));

  -- REC-1 read back through the projection, not out of the jsonb we just wrote.
  select display into v_txt from custom."table" where id = v_color;
  if v_txt <> 'list' then raise exception 'T4 setup: Color should be display list, is %', v_txt; end if;
  select jsonb_array_length(fields) into v_n from custom."table" where id = v_color;
  if v_n <> 1 then raise exception 'T4 setup: Color should have exactly its title field, has % fields', v_n; end if;

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_color, jsonb_build_object('name', 'Red'), 'record')
  returning id into v_red;

  -- "many records later": a second Table whose records relate to Red.
  v_paint_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Paint', 'slug', 'paint',
    'label_singular', 'Paint', 'label_plural', 'Paints',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq::text));

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_paint_tbl, jsonb_build_object('name', 'Barn red'), 'record')
  returning id into v_paint;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', false, 'role', 'colour',
                             'from', v_paint, 'to', v_red))
  returning id into v_rel;

  -- ── two years later: Color gains Fields and becomes a page ───────────────────
  update custom.record
     set data = data
              || jsonb_build_object('display', 'page')
              || jsonb_build_object('fields', jsonb_build_array(
                   jsonb_build_object('name', 'name',  'kind', 'text'),
                   jsonb_build_object('name', 'hex',   'kind', 'text'),
                   jsonb_build_object('name', 'shade', 'kind', 'text')))
   where organization_id = v_org and id = v_color;

  select display into v_txt from custom."table" where id = v_color;
  if v_txt <> 'page' then raise exception 'T4: Color did not become a page, it is %', v_txt; end if;
  select jsonb_array_length(fields) into v_n from custom."table" where id = v_color;
  if v_n <> 3 then raise exception 'T4: Color should carry three fields, carries %', v_n; end if;

  -- "Every record still relates to the same Red."
  select (data ->> 'to')::uuid into v_next from custom.record where organization_id = v_org and id = v_rel;
  if v_next is distinct from v_red then
    raise exception 'T4: the relation no longer points at the same Red (% vs %)', v_next, v_red;
  end if;
  select count(*) into v_n from custom.record
   where organization_id = v_org and table_id = v_color and deleted_at is null;
  if v_n <> 1 then raise exception 'T4: Color should still hold exactly its one record, holds %', v_n; end if;
  select id into v_next from custom.record where organization_id = v_org and id = v_red;
  if v_next is distinct from v_red then raise exception 'T4: Red changed identity'; end if;

  -- "Nothing migrates." No relation was created, altered or dropped by any of it.
  select count(*) into v_relcount_after
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'custom';
  if v_relcount_after <> v_relcount_before then
    raise exception 'T4: schema custom gained or lost % relation(s) - a Table is a ROW, and growing one may not be DDL',
                    v_relcount_after - v_relcount_before;
  end if;
  raise notice 'T4 GREEN - Color grew from list/1 field to page/3 fields, Red kept its id %, its relation still resolves, and schema custom still holds % relations', v_red, v_relcount_after;

  -- ════════════════════════════════════════════════════════════════════════════
  -- T10 — TWO HOMES, ONE TABLE (REC-3, REC-11, REC-14, REC-26)
  -- "Project X and Project Y each hold Risk, declared once at the organization. All
  --  risks returns both sets... Project Y also has its own Table, Incident, whose Home
  --  is Y. A principal shared on X alone sees X's risks, cannot tell Y's risks exist,
  --  and cannot see that a Table called Incident exists, nor its Fields."
  -- ════════════════════════════════════════════════════════════════════════════

  v_project := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'project',
    'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq::text));

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_project, jsonb_build_object('name', 'Project X', 'parent_id', v_hq::text), 'record')
  returning id into v_x;
  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_project, jsonb_build_object('name', 'Project Y', 'parent_id', v_hq::text), 'record')
  returning id into v_y;

  -- Risk is DECLARED ONCE, at the organization: its declared Home is the organization
  -- record itself (REC-1's exactly one Home), and X and Y are additional Homes (REC-3).
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'risk',
    'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));

  perform custom.home_add(v_org, v_risk, v_x);
  perform custom.home_add(v_org, v_risk, v_y);

  -- Y's own Table, Home Y and nowhere else.
  v_incident := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Incident', 'slug', 'incident',
    'label_singular', 'Incident', 'label_plural', 'Incidents',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_y::text));

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_risk, jsonb_build_object('title', 'X risk', 'parent_id', v_x::text), 'record')
  returning id into v_r1;
  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_risk, jsonb_build_object('title', 'Y risk', 'parent_id', v_y::text), 'record')
  returning id into v_r2;
  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_incident, jsonb_build_object('title', 'Y incident', 'parent_id', v_y::text), 'record')
  returning id into v_i1;

  -- REC-3 / REC-26: one Table, three Homes - one declared, two referenced carrying.
  select count(*) into v_n from custom.home where organization_id = v_org and table_id = v_risk;
  if v_n <> 3 then raise exception 'T10: Risk should appear in three Homes (declared + X + Y), appears in %', v_n; end if;
  select count(*) into v_n from custom.home
   where organization_id = v_org and table_id = v_risk and kind = 'declared';
  if v_n <> 1 then raise exception 'T10 / REC-1: Risk must have exactly ONE declared Home, it has %', v_n; end if;

  -- "All risks returns both sets."
  select count(*) into v_n from custom.record
   where organization_id = v_org and table_id = v_risk and deleted_at is null;
  if v_n <> 2 then raise exception 'T10: all risks should return both sets (2), returned %', v_n; end if;

  -- "cannot see that a Table called Incident exists, nor its Fields" - structurally:
  -- Incident is at no Home reachable from X, so a scope of X never names it.
  select array_agg(table_id order by table_id) into v_ids
    from custom.tables_at_home(v_org, array[v_x]);
  if not (v_risk = any (v_ids)) then raise exception 'T10: Risk is not at Home in X'; end if;
  if v_incident = any (v_ids) then
    raise exception 'T10: Incident is visible from X - a Table Home to Y alone must not appear there';
  end if;
  select array_agg(table_id order by table_id) into v_ids
    from custom.tables_at_home(v_org, array[v_y]);
  if not (v_risk = any (v_ids) and v_incident = any (v_ids)) then
    raise exception 'T10: Y should hold both Risk and Incident';
  end if;

  -- "sees X's risks, cannot tell Y's risks exist" - structurally, over the closure.
  select array_agg(record_id) into v_ids from custom.reachable_from(v_org, array[v_x]);
  if not (v_r1 = any (v_ids)) then raise exception 'T10: X''s own risk is not reachable from X'; end if;
  if v_r2 = any (v_ids) then raise exception 'T10: Y''s risk is reachable from X'; end if;
  if v_i1 = any (v_ids) then raise exception 'T10: Y''s incident is reachable from X'; end if;

  -- REC-3: the same Table in the same Record twice is one placement, refused by name.
  begin
    perform custom.home_add(v_org, v_risk, v_x);
    raise exception 'T10: a duplicate Home was accepted';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'that table already has a home there' then
      raise exception 'T10: the duplicate-Home refusal said "%"', v_msg;
    end if;
  end;

  -- REC-11: a `detail` Table inherits only - its records cannot be Homes.
  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk note', 'slug', 'risk_note',
    'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'detail', 'parent_token', 'risk',
    'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body', 'kind', 'text')),
    'title_field', 'body', 'parent_id', v_hq::text));
  select detail into v_ok from custom."table" where id = v_note_tbl;
  if v_ok is not true then raise exception 'REC-1/REC-66: the detail Table does not read back as detail'; end if;

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_note_tbl, jsonb_build_object('body', 'a note', 'parent_id', v_r1::text), 'record')
  returning id into v_note;

  begin
    perform custom.home_add(v_org, v_risk, v_note);
    raise exception 'REC-11: a detail record was accepted as a Home';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a detail record cannot be a home' then
      raise exception 'REC-11: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'T10 GREEN - Risk declared once with one declared Home and two additional Homes, all risks = 2, Incident invisible from X, Y''s risk unreachable from X, duplicate Home and detail Home both refused by name';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-7 — ZERO OR ONE PARENT, NEVER TWO
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    update custom.record
       set data = data || jsonb_build_object('parent_id', jsonb_build_array(v_x::text, v_y::text))
     where organization_id = v_org and id = v_r1;
    raise exception 'REC-7: two parents were accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a record has zero or one parent, never two' then
      raise exception 'REC-7: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'REC-7 GREEN - an array of parents is refused: "a record has zero or one parent, never two"';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-8 and REC-N-4 — THE TREE AND THE CEILING, AT THE EDGE
  -- The ceiling is 16 and the organization has set nothing, so the deepest record this
  -- organization may hold sits at chain length 16. HQ is 1, so fifteen records fit under
  -- it; the sixteenth would be DEPTH 17 and is refused there, by the trigger's own words.
  -- ════════════════════════════════════════════════════════════════════════════
  if custom.containment_depth_ceiling(v_org) <> 16 then
    raise exception 'REC-N-4: the ceiling this organization gets is %, not 16', custom.containment_depth_ceiling(v_org);
  end if;

  v_prev := v_hq;                                  -- depth 1
  for i in 2..16 loop                              -- depths 2 … 16
    insert into custom.record (organization_id, table_id, data, data_class)
    values (v_org, v_project,
            jsonb_build_object('name', format('chain %s', i), 'parent_id', v_prev::text), 'record')
    returning id into v_next;
    v_prev := v_next;
  end loop;
  select max(depth) into v_n from custom.containment_chain(v_org, v_prev);
  if v_n <> 15 then raise exception 'REC-N-4 setup: the deepest record has % ancestors, expected 15', v_n; end if;

  -- DEPTH 17 — the write one past the ceiling.
  begin
    insert into custom.record (organization_id, table_id, data, data_class)
    values (v_org, v_project,
            jsonb_build_object('name', 'chain 17', 'parent_id', v_prev::text), 'record');
    raise exception 'REC-N-4: a record at depth 17 was accepted under a ceiling of 16';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'that is more things inside things than this organization allows' then
      raise exception 'REC-N-4: the depth refusal said "%"', v_msg;
    end if;
    if v_msg like '%16%' or v_msg like '%17%' then
      raise exception 'REC-N-4: the refusal quoted a number the organization never set: "%"', v_msg;
    end if;
  end;

  -- REPARENT UNDER A DESCENDANT, at the same depth-17 edge: put HQ - the root of that
  -- sixteen-long chain - inside its own deepest descendant.
  begin
    perform custom.record_reparent(v_org, v_hq, v_prev);
    raise exception 'REC-8: a reparent under a descendant was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this would put it inside itself' then
      raise exception 'REC-8: the reparent refusal said "%"', v_msg;
    end if;
  end;

  -- and the shortest cycle of all.
  begin
    perform custom.record_reparent(v_org, v_x, v_x);
    raise exception 'REC-8: a record was accepted as its own container';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'this would put it inside itself' then
      raise exception 'REC-8: the self-parent refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'REC-8 / REC-N-4 GREEN - depth 17 refused as "that is more things inside things than this organization allows" with no number quoted; a reparent under a descendant and a self-parent both refused as "this would put it inside itself"';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-10 — AN OWNED RELATION MAKES ITS TARGET CONTAINED
  -- ════════════════════════════════════════════════════════════════════════════
  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_paint_tbl, jsonb_build_object('name', 'loose paint'), 'record')
  returning id into v_next;
  select array_agg(record_id) into v_ids from custom.reachable_from(v_org, array[v_x]);
  if v_next = any (v_ids) then raise exception 'REC-10 setup: the target is contained before the owned relation'; end if;

  perform custom.relation_own(v_org, v_x, v_next);
  select array_agg(record_id) into v_ids from custom.reachable_from(v_org, array[v_x]);
  if not (v_next = any (v_ids)) then
    raise exception 'REC-10: an owned relation did not make its target contained';
  end if;
  select custom.containment_parent(data) into v_prev from custom.record where organization_id = v_org and id = v_next;
  if v_prev is distinct from v_x then
    raise exception 'REC-10: the owned target''s parent is %, expected the owner %', v_prev, v_x;
  end if;
  raise notice 'REC-10 GREEN - an owned relation put its target inside the owner and into the closure';

  -- ════════════════════════════════════════════════════════════════════════════
  -- REC-1 / REC-2 — A HALF-DECLARED TABLE CANNOT BE STORED
  -- ════════════════════════════════════════════════════════════════════════════
  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name', 'Untitled', 'slug', 'untitled',
      'label_singular', 'U', 'label_plural', 'Us',
      'type', 'entity', 'display', 'list', 'ordered', false,
      'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'parent_id', v_hq::text));
    raise exception 'REC-2: a Table with no title field was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'a table needs a title field, or its records cannot be shown as chips' then
      raise exception 'REC-2: the refusal said "%"', v_msg;
    end if;
  end;

  begin
    perform custom.table_declare(v_org, jsonb_build_object(
      'name', 'Shortlived', 'slug', 'shortlived',
      'label_singular', 'S', 'label_plural', 'Ss',
      'type', 'entity', 'display', 'list', 'ordered', false,
      'weight', 'light', 'retention_days', 10,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
      'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
      'title_field', 'name', 'parent_id', v_hq::text));
    raise exception 'T14 / REC-1: a ten-day retention was stored';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'thirty days is the least history a table can keep' then
      raise exception 'REC-1 retention: the refusal said "%"', v_msg;
    end if;
  end;
  raise notice 'REC-1 / REC-2 GREEN - a Table with no title field and a Table below the retention floor are both refused by name';

  raise notice 'W1-TABLE SUITE GREEN';
end;
$t$;

rollback;
