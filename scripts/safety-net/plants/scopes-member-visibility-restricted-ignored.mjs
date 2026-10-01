// Lane SN-SCOPES (2026-10-01): a restricted field stops counting — inside the rolled-back transaction,
// iam.member_default_level is replaced by a body that returns editor for every organization and
// table, as if no field were ever restricted. S14 must go RED.
export default {
  id: "scopes-member-visibility-restricted-ignored",
  check: "scopes.sql-member-visibility",
  items: ["S14"],
  description: "iam.member_default_level ignores a restricted field (always editor)",
  mode: "in-transaction",
  apply: "create or replace function iam.member_default_level(p_organization_id uuid, p_table_id uuid default null) returns permission_level language sql stable set search_path to 'pg_catalog' as $$ select 'editor'::public.permission_level $$;",
};
