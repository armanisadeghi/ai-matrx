-- chair-step: DOORS-ONLY-5 inverse — RE-GRANTS `authenticated`'s INSERT, UPDATE and DELETE on
-- platform.categories. The table does NOT become client-writable by running this alone: the
-- three named restrictive refusal policies still refuse every one of those commands, so the
-- effect is to put the declared SURFACE back, which is exactly what the doors-only ruling
-- closed. Only run it to undo a withdrawal that broke a real path, and say which path.
--
-- It restores nothing about `anon`, whose thirteen column-level SELECT grants (the DD-249 / R12
-- read lane for 355 public rows) the forward file never touched.

set local lock_timeout = '2s';

grant insert, update, delete on table platform.categories to authenticated;
