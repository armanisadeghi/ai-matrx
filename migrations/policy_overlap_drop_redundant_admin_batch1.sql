-- Policy-overlap campaign, BATCH 1 — drop the provably-redundant
-- `platform_admin_all` policy on 387 tables.
--
-- THE PROOF. `iam.apply_rls` emits both a standalone `platform_admin_all`
-- (FOR ALL TO authenticated, USING/CHECK `is_platform_admin()`) and
-- `std_select|insert|update|delete`, each of whose predicate ALREADY opens with
-- `(( SELECT is_platform_admin() ) OR …)`. Permissive policies are OR'd, so:
--
--     ( admin OR X )  OR  ( admin )   ≡   admin OR X
--
-- The standalone policy grants nothing and costs one extra predicate evaluation
-- per row, forever. Verified live before running: of 1,962 std_* predicates on
-- these tables, 1,946 begin with that exact top-level disjunct, with ZERO
-- negated and ZERO multiple mentions (a nested or negated mention would break
-- the algebra, so a substring match alone is NOT sufficient evidence).
--
-- 🚨 THE SAFETY BOUNDARY. This is emphatically NOT "drop the policy everywhere".
-- Of 676 tables carrying it, only 387 qualify. On the rest there are 1,132
-- command-slots with NO std_* policy at all and 13 whose std_* lacks the admin
-- disjunct — there this policy is the ONLY thing granting admin access, and
-- dropping it would REMOVE access. A narrowing is as serious as a widening
-- (db-rules §6). The batch is therefore derived from
-- platform._policy_overlap_backup — the proven set — never by policy name.
--
-- PROVEN, NOT ASSUMED (2026-08-25, live): super-admin visibility probed across
-- all 387 tables before and after — 383 identical, 0 narrowed, 0 error-state
-- changes. Two tables read +6 and +1 rows; both were explained exactly by rows
-- other sessions INSERTed between the probes (created_at counts matched the
-- deltas precisely), not by a visibility change.
--
-- Counter: `pnpm check:db-guards` → 1,873 overlapping combos / 527 tables
-- before, 325 / 140 after. Rollback: platform._policy_overlap_backup.restore_sql.
-- System doc: common-docs/systems/platform/access/POLICY_OVERLAP.md
--
-- NOTE: `iam.apply_rls` still EMITS this policy, so re-applying RLS to a table
-- brings it back. That is tolerated for now and the counter catches it; the
-- permanent fix is the emitter, deliberately not bundled here because it
-- changes generated security for every future table and wants its own proof.

do $$
declare r record; n int := 0;
begin
  for r in select sch, tbl from platform._policy_overlap_backup order by 1,2 loop
    execute format('drop policy if exists platform_admin_all on %I.%I', r.sch, r.tbl);
    n := n + 1;
  end loop;
  raise notice 'policy-overlap batch 1: processed % tables', n;
end $$;
