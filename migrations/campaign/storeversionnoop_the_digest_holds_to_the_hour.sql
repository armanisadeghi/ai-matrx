-- additive: yes
--
-- chair-step: it ADDS one runner-state table, `custom.agg_digest_checked` (one row per digest
--   subscription: the last slot the runner judged), and three new functions
--   (`custom.agg_digest_judged_at`, `custom.agg_digest_run_at`, `custom.agg_digest_tick_at`), and
--   REPLACES three live bodies — `custom.agg_digest_run` and `custom.agg_digest_tick` become the
--   same runner with its clock handed in (`now()`), and `custom.subscriptions`' "next summary"
--   reads the judged slot. Nothing is dropped, granted or revoked; no row of anybody's data is
--   written; no trigger is created. The new table is written only by the runner. The inverse is
--   `migrations/inverse/storeversionnoop_the_digest_holds_to_the_hour_down.sql`.
-- lock: custom
-- lane: STORE-VERSION-NOOP
-- based-on: custom.agg_digest_run(uuid, uuid, timestamp with time zone) 961595f2a70cc56fda220fb7197aa940f123be90d7cf6acbd2b27ee6cc80e03b
-- based-on: custom.agg_digest_tick() 9972b85bf1d23f5e96bdab0fc20735557b2d781c0777795a5401bca613a635cc
-- based-on: custom.subscriptions(uuid, uuid) e7963a8961dd7ce1addfbca978ad8e31ae6d98a5c98405ebac263312c36d7a7e
--
-- STORE-VERSION-NOOP (defect 2) — AN HOURLY SUMMARY HOLDS TO THE HOUR.
--
-- WHAT WAS WRONG. `custom.agg_digest_tick` (cron, every 5 minutes) asks `custom.agg_digest_due_at`
-- for the next slot AFTER `custom.agg_last_digest_at`, and that reads the last summary SENT
-- (communication.notification's `window_end`). `custom.agg_digest_run` does not send an empty
-- summary — rightly: "a weekly 'nothing happened' is how people learn to ignore a channel". So one
-- quiet hour froze the due time in the past. Production, 2026-09-23 03:03Z: Rincon's hourly rule
-- was "due" at 2026-09-22 17:00Z; from then on the runner re-assembled the summary on every tick
-- and sent the next change within 5 minutes of it happening, not on the hour; and
-- `custom.subscriptions.next_digest_at` — the screen's "next summary" — read ten hours ago.
-- Reproduced on the dev clone by scripts/campaign-tests/storeversionnoop_digest_green.sql clause 1
-- (RED before this file: next summary 02:00 when it is past 04:00).
--
-- THE RULING: the runner tracks the last slot it CHECKED, separately from the last summary it SENT.
--   · `custom.agg_digest_checked` — (organization_id, rule_id) → the last slot judged, and whether
--     it was sent or empty. A summary that could not be made ("incomplete": no recipient, a
--     deleted view) is NOT judged and does not move it, so the screen keeps saying what is missing.
--     The watermark the summary's CONTENT starts from is untouched: it is still the last summary
--     sent (`custom.agg_digest_assemble`), so a quiet hour never drops a change.
--   · `custom.agg_digest_judged_at(org, rule)` = the later of the last summary sent and the last
--     slot checked. The tick and `custom.subscriptions` both schedule from it — one clock.
--   · `custom.agg_digest_run_at(org, rule, since, now)` / `custom.agg_digest_tick_at(now, org)` —
--     the runner with its clock handed in, so the schedule is testable at a fixed clock. The
--     cron's `custom.agg_digest_tick()` and `custom.agg_digest_run(org, rule, since)` keep their
--     signatures and call them with `now()`.
-- "THERE IS NO SECOND LEDGER" stays true of SENDS: communication.notification is still the only
-- record of what was sent. The new table records what was CHECKED, which no send can.

create table if not exists custom.agg_digest_checked (
  organization_id uuid        not null,
  rule_id         uuid        not null,
  slot_at         timestamptz not null,
  outcome         text        not null,
  checked_at      timestamptz not null default now(),
  constraint agg_digest_checked_pk primary key (organization_id, rule_id),
  constraint agg_digest_checked_outcome check (outcome in ('sent', 'empty'))
);
comment on table custom.agg_digest_checked is
  'STORE-VERSION-NOOP (2026-09-23): the last slot the digest runner JUDGED for each hourly/daily/weekly subscription (sent, or checked and empty). The schedule follows it; the summary''s content window still starts at the last summary SENT. Written only by custom.agg_digest_run_at.';

create or replace function custom.agg_digest_judged_at(p_organization_id uuid, p_rule_id uuid)
returns timestamptz
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- The later of the last summary SENT and the last slot the runner CHECKED. greatest() ignores
  -- a NULL, so a subscription that has only ever sent, or only ever been checked, still answers.
  select greatest(custom.agg_last_digest_at(p_organization_id, p_rule_id),
                  (select c.slot_at from custom.agg_digest_checked c
                    where c.organization_id = p_organization_id and c.rule_id = p_rule_id));
$function$;

create or replace function custom.agg_digest_run_at(p_organization_id uuid, p_rule_id uuid, p_since timestamptz, p_now timestamptz)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  s        record;
  v_digest jsonb;
  v_n      integer := 0;
  v_id     uuid;
  v_now    timestamptz := coalesce(p_now, now());
  v_empty  boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_digest_run');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where cadence in ('hourly', 'daily', 'weekly') loop
    if p_rule_id is not null and s.rule_id <> p_rule_id then continue; end if;
    if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;

    v_digest := custom.agg_digest_assemble(p_organization_id, s.rule_id, p_since, v_now);

    if v_digest ->> 'incomplete' is not null then
      continue;                       -- it says what is missing; it does not send a broken summary
    end if;
    v_empty := (v_digest -> 'counts' ->> 'entered')::int
             + (v_digest -> 'counts' ->> 'left')::int
             + (v_digest -> 'counts' ->> 'changed')::int = 0;

    -- STORE-VERSION-NOOP: THE SLOT IS JUDGED, sent or not, and the schedule moves past it.
    -- greatest(): a run over an earlier window (a hand-run catch-up) never moves it back.
    insert into custom.agg_digest_checked as c (organization_id, rule_id, slot_at, outcome, checked_at)
    values (p_organization_id, s.rule_id, (v_digest ->> 'window_end')::timestamptz,
            case when v_empty then 'empty' else 'sent' end, clock_timestamp())
    on conflict (organization_id, rule_id) do update
       set slot_at    = greatest(c.slot_at, excluded.slot_at),
           outcome    = case when excluded.slot_at >= c.slot_at then excluded.outcome else c.outcome end,
           checked_at = excluded.checked_at;

    if v_empty then
      -- A summary with nothing in it is not sent. Silence is the message, and a
      -- weekly "nothing happened" is how people learn to ignore a channel.
      continue;
    end if;

    v_id := custom.agg_deliver_quietly(p_organization_id, s.rule_id, s.saved_view_id, s.channel,
              s.recipient_user_id, s.event_key,
              v_digest ->> 'subject', v_digest ->> 'body',
              v_digest - 'subject' - 'body',
              s.quiet_hours, v_digest ->> 'link',
              -- The window IS the identity of a summary, so two runs of the same
              -- window send once and two different windows both send.
              to_char((v_digest ->> 'window_end')::timestamptz at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI'));
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agg_digest_run(p_organization_id uuid, p_rule_id uuid DEFAULT NULL::uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- STORE-VERSION-NOOP: the runner, with its clock handed in. One body, in agg_digest_run_at.
  return custom.agg_digest_run_at(p_organization_id, p_rule_id, p_since, now());
end;
$function$;

create or replace function custom.agg_digest_tick_at(p_now timestamptz, p_organization_id uuid default null)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  o      record;
  s      record;
  v_last timestamptz;
  v_due  timestamptz;
  v_n    integer := 0;
  v_now  timestamptz := coalesce(p_now, now());
begin
  for o in
    select distinct r.organization_id
      from custom.record r
     where r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
       and (p_organization_id is null or r.organization_id = p_organization_id)
  loop
    begin
      for s in select * from custom.agg_subscriptions(o.organization_id, null, null)
                where cadence in ('hourly', 'daily', 'weekly') loop
        -- STORE-VERSION-NOOP: the schedule follows the last slot JUDGED (sent or checked
        -- empty), never the last summary sent alone — one quiet hour used to freeze it.
        v_last := custom.agg_digest_judged_at(o.organization_id, s.rule_id);
        -- A subscription that has never sent is due one period after it was made,
        -- not immediately: "email me a Monday summary" written on a Tuesday means
        -- next Monday, and the first summary covers the week it names.
        if v_last is null then
          select r.created_at into v_last from custom.record r
           where r.organization_id = o.organization_id and r.id = s.rule_id;
        end if;
        v_due := custom.agg_digest_due_at(s.cadence, s.schedule, s.quiet_hours,
                                          coalesce(v_last, v_now));
        if v_due is not null and v_due <= v_now then
          v_n := v_n + custom.agg_digest_run_at(o.organization_id, s.rule_id, null, v_now);
        end if;
      end loop;
    exception when others then
      raise warning 'custom.agg_digest_tick: organization % skipped — %', o.organization_id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.agg_digest_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- STORE-VERSION-NOOP: the tick, with its clock handed in. One body, in agg_digest_tick_at.
  return custom.agg_digest_tick_at(now(), null);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.subscriptions(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rule_id uuid, name text, table_id uuid, saved_view_id uuid, cadence text, schedule text, quiet_hours jsonb, channel text, recipient_user_id uuid, event_key text, muted boolean, mine boolean, i_may_mute boolean, last_sent_at timestamp with time zone, next_digest_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.subscriptions');
  return query
    select r.id,
           coalesce(r.data ->> 'name', 'Subscription'),
           (r.data ->> 'scope_table_id')::uuid,
           nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
           custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
           nullif(r.data -> 'subscription' ->> 'schedule', ''),
           case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
                then r.data -> 'subscription' -> 'quiet_hours' else null end,
           coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
           coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
           coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me,
           (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me)
             or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                      'admin'::public.permission_level),
           l.last_sent_at,
           -- A MUTED SUBSCRIPTION HAS NO NEXT TIME, and saying "next Monday" beside
           -- a switch that is off is exactly the screen that lies.
           -- STORE-VERSION-NOOP: the next time follows the last slot the runner JUDGED (a
           -- summary sent, or an empty one checked), the same clock the runner schedules by —
           -- never the last summary sent alone, which after a quiet hour is in the past.
           case when coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) then null
                else custom.agg_digest_due_at(
                       r.data -> 'subscription' ->> 'cadence',
                       r.data -> 'subscription' ->> 'schedule',
                       case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
                            then r.data -> 'subscription' -> 'quiet_hours' else null end,
                       coalesce(custom.agg_digest_judged_at(p_organization_id, r.id), r.created_at))
           end
      from custom.record r
      left join lateral (
             select max(coalesce(n.sent_at, n.created_at)) as last_sent_at
               from communication.notification n
              where n.organization_id = p_organization_id
                and n.payload ->> 'rule_id' = r.id::text) l on true
     where r.organization_id = p_organization_id
       and r.data_class = 'rule'
       and r.deleted_at is null
       and r.data ? 'subscription'
       and (p_table_id is null or (r.data ->> 'scope_table_id')::uuid = p_table_id)
       and (r.data ->> 'scope_table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
       and (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
            or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                     'admin'::public.permission_level))
     order by coalesce(r.data ->> 'name', 'Subscription');
end;
$function$;
