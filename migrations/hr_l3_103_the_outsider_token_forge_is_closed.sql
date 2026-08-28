-- hr_l3_103 — P0. A cross-tenant token FORGE, and an in-tenant one, both reachable by any user.
--
-- THE VULNERABILITY, PROVEN LIVE THROUGH POSTGREST BEFORE THIS RAN
--   `platform` IS in `pgrst.db_schemas`, so its RPCs and tables answer over PostgREST. The
--   outsider-token primitives shipped reachable by `authenticated`, and grant-revocation was never
--   swept in this schema. Measured with a REAL non-member authenticated JWT (Zzz Punchemployee — a
--   member of ONE sandbox org, no HR role anywhere), no code change:
--
--   P0-1  CROSS-TENANT FORGE.  POST /rest/v1/rpc/mint_outsider_token (Content-Profile: platform)
--         -> HTTP 200. A live `hr.investigation_external` secret (the most-privileged purpose:
--         hr_incident_party + hr_restricted_note) minted INTO A FOREIGN TENANT, with an
--         attacker-chosen incident id, an attacker recipient, and verification_factor overridden to
--         `none`. `mint_outsider_token` is SECURITY DEFINER and its FIRST act is the consumer lookup
--         — there is NO caller-authorization gate — and because the definer bypasses RLS the mint is
--         cross-tenant. `revoke_outsider_token` / `reanchor_outsider_token` are the same shape (P1:
--         cross-org session DoS).
--
--   P0-2  IN-TENANT FORGE.  `authenticated` held INSERT/UPDATE/DELETE on `platform.actor_token`.
--         POST /rest/v1/actor_token with an attacker-chosen token_hash, verification_factor='none'
--         and a far-future expiry, into the caller's OWN org -> HTTP 201. The table's RLS INSERT
--         policy permits a member to write their own org, so RLS was never the barrier it looked
--         like — a forged, fully-privileged token, direct.
--
--   Three tokens were forged by the proof; all three were neutralised (is_active=false, revoked) the
--   moment each was confirmed, before this migration.
--
-- WHY REVOKING FROM authenticated BREAKS NOTHING
--   Every legitimate mint goes through a SECURITY DEFINER wrapper — `public.esign_mint_signer_token`,
--   `public.hr_mint_investigation_token`, `public.hr_mint_records_request_token`,
--   `public.anonymous_report_open`, `esign._maybe_complete` — each of which calls
--   `platform.mint_outsider_token` AS THE OWNER, independent of any `authenticated` grant. And EVERY
--   writer of `platform.actor_token` is likewise a DEFINER function (the outsider_* session lane),
--   reaching the table as owner. No frontend code calls the mint or writes the table directly
--   (grep: zero rpc/insert call sites). So `authenticated` has no legitimate reason to hold either
--   the EXECUTE or the DML, and removing both leaves every real path untouched.
--
-- Applied live as `hr_l3_103_the_outsider_token_forge_is_closed`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · REVOKE FROM PUBLIC, anon AND authenticated on all three functions (hr_l3_93's law). The three
--     already show anon=false with a materialised ACL, but writing all three revokes every time
--     removes the need to be right about each one's ACL state.
--   · REVOKE INSERT, UPDATE, DELETE (NOT SELECT) ON platform.actor_token FROM authenticated. SELECT
--     is left: RLS already scopes reads to the caller's own rows, and a legitimate surface may read
--     its own tokens. Only the WRITE grants are the forge; the DEFINER session lane writes as owner.
--   · service_role KEEPS both. It is a server role, not client-reachable; a server path may call
--     over PostgREST with the secret key. postgres (owner) needs no grant.
--   · THE MINT IS NOT GIVEN AN INTERNAL AUTHZ GATE HERE. Adding a caller check to a platform
--     primitive that five DEFINER wrappers depend on is a behaviour change to another schema's
--     contract and needs that owner's proof; closing the client-reachable door is the P0. The
--     missing gate is REPORTED, not rewritten under a security revoke.

do $mig$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'platform'
       and p.proname in ('mint_outsider_token','revoke_outsider_token','reanchor_outsider_token')
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;

  revoke insert, update, delete on platform.actor_token from public;
  revoke insert, update, delete on platform.actor_token from anon;
  revoke insert, update, delete on platform.actor_token from authenticated;
  grant  insert, update, delete on platform.actor_token to service_role;
end
$mig$;

-- ── FALSIFICATION, in the database ───────────────────────────────────────────────────────────────
do $verify$
declare s text; bad text := '';
begin
  foreach s in array array[
    'platform.mint_outsider_token(text,text,uuid,jsonb,uuid,jsonb,jsonb)',
    'platform.revoke_outsider_token(uuid,text)',
    'platform.reanchor_outsider_token(uuid)'
  ] loop
    if has_function_privilege('anon', s, 'EXECUTE') then bad := bad || s || ' anon-exec; '; end if;
    if has_function_privilege('authenticated', s, 'EXECUTE') then bad := bad || s || ' authenticated-exec; '; end if;
    if not has_function_privilege('service_role', s, 'EXECUTE') then bad := bad || s || ' lost service_role; '; end if;
    if not has_function_privilege('postgres', s, 'EXECUTE') then bad := bad || s || ' lost owner; '; end if;
  end loop;
  foreach s in array array['INSERT','UPDATE','DELETE'] loop
    if has_table_privilege('authenticated', 'platform.actor_token', s) then
      bad := bad || 'authenticated still has ' || s || ' on actor_token; ';
    end if;
    if not has_table_privilege('service_role', 'platform.actor_token', s) then
      bad := bad || 'service_role lost ' || s || ' on actor_token; ';
    end if;
  end loop;
  -- SELECT must remain for authenticated (RLS scopes it); the DEFINER session lane still writes.
  if not has_table_privilege('authenticated', 'platform.actor_token', 'SELECT') then
    bad := bad || 'authenticated lost SELECT on actor_token (RLS-scoped read); ';
  end if;
  if bad <> '' then
    raise exception 'hr_l3_103: %', bad;
  end if;
end
$verify$;

-- ── CONTRACT ROWS — the class must not reopen a THIRD schema over ─────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('platform', 'mint_outsider_token', 'hr_l3_103_the_outsider_token_forge_is_closed',
   array[]::text[], array[]::text[],
   'P0 CROSS-TENANT FORGE: PostgREST-exposed SECURITY DEFINER outsider-token mint with NO caller '
   || 'gate (first act is the consumer lookup) and EXECUTE to authenticated. A non-member of the '
   || 'target org minted a live hr.investigation_external secret into a foreign tenant with '
   || 'verification_factor=none. Only the DEFINER mint-wrappers (esign_mint_signer_token, '
   || 'hr_mint_investigation_token, hr_mint_records_request_token, anonymous_report_open) may reach '
   || 'it, as owner. Client roles anon/authenticated must NEVER hold EXECUTE.',
   true, true, false),
  ('platform', 'revoke_outsider_token', 'hr_l3_103_the_outsider_token_forge_is_closed',
   array[]::text[], array[]::text[],
   'P1 cross-org session DoS: same DEFINER/authenticated/no-gate shape as mint_outsider_token. '
   || 'Client roles must never hold EXECUTE; the session lane reaches it as owner.',
   true, true, false),
  ('platform', 'reanchor_outsider_token', 'hr_l3_103_the_outsider_token_forge_is_closed',
   array[]::text[], array[]::text[],
   'P1 cross-org session DoS: same shape. Client roles must never hold EXECUTE.',
   true, true, false)
on conflict do nothing;
