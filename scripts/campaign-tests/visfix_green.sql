-- VIS-FIX — THE GREEN SUITE. Containment reaches the visibility ladder, and T1 runs.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/visfix_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered by no
-- sweep, and its single transaction ends in ROLLBACK, so it leaves the database exactly as it found
-- it — no records, no grants, no associations, no knob overrides.
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE question with a stated expected answer, asked
-- through `custom.has_visibility` — the ONE ladder the read doors ask — from the seat of a principal
-- who is NOT a member of the fixture organization, so nothing but the edge under test can answer
-- true. Its RED twin is `visfix_red.sql`, which turns the trigger off and puts the old bodies back
-- inside a rolled-back transaction and proves every one of these answers flips.
--
-- THE IDENTITIES. It writes as the connected owner into ONE organization — "V78 Blank Org", where
-- `admin@admin.com` is a member and `test@test.com` (Dana, the principal every clause below asks
-- about) is NOT — with freshly generated ids, and rolls back. It signs nobody in and reads no
-- credential.

\set ON_ERROR_STOP on
\timing off

begin;
set local statement_timeout = '300s';
select set_config('app.actor_system', 'visfix_green_suite', true);

do $t$
declare
  v_org    constant uuid := '344cfaa8-2b0c-4971-854a-9694614816f2';  -- V78 Blank Org
  v_korg   constant uuid := '11111111-0000-4000-8000-000000000004';  -- kernel Table `Organization`
  v_dana   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, not a member
  v_hq uuid; v_proj uuid; v_x uuid; v_y uuid; v_risk uuid; v_inc uuid;
  v_r1 uuid; v_r2 uuid; v_i1 uuid; v_note_tbl uuid; v_note uuid;
  v_a uuid; v_b uuid; v_c uuid; v_child uuid;
  v_t0 timestamptz; v_ms numeric; v_n integer; v_rows integer;
begin
  -- ── fixtures ───────────────────────────────────────────────────────────────────────────
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_korg, 'record', jsonb_build_object('name', 'VIS-FIX HQ'))
  returning id into v_hq;

  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'visfix_project', 'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_proj, 'record', jsonb_build_object('name', 'Project X', 'parent_id', v_hq::text))
  returning id into v_x;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_proj, 'record', jsonb_build_object('name', 'Project Y', 'parent_id', v_hq::text))
  returning id into v_y;

  -- T10: Risk is declared ONCE at the organization and placed in BOTH projects.
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'visfix_risk', 'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.home_add(v_org, v_risk, v_x);
  perform custom.home_add(v_org, v_risk, v_y);

  -- Y's own Table, Home Y and nowhere else.
  v_inc := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Incident', 'slug', 'visfix_incident', 'label_singular', 'Incident', 'label_plural', 'Incidents',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_y::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_risk, 'record', jsonb_build_object('title', 'X risk', 'parent_id', v_x::text))
  returning id into v_r1;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_risk, 'record', jsonb_build_object('title', 'Y risk', 'parent_id', v_y::text))
  returning id into v_r2;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_inc, 'record', jsonb_build_object('title', 'Y incident', 'parent_id', v_y::text))
  returning id into v_i1;

  -- T2: a Note whose parent is its author's Home, carried by three records of three Tables.
  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Note', 'slug', 'visfix_note', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body', 'kind', 'text')),
    'title_field', 'body', 'parent_id', v_hq::text));
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_note_tbl, 'record', jsonb_build_object('body', 'the note', 'parent_id', v_hq::text))
  returning id into v_note;

  v_a := v_x;                                                     -- A, a Project
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_risk, 'record', jsonb_build_object('title', 'B, a Risk', 'parent_id', v_hq::text))
  returning id into v_b;                                          -- B, a different Table
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_inc, 'record', jsonb_build_object('title', 'C, an Incident', 'parent_id', v_hq::text))
  returning id into v_c;                                          -- C, a third Table

  insert into custom.record (organization_id, table_id, data_class, data)
  select v_org, null, 'relation',
         jsonb_build_object('kind', 'referenced', 'carrying', true, 'from', s, 'to', v_note)
    from unnest(array[v_a, v_b, v_c]) s;

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — CONTAINMENT REACHES THE LADDER (the defect, and T3's read half)
  -- ════════════════════════════════════════════════════════════════════════════════════════
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_x, v_dana, 'viewer', 'active');

  if not custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception 'CLAUSE 1: shared on Project X, Dana cannot see the risk inside it';
  end if;
  if custom.has_visibility(v_dana, 'record', v_r1, 'editor') then
    raise exception 'CLAUSE 1: a viewer grant conveyed EDIT down the containment';
  end if;
  if custom.has_visibility(v_dana, 'record', v_r2, 'viewer') then
    raise exception 'CLAUSE 1: Dana sees a risk inside Project Y, which she is not shared on';
  end if;

  -- REPARENT (T3): after the commit, no read returns the moved record to her.
  update custom.record set data = data || jsonb_build_object('parent_id', v_y::text) where id = v_r1;
  if custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception 'CLAUSE 1: the record was moved out of X and Dana still sees it';
  end if;
  update custom.record set data = data || jsonb_build_object('parent_id', v_x::text) where id = v_r1;
  if not custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception 'CLAUSE 1: the record came back under X and Dana does not see it';
  end if;

  -- TRASH and RESTORE.
  update custom.record set deleted_at = now() where id = v_r1;
  if custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception 'CLAUSE 1: a trashed record still reaches the ladder';
  end if;
  update custom.record set deleted_at = null where id = v_r1;
  if not custom.has_visibility(v_dana, 'record', v_r1, 'viewer') then
    raise exception 'CLAUSE 1: a restored record lost its containment edge';
  end if;
  raise notice '[GREEN] clause 1 — create, reparent, trash and restore all move the ladder with the store.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — T10, TWO HOMES FOR ONE TABLE
  -- ════════════════════════════════════════════════════════════════════════════════════════
  if not custom.has_visibility(v_dana, 'record', v_risk, 'viewer') then
    raise exception 'CLAUSE 2 (T10): shared on X, Dana cannot see that the Risk Table exists';
  end if;
  if custom.has_visibility(v_dana, 'record', v_inc, 'viewer') then
    raise exception 'CLAUSE 2 (T10): Dana can tell that Y''s own Table Incident exists';
  end if;
  if custom.has_visibility(v_dana, 'record', v_i1, 'viewer') then
    raise exception 'CLAUSE 2 (T10): Dana can see a record of Y''s own Table';
  end if;
  select count(*) into v_n
    from custom.home_relations() hr
   where hr.organization_id = v_org and hr.table_id = v_risk;
  if v_n <> 2 then
    raise exception 'CLAUSE 2 (T10): Risk has % homes, expected 2', v_n;
  end if;
  raise notice '[GREEN] clause 2 (T10) — one Table, two Homes; shared on X she sees X''s risks and the Risk Table, and neither Y''s risks nor that Incident exists.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — T2, A NOTE ON THREE RECORDS OF THREE TABLES
  -- ════════════════════════════════════════════════════════════════════════════════════════
  if not custom.has_visibility(v_dana, 'record', v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): a viewer on A does not see the note carried by A';
  end if;
  if custom.has_visibility(v_dana, 'record', v_note, 'editor') then
    raise exception 'CLAUSE 3 (T2): a referenced carrying relation conveyed EDIT';
  end if;

  -- Unshare A: she loses it.
  delete from iam.permissions
   where resource_type = 'record' and resource_id = v_x and granted_to_user_id = v_dana;
  if custom.has_visibility(v_dana, 'record', v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): A was unshared and she still sees the note';
  end if;

  -- Share C: she sees it again, through a different Table entirely.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
  values ('record', v_c, v_dana, 'viewer', 'active');
  if not custom.has_visibility(v_dana, 'record', v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): C was shared and she does not see the note';
  end if;

  -- A principal shared on none of A, B, C or the author sees nothing.
  delete from iam.permissions
   where resource_type = 'record' and resource_id = v_c and granted_to_user_id = v_dana;
  if custom.has_visibility(v_dana, 'record', v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): shared on none of A, B, C, she still sees the note';
  end if;
  raise notice '[GREEN] clause 3 (T2) — the note follows A, then C, and vanishes when neither is shared.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — THERE IS ONE STORED FORM OF CONTAINMENT
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- `custom.containment_edges` is the store's own cascade walk. It now READS the associations, so
  -- it and the ladder cannot disagree: every edge one of them has, the other has.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_risk, 'record', jsonb_build_object('title', 'deep', 'parent_id', v_r1::text))
  returning id into v_child;
  select count(*) into v_n
    from custom.containment_edges(v_org) e
   where e.parent_id = v_r1 and e.child_id = v_child;
  if v_n <> 1 then
    raise exception 'CLAUSE 4: the store''s own walk lost an edge the ladder has (% rows)', v_n;
  end if;
  select count(*) into v_n
    from custom.carrying_edges e
   where e.container_id = v_r1 and e.item_id = v_child;
  if v_n <> 1 then
    raise exception 'CLAUSE 4: the ladder lost an edge the store''s walk has (% rows)', v_n;
  end if;
  if not exists (select 1 from custom.reachable_from(v_org, array[v_x]) f where f.record_id = v_child) then
    raise exception 'CLAUSE 4: the cascade walk no longer reaches a grandchild of X';
  end if;
  raise notice '[GREEN] clause 4 — the cascade walk and the ladder read the SAME edge; no second path left.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 5 — T1: THE CUTOVER DIFF AND THE REBUILD BOTH FINISH
  -- ════════════════════════════════════════════════════════════════════════════════════════
  v_t0 := clock_timestamp();
  select count(*) into v_n from custom.visibility_parity();
  v_ms := extract(epoch from (clock_timestamp() - v_t0)) * 1000;
  raise notice '[GREEN] clause 5 (T1) — custom.visibility_parity() returned % difference(s) in % ms.',
    v_n, round(v_ms, 1);
  if v_ms > 10000 then
    raise exception 'CLAUSE 5 (T1): the diff took % ms; it has to finish well inside the database''s own limit', round(v_ms, 1);
  end if;

  v_t0 := clock_timestamp();
  select custom.visibility_cache_rebuild() into v_rows;
  v_ms := extract(epoch from (clock_timestamp() - v_t0)) * 1000;
  raise notice '[GREEN] clause 5 (T1) — custom.visibility_cache_rebuild() wrote % rows in % ms.',
    v_rows, round(v_ms, 1);
  if v_ms > 10000 then
    raise exception 'CLAUSE 5 (T1): the rebuild took % ms', round(v_ms, 1);
  end if;
  if v_rows <= 0 then
    raise exception 'CLAUSE 5 (T1): the rebuild wrote nothing, so the cache is not rebuildable from the associations';
  end if;
  select count(*) into v_n from custom.visibility_cache;
  if v_n <> v_rows then
    raise exception 'CLAUSE 5 (T1): the rebuild claimed % rows and the cache holds %', v_rows, v_n;
  end if;

  raise notice '[GREEN] VIS-FIX: all five clauses pass.';
end;
$t$;

rollback;
