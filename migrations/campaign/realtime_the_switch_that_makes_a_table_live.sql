-- chair-step: this GRANTs EXECUTE on TWO new functions to `authenticated` and claims ONE topic prefix. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which functions and why. Both are RLS-predicate functions, not screen doors: Postgres evaluates `platform.realtime_topic_admits` AS the subscribing role inside the one SELECT policy on `realtime.messages`, so without the grant every private channel is refused with 42501 and the store can never go live. Neither takes an organization, neither returns a row, and `custom.realtime_topic_admits` answers only by asking `custom.assert_may_know_table` — the SAME call `custom.read_records` makes on its second line — so a subscriber is admitted exactly where the read door would admit her. The REVOKEs below NARROW: they take the implicit PUBLIC EXECUTE off both functions before `authenticated` is named, and take PUBLIC off the new registry table so no client can ever point a prefix at a function of its own. No DROP, no data movement, no existing declared grant changed. Before this file runs, the registry is empty and the policy admits nobody; after it, exactly one prefix answers.
-- lane: REALTIME (the record store goes live — PROGRESS-LIMITS-FIX-UI-2 §7)
--
--   platform.realtime_topic_admits(text)  → authenticated, EXECUTE
--   custom.realtime_topic_admits(text)    → authenticated, EXECUTE
--
--   platform.realtime_topic_prefix        → PUBLIC revoked (no client role is ever named)
--   platform.realtime_topic_prefix        += one row: `custom:table`
--
-- THE ORDER MATTERS AND IT IS THE WHOLE FILE. `revoke … from public` first, so the
-- implicit grant every new function is born with is gone before anything is named; then
-- `grant … to authenticated`, which is the only client privilege this lane creates; then the
-- prefix row, which is what actually turns a topic into a thing somebody may subscribe to.
-- Run in the other order and there is a window in which PUBLIC — `anon` included — holds
-- EXECUTE on the predicate, which is not an authorization leak (the predicate still asks the
-- ladder, and a caller with no `auth.uid()` is refused by name) but is a privilege nobody
-- asked for.

revoke all on platform.realtime_topic_prefix from public;
revoke all on function platform.realtime_topic_admits(text) from public;
revoke all on function custom.realtime_topic_admits(text) from public;

grant execute on function platform.realtime_topic_admits(text) to authenticated;
grant execute on function custom.realtime_topic_admits(text) to authenticated;

-- ── `custom` CLAIMS ITS PREFIX ──────────────────────────────────────────────────────────
-- The moment this row lands, `custom:table:<table_id>` becomes a topic the one policy will
-- answer for, and it answers with the store's own ladder. Nothing else in the platform
-- changes: a prefix nobody has registered is still refused, and there is still no INSERT
-- policy, so no browser may broadcast on any of it.
insert into platform.realtime_topic_prefix (prefix, admits_fn, description)
values ('custom:table',
        'custom.realtime_topic_admits(text)'::regprocedure,
        'One topic per Table in the record store. The payload is a NOTICE — ids and nothing else — and the subscriber re-reads through custom.read_records, so per-record visibility is decided at READ time by the one ladder, never by who received a message.')
on conflict (prefix) do update
  set admits_fn   = excluded.admits_fn,
      description = excluded.description;
