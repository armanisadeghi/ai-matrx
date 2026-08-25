-- SECURITY (2026-08-25): `ops_issue_class_service_all` was named for the service
-- role but created with NO role restriction, i.e. `TO PUBLIC` — so `anon` held
-- unconditional ALL on the operational issue-classification table (the rows that
-- drive error triage, severity and alert thresholds). Proven live in a rolled-back
-- transaction: `set role anon` could INSERT a row.
--
-- Not internet-reachable — the `ops` schema is not in PostgREST's exposed list —
-- so this was latent rather than exploited, but it is wrong at the database level
-- and the public-exposure guard now watches for exactly this shape.
--
-- Canonical fix: scope it to `service_role`, matching every other `svc_all` policy
-- in this database. Consumers verified first and all unaffected:
--   * aidream writes it via the service-role REST key;
--   * the frontend reaches it only through the Python admin API (server-side);
--   * platform admins keep the separate `platform_admin_all` policy on this table.
drop policy if exists ops_issue_class_service_all on ops.ops_issue_class;
create policy ops_issue_class_service_all on ops.ops_issue_class
  as permissive for all to service_role
  using (true) with check (true);
