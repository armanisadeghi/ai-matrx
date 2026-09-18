-- dd199_residue_sequenced_gates_and_org_membership_identity
--   TWO STATEMENTS, NOT ONE EXPRESSION — AND A ROLE ANSWER THAT DOES NOT DEPEND ON WHICH ROW WINS
-- (DD-199 residue, closing V-61 §8 and V-61 §4's out-of-scope finding. SECURITY P0.
--  db-rules §0/§6d/§9. Functions, plus ONE table CHECK; no policies — iam.apply_rls owns those.)
--
-- ═══ RESIDUE 1 — THE SEQUENCE WAS NOT A SEQUENCE ═══════════════════════════════════════════════
-- dd199_role_helpers_refuse_non_members rewrote the two role-OR-capability gates as:
--
--     if not hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id)
--        and coalesce(hr._l1_org_role(v_uid, p_organization_id), 'none') not in ('owner','admin') then
--
-- and the comment above it justified the shape by saying Postgres does not guarantee short-circuit
-- evaluation of `OR`. That is true — and it is EQUALLY true of `AND`. Postgres may evaluate either
-- operand of an `AND` first and is free to reorder by cost. If it ever did so here, the STRICT
-- `hr._l1_org_role` call would raise 42501 with the MEMBERSHIP sentence at a legitimate
-- capability-holding NON-MEMBER — an HR admin whose standing is an employment, not a membership —
-- which is exactly the failure the rewrite existed to prevent. V-61 constructed such a person
-- (rolled back) and measured them admitted, so the door is correct in FACT today; it was one
-- planner decision away from not being. A fix that rests on the property its own comment distrusts
-- is not a fix.
--
-- Both gates are now genuine control flow: `if <capability> then null; elsif <strict role call>
-- then <refuse>; end if;`. An `elsif` branch is evaluated only when the branch above it was false.
-- That is a language guarantee, not a cost estimate.
--
-- ═══ RESIDUE 2 — AN ARBITRARY ROW ANSWERED A YES/NO QUESTION ═══════════════════════════════════
-- `public.auth_is_org_admin` and `public.auth_is_org_owner` read
--
--     SELECT role INTO user_role FROM iam.organization_member WHERE organization_id = … AND user_id = …
--
-- with no ORDER BY and no LIMIT. A plpgsql `select … into` that matches more than one row takes an
-- ARBITRARY one and raises nothing, so the answer was whichever row the plan happened to emit
-- first. `exists` asks the real question — does this person hold this standing in this
-- organization — and is deterministic however many rows match. Both now use it.
--
-- WHAT THE CENSUS ACTUALLY FOUND, AND WHY NO ROWS ARE DELETED HERE.
-- V-61 read `auth_is_org_owner(admin@admin.com, AI Matrx) = false` as a duplicate-row defect. It is
-- not: measured on the live database 2026-09-13, `iam.memberships` holds
--   • ZERO (organization_id, user_id) duplicate pairs among container_type = 'organization' rows —
--     with or without the status/deleted filters;
--   • ZERO organization-container rows whose container_id differs from their organization_id;
--   • exactly ONE organization row for admin@admin.com in AI Matrx, role `admin`.
-- His three `owner` rows there are container_type = 'project' memberships that merely carry the
-- same organization_id as a tenant stamp, and `iam.organization_member` correctly excludes them.
-- The owner of AI Matrx is arman@armansadeghi.com. `false` was the RIGHT answer.
--
-- So there is nothing to deduplicate, and answering "true if ANY membership row for (user, org)
-- carries the role" over the raw table would have made every PROJECT owner an ORGANIZATION owner —
-- a privilege escalation, the exact opposite of DD-199. The `exists` above is scoped to the view,
-- which is organization containers only.
--
-- ═══ THE INVARIANT THAT MAKES THE ANSWER UNIQUE, NOW ENFORCED ══════════════════════════════════
-- `iam.memberships` already carries UNIQUE (container_type, container_id, user_id). That makes
-- (organization_id, user_id) unique inside `iam.organization_member` only while every
-- organization-container row keeps container_id = organization_id — an invariant that holds for
-- every live row and that NOTHING enforced. `public.mbr_add(p_container_type, p_container_id,
-- p_user_id, p_organization_id, …)` takes the two ids as SEPARATE arguments, so one caller passing
-- a mismatched pair would have minted exactly the duplicate V-61 thought it was looking at. The
-- CHECK below closes the door rather than standing a safe path beside it. Added NOT VALID and
-- validated in the same file: zero rows violate it, so validation is immediate.

-- ── THE INVARIANT ──────────────────────────────────────────────────────────────────────────────
alter table iam.memberships
  add constraint memberships_org_container_is_its_organization
  check (container_type <> 'organization' or container_id = organization_id) not valid;

alter table iam.memberships
  validate constraint memberships_org_container_is_its_organization;

comment on constraint memberships_org_container_is_its_organization on iam.memberships is
  'DD-199 residue (2026-09-13): an organization-container membership IS the organization''s own '
  'membership, so its container_id must be its organization_id. Without this the UNIQUE '
  '(container_type, container_id, user_id) index does not make (organization_id, user_id) unique '
  'inside the iam.organization_member view, and a role question could be answered from an '
  'arbitrary one of two rows. Project and scope memberships are untouched: they keep their own '
  'container_id and carry organization_id only as the tenant stamp.';

-- ── THE FUNCTIONS ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_is_org_admin(user_id uuid, org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- DD-199 + V-61 residue 2. The old body was `select role into user_role … ; return user_role in
  -- (…)` with no ORDER BY and no LIMIT. `select … into` takes an ARBITRARY row when the query
  -- returns more than one and does not error, so the answer was whichever row the plan happened to
  -- emit first. `exists` asks the real question — does this person hold this standing here — and is
  -- deterministic no matter how many rows match. The view iam.organization_member already restricts
  -- to container_type = 'organization', active, not deleted: a PROJECT membership in the same
  -- organization can never be mistaken for an organization role.
  RETURN exists (
    SELECT 1 FROM iam.organization_member om
     WHERE om.organization_id = org_id
       AND om.user_id = $1
       AND om.role::text IN ('admin', 'owner'));
END;
$function$;


CREATE OR REPLACE FUNCTION public.auth_is_org_owner(user_id uuid, org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- DD-199 + V-61 residue 2. See auth_is_org_admin: an unordered, unlimited `select … into` answered
  -- from an arbitrary row. `exists` is deterministic. The view is organization containers only, so a
  -- project owner in this organization is correctly NOT its owner.
  RETURN exists (
    SELECT 1 FROM iam.organization_member om
     WHERE om.organization_id = org_id
       AND om.user_id = $1
       AND om.role::text = 'owner');
END;
$function$;


CREATE OR REPLACE FUNCTION public.hr_employee_grant_missing_membership(p_employee_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'iam'
AS $function$
declare v_uid uuid := auth.uid(); v_e hr.employee%rowtype; v_has boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_caller',
      'detail', 'Repairing access needs an authenticated caller.');
  end if;

  select * into v_e from hr.employee where id = p_employee_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'field', 'employee_id',
      'detail', 'There is no such employee here.');
  end if;

  -- DD-199 + V-61 residue 1: TWO STATEMENTS, not one boolean expression. Postgres guarantees no
  -- evaluation order for AND any more than for OR, so `not capability(...) and <strict role call>`
  -- could have raised the MEMBERSHIP sentence at a legitimate role-assignment holder whose standing
  -- is an employment rather than a membership. `elsif` is control flow, not a cost estimate.
  if hr.capability(v_uid, 'role.assign', null, current_date, v_e.organization_id) then
    null;  -- role-assignment standing from an employment: admitted, strict call never made.
  elsif coalesce(hr._l1_org_role(v_uid, v_e.organization_id), 'none') not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'reason', 'no_standing',
      'detail', 'Repairing somebody''s access to this employer needs owner, admin or '
             || 'role-assignment standing.');
  end if;

  if v_e.login_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login', 'field', 'login_user_id',
      'detail', 'This person has no platform login, so there is nothing to repair — a '
             || 'kiosk-only employee is a first-class record. Invite them if they need one.');
  end if;

  select exists (
    select 1 from iam.memberships m
     where m.user_id = v_e.login_user_id and m.organization_id = v_e.organization_id
       and m.container_type = 'organization' and m.deleted_at is null
       and coalesce(m.status,'active') = 'active') into v_has;

  if v_has then
    return jsonb_build_object('ok', true, 'repaired', false, 'reason', 'already_reachable',
      'detail', 'This person is already a member of this employer; nothing needed repairing.');
  end if;

  perform public.mbr_add('organization', v_e.organization_id, v_e.login_user_id,
                         v_e.organization_id, 'member', 'active',
                         jsonb_build_object('granted_by', 'hr_employee_grant_missing_membership',
                                            'reason', 'link_at_create_wrote_no_membership'));

  return jsonb_build_object('ok', true, 'repaired', true,
    'employee_id', v_e.id, 'organization_id', v_e.organization_id,
    'detail', 'Access repaired — they are a member of this employer now and can reach '
           || 'their own HR record.');
end $function$;


CREATE OR REPLACE FUNCTION public.hr_knob_index(p_organization_id uuid, p_overridden_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'hr', 'platform'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_knob_index: no authenticated caller' using errcode = '42501';
  end if;
  -- DD-199 + V-61 residue 1: TWO STATEMENTS, not one boolean expression. Postgres guarantees no
  -- evaluation order for AND any more than for OR — it may evaluate either operand first and is
  -- free to reorder by cost — so `not capability(...) and <strict role call>` was one planner
  -- decision away from raising the MEMBERSHIP sentence at a legitimate capability-holding
  -- non-member (an HR admin whose standing is an employment, not a membership; V-61 constructed
  -- one and measured it admitted). `elsif` is a control-flow branch: it is evaluated only when the
  -- `if` above it was false, which is a guarantee and not a cost estimate.
  if hr.capability(v_uid, 'identity.write', null, current_date, p_organization_id) then
    null;  -- HR-admin standing from an employment: admitted, and the strict call below is never made.
  elsif coalesce(hr._l1_org_role(v_uid, p_organization_id), 'none') not in ('owner','admin') then
    -- The STRICT call above already refused a stranger with 42501 and the membership sentence.
    -- Reaching here means a real member who is neither owner nor admin: this door's own sentence.
    raise exception 'hr_knob_index: settings are HR-admin only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'keys', (select coalesce(jsonb_agg(x order by x ->> 'feature', x ->> 'key'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature', k.feature,
          'slug', split_part(k.feature, '.', 2),
          'key', k.key,
          'full_key', k.feature || '.' || k.key,
          'label', k.label,
          'description', k.description,
          'value_type', k.value_type,
          'allowed_values', k.allowed_values,
          'min_value', k.min_value,
          'max_value', k.max_value,
          'unit', k.unit,
          'review_due', k.review_due,
          'set_by', k.set_by,
          'platform_default', coalesce(k.value, k.default_value),
          'shipped_default', k.default_value,
          'org_override', o.value,
          'effective_value', coalesce(o.value, k.value, k.default_value),
          'origin', case
             when o.value is not null then 'org_override'
             when coalesce(k.value, k.default_value) is not null then 'platform_default'
             else 'missing' end,
          'basis', k.basis,
          'is_overridden', o.value is not null,
          'platform_locked', (k.overridable_by = '{}'::text[])
        ) as x
        from platform.feature_knob k
        left join platform.knob_override o
          on o.feature = k.feature and o.key = k.key
         and o.organization_id = p_organization_id
         and o.scope_kind = 'organization'
         and 'organization' = any (k.overridable_by)
        where k.feature like 'hr.%'
      ) s
      where not p_overridden_only or (x ->> 'is_overridden')::boolean));
end;
$function$;
