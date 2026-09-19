-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
-- based-on: custom.anon_token_revoke(uuid, uuid) 2a3a9ed27f5138867024d6a7bcea3a8de57541ea778ae6023d9a276916ac62b7
--
-- W4-DOOR-RECORD — THE ONE CLIENT DOOR THAT TOOK AN ORGANIZATION AND ASKED NOTHING.
--
-- Found by census, not by report. `custom.doors_not_deciding_the_caller()` (below) names
-- every function in schema `custom` that a signed-in caller may execute, that takes a
-- `p_organization_id uuid`, and whose body decides the caller with none of the six things
-- this store decides callers with. It answered exactly two rows:
--
--   custom.store_is_open(p_organization_id uuid)  — correct, and stays. It answers one
--       boolean, "is the switch on here", and it is the function every other door asks
--       before it decides anything. A door that decided who may ask whether a switch is on
--       would be a circular door.
--   custom.anon_token_revoke(p_organization_id uuid, p_token_id uuid)  — A HOLE.
--
-- MEASURED LIVE, inside a rolled-back transaction on the main database, 2026-09-19: as role
-- `authenticated` carrying test@test.com's real claims, against an organization that person
-- is NOT a member of and with a live anonymous token in it, `custom.anon_token_revoke`
-- returned **true**. A signed-in stranger could switch off any organization's public form
-- links and shared read links, one token at a time, as long as that organization had the
-- store turned on. Its two siblings both decide: `custom.anon_token_issue` and
-- `custom.anon_publish` each require `admin` on the form or record through
-- `iam.has_access_for`. Only the revoke was left open.
--
-- THE FIX is the same predicate every other door in this schema calls, in the same place —
-- first, before it reads or writes anything. The bar is organization membership rather than
-- `admin` on the token's subject, and that is deliberate: revoking removes access, so a
-- member of the organization stopping a link of their own organization is not an escalation,
-- while a stranger doing it is the whole defect. The asymmetry with `anon_token_issue`
-- (which asks for `admin`) is stated here rather than implied: raising revoke to `admin`
-- too is a tightening somebody should make on purpose, not one this file makes in passing.

create or replace function custom.anon_token_revoke(p_organization_id uuid, p_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare v_user uuid := custom.query_principal();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_token_revoke');
  -- The organization wall, which this door never had. REC-29 / T15: a door decides who may
  -- reach an organization before it decides anything else.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.anon_token_revoke');
  -- Revocation is a TIMESTAMP, never a delete: "when was this revoked, and by whom" is the
  -- first question after an incident, and a deleted row answers neither.
  update custom.anon_token
     set revoked_at = now(), revoked_by = v_user
   where organization_id = p_organization_id and id = p_token_id and revoked_at is null;
  return found;
end;
$function$;

-- ── The census, as a function, so the next door cannot be added without the question. ────

create function custom.doors_not_deciding_the_caller()
returns table(function_name text, identity_args text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.proname::text, pg_get_function_identity_arguments(p.oid)
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ 'p_organization_id uuid'
     -- `custom.store_is_open` is the switch resolver every door asks BEFORE it decides
     -- anything, so it cannot itself decide a caller without closing a circle.
     and p.proname <> 'store_is_open'
     and pg_get_functiondef(p.oid) !~* '(assert_client_may_reach|assert_client_may_change|has_access_for|has_visibility|anon_token_verify|visible_record_ids)'
   order by 1;
$function$;

revoke all on function custom.doors_not_deciding_the_caller() from public;
