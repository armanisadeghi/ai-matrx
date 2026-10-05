-- templates_show_and_archive.sql — applied on live 2026-10-05 (lane KITS-MERGE-2, review fixes).
--
-- 1. custom._template_answer gains `show`: what the installed view tells a person — the template's
--    guide steps, its agent's scripted question (the Q6 question its seed rows answer) and tryIt.
-- 2. custom.template_archive(p_template_id, p_restore): an organization's OWN template is archived
--    (retired_at) or brought back — delete means archive, never a hard delete. The person who saved it,
--    or an admin of its organization. Platform templates are not this door's.

create or replace function custom._template_answer(p_install custom.template_install, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql stable set search_path to 'pg_catalog'
as $function$
  select jsonb_build_object(
    'install_id', p_install.id,
    'organization_id', p_install.organization_id,
    'template_id', p_install.template_id,
    'catalogue_id', p_install.catalogue_id,
    'version', p_install.template_version,
    'state', p_install.state,
    'ok', p_install.state in ('installing', 'installed', 'uninstalling', 'uninstalled'),
    'done', p_install.state in ('installed', 'uninstalled'),
    'next_step', p_install.next_step,
    'made', p_install.made,
    'archived', p_install.archived,
    'refusal', p_install.refusal,
    'install_day', p_install.install_day,
    'ms', p_install.ms,
    'calls', p_install.calls,
    'host', (select jsonb_build_object(
                      'extra_agents', t.plan -> 'extraAgents',
                      'workflows', t.plan -> 'workflows',
                      'ids', coalesce((select jsonb_object_agg(substr(e.key, 5), e.value)
                                         from jsonb_each(p_install.ids) e
                                        where e.key like 'ref:tables.%' or e.key like 'new:row.%'), '{}'::jsonb))
               from custom.template t
              where t.id = p_install.template_id
                and (t.plan ? 'extraAgents' or t.plan ? 'workflows'
                     or jsonb_path_exists(t.plan, '$.agent.bindings[*].binding'))),
    'show', (select jsonb_strip_nulls(jsonb_build_object(
                      'guide', t.spec -> 'guide',
                      'agent_name', t.spec #>> '{agent,name}',
                      'agent_question', t.spec #>> '{agent,question,ask}',
                      'agent_try_it', t.spec #> '{agent,tryIt}'))
               from custom.template t where t.id = p_install.template_id)) || coalesce(p_extra, '{}'::jsonb)
$function$;

create or replace function custom.template_archive(p_template_id uuid, p_restore boolean default false)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog'
as $function$
declare
  v_t custom.template;
begin
  select * into v_t from custom.template t where t.id = p_template_id for update;
  if not found or v_t.scope <> 'org' then
    raise exception 'There is no such organization template.' using errcode = 'P0002';
  end if;
  perform custom.assert_client_may_reach(v_t.organization_id, 'custom.template_archive');
  if v_t.declared_by is distinct from auth.uid() then
    perform custom.assert_organization_admin(v_t.organization_id, 'custom.template_archive', 'archive a template someone else saved');
  end if;
  update custom.template t
     set retired_at = case when coalesce(p_restore, false) then null else coalesce(t.retired_at, now()) end, updated_at = now()
   where t.organization_id = v_t.organization_id and t.catalogue_id = v_t.catalogue_id;
  return jsonb_build_object('template_id', v_t.id, 'catalogue_id', v_t.catalogue_id,
                            'archived', not coalesce(p_restore, false));
end;
$function$;
revoke all on function custom.template_archive(uuid, boolean) from public, anon;
grant execute on function custom.template_archive(uuid, boolean) to authenticated;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'template_archive', 'p_template_id uuid, p_restore boolean',
  array['uuid'::regtype, 'boolean'::regtype]::oid[],
  'Archives (retired_at) or restores an organization''s own template, every version of it. custom.assert_client_may_reach on the template''s organization; the person who declared it, else custom.assert_organization_admin. Platform templates refuse as not found.',
  'templates_show_and_archive.sql', true, false,
  jsonb_build_object('version', 1, 'declared_by', 'templates_show_and_archive.sql', 'declared_at', '2026-10-05 lane KITS-MERGE-2',
    'arguments', jsonb_build_object(
      'p_template_id', jsonb_build_object('type','uuid','check','read for its scope and organization; then custom.assert_client_may_reach(organization) and declarer-or-organization-admin before any write.','entity','template','foreign',jsonb_build_object('sqlstate','42501','note','a template of an organization the caller cannot reach refuses at the reach check; a platform or invented id answers P0002.'),'position',1,'verified','2026-10-05 lane KITS-MERGE-2 — written with this body'))));

-- 3. (same day) `show.unrecorded`: parts the card counts that leave no `made` entry — a stage rule set is
--    declared ON a table (pipeline_declare, no save) — each with its table id, so the landing lists a row
--    that opens. Applied as migration templates_show_unrecorded_parts: the `show` object above gains
--      'unrecorded', (select jsonb_agg(jsonb_build_object('kind', x->>'kind', 'title', coalesce(x->>'name', x->>'token'),
--                       'ref', (x->>'kind') || '.' || coalesce(x->>'token',''),
--                       'table_id', p_install.ids ->> ('ref:tables.' || (x->>'table'))))
--                     from jsonb_array_elements(coalesce(t.spec->'extras','[]'::jsonb)) x where x->>'kind' = 'stage_rules')
