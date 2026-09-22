-- chair-step: SIX REVOKEs. There is no additive spelling of taking a grant back, and the
-- `-- allows: revoke <schema>` exemption cannot cover this file for two reasons at once: it
-- names two schemas (platform and iam), and both are on REVOKE_PROTECTED_SCHEMAS. Every
-- REVOKE below names ONE function by its exact signature and ONE role (authenticated).
-- Nothing else in the file is non-additive: no DROP, no CREATE OR REPLACE, no column change,
-- no data deletion. Each revoked function was proven, live and immediately before this file
-- was written, to be unreachable by any client path — see THE PROOF below, which the file
-- also re-runs as a refusal rather than asking anyone to trust it.
--
-- SERVER-ONLY HELPERS HOLD NO CLIENT GRANT — `check:impl-doors:strict` D16a + D18.
--
-- ════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS WRONG, measured live on db.matrxserver.com 2026-09-22 (lane GATES-2)
-- ════════════════════════════════════════════════════════════════════════════════════
--
-- D16a — TWO door rows declare a client the grant does not:
--
--   platform.link_trigger_is_attached(text, text, text)   signed_in_callers=false, authenticated EXECUTE=true
--   platform.notice_link_trigger_is_attached()            signed_in_callers=false, authenticated EXECUTE=true
--
--   Both register rows already say the true thing in `non_client_lane`: "it exists for the
--   release check scripts/check_links_carry_their_organization.py. A browser has no use for
--   it." The REGISTER is right and the DATABASE is wrong, so the grant goes rather than the
--   sentence. (The other two D16a rows — the link STAMPERS — are the opposite case and are
--   fixed in impldoors_the_link_stamper_is_reached_by_the_person_writing_the_row.sql: they
--   really are reached by a signed-in caller, through an invoker trigger on a table a person
--   writes, so there the sentence goes and the grant stays.)
--
-- D18 — TWO client paths call a function the calling role cannot execute:
--
--   iam.apply_rls                  <- reached by iam.verify_canonical(text,text,text,text) as authenticated
--   iam.supersede_bespoke_policies <- reached by iam.verify_canonical(text,text,text,text) as authenticated
--
--   `iam.verify_canonical` is SECURITY INVOKER and authenticated holds EXECUTE on it, so a
--   signed-in caller who reaches it gets `42501 permission denied for function apply_rls`
--   inside a path that looks like it works. Both closed helpers are DDL emitters and must
--   STAY closed — the guard's own instruction is "keep the helper closed and repair the
--   path". The path here is a grant nobody uses: the canonicalization surface runs this
--   family through `public.execute_admin_query` (SECURITY DEFINER, owned by postgres) from
--   `createAdminClient()`, the release scripts run it over the direct postgres connection,
--   and migrations run it as the ledger owner. None of those is `authenticated`.
--
--   THE FAMILY, NOT THE INSTANCE. Revoking only `verify_canonical` would hand the same
--   finding to its two invoker callers the next time the gate runs, so the closure is
--   revoked in one step: verify_canonical, verify_canonical_ok, canonical_certify,
--   canonical_certify_ok. After this file nothing `authenticated` can execute calls any of
--   them, which the refusal at the bottom asserts rather than claims.
--
-- WHY THIS IS SAFE, and how it was established rather than assumed:
--   · No trigger anywhere uses any of the six as its `tgfoid` (checked in pg_trigger).
--   · No SECURITY INVOKER function that `authenticated` can execute calls any of them
--     (checked over pg_proc.prosrc, and re-asserted below AFTER the revokes).
--   · `platform` has no `pg_default_acl` entry, so nothing hands the grant back at the next
--     CREATE OR REPLACE. Neither does `iam`.

revoke execute on function platform.link_trigger_is_attached(text, text, text) from authenticated;
revoke execute on function platform.notice_link_trigger_is_attached() from authenticated;

revoke execute on function iam.verify_canonical(text, text, text, text) from authenticated;
revoke execute on function iam.verify_canonical_ok(text, text, text, text) from authenticated;
revoke execute on function iam.canonical_certify(text, text, text) from authenticated;
revoke execute on function iam.canonical_certify_ok(text, text, text) from authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════
-- THE FILE PROVES ITSELF. Not "should be closed" -- closed, or it does not commit.
-- ════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_open   text;
  v_reach  text;
  v_names  text[] := array[
    'platform.link_trigger_is_attached(text, text, text)',
    'platform.notice_link_trigger_is_attached()',
    'iam.verify_canonical(text, text, text, text)',
    'iam.verify_canonical_ok(text, text, text, text)',
    'iam.canonical_certify(text, text, text)',
    'iam.canonical_certify_ok(text, text, text)'
  ];
begin
  select string_agg(s, ', ') into v_open
    from unnest(v_names) s
   where has_function_privilege('authenticated', s::regprocedure, 'execute');
  if v_open is not null then
    raise exception 'impldoors: authenticated still holds EXECUTE on %', v_open;
  end if;

  -- And nothing a signed-in caller CAN run still calls one of them, which is the only way
  -- a revoke turns into a 42501 in somebody's working path.
  select string_agg(distinct n.nspname || '.' || p.proname, ', ') into v_reach
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where not p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('link_trigger_is_attached', 'notice_link_trigger_is_attached',
                           'verify_canonical', 'verify_canonical_ok',
                           'canonical_certify', 'canonical_certify_ok')
     and p.prosrc ~ '[^a-z_](link_trigger_is_attached|notice_link_trigger_is_attached|verify_canonical|verify_canonical_ok|canonical_certify|canonical_certify_ok)\s*\(';
  if v_reach is not null then
    raise exception 'impldoors: these client-executable invoker function(s) still reach a now-closed helper: %', v_reach;
  end if;

  raise notice 'impldoors: 6 server-only helpers hold no authenticated grant, and no client-executable invoker body reaches one';
end $$;
