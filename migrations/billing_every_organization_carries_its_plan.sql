-- based-on: billing.repair_prelaunch_complimentary_grant(uuid) f55c2d65808c5cc26782bc948379650d052825475c76e83b4ec52269cb39b023
-- chair-step: REVOKEs client EXECUTE on the two new server-only billing functions it creates (they must never be client-callable), replaces the signup grant's body so it stops writing billing.user_plan, backfills the pre-launch plan onto 220 organizations and attaches one AFTER INSERT trigger to iam.organizations. Lane B-BILLING; ruling relayed by the coordinator 2026-09-29.
-- billing_every_organization_carries_its_plan.sql  (lane B-BILLING, 2026-09-29)
--
-- Step 1 of retiring billing.user_plan (DD-047; ruling relayed by the coordinator 2026-09-29):
-- every organization carries its own pre-launch complimentary plan, so no person's tier depends on a
-- per-person row.
--
-- MEASURED BEFORE: 1,441 org_plan rows, all premium; 220 organizations had none. The pre-launch
-- grant (PRELAUNCH_COMPLIMENTARY, Arman 2026-08-16: "put every current user at the pro plan") only
-- ever reached the organizations a person had created at the moment of signup — an organization
-- created later got nothing, and its members stayed premium only through their personal
-- billing.user_plan row. 29 people would have dropped a tier the moment user_plan retired.
--
-- After this file:
--   * billing.repair_prelaunch_org_plan(org) — the one idempotent grant for one organization, with
--     the same constants the signup grant uses (premium / complimentary / company-pro);
--   * every organization without an org_plan row gets it now (backfill);
--   * every NEW organization gets it on insert (AFTER INSERT trigger on iam.organizations, the same
--     slot shape as zz_store_on_for_a_new_organization). A failure never blocks creating the
--     organization: it is recorded loudly in ops.system_error with the one-line remedy (T-27 shape);
--   * the signup grant stops writing billing.user_plan (it keeps granting the person's
--     organizations, now through the one per-organization function).
-- UN-FLIP AT LAUNCH: grep PRELAUNCH_COMPLIMENTARY — the constants live in repair_prelaunch_org_plan.
-- Locks: billing.org_plan rows; SHARE ROW EXCLUSIVE on iam.organizations for the CREATE TRIGGER only
-- (milliseconds, 2 s lock timeout). No policy, no grant to a client.

create or replace function billing.repair_prelaunch_org_plan(p_org uuid)
returns void
language plpgsql
set search_path to 'billing', 'public'
as $function$
declare
  PRELAUNCH_COMPLIMENTARY_TIER     constant billing.tier := 'premium';
  PRELAUNCH_COMPLIMENTARY_ORG_PLAN constant text := 'company-pro';
  PRELAUNCH_COMPLIMENTARY_NOTE     constant text :=
    'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.';
begin
  if p_org is null then
    raise exception 'billing.repair_prelaunch_org_plan: name the organization to grant' using errcode = '22004';
  end if;
  insert into billing.org_plan (organization_id, tier, source, note, plan_id)
  values (p_org, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary', PRELAUNCH_COMPLIMENTARY_NOTE,
          PRELAUNCH_COMPLIMENTARY_ORG_PLAN)
  on conflict (organization_id) do nothing;
end;
$function$;
revoke all on function billing.repair_prelaunch_org_plan(uuid) from public, anon, authenticated;
comment on function billing.repair_prelaunch_org_plan(uuid) is
  'PRELAUNCH_COMPLIMENTARY: the one idempotent pre-launch plan grant for one organization. Called by the new-organization trigger, the signup grant and the remedy for a failed grant. Server-only.';

create or replace function billing._organization_plan_for_a_new_organization()
returns trigger
language plpgsql
security definer
set search_path to 'billing', 'public'
as $function$
begin
  begin
    perform billing.repair_prelaunch_org_plan(new.id);
  exception when others then
    -- Loud but never blocking: a missed grant is recoverable, a refused organization is not.
    perform ops.record_system_error(jsonb_build_object(
      'organization_id', new.id,
      'user_id', new.created_by,
      'kind', 'prelaunch_complimentary_grant_failed',
      'error_type', sqlstate,
      'error_text', format(
        'The pre-launch complimentary plan was not granted to new organization %s: %s (%s). The '
        || 'organization was created without it. Remedy: select billing.repair_prelaunch_org_plan(%L); '
        || '— idempotent and safe to re-run.', new.id, sqlerrm, sqlstate, new.id),
      'context', jsonb_build_object(
        'organization_id', new.id,
        'remedy_function', 'billing.repair_prelaunch_org_plan',
        'remedy_call', format('select billing.repair_prelaunch_org_plan(%L);', new.id)),
      'source_app', 'database',
      'source_feature', 'billing'));
    raise warning 'pre-launch plan grant failed for organization %: % (%) — recorded in ops.system_error, remedy: billing.repair_prelaunch_org_plan(%)',
      new.id, sqlerrm, sqlstate, new.id;
  end;
  return new;
end;
$function$;
revoke all on function billing._organization_plan_for_a_new_organization() from public, anon, authenticated;

create or replace function billing.repair_prelaunch_complimentary_grant(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
declare
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
  r record;
begin
  perform set_config('app.actor_tier', 'code', true);
  perform set_config('app.actor_system', 'auth.user_provisioning', true);
  perform set_config('app.actor_agent', '', true);

  -- Billing belongs to organizations (DD-047). The person's own plan row (billing.user_plan) is
  -- retired: every organization the person created carries the pre-launch plan, and every
  -- organization created later gets it from its own insert trigger.
  for r in select o.id from iam.organizations o where o.created_by = p_user_id loop
    perform billing.repair_prelaunch_org_plan(r.id);
  end loop;

  perform set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  perform set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  perform set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
end;
$function$;

-- Backfill: every organization without a plan row gets the pre-launch plan now.
do $$
declare r record; n int := 0;
begin
  perform set_config('app.actor_tier', 'code', true);
  perform set_config('app.actor_system', 'billing.prelaunch_backfill', true);
  for r in select o.id from iam.organizations o
            where not exists (select 1 from billing.org_plan p where p.organization_id = o.id) loop
    perform billing.repair_prelaunch_org_plan(r.id);
    n := n + 1;
  end loop;
  raise notice 'pre-launch plan granted to % organization(s) that had none', n;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'iam.organizations'::regclass
                  and tgname = 'zzz_organization_prelaunch_plan') then
    create trigger zzz_organization_prelaunch_plan after insert on iam.organizations
      for each row execute function billing._organization_plan_for_a_new_organization();
  end if;
end $$;

do $$
begin
  if exists (select 1 from iam.organizations o
              where not exists (select 1 from billing.org_plan p where p.organization_id = o.id)) then
    raise exception 'an organization still has no plan row';
  end if;
end $$;
