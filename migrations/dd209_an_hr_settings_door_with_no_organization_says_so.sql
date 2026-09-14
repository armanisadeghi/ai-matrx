-- DD-209 (V-102 F3) — an HR settings door with no organization says so, in words.
--
-- Found by the door harness's own control probe, tightened in the same change: when a
-- door fails for a stranger AND the victim's identical call gets further, that is only
-- an authorization decision if the SQLSTATE says so. `public.hr_pay_group_upsert('{}')`
-- failed with `23502 null value in column "organization_id" of relation "access_audit"`
-- — a NOT NULL constraint violation raised inside the audit recorder, i.e. the door
-- crashing, not refusing — and the harness was reading it as a refusal.
--
-- WHAT IS AND IS NOT WRONG HERE, measured live 2026-09-14 and rolled back:
--   * DD-213's standing rule DOES cover this door. A stranger naming a REAL
--     organization (`7cd12da2-…`, Castellano & Reyes) gets
--     `{"ok": false, "reason": "forbidden", "detail": "HR settings are HR-admin only.",
--       "audit_id": null}` and **0 rows** in that organization's `hr.access_audit`.
--     Nothing crosses. This is not an access hole.
--   * What was wrong is the SENTENCE. With no organization in the payload the gate ran
--     on to `hr._record_access_audit(p_organization_id => NULL, …)` and the caller got a
--     raw Postgres constraint violation naming an internal audit table. "Nothing fails
--     silently" is not satisfied by failing loudly in the wrong language.
--
-- The refusal is the wording the HR write doors already use
-- (`hr write: organization_id is required`, 22023), so nothing new is coined, and it
-- covers all thirteen callers of this gate rather than the one door that surfaced it.
--
-- based-on: hr._l1_settings_gate(uuid, text, text) 1b6c57af78da64738f0abdc20a475c0b2b6760ec9ea610f753cf2ab6af9cdf3c
CREATE OR REPLACE FUNCTION hr._l1_settings_gate(p_org uuid, p_token text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_audit uuid;
begin
  if v_uid is null then
    raise exception 'hr settings: no authenticated caller' using errcode = '42501';
  end if;
  -- 🚨 DD-209 (V-102 F3). A MISSING ORGANIZATION IS AN INPUT ERROR, SAID IN WORDS.
  -- Called with a payload carrying no organization_id, this gate ran on to
  -- hr._record_access_audit with p_org NULL and the caller received
  -- `23502 null value in column "organization_id" of relation "access_audit"` —
  -- a raw constraint violation naming an internal audit table, from thirteen HR
  -- settings doors. Nothing leaked and nothing was written (DD-213's standing rule
  -- already suppresses a stranger's receipt, verified live: a stranger naming a
  -- REAL organization gets `{"ok": false, "reason": "forbidden", "audit_id": null}`
  -- and zero audit rows). What was wrong was the sentence. This is the wording the
  -- HR write doors already use, so no new vocabulary is coined.
  if p_org is null then
    raise exception 'hr write: organization_id is required' using errcode = '22023';
  end if;
  -- 🚨 DD-206 / V-61 §8. ONE `or` EXPRESSION IS NOT AN ORDER. Postgres may evaluate either
  -- operand of `or` first and is free to reorder by cost, so "capability first" was a fact about
  -- today's plan, not a rule. Two statements make it a language guarantee, and they put the
  -- capability where the doctrine puts it: first.
  if hr.capability(v_uid, 'identity.write', null, current_date, p_org) then
    return null;
  elsif coalesce(hr._l1_org_role(v_uid, p_org, false) in ('owner','admin'), false) then
    return null;
  end if;
  v_audit := hr._record_access_audit(
    p_organization_id => p_org, p_action => 'denied', p_target_token => p_token,
    p_purpose => 'settings', p_basis => 'refused', p_granted => false,
    p_row_count => 0, p_sensitivity_tier => 'internal',
    p_denial_reason => 'not_hr_admin');
  return jsonb_build_object('ok', false, 'reason', 'forbidden',
    'detail', 'HR settings are HR-admin only.', 'audit_id', v_audit);
end
$function$

;
