-- education_math_problems_write_hole_dd167 — A PUBLISHED CATALOGUE IS NOT A PUBLIC WHITEBOARD
-- (DD-167, riding with DD-159 batch 2. SECURITY.)
--
-- `education.math_problems` carries a PERMISSIVE `FOR ALL` policy on `authenticated` with
-- `USING (true) WITH CHECK (true)` — "Authenticated users can manage math problems". Any signed-in
-- person, including a brand-new free account, can UPDATE or DELETE every row of the published maths
-- catalogue. B-48 registered the token `math_problem` (class `public`, variant `entity`) and named
-- the hole in the registration text rather than closing it, because closing a door belongs in a
-- migration with a write proof, not in a registration batch. This is that migration.
--
-- 🚨 WHY THIS IS NOT A REGENERATION. `iam.apply_rls` refuses `education.math_problems`: the table
-- has no `organization_id`, so the entity variant cannot build its org lane and says so
-- ("base-retrofit it before applying canonical RLS"). The retrofit is a schema change and another
-- lane's decision. What CAN be done now, and must be, is to stop the write. So this supersedes the
-- one offending policy BY NAME through `iam.supersede_bespoke_policies` — recorded in
-- `iam.superseded_policy` with its reason — and touches nothing else.
--
-- WHAT SURVIVES, DELIBERATELY:
--   "Authenticated users can view all math problems"  — every signed-in read, unchanged.
--   "Public can view published math problems"         — the anon/published read, unchanged.
--   platform_admin_all                                — staff write, unchanged.
-- So this is a pure narrowing on the WRITE axis and a zero-row change on the READ axis, and both
-- halves are proven below against this database with a real non-admin identity, RED then GREEN.
set local lock_timeout = '4s';

do $$
declare
  v_member constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, a non-member, no admin rights
  v_rows integer;
  v_read_before bigint; v_read_after bigint;
  v_anon_before bigint; v_anon_after bigint;
begin
  -- ── the reads, BEFORE ────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_before from education.math_problems;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from education.math_problems;
  execute 'reset role';

  -- ── RED: the write hole, used ────────────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update education.math_problems set updated_at = now()';
    get diagnostics v_rows = row_count;
    execute 'reset role';
    raise exception 'DD167-RED-ROLLBACK %', v_rows;
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    if sqlerrm like 'DD167-RED-ROLLBACK %' then
      v_rows := substring(sqlerrm from 'DD167-RED-ROLLBACK (\d+)')::integer;
    else
      raise exception 'DD-167 RED could not run: %', sqlerrm;
    end if;
  end;
  if v_rows = 0 then
    raise exception 'DD-167: RED did not reproduce — a plain signed-in account updated 0 rows of education.math_problems before the fix. Either the hole is already gone or this probe is not probing.';
  end if;
  raise notice 'DD-167 RED   — test@test.com, a plain signed-in account with no admin rights, UPDATED % row(s) of education.math_problems. Rolled back.', v_rows;

  -- ── the close ────────────────────────────────────────────────────────────────────────────────
  perform iam.supersede_bespoke_policies('education','math_problems',
    array['Authenticated users can manage math problems'],
    'DD-167: a PERMISSIVE FOR ALL policy on authenticated with USING (true) let any signed-in account update or delete the whole published maths catalogue. The reads it also carried are already covered by "Authenticated users can view all math problems" and "Public can view published math problems", and staff writes by platform_admin_all, so removing it closes the write and moves no read.');

  -- ── GREEN: the same write, refused ───────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update education.math_problems set updated_at = now()';
    get diagnostics v_rows = row_count;
    execute 'reset role';
  exception when insufficient_privilege then
    begin execute 'reset role'; exception when others then null; end;
    v_rows := 0;
  end;
  if v_rows <> 0 then
    raise exception 'DD-167 GREEN FAILED — the same account still updated % row(s) after the policy was superseded.', v_rows;
  end if;
  raise notice 'DD-167 GREEN — the same account now updates 0 rows of education.math_problems.';

  -- ── and the reads did not move ───────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_after from education.math_problems;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_after from education.math_problems;
  execute 'reset role';
  if v_read_before <> v_read_after or v_anon_before <> v_anon_after then
    raise exception 'DD-167: the read lane MOVED (signed-in % -> %, anon % -> %). Over-tightening is the same class of defect as letting a stranger in.',
      v_read_before, v_read_after, v_anon_before, v_anon_after;
  end if;
  raise notice 'DD-167 — reads unchanged: signed-in % -> %, anon % -> %.',
    v_read_before, v_read_after, v_anon_before, v_anon_after;
end $$;
