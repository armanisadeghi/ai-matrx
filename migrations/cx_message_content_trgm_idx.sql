-- cx_message_content_trgm_idx — 2026-09-18
--
-- THE INDEX behind "search inside messages" on /work/conversations. Until
-- today the deep search was a correlated EXISTS per candidate conversation,
-- each one detoasting every message body of that conversation and ILIKE-ing
-- it: 108,437 messages / 633 MB of text for one account, ~6 s in a parallel
-- plan OUTSIDE the function and a timeout inside it (plpgsql RETURN QUERY
-- never parallelises, and chat.message's SELECT policy runs the access walk
-- on top). The same scan ran TWICE per row — once in the filter, once in the
-- scorer — and the identifier-shaped auto-deep search that
-- cvx_list_scoped_search_admits_every_scored_identity.sql introduced made
-- every pasted UUID or commit sha pay it.
--
-- pg_trgm 1.6 serves `content::text ILIKE '%term%'` straight from a GIN
-- trigram index; a selective term (an id, a sha, a rare phrase) answers in
-- milliseconds and never touches TOAST for non-matching rows. Partial on the
-- exact predicate the list function uses, so the planner can pick it.
--
-- CONCURRENTLY, in its own file: chat.message is a hot table and a plain
-- CREATE INDEX would queue behind every in-flight writer. Apply from aidream
-- (`python db/apply_migrations.py --source matrx-frontend --only cx_message_content_trgm_idx`);
-- `pnpm db:apply` refuses autocommit files by name (CLAUDE.md § Migrations).
--
-- The first run (2026-09-18 15:12Z) died at that runner's 120 s statement
-- timeout and, because CONCURRENTLY cannot roll back, left an INVALID 16 kB
-- stub behind (removed by hand, 15:22Z — removing it inside this file is refused by
-- the runner's non-additive judgment, and rightly). This file raises its own
-- session timeout (a 633 MB trigram build is minutes, not seconds) and then
-- builds; both statements are re-runnable, as the runner's PARTIALLY APPLIED
-- rule demands.

SET statement_timeout = '45min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS cx_message_content_trgm_idx
  ON chat.message USING gin ((content::text) gin_trgm_ops)
  WHERE deleted_at IS NULL AND is_visible_to_user IS TRUE;
