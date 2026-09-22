-- lane: DOORS-ONLY-5
-- chair-step: this file DROPS policies. `platform` and `iam` are REVOKE-protected and a policy
-- drop cannot be read by the additive allow-list, so it is confirmed at the command line. Every
-- policy it drops is named below with its own comment, and every one is restored byte-exactly by
-- the inverse, which was generated from `pg_policy` rather than retyped.
--
-- THE TAIL: the last permissive write policies naming a client role in `platform` and `iam`.
--
-- The four machinery batches closed the thirty-two tables that shared ONE generated policy name
-- and ONE predicate. What is left is the irregular remainder, and it is irregular in two ways
-- that have to be handled differently:
--
--   **FOR ALL policies** — `platform_admin_all` on the tables the CANONICAL ROUTE REFUSES for a
--     reason other than machinery (DOORS-ONLY-4 §5: a missing `created_by`, a component with no
--     declared composition parent, an undeclared column-exclusion design), plus
--     `feature_knob_no_write`, `omc_write`, `reference_declaration_no_client` and
--     `platform_admin_only` on `org_context_ledger` — which is granted to PUBLIC, and therefore
--     reaches `anon` as well as `authenticated`, which is why that one table contributes SIX
--     triples and not three. A FOR ALL policy is the READ policy as much as the write one, so
--     each is REPLACED by a `_select` twin carrying the same USING and the same roles, in the
--     same transaction, before the original is dropped. That is the shape DOORS-ONLY-4 taught
--     the generator, applied by hand where no generator will run.
--
--   **write-only lanes** (`FOR INSERT` / `UPDATE` / `DELETE`) — `iam.organizations`'
--     `org_insert/update/delete_policy`, `iam.permissions`' "Users can … permissions for own
--     resources" trio, `platform.associations`' `assoc_insert/update/delete`, and
--     `iam.organization_preferences`' `admin_insert/update/delete`. These are DROPPED outright,
--     because there is nothing in them to preserve: the SELECT lane on each of those tables is a
--     separate policy that this file does not touch, and the write PRIVILEGE behind them came off
--     in an earlier lane's chair step. DOORS-ONLY-4 §5 recorded them as "a named decision rather
--     than a sweep" — so they are named here, one at a time, with the doors that replaced them:
--     `public.org_update` / `iam.organization_archive`, `public.org_preferences_set`,
--     `public.assoc_add` and the association door family, all built by DOORS-ONLY-3.
--
-- 🚨 NOTHING ANYBODY CAN DO TODAY CHANGES. `authenticated` holds SELECT and no write privilege on
-- every table in this file — read live, table by table. A permissive write policy with no
-- privilege behind it is a DECLARATION, and the declaration is what the ruling closed and what
-- the guard counts.
--
-- `platform.categories` is deliberately EXCLUDED: its write grant is still held (the canonical
-- route refuses it over DD-249 / R12), and its withdrawal is the chair's, in
-- migrations/campaign/chairstep_doorsonly5_revoke_categories_client_writes.sql. Dropping its
-- permissive policies while the grant stands would change nothing the guard reads.
--
-- Inverse: migrations/inverse/doorsonly5_the_tail_of_the_write_surface.inverse.sql
-- Guard: `pnpm check:doors-only-schemas`, re-run live after this file.

set local lock_timeout = '2s';

-- ── iam.org_industries · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on iam."org_industries"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on iam."org_industries" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on iam."org_industries";

-- ── iam.organization_preferences · admin_delete is a write-only lane with no privilege behind it ──
drop policy "admin_delete" on iam."organization_preferences";

-- ── iam.organization_preferences · admin_insert is a write-only lane with no privilege behind it ──
drop policy "admin_insert" on iam."organization_preferences";

-- ── iam.organization_preferences · admin_update is a write-only lane with no privilege behind it ──
drop policy "admin_update" on iam."organization_preferences";

-- ── iam.organization_preferences · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on iam."organization_preferences"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on iam."organization_preferences" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on iam."organization_preferences";

-- ── iam.organizations · org_delete_policy is a write-only lane with no privilege behind it ──
drop policy "org_delete_policy" on iam."organizations";

-- ── iam.organizations · org_insert_policy is a write-only lane with no privilege behind it ──
drop policy "org_insert_policy" on iam."organizations";

-- ── iam.organizations · org_update_policy is a write-only lane with no privilege behind it ──
drop policy "org_update_policy" on iam."organizations";

-- ── iam.permissions · Users can create permissions for own resources is a write-only lane with no privilege behind it ──
drop policy "Users can create permissions for own resources" on iam."permissions";

-- ── iam.permissions · Users can delete permissions for own resources is a write-only lane with no privilege behind it ──
drop policy "Users can delete permissions for own resources" on iam."permissions";

-- ── iam.permissions · Users can update permissions for own resources is a write-only lane with no privilege behind it ──
drop policy "Users can update permissions for own resources" on iam."permissions";

-- ── iam.system_orgs · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on iam."system_orgs"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on iam."system_orgs" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on iam."system_orgs";

-- ── platform._bak_assoc_file_processed_document_20260812 · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."_bak_assoc_file_processed_document_20260812"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."_bak_assoc_file_processed_document_20260812" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."_bak_assoc_file_processed_document_20260812";

-- ── platform._bak_assoc_type_file_processed_document_20260812 · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."_bak_assoc_type_file_processed_document_20260812"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."_bak_assoc_type_file_processed_document_20260812" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."_bak_assoc_type_file_processed_document_20260812";

-- ── platform.associations · assoc_delete is a write-only lane with no privilege behind it ──
drop policy "assoc_delete" on platform."associations";

-- ── platform.associations · assoc_insert is a write-only lane with no privilege behind it ──
drop policy "assoc_insert" on platform."associations";

-- ── platform.associations · assoc_update is a write-only lane with no privilege behind it ──
drop policy "assoc_update" on platform."associations";

-- ── platform.feature_knob · feature_knob_no_write is FOR ALL, so it is the READ policy too ──
create policy "feature_knob_no_write_select" on platform."feature_knob"
  as permissive for select to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR false));
comment on policy "feature_knob_no_write_select" on platform."feature_knob" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `feature_knob_no_write`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "feature_knob_no_write" on platform."feature_knob";

-- ── platform.feature_knob · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."feature_knob"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."feature_knob" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."feature_knob";

-- ── platform.mtx_media_heal_queue · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."mtx_media_heal_queue"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."mtx_media_heal_queue" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."mtx_media_heal_queue";

-- ── platform.org_change_policy · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."org_change_policy"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."org_change_policy" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."org_change_policy";

-- ── platform.org_context_ledger · platform_admin_only is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_only_select" on platform."org_context_ledger"
  as permissive for select to public
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_only_select" on platform."org_context_ledger" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_only`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_only" on platform."org_context_ledger";

-- ── platform.org_module_config · omc_write is FOR ALL, so it is the READ policy too ──
create policy "omc_write_select" on platform."org_module_config"
  as permissive for select to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_owner(organization_id)));
comment on policy "omc_write_select" on platform."org_module_config" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `omc_write`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "omc_write" on platform."org_module_config";

-- ── platform.org_module_config · platform_admin_all is FOR ALL, so it is the READ policy too ──
create policy "platform_admin_all_select" on platform."org_module_config"
  as permissive for select to authenticated
  using (( SELECT is_platform_admin() AS is_platform_admin));
comment on policy "platform_admin_all_select" on platform."org_module_config" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `platform_admin_all`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "platform_admin_all" on platform."org_module_config";

-- ── platform.reference_declaration · reference_declaration_no_client is FOR ALL, so it is the READ policy too ──
create policy "reference_declaration_no_client_select" on platform."reference_declaration"
  as permissive for select to authenticated
  using ((( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin)));
comment on policy "reference_declaration_no_client_select" on platform."reference_declaration" is
  'DOORS-ONLY-5 2026-09-22: the FOR SELECT twin of `reference_declaration_no_client`, which was FOR ALL and PERMISSIVE and named a client role -- a client write SURFACE with no privilege behind it, since `authenticated` holds only SELECT on this table. The USING half is byte-identical, so reads do not move; the write half is not re-emitted. The canonical route refuses this table (a missing base column, an undeclared column-exclusion design, a composition parent that is not declared, or the DD-249 anonymous lane), so nothing regenerates its policies and this hand-written pair is DURABLE -- which is the whole reason these tables are closed by hand when every generated table in this campaign was closed in the generator.';
drop policy "reference_declaration_no_client" on platform."reference_declaration";
