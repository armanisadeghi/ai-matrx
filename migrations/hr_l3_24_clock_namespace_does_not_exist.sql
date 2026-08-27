-- HR domain L3 — migration 24 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 THE SECOND HALF OF N1: `hr.clock` IS NOT A REAL FEATURE NAMESPACE, AND THIS LANE INVENTED IT.
--
-- hr_l3_22 connected the read path to the org rung and the ladder became correct — but the kiosk
-- gate still resolved to the caller default. Measured after that fix:
--     org 5dc930e9 override=NULL resolver=false ; org 2643e470 override=NULL resolver=TRUE
-- Same platform row, same NULL override, different answers — impossible for one ladder, and the
-- thread worth pulling.
--
-- THE EVIDENCE:
--   * `platform.feature_knob` contains ZERO rows for feature `hr.clock`.
--   * It DOES contain `hr.time_and_attendance.kiosk_enabled` (default **false**) and
--     `hr.time_and_attendance.web_punch_enabled` (default true).
--   * The real organization's override is at
--     `settings -> 'hr' -> 'time_and_attendance' -> 'kiosk_enabled' = true`.
-- `hr_knob_set` derives its slug as `split_part(feature,'.',2)`, so the settings UI writes wherever
-- the key is REGISTERED, and both availability switches are registered under
-- `hr.time_and_attendance`. SPEC-TIME §13 / SPEC-UI-IA §10 write them as `hr.clock.*`; the register
-- is what the writer and the settings screen both obey.
--
-- So `hr._clock_knob`, created by this lane in hr_l3_01 reading feature `'hr.clock'`, was querying a
-- namespace with no rows in it. Every lookup fell past an empty platform rung to the caller's
-- literal — which is why `kiosk_enabled` never resolved, and why SEEDING `hr.clock` would have been
-- the wrong fix: it would create a second registered home for a key that already has one.
-- **AMENDMENT OWED: SPEC-TIME §13 / SPEC-UI-IA §10 — the availability switches are
-- `hr.time_and_attendance.{kiosk_enabled,web_punch_enabled}`, not `hr.clock.*`.**
--
-- 🚨 CONCURRENT EDIT, MERGED NOT STOMPED. Another lane replaced `hr._clock_knob` with a hand-rolled
-- plpgsql ladder on the `time_and_attendance` slug — the same conclusion reached independently, and
-- its BEHAVIOUR is correct. But it is a second implementation of the ladder `hr._hr_knob` exists to
-- be the only copy of, and two ladders drift on the first change to either. This preserves that
-- behaviour and its exact signature (including both parameter defaults, so no call site breaks) and
-- collapses it onto the shared resolver. Only the number of implementations changes.
--
-- Applied live as `hr_l3_24_clock_namespace_does_not_exist`. Idempotent.

create or replace function hr._clock_knob(
  p_key text, p_default jsonb default 'null'::jsonb, p_organization_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  -- `hr.clock` has no rows in platform.feature_knob; both availability switches are registered
  -- under `hr.time_and_attendance`, which is also where hr_knob_set writes their org overrides.
  select hr._hr_knob('hr.time_and_attendance', p_key, p_organization_id, p_default);
$$;

comment on function hr._clock_knob(text, jsonb, uuid) is
  'Availability switches (kiosk_enabled, web_punch_enabled). Resolves under hr.time_and_attendance - the feature they are actually REGISTERED under - through the shared hr._hr_knob ladder. hr.clock has zero rows in platform.feature_knob; amendment owed on SPEC-TIME 13 / SPEC-UI-IA 10.';

do $outer$
declare
  v_def text;
  v_anchor constant text :=
'  ---------------------------------------------------------------- 9. the writer is a hardened definer';
  v_block constant text :=
'  ---------------------------------------------------------------- 14. no knob reader queries an empty namespace
  check_key := ''knob_readers_use_registered_features'';
  select coalesce(jsonb_agg(jsonb_build_object(''feature'', feat, ''registered_keys'', n) order by feat), ''[]''::jsonb)
    into v_bad
    from (
      select f.feat,
             (select count(*) from platform.feature_knob k where k.feature = f.feat) as n
        from (select distinct (regexp_matches(pg_get_functiondef(p.oid),
                                 ''hr\._hr_knob\(''''([a-z_.]+)'''''', ''g''))[1] as feat
                from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
               where p.prokind = ''f'' and n2.nspname in (''hr'',''public'')) f
    ) z
   where n = 0;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''empty_namespaces'', v_bad,
                ''why'', ''A knob reader pointed at a feature with no rows in platform.feature_knob ''
                    || ''silently falls past the platform rung to its caller default, in EVERY ''
                    || ''organization, and no admin action can change it. That was G2 finding N1: ''
                    || ''hr._clock_knob read `hr.clock`, which has zero registered keys, while the ''
                    || ''switches live under hr.time_and_attendance. The failure is invisible ''
                    || ''because a default is a plausible value.'');
  return next;

  ---------------------------------------------------------------- 9. the writer is a hardened definer';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_write_path_conformance()'::regprocedure;
  if position('knob_readers_use_registered_features' in v_def) > 0 then
    raise notice 'hr_l3_24: check 14 already present';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_24: anchor not found';
  end if;
  execute replace(v_def, v_anchor, v_block);
end $outer$;

do $$
declare v_fail text; v_n int; v_probe jsonb;
begin
  if pg_get_functiondef('hr._clock_knob(text,jsonb,uuid)'::regprocedure)
     not like '%hr._hr_knob(''hr.time_and_attendance''%' then
    raise exception 'hr_l3_24: _clock_knob does not use the shared ladder on the registered feature';
  end if;
  v_probe := hr._clock_knob('kiosk_enabled', 'null'::jsonb, null);
  if jsonb_typeof(v_probe) <> 'boolean' then
    raise exception 'hr_l3_24: kiosk_enabled still does not resolve from the register (got %)', v_probe;
  end if;
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n <> 14 then raise exception 'hr_l3_24: expected 14 checks, found %', v_n; end if;
  select string_agg(check_key, ', ') into v_fail
    from hr.punch_write_path_conformance() where not ok;
  if v_fail is not null then
    raise exception 'hr_l3_24: the conformance gate is RED: %', v_fail;
  end if;
end $$;
