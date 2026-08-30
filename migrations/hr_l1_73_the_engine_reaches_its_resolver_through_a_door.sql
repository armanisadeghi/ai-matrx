-- THE HR TIME ENGINE HAS BEEN DEAD SINCE 2026-08-27 16:44:58Z, AND THIS IS WHY.
--
-- `hr._earning_code_id(uuid, text)` is a SECURITY DEFINER helper whose ACL is
-- `{postgres=X/postgres}`: the definer-grant campaign revoked PUBLIC and no role was ever
-- granted. aidream's time engine calls it SCHEMA-QUALIFIED FROM THE REQUEST CONNECTION —
-- `aidream/services/hr/time/intervals.py` `resolve_earning_code()` — and every HTTP lane of
-- that engine runs inside `acting_as_user(ctx)`, i.e. `SET ROLE authenticated`. So every
-- `POST /hr/time/recompute` (E-11) and `POST /hr/calc/overtime` (E-03) died on
-- `42501 permission denied for function _earning_code_id`, for EVERY employment.
--
-- THE HELPER STAYS UNGRANTED. Internal `hr._*` helpers are not client doors — that is the
-- whole point of the campaign, and granting `authenticated` on the inner function would
-- re-open the class this migration is closing. The engine reaches it through a thin
-- `public.hr_<name>` delegate instead: the same TD-1 / R-L3 U-03 pattern every other
-- client-called HR RPC already uses (`hr` is not exposed to PostgREST, so a door in `public`
-- carrying no logic of its own is the house shape).
--
-- WHY THE RESOLUTION CANNOT SIMPLY MOVE INSIDE THE WRITER. `public.hr_recompute_apply` does
-- accept a bare `earning_code` string and resolve it itself, so the *write* would survive
-- without this door. The engine still cannot wait for it: `load_earning_tiers()` needs the
-- REG/OT/DT code ids AND their multipliers BEFORE the write, because `split_day_by_premium()`
-- cuts each day into its premium tiers and prices each cut (rate = base x multiplier) in
-- Python. A code resolved only inside the writer arrives after the money math has happened.
-- The pre-write resolution is load-bearing, so it needs a reachable door.
--
-- §6d-4 (db-rules FEATURE.md): a genuinely-new SECURITY DEFINER door MUST declare itself in
-- `platform.client_callable_door` in the SAME migration, BEFORE the grant, or the
-- `ddl_command_end` trigger `platform.enforce_definer_client_grants` re-revokes the grant
-- inside the GRANT statement itself and nothing errors. Every readable `hr_*` wrapper is
-- grandfathered and carries no declaration, so this rule cannot be learned by copying them.

-- Declared FIRST, and idempotently: a re-run must not raise on the unique key.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason)
values
  ('public', 'hr_earning_code_id', 'p_organization_id uuid, p_code text',
   'The time engine must resolve REG/OT/DT to hr.earning_code rows BEFORE it writes, because '
   'the premium split prices each tier from the code''s multiplier. Reads one id from the '
   'organization''s own codes or the platform seed org; writes nothing, reveals nothing beyond '
   'whether a pay code is registered. The engine runs as `authenticated` on the HTTP lane.')
on conflict (schema_name, function_name, identity_args) do nothing;

create or replace function public.hr_earning_code_id(
  p_organization_id uuid,
  p_code text
)
returns uuid
language sql
stable
security definer
set search_path to 'hr', 'public'
as $function$
  select hr._earning_code_id(p_organization_id, p_code);
$function$;

comment on function public.hr_earning_code_id(uuid, text) is
  'PostgREST-reachable wrapper for hr._earning_code_id. Thin delegate, no logic (TD-1 / '
  'R-L3 U-03). The inner helper keeps its campaign ACL and is NOT client-callable; this door '
  'is how the time engine resolves an earning code from the request connection. `anon` holds '
  'nothing. Declared in platform.client_callable_door per db-rules §6d-4.';

revoke all on function public.hr_earning_code_id(uuid, text) from public, anon;
grant execute on function public.hr_earning_code_id(uuid, text) to authenticated, service_role;

-- PROOF THE DOOR IS REACHABLE (run after applying; both must be true):
--   select has_function_privilege('authenticated', 'public.hr_earning_code_id(uuid,text)', 'EXECUTE');  -- t
--   select has_function_privilege('authenticated', 'hr._earning_code_id(uuid,text)', 'EXECUTE');        -- f
