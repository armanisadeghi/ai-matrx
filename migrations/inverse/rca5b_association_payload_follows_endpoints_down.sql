-- chair-step: RC-A5b inverse — drops the restrictive gate on platform.associations, re-opening content-bearing edges (text_anchor quotes, relation snapshots, render bindings, party observations) to every member of the edge's organization. Run only to relieve a measured regression, and re-apply the forward file as soon as it is fixed.
-- The forward file is migrations/rca5b_association_payload_follows_endpoints.sql; design:
-- common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md. The declaration
-- (rca5a) stays; its own inverse removes it. Policy DDL takes the supautils 23-relation lock until
-- COMMIT, so this file holds nothing else.

-- window-class: DROP POLICY on platform.associations takes the supautils 23-relation lock until COMMIT; run in the 1-4 AM PT window unless relieving a live regression.

set local lock_timeout = '2s';

drop policy if exists assoc_payload_follows_endpoints on platform.associations;
