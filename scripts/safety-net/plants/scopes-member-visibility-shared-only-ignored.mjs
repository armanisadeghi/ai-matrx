// Lane SN-SCOPES (2026-10-01): the store forgets an organization's "members see only what is shared"
// choice — iam.member_lane_open answers true for everyone, inside the suite's rolled-back transaction.
// S11 must go RED (the member still opens Dana under shared-only).
export default {
  id: "scopes-member-visibility-shared-only-ignored",
  check: "scopes.sql-member-visibility",
  items: ["S11"],
  description: "iam.member_lane_open always true: a shared-only organization's members see every record again",
  mode: "in-transaction",
  apply: "create or replace function iam.member_lane_open(p_organization_id uuid) returns boolean language sql stable set search_path to 'pg_catalog' as $$ select true $$;",
};
