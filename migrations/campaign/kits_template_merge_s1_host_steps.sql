-- chair-step: it REPLACES the bodies of three template-family functions — custom.template_install_note, custom.template_uninstall and custom._template_answer (signatures, SECURITY DEFINER / volatility, search_path, statement_timeout and grants unchanged). template_install_note also records kind 'workflow'; template_uninstall archives the agents and workflows an install noted (is_archived, the lists' own Archive; only a copy in this organization the caller may edit, else named in `left`; an already-archived one counts as archived — idempotent); _template_answer adds a `host` key ONLY for a template whose plan carries extraAgents / workflows / full agent bindings. No table, column, policy or grant is touched; every one of the published templates answers exactly as before.
-- lane: KITS-TEMPLATE-MERGE
-- based-on: custom.template_install_note(uuid, uuid, text, uuid, text) 34810fa9ac7b780c9b3647a656007ad8f6e2fb15e6c003bae197297bc15cb55b
-- based-on: custom.template_uninstall(uuid, uuid, integer) 937c0829669ac2a852a7f2513e380c9180aa3b3cbb8ec8aaf592612264a86227
-- based-on: custom._template_answer(custom.template_install, jsonb) b62674a1c2dcedbcb18394b989985d49ac5c31f1aee3bd6225287c6fb70ff13f
-- lock: custom
--
-- Inverse: migrations/inverse/kits_template_merge_s1_host_steps_down.sql
--
-- Kits → Template merge, slice 1 (Arman, 2026-10-04: there is ONE template product). A template now carries
-- more than one agent and its workflows (@ai-matrx/records templates/extras.ts); the host copies them and
-- notes each on the install, and Remove takes them back with everything else instead of leaving them behind.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.template_install_note(p_organization_id uuid, p_install_id uuid, p_kind text, p_id uuid, p_label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_i custom.template_install;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install_note');
  if coalesce(p_kind, '') not in ('agent', 'workflow') then
    raise exception 'An install records only what its host makes outside the store (an agent or a workflow); "%" is made by the install itself.', coalesce(p_kind, '(none)')
      using errcode = '22023';
  end if;
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id and i.state <> 'uninstalled' for update;
  if not found then
    raise exception 'There is no such install in this organization.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_i.made) x where x ->> 'kind' = p_kind and x ->> 'id' = p_id::text) then
    update custom.template_install i
       set made = i.made || jsonb_build_array(jsonb_build_object('kind', p_kind, 'id', p_id, 'ref', p_kind, 'title', p_label, 'step', null)),
           updated_at = now()
     where i.id = v_i.id
    returning * into v_i;
  end if;
  return custom._template_answer(v_i);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.template_uninstall(p_organization_id uuid, p_install_id uuid, p_budget_ms integer DEFAULT 4000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '90s'
AS $function$
declare
  v_i      custom.template_install;
  v_m      jsonb;
  v_id     uuid;
  v_tbl    uuid;
  v_r      jsonb;
  v_t0     timestamptz := clock_timestamp();
  v_budget integer := least(greatest(coalesce(p_budget_ms, 4000), 0), 600000);
  v_arch   jsonb;
  v_left   jsonb := '[]'::jsonb;
  v_done   boolean := true;
  v_kind   text;
  v_was    boolean;
  v_may    boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.template_uninstall');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.template_uninstall');
  select * into v_i from custom.template_install i
   where i.id = p_install_id and i.organization_id = p_organization_id for update;
  if not found then
    raise exception 'There is no such install in this organization, so there is nothing to uninstall.' using errcode = 'P0002';
  end if;
  if v_i.state = 'uninstalled' then
    return custom._template_answer(v_i, jsonb_build_object('already', true));
  end if;
  if v_i.state = 'installing' then
    raise exception 'This template is still being installed; let it finish (or be refused) before it is uninstalled.' using errcode = '55000';
  end if;
  v_arch := v_i.archived;

  for v_m in select x from jsonb_array_elements(v_i.made) with ordinality as e(x, n) order by n desc loop
    v_kind := v_m ->> 'kind';
    v_id := nullif(v_m ->> 'id', '')::uuid;
    continue when v_id is null or exists (select 1 from jsonb_array_elements(v_arch) a where a ->> 'id' = v_id::text);
    if extract(epoch from clock_timestamp() - v_t0) * 1000 > v_budget then
      v_done := false;
      exit;
    end if;
    case v_kind
      when 'table' then
        loop
          v_r := custom.table_archive(p_organization_id, v_id, 10, true);   -- small chunks (the interim installer's ARCHIVE_CHUNK): a call stays inside the 8 s ceiling
          exit when coalesce((v_r ->> 'done')::boolean, false) or coalesce((v_r ->> 'table_archived')::boolean, false);
          if extract(epoch from clock_timestamp() - v_t0) * 1000 > v_budget then
            v_done := false;
            exit;
          end if;
        end loop;
        exit when not v_done;
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title', 'event', v_r ->> 'archive_event'));
      when 'dashboard', 'document' then
        -- Both are records of the store; one already archived (by hand, or with its table) is left as it is.
        if exists (select 1 from custom.record r where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          if v_kind = 'dashboard' then
            perform custom.dashboard_delete(p_organization_id, v_id);
          else
            perform custom.doc_template_delete(p_organization_id, v_id);
          end if;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'portal' then
        perform custom.portal_archive(p_organization_id, v_id, v_m ->> 'title', 'The template that made it was uninstalled.');
        v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
      when 'form' then
        select f.table_id into v_tbl from custom.anon_form f
         where f.organization_id = p_organization_id and f.id = v_id and f.deleted_at is null;
        if found then
          perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_uninstall');
          update custom.anon_form f set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
           where f.organization_id = p_organization_id and f.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'view' then
        select v.subject_id into v_tbl from platform.saved_view v
         where v.organization_id = p_organization_id and v.id = v_id and v.deleted_at is null;
        if found then
          perform custom.assert_client_may_change(p_organization_id, v_tbl, 'custom.template_uninstall');
          update platform.saved_view v set deleted_at = now(), updated_at = now(), updated_by = auth.uid()
           where v.organization_id = p_organization_id and v.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        end if;
      when 'record' then
        if exists (select 1 from custom.record r where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
          -- The template's Home can also hold a table the whole organization shares and the template did not
          -- make — "Checklist steps" (custom.checklist_steps_table puts it in the first Home it finds). Then the
          -- Home stays, named in `left`, and the uninstall finishes instead of being refused as a whole.
          begin
            perform custom.record_delete(p_organization_id, v_id);
            v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
          exception when foreign_key_violation then
            v_left := v_left || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title',
                        'says', 'Kept: it also holds tables the organization uses outside this template.'));
          end;
        end if;
      when 'agent' then
        -- The agents list's own Archive (is_archived; restorable from its Archived view), only for a copy in this
        -- organization the person may edit (agent.definition's std_update); anything else is named in `left`.
        select d.is_archived, (d.created_by = auth.uid() or iam.has_access('agent', d.id, 'editor'::permission_level))
          into v_was, v_may
          from agent.definition d
         where d.id = v_id and d.organization_id = p_organization_id and d.deleted_at is null;
        if not found then
          null;   -- already gone, or never this organization's: nothing to archive
        elsif v_was then
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        elsif v_may then
          update agent.definition d set is_archived = true, updated_at = now() where d.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        else
          v_left := v_left || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title',
                      'says', 'Kept: you may not change this agent, so it was not archived.'));
        end if;
      when 'workflow' then
        -- The workflows list's own Archive (is_archived), with the same rule as an agent (workflow.definition's std_update).
        select d.is_archived, (d.created_by = auth.uid() or iam.has_access('workflow', d.id, 'editor'::permission_level))
          into v_was, v_may
          from workflow.definition d
         where d.id = v_id and d.organization_id = p_organization_id and d.deleted_at is null;
        if not found then
          null;
        elsif v_was then
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        elsif v_may then
          update workflow.definition d set is_archived = true, updated_at = now() where d.id = v_id;
          v_arch := v_arch || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title'));
        else
          v_left := v_left || jsonb_build_array(jsonb_build_object('kind', v_kind, 'id', v_id, 'title', v_m ->> 'title',
                      'says', 'Kept: you may not change this workflow, so it was not archived.'));
        end if;
      else
        null;   -- fields, rules, row actions, stage rules, dimensions: they go with their table.
    end case;
  end loop;

  update custom.template_install i
     set archived = v_arch,
         state = case when v_done then 'uninstalled' else 'uninstalling' end,
         uninstalled_at = case when v_done then now() end,
         uninstalled_by = case when v_done then auth.uid() end,
         updated_at = now()
   where i.id = v_i.id
  returning * into v_i;
  return custom._template_answer(v_i, jsonb_build_object('left', v_left, 'done', v_done));
end;
$function$;

CREATE OR REPLACE FUNCTION custom._template_answer(p_install custom.template_install, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
    -- Kits → Template merge: a template that carries extra agents, workflows or full bindings hands its host
    -- those plan parts and the ids to resolve them (tables.<token>, row.<token>.<row key>). Absent otherwise.
    'host', (select jsonb_build_object(
                      'extra_agents', t.plan -> 'extraAgents',
                      'workflows', t.plan -> 'workflows',
                      'ids', coalesce((select jsonb_object_agg(substr(e.key, 5), e.value)
                                         from jsonb_each(p_install.ids) e
                                        where e.key like 'ref:tables.%' or e.key like 'new:row.%'), '{}'::jsonb))
               from custom.template t
              where t.id = p_install.template_id
                and (t.plan ? 'extraAgents' or t.plan ? 'workflows'
                     or jsonb_path_exists(t.plan, '$.agent.bindings[*].binding')))) || coalesce(p_extra, '{}'::jsonb)
$function$;
