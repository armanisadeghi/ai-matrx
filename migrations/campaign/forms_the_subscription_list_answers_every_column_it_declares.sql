-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.subscriptions(uuid, uuid) 14f1e90ffcc453d9c5c61f4c936281a7554637a77cd00ce41623badc9df31a93
--
-- LANE FORMS — the list door declared TWELVE columns and returned ELEVEN.
--
-- `event_key` was in the RETURNS TABLE and missing from the RETURN QUERY, so every call
-- died with `structure of query does not match function result type` — caught by this
-- lane's own seat suite on its first run of PART 10, which is what a suite is for. A door
-- that cannot be called is worse than one that refuses: the refusal at least says why.
--
-- One column added to the select list. Nothing else in this body moves.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.subscriptions(p_organization_id uuid, p_table_id uuid default null)
returns table(rule_id uuid, name text, table_id uuid, saved_view_id uuid,
              cadence text, schedule text, channel text, recipient_user_id uuid,
              event_key text, muted boolean, mine boolean, i_may_mute boolean)
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
