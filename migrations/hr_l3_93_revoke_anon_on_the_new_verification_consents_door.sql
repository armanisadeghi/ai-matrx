-- hr_l3_93 — anon loses EXECUTE on a new door that carries no credential of its own.
--
-- PURPOSE
--   `public.hr_my_verification_consents()` shipped from the Employees lane with Supabase's default
--   grants intact, which include an explicit `anon=X`. It is SECURITY DEFINER and takes NO
--   arguments — so there is no session token, no device secret and no pairing code in its signature,
--   and nothing about the caller for it to check beyond `auth.uid()`. An anonymous caller reaching a
--   DEFINER function that reads "my" anything is a door standing open onto whatever `auth.uid()`
--   resolves to for a caller who never signed in.
--
-- AUTHORITY
--   Check `client_doors_well_formed` (hr.punch_write_path_conformance, blocking) went red on this
--   door the moment it appeared: "anon CAN execute a door that carries no kiosk credential". That
--   check is the structural rule shipped by hr_l3_70, which replaced a six-name allowlist with the
--   actual property — anon may reach a door ONLY if the door carries `p_session_token`,
--   `p_device_secret` or `p_pairing_code`, because those are the credentials a kiosk presents when
--   there is no JWT. This door carries none, so anon has no business at it.
--
--   Same act, same reason as hr_l3_75, which revoked anon on five new Leave doors from another lane.
--   A door is hardened by whoever finds it open; waiting for its author leaves it open meanwhile.
--
-- Applied live as `hr_l3_93_revoke_anon_on_the_new_verification_consents_door`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · REVOKE FROM PUBLIC AS WELL AS anon, ALWAYS, EVEN THOUGH THE ACL IS MATERIALISED HERE.
--     This door's ACL is already spelled out (`{postgres=X,anon=X,authenticated=X,service_role=X}`),
--     so revoking anon alone would in fact close it. The PUBLIC revoke is kept anyway because the
--     failure it prevents is invisible: on a function whose `proacl` is NULL, every role holds
--     EXECUTE through the implicit PUBLIC grant, and `REVOKE ... FROM anon` there merely
--     MATERIALISES the ACL while changing nothing about reachability. The result reads as
--     partially-repaired and is entirely open. Writing both every time removes the need to be right
--     about which case a given door is in.
--   · `authenticated` KEEPS its grant. The defect is anonymous reach, not the door's existence; this
--     migration hardens it and does not disable it.

do $$
begin
  if to_regprocedure('public.hr_my_verification_consents()') is not null then
    revoke execute on function public.hr_my_verification_consents() from public;
    revoke execute on function public.hr_my_verification_consents() from anon;
  end if;
end $$;

-- FALSIFICATION, both directions, in one read: anon must be shut out and authenticated must not.
do $$
declare v_anon boolean; v_auth boolean;
begin
  select has_function_privilege('anon', 'public.hr_my_verification_consents()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.hr_my_verification_consents()', 'EXECUTE')
    into v_anon, v_auth;
  if v_anon then
    raise exception 'hr_l3_93: anon STILL reaches hr_my_verification_consents()';
  end if;
  if not v_auth then
    raise exception 'hr_l3_93: authenticated LOST hr_my_verification_consents() — over-revoked';
  end if;
end $$;
