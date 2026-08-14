-- G-ORCHESTRATOR-READ: expose authenticated growth-loop reads without letting
-- the postgres-owned view bypass the caller's RLS. Applied live first through
-- the Supabase MCP; this file is the durable, idempotent record.

select iam.apply_rls('growth', 'loop_run', 'growth_loop_run', 'entity');
select iam.apply_rls(
  'growth',
  'loop_stage_run',
  'growth_loop_stage_run',
  'component'
);
select iam.apply_rls('growth', 'loop_event', 'growth_loop_event', 'component');

alter view growth.v_loop_state set (security_invoker = true);

revoke all on schema growth from anon;
revoke all on all tables in schema growth from anon;
grant usage on schema growth to authenticated, service_role;
grant select on growth.loop_run,
                growth.loop_stage_run,
                growth.loop_event,
                growth.stage_ref_kind,
                growth.v_loop_state
  to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'growth') then
    raise exception 'Refusing to expose missing schema growth';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'growth'
      and c.relname = 'v_loop_state'
      and 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
  ) then
    raise exception 'Refusing to expose growth: v_loop_state is not security_invoker';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'growth'
      and tablename in ('loop_run', 'loop_stage_run', 'loop_event')
      and policyname = 'svc_all'
      and roles <> array['service_role']::name[]
  ) then
    raise exception 'Refusing to expose growth: svc_all is not service_role-only';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'growth'
      and tablename = 'loop_stage_run'
      and policyname = 'std_select'
      and roles = array['authenticated']::name[]
      and qual like '%loop_run_id%'
      and qual like '%growth_loop_run%'
  ) then
    raise exception 'Refusing to expose growth: stage SELECT does not follow loop_run';
  end if;
end
$$;

-- Rollback: restore the exact previous list below, then reload config/schema.
-- The schema names are deliberately literal: one missing name prevents the
-- entire PostgREST schema cache from loading (PGRST002).
alter role authenticator set pgrst.db_schemas =
  'public, graphql_public, admin, agent, ai, app, billing, canvas, chat, code, communication, content_ir, context, docproc, education, extend, files, graveyard, iam, legal, pdf, platform, podcast, rag, research, scheduler, scraper, skill, tool, transcripts, ui, users, web, workbench, workflow, workspace, seo, plan, crm, growth';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
