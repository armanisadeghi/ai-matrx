-- lane: access-ladder T-27
--
-- The pre-launch complimentary-plan signup trigger (billing.seed_prelaunch_complimentary,
-- billing_prelaunch_complimentary_pro.sql, Arman 2026-08-16) catches its own errors and only
-- `raise warning`s. A WARNING is invisible outside a live session log: a failed grant leaves a
-- new person signed up with no Pro and NOTHING records it anywhere the platform's error surfaces
-- can see. Law: "Nothing fails silently. Every stand-in, fallback, and automatic intervention
-- announces itself with a remedy."
--
-- Fix, purely additive to the trigger's contract (signup must still succeed on a grant failure):
--   1. The two grant inserts move into a new idempotent function,
--      billing.repair_prelaunch_complimentary_grant(uuid) — the remedy AND the repair path in one:
--      re-running it for a user is always safe (ON CONFLICT DO NOTHING, same as the original).
--   2. billing.seed_prelaunch_complimentary() calls it and, on failure, writes a loud
--      ops.system_error row (source_app 'database', source_feature 'billing' — newly registered
--      in aidream's source_attribution.SOURCE_FEATURES) naming the user, the org (when one
--      resolved), the exact reason, and the exact remedy to run, then still returns new so
--      signup completes.
--
-- Reversible: CREATE OR REPLACE of both functions restores the prior body (billing_prelaunch_
-- complimentary_pro.sql) verbatim for the trigger target; the new repair function can be dropped.
--
-- based-on: billing.seed_prelaunch_complimentary() a0741643b7cbf4db6d2e1e5baa49687c3e2b08eb38bb85463817982366498cc4

-- 1) The idempotent grant body, extracted so it can be re-run as a repair.
create or replace function billing.repair_prelaunch_complimentary_grant(p_user_id uuid)
returns void
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare
  PRELAUNCH_COMPLIMENTARY_TIER      constant billing.tier := 'premium';
  PRELAUNCH_COMPLIMENTARY_USER_PLAN constant text := 'personal-pro';
  PRELAUNCH_COMPLIMENTARY_ORG_PLAN  constant text := 'company-pro';
  PRELAUNCH_COMPLIMENTARY_NOTE      constant text :=
    'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.';
begin
  insert into billing.user_plan (user_id, tier, source, note, plan_id)
  values (p_user_id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
          PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_USER_PLAN)
  on conflict (user_id) do nothing;

  insert into billing.org_plan (organization_id, tier, source, note, plan_id)
  select o.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
         PRELAUNCH_COMPLIMENTARY_NOTE,
         case when o.is_personal then PRELAUNCH_COMPLIMENTARY_USER_PLAN
              else PRELAUNCH_COMPLIMENTARY_ORG_PLAN end
  from iam.organizations o
  where o.created_by = p_user_id
  on conflict (organization_id) do nothing;
end;
$function$;

-- 2) The trigger body: call the repair function; on failure, write a loud, remedied error row
--    and still let signup succeed.
create or replace function billing.seed_prelaunch_complimentary()
returns trigger
language plpgsql security definer
set search_path to 'billing', 'public'
as $function$
declare
  v_org_id uuid;
  v_org_note text;
begin
  perform billing.repair_prelaunch_complimentary_grant(new.id);
  return new;
exception when others then
  -- Loud but never signup-blocking: a missed grant is recoverable, a failed signup is not.
  -- The personal org created earlier in this same insert may or may not have committed by
  -- now (on_auth_user_created fires before this trigger alphabetically); resolve it for the
  -- error row when it exists, note plainly when it does not.
  select o.id into v_org_id from iam.organizations o where o.created_by = new.id limit 1;
  if v_org_id is null then
    v_org_note := 'no organization had resolved for this user at grant time';
  else
    v_org_note := 'organization ' || v_org_id::text;
  end if;

  insert into ops.system_error (
    organization_id, user_id, kind, error_type, error_text, context, source_app, source_feature
  )
  values (
    coalesce(v_org_id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid), -- Matrx System org when no org resolved
    new.id,
    'prelaunch_complimentary_grant_failed',
    sqlstate,
    format(
      'billing.seed_prelaunch_complimentary failed for user %s (%s): %s (%s). Signup succeeded '
      || 'without the pre-launch complimentary Pro grant. Remedy: run '
      || 'select billing.repair_prelaunch_complimentary_grant(%L); to grant it — the function is '
      || 'idempotent and safe to re-run.',
      new.id, v_org_note, sqlerrm, sqlstate, new.id
    ),
    jsonb_build_object(
      'user_id', new.id,
      'organization_id', v_org_id,
      'sqlstate', sqlstate,
      'remedy_function', 'billing.repair_prelaunch_complimentary_grant',
      'remedy_call', format('select billing.repair_prelaunch_complimentary_grant(%L);', new.id)
    ),
    'database',
    'billing'
  );

  return new;
end;
$function$;
