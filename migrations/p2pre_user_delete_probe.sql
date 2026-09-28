-- Phase 2 prerequisite 8.2-4 (estate reduction, re-point auth.users links to iam.users), applied live 2026-09-28
-- by the P2-PRE executor. Mirror of the live audit.user_delete_probe(text) (md5 of pg_get_functiondef
-- 61fdf25713d84928c10f0af9dbbf3536). Baseline results: /Users/armanisadeghi/db-estate-backups/2026-09-28/phase2/P2-PRE/delete-before.json
-- User-delete behaviour probe (Phase 2 prerequisite 8.2-4). Seeds one synthetic persona, deletes it from
-- auth.users, measures every linked row, and ROLLS EVERYTHING BACK (the whole body runs in a subtransaction that
-- always ends in an exception). Returns the outcome as jsonb. Callable by postgres only.
--   select audit.user_delete_probe('A0');  -- personas: A0, A1..A5 (the 5 order-sensitive chains), R, B
create or replace function audit.user_delete_probe(p_persona text)
returns jsonb
language plpgsql
set search_path = public, pg_catalog   -- public: files.folders' is_system trigger calls an unqualified function
as $h$
declare
  v_p text := p_persona;
  v_result jsonb;
  v_org uuid := (select organization_id from users.profiles p join auth.users u on u.id = p.id where u.email = 'admin@admin.com');
  v_id uuid := gen_random_uuid();
  v_admin uuid := (select id from auth.users where email = 'admin@admin.com');
  v_email text;
  v_anon boolean;
  v_agent uuid; v_dev uuid; v_perm uuid; v_task uuid;
  v_snap jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_outcome jsonb;
  r record; v_pk text; v_pks jsonb; v_c0 bigint; v_exists bigint; v_null bigint; v_sql text;
begin
  if p_persona not in ('A0','A1','A2','A3','A4','A5','R','B') then
    raise exception 'unknown persona %', p_persona;
  end if;
  begin
  perform set_config('app.actor_system', 'p2pre-delete-harness', true);  -- undone with the subtransaction
  -- The plan's clone personas; production already holds admin+g2v.priya@admin.com, so B's synthetic
  -- account carries a unique sub-address of it (auth.users.email is unique).
  v_email := case v_p when 'B' then 'admin+g2v.priya.probe.' || left(v_id::text, 8) || '@admin.com'
                      when 'R' then 'g2r.restrict@example.com'
                      else 'g2r.marisol@example.com' end;
  v_anon := v_p <> 'B';
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          case when v_anon then null else v_email end, v_anon, case when v_anon then null else now() end,
          jsonb_build_object('full_name', case v_p when 'B' then 'Priya Natarajan' when 'R' then 'Rafael Ortiz' else 'Marisol Reyes' end),
          now(), now());
  if v_p like 'A%' then
    -- every A persona: nullable SET NULL links, and a CASCADE row
    insert into ops.app_log (user_id, level, message) values (v_id, 'INFO', 'Opened the invoices page');
    insert into api.html_extractions (user_id, url, html_content)
    values (v_id, 'https://example.com/invoices', '<html><body><h1>Invoices</h1></body></html>');
    insert into public.app_instances (user_id, instance_id, organization_id)
    values (v_id, 'marisol-macbook-air', v_org) returning id into v_dev;
  end if;
  if v_p = 'A1' then
    -- chain agent.drift_alert: created_by/updated_by NO ACTION; row removed via recipient_id -> iam.users CASCADE.
    -- The agent belongs to the admin test account (an agent created by A writes agent.definition_version.created_by = A,
    -- NO ACTION and never cascaded, which would block the delete on its own).
    insert into agent.definition (name, organization_id, created_by, updated_by)
    values ('Invoice follow-up assistant', v_org, v_admin, v_admin) returning id into v_agent;
    insert into agent.drift_alert (agent_id, agent_name, severity, fingerprint, created_by, updated_by, organization_id, recipient_id)
    values (v_agent, 'Invoice follow-up assistant', 'warning', 'p2pre-' || v_id, v_id, v_id, v_org, v_id);
  elsif v_p = 'A2' then
    -- chain files.sync_mappings: created_by/updated_by NO ACTION; row removed via device_id -> app_instances (user_id CASCADE)
    insert into files.sync_mappings (device_id, local_path, organization_id, created_by, updated_by)
    values (v_dev, '/Users/marisol/Documents/Invoices', v_org, v_id, v_id);
  elsif v_p = 'A3' then
    -- chain hr.derived_grant: created_by/updated_by/grantee_user_id NO ACTION; removed via permission_id -> iam.permissions (granted_to_user_id CASCADE)
    insert into agent.definition (name, organization_id, created_by, updated_by)
    values ('Invoice follow-up assistant', v_org, v_admin, v_admin) returning id into v_agent;
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, created_by)
    values ('agent', v_agent, v_id, v_admin) returning id into v_perm;
    perform hr.arm_write();   -- hr.* seed writes need the privileged lane; disarmed right after so the delete is not
    insert into hr.derived_grant (permission_id, resource_type, resource_id, reason, organization_id, created_by, updated_by, grantee_user_id)
    values (v_perm, 'agent', v_agent, 'Manager of the invoicing team', v_org, v_id, v_id, v_id);
    perform set_config('hr.privileged_write', '', true);
  elsif v_p in ('A4', 'A5') then
    -- chains scheduler.sch_trigger (A4) / scheduler.sch_run (A5): created_by NO ACTION; row removed via
    -- user_id CASCADE and via task_id -> sch_task (user_id CASCADE). The task's own created_by is the admin.
    insert into scheduler.sch_task (kind, title, organization_id, user_id, created_by)
    values ('ping', 'Weekly overdue-invoice check', v_org, v_id, v_admin) returning id into v_task;
    if v_p = 'A4' then
      insert into scheduler.sch_trigger (task_id, type, config, organization_id, user_id, created_by, updated_by)
      values (v_task, 'cron', '{"expression":"0 9 * * 1"}'::jsonb, v_org, v_id, v_id, v_id);
    else
      insert into scheduler.sch_run (task_id, due_at, organization_id, user_id, created_by, updated_by)
      values (v_task, now() + interval '1 day', v_org, v_id, v_id, v_id);
    end if;
  elsif v_p = 'R' then
    insert into browser.profile (display_name, home_region, egress_class, organization_id, owner_type, owner_user_id)
    values ('Research browser', 'us-east-1', 'standard', v_org, 'user', v_id);
  elsif v_p = 'B' then
    insert into files.folders (created_by, folder_path, folder_name, organization_id)
    values (v_id, 'Client contracts', 'Client contracts', v_org);
  end if;

  -- Snapshot: every column linked to auth.users or iam.users that holds the persona, with its rows' keys.
  for r in
    select distinct n.nspname sch, cl.relname tbl, a.attname col, cl.oid rel
      from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)
       and cl.relkind = 'r'                                -- partitions counted themselves; parents skipped
  loop
    select string_agg(format('t.%I', pa.attname), ', ' order by k.ord) into v_pk
      from pg_index i cross join unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute pa on pa.attrelid = i.indrelid and pa.attnum = k.attnum
     where i.indrelid = r.rel and i.indisprimary;
    if v_pk is null then v_pk := 't.ctid::text'; end if;
    execute format('select count(*), jsonb_agg(jsonb_build_array(%s)) from %I.%I t where t.%I = $1', v_pk, r.sch, r.tbl, r.col)
      into v_c0, v_pks using v_id;
    if v_c0 > 0 then
      v_snap := v_snap || jsonb_build_object(format('%s.%s.%s', r.sch, r.tbl, r.col),
                  jsonb_build_object('sch', r.sch, 'tbl', r.tbl, 'col', r.col, 'pk', v_pk, 'n', v_c0, 'keys', v_pks));
    end if;
  end loop;

  begin
    delete from auth.users where id = v_id;
    v_outcome := jsonb_build_object('outcome', 'ok');
    for r in select key, value from jsonb_each(v_snap) loop
      execute format('select count(*), count(*) filter (where t.%I is null) from %I.%I t where jsonb_build_array(%s) in (select jsonb_array_elements($1))',
                     r.value->>'col', r.value->>'sch', r.value->>'tbl', r.value->>'pk')
        into v_exists, v_null using r.value->'keys';
      v_after := v_after || jsonb_build_object(r.key, jsonb_build_object(
        'before', (r.value->>'n')::bigint, 'deleted', (r.value->>'n')::bigint - v_exists, 'nulled', v_null, 'kept', v_exists - v_null));
    end loop;
    raise exception using errcode = 'P0001', message = 'undo-delete';
  exception when others then
    if sqlerrm <> 'undo-delete' then
      declare v_con text; v_tab text;
      begin
        get stacked diagnostics v_con = constraint_name, v_tab = table_name;
        v_outcome := jsonb_build_object('outcome', sqlstate, 'constraint', v_con, 'table', v_tab, 'message', left(sqlerrm, 160));
      end;
      for r in select key, value from jsonb_each(v_snap) loop
        v_after := v_after || jsonb_build_object(r.key, jsonb_build_object('before', (r.value->>'n')::bigint));
      end loop;
    end if;
  end;
    v_result := jsonb_build_object('persona', v_p, 'email', v_email) || v_outcome || jsonb_build_object('children', v_after);
    raise exception using errcode = 'P0001', message = 'undo-probe';
  exception when others then
    if sqlerrm <> 'undo-probe' then raise; end if;
  end;
  return v_result;
end $h$;
comment on function audit.user_delete_probe(text) is
  'Rolled-back user-delete probe for the auth.users -> iam.users move (common-docs projects/database-estate-reduction CERTIFICATION-WAVES.md 8.2-4). Never leaves a row behind: the body always ends in an exception inside its own subtransaction.';
revoke all on function audit.user_delete_probe(text) from public, anon, authenticated, service_role;
