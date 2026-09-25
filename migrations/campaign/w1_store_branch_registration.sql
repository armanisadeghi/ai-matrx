-- target: branch
--
-- W1-STORE — the registry row and the canonical RLS for `custom.record`. BRANCH ONLY.
--
-- WHY BRANCH ONLY, AND WHY THAT IS NOT A GAP.
-- Chair ruling, BUILD-LOG 2026-09-17. One INSERT into `platform.entity_types` on
-- PRODUCTION mints a live entity token: `pnpm check:entity-types` reds against the
-- installed `@ai-matrx/associations` vocabulary and `scripts/release.sh` turns that into a
-- halted frontend release train for every unrelated lane. `W1-REG`'s `must not touch` cell
-- forbids it, and both runners already refuse the statement at `--target production` by
-- name. So production's registry gains no `custom:` token before the switch checklist, and
-- REC-56's certification is proven HERE, on the rehearsal branch, where the token is a
-- fixture.
--
-- WHAT PRODUCTION PROVES INSTEAD is structural and cannot pass unless the store file ran
-- there: sixteen rows in `pg_inherits`, `partstrat = 'h'`, the primary key read from
-- `pg_index`, `has_schema_privilege('authenticated','custom','USAGE')` false, a planted
-- direct INSERT as `authenticated` returning 42501, and the eight kernel rows.
--
-- 🚨 IT RUNS **BEFORE** THE STORE FILE, AND THAT ORDER IS NOT A PREFERENCE.
-- Both databases carry an event trigger that REFUSES an entity-shaped table created
-- outside the provisioner — the branch in `platform._ddl_guard` lane (d), production in
-- `platform._provision_shape_guard` lane (d) (the rule MOVED there 2026-09-16, so the two
-- databases disagree about which trigger raises but not about the refusal). Both grant the
-- SAME exemption: a `platform.entity_types` row that already names the schema and table.
-- So this row is what makes `w1_store_custom_record_store.sql` applicable at all, and the
-- `iam.apply_rls` call that needs the table to EXIST lives in
-- `w1_store_branch_certification.sql`, which runs after it.
--
-- `is_versioned` is FALSE on purpose: `_version_capture` is not attached to
-- `custom.record` (the writer over `history.row_versions.row_data` is held OFF by
-- `custom/row_versions_guard`, and `W3-HIST` owns History), and the certifier's
-- `trg_version_capture` check SKIPs an unversioned row rather than demanding a trigger
-- this campaign has not built yet.

set lock_timeout = '2s';
set statement_timeout = '120s';

insert into platform.entity_types (
  token, schema_name, table_name, label,
  rls_variant, is_component, is_versioned, has_soft_delete, is_listed, is_active,
  default_visibility, data_class, data_class_reason, default_list_scope,
  audit_class, origin, notes
) values (
  'record', 'custom', 'record', 'Record',
  'entity', false, false, true, true, true,
  'internal', 'organization',
  'A custom record is its organization''s own business data: visible inside the organization by its access grants, never to the world by default.',
  'organization',
  'entity', 'custom',
  'W1-STORE, unified data campaign. BRANCH FIXTURE — production''s registry gains no custom token before the switch checklist.'
)
on conflict (token) do nothing;

