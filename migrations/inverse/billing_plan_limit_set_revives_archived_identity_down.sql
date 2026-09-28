-- INVERSE of migrations/billing_plan_limit_set_revives_archived_identity.sql.
-- Restores the exact production body captured before the up migration. This is
-- for clone Rule-27 rehearsal only: it deliberately returns the old behavior
-- where a full-key update does not revive an archived plan limit.
-- based-on: billing.plan_limit_set(text, text, billing.meter_period, bigint) 499df05c6fd0698ad90ffd8b9e7e98c2bb26cb1438df93c97033a6e70c31a5de

set local lock_timeout = '2s';

create or replace function billing.plan_limit_set(
  p_plan_id text,
  p_capability text,
  p_period billing.meter_period,
  p_limit_value bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'billing', 'public'
as $function$
  declare v_row billing.plan_limit%rowtype; v_org uuid;
  begin
    if not public.is_super_admin() then
      raise exception 'billing.plan_limit_set: super-admin only' using errcode = '42501';
    end if;
    select organization_id into v_org from billing.plan where plan_key = p_plan_id;
    if not found then
      raise exception 'billing.plan_limit_set: unknown plan %', p_plan_id using errcode = '22023';
    end if;
    if v_org is null then
      raise exception 'organization_required: plan % carries no organization', p_plan_id using errcode = '23502';
    end if;
    if not exists (select 1 from billing.capability where capability = p_capability) then
      raise exception 'billing.plan_limit_set: unknown capability %', p_capability using errcode = '22023';
    end if;
    if p_limit_value is not null and p_limit_value < 0 then
      raise exception 'billing.plan_limit_set: limit_value may not be negative' using errcode = '22023';
    end if;
    insert into billing.plan_limit as pl (plan_id, capability, period, limit_value, organization_id)
    values (p_plan_id, p_capability, p_period, p_limit_value, v_org)
    on conflict (plan_id, capability, period) do update
      set limit_value = excluded.limit_value, updated_at = now()
    returning * into v_row;
    return to_jsonb(v_row);
  end;
$function$;
