-- HR domain L3 — migration 22 (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 G2 RE-RUN FINDING N1: THE KIOSK WAS CLOSED IN EVERY ORGANIZATION, PERMANENTLY, AND NO ADMIN
-- ACTION COULD OPEN IT.
--
-- `hr._clock_knob` and `hr._punch_knob` read ONLY `platform.feature_knob`. The switch an admin flips
-- on /hr/settings/devices goes through `public.hr_knob_set`, which writes the org override to
--     iam.organizations.settings -> 'hr' -> <slug> -> <key>          (slug = split_part(feature,'.',2))
-- and NOTHING in the read path ever looked there. Proven live before touching anything:
--     stored override = true, hr._clock_knob('kiosk_enabled') = false, both before and after.
-- Worse, `hr.clock.kiosk_enabled` is not seeded in `platform.feature_knob` at all, so the resolver
-- fell through to the caller's default of `false` — the deny branch — in every organization on the
-- platform, with no configuration anywhere that could change it. `hr_kiosk_claim_pairing` refused
-- every pairing claim, which closes the one door designed for people who have no login. Its own
-- header names this exact state as the one to avoid; the comment was right and the code was not.
--
-- BLAST RADIUS: not one gate. 23 call sites across 9 functions, every one org-blind — the punch
-- writer, the clock read, the register, the device config, the orphan sweep, the pairing lane.
-- Every org override an admin has ever set on an HR time knob has been silently inert.
--
-- THE FIX IS ONE RESOLVER ON THE REAL LADDER, NOT A SECOND STORAGE.
-- `hr._hr_knob(feature, key, organization_id, default)` walks exactly what `hr_knob_set` writes and
-- `hr_knob_index` displays: org override → `platform.feature_knob.value` → `.default_value` →
-- caller default. The resolution expression is lifted from `hr_knob_index` verbatim so the settings
-- screen and the gate can never disagree about what a knob resolves to.
--
-- 🚨 THE ORG-BLIND TWO-ARGUMENT READERS ARE DROPPED, NOT LEFT AS AN OVERLOAD. Adding a defaulted
-- third parameter creates a NEW function in Postgres rather than replacing the old one, and every
-- existing two-argument call would have kept binding to the org-blind version — the bug would have
-- survived its own fix, silently. The two-arg forms are dropped after the call sites are repointed,
-- so a missed call site fails loudly at "function does not exist" instead of quietly ignoring an
-- organization's configuration. Conformance check 14 pins it.
--
-- Applied live as `hr_l3_22_knob_org_rung_resolver`. Idempotent.

-- ---------------------------------------------------------------------------------
-- 1. THE ONE LADDER
-- ---------------------------------------------------------------------------------
create or replace function hr._hr_knob(
  p_feature text, p_key text, p_organization_id uuid, p_default jsonb)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$
  select coalesce(
    -- rung 1: the organization's override, written by public.hr_knob_set
    case when p_organization_id is null then null
         else (select o.settings #> array['hr', split_part(p_feature,'.',2), p_key]
                 from iam.organizations o where o.id = p_organization_id) end,
    -- rung 2/3: the platform register, exactly as hr_knob_index resolves it
    (select coalesce(k.value, k.default_value) from platform.feature_knob k
      where k.feature = p_feature and k.key = p_key),
    -- rung 4: the caller's documented SPEC-TIME §13 default, for keys not yet seeded
    p_default);
$$;

comment on function hr._hr_knob(text, text, uuid, jsonb) is
  'THE knob ladder for the HR time lane: org override (iam.organizations.settings->hr-><slug>-><key>, what hr_knob_set writes) then platform.feature_knob then the caller default. Lifted from hr_knob_index so the gate and the settings screen cannot disagree.';

-- ---------------------------------------------------------------------------------
-- 2. the two feature-scoped readers, now org-aware
-- ---------------------------------------------------------------------------------
create or replace function hr._clock_knob(p_key text, p_default jsonb, p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$ select hr._hr_knob('hr.clock', p_key, p_organization_id, p_default); $$;

create or replace function hr._punch_knob(p_key text, p_default jsonb, p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'hr', 'public'
as $$ select hr._hr_knob('hr.time_and_attendance', p_key, p_organization_id, p_default); $$;

-- ---------------------------------------------------------------------------------
-- 3. repoint all 23 call sites, each with the organization already in its own scope
-- ---------------------------------------------------------------------------------
do $outer$
declare
  t record;
  v_def text;
  v_new text;
  v_n   int := 0;
begin
  for t in
    select * from (values
      ('hr._kiosk_device_config(uuid)',                                              'd.organization_id'),
      ('hr._punch_auto_close_orphan(uuid)',                                          'v_org'),
      ('hr._punch_orphan_threshold_hours(uuid,jsonb)',                               'p_organization_id'),
      ('hr.clock_state(uuid)',                                                       'v_em.organization_id'),
      ('hr.kiosk_pairing_code_create(uuid,text,uuid,uuid)',                          'p_organization_id'),
      ('hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)',     'v_org'),
      ('hr.punch_register(jsonb,jsonb)',
       'coalesce(v_org, (select em.organization_id from hr.employment em where em.id = any(v_emp_ids) limit 1))'),
      ('public.hr_kiosk_claim_pairing(text,text)',                                   'd.organization_id'),
      ('public.hr_kiosk_punch(text,text,text,timestamptz,text,uuid,jsonb,jsonb)',    's.organization_id')
    ) x(sig, org_expr)
  loop
    v_def := pg_get_functiondef(t.sig::regprocedure);

    -- already repointed? (idempotent re-run)
    if v_def like '%_knob(%' || t.org_expr || ')%' then
      continue;
    end if;

    -- No knob argument contains a ')', so [^)]+ cannot run past the call.
    v_new := regexp_replace(v_def,
               'hr\._punch_knob\(([^)]+)\)',
               'hr._punch_knob(\1, ' || t.org_expr || ')', 'g');
    v_new := regexp_replace(v_new,
               'hr\._clock_knob\(([^)]+)\)',
               'hr._clock_knob(\1, ' || t.org_expr || ')', 'g');

    if v_new = v_def then
      raise exception 'hr_l3_22: no knob call was rewritten in %', t.sig;
    end if;
    execute v_new;
    v_n := v_n + 1;
  end loop;
  raise notice 'hr_l3_22: repointed % function(s)', v_n;
end $outer$;

-- ---------------------------------------------------------------------------------
-- 4. 🚨 remove the org-blind readers so a missed call site fails LOUDLY
-- ---------------------------------------------------------------------------------
drop function if exists hr._clock_knob(text, jsonb);
drop function if exists hr._punch_knob(text, jsonb);

do $$
declare v_left text; v_probe jsonb;
begin
  if to_regprocedure('hr._clock_knob(text,jsonb)') is not null
     or to_regprocedure('hr._punch_knob(text,jsonb)') is not null then
    raise exception 'hr_l3_22: an org-blind two-argument knob reader survived';
  end if;
  if to_regprocedure('hr._hr_knob(text,text,uuid,jsonb)') is null then
    raise exception 'hr_l3_22: the ladder did not land';
  end if;

  -- every caller must now pass three arguments; a two-arg call would be unresolvable
  select string_agg(n.nspname||'.'||p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prokind = 'f' and n.nspname in ('hr','public')
     and pg_get_functiondef(p.oid) ~ 'hr\._(punch|clock)_knob\([^,)]+,[^,)]+\)';
  if v_left is not null then
    raise exception 'hr_l3_22: a two-argument knob call remains in: %', v_left;
  end if;

  -- the platform rung still resolves for a seeded key with no org override
  v_probe := hr._punch_knob('max_shift_hours', '99'::jsonb, null);
  if (v_probe #>> '{}') <> '16' then
    raise exception 'hr_l3_22: the platform rung regressed (max_shift_hours resolved to %)', v_probe;
  end if;
  -- and the caller default still answers for an unseeded key
  v_probe := hr._clock_knob('kiosk_enabled', 'false'::jsonb, null);
  if (v_probe #>> '{}') <> 'false' then
    raise exception 'hr_l3_22: the caller-default rung regressed';
  end if;
end $$;
