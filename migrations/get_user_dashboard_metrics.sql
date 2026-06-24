-- get_user_dashboard_metrics: per-user engagement counts for the core dashboard.
--
-- Source of truth = current tables. This REPLACES the role played by the legacy
-- get_user_stats RPC, which counted the deprecated entity tables
-- (public.conversation / public.recipe / public.udt_datasets). Those are not the
-- tables users actually fill today.
--
-- Security: derives identity from auth.uid() and takes NO parameter, so a caller
-- can never request another user's counts (unlike get_user_stats which trusted a
-- p_user_id arg). SECURITY DEFINER so the counts ignore per-row RLS visibility
-- (a user always sees the true count of their own rows). Idempotent.
create or replace function public.get_user_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object(
      'agents', 0, 'conversations', 0, 'knowledge_files', 0, 'published_apps', 0,
      'notes', 0, 'tasks', 0, 'transcripts', 0, 'scopes', 0, 'shortcuts', 0
    );
  end if;

  return jsonb_build_object(
    'agents',          (select count(*) from public.agx_agent    where user_id = uid and coalesce(is_archived, false) = false),
    'conversations',   (select count(*) from public.conversations where created_by = uid),
    'knowledge_files', (select count(*) from public.cld_files     where owner_id = uid and deleted_at is null),
    'published_apps',  (select count(*) from public.aga_apps      where user_id = uid and published_at is not null),
    'notes',           (select count(*) from public.notes        where user_id = uid and coalesce(is_deleted, false) = false),
    'tasks',           (select count(*) from public.ctx_tasks    where user_id = uid),
    'transcripts',     (select count(*) from public.transcripts  where user_id = uid and coalesce(is_deleted, false) = false),
    'scopes',          (select count(*) from public.ctx_scopes   where created_by = uid),
    'shortcuts',       (select count(*) from public.agx_shortcut where user_id = uid and coalesce(is_active, false) = true)
  );
end;
$$;

grant execute on function public.get_user_dashboard_metrics() to authenticated;
