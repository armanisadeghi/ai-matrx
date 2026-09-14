-- dd173_api_request_log_e_gate — DD-173 `ops.api_request_log`, the ACCESS-DELTA GATE, run as its
-- own file BECAUSE OF WHAT IT COSTS, not as an afterthought.
--
-- 🚨 WHY THE GATE IS NOT INSIDE dd173_api_request_log_d_generate.sql. `iam.apply_rls` holds
--    ACCESS EXCLUSIVE on the table from the first DROP POLICY until its transaction commits, so
--    anything the gate does INSIDE that transaction is done with the strongest lock there is held
--    on a 1.6 M-row table under continuous writes. Measured on the live table in a rolled-back
--    rehearsal (2026-09-14 06:34:55Z): the eight-principal AFTER snapshot took the locked window
--    to 14,192 ms — three times the 4.5 s readiness budget. An `organization_id` index does not
--    fix it: the generated lane is `organization_id IN (SELECT iam.my_orgs())`, which plans as a
--    hash join, and for a principal who is in ANY organization the probe still reads every row.
--    So the AFTER read is taken HERE, where this file holds no lock stronger than ACCESS SHARE
--    and can take as long as it needs.
--
-- 🚨 WHAT COVERS THE GAP BETWEEN THE TWO FILES. Step D refuses to commit unless, at that moment,
--    every row of the table is in the Matrx System organization AND the Matrx System organization
--    has zero members AND the generated policy set is exactly {std_select, svc_all} with no
--    staff or system-org arm in the lane. A lane that admits a row only to a member of that row's
--    organization, over rows that belong to an organization with no members, admits nothing — so
--    there is no window in which a door is open that this gate then discovers. This file measures
--    it rather than trusting that reasoning, which is the whole point of a gate.
--
-- The BEFORE is the run step D pinned, found by its label (which carries the pin instant), so the
-- AFTER reads exactly the same row population and the comparison is row-by-row, not count-by-count.

do $dd173arle$
declare
  v_as        timestamptz;
  v_before    uuid; v_after uuid;
  r record;
  v_unapproved text[] := '{}'; v_hard text[] := '{}'; v_narrower text[] := '{}'; v_same int := 0;
  v_approved constant text[] := '{}';   -- a widening is approved BY NAME or it is a failure
  v_total bigint;
  v_label text;
  v_principals constant uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
begin
  -- ═══════ 1. THE BEFORE STEP D PINNED, AND THE INSTANT IT PINNED IT AT ═══════════════════════
  select run.id, run.label into v_before, v_label
    from iam.access_delta_run run
   where run.label like 'DD-173 api_request_log BEFORE @%'
   order by run.started_at desc limit 1;
  if v_before is null then
    raise exception 'dd173-arl-e: no baseline run labelled "DD-173 api_request_log BEFORE @..." exists. Step D has not run, and a gate with no before measures nothing.';
  end if;
  v_as := split_part(v_label, '@', 2)::timestamptz;
  if not exists (select 1 from pg_policy where polrelid='ops.api_request_log'::regclass and polname='std_select') then
    raise exception 'dd173-arl-e: ops.api_request_log carries no std_select. Step D''s generation is not live, so there is nothing to gate.';
  end if;
  raise notice 'dd173-arl-e: baseline % pinned at %', v_before, v_as;

  -- ═══════ 2. THE AFTER, same principals, same token, same instant, no lock ═══════════════════
  v_after := iam.access_delta_snapshot('DD-173 api_request_log AFTER', v_principals,
    array['api_request_log'], 20000,
    'DD-173 ops.api_request_log confirmation, pinned to the same instant as the baseline, taken outside the generation transaction so it holds no lock on a 1.6 M-row table', v_as);

  -- ═══════ 3. THE VERDICT ═════════════════════════════════════════════════════════════════════
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict
             from iam.access_delta_compare(v_before, v_after) c
            order by c.verdict, c.principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved, format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      end if;
    elsif r.verdict = 'UNPROVEN' then
      select count(*) into v_total from ops.api_request_log;
      if r.count_before = r.count_after and r.count_after = v_total then
        raise notice 'dd173-arl-e: UNPROVEN-but-whole-table % for % (all % rows before and after)', r.token, r.principal_label, v_total;
      else
        v_hard := array_append(v_hard, format('UNPROVEN %s for %s (%s -> %s of %s rows)', r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;
    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved, format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));
    elsif r.verdict = 'NARROWER' then
      v_narrower := array_append(v_narrower, format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173-arl-e: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  if cardinality(v_hard) > 0 then
    raise exception 'dd173-arl-e: % read(s) this gate could not prove either way: %', cardinality(v_hard), array_to_string(v_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173-arl-e: % door(s) opened that nobody approved by name: %. 🚨 THE GENERATION IS ALREADY LIVE — revert it (restore the bespoke policy set on ops.api_request_log) before doing anything else.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173-arl-e: 0 unapproved widenings, % narrowing(s), % principal(s) unchanged, across 1 token x % principals',
    cardinality(v_narrower), v_same, cardinality(v_principals);
end $dd173arle$;
