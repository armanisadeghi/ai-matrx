-- hr_l1_44_no_unreachable_person.sql
--
-- 🚨 THE TRAP: SOMEBODY WHO CAN SIGN IN, IS ON THE ROSTER, AND CANNOT REACH HR.
-- `hr_employee_create` writes `login_user_id` — the access key — straight from
-- `link_user_id`, and writes NO org membership. `hr_my_context` lists an employer only
-- for a MEMBER, so the result is a person on the roster who cannot see the employer at
-- all; `hr_employee_invite` then refuses them ("already signs in here"), leaving no door
-- open. Reproduced live before this guard: employer absent from their list, `active` null.
--
-- WHAT THE SPEC SETTLES:
--   · SPEC-ACCESS §1.1 — "Org membership otherwise confers the directory tier only...
--     Nothing else confers HR standing, with exactly one bounded exception: activation."
--   · SPEC-EMPLOYEES §4.1 — `login_user_id` is set in exactly two ways: it stays NULL
--     (kiosk-only staff are first class), or the invite-acceptance trigger sets it.
--   So linking must NOT by itself hand out access — which is what this door was doing.
--   · But §4.1 also names "Link org member" and "Link CRM party" as first-class create
--     entry modes, so refusing linking outright would contradict the spec too.
--
-- WHAT THE SPEC DOES NOT SETTLE, and is therefore NOT decided here: whether a picked org
-- member's EXISTING login carries over at create, or is routed through the invite gate
-- anyway. That overlap is genuinely silent in both specs and is on the attention board as
-- a ruling. This guard closes only the part that is absolute — no path may create an
-- unreachable person — by refusing BY NAME exactly the state that produces one, and
-- pointing at the flow that does confer access.
--
-- Applied live 2026-08-28 and ledgered. Proven both ways: the link now refuses with
-- `link_without_membership`; a member-linked create is untouched.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_create(jsonb)'::regprocedure);
  if position('NO PATH MAY CREATE AN UNREACHABLE PERSON' in v_def) > 0 then
    raise notice 'hr_l1_44: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$  if v_party is null and nullif(p_payload ->> 'link_user_id','') is not null then$a1$,
$r1$  -- 🚨 NO PATH MAY CREATE AN UNREACHABLE PERSON.
  if nullif(p_payload ->> 'link_user_id','') is not null
     and not exists (
       select 1 from iam.memberships m
        where m.user_id = (p_payload ->> 'link_user_id')::uuid
          and m.organization_id = v_org
          and m.container_type = 'organization'
          and m.deleted_at is null
          and coalesce(m.status, 'active') = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'link_without_membership',
      'field', 'link_user_id',
      'door', '/hr/people/new',
      'detail', 'That person can sign in, but they are not a member of this employer yet — '
             || 'linking them here would put them on the roster with no way to reach HR. '
             || 'Create the record without a login and invite them, which is what grants '
             || 'access.',
      'remedy', 'Leave the login empty and send a platform invite; accepting it links the '
             || 'account and grants access in one act.');
  end if;

  if v_party is null and nullif(p_payload ->> 'link_user_id','') is not null then$r1$);
  if v_new = v_def then raise exception 'hr_l1_44: link anchor not found'; end if;
  execute v_new;
end $mig$;

do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_src !~ 'NO PATH MAY CREATE AN UNREACHABLE PERSON' then raise exception 'hr_l1_44: did not land'; end if;
  if v_src !~ 'A position needs a department' then raise exception 'hr_l1_44: hr_l1_43 lost'; end if;
  if v_src !~ 'hr\.employee_create' then raise exception 'hr_l1_44: crm source lost'; end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = 'hr_employee_create'
   and home_migration = 'hr_l1_43_a_position_needs_a_department.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('public', 'hr_employee_create', 'hr_l1_44_no_unreachable_person.sql',
        array['A position needs a location', 'A position needs a department',
              'hr.employee_create', 'link_without_membership'],
        array[]::text[],
        'Three things this door must keep. Both NOT NULL position columns are validated BY '
        || 'NAME. The crm provenance string stays ''hr.employee_create''. And a link to a user '
        || 'with no membership is REFUSED: this door writes login_user_id but no membership, so '
        || 'without the guard it manufactures a person who can sign in, is on the roster, and '
        || 'has no door left to reach HR — hr_employee_invite refuses them as already signing in.')
on conflict do nothing;
