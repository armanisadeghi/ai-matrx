-- chair-step: widens admin.admin_audit_log_action_check by two values (a CHECK cannot be widened without DROP + ADD); every existing row still satisfies it and nothing is removed. Then closes the platform-staff write arm on the four scheduler tables (suppress_platform_admin_lane + iam.apply_rls), replacing the only two client staff writes with audited doors created above in the same transaction.
--
-- sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql
--
-- WHY. P2-STORAGE-ATTACK F1 follow-up (common-docs/projects/checks-run-in-the-app/
-- P2-STORAGE-ATTACK.md, "F1 follow-up: runtime/scheduler/batch", decision 1) moved
-- scheduler.sch_task (and, through it, sch_run / sch_trigger / sch_agent_task) to class
-- `confidential` but had to KEEP the platform-staff write arm: the admin scheduling pages'
-- "Disable schedule" and "Mark run failed" controls wrote those rows straight through RLS
-- as a platform admin (lib/services/scheduling-admin-service.ts disableTaskAdmin /
-- markRunFailedAdmin). With the arm suppressed, an admin's update of a CUSTOMER task or run
-- matches 0 rows and the write silently does nothing. Keeping the arm left the class and the
-- policies disagreeing (data_class_derivations / class_lanes_match_policy /
-- component_not_wider_than_parent FAIL on all four tables).
--
-- WHAT.
--   1. admin.admin_audit_log learns two action words: scheduler_task_disable,
--      scheduler_run_mark_failed. Every door call writes one row (actor, the row's owner as
--      target, the row's own organization, before/after of the fields it changed).
--   2. scheduler.admin_disable_task(p_task_id uuid, p_reason text)      — the door.
--      scheduler.admin_mark_run_failed(p_run_id uuid, p_reason text)   — the door.
--      SECURITY DEFINER, search_path '', gated by public.is_super_admin() (super admin AND the
--      admin lane) BEFORE any read, so a foreign id and an invented one answer the same 42501
--      to a non-admin. A missing row raises P0002 (never a silent 0-row success). Each is
--      declared in platform.client_callable_door BEFORE its GRANT (db-rules §6d-4).
--      No organization is chosen: the audit row carries the TARGET row's own organization_id.
--   3. suppress_platform_admin_lane = true on sch_task, sch_run, sch_trigger, sch_agent_task,
--      then iam.apply_rls on each (the class trigger fires only on a data_class change, and a
--      component never regenerates from it). The whole family is locked ACCESS EXCLUSIVE first:
--      the first class change on this family deadlocked against the scheduler worker on
--      sch_trigger.
--   4. Assertions: the three class/policy checks pass on all four tables, platform_admin_read
--      and svc_all survive on all four, and both doors keep their client EXECUTE. Any failure
--      raises and the whole file rolls back.
--
-- Unchanged on purpose: platform_admin_read (our own admin database access, never removed),
-- the owner/member lanes, svc_all (service_role writers: the scheduler worker, aidream).
--
-- Inverse: migrations/inverse/sch_admin_doors_close_the_staff_write_arm_2026_09_26_down.sql


-- ── 1. audit vocabulary ─────────────────────────────────────────────────────────────────────
ALTER TABLE admin.admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE admin.admin_audit_log ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action = ANY (ARRAY['promote'::text, 'update'::text, 'revoke'::text,
                             'admin_lane_platform_tenant_admission'::text,
                             'scheduler_task_disable'::text,
                             'scheduler_run_mark_failed'::text]));

-- ── 2. the doors ────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION scheduler.admin_disable_task(p_task_id uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_task scheduler.sch_task%rowtype;
begin
  -- Access before existence: a non-admin learns nothing about which ids exist.
  if not public.is_super_admin() then
    raise exception 'Disabling another person''s schedule needs a super admin on the admin lane (/administration).'
      using errcode = '42501';
  end if;
  if p_task_id is null then
    raise exception 'p_task_id is required' using errcode = '22023';
  end if;

  select * into v_task from scheduler.sch_task where id = p_task_id for update;
  if not found then
    raise exception 'Scheduled task % does not exist (it may have been deleted).', p_task_id
      using errcode = 'P0002';
  end if;

  update scheduler.sch_task set enabled = false where id = p_task_id;

  insert into admin.admin_audit_log
    (actor_user_id, action, target_user_id, before, after, organization_id, metadata)
  values
    ((select auth.uid()), 'scheduler_task_disable', v_task.user_id,
     jsonb_build_object('enabled', v_task.enabled),
     jsonb_build_object('enabled', false),
     v_task.organization_id,
     jsonb_build_object('task_id', v_task.id, 'title', v_task.title, 'reason', p_reason));

  return jsonb_build_object('task_id', v_task.id, 'enabled', false, 'was_enabled', v_task.enabled);
end
$function$;

CREATE FUNCTION scheduler.admin_mark_run_failed(p_run_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run scheduler.sch_run%rowtype;
  v_at  timestamptz := now();
begin
  if not public.is_super_admin() then
    raise exception 'Marking another person''s run failed needs a super admin on the admin lane (/administration).'
      using errcode = '42501';
  end if;
  if p_run_id is null then
    raise exception 'p_run_id is required' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A reason is required: it becomes the run''s error message.' using errcode = '22023';
  end if;

  select * into v_run from scheduler.sch_run where id = p_run_id for update;
  if not found then
    raise exception 'Scheduled run % does not exist.', p_run_id using errcode = 'P0002';
  end if;

  update scheduler.sch_run
     set status = 'failed', finished_at = v_at, error_message = p_reason, claim_token = null
   where id = p_run_id;

  insert into admin.admin_audit_log
    (actor_user_id, action, target_user_id, before, after, organization_id, metadata)
  values
    ((select auth.uid()), 'scheduler_run_mark_failed', v_run.user_id,
     jsonb_build_object('status', v_run.status, 'finished_at', v_run.finished_at,
                        'error_message', v_run.error_message,
                        'had_claim', v_run.claim_token is not null),
     jsonb_build_object('status', 'failed', 'finished_at', v_at, 'error_message', p_reason,
                        'had_claim', false),
     v_run.organization_id,
     jsonb_build_object('run_id', v_run.id, 'task_id', v_run.task_id));

  return jsonb_build_object('run_id', v_run.id, 'status', 'failed', 'previous_status', v_run.status);
end
$function$;


insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, gate_predicate, signed_in_callers, anonymous_callers)
values
  ('scheduler', 'admin_disable_task', 'p_task_id uuid, p_reason text',
   'sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql',
   'WRITE. The admin scheduling pages'' "Disable schedule" control for ANY person''s task, replacing a direct RLS update through the platform-staff arm that suppress_platform_admin_lane closes. Gated by public.is_super_admin() (admin lane) before any read; one admin.admin_audit_log row per call; a missing task raises P0002.',
   'public.is_super_admin()', true, false),
  ('scheduler', 'admin_mark_run_failed', 'p_run_id uuid, p_reason text',
   'sch_admin_doors_close_the_staff_write_arm_2026_09_26.sql',
   'WRITE. The admin scheduling pages'' "Mark run failed" control (orphan leases, run menus) for ANY person''s run, replacing a direct RLS update through the platform-staff arm that suppress_platform_admin_lane closes. Gated by public.is_super_admin() (admin lane) before any read; one admin.admin_audit_log row per call; a missing run raises P0002.',
   'public.is_super_admin()', true, false);

GRANT EXECUTE ON FUNCTION scheduler.admin_disable_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION scheduler.admin_mark_run_failed(uuid, text) TO authenticated;

-- ── 3. close the staff write arm ────────────────────────────────────────────────────────────
LOCK TABLE scheduler.sch_task, scheduler.sch_trigger, scheduler.sch_run, scheduler.sch_agent_task
  IN ACCESS EXCLUSIVE MODE;

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('sch_task', 'sch_run', 'sch_trigger', 'sch_agent_task');

do $$
declare r record;
begin
  for r in select token, schema_name, table_name, rls_variant from platform.entity_types
            where token in ('sch_task', 'sch_trigger', 'sch_run', 'sch_agent_task')
            order by case token when 'sch_task' then 0 else 1 end, token
  loop
    perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
  end loop;
end $$;

-- ── 4. assertions (any failure rolls the whole file back) ───────────────────────────────────
do $$
declare
  v_bad text;
  t text;
begin
  select string_agg(format('%s.%s=%s (%s)', x.t, v.check_name, v.status, v.detail), '; ')
    into v_bad
    from unnest(array['sch_task','sch_run','sch_trigger','sch_agent_task']) as x(t),
         lateral iam.verify_canonical('scheduler', x.t, x.t, null) v
   where v.check_name in ('data_class_derivations','class_lanes_match_policy','component_not_wider_than_parent')
     and v.status = 'FAIL';
  if v_bad is not null then
    raise exception 'staff arm still open after apply_rls: %', v_bad;
  end if;

  foreach t in array array['sch_task','sch_run','sch_trigger','sch_agent_task'] loop
    if not exists (select 1 from pg_policies where schemaname='scheduler' and tablename=t and policyname='platform_admin_read') then
      raise exception 'platform_admin_read missing on scheduler.% — our own admin database access is never removed', t;
    end if;
    if not exists (select 1 from pg_policies where schemaname='scheduler' and tablename=t and policyname='svc_all') then
      raise exception 'svc_all missing on scheduler.% — service_role writers would break', t;
    end if;
  end loop;

  if not has_function_privilege('authenticated', 'scheduler.admin_disable_task(uuid, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'scheduler.admin_mark_run_failed(uuid, text)', 'EXECUTE') then
    raise exception 'a scheduler admin door lost its client EXECUTE (the §6d-4 guard revoked it)';
  end if;
  if has_function_privilege('anon', 'scheduler.admin_disable_task(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'scheduler.admin_mark_run_failed(uuid, text)', 'EXECUTE') then
    raise exception 'a scheduler admin door is executable by anon';
  end if;
end $$;

notify pgrst, 'reload schema';
