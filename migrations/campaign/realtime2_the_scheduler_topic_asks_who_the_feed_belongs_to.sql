-- target: branch,production
-- additive: yes
-- guard: platform/realtime_broadcast_enabled
--
-- REALTIME-2, file 2 — THE SECOND SCHEMA CLAIMS ITS PREFIX, AND A LIVE FEATURE STOPS BEING
-- QUIETLY BROKEN.
--
-- WHAT THIS FIXES, IN ONE SENTENCE. `lib/scheduler-client/realtime.ts` has declared
-- `private: true` on `scheduler:user:<user_id>` since the day it was written, and RLS has
-- been ENABLED on `realtime.messages` with ZERO POLICIES since this database was created, so
-- that channel has joined NOTHING, ever — silently, behind a screen that looked healthy.
-- Lane REALTIME wrote the platform's first policy on that table and registered ONE prefix
-- (`custom:table`); every other prefix, this one included, still falls through
-- `platform.realtime_topic_admits` to "no schema has claimed this" and is refused. The
-- scheduler is the whole of the rest of the census: across matrx-frontend, the `@ai-matrx/*`
-- package sources in aidream, matrx-extend and matrx-local, exactly TWO channel declarations
-- carry `private: true`, and the other one is the record store's.
--
-- WHO IS ADMITTED, AND WHY IT IS NOT THE ROW POLICY.
-- `scheduler.broadcast_task_change` / `broadcast_run_change` send on
-- `'scheduler:user:' || coalesce(new.user_id, old.user_id)` — one topic per PERSON, carrying
-- WHOLE ROWS (`realtime.broadcast_changes` puts `new` and `old` on the wire; unlike the record
-- store's notice, this payload is data). So the admission question is not "may she see this
-- row" — there is no row at join time, and one answer covers every row that will ever travel
-- on that topic. It is "whose feed is this", and the topic itself says: the person it names.
--
-- That is deliberately NARROWER than `scheduler.sch_task`'s `std_select` policy, which also
-- admits a colleague a task was shared with, an organization admin and a platform admin. A
-- shared task is still readable — by reading it, through the doors that already decide that,
-- with every other row of that policy applied one at a time. What this topic cannot do is
-- put a colleague who was shared ONE task onto a feed that carries EVERY row belonging to
-- that person, which is what any wider rule here would mean, because the payload is the row
-- and the subscription is the person. The narrow answer refuses nobody anything they can
-- reach; it only declines to make a per-row grant into a per-person firehose.
--
-- NOTHING IS INVENTED. `auth.uid()` is the same identity `sch_task`'s own policies compare
-- against (`created_by = (select auth.uid())`), read the same way, from the same session.
-- This function adds no new access concept, no new table and no new word.
--
-- IT REFUSES A SEAT THAT IS NOT A PERSON, for the same reason `custom.realtime_topic_admits`
-- does: an RLS predicate is evaluated AS the subscribing role, and if Realtime ever evaluated
-- it without a JWT, an `auth.uid()` of NULL must refuse rather than match a NULL topic part.
-- `is distinct from` and an explicit null check make that impossible to get wrong by accident.

create function scheduler.realtime_topic_admits(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_rest text;
  v_who  uuid;
  v_me   uuid;
begin
  -- THE GRAMMAR IS THIS SCHEMA'S OWN, which is the whole reason the registry dispatches the
  -- WHOLE topic rather than a remainder: `scheduler` parses `scheduler:user:<uuid>` and
  -- nothing else. A prefix that merely starts the same (`scheduler:userx:…`) is not this.
  if p_topic is null or p_topic not like 'scheduler:user:%' then
    return false;
  end if;

  -- 'scheduler:user:' is fifteen characters, so the remainder starts at sixteen.
  v_rest := substring(p_topic from 16);
  -- ONE segment. `scheduler:user:<uuid>:anything` is not a topic this schema broadcasts on,
  -- and admitting it would admit a room the database never writes to — harmless today and
  -- exactly the kind of looseness that becomes a leak when somebody adds a sub-topic later.
  if v_rest = '' or position(':' in v_rest) > 0 then
    return false;
  end if;

  begin
    v_who := v_rest::uuid;
  exception when others then
    return false;
  end;

  -- A SUBSCRIBER IS ALWAYS A PERSON. No JWT, no admission — never a NULL that could match.
  v_me := auth.uid();
  if v_me is null or v_who is null then
    return false;
  end if;

  return v_me = v_who;
end;
$$;

comment on function scheduler.realtime_topic_admits(text) is
  'Answers for the topic prefix `scheduler:user` on behalf of schema scheduler, through platform.realtime_topic_admits. The topic names a PERSON and carries that person''s whole sch_* rows, so exactly that person is admitted: auth.uid() = the uuid in the topic. Deliberately narrower than sch_task''s row policy — a task shared with a colleague is read through the read doors one row at a time, never by putting her on the owner''s entire feed.';

-- THE DOOR DECLARATION, BEFORE THE GRANT (which lives in the switch file). `ddl_guard` takes
-- a client EXECUTE grant straight back off a SECURITY DEFINER function that has no row here,
-- and an RLS predicate is evaluated AS the subscribing role — so without the grant every
-- scheduler channel stays refused with 42501, which is the exact silence this file ends.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, anonymous_callers, signed_in_callers)
values
  ('scheduler', 'realtime_topic_admits', 'p_topic text',
   'Not a door a screen calls: it is reached only through platform.realtime_topic_admits, the USING clause of the one RLS policy on realtime.messages, which Postgres evaluates AS the subscribing role — so that role must hold EXECUTE or every scheduler channel is refused with 42501. It takes no organization and no identity argument (it reads the seat from the session, as every door does) and answers only true/false about a topic string the caller already knows: a client calling it directly learns nothing it could not learn by trying to subscribe, and the only string it can answer true for is that client''s own user id.',
   false, true)
on conflict do nothing;
