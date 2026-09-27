-- lane: access-ladder T-27
--
-- The pre-launch complimentary-plan signup trigger (billing.seed_prelaunch_complimentary,
-- last replaced by access_ladder_t3_signup_org_and_complimentary_pro.sql) catches its own errors
-- and only `raise warning`s. A WARNING is invisible outside a live session log: a failed grant
-- leaves a new person signed up with no Pro and NOTHING records it anywhere the platform's error
-- surfaces can see. Law: "Nothing fails silently. Every stand-in, fallback, and automatic
-- intervention announces itself with a remedy."
--
-- Fix, purely additive to the trigger's contract (signup must still succeed on a grant failure):
--   1. The two grant inserts move into a new idempotent function,
--      billing.repair_prelaunch_complimentary_grant(uuid) — the remedy AND the repair path in one:
--      re-running it for a user is always safe (ON CONFLICT DO NOTHING, same as today). It carries
--      the same actor-context bracketing the trigger already used, so it satisfies the same
--      confirmation-write rule the trigger's inserts do.
--   2. billing.seed_prelaunch_complimentary() calls it and, on failure, writes a loud
--      ops.system_error row (source_app 'database', source_feature 'billing' — newly registered in
--      aidream's source_attribution.SOURCE_FEATURES) naming the user, the org (when one resolved),
--      the exact reason, and the exact remedy to run, then still returns new so signup completes.
--   3. Nothing else about the body changes: same actor-context save/restore, same
--      <<provisioning_body>> label/EXIT shape access_ladder_t3_signup_org_and_complimentary_pro.sql
--      left it in, same plan_id choice (organizations are equal — no org-type branch, T-3).
--
-- Reversible: CREATE OR REPLACE of both functions restores the prior trigger body verbatim; the
-- new repair function can be dropped.
--
-- based-on: billing.seed_prelaunch_complimentary() a0741643b7cbf4db6d2e1e5baa49687c3e2b08eb38bb85463817982366498cc4

-- 1) The idempotent grant body, extracted so it can be re-run as a repair. Same actor-context
--    bracketing the trigger uses, so a manual re-run satisfies the same confirmation-write rule.
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
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
begin
  perform set_config('app.actor_tier', 'code', true);
  perform set_config('app.actor_system', 'auth.user_provisioning', true);
  perform set_config('app.actor_agent', '', true);

  insert into billing.user_plan (user_id, tier, source, note, plan_id)
  values (p_user_id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
          PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_USER_PLAN)
  on conflict (user_id) do nothing;

  -- Every organization is equal (access ladder, 2026-09-26): the person carries the person plan
  -- above, the organization carries the organization plan, and no organization type chooses
  -- between them.
  insert into billing.org_plan (organization_id, tier, source, note, plan_id)
  select o.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
         PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_ORG_PLAN
  from iam.organizations o
  where o.created_by = p_user_id
  on conflict (organization_id) do nothing;

  perform set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  perform set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  perform set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
end;
$function$;

-- Declared access decision (provision_shape_guard): server/repair-only, never a client door.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values (
  'billing', 'repair_prelaunch_complimentary_grant', 'p_user_id uuid',
  array['uuid'::regtype]::oid[],
  'p_user_id is the account whose pre-launch complimentary grant is (re)written; it is checked '||
  'against nothing beyond auth.users existing (the FK on billing.user_plan) because the only '||
  'callers are the signup trigger for itself and a human operator repairing a row named in an '||
  'ops.system_error remedy — never a value a client supplies about another account.',
  'access_ladder_t27_prelaunch_grant_failure_is_loud',
  'server_only: called by billing.seed_prelaunch_complimentary (the signup trigger, for new.id) '||
  'and, as a manual repair, only by a person with database access running the exact remedy an '||
  'ops.system_error row names. EXECUTE is never granted to anon or authenticated.',
  false, false
);

-- 2) The trigger body: call the repair function; on failure, write a loud, remedied error row
--    and still let signup succeed. Everything outside the exception branch is byte-identical to
--    the live body (actor-context bracketing, <<provisioning_body>> label/EXIT shape).
CREATE OR REPLACE FUNCTION billing.seed_prelaunch_complimentary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
AS $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
  v_org_id uuid;
  v_org_note text;
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

begin
  perform billing.repair_prelaunch_complimentary_grant(new.id);
  EXIT provisioning_body;
exception when others then
  -- Loud but never signup-blocking: a missed grant is recoverable, a failed
  -- signup is not.
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

  raise warning 'seed_prelaunch_complimentary failed for user %: % (%) — recorded in ops.system_error, remedy: billing.repair_prelaunch_complimentary_grant(%)',
    new.id, sqlerrm, sqlstate, new.id;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$
;
