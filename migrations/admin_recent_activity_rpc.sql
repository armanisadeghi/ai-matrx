-- admin_recent_activity_rpc.sql
--
-- Admin-only read into platform.activity_log (the event spine) so the events
-- feeding webhooks + the run-lifecycle producers are VISIBLE/testable in the
-- admin UI. activity_log is not REST-exposed, so this SECURITY DEFINER RPC in
-- public is the read path. Gated on is_super_admin().
--
-- Idempotent.

create or replace function public.admin_recent_activity(
  p_limit int default 100,
  p_action_prefix text default null
)
returns table (
  id bigint, occurred_at timestamptz, action text, entity_type text,
  entity_id uuid, actor_id uuid, organization_id uuid, metadata jsonb
)
language plpgsql security definer set search_path = public, platform as $fn$
begin
  if not public.is_super_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select al.id, al.occurred_at, al.action, al.entity_type,
           al.entity_id, al.actor_id, al.organization_id, al.metadata
    from platform.activity_log al
    where p_action_prefix is null or al.action like p_action_prefix || '%'
    order by al.id desc
    limit greatest(1, least(p_limit, 500));
end;
$fn$;

revoke execute on function public.admin_recent_activity(int, text) from public, anon;
grant execute on function public.admin_recent_activity(int, text) to authenticated;
