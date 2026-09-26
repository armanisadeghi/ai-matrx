-- draft: rc-a2-deep HR snapshot actor; remove when rehearsed + suite green on the clone
-- based-on: public.hr_write_calculation_snapshot(uuid, text, uuid, text, text, date, text, text, jsonb, jsonb, jsonb, jsonb, text, uuid, uuid, jsonb, boolean, uuid, uuid) 8fa1b2f97ee8750a0dacec66641db39c8dd9cf30ece33c219e07693bb374132e
--
-- RC-A2 round 4 (register row RC-A2). A CALCULATION IS STAMPED BY WHOEVER RAN IT.
--
-- public.hr_write_calculation_snapshot wrote the caller-supplied p_actor_type / p_actor_id onto
-- hr.calculation_snapshot as who produced a payroll figure, after checking only that the caller is
-- in the organization — so a member could freeze an overtime or premium figure in another person's
-- name, or as `automation` / `platform_admin` / `kiosk_device`. A snapshot is the evidence a wage
-- claim is answered with two years later; its actor is not a field the writer gets to choose.
-- The stamp-from-an-argument class (GUARD-STAMPS: custom.portal_principal_bind; ARGS-RULED:
-- platform.unified_data_store_set, custom.doc_sign) — the census of client-callable functions that
-- take an actor/author/signer id (RC-A2 register row) found this the last unbound one.
--   * any signed-in caller (a client, or the server acting as a person): a non-null p_actor_id must
--     be the caller;
--   * a direct client (not iam.is_trusted_backend()): the actor IS the caller, and it can stamp only
--     a person's role (employee, manager, hr_admin) — never a device, an integration, an automation,
--     an AI agent, an outside signer or a platform admin.
-- The server's own unattended work (automation, actor null) is unchanged.
-- Forcing suite: aidream db/tests/test_rca2l_a_calculation_is_stamped_by_whoever_ran_it.py.
-- Inverse (rehearsal only): migrations/inverse/rca2l_a_calculation_is_stamped_by_whoever_ran_it_down.sql

set local lock_timeout = '2s';

do $patch$
declare
  v_def text := pg_get_functiondef('public.hr_write_calculation_snapshot(uuid,text,uuid,text,text,date,text,text,jsonb,jsonb,jsonb,jsonb,text,uuid,uuid,jsonb,boolean,uuid,uuid)'::regprocedure);
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, $a$      using errcode = '42501';
  end if;
  return hr.write_calculation_snapshot($a$,
       $a$      using errcode = '42501';
  end if;
  -- RC-A2l: A CALCULATION IS STAMPED BY WHOEVER RAN IT.
  if iam.is_client_lane() then
    if p_actor_id is not null and p_actor_id is distinct from (select auth.uid()) then
      raise exception 'A calculation is recorded as made by whoever ran it, so it cannot be stamped with somebody else''s name.'
        using errcode = '42501',
              hint = 'Leave the actor empty or pass your own id; who produced a payroll figure is not a field the writer chooses.';
    end if;
    if not iam.is_trusted_backend() then
      if coalesce(p_actor_type, '') not in ('employee', 'manager', 'hr_admin') then
        raise exception 'A person can record a calculation only as a person (employee, manager or HR admin), not as %.', coalesce(p_actor_type, 'nobody')
          using errcode = '42501';
      end if;
      p_actor_id := (select auth.uid());
    end if;
  end if;
  return hr.write_calculation_snapshot($a$)
    ) as t(ord, anchor, repl)
    order by ord
  loop
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> 1 then
      raise exception 'rca2l patch %: anchor occurs % time(s), expected 1 — nothing was changed', r.ord, v_n;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
