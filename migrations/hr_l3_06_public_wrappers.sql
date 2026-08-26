-- HR domain L3 — migration 6 of 9 (register item HRB-015, lane L3 punch + kiosk).
--
-- The five `public.hr_*` wrappers a browser actually calls, and the grant contract around them.
--
-- Authority: FREEZE §4 D-10; R-L3-READINESS U-03; SPEC-CONTRACTS §2.2; SPEC-ACCESS §6.3.
-- Applied live as `hr_l3_06_public_wrappers`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 TD-1 — THE `hr` SCHEMA IS NOT EXPOSED TO PostgREST, SO EVERY CLIENT RPC NEEDS A `public`
--    DOOR. Verified live against `pgrst.db_schemas` on the `authenticator` role: `hr` is not in the
--    list. A browser therefore cannot call `.rpc('hr.punch_record')` and cannot use
--    `supabase.schema('hr')`. Adding a schema to that list replaces the whole value and a dropped
--    name is an instant platform-wide PGRST002 outage, so it is a fleet-wide config change and
--    explicitly NOT a build lane's call (FREEZE §4 D-10). The resolution is the pattern the
--    platform already ships — `hr_kiosk_authenticate`, `hr_confidential_get` — and exactly what
--    R-L3 U-03 ruled: `hr.<name>` in SQL, `hr_<name>` at the client call site.
--
-- 2. THE WRAPPER CONTAINS NO LOGIC. Argument pass-through only, `language sql`, one statement. A
--    wrapper that validates, defaults, or reshapes anything becomes a second contract that drifts
--    from the body it fronts, and then two surfaces disagree about what the RPC does. The bodies in
--    `hr` hold every rule; these five hold none.
--
-- 3. 🚨 THE FIVE ARE `authenticated`-ONLY AND `anon` GETS NOTHING. Every one resolves its caller
--    through `auth.uid()`. An `anon` caller has no identity, so granting it EXECUTE would buy
--    nothing except a larger attack surface on the only sanctioned writer of `hr.punch`. This is
--    the deliberate asymmetry with the kiosk lane, where the token IS the authorization and `anon`
--    EXECUTE is required (SPEC-ACCESS §6.3) — two different answers because they are two different
--    authentication models, not an inconsistency.
--
-- 4. THE GRANT CONTRACT IS ASSERTED AT INSTALL TIME, IN THIS FILE. The trailing DO block refuses to
--    let the migration succeed unless all five exist, are SECURITY DEFINER, are executable by
--    `authenticated`, and are NOT executable by `anon` — and unless the two kiosk doors ARE
--    reachable by `anon`. A grant that silently failed to apply is otherwise invisible until a
--    surface 403s in production. `hr.punch_write_path_conformance()` (file 07) re-checks the same
--    property continuously.
-- ===================================================================================

create or replace function public.hr_punch_record(
  p_employment_id   uuid,
  p_kind            text,
  p_occurred_at     timestamptz,
  p_source          text,
  p_idempotency_key text,
  p_kiosk_session_id uuid    default null,
  p_geo             jsonb    default null,
  p_photo_file_id   uuid     default null,
  p_attestation     jsonb    default null)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.punch_record(p_employment_id, p_kind, p_occurred_at, p_source, p_idempotency_key,
                         p_kiosk_session_id, p_geo, p_photo_file_id, p_attestation);
$$;

create or replace function public.hr_clock_state(p_employment_id uuid)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.clock_state(p_employment_id);
$$;

create or replace function public.hr_punch_correct(
  p_punch_ids uuid[], p_new_values jsonb, p_reason text)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.punch_correct(p_punch_ids, p_new_values, p_reason);
$$;

create or replace function public.hr_punch_void(p_punch_id uuid, p_reason text)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.punch_void(p_punch_id, p_reason);
$$;

create or replace function public.hr_punch_register(
  p_filters jsonb default '{}'::jsonb, p_page jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $$
  select hr.punch_register(p_filters, p_page);
$$;

comment on function public.hr_punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) is
  'TD-1 wrapper: delegates to hr.punch_record. No logic. authenticated only.';
comment on function public.hr_clock_state(uuid) is
  'TD-1 wrapper: delegates to hr.clock_state. No logic. authenticated only.';
comment on function public.hr_punch_correct(uuid[], jsonb, text) is
  'TD-1 wrapper: delegates to hr.punch_correct. No logic. authenticated only.';
comment on function public.hr_punch_void(uuid, text) is
  'TD-1 wrapper: delegates to hr.punch_void. No logic. authenticated only.';
comment on function public.hr_punch_register(jsonb, jsonb) is
  'TD-1 wrapper: delegates to hr.punch_register. No logic. authenticated only.';

-- 🚨 decision 3: authenticated ONLY. anon gets nothing.
revoke all on function public.hr_punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) from public, anon;
revoke all on function public.hr_clock_state(uuid) from public, anon;
revoke all on function public.hr_punch_correct(uuid[], jsonb, text) from public, anon;
revoke all on function public.hr_punch_void(uuid, text) from public, anon;
revoke all on function public.hr_punch_register(jsonb, jsonb) from public, anon;

grant execute on function public.hr_punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) to authenticated;
grant execute on function public.hr_clock_state(uuid) to authenticated;
grant execute on function public.hr_punch_correct(uuid[], jsonb, text) to authenticated;
grant execute on function public.hr_punch_void(uuid, text) to authenticated;
grant execute on function public.hr_punch_register(jsonb, jsonb) to authenticated;

-- And the hr.* bodies stay unreachable from a client role directly.
revoke all on function hr.punch_record(uuid, text, timestamptz, text, text, uuid, jsonb, uuid, jsonb) from anon;
revoke all on function hr.clock_state(uuid) from anon;
revoke all on function hr.punch_correct(uuid[], jsonb, text) from anon;
revoke all on function hr.punch_void(uuid, text) from anon;
revoke all on function hr.punch_register(jsonb, jsonb) from anon;

-- decision 4: the contract is asserted here, not assumed
do $$
declare
  bad text;
begin
  select string_agg(f || ' (' || why || ')', '; ') into bad
    from (
      select f,
             case
               when to_regprocedure(f) is null then 'missing'
               when not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then 'not security definer'
               when not has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE') then 'authenticated cannot execute'
               when has_function_privilege('anon', to_regprocedure(f), 'EXECUTE') then 'anon CAN execute'
             end as why
        from unnest(array[
          'public.hr_punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)',
          'public.hr_clock_state(uuid)',
          'public.hr_punch_correct(uuid[],jsonb,text)',
          'public.hr_punch_void(uuid,text)',
          'public.hr_punch_register(jsonb,jsonb)']) f) z
   where why is not null;
  if bad is not null then
    raise exception 'hr_l3_06: wrapper contract violated: %', bad;
  end if;

  select string_agg(f, ', ') into bad
    from unnest(array[
      'public.hr_kiosk_claim_pairing(text,text)',
      'public.hr_kiosk_punch(text,text,text,timestamptz,text,uuid,jsonb,jsonb)']) f
   where to_regprocedure(f) is null
      or not has_function_privilege('anon', to_regprocedure(f), 'EXECUTE');
  if bad is not null then
    raise exception 'hr_l3_06: kiosk door not reachable by anon: %', bad;
  end if;
end $$;
