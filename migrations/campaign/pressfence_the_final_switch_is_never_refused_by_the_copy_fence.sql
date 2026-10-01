-- chair-step: lane PRESS-FENCE (chair, 2026-10-01, live switch hour). ONE replaced body, custom._older_table_copy_refusal(uuid) (same signature, grants kept). The fence now lets the final switch's own run through: a write made while app.final_switch_step = 'on' (set transaction-local by platform.final_switch_press and platform.final_switch_undo around their writes, cleared before they return) is not refused. custom._older_table_copy_verdict and custom._context_copy_fence ask this body, so they follow unchanged. No table, trigger, index, grant or policy is touched; CREATE OR REPLACE FUNCTION takes only the pg_proc row lock.
-- based-on: custom._older_table_copy_refusal(uuid) 88fd4c57f7a3a1634533522fa957740c30471c38edead45a9a7e9d7ca7a39f0d
-- lane: PRESS-FENCE
-- INVERSE: migrations/inverse/pressfence_the_final_switch_is_never_refused_by_the_copy_fence_down.sql
--
-- THE DEFECT. Production 2026-10-01 11:58 PT: Arman pressed "Switch everything"; the press rolled back
-- whole with the fence's own sentence for "Rincon Plumbing — Customers" (admin's Workspace). The fence
-- lets a write to a store copy of a live older table through only when platform.write_is_a_persons_own()
-- (PostgREST authenticated, no actor tier/system). The press runs through the aidream server as the
-- platform (actor_tier code, actor_system named), and its re-sync puts back a person's REST test edits on
-- the copy, so the press's own write was refused. Clone rehearsals passed because run.sh synthesises a
-- person's token.
--
-- THE FIX (the class). The press and the undo already mark their own run with the transaction-local
-- app.final_switch_step = 'on' (the per-organization presses recognise their caller by it). The fence
-- honours the same mark, after the person check and before the refusal. No second marker: one mark, set
-- and cleared in exactly two bodies, means nothing else passes as the final switch.
-- Not covered: Copy again (Step 1) is driven by the server outside these bodies; it never wrote through
-- this fence on production (the last Step 1 finished green).

CREATE OR REPLACE FUNCTION custom._older_table_copy_refusal(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_name text;
  v_org  uuid;
begin
  if p_table_id is null or platform.table_lives_in(p_table_id) is distinct from 'older' then
    return null;
  end if;
  select d.organization_id, coalesce(nullif(d.table_name, ''), 'this table')
    into v_org, v_name
    from workbench.udt_datasets d where d.id = p_table_id and d.deleted_at is null;
  if not found then
    return null;
  end if;
  -- A PERSON TESTS THE COPY (COPY-WRITABLE). Her own write is allowed; the fence notes it and
  -- the switch replaces it with the older table's rows.
  if platform.write_is_a_persons_own() then
    return null;
  end if;
  -- THE FINAL SWITCH IS NEVER REFUSED BY ITS OWN FENCE (PRESS-FENCE). platform.final_switch_press
  -- and platform.final_switch_undo set app.final_switch_step = 'on' (transaction-local) around every
  -- write they make and clear it before they return, so only their own run passes here, whatever
  -- channel called them (the server presses as the platform). Every other agent, automation or
  -- integration write to the copy is still refused below.
  if coalesce(current_setting('app.final_switch_step', true), '') = 'on' then
    return null;
  end if;
  -- THE NAME ONLY TO WHO MAY OPEN THE COPY (SUITE-HEALTH-3). The same may-open ladder every
  -- door asks, about the copy by its id. A caller it refuses is still refused the write; the
  -- sentence just names nothing. A copy that is not in the record store is not named either.
  if exists (select 1 from custom.record r where r.id = p_table_id) then
    begin
      perform custom.assert_client_may_open(v_org, p_table_id, 'custom._older_table_copy_refusal', 'viewer', 'table');
    exception when insufficient_privilege or null_value_not_allowed then
      v_name := 'this table';
    end;
  else
    v_name := 'this table';
  end if;
  return format('This is the new system''s test copy of %s; the older table is still the one in use for agents, automations and integrations until an owner switches Data tables on the organization''s settings page. Write it at /data/%s.',
                v_name, p_table_id);
end;
$function$;
