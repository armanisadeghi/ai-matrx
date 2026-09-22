-- lane: DOORS-ONLY-5
-- chair-step: this file DROPS a policy. `platform` and `iam` are REVOKE-protected and a policy
-- drop cannot be read by the additive allow-list, so it is confirmed at the command line. What
-- it drops is named below, one table at a time, with the replacement created FIRST in the same
-- transaction.
--
-- THE MACHINERY TABLES, BATCH 4 OF 4 — 8 tables.
--
-- 🚨 WHY THESE ARE A DIFFERENT LANE FROM EVERY OTHER TABLE IN THIS CAMPAIGN, and why a
-- hand-written policy change is the RIGHT tool here when it was the wrong one everywhere else.
--
-- DOORS-ONLY-3 §5 measured that `platform_admin_all` and the `std_*` family are GENERATED
-- names: `iam.apply_rls` drops and re-creates exactly the names in `iam.generated_policy_names()`
-- on every run, and `platform.provision` calls `iam.apply_rls`. So a hand-written DROP POLICY on
-- a generated table is a temporary edit that the next table spec silently undoes — which is why
-- DOORS-ONLY-4 fixed the class in the GENERATOR instead, and why that was right.
--
-- **These thirty-two tables have no generator.** `iam.apply_rls` refuses a machinery token BY
-- NAME — read live from its body: *"token % (%.%) is access machinery; generic RLS is forbidden
-- because machinery owns inputs consumed by the access resolver"*. Their policies were created
-- before the machinery classification and nothing regenerates them. Read the other way round,
-- that is exactly what makes a DROP POLICY here DURABLE. It is the opposite situation to §1 of
-- DOORS-ONLY-4, and it is the reason this block could never have been the tail of that lane.
--
-- WHAT IS ACTUALLY LEFT ON THEM, measured rather than assumed:
--
--   GRANTS      `authenticated` holds **SELECT and nothing else** on every one of the thirty-two.
--               The write privileges came off in the earlier lanes' chair steps. So there is no
--               REVOKE in this file, and the brief's "chair-step REVOKE of client writes" is
--               already done — checked, not asked.
--   POLICIES    `platform_admin_all`, which is `FOR ALL` and PERMISSIVE and names
--               `authenticated`. That is the whole remaining write SURFACE: a permissive write
--               policy with no privilege behind it. All thirty-two carry the SAME predicate,
--               `(SELECT is_platform_admin())`, for both USING and WITH CHECK — one distinct
--               expression across thirty-two tables, read live.
--
-- WHY THE POLICY IS REPLACED AND NOT SIMPLY DROPPED. `platform_admin_all` is `FOR ALL`, so it is
-- the platform-staff READ policy as much as the write one. Dropping it alone would take staff
-- reads away on thirty-two tables — the warning DOORS-ONLY-2 left in capitals. The SAME predicate
-- is therefore emitted `FOR SELECT` as `platform_admin_select` FIRST, in the same transaction,
-- which is precisely the shape DOORS-ONLY-4 taught the generator for every other table. These
-- thirty-two now match it.
--
-- NOTHING ANYBODY CAN DO TODAY CHANGES. A platform admin cannot write these tables now and will
-- not be able to after: the write GRANT is already gone, so the WITH CHECK half of
-- `platform_admin_all` has had no privilege behind it since the earlier chair steps. Every
-- server path runs as `service_role` or as the table owner and is not subject to these policies
-- at all. What changes is that the SURFACE stops being declared — which is the whole of the
-- ruling, and the whole of what the guard counts.
--
-- Inverse: migrations/inverse/doorsonly5_machinery_batch_04_the_for_select_twin.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, re-run live after THIS batch.

set local lock_timeout = '2s';


-- ── platform.lifecycle_reference_map ──
create policy "platform_admin_select" on platform."lifecycle_reference_map"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."lifecycle_reference_map" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.lifecycle_reference_map` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."lifecycle_reference_map";

-- ── platform.lifecycle_run ──
create policy "platform_admin_select" on platform."lifecycle_run"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."lifecycle_run" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.lifecycle_run` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."lifecycle_run";

-- ── platform.mtx_public_url_guard ──
create policy "platform_admin_select" on platform."mtx_public_url_guard"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."mtx_public_url_guard" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.mtx_public_url_guard` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."mtx_public_url_guard";

-- ── platform.reachability ──
create policy "platform_admin_select" on platform."reachability"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."reachability" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.reachability` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."reachability";

-- ── platform.reference_categories ──
create policy "platform_admin_select" on platform."reference_categories"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."reference_categories" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.reference_categories` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."reference_categories";

-- ── platform.reference_declaration ──
create policy "platform_admin_select" on platform."reference_declaration"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."reference_declaration" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.reference_declaration` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."reference_declaration";

-- ── platform.repo ──
create policy "platform_admin_select" on platform."repo"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."repo" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.repo` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."repo";

-- ── platform.schemas ──
create policy "platform_admin_select" on platform."schemas"
  as permissive for select to authenticated
  using ((select public.is_platform_admin()));
comment on policy "platform_admin_select" on platform."schemas" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of the platform_admin_all this file dropped. `platform.schemas` is access MACHINERY -- iam.apply_rls refuses a machinery token by name, so nothing regenerates its policies and this hand-written pair is durable, which is the opposite of every generated table in this campaign. The predicate is byte-identical to the USING half of the policy it replaces, so platform-staff READS do not move; the write half is not re-emitted, because a FOR ALL permissive policy naming authenticated is the client write SURFACE the ruling closed. authenticated holds SELECT and no write privilege on this table, so nothing anybody can do today changes.';
drop policy "platform_admin_all" on platform."schemas";
