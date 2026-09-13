-- iam_bespoke_policies_superseded_dd172 — SEVEN DOORS WITH NO RECORD, READ AND THEN CLOSED
-- (DD-172, riding with `iam_bespoke_policies_of_record_dd172.sql`. SECURITY.)
--
-- ═══ WHAT THIS IS ═════════════════════════════════════════════════════════════════════════════
-- DD-147's census found policies that are LIVE on this database and appear in NO migration file in
-- either repository — created off the migration path, with nothing anywhere saying what they are
-- for. Re-measured 2026-09-13: 81 such names on 39 relations. Seventy-four of them are real doors
-- and the companion file records them. These SEVEN are not, and this file removes them BY NAME
-- through `iam.supersede_bespoke_policies`, each with its reason, each recorded in
-- `iam.superseded_policy`, each proven against this database before and after.
--
-- FIVE ARE REDUNDANT — the generated `platform_admin_all` beside them already says the same thing:
--   admin.admins            admin_access_policy          is_platform_admin() OR uid IN (two hard-coded uuids)
--   billing.capability      capability_no_write          is_platform_admin() OR false
--   billing.capability_limit capability_limit_no_write   is_platform_admin() OR false
--   billing.price           price_no_write               is_platform_admin() OR false
--   billing.product         product_no_write             is_platform_admin() OR false
-- `X OR false` is `X`, and the two hard-coded uuids (arman@armansadeghi.com and info@aimatrx.com)
-- are both platform admins — asserted below under their own identities, not assumed. So each of
-- these five grants exactly what `platform_admin_all` already grants, and removing it moves nobody.
-- A hard-coded uuid list in a policy is worse than redundant: it is a door that stops matching the
-- roster the moment the roster changes, and nothing would say so.
--
-- TWO ARE LIVE WRITE HOLES — PERMISSIVE `FOR ALL` on `authenticated` with `USING (true) WITH CHECK
-- (true)`, the same shape DD-167 closed on `education.math_problems`:
--   education.math_course_structure  "Authenticated users can manage course structure"
--   users.system_announcements       "Authenticated users can manage announcements"
-- Any signed-in account — a brand-new free one — can insert, update or delete every row of the
-- published course outline, and can write the product's system announcement banner that every
-- other user then reads. Neither table has a RESTRICTIVE wall over it. Both are pure narrowings on
-- the WRITE axis with a zero-row change on the READ axis, and both halves are proven RED then
-- GREEN below with `test@test.com`, a real non-admin identity with no organization rights.
--
-- 🚨 WHY NOT A REGENERATION. `iam.apply_rls` cannot generate either table: `users.system_announcements`
-- is registered (token `system_announcement`, variant `system`) but lacks its variant's base
-- contract, and `education.math_course_structure` is registered in no class at all. That schema work
-- is DD-173 and another lane's decision. What can be done now, and must be, is to stop the write.
set local lock_timeout = '4s';

-- ═══════════════════════════════════════════════════ PART 1 — THE FIVE REDUNDANT, PROVEN REDUNDANT
do $$
declare
  v_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, a platform admin
  v_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, no admin rights
  v_hard    constant uuid[] := array['4cf62e4e-2679-484f-b652-034e697418df',   -- arman@armansadeghi.com
                                     '6555aa73-c647-4ecf-8a96-b60e315b6b18'];  -- info@aimatrx.com
  r record;
  u uuid;
  v_is_admin boolean;
  v_before bigint; v_after bigint;
  v_pa_using text; v_pa_check text; v_pol_using text;
  v_counts jsonb := '{}'::jsonb;
  v_key text;
begin
  -- ── the textual subsumption: each policy is `platform_admin_all OR false` ────────────────────
  for r in
    select * from (values
      ('billing','capability','capability_no_write'),
      ('billing','capability_limit','capability_limit_no_write'),
      ('billing','price','price_no_write'),
      ('billing','product','product_no_write')
    ) as t(sch,tbl,pol)
  loop
    select pg_get_expr(p.polqual,p.polrelid) into v_pol_using
      from pg_policy p where p.polrelid = format('%I.%I',r.sch,r.tbl)::regclass and p.polname = r.pol;
    select pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid)
      into v_pa_using, v_pa_check
      from pg_policy p where p.polrelid = format('%I.%I',r.sch,r.tbl)::regclass and p.polname = 'platform_admin_all';
    if v_pa_using is null then
      raise exception 'DD-172: %.% has no platform_admin_all to fall back on, so % is NOT redundant and must not be superseded. Nothing was dropped.', r.sch, r.tbl, r.pol;
    end if;
    if v_pol_using is distinct from format('(%s OR false)', v_pa_using) then
      raise exception E'DD-172: %.% policy % is not the `platform_admin_all OR false` shape this file claims.\n  it says:                %\n  platform_admin_all says: %\nRead it again before removing it.', r.sch, r.tbl, r.pol, v_pol_using, v_pa_using;
    end if;
  end loop;
  raise notice 'DD-172 — four billing policies proven textually identical to platform_admin_all with a dead `OR false` on the end.';

  -- ── the two hard-coded uuids ARE platform admins, asserted under their own identities ────────
  foreach u in array v_hard loop
    perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    select public.is_platform_admin() into v_is_admin;
    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);
    if not v_is_admin then
      raise exception 'DD-172: % is hard-coded into admin.admins.admin_access_policy and is NOT a platform admin, so removing that policy WOULD take their access away. Nothing was dropped — put them on the roster first.', u;
    end if;
  end loop;
  raise notice 'DD-172 — both uuids hard-coded into admin.admins.admin_access_policy are platform admins in their own right, so platform_admin_all already carries them.';

  -- ── the reads of every affected identity, BEFORE ─────────────────────────────────────────────
  for r in
    select * from (values
      ('admin','admins'),('billing','capability'),('billing','capability_limit'),('billing','price'),('billing','product')
    ) as t(sch,tbl)
  loop
    foreach u in array (v_hard || array[v_admin, v_member]) loop
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      execute format('select count(*) from %I.%I', r.sch, r.tbl) into v_before;
      execute 'reset role';
      perform set_config('request.jwt.claims', null, true);
      v_counts := v_counts || jsonb_build_object(format('%s.%s|%s', r.sch, r.tbl, u), v_before);
    end loop;
    -- and anonymous, where anon holds a grant at all
    perform set_config('request.jwt.claims', null, true);
    begin
      execute 'set local role anon';
      execute format('select count(*) from %I.%I', r.sch, r.tbl) into v_before;
      execute 'reset role';
    exception when insufficient_privilege then
      begin execute 'reset role'; exception when others then null; end;
      v_before := -1;  -- no SELECT grant: zero rows by grant, not by policy
    end;
    v_counts := v_counts || jsonb_build_object(format('%s.%s|anon', r.sch, r.tbl), v_before);
  end loop;

  -- ── the removals ─────────────────────────────────────────────────────────────────────────────
  perform iam.supersede_bespoke_policies('admin','admins', array['admin_access_policy'],
    'DD-172: a PERMISSIVE FOR ALL policy with USING (is_platform_admin() OR auth.uid() IN (two hard-coded uuids)) and no migration of record anywhere. Both hard-coded uuids — arman@armansadeghi.com and info@aimatrx.com — are proven platform admins under their own identities in this migration, so platform_admin_all beside it already grants them everything this policy did. A hard-coded uuid list also stops matching the admin roster the moment the roster changes, silently. Reads are unchanged for both of them and for every other identity probed here.');

  perform iam.supersede_bespoke_policies('billing','capability', array['capability_no_write'],
    'DD-172: USING/WITH CHECK (is_platform_admin() OR false) — textually the generated platform_admin_all beside it with a dead disjunct on the end, proven identical in this migration. It had no migration of record. The public price-book read stays on capability_read and the write axis stays walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so removing it moves nobody.');

  perform iam.supersede_bespoke_policies('billing','capability_limit', array['capability_limit_no_write'],
    'DD-172: USING/WITH CHECK (is_platform_admin() OR false) — textually the generated platform_admin_all beside it with a dead disjunct on the end, proven identical in this migration. It had no migration of record. The public price-book read stays on capability_limit_read and the write axis stays walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so removing it moves nobody.');

  perform iam.supersede_bespoke_policies('billing','price', array['price_no_write'],
    'DD-172: USING/WITH CHECK (is_platform_admin() OR false) — textually the generated platform_admin_all beside it with a dead disjunct on the end, proven identical in this migration. It had no migration of record. The public price-book read stays on price_read and the write axis stays walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so removing it moves nobody.');

  perform iam.supersede_bespoke_policies('billing','product', array['product_no_write'],
    'DD-172: USING/WITH CHECK (is_platform_admin() OR false) — textually the generated platform_admin_all beside it with a dead disjunct on the end, proven identical in this migration. It had no migration of record. The public price-book read stays on product_read and the write axis stays walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so removing it moves nobody.');

  -- ── the same reads, AFTER: not one row may move ──────────────────────────────────────────────
  for r in
    select * from (values
      ('admin','admins'),('billing','capability'),('billing','capability_limit'),('billing','price'),('billing','product')
    ) as t(sch,tbl)
  loop
    foreach u in array (v_hard || array[v_admin, v_member]) loop
      perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role','authenticated')::text, true);
      execute 'set local role authenticated';
      execute format('select count(*) from %I.%I', r.sch, r.tbl) into v_after;
      execute 'reset role';
      perform set_config('request.jwt.claims', null, true);
      v_key := format('%s.%s|%s', r.sch, r.tbl, u);
      if (v_counts ->> v_key)::bigint is distinct from v_after then
        raise exception 'DD-172: the read lane MOVED on % — % rows before, % after. A removal that was argued to be redundant is not redundant, and this migration must not stand.',
          v_key, v_counts ->> v_key, v_after;
      end if;
    end loop;
    perform set_config('request.jwt.claims', null, true);
    begin
      execute 'set local role anon';
      execute format('select count(*) from %I.%I', r.sch, r.tbl) into v_after;
      execute 'reset role';
    exception when insufficient_privilege then
      begin execute 'reset role'; exception when others then null; end;
      v_after := -1;
    end;
    v_key := format('%s.%s|anon', r.sch, r.tbl);
    if (v_counts ->> v_key)::bigint is distinct from v_after then
      raise exception 'DD-172: the ANONYMOUS read lane MOVED on % — % rows before, % after.', v_key, v_counts ->> v_key, v_after;
    end if;
  end loop;
  raise notice 'DD-172 — five redundant policies superseded; all % probed read counts (5 relations x 5 identities, anonymous included) identical before and after.',
    (select count(*) from jsonb_object_keys(v_counts));
end $$;

-- ═══════════════════════════════════════ PART 2 — THE PUBLISHED COURSE OUTLINE IS NOT A WHITEBOARD
do $$
declare
  v_member constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, no admin rights
  v_rows integer;
  v_read_before bigint; v_read_after bigint;
  v_anon_before bigint; v_anon_after bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_before from education.math_course_structure;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from education.math_course_structure;
  execute 'reset role';

  -- ── RED: a plain signed-in account writes the published course outline ───────────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute $i$insert into education.math_course_structure (course_name, topic_name, module_name)
             values ('DD-172 RED probe', 'DD-172 RED probe', 'DD-172 RED probe')$i$;
    get diagnostics v_rows = row_count;
    execute 'reset role';
    raise exception 'DD172-RED-ROLLBACK %', v_rows;
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    if sqlerrm like 'DD172-RED-ROLLBACK %' then
      v_rows := substring(sqlerrm from 'DD172-RED-ROLLBACK (\d+)')::integer;
    else
      raise exception 'DD-172 RED on education.math_course_structure could not run: %', sqlerrm;
    end if;
  end;
  if v_rows = 0 then
    raise exception 'DD-172: RED did not reproduce on education.math_course_structure — a plain signed-in account inserted 0 rows before the fix. Either the hole is already gone or this probe is not probing.';
  end if;
  raise notice 'DD-172 RED   — test@test.com, a plain signed-in account with no admin rights, INSERTED % row(s) into education.math_course_structure. Rolled back.', v_rows;

  perform iam.supersede_bespoke_policies('education','math_course_structure',
    array['Authenticated users can manage course structure'],
    'DD-172: a PERMISSIVE FOR ALL policy on authenticated with USING (true) WITH CHECK (true) and no migration of record anywhere — any signed-in account, including a brand-new free one, could insert, update or delete every row of the published course outline, and no RESTRICTIVE wall stood over it. The signed-out and signed-in read it also carried is already covered by "Public can view course structure", and staff writes by platform_admin_all, so removing it closes the write and moves no read. Same class as DD-167 on education.math_problems.');

  -- ── GREEN: the same write, refused ───────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute $i$insert into education.math_course_structure (course_name, topic_name, module_name)
             values ('DD-172 GREEN probe', 'DD-172 GREEN probe', 'DD-172 GREEN probe')$i$;
    get diagnostics v_rows = row_count;
    execute 'reset role';
    raise exception 'DD172-GREEN-ROLLBACK %', v_rows;
  exception when insufficient_privilege then
    begin execute 'reset role'; exception when others then null; end;
    v_rows := 0;
  when others then
    begin execute 'reset role'; exception when others then null; end;
    if sqlerrm like 'DD172-GREEN-ROLLBACK %' then
      v_rows := substring(sqlerrm from 'DD172-GREEN-ROLLBACK (\d+)')::integer;
    else
      raise exception 'DD-172 GREEN on education.math_course_structure could not run: %', sqlerrm;
    end if;
  end;
  if v_rows <> 0 then
    raise exception 'DD-172 GREEN FAILED — the same account still inserted % row(s) into education.math_course_structure after the policy was superseded.', v_rows;
  end if;
  raise notice 'DD-172 GREEN — the same account is now refused every write to education.math_course_structure.';

  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_after from education.math_course_structure;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_after from education.math_course_structure;
  execute 'reset role';
  if v_read_before <> v_read_after or v_anon_before <> v_anon_after then
    raise exception 'DD-172: the read lane MOVED on education.math_course_structure (signed-in % -> %, anon % -> %). Over-tightening is the same class of defect as letting a stranger in.',
      v_read_before, v_read_after, v_anon_before, v_anon_after;
  end if;
  raise notice 'DD-172 — education.math_course_structure reads unchanged: signed-in % -> %, anon % -> %.',
    v_read_before, v_read_after, v_anon_before, v_anon_after;
end $$;

-- ═══════════════════════ PART 3 — THE PRODUCT'S ANNOUNCEMENT BANNER IS NOT A PUBLIC MESSAGE BOARD
do $$
declare
  v_member constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, no admin rights
  v_rows integer;
  v_read_before bigint; v_read_after bigint;
  v_anon_before bigint; v_anon_after bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_before from users.system_announcements;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_before from users.system_announcements;
  execute 'reset role';

  -- ── RED: a plain signed-in account rewrites the banner every other user reads ────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update users.system_announcements set updated_at = now()';
    get diagnostics v_rows = row_count;
    execute 'reset role';
    raise exception 'DD172-RED-ROLLBACK %', v_rows;
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    if sqlerrm like 'DD172-RED-ROLLBACK %' then
      v_rows := substring(sqlerrm from 'DD172-RED-ROLLBACK (\d+)')::integer;
    else
      raise exception 'DD-172 RED on users.system_announcements could not run: %', sqlerrm;
    end if;
  end;
  if v_rows = 0 then
    raise exception 'DD-172: RED did not reproduce on users.system_announcements — a plain signed-in account updated 0 rows before the fix. Either the hole is already gone or this probe is not probing.';
  end if;
  raise notice 'DD-172 RED   — test@test.com, a plain signed-in account with no admin rights, UPDATED % row(s) of users.system_announcements. Rolled back.', v_rows;

  perform iam.supersede_bespoke_policies('users','system_announcements',
    array['Authenticated users can manage announcements'],
    'DD-172: a PERMISSIVE FOR ALL policy on authenticated with USING (true) WITH CHECK (true) and no migration of record anywhere — any signed-in account could write, edit or delete the system announcement banner that every other user of the platform then reads, and no RESTRICTIVE wall stood over it. The reads it also carried are already covered by "Authenticated users can view all announcements" and "Users can view active announcements", and staff writes by platform_admin_all, so removing it closes the write and moves no read.');

  -- ── GREEN: the same write, refused ───────────────────────────────────────────────────────────
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'update users.system_announcements set updated_at = now()';
    get diagnostics v_rows = row_count;
    execute 'reset role';
  exception when insufficient_privilege then
    begin execute 'reset role'; exception when others then null; end;
    v_rows := 0;
  end;
  if v_rows <> 0 then
    raise exception 'DD-172 GREEN FAILED — the same account still updated % row(s) of users.system_announcements after the policy was superseded.', v_rows;
  end if;
  raise notice 'DD-172 GREEN — the same account now updates 0 rows of users.system_announcements.';

  perform set_config('request.jwt.claims', json_build_object('sub', v_member::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_read_after from users.system_announcements;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  execute 'set local role anon';
  select count(*) into v_anon_after from users.system_announcements;
  execute 'reset role';
  if v_read_before <> v_read_after or v_anon_before <> v_anon_after then
    raise exception 'DD-172: the read lane MOVED on users.system_announcements (signed-in % -> %, anon % -> %). Over-tightening is the same class of defect as letting a stranger in.',
      v_read_before, v_read_after, v_anon_before, v_anon_after;
  end if;
  raise notice 'DD-172 — users.system_announcements reads unchanged: signed-in % -> %, anon % -> %.',
    v_read_before, v_read_after, v_anon_before, v_anon_after;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════ THE SEVEN ARE ON FILE
do $$
declare v_n integer;
begin
  select count(*) into v_n from iam.superseded_policy s
   where (s.schema_name, s.table_name, s.policy_name) in (
     ('admin','admins','admin_access_policy'),
     ('billing','capability','capability_no_write'),
     ('billing','capability_limit','capability_limit_no_write'),
     ('billing','price','price_no_write'),
     ('billing','product','product_no_write'),
     ('education','math_course_structure','Authenticated users can manage course structure'),
     ('users','system_announcements','Authenticated users can manage announcements'));
  if v_n <> 7 then
    raise exception 'DD-172: only % of the seven removals are recorded in iam.superseded_policy. A removal without a record is the defect, not the fix.', v_n;
  end if;
  raise notice 'DD-172 — all seven removals recorded in iam.superseded_policy with their reasons.';
end $$;
