-- HR domain L5 — migration 20 (register item HRB-017, lane L5 Leave & PTO).
--
-- §2.5's FLOOR CARDS, now that there is a read door to resolve them through.
--
-- *"A jurisdiction floor is a locked control showing its value and its source, never a hidden
-- constraint discovered at save."* The policy editor could not honour that: nothing served the
-- resolved rules to a client, so every governed field rendered as a free control and the admin met
-- the floor only as a refusal. `public.hr_resolve_rules(org, jurisdiction_key, as_of, classes)` is
-- now live (subject-less by privacy design), so the floors can be shown BEFORE the save.
--
-- Three field states, exactly as §2.5 names them:
--   • **locked_at_floor** — the floor sets a value and the org has not gone above it. Read-only,
--     with the rule id, version, effective range and citation behind it.
--   • **above_floor** — the org configured something more generous. Editable, with the minimum
--     named so the admin can see the headroom they have.
--   • **unverified** — the resolved rule is `advisory`. Editable, amber, **no fabricated floor**.
--
-- 🚨 AND A FOURTH STATE THE SPEC DOES NOT LIST, WHICH THE LIVE DATA FORCES.
-- California's `sick-leave-floor` is `status = 'active'` — and its parameters carry
-- `_unverified: ["carryover.cap_hours", "annual_use_cap_hours", "accrual_cap_hours"]`. Three keys
-- inside a verified rule that are themselves not verified. §2.5's three states are chosen by RULE
-- status, so all three of those fields would render **locked at a floor we have not checked**,
-- against an admin, with a citation implying we had. That is the exact failure the
-- advisory-never-money ruling already fixed at key grain for payouts (REGISTER, HRB-009), applied
-- here to configuration: **a key listed in `_unverified` renders `unverified` no matter how
-- verified its rule is.** `null` floors are also never rendered as a floor — an absent number is
-- not a limit of zero.
--
-- Authority: SPEC-LEAVE §2.4, §2.5, §2.6; SPEC-JURISDICTION §5.2/§5.6; the key-grain
-- advisory ruling. Applied live as `hr_l5_20_statutory_floor_cards`. Idempotent.

create or replace function hr._leave_floor_field(
  p_field text, p_floor jsonb, p_configured jsonb, p_direction text,
  p_rule_status text, p_unverified jsonb, p_param_key text, p_sentence text
) returns jsonb
language plpgsql
immutable
as $function$
declare v_state text; v_floor numeric; v_conf numeric;
begin
  -- An ABSENT floor is not a floor of zero. A rule that carries null for a cap is a rule that
  -- sets no cap, and rendering that as "locked at 0" would invent a limit the law never set.
  if p_floor is null or jsonb_typeof(p_floor) = 'null' then
    return '[]'::jsonb;
  end if;
  v_floor := (p_floor #>> '{}')::numeric;

  -- 🚨 THE KEY-GRAIN RULE. A key named in the rule's own `_unverified` list is unverified even
  -- when the RULE is active — California's sick-leave floor is active and lists three cap keys as
  -- unverified. Rendering those as locked floors would put a citation behind a number nobody
  -- checked.
  if p_rule_status <> 'active'
     or coalesce(p_unverified, '[]'::jsonb) @> to_jsonb(p_param_key) then
    v_state := 'unverified';
  else
    v_conf := nullif(p_configured #>> '{}','')::numeric;
    if v_conf is null then
      v_state := 'locked_at_floor';
    elsif (p_direction = 'at_most'  and v_conf <  v_floor)
       or (p_direction = 'at_least' and v_conf >  v_floor) then
      v_state := 'above_floor';        -- the org went further than the law asks
    else
      v_state := 'locked_at_floor';
    end if;
  end if;

  return jsonb_build_array(jsonb_build_object(
    'field', p_field,
    'state', v_state,
    'floor_value', v_floor,
    'configured_value', p_configured,
    'direction', p_direction,
    'parameter_key', p_param_key,
    'sentence', case v_state
      when 'unverified' then 'We have not verified this number. Your policy runs as you configure '
                          || 'it, and we will tell you if verification changes anything.'
      when 'above_floor' then p_sentence || ' Yours is more generous than that.'
      else p_sentence end));
end
$function$;

comment on function hr._leave_floor_field(text, jsonb, jsonb, text, text, jsonb, text, text) is
  'One §2.5 floor card field. The state is chosen by the rule status AND by whether this '
  'particular key is in the rule''s own _unverified list — an active rule can still carry '
  'unverified keys, and a locked control over an unchecked number is a citation behind a guess. '
  'A null floor renders NOTHING, because an absent limit is not a limit of zero.';

create or replace function hr.leave_policy_floors(p_organization_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_keys text[]; v_key text; v_cards jsonb := '[]'::jsonb;
  v_res jsonb; v_rule jsonb; v_p jsonb; v_unver jsonb; v_fields jsonb;
  v_name text; v_cite jsonb; v_status text; v_uses jsonb := '[]'::jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin','hr_owner') then
    return jsonb_build_object('granted', false, 'reason','not_an_hr_admin');
  end if;

  -- §2.2: the operating jurisdictions are the org's own, and the admin must see which they are.
  select array_agg(distinct j.key) into v_keys
    from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
   where e.organization_id = p_organization_id and e.deleted_at is null;
  -- the position chain counts too — an employment can reach a state no establishment sits in
  select array_agg(distinct k) into v_keys from (
    select unnest(coalesce(v_keys, '{}'::text[])) k
    union
    select j.key from hr.employment em
      join hr.position_assignment pa on pa.employment_id = em.id and pa.is_primary
           and pa.deleted_at is null and pa.effective_from <= current_date
           and (pa.effective_to is null or pa.effective_to > current_date)
      join hr.location loc on loc.id = pa.location_id
      join hr.jurisdiction j on j.id = loc.jurisdiction_id
     where em.organization_id = p_organization_id and em.status = 'active'
       and em.deleted_at is null) q;

  foreach v_key in array coalesce(v_keys, '{}'::text[]) loop
    select j.name into v_name from hr.jurisdiction j where j.key = v_key;
    v_res := public.hr_resolve_rules(p_organization_id, v_key, current_date,
               array['sick-leave-floor','pto-carryover-legality','pto-payout-at-termination']);

    v_fields := '[]'::jsonb;

    -- ---------- sick-leave-floor
    select x into v_rule from jsonb_array_elements(
      coalesce(v_res #> '{resolved,sick-leave-floor,rules}', '[]'::jsonb)) x limit 1;
    if v_rule is not null then
      v_p := v_rule -> 'parameters';
      v_unver := coalesce(v_p -> '_unverified', '[]'::jsonb);
      v_status := v_rule ->> 'status';
      select r.citation into v_cite from hr.jurisdiction_rule r
       where r.id = (v_rule ->> 'rule_id')::uuid;

      v_fields := v_fields
        || hr._leave_floor_field('accrual_per_units', v_p #> '{accrual,per_hours_worked}',
             p_payload -> 'accrual_per_units', 'at_most', v_status, v_unver, 'accrual.per_hours_worked',
             format('%s requires at least %s hour earned for every %s worked.', v_name,
                    v_p #>> '{accrual,hours_earned}', v_p #>> '{accrual,per_hours_worked}'))
        || hr._leave_floor_field('usable_after_days', v_p -> 'use_permitted_after_days',
             p_payload -> 'usable_after_days', 'at_most', v_status, v_unver, 'use_permitted_after_days',
             format('%s lets people start using sick leave after %s days. A shorter wait is fine.',
                    v_name, v_p ->> 'use_permitted_after_days'))
        || hr._leave_floor_field('carryover_cap', v_p #> '{carryover,cap_hours}',
             p_payload -> 'carryover_cap', 'at_least', v_status, v_unver, 'carryover.cap_hours',
             format('%s sets a minimum carryover cap.', v_name))
        || hr._leave_floor_field('annual_accrual_cap', v_p -> 'annual_use_cap_hours',
             p_payload -> 'annual_accrual_cap', 'at_least', v_status, v_unver, 'annual_use_cap_hours',
             format('%s sets a minimum annual cap.', v_name))
        || hr._leave_floor_field('balance_cap', v_p -> 'accrual_cap_hours',
             p_payload -> 'balance_cap', 'at_least', v_status, v_unver, 'accrual_cap_hours',
             format('%s sets a minimum holding cap.', v_name))
        || hr._leave_floor_field('documentation_required_after_days',
             v_p -> 'documentation_not_required_under_consecutive_days',
             p_payload -> 'documentation_required_after_days', 'at_least', v_status, v_unver,
             'documentation_not_required_under_consecutive_days',
             format('%s does not allow documentation to be demanded for absences under %s days.',
                    v_name, v_p ->> 'documentation_not_required_under_consecutive_days'))
        || hr._leave_floor_field('reinstate_on_rehire_within_days',
             to_jsonb((nullif(v_p ->> 'rehire_reinstatement_within_months','')::numeric * 30.44)::int),
             p_payload -> 'reinstate_on_rehire_within_days', 'at_least', v_status, v_unver,
             'rehire_reinstatement_within_months',
             format('%s reinstates a sick-leave balance for a rehire within %s months.',
                    v_name, v_p ->> 'rehire_reinstatement_within_months'));

      if v_p ->> 'accrual_begins' = 'day_1' then
        v_fields := v_fields || jsonb_build_array(jsonb_build_object(
          'field','accrual_starts', 'state','locked_at_floor', 'required_value','hire',
          'sentence', format('%s requires earning to start on day one, so the waiting period is '
                          || 'zero. This is not the same as when time can be USED.', v_name),
          'rule_id', v_rule ->> 'rule_id', 'rule_version', v_rule ->> 'rule_version',
          'citation', v_cite));
      end if;

      -- §2.4: mandated_uses is SEEDED from the resolved permitted_uses. An org may ADD a use,
      -- never remove one, so the statutory ones come back flagged and the editor renders their
      -- remove control ABSENT rather than disabled.
      if jsonb_typeof(v_p -> 'permitted_uses') = 'array' then
        v_uses := v_uses || (select coalesce(jsonb_agg(jsonb_build_object(
                    'use', u, 'statutory', true, 'removable', false,
                    'jurisdiction_key', v_key,
                    'sentence','Required by law — cannot be removed.')), '[]'::jsonb)
                  from jsonb_array_elements_text(v_p -> 'permitted_uses') u);
      end if;
    end if;

    -- ---------- pto-carryover-legality
    select x into v_rule from jsonb_array_elements(
      coalesce(v_res #> '{resolved,pto-carryover-legality,rules}', '[]'::jsonb)) x limit 1;
    if v_rule is not null and (v_rule #>> '{parameters,forfeiture_allowed}')::boolean is false then
      select r.citation into v_cite from hr.jurisdiction_rule r
       where r.id = (v_rule ->> 'rule_id')::uuid;
      v_fields := v_fields || jsonb_build_array(jsonb_build_object(
        'field','carryover_allowed',
        'state', case when v_rule ->> 'status' = 'active' then 'locked_at_floor' else 'unverified' end,
        'required_value', true,
        'sentence', format('%s does not allow unused time to expire. Cap what people can hold '
                        || 'instead — the "expire unused time" control is not available here.',
                           v_name),
        'also_absent', jsonb_build_array('carryover_expires_after_days'),
        'rule_id', v_rule ->> 'rule_id', 'rule_version', v_rule ->> 'rule_version',
        'citation', v_cite));
    end if;

    -- ---------- pto-payout-at-termination
    select x into v_rule from jsonb_array_elements(
      coalesce(v_res #> '{resolved,pto-payout-at-termination,rules}', '[]'::jsonb)) x limit 1;
    if v_rule is not null and (v_rule #>> '{parameters,required}')::boolean is true then
      select r.citation into v_cite from hr.jurisdiction_rule r
       where r.id = (v_rule ->> 'rule_id')::uuid;
      v_fields := v_fields || jsonb_build_array(jsonb_build_object(
        'field','payout_on_termination',
        'state', case when v_rule ->> 'status' = 'active' then 'locked_at_floor' else 'unverified' end,
        'forbidden_value','never',
        'sentence', case when v_rule ->> 'status' = 'active'
          then format('%s requires accrued time to be paid out when employment ends, so "never" '
                   || 'is not available.', v_name)
          else format('%s may require a payout at termination. We have not verified that rule, so '
                   || 'the choice is yours and we will not compute an amount from it.', v_name) end,
        'rule_id', v_rule ->> 'rule_id', 'rule_version', v_rule ->> 'rule_version',
        'citation', v_cite));
    end if;

    v_cards := v_cards || jsonb_build_array(jsonb_build_object(
      'jurisdiction_key', v_key, 'jurisdiction_name', v_name,
      'fields', v_fields,
      'advisory_rules_consulted', coalesce(v_res -> 'advisory', '[]'::jsonb),
      'classes_with_no_rule', coalesce(v_res -> 'no_rule', '[]'::jsonb)));
  end loop;

  return jsonb_build_object(
    'granted', true,
    'operating_jurisdictions', to_jsonb(coalesce(v_keys, '{}'::text[])),
    'cards', v_cards,
    'statutory_uses', v_uses,
    'note', case when coalesce(array_length(v_keys,1),0) = 0
      then 'This organization has no establishment and nobody with a work location, so there is no '
        || 'jurisdiction to check a policy against yet.' end);
end
$function$;

create or replace function public.hr_leave_policy_floors(
  p_organization_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_policy_floors(p_organization_id, p_payload); $function$;

grant execute on function public.hr_leave_policy_floors(uuid, jsonb) to authenticated;

-- 🚨 THE DOOR SEAL (hr_l5_04). `grant ... to authenticated` does NOT remove the anon EXECUTE that
-- Supabase's default privileges hand every new public function, and `revoke from public` does not
-- either — anon holds its own explicit grant. Both revokes must be explicit and name anon. This
-- lane shipped five SECURITY DEFINER doors, one a WRITE, executable by anon. Replaying this file
-- re-seals rather than regressing.

select hr.leave_seal_door('hr_leave_policy_floors');

do $$
declare v_anon text;
begin
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_leave_policy_floors')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon is not null then
    raise exception 'hr_l5_20: these doors are executable by anon: %', v_anon;
  end if;
end $$;

do $$
declare v_out jsonb;
begin
  -- a null floor renders nothing at all
  if hr._leave_floor_field('balance_cap','null'::jsonb,null,'at_least','active','[]'::jsonb,'k','s')
     <> '[]'::jsonb then
    raise exception 'hr_l5_20: an absent floor was rendered as a floor';
  end if;
  -- the key-grain rule: active rule, unverified key => unverified field
  v_out := hr._leave_floor_field('balance_cap','80'::jsonb,null,'at_least','active',
             '["accrual_cap_hours"]'::jsonb,'accrual_cap_hours','s');
  if v_out #>> '{0,state}' <> 'unverified' then
    raise exception 'hr_l5_20: an unverified key inside an ACTIVE rule rendered as %',
      v_out #>> '{0,state}';
  end if;
  -- and the control can fail: the same key, not listed, locks
  v_out := hr._leave_floor_field('balance_cap','80'::jsonb,null,'at_least','active',
             '[]'::jsonb,'accrual_cap_hours','s');
  if v_out #>> '{0,state}' <> 'locked_at_floor' then
    raise exception 'hr_l5_20: a verified key did not lock — the check cannot distinguish';
  end if;
  -- more generous than the floor reads as above_floor
  v_out := hr._leave_floor_field('usable_after_days','90'::jsonb,'30'::jsonb,'at_most','active',
             '[]'::jsonb,'use_permitted_after_days','s');
  if v_out #>> '{0,state}' <> 'above_floor' then
    raise exception 'hr_l5_20: a more-generous value did not read as above the floor';
  end if;
  if (select count(*) from hr.leave_door_grant_audit() where verdict like 'DEFECT%') > 0 then
    raise exception 'hr_l5_20: the new floors door checks nobody';
  end if;
end $$;
