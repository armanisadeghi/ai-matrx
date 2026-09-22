-- target: branch,production
-- additive: yes
-- guard: platform/realtime_broadcast_enabled
--
-- THE GUARD IS THIS LANE'S OWN, NOT THE RECORD STORE'S. `custom/system_enabled` was the
-- obvious knob to borrow and borrowing it would have been wrong: the policy below is the one
-- every future private channel on this platform is authorized by, and wiring it to the record
-- store's product switch would mean the day somebody turns the store off, the scheduler's
-- channel goes dark with it. File 0 seeds `platform/realtime_broadcast_enabled`, the policy
-- READS it, and there are two independent OFF states rather than one: the knob, and a topic
-- registry that is empty until the switch file registers a prefix.
--
-- REALTIME, file 1 — THE PLATFORM'S FIRST DATABASE-BROADCAST AUTHORIZATION, AND IT IS A
-- PRIMITIVE, NOT A FEATURE.
--
-- Supabase authorizes a PRIVATE channel by running RLS on `realtime.messages` ONCE, at join
-- time, with `realtime.topic()` set to the topic the socket asked for, and it caches that
-- answer for the life of the connection. Today this database has RLS ENABLED on that table
-- and ZERO POLICIES, which means every private channel on the whole platform is refused —
-- including the scheduler's, which declares `private: true` and has been joining nothing.
-- Measured 2026-09-21 on the main database: `select count(*) from pg_policy where polrelid =
-- 'realtime.messages'::regclass` → 0.
--
-- So the first policy written here decides the shape for everything that follows, and the
-- wrong shape is the easy one: a per-feature policy, then a second, then eleven, each holding
-- its own copy of an access question that already has exactly one answer somewhere else. That
-- is how one ladder becomes two ladders.
--
-- THE SHAPE: ONE policy, forever. It asks `platform.realtime_topic_admits(topic)`, which reads
-- the topic's PREFIX and hands the whole question to the schema that owns that prefix. A
-- schema registers its prefix and the one function that answers for it; nothing else is ever
-- added to `realtime.messages`. `custom` registers `custom:table` in file 2 and answers with
-- the same ladder its read doors ask (`custom.assert_may_know_table`), so a topic cannot admit
-- somebody a door would refuse — there is no second opinion to drift.
--
-- THERE IS NO INSERT POLICY, AND THAT IS THE POINT. `for select` admits a SUBSCRIBER. Without
-- an `insert` policy no browser may ever BROADCAST on one of these topics, so every notice a
-- client receives came out of the database, from the trigger in file 3, under the store's own
-- doors. A client-sent notice would be one browser asserting that somebody else's records
-- moved, which is a thing no screen should ever be made to believe.
--
-- A POLICY MUST NEVER RAISE. An exception inside an RLS policy surfaces as an opaque socket
-- failure with no sentence anyone can act on, and the ladder DOES raise — it refuses by
-- exception, which is right for a door and wrong for a predicate. So every arm below turns a
-- refusal into `false`, and a FAULT is recorded in `ops.system_error` before it becomes the
-- same `false`, because "not admitted" and "something is broken" must never be the same
-- silence. That is also why this function is VOLATILE rather than STABLE: a STABLE function
-- may not write, and a predicate that cannot record its own fault is a predicate that fails
-- silently.
--
-- WHY A REGISTRY TABLE AND NOT A CASE STATEMENT. A `case` on prefix inside `platform` makes
-- `platform` depend on every feature schema, which inverts the dependency and means a feature
-- cannot ship its own topic without editing the platform. The registry stores the answering
-- function as a `regprocedure`, so the catalogue itself validates at registration time that
-- the function exists with the right signature, and a rename follows automatically instead of
-- rotting into a dangling string.
--
-- THE DOOR DECLARATION IS NOT CEREMONY. Measured here: a SECURITY DEFINER function granted to
-- `authenticated` has that grant TAKEN BACK by this database's own `ddl_guard` unless it is
-- declared in `platform.client_callable_door` first. An RLS predicate is evaluated AS the
-- subscribing role, so without the grant the policy itself raises `42501` and every private
-- channel stays refused — the exact silence this file exists to end.

-- ── THE REGISTRY ────────────────────────────────────────────────────────────────────────
-- Not a business-shaped table (no organization_id, no records, no custom fields), so it is
-- not `platform.provision`'s to make: this is platform plumbing, the same class as
-- `platform.memo_*`. No write grant to any client role, ever — a client that could write this
-- row could point a prefix at a function of its own choosing.
create table if not exists platform.realtime_topic_prefix (
  prefix        text         primary key,
  admits_fn     regprocedure not null,
  description   text         not null,
  registered_at timestamptz  not null default now()
);

comment on table platform.realtime_topic_prefix is
  'Which schema answers for which realtime topic prefix. Read ONLY by platform.realtime_topic_admits, the single USING clause of the single RLS policy on realtime.messages. A schema registers its prefix here and answers with the SAME access question its own doors ask.';

comment on column platform.realtime_topic_prefix.admits_fn is
  'A (text) -> boolean function, stored as regprocedure so the catalogue validates it at registration and follows a rename. It is called with the WHOLE topic, not the remainder, so the owning schema parses its own topic grammar.';


-- ── THE ONE PREDICATE ───────────────────────────────────────────────────────────────────
create or replace function platform.realtime_topic_admits(p_topic text)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_fn regprocedure;
  v_ok boolean;
begin
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

  execute format('select %s($1)', v_fn::regproc::text) into v_ok using p_topic;
  return coalesce(v_ok, false);

exception
  when others then
    -- NOTHING FAILS SILENTLY. A broken answering function must not look like a refused
    -- person: it is recorded with the topic and the message, and only then becomes `false`.
    begin
      insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                    organization_id, payload)
      values ('realtime_topic_admits_failed', sqlstate, sqlerrm, 'platform.realtime',
              left(p_topic, 200), '00000000-0000-0000-0000-000000000000'::uuid,
              jsonb_build_object('topic', p_topic));
    exception when others then
      -- The authorization check may well run in a read-only transaction. Say so in the log
      -- rather than pretending the first failure did not happen.
      raise warning 'realtime_topic_admits could not record its own failure for topic %: %',
        p_topic, sqlerrm;
    end;
    return false;
end;
$$;

comment on function platform.realtime_topic_admits(text) is
  'THE USING clause of the one RLS policy on realtime.messages. Dispatches by topic prefix to the owning schema''s own access question, so a live topic admits exactly the people that schema''s doors admit. Never raises: a refusal and a fault both answer false, and a fault is recorded in ops.system_error first.';

-- THE DOOR DECLARATION. It must come AFTER the function, not before: `ddl_guard` resolves
-- `identity_args` against the live catalogue and refuses a row naming a function that does
-- not exist yet (DD-223). The EXECUTE grant lives in the switch file, and the guard keeps
-- it because this row is already here when that GRANT fires.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, anonymous_callers, signed_in_callers)
values
  ('platform', 'realtime_topic_admits', 'p_topic text',
   'Not a door a screen calls: it is the USING clause of the one RLS policy on realtime.messages, so Postgres evaluates it AS the subscribing role and that role must hold EXECUTE or every private channel is refused with 42501. It takes no organization and no identity argument — it reads the seat from the session the way every other door does — and it answers only true/false about a topic string the caller already knows, so a client calling it directly learns nothing it could not learn by trying to subscribe.',
   false, true)
on conflict do nothing;

-- ── THE POLICY ──────────────────────────────────────────────────────────────────────────
-- TWO INDEPENDENT WAYS THIS IS OFF, and the cheap one is first so a refused join costs one
-- knob read rather than a ladder walk: the platform switch, then the topic's owning schema.
-- Until the switch file grants EXECUTE and `custom` claims its prefix, the registry is EMPTY
-- and this policy admits NOTHING even with the knob on — which is the right state for a
-- policy to be born in.
create policy platform_topics_admit_their_own
  on realtime.messages
  for select
  to authenticated
  using (
    coalesce((platform.knob_resolve('platform', 'realtime_broadcast_enabled', null) #>> '{}')::boolean, false)
    and platform.realtime_topic_admits(realtime.topic())
  );
