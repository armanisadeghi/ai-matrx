-- chair-step: this GRANTs EXECUTE on FIVE new functions to `authenticated`, and nothing else. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. No REVOKE, no DROP, no data movement, no existing grant changed. All five are already declared in platform.client_callable_door by doorstwo_the_document_and_cadence_doors.sql, which runs before this file.
-- lane: DOORS-TWO (document generation, PRODUCTS row 5; and the notify editor's cadence list, DOOR-18)
--
--   custom.doc_templates(uuid, uuid)          → authenticated, EXECUTE
--   custom.doc_template_delete(uuid, uuid)    → authenticated, EXECUTE
--   custom.doc_renders(uuid, uuid)            → authenticated, EXECUTE
--   custom.doc_signatures(uuid, uuid)         → authenticated, EXECUTE
--   custom.subscription_cadences(uuid)        → authenticated, EXECUTE
--
-- WHO MAY CALL THEM is not decided by these grants. Each one asks
-- `custom.assert_client_may_reach` for the organization wall, then
-- `custom.assert_client_may_open` (viewer) on the Table or the record it is about —
-- `custom.doc_template_delete` asks `custom.assert_client_may_change` at editor and then
-- `custom.assert_store_door`. A grant opens the door; the ladder inside decides who walks
-- through it.
--
-- NOTHING BEHIND THE DOORS IS OPENED. `custom.doc_template` (the view),
-- `custom.doc_render` and `custom.doc_signature` keep exactly the client privileges they
-- have today, which is none. That is the point of the five functions: a browser never
-- needs SELECT on the store's own tables to see its own documents.
--
-- MEASURED after the doors file applied (2026-09-20 13:43Z): the first FOUR came out
-- already granted, because `platform.reopen_declared_doors` swept after each later
-- statement and found their declaration rows; `custom.subscription_cadences` was the LAST
-- object created and nothing swept after it, so it alone read `client_can = false`. That
-- is the same asymmetry lane FORMS wrote down, and it is exactly why the grant is issued
-- by name here rather than hoped for. All five are listed so this file states the whole
-- intended set, not only the one that happened to be missing this time.
--
-- Idempotent: an already-held GRANT is a no-op.

grant execute on function custom.doc_templates(uuid, uuid) to authenticated;
grant execute on function custom.doc_template_delete(uuid, uuid) to authenticated;
grant execute on function custom.doc_renders(uuid, uuid) to authenticated;
grant execute on function custom.doc_signatures(uuid, uuid) to authenticated;
grant execute on function custom.subscription_cadences(uuid) to authenticated;
