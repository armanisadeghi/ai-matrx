-- VIS-FIX — THE GREEN SUITE. Containment reaches the visibility ladder, and T1 runs.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the main database DSN>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/visfix_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/`, is discovered by no
-- sweep, and its single transaction ends in ROLLBACK, so it leaves the database exactly as it found
-- it — no organization, no records, no grants, no associations, no knob overrides.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). This suite used to ask `custom.has_visibility`
-- directly, as the role that OWNS `custom.record`, about a principal who was not signed in and was
-- not even a member — and it wrote its fixtures with raw INSERTs into `custom.record` and
-- `iam.permissions`. `custom.has_visibility` holds no client grant at all, so every answer it gave
-- was the ladder's internal opinion and not what any screen would show. It now:
--   * builds ONE disposable organization of its own (it no longer writes into a real one),
--   * makes `admin@admin.com` its owner and `test@test.com` (Dana) a member, and sets that
--     organization's `custom/member_default_visibility` to `shared_only`, so MEMBERSHIP HANDS HER
--     NOTHING and only the edge under test can answer true — the property the old file got by
--     leaving her outside the organization, which no real client seat can reproduce,
--   * takes the seat `authenticated` in PART 0 and proves it holds it,
--   * asks every visibility clause as DANA HERSELF through `custom.query_can_see`, the door every
--     read in the store climbs, and writes every fixture through `custom.record_write`,
--     `custom.field_declare`, `custom.share_grant`, `custom.share_revoke`,
--     `custom.record_reparent`, `custom.record_delete`, `custom.record_restore`,
--     `custom.relation_carry`, `custom.home_add` and `custom.query_table_homes`.
-- The two steps no client door covers — the Home record, and the GLOBAL cache rebuild, which is a
-- maintenance lane and holds no client grant — leave the seat and say so.
--
-- WHAT MAKES IT FAIL. Every assertion is a POSITIVE question with a stated expected answer, asked
-- through the door a signed-in person reaches. Its RED twin is `visfix_red.sql`, which turns the
-- trigger off and puts the old bodies back inside a rolled-back transaction and proves every one
-- of these answers flips.

\set ON_ERROR_STOP on
\timing off

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'visfix_green.sql'
\set requires 'row:platform.feature_knob:feature = \'custom\' and key = \'member_default_visibility\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '60s';
-- CLAUSE 5's rebuild TRUNCATEs and refills the whole ladder cache, so it needs ACCESS
-- EXCLUSIVE on `custom.visibility_cache`. Under traffic it dies on the two-second lock_timeout
-- the runner sets; nothing here is a race — the clause is about whether the operator's job
-- finishes, not how fast it can grab the lock.
set local lock_timeout = '10s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_hq uuid; v_proj uuid; v_x uuid; v_y uuid; v_risk uuid; v_inc uuid;
  v_r1 uuid; v_r2 uuid; v_i1 uuid; v_note_tbl uuid; v_note uuid;
  v_a uuid; v_b uuid; v_c uuid; v_child uuid;
  v_t0 timestamptz; v_ms numeric; v_n integer; v_rows integer;
  v_boss text := current_user;   -- the connected role, for the two steps no door covers
begin
  perform set_config('app.actor_system', 'campaign-test/visfix_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Greenline Landscaping Crew — Riverside Yard', 'greenline-landscaping-riverside-' || substr(v_org::text, 1, 8), 'GLR', c_admin);
  -- A seat is a PERSON, and a person reaches an organization only through a membership.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'visfix_green'),
    -- THE PROPERTY THE WHOLE SUITE RESTS ON: in this organization membership conveys NOTHING, so
    -- every `true` below came from the one edge the clause is about.
    ('custom','member_default_visibility','organization', v_org, v_org, '"shared_only"'::jsonb, 'visfix_green');

  -- A Home record is made by the onboarding path, not by a person's browser, and no client door
  -- covers it. It is a fixture, and it is written before the seat is taken.
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'VIS-FIX HQ')) returning id into v_hq;

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

  -- ── fixtures, every one through the door a person has ─────────────────────────────────
  v_proj := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'visfix_project', 'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name')),
    'title_field', 'name', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_proj, jsonb_build_object('key','name','label','Name','plain','text','sort',10));

  v_x := custom.record_write(v_org, v_proj, jsonb_build_object('name','Project X','parent_id', v_hq::text));
  v_y := custom.record_write(v_org, v_proj, jsonb_build_object('name','Project Y','parent_id', v_hq::text));

  -- T10: Risk is declared ONCE at the organization and placed in BOTH projects.
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'visfix_risk', 'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_risk, jsonb_build_object('key','title','label','Title','plain','text','sort',10));
  perform custom.home_add(v_org, v_risk, v_x);
  perform custom.home_add(v_org, v_risk, v_y);

  -- Y's own Table, Home Y and nowhere else.
  v_inc := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Incident', 'slug', 'visfix_incident', 'label_singular', 'Incident', 'label_plural', 'Incidents',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title')),
    'title_field', 'title', 'parent_id', v_y::text));
  perform custom.field_declare(v_org, v_inc, jsonb_build_object('key','title','label','Title','plain','text','sort',10));

  v_r1 := custom.record_write(v_org, v_risk, jsonb_build_object('title','X risk','parent_id', v_x::text));
  v_r2 := custom.record_write(v_org, v_risk, jsonb_build_object('title','Y risk','parent_id', v_y::text));
  v_i1 := custom.record_write(v_org, v_inc,  jsonb_build_object('title','Y incident','parent_id', v_y::text));

  -- T2: a Note whose parent is its author's Home, carried by three records of three Tables.
  v_note_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Note', 'slug', 'visfix_note', 'label_singular', 'Note', 'label_plural', 'Notes',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'body')),
    'title_field', 'body', 'parent_id', v_hq::text));
  perform custom.field_declare(v_org, v_note_tbl, jsonb_build_object('key','body','label','Body','plain','text','sort',10));
  v_note := custom.record_write(v_org, v_note_tbl, jsonb_build_object('body','the note','parent_id', v_hq::text));

  v_a := v_x;                                                     -- A, a Project
  v_b := custom.record_write(v_org, v_risk, jsonb_build_object('title','B, a Risk','parent_id', v_hq::text));
  v_c := custom.record_write(v_org, v_inc,  jsonb_build_object('title','C, an Incident','parent_id', v_hq::text));

  -- THE DOOR, not an INSERT of a `relation` row: `custom.relation_carry` is how a person hangs
  -- one record off another, and it is what writes the association the ladder reads.
  perform custom.relation_carry(v_org, v_a, v_note);
  perform custom.relation_carry(v_org, v_b, v_note);
  perform custom.relation_carry(v_org, v_c, v_note);

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 1 — CONTAINMENT REACHES THE LADDER (the defect, and T3's read half)
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- THE SHARE DOOR, not an INSERT into iam.permissions.
  perform custom.share_grant(v_org, v_x, 'user', c_dana, 'viewer'::public.permission_level);

  -- AND THE QUESTION IS ASKED AS DANA, through `custom.query_can_see` — the one door every read
  -- in the store climbs. `custom.has_visibility` holds no client grant and is not a person's.
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 1: shared on Project X, Dana cannot see the risk inside it';
  end if;
  if custom.query_can_see(v_org, v_r1, 'editor') then
    raise exception 'CLAUSE 1: a viewer grant conveyed EDIT down the containment';
  end if;
  if custom.query_can_see(v_org, v_r2, 'viewer') then
    raise exception 'CLAUSE 1: Dana sees a risk inside Project Y, which she is not shared on';
  end if;
  -- And the read door itself agrees with the visibility door — a screen that says yes and
  -- then hands back nothing is the silent failure this system refuses.
  if (custom.read_record(v_org, v_r1, false) ->> 'title') <> 'X risk' then
    raise exception 'CLAUSE 1: the visibility door says she may see it and the read door does not hand it over';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- REPARENT (T3), through the door: after it, no read returns the moved record to her.
  perform custom.record_reparent(v_org, v_r1, v_y);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 1: the record was moved out of X and Dana still sees it';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.record_reparent(v_org, v_r1, v_x);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 1: the record came back under X and Dana does not see it';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- TRASH and RESTORE, through the doors.
  perform custom.record_delete(v_org, v_r1);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 1: a trashed record still reaches the ladder';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.record_restore(v_org, v_r1);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 1: a restored record lost its containment edge';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '[GREEN] clause 1 — create, reparent, trash and restore all move the ladder with the store.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 2 — T10, TWO HOMES FOR ONE TABLE
  -- ════════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_risk, 'viewer') then
    raise exception 'CLAUSE 2 (T10): shared on X, Dana cannot see that the Risk Table exists';
  end if;
  if custom.query_can_see(v_org, v_inc, 'viewer') then
    raise exception 'CLAUSE 2 (T10): Dana can tell that Y''s own Table Incident exists';
  end if;
  if custom.query_can_see(v_org, v_i1, 'viewer') then
    raise exception 'CLAUSE 2 (T10): Dana can see a record of Y''s own Table';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- THE HOMES DOOR, not `custom.home_relations()`, which holds no client grant. The door
  -- answers every Home the Table is AT — the Home it was declared in as well as the two it was
  -- placed in — so the clause is asked as what T10 actually says: Risk is at home in BOTH
  -- projects, and Incident is at home in Y and NOT in X. (Counting rows here would be asking
  -- the internal `custom.home_relations()` question through a door that answers a different,
  -- larger one, and would pass on the wrong reason.)
  if not exists (select 1 from custom.query_table_homes(v_org, v_risk) h where h = v_x)
     or not exists (select 1 from custom.query_table_homes(v_org, v_risk) h where h = v_y) then
    raise exception 'CLAUSE 2 (T10): Risk is declared once and placed in both projects, and the homes door does not answer both: %',
      (select string_agg(h::text, ', ') from custom.query_table_homes(v_org, v_risk) h);
  end if;
  -- THE SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER, so this is not a door that answers
  -- every record as a Home: Y's own Table is at home in Y and nowhere near X.
  if exists (select 1 from custom.query_table_homes(v_org, v_inc) h where h = v_x) then
    raise exception 'CLAUSE 2 (T10): Y''s own Table Incident is at home in Project X';
  end if;
  if not exists (select 1 from custom.query_table_homes(v_org, v_inc) h where h = v_y) then
    raise exception 'CLAUSE 2 (T10): Y''s own Table Incident is not at home in Project Y';
  end if;
  raise notice '[GREEN] clause 2 (T10) — one Table, two Homes; shared on X she sees X''s risks and the Risk Table, and neither Y''s risks nor that Incident exists.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 3 — T2, A NOTE ON THREE RECORDS OF THREE TABLES
  -- ════════════════════════════════════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): a viewer on A does not see the note carried by A';
  end if;
  if custom.query_can_see(v_org, v_note, 'editor') then
    raise exception 'CLAUSE 3 (T2): a referenced carrying relation conveyed EDIT';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- Unshare A through the door: she loses it.
  perform custom.share_revoke(v_org, v_x, 'user', c_dana);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): A was unshared and she still sees the note';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- Share C: she sees it again, through a different Table entirely.
  perform custom.share_grant(v_org, v_c, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): C was shared and she does not see the note';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- A principal shared on none of A, B, C or the author sees nothing.
  perform custom.share_revoke(v_org, v_c, 'user', c_dana);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if custom.query_can_see(v_org, v_note, 'viewer') then
    raise exception 'CLAUSE 3 (T2): shared on none of A, B, C, she still sees the note';
  end if;
  -- ── THE NEGATIVE CLAUSE, PAIRED WITH ITS CONTROL. She is a member who holds nothing here,
  --    so a write must be refused — and the ONE record that is hers to read must still read.
  declare v_caught text;
  begin
    begin
      perform custom.record_delete(v_org, v_note);
    exception when others then v_caught := sqlerrm;
    end;
    if v_caught is null then
      raise exception 'CLAUSE 3 (access): test@test.com deleted a note nobody shared with her';
    end if;
    v_caught := null;
    begin
      perform custom.field_declare(v_org, v_note_tbl, jsonb_build_object('label','Sneaked in','plain','text'));
    exception when others then v_caught := sqlerrm;
    end;
    if v_caught is null then
      raise exception 'CLAUSE 3 (access): test@test.com added a column to a table she is not an admin of';
    end if;
  end;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_org, v_note, 'user', c_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_org, v_note, false) ->> 'body') <> 'the note' then
    raise exception 'CLAUSE 3 (access): the note shared with test@test.com at viewer does not read back for her, so the two refusals above are a door that refuses her everything';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_revoke(v_org, v_note, 'user', c_dana);
  raise notice '[GREEN] clause 3 (T2) — the note follows A, then C, and vanishes when neither is shared; and a member who holds nothing is refused a delete and a shape change and still reads what she was given.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 4 — THERE IS ONE STORED FORM OF CONTAINMENT
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- The store's cascade walk and the ladder now read the SAME association, so they cannot
  -- disagree. `custom.containment_edges`, `custom.carrying_edges` and `custom.reachable_from`
  -- are the store's internals and hold no client grant; what a PERSON can ask is whether a
  -- grandchild of the record she was shared reaches her, and whether the organization's own
  -- parity door reports any difference at all.
  perform custom.share_grant(v_org, v_x, 'user', c_dana, 'viewer'::public.permission_level);
  v_child := custom.record_write(v_org, v_risk, jsonb_build_object('title','deep','parent_id', v_r1::text));
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_child, 'viewer') then
    raise exception 'CLAUSE 4: the cascade walk no longer reaches a grandchild of X — a viewer on X cannot see a record two levels inside it';
  end if;
  if not exists (select 1 from custom.query_visible_ids(v_org, v_risk, 'viewer') q where q = v_child) then
    raise exception 'CLAUSE 4: the grandchild is visible one record at a time and missing from the list door, so the two disagree';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  -- `depth_measured` and `depth_exceeded` are the door's two STANDING rows — how deep the walk
  -- actually went against the limit it is allowed — and not a disagreement about anybody's
  -- access. Every other row IS one, and there must be none.
  select count(*) into v_n from custom.query_visibility_parity(v_org) p
   where p.side not in ('depth_measured', 'depth_exceeded');
  if v_n <> 0 then
    raise exception 'CLAUSE 4: this organization''s parity door reports % difference(s) between the stored ladder and what the associations produce: %', v_n,
      (select string_agg(format('%s %s:%s -> %s:%s stored=%s derived=%s (%s)', p.side, p.container_type, p.container_id, p.item_type, p.item_id, p.stored_level, p.derived_level, p.reason), ' | ')
         from custom.query_visibility_parity(v_org) p
        where p.side not in ('depth_measured', 'depth_exceeded'));
  end if;
  raise notice '[GREEN] clause 4 — the cascade walk and the ladder read the SAME edge; the organization''s parity door reports 0 differences and no second path is left.';

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- CLAUSE 5 — T1: THE CUTOVER DIFF AND THE REBUILD BOTH FINISH
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- The diff a person's organization can actually ask for, from the seat, timed.
  v_t0 := clock_timestamp();
  select count(*) into v_n from custom.query_visibility_parity(v_org) p
   where p.side not in ('depth_measured', 'depth_exceeded');
  v_ms := extract(epoch from (clock_timestamp() - v_t0)) * 1000;
  raise notice '[GREEN] clause 5 (T1) — custom.query_visibility_parity() returned % difference(s) in % ms.',
    v_n, round(v_ms, 1);
  if v_ms > 10000 then
    raise exception 'CLAUSE 5 (T1): the diff took % ms; it has to finish well inside the database''s own limit', round(v_ms, 1);
  end if;

  -- THE REBUILD IS A MAINTENANCE LANE, NOT A BROWSER'S. `custom.visibility_cache_rebuild`
  -- TRUNCATEs and refills the whole ladder cache; it holds no client grant and no
  -- `platform.client_callable_door` row, so this ONE clause steps OUT of the seat and says so.
  -- It asserts nothing about what a person may do — only that the operator's job finishes.
  perform set_config('role', v_boss, true);
  v_t0 := clock_timestamp();
  select custom.visibility_cache_rebuild() into v_rows;
  v_ms := extract(epoch from (clock_timestamp() - v_t0)) * 1000;
  perform set_config('role', 'authenticated', true);
  raise notice '[GREEN] clause 5 (T1) — custom.visibility_cache_rebuild() wrote % rows in % ms.',
    v_rows, round(v_ms, 1);
  if v_ms > 10000 then
    raise exception 'CLAUSE 5 (T1): the rebuild took % ms', round(v_ms, 1);
  end if;
  if v_rows <= 0 then
    raise exception 'CLAUSE 5 (T1): the rebuild wrote nothing, so the cache is not rebuildable from the associations';
  end if;
  -- And AFTER the rebuild the person's answer is unchanged — the cache was rebuilt from the
  -- associations and not from something only the ladder knew.
  perform set_config('request.jwt.claims', c_dana_j, true);
  if not custom.query_can_see(v_org, v_r1, 'viewer') then
    raise exception 'CLAUSE 5 (T1): after the rebuild, a viewer on X no longer sees the risk inside it';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice '[GREEN] VIS-FIX: all five clauses pass — every one of them from the seat `authenticated`, and every visibility answer asked as test@test.com through custom.query_can_see.';
end;
$t$;

rollback;
