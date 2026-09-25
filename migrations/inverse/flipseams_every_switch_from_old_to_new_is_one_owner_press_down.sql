-- INVERSE of migrations/campaign/flipseams_every_switch_from_old_to_new_is_one_owner_press.sql (lane FLIP-SEAMS).
-- chair-step: removes the seam catalogue, the press log, the two doors and their door rows, the two helpers, the two knob_write_door rows and the 'cutover_seam' authority kind, and puts platform.knob_write_door_for back byte for byte (sha256 ad71fec6…). REFUSES while any organization has any seam on the new system: press it back first, so no archived table or setting is left without the record of who switched it.
-- based-on: platform.knob_write_door_for(text, uuid) a5cf4311cf19b1f4331406544e735260f4e30c7ad3b5fd1852d58e2f934fcf47

set lock_timeout = '30s';
set statement_timeout = '300s';

do $$
declare v_on text;
begin
  if to_regclass('platform.cutover_seam_press') is null then return; end if;
  select string_agg(distinct x.seam_key || ' in ' || x.organization_id::text, ', ') into v_on
    from (select distinct on (p.seam_key, p.organization_id) p.seam_key, p.organization_id, p.direction
            from platform.cutover_seam_press p where p.outcome = 'done'
           order by p.seam_key, p.organization_id, p.pressed_at desc, p.id) x
   where x.direction = 'new';
  if v_on is not null then
    raise exception 'these switches are on the new system: %; press each back on the organization''s settings page first', v_on
      using errcode = '55000';
  end if;
end $$;

delete from platform.client_callable_door
 where schema_name = 'platform' and function_name in ('cutover_seams', 'cutover_seam_press');

drop function if exists platform.cutover_seam_press(text, uuid, text, text);
drop function if exists platform.cutover_seams(uuid);
drop function if exists platform._cutover_seam_apply(text, uuid, text, uuid, uuid);
drop function if exists platform._cutover_seam_readiness(text, uuid);
drop function if exists platform._cutover_seam_last_done(text, uuid);
drop table if exists platform.cutover_seam_press;
drop function if exists platform._cutover_seam_press_is_append_only();
drop table if exists platform.cutover_seam;

delete from platform.knob_write_door where authority_kind = 'cutover_seam';
alter table platform.knob_write_door drop constraint if exists knob_write_door_authority_kind_check;
alter table platform.knob_write_door add constraint knob_write_door_authority_kind_check
  check (authority_kind = any (array['org_steward'::text, 'hr_settings_gate'::text]));

CREATE OR REPLACE FUNCTION platform.knob_write_door_for(p_key text, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'platform', 'public', 'hr', 'pg_temp'
AS $function$
-- THE ONE PLACE A SURFACE ASKS "which door writes this key, and may I use it".
--
-- Two answers, never one: a screen that knows the door but not the authority
-- either draws a control the door will refuse (a lying control) or hides one the
-- person is entitled to (the DD-221 defect, from the other side). `may_write` is
-- computed with the SAME predicates the real gates use — never re-stated, never
-- guessed from `org_role`.
--
-- It is STABLE and it writes nothing: `hr._l1_settings_gate` files a denial row
-- in `hr.access_audit` when it refuses, and asking "may I" is not knocking.
declare
  v_row platform.knob_write_door;
  v_uid uuid := auth.uid();
  v_may boolean;
  v_detail text;
begin
  if p_key is null or position('.' in p_key) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_key',
      'detail', 'A settings key is written <feature>.<key>, for example hr.employees.adjusted_service_date_rule.');
  end if;

  -- Longest declared prefix wins; the '' row is the default and matches everything.
  select d.* into v_row
    from platform.knob_write_door d
   where p_key like d.feature_prefix || '%'
   order by length(d.feature_prefix) desc
   limit 1;

  if v_row.feature_prefix is null then
    -- Only reachable if the default row was deleted. Say so; never invent a door.
    return jsonb_build_object('ok', false, 'reason', 'no_door_declared',
      'detail', format('No write door is declared for %s, and the default row is missing from platform.knob_write_door, so there is nothing to write it through.', p_key));
  end if;

  if p_organization_id is null then
    v_may := null;
    v_detail := 'No organization was named, so no authority was decided.';
  elsif v_uid is null then
    v_may := false;
    v_detail := 'Nobody is signed in.';
  elsif v_row.authority_kind = 'hr_settings_gate' then
    -- hr._l1_settings_gate's own two admissions, in its own order (DD-206).
    if hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
      v_may := true;
      v_detail := 'You hold HR admin standing in this organization.';
    elsif coalesce(hr._l1_org_role(v_uid, p_organization_id, false) in ('owner', 'admin'), false) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'HR settings are HR-admin only.';
    end if;
  elsif v_row.authority_kind = 'org_steward' then
    -- platform.knob_override_set's own test, for every rung but `user`.
    if public.is_admin() then
      v_may := true;
      v_detail := 'You are a platform admin.';
    elsif exists (select 1 from iam.organization_member m
                   where m.organization_id = p_organization_id
                     and m.user_id = v_uid
                     and m.role in ('owner', 'admin')) then
      v_may := true;
      v_detail := 'You are an owner or admin of this organization.';
    else
      v_may := false;
      v_detail := 'Organization configuration is owner/admin only.';
    end if;
  else
    raise exception 'knob_write_door_for: % declares authority_kind %, which this door does not know how to ask', v_row.feature_prefix, v_row.authority_kind
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'key', p_key,
    'feature_prefix', v_row.feature_prefix,
    'set_door', v_row.set_door,
    'clear_door', v_row.clear_door,
    'authority_kind', v_row.authority_kind,
    'reason', v_row.reason,
    'may_write', v_may,
    'authority_detail', v_detail);
end;
$function$;
