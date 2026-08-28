-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- SPEC-UI-IA §2.5's floor cards and §2.4's checked-and-disabled statutory uses need the resolved
-- rules on the client, and `hr.resolve_rules` is not reachable: the `hr` schema is not exposed to
-- PostgREST (TD-1), so every client-called HR RPC is a `public.hr_*` wrapper. This ships that door.
--
-- Authority: TD-1 (hr is not PostgREST-exposed; thin public wrappers only); SPEC-UI-IA §2.4/§2.5;
-- SPEC-JURISDICTION §2.2/§7.5 (as_of is the WORK or EVENT date); the advisory-never-produces-money
-- law.
--
-- Applied live as `hr_l3_72_public_resolve_rules_read_door`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE GATE LIVES IN `hr`, NOT IN THE WRAPPER. TD-1 says the wrapper carries NO logic, and a
--    standing check is logic. So `hr.resolve_rules_display` holds the gate and the delegation, and
--    `public.hr_resolve_rules` is one line. This is also why the gate cannot be skipped by a future
--    caller that reaches the `hr` function directly for display purposes — the gated one is the
--    display door, and the ungated `hr.resolve_rules` remains the engine's internal entry.
-- 2. 🚨 THE SUBJECT ARM IS DELIBERATELY ABSENT. This door takes a JURISDICTION KEY and a date —
--    never a `subject_id`. Passing a subject would make the door answer "what rules apply to THIS
--    person", which is a per-person legal read, and would let a caller with mere org standing probe
--    another employee's jurisdiction. Display cards need "what does US-CA say on this date", which
--    is not personal data at all. The narrower door is also the honest one.
-- 3. ADVISORY DISPLAY, AND THE MONEY LAW IS UNTOUCHED. The projection carries the rule's identity,
--    name, level, status, parameters and the resolution trace — the `calc_ref.rules` projection's
--    sibling. It computes nothing and returns no amount. An `advisory` rule is returned WITH its
--    status so the surface can render it as unverified rather than as fact; stripping advisory rows
--    would be worse, because a floor card that silently omits a rule reads as "no rule exists".
-- 4. READ-ONLY IS ENFORCED BY `STABLE`, NOT BY CONVENTION. The door is `STABLE SECURITY DEFINER`,
--    which is also what keeps it out of `hr.stable_doors_that_write()`'s violation set (F1).
-- 5. GRANTS: `authenticated` only, and revoked from BOTH `public` AND `anon`. Supabase's default
--    privileges grant EXECUTE to `anon` explicitly on new functions in `public`, so revoking from
--    `public` alone leaves the door open — a defect this lane has already paid for once.

begin;

create or replace function hr.resolve_rules_display(p_organization_id uuid,
                                                    p_jurisdiction_key text,
                                                    p_as_of date,
                                                    p_classes text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_resolve_rules: no authenticated caller' using errcode = '42501';
  end if;

  -- the directory's own standing test: a member of the org, or an employee of it
  if hr._l1_org_role(v_uid, p_organization_id) is null
     and not exists (select 1 from hr.employee e
                      where e.organization_id = p_organization_id
                        and e.login_user_id = v_uid and e.deleted_at is null) then
    raise exception 'hr_resolve_rules: no standing in this employer' using errcode = '42501';
  end if;

  if p_as_of is null then
    raise exception 'as_of_required' using errcode = '22004',
      hint = 'SPEC-JURISDICTION 2.2 / 7.5: pass the WORK or EVENT date the card is describing. Never now().';
  end if;
  if p_jurisdiction_key is null then
    raise exception 'jurisdiction_key_required' using errcode = '22004',
      hint = 'This display door resolves for a PLACE and a DATE, never for a person (decision 2).';
  end if;

  -- no subject: the engine's own no-subject path, which is why decision 2 holds
  return hr.resolve_rules(null::text, null::uuid, p_as_of, p_classes,
                          '{}'::jsonb, p_organization_id, p_jurisdiction_key);
end
$fn$;

revoke all on function hr.resolve_rules_display(uuid, text, date, text[]) from public;
revoke all on function hr.resolve_rules_display(uuid, text, date, text[]) from anon;

-- ── the thin public wrapper (TD-1): no logic ────────────────────────────────────────────────
create or replace function public.hr_resolve_rules(p_organization_id uuid,
                                                   p_jurisdiction_key text,
                                                   p_as_of date,
                                                   p_classes text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = hr, public
as $fn$
  select hr.resolve_rules_display(p_organization_id, p_jurisdiction_key, p_as_of, p_classes)
$fn$;

revoke all on function public.hr_resolve_rules(uuid, text, date, text[]) from public;
revoke all on function public.hr_resolve_rules(uuid, text, date, text[]) from anon;
grant execute on function public.hr_resolve_rules(uuid, text, date, text[]) to authenticated;

do $chk$
begin
  if has_function_privilege('anon', 'public.hr_resolve_rules(uuid,text,date,text[])', 'EXECUTE') then
    raise exception 'hr_l3_72: anon can execute the new door';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_resolve_rules(uuid,text,date,text[])', 'EXECUTE') then
    raise exception 'hr_l3_72: authenticated cannot execute the new door';
  end if;
  if (select count(*) from hr.stable_doors_that_write()) <> 0 then
    raise exception 'hr_l3_72: a STABLE door writes';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_72: a conformance check is failing';
  end if;
end
$chk$;

commit;
