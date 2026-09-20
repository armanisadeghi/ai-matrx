-- The inverse of `digests_the_cadence_the_quiet_hours_and_the_real_digest.sql`.
--
-- It removes ONLY the objects that file created and puts the two it replaced back
-- the way it found them, byte for byte: `custom.agg_deliver` without the dedupe
-- suffix, and `custom.subscriptions` without quiet hours, the last send or the next
-- due moment. `custom.agg_subscriptions`, `custom.agg_subscription_fire` and
-- `custom.agg_digest_run` are restored to their pre-file bodies for the same reason.
-- No notification, no Rule and no record is touched: this file writes no data.

drop function if exists custom.subscription_preview(uuid, uuid);
drop function if exists custom.subscription_declare(uuid, uuid, jsonb);
drop function if exists custom.agg_digest_tick();
drop function if exists custom.agg_subscription_tick(interval);
drop function if exists custom.agg_subscription_fire_entered(uuid, uuid, uuid, timestamptz);
drop function if exists custom.agg_deliver_quietly(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, jsonb, text, text);
drop function if exists custom.agg_digest_assemble(uuid, uuid, timestamptz, timestamptz);
drop function if exists custom.agg_last_digest_at(uuid, uuid);
drop function if exists custom.agg_record_name(uuid, uuid, jsonb);
drop function if exists custom.agg_view_admits_state(jsonb, jsonb);
drop function if exists custom.agg_quiet_until(jsonb, timestamptz);
drop function if exists custom.agg_digest_due_at(text, text, jsonb, timestamptz);
drop function if exists custom.agg_cadence_normalize(text);

delete from platform.client_callable_door
 where declared_by = 'digests_the_cadence_the_quiet_hours_and_the_real_digest.sql';

-- ── the two-word cadence list, back ───────────────────────────────────────────
create or replace function custom.agg_subscription_cadences()
returns text[] language sql immutable set search_path to 'pg_catalog'
as $fn$ select array['immediate', 'digest']::text[] $fn$;

-- ── custom.agg_deliver, without the suffix ────────────────────────────────────
drop function if exists custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb, text);

create function custom.agg_deliver(p_organization_id uuid, p_rule_id uuid, p_record_id uuid,
        p_channel text, p_recipient_user_id uuid, p_event_key text, p_subject text, p_body text,
        p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_deliver');
  insert into communication.notification
    (organization_id, event_key, channel, recipient_user_id, recipient_kind,
     dedupe_key, subject, body, payload, target_kind, target_id, visibility)
  values
    (p_organization_id, p_event_key, p_channel, p_recipient_user_id, 'user',
     format('custom.subscription:%s:%s:%s', p_rule_id, p_record_id,
            to_char(now() at time zone 'utc', 'YYYY-MM-DD')),
     p_subject, p_body,
     coalesce(p_payload, '{}'::jsonb) ||
       jsonb_build_object('rule_id', p_rule_id, 'record_id', p_record_id),
     'custom.record', p_record_id, 'personal'::platform.visibility)
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

-- ── custom.agg_subscriptions, the narrower reader ─────────────────────────────
drop function if exists custom.agg_subscriptions(uuid, uuid, text);

create function custom.agg_subscriptions(p_organization_id uuid, p_saved_view_id uuid default null,
                                         p_cadence text default null)
returns table(rule_id uuid, saved_view_id uuid, cadence text, schedule text, channel text,
              recipient_user_id uuid, event_key text, name text)
language sql stable set search_path to 'pg_catalog'
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
     and r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
     and coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false) = false
     and (p_saved_view_id is null
          or (r.data -> 'subscription' ->> 'saved_view_id')::uuid = p_saved_view_id)
     and (p_cadence is null
          or coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate') = p_cadence);
$fn$;

-- ── the two runners, as they were ─────────────────────────────────────────────
create or replace function custom.agg_subscription_fire(p_organization_id uuid, p_record_id uuid,
        p_table_id uuid default null, p_changed_field_ids jsonb default '[]'::jsonb)
returns integer language plpgsql set search_path to 'pg_catalog'
as $fn$
declare
  s record;
  v_n integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_subscription_fire');
  for s in select * from custom.agg_subscriptions(p_organization_id, null, 'immediate') loop
    if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;
    if not custom.agg_view_admits(p_organization_id, s.saved_view_id, p_record_id) then continue; end if;
    perform custom.agg_deliver(p_organization_id, s.rule_id, p_record_id, s.channel,
              s.recipient_user_id, s.event_key, s.name,
              format('A record in %s changed.', s.name),
              jsonb_build_object('cadence', 'immediate', 'table_id', p_table_id,
                                 'changed_field_ids', coalesce(p_changed_field_ids, '[]'::jsonb)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

create or replace function custom.agg_digest_run(p_organization_id uuid, p_rule_id uuid default null,
                                                 p_since timestamptz default null)
returns integer language plpgsql set search_path to 'pg_catalog'
as $fn$
declare
  s record;
  v_since timestamptz := coalesce(p_since, now() - interval '7 days');
  v_count bigint;
  v_table uuid;
  v_n integer := 0;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_digest_run');
  for s in select * from custom.agg_subscriptions(p_organization_id, null, 'digest') loop
    if p_rule_id is not null and s.rule_id <> p_rule_id then continue; end if;
    if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;
    select nullif(sv.definition ->> 'table_id', '')::uuid into v_table
      from platform.saved_view sv where sv.id = s.saved_view_id;
    select coalesce(sum(a.row_count), 0) into v_count
      from custom.record_aggregate(p_organization_id, v_table, '[]'::jsonb,
             jsonb_build_array(jsonb_build_object('op', 'count'))) a;
    if v_count = 0 then continue; end if;
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

-- ── the person's list, without the three new answers ──────────────────────────
drop function if exists custom.subscriptions(uuid, uuid);

create function custom.subscriptions(p_organization_id uuid, p_table_id uuid default null)
returns table(rule_id uuid, name text, table_id uuid, saved_view_id uuid, cadence text,
              schedule text, channel text, recipient_user_id uuid, event_key text,
              muted boolean, mine boolean, i_may_mute boolean)
language plpgsql stable security definer set search_path to 'pg_catalog'
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
           coalesce(r.data -> 'subscription' ->> 'cadence', 'immediate'),
           nullif(r.data -> 'subscription' ->> 'schedule', ''),
           coalesce(r.data -> 'subscription' ->> 'channel', 'in_app'),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid,
           coalesce(r.data -> 'subscription' ->> 'event_key', 'records.changed'),
           coalesce((r.data -> 'subscription' ->> 'muted')::boolean, false),
           nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me,
           (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me)
             or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                      'admin'::public.permission_level)
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
       and (p_table_id is null or (r.data ->> 'scope_table_id')::uuid = p_table_id)
       and (r.data ->> 'scope_table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
       and (nullif(r.data -> 'subscription' ->> 'recipient_user_id', '')::uuid is not distinct from v_me
            or custom.has_visibility(v_me, 'record', (r.data ->> 'scope_table_id')::uuid,
                                     'admin'::public.permission_level))
     order by coalesce(r.data ->> 'name', 'Subscription');
end;
$fn$;

grant execute on function custom.subscriptions(uuid, uuid) to authenticated;
