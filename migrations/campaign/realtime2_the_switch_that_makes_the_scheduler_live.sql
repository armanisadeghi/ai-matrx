-- chair-step: this GRANTs EXECUTE on ONE new function to `authenticated` and claims ONE topic prefix. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. `scheduler.realtime_topic_admits` is an RLS-predicate function, not a screen door: Postgres evaluates `platform.realtime_topic_admits` AS the subscribing role inside the one SELECT policy on `realtime.messages`, so without the grant every `scheduler:user:*` channel is refused with 42501 — which is the state the platform has been in since the database was created, and the reason a LIVE feature (`lib/scheduler-client/realtime.ts`, `private: true`) has joined nothing and delivered nothing, ever. The function takes no organization, returns no row, and answers true for exactly ONE string: `scheduler:user:<the caller's own auth.uid()>`. The REVOKE below NARROWS — it takes the implicit PUBLIC EXECUTE off the new function before `authenticated` is named. No DROP, no data movement, no existing declared grant changed. Before this file runs, `scheduler:user` is an unregistered prefix and the policy admits nobody on it; after it, that one prefix answers, and it answers with the identity the scheduler's own row policies already compare against.
-- lane: REALTIME-2 (the private-channel census — PROGRESS-REALTIME "left behind", item 3)
--
--   scheduler.realtime_topic_admits(text)  → authenticated, EXECUTE
--   platform.realtime_topic_prefix         += one row: `scheduler:user`
--
-- ORDER MATTERS, and it is the same order lane REALTIME used: `revoke … from public` first,
-- so the implicit grant every new function is born with is gone before anything is named;
-- then `grant … to authenticated`, the only client privilege this file creates; then the
-- prefix row, which is what actually turns the topic into a thing somebody may subscribe to.

revoke all on function scheduler.realtime_topic_admits(text) from public;

grant execute on function scheduler.realtime_topic_admits(text) to authenticated;

-- ── `scheduler` CLAIMS ITS PREFIX ───────────────────────────────────────────────────────
-- The moment this row lands, `scheduler:user:<user_id>` becomes a topic the one policy will
-- answer for. Nothing else in the platform changes: a prefix nobody has registered is still
-- refused, and there is still no INSERT policy on `realtime.messages`, so no browser may
-- broadcast on any of it — every frame on this topic came out of
-- `scheduler.broadcast_task_change` / `broadcast_run_change` inside the transaction that
-- wrote the row it describes.
insert into platform.realtime_topic_prefix (prefix, admits_fn, description)
values ('scheduler:user',
        'scheduler.realtime_topic_admits(text)'::regprocedure,
        'One topic per person for the scheduler feed. Unlike the record store''s topic the payload is DATA — realtime.broadcast_changes puts the whole sch_* row on the wire — so admission is the person the topic names and nobody else: a task shared with a colleague is read through the read doors, never by putting her on the owner''s entire feed.')
on conflict (prefix) do update
  set admits_fn   = excluded.admits_fn,
      description = excluded.description;
