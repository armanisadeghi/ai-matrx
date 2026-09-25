-- chair-step: the INVERSE of storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads.sql.
--   It puts back the two bodies that file replaced, byte-for-byte as production carried them on
--   2026-09-24 (iam.may_touch_field 583b23dd…, custom.hidden_field_notice 186b6fda…), drops the
--   two triggers it added, then the functions it added. It rewrites no row: a column the repair
--   raised stays at the word it was raised to (lowering a sensitivity is never automatic).
-- lock: custom,iam
-- lane: STORE-LEAK-FORMULA

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION iam.may_touch_field(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sensitivity text;
  v_required    public.permission_level;
  v_granted     public.permission_level;
begin
  if p_field_id is null then return true; end if;

  select f.data ->> 'sensitivity'
    into v_sensitivity
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if not found then
    -- A field nobody declared is not a field this store will hand out.
    return false;
  end if;

  -- PORTAL (2026-09-20) — AN OUTSIDER'S FIELDS ARE THE ONES HER PORTAL DECLARED, AND THIS
  -- NARROWS ONLY. A portal says which fields a client sees and which she may change; the
  -- answer belongs here, in the one question the platform already asks about a field, so a
  -- portal screen and an edit through `custom.record_update` cannot disagree and neither of
  -- them needs to know a portal exists.
  --
  -- The first test is one index probe on `custom.portal_principal (user_id, organization_id)`
  -- and finds nothing for every member of every organization, which is the whole platform
  -- except the handful of people a portal named. A person who is BOTH a member here and a
  -- portal principal here is a member: the portal is for outsiders, and narrowing a colleague
  -- because somebody put their address in a client row would be a new way to lose access.
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and exists (select 1 from custom.portal_principal pp
                  where pp.user_id = p_user_id
                    and pp.organization_id = p_organization_id
                    and pp.is_active)
     and not iam.has_org_access_for(p_user_id, p_organization_id) then
    if not exists (
      select 1
        from custom.portal_table pt
        join custom.portal p on p.id = pt.portal_id and p.is_active
        join custom.portal_principal pp on pp.portal_id = p.id
       where pt.organization_id = p_organization_id
         and pp.user_id = p_user_id
         and pp.is_active
         and case when p_action = 'read'
                  then p_field_id = any (pt.visible_field_ids)
                  else p_field_id = any (pt.editable_field_ids)
             end) then
      return false;
    end if;
  end if;

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end $function$

;

CREATE OR REPLACE FUNCTION custom.hidden_field_notice(p_field custom.record, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'reason', p_field.data ->> 'sensitivity',
    'needs',  iam.level_label('record',
                iam.field_sensitivity_level(p_field.data ->> 'sensitivity', p_action,
                                            p_field.organization_id)),
    'or',     'a share of this one field with you');
$function$

;

delete from platform.client_callable_door
 where declared_by = 'STORE-LEAK-FORMULA'
   and (schema_name, function_name) in (('custom', 'field_inputs_of'), ('custom', 'field_input_closure'),
                                        ('custom', 'field_sensitivity_floor'), ('iam', 'may_touch_field_itself'));
drop trigger if exists custom_record_field_sensitivity_reaches_its_readers on custom.record;
drop trigger if exists custom_record_field_reads_what_it_reads on custom.record;
drop function if exists custom._field_sensitivity_reaches_its_readers();
drop function if exists custom._field_reads_what_it_reads();
drop function if exists iam.may_touch_field_itself(uuid, uuid, uuid, permission_level, text);
drop function if exists custom.field_sensitivity_floor(uuid, jsonb, uuid);
drop function if exists custom.field_input_closure(uuid, jsonb, uuid);
drop function if exists custom.field_inputs_of(uuid, jsonb);
drop function if exists custom.sensitivity_rank(text);
