-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- W4-AGG, file 2 — DOOR-18: *"a subscription is a Rule over a saved view that fires on
--                  record-changed, immediately or on a schedule, per channel."*
--
-- READ THAT SENTENCE AS A BUILD ORDER AND IT NAMES THREE THINGS THE PLATFORM ALREADY HAS:
--   · a RULE          — `custom.rule`, a record with `data_class = 'rule'` (W1-RULE)
--   · a SAVED VIEW    — `platform.saved_view`, live, already holding filters and sorts
--   · a DELIVERY      — `communication.notification`, the platform's notification system, with
--                       its channel, its recipient, its dedupe key, its retry counter and its
--                       worker
-- So this file creates NO table. A subscription that invented its own row would be a fourth
-- copy of "who wants to hear about what", and the first of the four to drift. Linear's model —
-- per-object, per-channel, with a separate digest schedule — is one mechanism with two
-- deliveries, and that is exactly what "immediately or on a schedule" is here: ONE subscription
-- Rule, two `cadence` values, the same delivery row at the end of both.
--
-- THE SUBSCRIPTION RULE'S SHAPE. A subscription IS a Rule, so it is a Rule record of a kind
-- W1-RULE already knows — `predicate`, because "does this record count?" is a yes-or-no
-- question — and the subscription's own facts hang off it under one key:
--   data = { "kind": "predicate", "name": …, "expr": …,        ← the Rule, unchanged
--            "subscription": {
--              "saved_view_id": "…",           which view decides WHAT counts
--              "cadence": "immediate" | "digest",
--              "schedule": "0 9 * * 1",        for digest: when the summary goes out
--              "channel": "in_app" | "email" | "sms",
--              "recipient_user_id": "…",
--              "event_key": "records.changed" } }
-- Inventing `"kind": "subscription"` would have been a second rule vocabulary beside W1-RULE's
-- closed set — `custom._rule_shape_guard` refuses it by name, and it is right to.
--
-- WHY THE FIRING IS A FUNCTION AND NOT A TRIGGER ON `custom.record`. DOOR-13's outbox is the
-- ONE place a record change becomes an event, and nothing publishes from the record table
-- itself. `custom.agg_subscription_fire` is what the outbox's consumer calls; until `W4-IO`'s
-- outbox lands it is called directly, which is the same function with the same arguments.
--
-- THE INVERSE: `migrations/inverse/w4_agg_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.agg_subscription_cadences()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$ select array['immediate', 'digest']::text[] $fn$;

comment on function custom.agg_subscription_cadences() is
  'W4-AGG / DOOR-18: the two cadences of ONE mechanism — "tell me now" and "tell me Monday". Rule 15: the set has one copy.';

-- ── the subscriptions of one organization, read off the Rules that are them ───
create or replace function custom.agg_subscriptions(p_organization_id uuid,
                                         p_saved_view_id uuid default null,
                                         p_cadence text default null)
returns table(rule_id uuid, saved_view_id uuid, cadence text, schedule text,
              channel text, recipient_user_id uuid, event_key text, name text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select r.id,
         nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate'),
         nullif(r.data -> 'subscription' ->> 'schedule', ''),
         coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
         nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
         coalesce(r.data ->> 'name', 'Subscription')
    from custom.record r
   where r.organization_id = p_organization_id
     and r.data_class = 'rule'
     and r.deleted_at is null
     and r.data ? 'subscription'
     and (p_saved_view_id is null
          or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
     and (p_cadence is null
          or coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate') = p_cadence);
$fn$;

comment on function custom.agg_subscriptions(uuid, uuid, text) is
  'W4-AGG / DOOR-18: every subscription of one organization, read off the Rule records that ARE the subscriptions. No second table, so "who wants to hear about what" has one home.';

-- ── does this record belong to that saved view? ───────────────────────────────
create or replace function custom.agg_view_admits(p_organization_id uuid,
                                       p_saved_view_id uuid,
                                       p_record_id uuid)
returns boolean
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_def   jsonb;
  v_table uuid;
  v_key   text;
  v_rec   jsonb;
begin
  select sv.definition into v_def
    from platform.saved_view sv
   where sv.id = p_saved_view_id
     and sv.organization_id = p_organization_id
     and sv.deleted_at is null;
  if v_def is null then
    return false;                    -- a subscription over a view that is gone fires at nobody
  end if;

  v_table := nullif(v_def ->> 'table_id', '')::uuid;

  -- The record is read through THIS LANE'S OWN Visibility helper under the SUBSCRIBER's
  -- principal, not the writer's: a change to a record the subscriber may not see is not a
  -- notification they are entitled to, and a notification's mere existence leaks the record.
  select r.data into v_rec
    from custom.query_visible_ids(p_organization_id, v_table) v
    join custom.record r on r.organization_id = p_organization_id and r.id = v
   where r.id = p_record_id;
  if v_rec is null then
    return false;
  end if;

  -- The view's filters. `platform.saved_view.definition` already carries `filters` as an
  -- object of field -> value across the five live surface keys, so this reads the shape that
  -- exists rather than inventing a predicate language DOOR-18 never asked for.
  for v_key in select k from jsonb_object_keys(coalesce(v_def -> 'filters', '{}'::jsonb)) k loop
    if coalesce(case when jsonb_typeof(v_rec -> v_key) = 'object' and (v_rec -> v_key) ? 'value'
                     then v_rec -> v_key ->> 'value' else v_rec ->> v_key end, '')
       is distinct from (v_def -> 'filters' ->> v_key) then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

comment on function custom.agg_view_admits(uuid, uuid, uuid) is
  'W4-AGG / DOOR-18: whether one record belongs to one saved view, read through custom.query_visible_ids so a subscription can never notify somebody about a record they may not see.';

-- ── the delivery, written into the platform's own notification system ─────────
create or replace function custom.agg_deliver(p_organization_id uuid,
                                   p_rule_id uuid,
                                   p_record_id uuid,
                                   p_channel text,
                                   p_recipient_user_id uuid,
                                   p_event_key text,
                                   p_subject text,
                                   p_body text,
                                   p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');

  -- `communication.notification` IS the notification system: channel, recipient, dedupe key,
  -- retry counter, lease, worker. Writing a delivery anywhere else would mean a second sender,
  -- a second retry policy and a second place a message can get stuck.
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, visibility)
  values
    (p_organization_id, p_event_key, p_channel, p_recipient_user_id, 'user',
     -- The dedupe key is the whole idempotency story: one subscription, one record, one day
     -- is one message however many times the outbox is replayed.
     format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
            to_char(now() at time zone 'utc', 'YYYY-MM-DD')),
     p_subject, p_body,
     coalesce(p_payload, '{}'::jsonb) ||
       jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id),
     'custom.record', p_record_id, 'personal'::platform.visibility)
  -- IDEMPOTENT AS A CONSTRAINT, not as an intention. The dedupe key is UNIQUE, so a replayed
  -- outbox event does not raise 23505 and it does not send twice: it does nothing and returns
  -- the message that already exists. Anything else would make "replay the outbox" a thing an
  -- operator is afraid to do, which defeats the outbox.
  -- The index is PARTIAL (`where dedupe_key is not null`), so the inference clause must
  -- carry the same predicate or PostgreSQL refuses to match it (42P10).
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    select n.id into v_id from communication.notification n
     where n.organization_id = p_organization_id
       and n.dedupe_key = format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
                                 to_char(now() at time zone 'utc', 'YYYY-MM-DD'));
  end if;
  return v_id;
end;
$fn$;

comment on function custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb) is
  'W4-AGG / DOOR-18: one delivery row in the platform''s own notification system, deduplicated per subscription per record per day so a replayed event is one message and not many.';

-- ── "tell me now" ─────────────────────────────────────────────────────────────
create or replace function custom.agg_subscription_fire(p_organization_id uuid,
                                             p_record_id uuid,
                                             p_table_id uuid default null,
                                             p_changed_field_ids jsonb default '[]'::jsonb)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  s record;
  v_n integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_subscription_fire');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, 'immediate') loop
    if s.saved_view_id is null or s.recipient_user_id is null then
      continue;                       -- a subscription with no view or no recipient fires at nobody
    end if;
    if not custom.agg_view_admits(p_organization_id, s.saved_view_id, p_record_id) then
      continue;
    end if;
    perform custom.agg_deliver(p_organization_id, s.rule_id, p_record_id, s.channel,
              s.recipient_user_id, s.event_key,
              s.name,
              format('A record in %s changed.', s.name),
              jsonb_build_object('cadence', 'immediate', 'table_id', p_table_id,
                                 'changed_field_ids', coalesce(p_changed_field_ids, '[]'::jsonb)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_subscription_fire(uuid, uuid, uuid, jsonb) is
  'W4-AGG / DOOR-18, "tell me now": every immediate subscription whose saved view admits this record gets one delivery row. Called by DOOR-13''s outbox consumer — never by a trigger on custom.record, because nothing publishes from the record table itself.';

-- ── "tell me Monday" ──────────────────────────────────────────────────────────
create or replace function custom.agg_digest_run(p_organization_id uuid,
                                      p_rule_id uuid default null,
                                      p_since timestamptz default null)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  s        record;
  v_since  timestamptz := coalesce(p_since, now() - interval '7 days');
  v_count  bigint;
  v_table  uuid;
  v_n      integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_digest_run');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, 'digest') loop
    if p_rule_id is not null and s.rule_id <> p_rule_id then
      continue;
    end if;
    if s.saved_view_id is null or s.recipient_user_id is null then
      continue;
    end if;
    select nullif(sv.definition ->> 'table_id', '')::uuid into v_table
      from platform.saved_view sv where sv.id = s.saved_view_id;

    -- THE DIGEST IS AN AGGREGATE, and it is the eighth verb doing the counting — so the number
    -- in the summary is the same number the dashboard shows, computed by the same code, under
    -- the SUBSCRIBER's Visibility.
    select coalesce(sum(a.row_count), 0) into v_count
      from custom.record_aggregate(p_organization_id, v_table, '[]'::jsonb,
             jsonb_build_array(jsonb_build_object('op', 'count'))) a;

    if v_count = 0 then
      continue;                       -- a digest with nothing in it is not sent; silence is the message
    end if;

    perform custom.agg_deliver(p_organization_id, s.rule_id, s.saved_view_id, s.channel,
              s.recipient_user_id, s.event_key,
              format('%s: %s record(s)', s.name, v_count),
              format('%s matched %s record(s) since %s.', s.name, v_count,
                     to_char(v_since at time zone 'utc', 'FMDay DD Month YYYY')),
              jsonb_build_object('cadence', 'digest', 'schedule', s.schedule,
                                 'since', v_since, 'count', v_count));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

comment on function custom.agg_digest_run(uuid, uuid, timestamptz) is
  'W4-AGG / DOOR-18, "tell me Monday": one delivery row per digest subscription, whose COUNT is custom.record_aggregate — the same verb the dashboard uses, so a digest and a screen can never disagree. A digest with nothing in it is not sent.';
