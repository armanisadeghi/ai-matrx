-- chair-step: three functions are REPLACED with a wider answer — custom.agg_subscriptions, custom.agg_deliver and custom.subscriptions — and a return type cannot be widened with CREATE OR REPLACE, so each is dropped and created again in ONE transaction. The additive allow-list refuses a DROP by name and it is right to: it cannot read what the following CREATE will put back. A person reads all three here. Nothing else is removed, no data is touched, no policy or table is dropped, and every argument list stays exactly as it is, so no caller changes. The file ends with the three GRANTs those doors need — including the one custom.subscriptions had before it was dropped, which a dropped function takes with it.
-- lane: DIGESTS (subscriptions and digests, PRODUCTS row 8; DOOR-18)
--
-- RUN THIS FILE IMMEDIATELY AFTER
-- `digests_the_cadence_the_quiet_hours_and_the_real_digest.sql`, which creates the
-- helpers the three bodies below call.
--
-- WHAT EACH ONE GAINS, AND WHY IT COULD NOT BE A REPLACE
--
--   custom.agg_subscriptions   + table_id, + quiet_hours, and a cadence that has
--                                already been normalised. It is the ONE reader every
--                                consumer goes through and the one place that knows a
--                                muted subscription fires at nobody; the runners cannot
--                                work without the three, and re-deriving them in each
--                                runner is how two consumers come to disagree.
--   custom.agg_deliver         + an optional dedupe suffix. Its key was
--                                `rule : record : DATE`, which is right for "one
--                                subscription, one record, one day" and wrong for an
--                                hourly summary: hour two would collide with hour one,
--                                find the UNIQUE index, send nothing and hand back hour
--                                one as though it had sent. Left out, the key is the day,
--                                exactly as it is today, so its five callers in other
--                                lanes (form_notify, booking_notify and the three
--                                sign_request_* doors) are unchanged.
--   custom.subscriptions       + quiet_hours, + last_sent_at, + next_digest_at. "When is
--                                my next summary?" and "when did this last tell me
--                                anything?" are the two questions anybody looking at a
--                                notifications list has, and neither could be asked.
--
-- THE INVERSE: `migrations/inverse/digests_the_cadence_the_quiet_hours_and_the_real_digest_down.sql`
-- puts all three back exactly as they were, including this file's grant.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop function if exists custom.agg_subscriptions(uuid, uuid, text);

create function custom.agg_subscriptions(p_organization_id uuid,
                                         p_saved_view_id uuid default null,
                                         p_cadence text default null)
returns table(rule_id uuid, saved_view_id uuid, table_id uuid, cadence text,
              schedule text, quiet_hours jsonb, channel text,
              recipient_user_id uuid, event_key text, name text)
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  select r.id,
         nullif(r.data -> 'subscription' ->> 'saved_view_id', '')::uuid,
         nullif(r.data ->> 'scope_table_id', '')::uuid,
         custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence'),
         nullif(r.data -> 'subscription' ->> 'schedule', ''),
         case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
              then r.data -> 'subscription' -> 'quiet_hours' else null end,
         coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
         nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
         coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
         coalesce(r.data ->> 'name', 'Subscription')
    from custom.record r
   where r.organization_id = p_organization_id
     and r.data_class = 'rule'
     and r.deleted_at is null
     and r.data ? 'subscription'
     -- SWITCHED OFF MEANS SWITCHED OFF, and this is still the one place that has
     -- to know it: every consumer reads through here, so a muted Rule stops firing
     -- immediately, on every cadence and every channel.
     and coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) = false
     and (p_saved_view_id is null
          or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
     and (p_cadence is null
          or custom.agg_cadence_normalize(r.data -> 'subscription' ->> 'cadence') = p_cadence);
$fn$;

comment on function custom.agg_subscriptions(uuid, uuid, text) is
  'DOOR-18: the notifier''s ONE reader of the organization''s firing subscriptions — Rules carrying a subscription block, muted ones excluded, cadence already normalised. Server-only; custom.subscriptions is the person''s own door.';

drop function if exists custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb);

create function custom.agg_deliver(p_organization_id uuid, p_rule_id uuid, p_record_id uuid,
        p_channel text, p_recipient_user_id uuid, p_event_key text, p_subject text, p_body text,
        p_payload jsonb default '{}'::jsonb, p_dedupe_suffix text default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  v_id  uuid;
  v_key text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');

  v_key := format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
                  coalesce(nullif(btrim(p_dedupe_suffix), ''),
                           to_char(now() at time zone 'utc', 'YYYY-MM-DD')));

  -- `communication.notification` IS the notification system: channel, recipient, dedupe key,
  -- retry counter, lease, worker. Writing a delivery anywhere else would mean a second sender,
  -- a second retry policy and a second place a message can get stuck.
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, visibility)
  values
    (p_organization_id, p_event_key, p_channel, p_recipient_user_id, 'user',
     v_key, p_subject, p_body,
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
     where n.organization_id = p_organization_id and n.dedupe_key = v_key;
  end if;
  return v_id;
end;
$fn$;

comment on function custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, text) is
  'DOOR-18: the ONE delivery path for a subscription — one row in communication.notification, idempotent by a UNIQUE dedupe key. The optional suffix names the window a summary covers, so an hourly digest does not collide with the one an hour earlier; left out, the key is the day, exactly as it was.';

drop function if exists custom.subscriptions(uuid, uuid);

create function custom.subscriptions(p_organization_id uuid, p_table_id uuid default null)
returns table(rule_id uuid, name text, table_id uuid, saved_view_id uuid, cadence text,
              schedule text, quiet_hours jsonb, channel text, recipient_user_id uuid,
              event_key text, muted boolean, mine boolean, i_may_mute boolean,
              last_sent_at timestamptz, next_digest_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
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
           case when coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) then null
                else custom.agg_digest_due_at(
                       r.data -> 'subscription' ->> 'cadence',
                       r.data -> 'subscription' ->> 'schedule',
                       case when jsonb_typeof(r.data -> 'subscription' -> 'quiet_hours') = 'object'
                            then r.data -> 'subscription' -> 'quiet_hours' else null end,
                       coalesce(custom.agg_last_digest_at(p_organization_id, r.id), r.created_at))
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
$fn$;

comment on function custom.subscriptions(uuid, uuid) is
  'DOOR-18: what this person is being told about on this Table — plus, on every row, when it last told them anything and when the next summary is due, computed by the same functions the runner uses so the screen and the runner cannot disagree.';

-- ── the doors can be reached ──────────────────────────────────────────────────
--
-- WHO MAY CALL THEM is not decided by these grants. Each asks
-- `custom.assert_client_may_reach` for the organization wall; `subscription_declare`
-- then asks `custom.assert_client_may_change` at the editor rung on the Table, and
-- `subscription_preview` refuses a summary addressed to somebody else unless the
-- caller holds admin on the Table — because a summary is assembled UNDER the person
-- it is sent to, so reading one means reading their records. All three carry a
-- `platform.client_callable_door` row with that reasoning.
--
-- The third is a RESTORE. Without it every person's notifications list would open on
-- *"permission denied for function subscriptions"* — precisely the failure lane
-- DOORS-TWO photographed on this same product a day earlier.

grant execute on function custom.subscription_declare(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.subscription_preview(uuid, uuid) to authenticated;
grant execute on function custom.subscriptions(uuid, uuid) to authenticated;
