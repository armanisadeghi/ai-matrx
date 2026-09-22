-- chair-step: DOORS-ONLY-5 inverse — there is no "un-regenerate". Running the canonical route is
-- how every table in this database gets its policies, and the state it produced IS the canonical
-- state; a file that put the pre-canonical policies back would be hand-writing policies beside
-- the generator, which db-rules 6d forbids and iam.verify_canonical reports as drift.
--
-- To undo THIS regeneration, undo what made it possible and re-run the route: apply
-- migrations/inverse/doorsonly5_the_class_learns_an_optin_anonymous_read_lane.inverse.sql, which
-- takes platform.categories off the opt-in anonymous lane. iam.apply_rls then REFUSES this table
-- again (DD-249 / R12), which is the pre-ruling state, and the write grants it withdrew are put
-- back by migrations/inverse/chairstep_doorsonly5_revoke_categories_client_writes.inverse.sql.
--
-- This file refuses rather than pretending there is a third way.

do $$
begin
  raise exception 'doorsonly5 inverse: a regeneration has no inverse of its own. Run doorsonly5_the_class_learns_an_optin_anonymous_read_lane.inverse.sql (and, if the grants are wanted back, chairstep_doorsonly5_revoke_categories_client_writes.inverse.sql) — see this file''s header.';
end $$;
