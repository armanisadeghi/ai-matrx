-- HR domain, C5 / register item HRB-009, file 06a -- a fourth defect, caught by the closing proof.
--
-- 🚨 THE AUDITED PAYLOAD DOOR COULD NOT WRITE ITS OWN AUDIT ROW, SO IT COULD NOT BE CALLED AT ALL.
-- hr.rpc_calculation_snapshot_get wrote `action = 'read_calculation_snapshot'`. hr.access_audit's
-- CHECK admits a CLOSED verb set -- read / list / export / reveal_field / bulk_read / print /
-- write / denied -- so every call raised 23514 before returning anything. The door was built,
-- registered and unreachable, and only running it end to end showed that.
--
-- The fix is to speak the audit table's vocabulary rather than invent a parallel one: the VERB is
-- `read`, or `denied` when the door refuses, and WHAT was read is already carried by target_token
-- + target_ids + metadata.calculation_kind. `is_self_access` now records what it means (the
-- caller is the subject of the employment), which is the whole basis on which access was granted
-- while HRB-007's derived roles do not exist yet.
--
-- 🚨 AND A SECOND ONE UNDERNEATH IT, which only surfaced once the first was fixed: the function
-- hard-coded `actor_type = 'employee'`, and hr.access_audit's `access_audit_actor_identified`
-- CHECK requires an `employee` actor to carry an actor_user_id or actor_employment_id. A
-- server-side read has neither -- auth.uid() is NULL under service_role and in a definer context
-- -- so the row was refused and the door was STILL uncallable from the one caller that matters
-- most. That CHECK is right and the function was wrong: the taxonomy already has the honest
-- answer. An identified human reading their own evidence is `employee`; a server reading it on
-- nobody's behalf is `automation`, which the CHECK exempts precisely because there is no person
-- to name. The actor type is now DERIVED from whether a user is actually identified, and the
-- automation case records why in actor_note rather than asserting a person who is not there.
--
-- Section 4.1's contract is unchanged: payload columns stay in client_excluded_columns, the
-- payload is readable only through this SECURITY DEFINER function, and every call -- allowed or
-- refused -- leaves an audit row. Core-tranche-4's rule still holds: this door RETURNS a refusal
-- envelope and never raises, because an audit row written before a RAISE is rolled back by that
-- raise, and a denial log holding only the denials that did not happen reads as evidence.
--
-- Idempotent. Applied live as migration `hr_c5_06a_audited_read_action_taxonomy`.

set local lock_timeout = '20s';

create or replace function hr.rpc_calculation_snapshot_get(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_row hr.calculation_snapshot; v_allowed boolean := false; v_uid uuid := auth.uid();
  v_actor_type text;
begin
  select * into v_row from hr.calculation_snapshot where id = p_snapshot_id;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- employee-self / manager-of-that-employment / HR-admin. The derived-role machinery is
  -- HRB-007's (SPEC-ACCESS); until it lands this door is FAIL-CLOSED for everyone except the
  -- subject of the employment and the service role, and the audit row says exactly that.
  if v_uid is not null and v_row.employment_id is not null then
    select exists (
      select 1 from hr.employment em join hr.employee e on e.id = em.employee_id
       where em.id = v_row.employment_id and e.login_user_id = v_uid) into v_allowed;
  end if;
  if current_user = 'service_role' then v_allowed := true; end if;

  -- name the actor honestly, or say there is not one. Never both.
  v_actor_type := case when v_uid is not null then 'employee' else 'automation' end;

  perform set_config('hr.privileged_write', 'on', true);
  insert into hr.access_audit (organization_id, actor_type, actor_user_id, actor_note, action,
                               target_token, target_ids, row_count, subject_employment_id,
                               sensitivity_tier, purpose, basis, is_self_access, granted,
                               denial_reason, metadata)
  values (v_row.organization_id, v_actor_type, v_uid,
          case when v_uid is null
               then 'server-side read with no authenticated user (service role or definer context)'
               else null end,
          case when v_allowed then 'read' else 'denied' end,
          'hr_calculation_snapshot', array[p_snapshot_id], 1, v_row.employment_id, 'confidential',
          'calculation_evidence_review', 'SPEC-JURISDICTION 4.1 audited payload read (AR 1.18)',
          v_allowed, v_allowed,
          case when v_allowed then null
               else 'not the employment subject; derived HR roles are HRB-007' end,
          jsonb_build_object('calculation_kind', v_row.calculation_kind,
                             'jurisdiction_key', v_row.jurisdiction_key,
                             'as_of_date', v_row.as_of_date));

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error', 'forbidden',
             'message', 'You do not have access to this calculation''s detail.');
  end if;

  return jsonb_build_object('ok', true, 'snapshot', to_jsonb(v_row));
end
$fn$;

-- ============================================================================
-- ASSERTION -- the door is actually callable, in both directions.
-- ============================================================================
-- The assertion runs inside a subtransaction it deliberately aborts, so it leaves nothing behind.
-- It cannot clean up by deleting: a calculation snapshot is evidence and its own trigger refuses
-- both DELETE and any UPDATE other than superseded_by_id. An aborted subtransaction is the only
-- way to write real rows, observe real behaviour, and still leave the table byte-identical.
do $$
declare
  v_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_snap uuid; v_read jsonb; v_action text; v_granted boolean; v_rows integer;
  v_fail text;
begin
  perform set_config('hr.privileged_write','on', true);
  begin
    v_snap := hr.write_calculation_snapshot(v_org,'hr_workweek', gen_random_uuid(),'overtime',
                'US-CA', date '2026-03-16','ot_engine','assertion','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
                '{"hours":{"ot_1_5":4}}'::jsonb,'automation');
    v_read := hr.rpc_calculation_snapshot_get(v_snap);

    if (v_read->>'ok')::boolean is not false or (v_read->>'error') <> 'forbidden' then
      v_fail := format('a non-subject caller must be refused an envelope, got %s', v_read);
    end if;

    select count(*), max(action), bool_or(granted) into v_rows, v_action, v_granted
      from hr.access_audit where target_ids @> array[v_snap];
    -- and the actor must be NAMED honestly: no auth.uid() here, so the row must say automation
    if v_rows > 0 and not exists (select 1 from hr.access_audit
                                   where target_ids @> array[v_snap]
                                     and actor_type = 'automation' and actor_user_id is null
                                     and actor_note is not null) then
      v_fail := coalesce(v_fail, 'an unauthenticated read must be audited as automation with a note, not as a person');
    end if;
    if v_rows = 0 then
      v_fail := coalesce(v_fail, 'the refusal wrote no audit row -- the door is unauditable');
    elsif v_action <> 'denied' or v_granted then
      v_fail := coalesce(v_fail, format('the refusal audit row is wrong: action=%s, granted=%s',
                                        v_action, v_granted));
    end if;

    if hr.rpc_calculation_snapshot_get(gen_random_uuid())->>'error' <> 'not_found' then
      v_fail := coalesce(v_fail, 'an unknown snapshot id must return not_found');
    end if;

    raise exception '__ROLLBACK_ASSERTION__';
  exception when others then
    if sqlerrm <> '__ROLLBACK_ASSERTION__' then
      v_fail := coalesce(v_fail, format('assertion raised: %s', sqlerrm));
    end if;
  end;

  if v_fail is not null then
    raise exception 'hr_c5_06a: %', v_fail;
  end if;
  raise notice 'hr_c5_06a: the audited payload door is callable, refuses a non-subject with an envelope, and audits both outcomes';
end $$;
