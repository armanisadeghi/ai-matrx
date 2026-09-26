-- chair-step: DROP INDEX IF EXISTS of two scheduler.sch_run actor indexes (only a leftover INVALID one from a failed CONCURRENTLY attempt can exist; both are rebuilt valid two lines later) and SET NOT NULL on the two NEW scheduler.sch_agent_task columns (organization_id, created_at) after backfilling both from the parent sch_task in this same transaction (0 null parents asserted before the SET). Everything else is additive: base-contract FKs to iam.organizations / auth.users (0 orphans asserted first) and two function bodies that now pass the task's organization to the sch_agent_task child row they insert.
-- based-on: public.create_agent_task(text, text, text, jsonb, text, text[], text[], text, timestamp with time zone, timestamp with time zone, uuid, jsonb, uuid, text, integer, integer, uuid) d33ed598b1def0fd6f08622a07d0559ae38b6eaf87d79cf5b6ac763e54924a83
-- based-on: communication.schedule_task_sms_snooze(uuid, uuid, uuid, uuid, text) 496c95436a7b469e46e785ebb7dce0f28cf94d4dabed2dcb7ae66c5e83400bb7
--
-- sch_base_contract_b_fks_and_agent_task_org.sql
--
-- WHY. P2-STORAGE-ATTACK "F1 follow-up: runtime/scheduler/batch" (common-docs/projects/
-- checks-run-in-the-app/P2-STORAGE-ATTACK.md) closed the staff write arm on the four scheduler
-- tables, and left iam.canonical_certify_ok false on all four for base-contract gaps that were
-- there before:
--   sch_task       base_org_fk, base_created_by_fk, base_updated_by_fk
--   sch_run        base_created_by_fk, base_updated_by_fk
--   sch_trigger    base_created_by_fk, base_updated_by_fk
--   sch_agent_task base_organization_id, base_org_fk, base_created_at
--
-- WHAT.
--   1. The FKs the gate matches: organization_id -> iam.organizations(id),
--      created_by / updated_by -> auth.users(id). created_by is NO ACTION (every non-null
--      created_by equals user_id, whose FK already CASCADEs, so a user delete removes the same
--      rows first); updated_by is ON DELETE SET NULL so an admin who touched someone else's row
--      never blocks that admin's own deletion. Orphans are counted first and must be 0.
--   2. scheduler.sch_agent_task gets organization_id and created_at, both backfilled from its
--      parent sch_task (the row is 1:1 with the task: sch_agent_task.id = sch_task.id). Then
--      organization_id NOT NULL + FK, created_at NOT NULL DEFAULT now().
--      NO default and NO trigger chooses organization_id (common-docs/projects/
--      no-db-assigned-org/PLAN.md): every writer passes it explicitly. The two SQL writers are
--      patched below; the code writers (matrx-scheduler upsert_agent_task, aidream Gmail
--      recovery carrier, the three system-task seed scripts) pass the parent task's
--      organization_id in the same change. The frontend only UPDATEs sch_agent_task.
--   3. public.create_agent_task and communication.schedule_task_sms_snooze insert the child
--      row with the organization they already hold (p_organization_id, the org the task itself
--      was just inserted with). Edited in place from the live body (exact-text replacement,
--      each needle asserted to occur exactly once), declared by the -- based-on: lines.
--
-- LOCKS. The family is locked ACCESS EXCLUSIVE up front, in the order the previous scheduler
-- class change used (a piecemeal lock deadlocked against the scheduler worker on sch_trigger).
-- Validating the two sch_run FKs scans ~294k rows while auth.users is held SHARE ROW EXCLUSIVE.
-- Measured on the clone (rule 27 green, inverse -> up -> inverse -> up): the whole file commits in
-- ~1.7 s (the two sch_run index builds ~0.3 s each), no ACCESS EXCLUSIVE outside the four scheduler
-- tables; auth.users / iam.organizations are held SHARE ROW EXCLUSIVE for that ~1.7 s (a window file
-- by aidream's db/migration_window.py rule).
--
-- NOT HERE (and why certify is still false on sch_task / sch_run / sch_trigger after this):
-- the legacy_owner_col WARN (user_id is still the scheduler's owner column across aidream,
-- matrx-scheduler, matrx-extend, the frontend and ~20 SQL functions) and, on sch_task, the two
-- SECURITY-SWEEP-2 restrictive policies sch_task_user_id_is_the_caller_{insert,update}, which
-- exist BECAUSE user_id is still writable. Superseding them while user_id lives would reopen the
-- impersonation door they close. Both go together with the user_id retirement.
--
-- Inverse: migrations/inverse/sch_base_contract_b_fks_and_agent_task_org_down.sql

LOCK TABLE scheduler.sch_task, scheduler.sch_trigger, scheduler.sch_run, scheduler.sch_agent_task
  IN ACCESS EXCLUSIVE MODE;

-- ── 0. Orphan census: every FK below must land on existing rows ─────────────────────────
do $$
declare v bigint;
begin
  select count(*) into v from scheduler.sch_task t
   where not exists (select 1 from iam.organizations o where o.id = t.organization_id);
  if v > 0 then raise exception 'sch_task: % rows name a missing organization', v; end if;
  select count(*) into v from scheduler.sch_task t
   where (t.created_by is not null and not exists (select 1 from auth.users u where u.id = t.created_by))
      or (t.updated_by is not null and not exists (select 1 from auth.users u where u.id = t.updated_by));
  if v > 0 then raise exception 'sch_task: % rows name a missing user', v; end if;
  select count(*) into v from scheduler.sch_trigger t
   where (t.created_by is not null and not exists (select 1 from auth.users u where u.id = t.created_by))
      or (t.updated_by is not null and not exists (select 1 from auth.users u where u.id = t.updated_by));
  if v > 0 then raise exception 'sch_trigger: % rows name a missing user', v; end if;
  select count(*) into v from scheduler.sch_run t
   where (t.created_by is not null and not exists (select 1 from auth.users u where u.id = t.created_by))
      or (t.updated_by is not null and not exists (select 1 from auth.users u where u.id = t.updated_by));
  if v > 0 then raise exception 'sch_run: % rows name a missing user', v; end if;
  select count(*) into v from scheduler.sch_agent_task a
   where not exists (select 1 from scheduler.sch_task t where t.id = a.id and t.organization_id is not null);
  if v > 0 then raise exception 'sch_agent_task: % rows have no parent task organization to copy', v; end if;
end $$;

-- ── 1. Base FKs on sch_task / sch_trigger / sch_run ─────────────────────────────────────
alter table scheduler.sch_task
  add constraint sch_task_organization_id_fkey foreign key (organization_id) references iam.organizations(id),
  add constraint sch_task_created_by_fkey foreign key (created_by) references auth.users(id),
  add constraint sch_task_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table scheduler.sch_trigger
  add constraint sch_trigger_created_by_fkey foreign key (created_by) references auth.users(id),
  add constraint sch_trigger_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

alter table scheduler.sch_run
  add constraint sch_run_created_by_fkey foreign key (created_by) references auth.users(id),
  add constraint sch_run_updated_by_fkey foreign key (updated_by) references auth.users(id) on delete set null;

-- Covering indexes (every new FK needs one; platform._provision_shape_settled refuses the COMMIT
-- otherwise). Built inside this transaction: sch_run is already held ACCESS EXCLUSIVE for the FK
-- validation above, so a CONCURRENTLY build buys nothing here, and a first CONCURRENTLY attempt
-- (2026-09-26 14:4x UTC) died on the runner's 2 s lock_timeout waiting for the scheduler worker's
-- open transactions and left an INVALID sch_run_created_by_idx behind; the DROP ... IF EXISTS
-- clears that leftover so the name is rebuilt valid.
drop index if exists scheduler.sch_run_created_by_idx;
drop index if exists scheduler.sch_run_updated_by_idx;
create index sch_run_created_by_idx on scheduler.sch_run (created_by);
create index sch_run_updated_by_idx on scheduler.sch_run (updated_by);
create index sch_task_organization_id_idx on scheduler.sch_task (organization_id);
create index sch_task_created_by_idx on scheduler.sch_task (created_by);
create index sch_task_updated_by_idx on scheduler.sch_task (updated_by);
create index sch_trigger_created_by_idx on scheduler.sch_trigger (created_by);
create index sch_trigger_updated_by_idx on scheduler.sch_trigger (updated_by);

-- ── 2. sch_agent_task: organization_id + created_at, copied from the parent task ────────
alter table scheduler.sch_agent_task
  add column organization_id uuid,
  add column created_at timestamptz;

update scheduler.sch_agent_task a
   set organization_id = t.organization_id,
       created_at      = t.created_at
  from scheduler.sch_task t
 where t.id = a.id;

do $$
begin
  if exists (select 1 from scheduler.sch_agent_task where organization_id is null or created_at is null) then
    raise exception 'sch_agent_task backfill left a null organization_id or created_at';
  end if;
end $$;

alter table scheduler.sch_agent_task
  alter column organization_id set not null,
  alter column created_at set not null,
  alter column created_at set default now(),
  add constraint sch_agent_task_organization_id_fkey foreign key (organization_id) references iam.organizations(id);

create index sch_agent_task_organization_id_idx on scheduler.sch_agent_task (organization_id);

comment on column scheduler.sch_agent_task.organization_id is
  'The parent sch_task''s organization. Every writer passes it explicitly (the task''s own organization_id); no default and no trigger chooses it (common-docs/projects/no-db-assigned-org/PLAN.md).';

-- ── 3. The two SQL writers pass the organization they already hold ──────────────────────
do $$
declare
  v_fn   regprocedure;
  v_def  text;
  v_new  text;
  v_pair text[];
  v_edits jsonb := jsonb_build_array(
    jsonb_build_object(
      'fn', 'public.create_agent_task(text,text,text,jsonb,text,text[],text[],text,timestamp with time zone,timestamp with time zone,uuid,jsonb,uuid,text,integer,integer,uuid)',
      'pairs', jsonb_build_array(
        jsonb_build_array(
          'id, agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent' || E'\n',
          'id, agent_id, prompt, variables, persistent_conversation_id, auth_mode, max_runtime_seconds, max_concurrent, organization_id' || E'\n'),
        jsonb_build_array(
          'v_task_id, p_agent_id, p_prompt, p_variables, p_persistent_conversation_id, p_auth_mode, p_max_runtime_seconds, p_max_concurrent' || E'\n',
          'v_task_id, p_agent_id, p_prompt, p_variables, p_persistent_conversation_id, p_auth_mode, p_max_runtime_seconds, p_max_concurrent, p_organization_id' || E'\n'))),
    jsonb_build_object(
      'fn', 'communication.schedule_task_sms_snooze(uuid,uuid,uuid,uuid,text)',
      'pairs', jsonb_build_array(
        jsonb_build_array(
          E'    max_runtime_seconds, max_concurrent\n  ) values (\n    v_schedule_id, null,',
          E'    max_runtime_seconds, max_concurrent, organization_id\n  ) values (\n    v_schedule_id, null,'),
        jsonb_build_array(
          E'    ''auto'', 120, 1\n  );',
          E'    ''auto'', 120, 1, p_organization_id\n  );'))));
  e jsonb;
  p jsonb;
  v_before int;
begin
  for e in select * from jsonb_array_elements(v_edits) loop
    v_fn  := (e ->> 'fn')::regprocedure;
    v_def := pg_get_functiondef(v_fn);
    v_new := v_def;
    for p in select * from jsonb_array_elements(e -> 'pairs') loop
      v_before := (length(v_new) - length(replace(v_new, p ->> 0, ''))) / length(p ->> 0);
      if v_before <> 1 then
        raise exception '% : needle occurs % times (expected exactly 1): %', v_fn, v_before, p ->> 0;
      end if;
      v_new := replace(v_new, p ->> 0, p ->> 1);
    end loop;
    execute v_new;
  end loop;
end $$;

-- ── 4. Assertions: the gaps this file owns are closed ───────────────────────────────────
do $$
declare v_bad text;
begin
  select string_agg(t || ': ' || c.detail, '; ') into v_bad
    from unnest(array['sch_task', 'sch_run', 'sch_trigger', 'sch_agent_task']) t,
         lateral iam.verify_canonical('scheduler', t, t) c
   where c.status = 'FAIL'
     and c.check_name in ('base_organization_id', 'base_org_fk', 'base_org_not_null',
                          'base_created_by_fk', 'base_updated_by_fk', 'base_created_at');
  if v_bad is not null then raise exception 'base contract still failing: %', v_bad; end if;

  if (select count(*) from pg_policy pol join pg_class c on c.oid = pol.polrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'scheduler' and pol.polname = 'platform_admin_read'
        and c.relname in ('sch_task', 'sch_run', 'sch_trigger', 'sch_agent_task')) <> 4 then
    raise exception 'platform_admin_read missing on a scheduler table';
  end if;

  if position('p_organization_id' in pg_get_functiondef(
       'public.create_agent_task(text,text,text,jsonb,text,text[],text[],text,timestamp with time zone,timestamp with time zone,uuid,jsonb,uuid,text,integer,integer,uuid)'::regprocedure)) = 0
  then raise exception 'create_agent_task lost p_organization_id'; end if;
end $$;
