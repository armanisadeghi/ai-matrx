-- target: branch,production
-- additive: yes
-- guard: platform/realtime_broadcast_enabled
-- based-on: platform.realtime_topic_admits(text) a7f17193d9226bdb68f0d539e48a1f1d9f6d1396c8446ff293cca96756ab541a
--
-- REALTIME, file 1b — THE PREDICATE IS STABLE, AND IT NO LONGER SWALLOWS A FAULT.
--
-- THE SEAT SUITE FOUND THIS, WHICH IS WHAT A SUITE IS FOR. The first draft was VOLATILE for
-- one reason: it recorded its own faults in `ops.system_error`, and a STABLE function may not
-- write. Measured consequence, live: `select count(*) from realtime.messages` under the new
-- policy took the predicate ONCE PER ROW over 79,604 rows and hit the statement timeout.
-- Realtime's own authorization check is bounded, so it would not have met this — but a
-- VOLATILE predicate on a table anything may scan is a loaded gun on the floor, and the
-- suite's own probe is what stood on it.
--
-- SO IT IS STABLE, AND THE FAULT PATH GOT BETTER RATHER THAN WORSE. The `exception when
-- others` that bought the write is gone entirely, and that is the honest shape:
--
--   · A REFUSAL is `false`. The answering function converts the ladder's own two refusals
--     (`42501` not a member / no access to this table, `22004` no organization) into `false`
--     itself, and a malformed or unclaimed topic never reaches a ladder at all.
--   · A FAULT RAISES, and it should. The only way to reach one now is a registered answering
--     function that is broken — and then the socket join FAILS, loudly, with the message in
--     the Postgres log and a channel error at the client, where `@ai-matrx/realtime`'s status
--     handling turns it into the honest "not live" sentence the grid already knows how to
--     say. Turning that into `false` would have made a broken platform look exactly like a
--     person who simply is not a member, which is the silence this campaign exists to end.
--
-- Nothing else about the body moves: same registry read, same longest-prefix rule, same
-- dispatch, same `coalesce(…, false)`.

create or replace function platform.realtime_topic_admits(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_fn regprocedure;
  v_ok boolean;
begin
  -- THE SWITCH, NAMED HERE AS WELL AS IN THE POLICY. Not belt and braces: the rule that lets
  -- this file name production requires the body it replaces to READ the knob that holds it
  -- off, and that rule is right — a switch a body never reads is a comment, not a switch.
  -- (`#>> '{}'`, not `#>> '{value}'`: `platform.knob_resolve` answers a BARE jsonb scalar, and
  -- the other spelling reads null forever.) It costs one memoized resolve, and it means the
  -- predicate is off even if somebody later writes a second policy that forgets to ask.
  if not coalesce((platform.knob_resolve('platform', 'realtime_broadcast_enabled', null) #>> '{}')::boolean, false) then
    return false;
  end if;

  if p_topic is null or btrim(p_topic) = '' then
    -- A join with no topic is not a topic this platform owns. Nothing to admit.
    return false;
  end if;

  -- THE LONGEST REGISTERED PREFIX WINS, so `custom:table` can be registered beside a future
  -- `custom:dashboard` without either one swallowing the other's topics. The `|| ':'` matters:
  -- a prefix must end at a segment boundary, or `custom:tableau:…` would match `custom:table`.
  select r.admits_fn
    into v_fn
    from platform.realtime_topic_prefix r
   where p_topic like r.prefix || ':%'
   order by length(r.prefix) desc
   limit 1;

  if v_fn is null then
    -- NOT A REFUSAL OF A PERSON — a topic no schema has claimed. A client that reaches here
    -- asked for something this database does not broadcast at all.
    return false;
  end if;

  -- NO `exception when others` HERE, DELIBERATELY. See the header: a refusal is already a
  -- `false` by the time it gets back from the owning schema, so anything that raises from
  -- this line is the platform being broken, and a broken platform must not be able to
  -- impersonate a person who is not a member.
  execute format('select %s($1)', v_fn::regproc::text) into v_ok using p_topic;
  return coalesce(v_ok, false);
end;
$$;

comment on function platform.realtime_topic_admits(text) is
  'THE USING clause of the one RLS policy on realtime.messages. STABLE — it is evaluated against a table anything may scan. Dispatches by topic prefix to the owning schema''s own access question, so a live topic admits exactly the people that schema''s doors admit. A refusal is false; a FAULT raises, because a broken answering function must never look like a refused person.';
