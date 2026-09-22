-- DOORS-ONLY-5 — THE platform.saved_view DOORS, FROM A REAL MEMBER'S SEAT.
--
-- DOORS-ONLY-3 §3 paid for this rule and wrote it in capitals: a door with a pinned
-- `search_path` resolves every type and function name LAZILY, at first execution, so a door
-- naming an unqualified `permission_level` or `is_platform_admin()` compiles, applies,
-- ledgers and passes every static check — and then answers `400 type does not exist` to the
-- first real signed-in caller. Four doors shipped that way and three features had NO working
-- write path at all until a seat found it. So every door in this lane is CALLED from a seat
-- BEFORE its table's refusal policy lands beside it.
--
-- Run it twice, and the second run is the closure's proof:
--
--   psql -v closed=0 -f scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql
--   …apply doorsonly5_saved_view_is_never_client_written.sql…
--   psql -v closed=1 -f scripts/campaign-tests/doorsonly5_saved_view_doors_work_from_a_seat.sql
--
-- `closed=1` adds ONE clause: the direct client INSERT and UPDATE are refused 42501 — by the
-- POLICY and not by a constraint code, which is the distinction DOORS-ONLY-3 §4 had to build a
-- whole fixture to make. Everything else is identical in both runs, so a door that stopped
-- working when the table closed is visible as a diff and not as a silence.
--
-- THE USE CASE THE FIXTURE DATA COMES FROM: Cascade Ridge Orchards, a 120-person apple and
-- cherry grower-packer in the Yakima Valley that sells to regional grocery chains. Its buying
-- desk works a CRM list of grocery buyers, and the two views below are the two its sales
-- manager actually keeps pinned: the Northwest chains she calls weekly, and the buyers whose
-- Honeycrisp contracts are up for renewal before the September pack.
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'doorsonly5_saved_view_doors_work_from_a_seat.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?closed}
\else
  \set closed 0
\endif
begin;

select set_config('doorsonly5.closed', :'closed', true);

do $suite$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd'; -- admin@admin.com
  c_surface constant text := 'crm/parties';
  v_org     uuid;
  v_view    jsonb;
  v_id      uuid;
  v_version integer;
  v_reads_before integer;
  v_reads_after  integer;
  v_state   text;
  v_passes  int := 0;
  v_expected int;
  v_rows    int;
  v_closed  boolean := current_setting('doorsonly5.closed', true) = '1';
begin
  select iam.default_organization_id(c_admin) into v_org;
  if v_org is null then
    raise exception 'setup: admin@admin.com has no default organization, so this suite has no real tenant to write in';
  end if;

  -- ── the seat ────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() <> c_admin then
    raise exception 'setup: this suite did not take admin@admin.com''s seat (user %, uid %)',
      current_user, auth.uid();
  end if;

  select count(*) into v_reads_before from platform.saved_view;

  -- ═══ 1. the create arm ══════════════════════════════════════════════════════
  v_view := public.saved_view_save(
    p_surface_key => c_surface,
    p_organization_id => v_org,
    p_name => 'Northwest chains — weekly call list',
    p_description => 'Grocery buyers in WA, OR and ID that Cascade Ridge calls every Monday.',
    p_set_description => true,
    p_definition => jsonb_build_object(
      'filters', jsonb_build_array(
        jsonb_build_object('field', 'region', 'op', 'in', 'value', jsonb_build_array('WA','OR','ID')),
        jsonb_build_object('field', 'account_type', 'op', 'eq', 'value', 'grocery_chain')),
      'sort', jsonb_build_array(jsonb_build_object('field', 'last_contacted_at', 'dir', 'asc'))),
    p_definition_version => 1,
    p_visibility => 'internal',
    p_touch => true);
  if v_view is null then
    raise exception '1: saved_view_save returned NULL on a create';
  end if;
  v_id := (v_view->>'id')::uuid;
  v_version := (v_view->>'version')::integer;
  if v_view->>'created_by' <> c_admin::text then
    raise exception '1: the door did not stamp created_by from auth.uid() (got %)', v_view->>'created_by';
  end if;
  if v_view->>'surface_key' <> c_surface then
    raise exception '1: the door did not stamp the surface key';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 1  saved_view_save creates a view, stamps created_by from auth.uid(), and returns the row (id %)', v_id;

  -- ═══ 2. the update arm, and the CAS ═════════════════════════════════════════
  v_view := public.saved_view_save(
    p_surface_key => c_surface, p_id => v_id,
    p_name => 'Northwest chains — Monday call list',
    p_expected_version => v_version);
  if v_view is null then
    raise exception '2: saved_view_save returned NULL on a correct-version update';
  end if;
  if v_view->>'name' <> 'Northwest chains — Monday call list' then
    raise exception '2: the rename did not land';
  end if;
  if (v_view->>'version')::integer <> v_version + 1 then
    raise exception '2: the trigger did not advance the version (was %, now %)',
      v_version, v_view->>'version';
  end if;
  if public.saved_view_save(p_surface_key => c_surface, p_id => v_id,
                            p_name => 'stale', p_expected_version => v_version) is not null then
    raise exception '2: a STALE version was accepted — the CAS is not a CAS';
  end if;
  v_version := (v_view->>'version')::integer;
  v_passes := v_passes + 1;
  raise notice '  PASS 2  saved_view_save renames on the right version, the trigger advances it by one, and a stale version returns NULL and writes nothing';

  -- ═══ 3. THE SURFACE KEY IS A WALL ═══════════════════════════════════════════
  -- The defect no policy on this table has ever looked at: platform.saved_view is
  -- multiplexed by surface_key, and std_update says nothing about it.
  if public.saved_view_save(p_surface_key => 'crm/deals', p_id => v_id,
                            p_name => 'reached from another surface') is not null then
    raise exception '3: a view was writable through ANOTHER surface key';
  end if;
  if (select name from platform.saved_view where id = v_id) <> 'Northwest chains — Monday call list' then
    raise exception '3: the row moved even though the door returned NULL';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  a view reached under another surface key reads as absent and nothing is written';

  -- ═══ 4. the default, cleared and set in one call ════════════════════════════
  perform public.saved_view_save(
    p_surface_key => c_surface, p_id => v_id, p_is_default => true,
    p_expected_version => v_version);
  v_view := public.saved_view_save(
    p_surface_key => c_surface, p_organization_id => v_org,
    p_name => 'Honeycrisp contracts up for renewal',
    p_definition => jsonb_build_object('filters', jsonb_build_array(
      jsonb_build_object('field', 'contract_renewal_on', 'op', 'lte', 'value', '2026-09-01'),
      jsonb_build_object('field', 'variety', 'op', 'eq', 'value', 'Honeycrisp'))),
    p_visibility => 'internal');
  perform public.saved_view_set_default(p_surface_key => c_surface,
                                        p_id => (v_view->>'id')::uuid);
  if (select count(*) from platform.saved_view
       where created_by = c_admin and surface_key = c_surface
         and subject_id is null and is_default and deleted_at is null) <> 1 then
    raise exception '4: setting a default left more than one default for the surface';
  end if;
  if (select is_default from platform.saved_view where id = v_id) then
    raise exception '4: the previous default was not cleared';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 4  saved_view_set_default clears the caller''s previous default and sets the new one in one call — the partial unique index is never violated';

  -- ═══ 5. the archive arm ═════════════════════════════════════════════════════
  v_view := public.saved_view_archive(p_surface_key => c_surface, p_id => v_id);
  if v_view is null or v_view->>'deleted_at' is null then
    raise exception '5: saved_view_archive did not archive the view';
  end if;
  if (v_view->>'is_default')::boolean then
    raise exception '5: an archived view is still flagged default';
  end if;
  if public.saved_view_archive(p_surface_key => c_surface, p_id => v_id) is not null then
    raise exception '5: archiving an already-archived view was accepted';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 5  saved_view_archive soft-deletes, clears is_default, and reads as absent on a second call';

  -- ═══ 6. READS DO NOT MOVE ═══════════════════════════════════════════════════
  select count(*) into v_reads_after from platform.saved_view;
  if v_reads_after <> v_reads_before + 2 then
    raise exception '6: this seat reads % rows, not the % it read before plus the two it created',
      v_reads_after, v_reads_before;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 6  the member''s own SELECT is untouched — % rows before, % after the two creates', v_reads_before, v_reads_after;

  -- ═══ 7. the direct write, once the table is closed ══════════════════════════
  if v_closed then
    begin
      insert into platform.saved_view (name, surface_key, organization_id, created_by, definition)
      values ('smuggled', c_surface, v_org, c_admin, '{}'::jsonb);
      raise exception '7: platform.saved_view ACCEPTED a direct client INSERT. The table is open.';
    exception when insufficient_privilege then
      v_passes := v_passes + 1;
      raise notice '  PASS 7a platform.saved_view refuses a direct client INSERT with 42501 — the policy, not a constraint';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '7: the direct INSERT failed % rather than 42501, so the refusal is not proven', v_state;
    end;
    -- 🚨 A CLOSED UPDATE HAS TWO HONEST SHAPES, AND THE CLOSURE PASSES THROUGH BOTH.
    -- With the grant still held, a restrictive policy with `using (false)` makes the row
    -- INVISIBLE to the UPDATE: Postgres matches zero rows and returns success, and only the
    -- INSERT arm -- a WITH CHECK -- raises 42501. Once the canonical route has WITHDRAWN the
    -- write grant, the same statement is refused 42501 before RLS is reached at all. The first
    -- draft asserted only one of the two and failed on the stronger state, reading as "the
    -- table is open" when it had just become MORE closed. So this asserts the thing that is
    -- true in both: THE WRITE LANDS NOWHERE, and it says which shape it saw.
    begin
      update platform.saved_view set name = 'smuggled' where id = (v_view->>'id')::uuid;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '7: a direct client UPDATE changed % row(s). The table is open.', v_rows;
      end if;
      delete from platform.saved_view where id = (v_view->>'id')::uuid;
      get diagnostics v_rows = row_count;
      if v_rows <> 0 then
        raise exception '7: a direct client DELETE removed % row(s). The table is open.', v_rows;
      end if;
      v_passes := v_passes + 2;
      raise notice '  PASS 7b a direct client UPDATE and DELETE each reach ZERO rows -- the grant is still declared and the restrictive policy makes the row invisible to them';
    exception when insufficient_privilege then
      v_passes := v_passes + 2;
      raise notice '  PASS 7b a direct client UPDATE is refused 42501 outright -- the write GRANT is withdrawn, so the refusal is one lock deeper than the policy';
    end;
  else
    raise notice '  SKIP 7  the refusal clause runs on the second pass (-v closed=1), after the table is closed';
  end if;

  reset role;
  raise notice '';
  v_expected := (case when v_closed then 9 else 6 end);
  raise notice '  %/% assertions green (closed=%)', v_passes, v_expected, v_closed;
  if v_passes <> v_expected then
    raise exception 'suite: % assertions passed, not %', v_passes, v_expected;
  end if;
end;
$suite$;

rollback;
