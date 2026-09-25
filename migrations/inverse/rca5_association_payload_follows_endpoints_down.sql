-- chair-step: RC-A5 inverse — removes the restrictive gate on platform.associations and the edge_payload_kind declaration; re-opens content-bearing edges (text_anchor quotes, relation snapshots, party observations) to every member of the edge's organization. Run only to relieve a measured regression, and re-apply the forward file as soon as it is fixed.
-- The forward file is migrations/rca5_association_payload_follows_endpoints.sql; design:
-- common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md.
-- The policy must go first: the column is referenced by its predicate. The policy DDL takes the
-- supautils 23-relation lock until COMMIT, and the two column drops on a 13-row registry are instant.

set local lock_timeout = '5s';

drop policy if exists assoc_payload_follows_endpoints on platform.associations;

alter table platform.edge_payload_kind
  drop column if exists payload_follows_endpoints_reason,
  drop column if exists payload_follows_endpoints;
