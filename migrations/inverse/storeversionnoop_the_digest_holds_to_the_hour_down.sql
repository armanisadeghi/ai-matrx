-- chair-step: THE INVERSE of migrations/campaign/storeversionnoop_the_digest_holds_to_the_hour.sql.
--   It puts `custom.agg_digest_run`, `custom.agg_digest_tick` and `custom.subscriptions` back to
--   their bodies before that file (verbatim from pg_get_functiondef on the dev clone, 2026-09-23,
--   byte-identical to production's), drops the three functions it added and the runner-state
--   table `custom.agg_digest_checked`. That puts the defect back: after one quiet hour the digest
--   schedule freezes in the past (storeversionnoop_digest_green.sql clause 1 fails again).
--   No row of anybody's data is touched; the dropped table holds only the runner's own state.
-- lock: custom
-- lane: STORE-VERSION-NOOP
-- based-on: custom.agg_digest_run(uuid, uuid, timestamp with time zone) d59877deee28f494e74cc5d799c4e6395d3cf8cc00bb1daa2493a70e9b965ace
-- based-on: custom.agg_digest_tick() 43848cb792c31dff86533836d7b3f931e073b4d04108110101cafdbdd6e7f85a
-- based-on: custom.subscriptions(uuid, uuid) 328cd2ef455e8d560687296125cb65357ee77c0a20c97d06539d26059c8e0692

CREATE OR REPLACE FUNCTION custom.agg_digest_run(p_organization_id uuid, p_rule_id uuid DEFAULT NULL::uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        record;
  v_digest jsonb;
  v_n      integer := 0;
  v_id     uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.agg_digest_run');

  for s in select * from custom.agg_subscriptions(p_organization_id, null, null)
            where cadence in ('hourly', 'daily', 'weekly') loop
    if p_rule_id is not null and s.rule_id <> p_rule_id then continue; end if;
    if s.saved_view_id is null or s.recipient_user_id is null then continue; end if;

    v_digest := custom.agg_digest_assemble(p_organization_id, s.rule_id, p_since, now());

    if v_digest ->> 'incomplete' is not null then
      continue;                       -- it says what is missing; it does not send a broken summary
    end if;
    if (v_digest -> 'counts' ->> 'entered')::int
       + (v_digest -> 'counts' ->> 'left')::int
       + (v_digest -> 'counts' ->> 'changed')::int = 0 then
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
CREATE OR REPLACE FUNCTION custom.agg_digest_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  o      record;
  s      record;
  v_last timestamptz;
  v_due  timestamptz;
  v_n    integer := 0;
begin
  for o in
    select distinct r.organization_id
      from custom.record r
     where r.data_class = 'rule' and r.deleted_at is null and r.data ? 'subscription'
  loop
    begin
      for s in select * from custom.agg_subscriptions(o.organization_id, null, null)
                where cadence in ('hourly', 'daily', 'weekly') loop
        v_last := custom.agg_last_digest_at(o.organization_id, s.rule_id);
        -- A subscription that has never sent is due one period after it was made,
        -- not immediately: "email me a Monday summary" written on a Tuesday means
        -- next Monday, and the first summary covers the week it names.
        if v_last is null then
          select r.created_at into v_last from custom.record r
           where r.organization_id = o.organization_id and r.id = s.rule_id;
        end if;
        v_due := custom.agg_digest_due_at(s.cadence, s.schedule, s.quiet_hours,
                                          coalesce(v_last, now()));
        if v_due is not null and v_due <= now() then
          v_n := v_n + custom.agg_digest_run(o.organization_id, s.rule_id, null);
        end if;
      end loop;
    exception when others then
      raise warning 'custom.agg_digest_tick: organization % skipped — %', o.organization_id, sqlerrm;
    end;
  end loop;
  return v_n;
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
$function$;

drop function if exists custom.agg_digest_tick_at(timestamptz, uuid);
drop function if exists custom.agg_digest_run_at(uuid, uuid, timestamptz, timestamptz);
drop function if exists custom.agg_digest_judged_at(uuid, uuid);
drop table if exists custom.agg_digest_checked;
