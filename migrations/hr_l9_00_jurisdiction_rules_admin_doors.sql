-- HR domain, L9 / register item HRB-021 (scoped claim: the D18 jurisdiction-rules admin
-- surface + the D25 law portal), file 00.
--
-- Authority: DECISIONS.md D25 (2026-08-28, owner ruling): "Only a superadmin and from the
-- admin portal" may promote an employment-law rule to `active`; each org gets a law portal
-- layered over the platform baseline. SPEC-JURISDICTION §1.3 (status ladder), §3 (org
-- configuration + validate_org_config contract), §6.1 gate 1 (fixture promotion trigger,
-- already live as hr._jurisdiction_rule_promotion_gate); SPEC-UI-IA §3.12 routes 85/85a/85b;
-- SPEC-DOMAIN-WIDE §4.4.
--
-- Applied live as migration `hr_l9_00_jurisdiction_rules_admin_doors`. Idempotent.
--
-- WHAT THIS FILE DOES
--   1. hr._jurisdiction_rule_status_authority_gate — a BEFORE UPDATE trigger enforcing D25
--      structurally: on a PLATFORM rule row (source_scope='statutory' or system-org owned),
--      any change of `status` is refused unless (a) the caller is a superadmin
--      (public.is_super_admin(), i.e. admin.admins.level='super_admin') AND (b) the write
--      is going through the one named door (hr.jurisdiction_rule_set_status). Migrations
--      (no auth.uid), aidream/service_role (no auth.uid), other RPCs (no door flag) are all
--      structurally unable to promote or demote. Org-authored rows (source_scope='org_policy')
--      are NOT gated here — an org's own policy rows are governed by §3, not by D25.
--   2. hr.jurisdiction_rule_set_status + public.hr_jurisdiction_rule_set_status — the ONE
--      status door. Superadmin-only, allowed transitions only, promotion requires a recorded
--      reason (the UI shows the citation at the moment of promotion and passes the sign-off
--      note), status history appended to metadata, §6.1 fixture gate still fires underneath
--      and is returned as a refusal envelope, never a raw raise.
--   3. hr.jurisdiction_rules_admin_data + public wrapper — the superadmin read door feeding
--      /administration/hr/jurisdiction-rules (route 85/85a/85b): full library incl. draft +
--      superseded, class definitions, per-rule fixture summary, JUR-SEED progress
--      (platform.v_hr_jur_seed_progress) and the overdue board
--      (platform.v_hr_jurisdiction_rule_overdue).
--   4. hr.law_portal_data + public wrapper — the org law portal read door (/hr/compliance/laws):
--      the platform rules on the org's jurisdiction chains, the org's own override rows, and
--      the class register with org-configurability verdicts. HR-admin standing required
--      (hr._leave_admin_rung — the general HR role rung despite its name).
--   5. hr.org_jurisdiction_rule_save / _deactivate + public wrappers — the org override write
--      path: refuses non-configurable classes, validates through hr.validate_org_config
--      (§3.2: a violation is a refusal, not a clamp; advisory law warns, never blocks),
--      writes org rows with explicit organization_id and source_scope='org_policy', never
--      touching a platform row.
--
-- RECORDED TECHNICAL DECISIONS
--   1. The authority gate keys on source_scope='statutory' OR system-org ownership, not on
--      either alone: a statutory row is law-content wherever it lives, and a system-org row
--      is platform content whatever its scope says. Both tests together make mislabeling
--      insufficient to escape the gate.
--   2. The door flag is a transaction-local set_config carrying the door's own name. It is
--      not a secret (the write guard's md5 token already is); it exists so that no OTHER
--      armed SECURITY DEFINER body — present or future — can change a platform rule's status
--      as a side effect. Belt (who) and braces (where) are deliberately separate checks with
--      separate error messages, so an audit log can tell them apart.
--   3. Demotion (active → advisory) rides the same door and the same superadmin gate: D25's
--      text is about going live, but an un-gated demotion path would let a non-superadmin
--      silently strip 42 binding rules of their teeth — the same authority question in the
--      other direction. 'superseded' is NOT reachable through this door: supersession is the
--      amendment flow (§4.3) and arrives with a new row, which this door does not create.
--   4. The org save door defaults effective_from to current_date, not 1900-01-01: an org
--      policy starts when the org adopts it. The platform seed-floor convention
--      (metadata.effective_from_is_seed_floor) is a statutory-row convention only.

set local lock_timeout = '20s';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The D25 authority gate
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr._jurisdiction_rule_status_authority_gate()
returns trigger
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_platform boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_platform := old.source_scope = 'statutory'
                or old.organization_id in
                   (select so.organization_id from iam.system_orgs so where so.global_readable);
  if not v_platform then
    return new;  -- org-authored policy rows are §3's business, not D25's
  end if;

  if not public.is_super_admin() then
    raise exception 'rule_status_superadmin_only: changing the status of a platform employment-law rule requires a superadmin'
      using errcode = '42501',
            hint = 'D25 (2026-08-28): "Only a superadmin and from the admin portal." No migration, service path, or non-superadmin RPC may promote or demote a platform rule.';
  end if;

  if coalesce(current_setting('hr.rule_status_door', true), '') <> 'hr_jurisdiction_rule_set_status' then
    raise exception 'rule_status_door_only: platform rule status changes go through hr.jurisdiction_rule_set_status'
      using errcode = '42501',
            hint = 'D25: the admin-portal door is the only path. Even an armed privileged write may not flip status as a side effect.';
  end if;

  return new;
end
$function$;

drop trigger if exists _zz_jurisdiction_rule_authority_gate on hr.jurisdiction_rule;
create trigger _zz_jurisdiction_rule_authority_gate
  before update on hr.jurisdiction_rule
  for each row execute function hr._jurisdiction_rule_status_authority_gate();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The ONE status door
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.jurisdiction_rule_set_status(
  p_rule_id uuid, p_new_status text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_row hr.jurisdiction_rule%rowtype;
  v_allowed boolean;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('granted', false, 'reason', 'not_superadmin',
      'detail', 'Promoting or demoting an employment-law rule is a superadmin action from the admin portal (D25).');
  end if;

  select * into v_row from hr.jurisdiction_rule
   where id = p_rule_id and deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('granted', false, 'reason', 'not_found');
  end if;

  if not (v_row.source_scope = 'statutory'
          or v_row.organization_id in
             (select so.organization_id from iam.system_orgs so where so.global_readable)) then
    return jsonb_build_object('granted', false, 'reason', 'not_a_platform_rule',
      'detail', 'This door manages the platform rule library. Org-authored rules are managed from the org''s law portal.');
  end if;

  v_allowed := (v_row.status, p_new_status) in
    (('draft','advisory'), ('draft','active'), ('advisory','active'),
     ('active','advisory'), ('advisory','draft'));
  if not v_allowed then
    return jsonb_build_object('granted', false, 'reason', 'transition_not_allowed',
      'detail', format('%s → %s is not a supported transition. Supersession happens through the amendment flow, never this door.', v_row.status, p_new_status),
      'from', v_row.status, 'to', p_new_status);
  end if;

  if p_new_status = 'active' and coalesce(btrim(p_reason), '') = '' then
    return jsonb_build_object('granted', false, 'reason', 'reason_required',
      'detail', 'Promotion to active records who signed off and on what basis. Review the citation and provide a sign-off note.');
  end if;

  begin
    perform set_config('hr.rule_status_door', 'hr_jurisdiction_rule_set_status', true);
    perform hr.arm_write();
    update hr.jurisdiction_rule
       set status = p_new_status,
           metadata = coalesce(metadata, '{}'::jsonb)
             || jsonb_build_object('status_history',
                  coalesce(metadata -> 'status_history', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'at', now(), 'by', (select auth.uid()),
                       'from', v_row.status, 'to', p_new_status,
                       'reason', p_reason,
                       'citation_at_change', v_row.citation)))
     where id = p_rule_id
     returning * into v_row;
  exception when others then
    -- The §6.1 fixture gate (or any other guard) refused. A refusal is data, not an exception.
    return jsonb_build_object('granted', false, 'reason', 'promotion_blocked',
      'detail', sqlerrm, 'from', v_row.status, 'to', p_new_status);
  end;
  perform set_config('hr.rule_status_door', '', true);

  return jsonb_build_object('granted', true, 'rule_id', v_row.id,
                            'status', v_row.status, 'version', v_row.version);
end
$function$;

create or replace function public.hr_jurisdiction_rule_set_status(
  p_rule_id uuid, p_new_status text, p_reason text default null)
returns jsonb language sql security definer set search_path to 'public', 'hr'
as $function$ select hr.jurisdiction_rule_set_status(p_rule_id, p_new_status, p_reason); $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The superadmin read door (routes 85 / 85a / 85b)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.jurisdiction_rules_admin_data()
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
begin
  if not public.is_super_admin() then
    return jsonb_build_object('granted', false, 'reason', 'not_superadmin');
  end if;

  return jsonb_build_object(
    'granted', true,
    'classes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'label', c.label, 'description', c.description,
        'precedence_mode', c.precedence_mode, 'org_configurable', c.org_configurable,
        'produces_money', c.produces_money, 'absence_semantics', c.absence_semantics,
        'consumer_engines', c.consumer_engines, 'is_active', c.is_active,
        'parameter_schema', c.parameter_schema
      ) order by c.slug), '[]'::jsonb)
      from hr.jurisdiction_rule_class c where c.deleted_at is null
    ),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rule_class', c.slug, 'rule_class_label', c.label,
        'produces_money', c.produces_money,
        'jurisdiction_key', r.jurisdiction_key, 'jurisdiction_name', j.name,
        'jurisdiction_level', j.level,
        'effective_from', r.effective_from, 'effective_to', r.effective_to,
        'status', r.status, 'basis', r.basis, 'citation', r.citation,
        'verification_due', r.verification_due, 'version', r.version,
        'source_scope', r.source_scope, 'organization_id', r.organization_id,
        'applicability', r.applicability, 'parameters', r.parameters,
        'unverified_keys', coalesce(r.parameters -> '_unverified', '[]'::jsonb),
        'jur_seed_task', r.metadata ->> 'jur_seed_task',
        'status_history', coalesce(r.metadata -> 'status_history', '[]'::jsonb),
        'supersedes_id', r.supersedes_id, 'correction_of_id', r.correction_of_id,
        'fixtures', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'code', t.code, 'title', t.title, 'expected_status', t.expected_status,
            'pinned', t.pinned_rule_id = r.id) order by t.code), '[]'::jsonb)
          from hr.jurisdiction_rule_test t
          where t.deleted_at is null
            and (t.pinned_rule_id = r.id
                 or (t.rule_class_id = r.rule_class_id and t.jurisdiction_key = r.jurisdiction_key))
        )
      ) order by c.slug, r.jurisdiction_key, r.effective_from), '[]'::jsonb)
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
      left join hr.jurisdiction j on j.key = r.jurisdiction_key
      where r.deleted_at is null
    ),
    'seed_progress', (
      select coalesce(jsonb_agg(to_jsonb(sp) order by sp.jur_seed_task), '[]'::jsonb)
      from platform.v_hr_jur_seed_progress sp
    ),
    'overdue', (
      select coalesce(jsonb_agg(to_jsonb(o) order by o.days_overdue desc), '[]'::jsonb)
      from platform.v_hr_jurisdiction_rule_overdue o
    )
  );
end
$function$;

create or replace function public.hr_jurisdiction_rules_admin_data()
returns jsonb language sql stable security definer set search_path to 'public', 'hr'
as $function$ select hr.jurisdiction_rules_admin_data(); $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. The org law portal read door
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.law_portal_data(p_organization_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_org_keys text[]; v_chain_keys text[];
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin',
      'detail', 'The law portal is an HR administration surface.');
  end if;

  -- Where the org operates: same derivation as hr.validate_org_config (hr_l3_73).
  select array_agg(distinct k) into v_org_keys from (
    select j.key as k
      from hr.establishment e join hr.jurisdiction j on j.id = e.jurisdiction_id
     where e.organization_id = p_organization_id and e.deleted_at is null
    union
    select j.key
      from hr.location l join hr.jurisdiction j on j.id = l.jurisdiction_id
     where l.organization_id = p_organization_id and l.deleted_at is null
  ) s;
  v_org_keys := coalesce(v_org_keys, '{}'::text[]);

  -- Expand each operating key to its full chain (city → county → state → US).
  -- hr.jurisdiction_chain returns [{key,name,level}, …]; we want the keys.
  select coalesce(array_agg(distinct ck ->> 'key'), array['US']) into v_chain_keys
    from unnest(v_org_keys) k,
         jsonb_array_elements(hr.jurisdiction_chain(k)) ck;

  return jsonb_build_object(
    'granted', true,
    'org_jurisdiction_keys', to_jsonb(v_org_keys),
    'chain_keys', to_jsonb(v_chain_keys),
    'classes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'label', c.label, 'description', c.description,
        'org_configurable', c.org_configurable, 'produces_money', c.produces_money,
        'parameter_schema', c.parameter_schema
      ) order by c.slug), '[]'::jsonb)
      from hr.jurisdiction_rule_class c where c.deleted_at is null and c.is_active
    ),
    -- The platform baseline: never draft (draft never resolves, §1.3), never superseded.
    'platform_rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rule_class', c.slug, 'rule_class_label', c.label,
        'produces_money', c.produces_money, 'org_configurable', c.org_configurable,
        'jurisdiction_key', r.jurisdiction_key, 'jurisdiction_name', j.name,
        'jurisdiction_level', j.level,
        'effective_from', r.effective_from, 'effective_to', r.effective_to,
        'status', r.status, 'basis', r.basis, 'citation', r.citation,
        'parameters', r.parameters, 'applicability', r.applicability,
        'unverified_keys', coalesce(r.parameters -> '_unverified', '[]'::jsonb),
        'version', r.version,
        'applies_to_org', r.jurisdiction_key = any (v_chain_keys)
      ) order by c.slug, r.jurisdiction_key), '[]'::jsonb)
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
      left join hr.jurisdiction j on j.key = r.jurisdiction_key
      where r.deleted_at is null and r.status in ('active', 'advisory')
        and (r.source_scope = 'statutory'
             or r.organization_id in
                (select so.organization_id from iam.system_orgs so where so.global_readable))
    ),
    -- The org's own rung: overrides and org-authored additions, layered over the baseline.
    'org_rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rule_class', c.slug, 'rule_class_label', c.label,
        'jurisdiction_key', r.jurisdiction_key, 'jurisdiction_name', j.name,
        'effective_from', r.effective_from, 'effective_to', r.effective_to,
        'status', r.status, 'basis', r.basis, 'citation', r.citation,
        'parameters', r.parameters, 'applicability', r.applicability,
        'version', r.version
      ) order by c.slug, r.jurisdiction_key), '[]'::jsonb)
      from hr.jurisdiction_rule r
      join hr.jurisdiction_rule_class c on c.id = r.rule_class_id
      left join hr.jurisdiction j on j.key = r.jurisdiction_key
      where r.deleted_at is null and r.organization_id = p_organization_id
        and r.source_scope = 'org_policy'
    )
  );
end
$function$;

create or replace function public.hr_law_portal_data(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'hr'
as $function$ select hr.law_portal_data(p_organization_id); $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. The org override write path
-- ────────────────────────────────────────────────────────────────────────────

create or replace function hr.org_jurisdiction_rule_save(
  p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_rung text; v_class hr.jurisdiction_rule_class%rowtype; v_id uuid;
  v_existing hr.jurisdiction_rule%rowtype; v_pre jsonb; v_row hr.jurisdiction_rule%rowtype;
  v_key text; v_params jsonb;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin',
      'detail', 'Org rules are authored by HR administration.');
  end if;

  select * into v_class from hr.jurisdiction_rule_class
   where slug = p_payload ->> 'rule_class' and deleted_at is null;
  if v_class.id is null then
    return jsonb_build_object('granted', false, 'reason', 'unknown_rule_class');
  end if;
  if v_class.org_configurable = 'no' then
    return jsonb_build_object('granted', false, 'reason', 'class_not_org_configurable',
      'detail', format('%s is statutory-only: an organization configures how it complies (reminders, posture), never the legal content.', v_class.label));
  end if;

  v_key := coalesce(nullif(p_payload ->> 'jurisdiction_key', ''), 'US');
  if not exists (select 1 from hr.jurisdiction j where j.key = v_key) then
    return jsonb_build_object('granted', false, 'reason', 'unknown_jurisdiction', 'jurisdiction_key', v_key);
  end if;
  v_params := coalesce(p_payload -> 'parameters', '{}'::jsonb);

  -- §3.2: validate against the statutory floor. A violation is a refusal, not a clamp;
  -- advisory law warns and needs an explicit acknowledgement, never a block.
  v_pre := hr.validate_org_config(p_organization_id, v_class.slug, v_params,
                                  array[v_key], current_date);
  if not coalesce((v_pre ->> 'ok')::boolean, true) then
    return jsonb_build_object('granted', false, 'reason', 'unlawful_configuration',
      'validation', v_pre, 'payload', p_payload);
  end if;
  if jsonb_array_length(coalesce(v_pre -> 'warnings', '[]'::jsonb)) > 0 and not p_accept_warnings then
    return jsonb_build_object('granted', false, 'reason', 'warnings_unacknowledged',
      'validation', v_pre, 'payload', p_payload, 'save_anyway', true);
  end if;

  v_id := nullif(p_payload ->> 'id', '')::uuid;
  if v_id is not null then
    select * into v_existing from hr.jurisdiction_rule
     where id = v_id and organization_id = p_organization_id
       and source_scope = 'org_policy' and deleted_at is null;
    if v_existing.id is null then
      return jsonb_build_object('granted', false, 'reason', 'not_found',
        'detail', 'Only this organization''s own rules can be edited here. The platform baseline is read-only.');
    end if;
  end if;

  begin
    perform hr.arm_write();
    if v_id is null then
      insert into hr.jurisdiction_rule
        (rule_class_id, jurisdiction_key, effective_from, effective_to, applicability,
         parameters, status, basis, citation, source_scope, organization_id, visibility)
      values
        (v_class.id, v_key,
         coalesce(nullif(p_payload ->> 'effective_from', '')::date, current_date),
         nullif(p_payload ->> 'effective_to', '')::date,
         coalesce(p_payload -> 'applicability', '[]'::jsonb),
         v_params, 'active',
         coalesce(nullif(p_payload ->> 'basis', ''), 'Organization policy'),
         coalesce(p_payload -> 'citation',
                  jsonb_build_object('authority', 'Organization policy', 'url', null)),
         'org_policy', p_organization_id, 'internal')
      returning * into v_row;
    else
      update hr.jurisdiction_rule set
        jurisdiction_key = v_key,
        effective_from = coalesce(nullif(p_payload ->> 'effective_from', '')::date, effective_from),
        effective_to = nullif(p_payload ->> 'effective_to', '')::date,
        applicability = coalesce(p_payload -> 'applicability', applicability),
        parameters = v_params,
        basis = coalesce(nullif(p_payload ->> 'basis', ''), basis),
        citation = coalesce(p_payload -> 'citation', citation)
       where id = v_id
      returning * into v_row;
    end if;
  exception when sqlstate '23514' or sqlstate '23P01' or sqlstate '23505' then
    return jsonb_build_object('granted', false, 'reason', 'rule_constraint_violated',
      'detail', sqlerrm, 'payload', p_payload);
  end;

  return jsonb_build_object('granted', true, 'rule_id', v_row.id,
                            'version', v_row.version, 'validation', v_pre);
end
$function$;

create or replace function public.hr_org_jurisdiction_rule_save(
  p_organization_id uuid, p_payload jsonb, p_accept_warnings boolean default false)
returns jsonb language sql security definer set search_path to 'public', 'hr'
as $function$ select hr.org_jurisdiction_rule_save(p_organization_id, p_payload, p_accept_warnings); $function$;

create or replace function hr.org_jurisdiction_rule_deactivate(
  p_organization_id uuid, p_rule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_rung text; v_row hr.jurisdiction_rule%rowtype;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  if v_rung not in ('hr_admin', 'hr_owner') then
    return jsonb_build_object('granted', false, 'reason', 'not_an_hr_admin');
  end if;

  select * into v_row from hr.jurisdiction_rule
   where id = p_rule_id and organization_id = p_organization_id
     and source_scope = 'org_policy' and deleted_at is null;
  if v_row.id is null then
    return jsonb_build_object('granted', false, 'reason', 'not_found',
      'detail', 'Only this organization''s own rules can be retired here.');
  end if;

  perform hr.arm_write();
  update hr.jurisdiction_rule set deleted_at = now() where id = p_rule_id;

  return jsonb_build_object('granted', true, 'rule_id', p_rule_id);
end
$function$;

create or replace function public.hr_org_jurisdiction_rule_deactivate(
  p_organization_id uuid, p_rule_id uuid)
returns jsonb language sql security definer set search_path to 'public', 'hr'
as $function$ select hr.org_jurisdiction_rule_deactivate(p_organization_id, p_rule_id); $function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Door seals: PUBLIC and anon revoked by name, authenticated granted.
-- ────────────────────────────────────────────────────────────────────────────

select hr.leave_seal_door('hr_jurisdiction_rule_set_status');
select hr.leave_seal_door('hr_jurisdiction_rules_admin_data');
select hr.leave_seal_door('hr_law_portal_data');
select hr.leave_seal_door('hr_org_jurisdiction_rule_save');
select hr.leave_seal_door('hr_org_jurisdiction_rule_deactivate');

-- ────────────────────────────────────────────────────────────────────────────
-- Self-proof. Everything in rolled-back subtransactions; database left unchanged.
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_rule hr.jurisdiction_rule%rowtype;
  v_res jsonb;
  v_raised boolean := false;
begin
  -- named objects exist
  perform 'hr._jurisdiction_rule_status_authority_gate()'::regprocedure;
  perform 'hr.jurisdiction_rule_set_status(uuid,text,text)'::regprocedure;
  perform 'public.hr_jurisdiction_rule_set_status(uuid,text,text)'::regprocedure;
  perform 'hr.jurisdiction_rules_admin_data()'::regprocedure;
  perform 'hr.law_portal_data(uuid)'::regprocedure;
  perform 'hr.org_jurisdiction_rule_save(uuid,jsonb,boolean)'::regprocedure;
  perform 'hr.org_jurisdiction_rule_deactivate(uuid,uuid)'::regprocedure;
  if not exists (select 1 from pg_trigger where tgrelid = 'hr.jurisdiction_rule'::regclass
                   and tgname = '_zz_jurisdiction_rule_authority_gate') then
    raise exception 'proof failed: authority gate trigger missing';
  end if;

  -- anon holds no execute on any door
  if exists (
    select 1 from information_schema.routine_privileges rp
     where rp.routine_schema = 'public'
       and rp.routine_name in ('hr_jurisdiction_rule_set_status','hr_jurisdiction_rules_admin_data',
                               'hr_law_portal_data','hr_org_jurisdiction_rule_save',
                               'hr_org_jurisdiction_rule_deactivate')
       and rp.grantee in ('anon','PUBLIC')) then
    raise exception 'proof failed: a door is reachable by anon';
  end if;

  select * into v_rule from hr.jurisdiction_rule
   where deleted_at is null and status = 'advisory' and source_scope = 'statutory' limit 1;
  if v_rule.id is null then
    raise exception 'proof failed: no advisory statutory rule to probe with';
  end if;

  -- D25 PROOF 1: a direct armed UPDATE (the migration/service shape — no auth.uid, no door)
  -- cannot promote. This very block runs as the migration role, so a raise here IS the proof.
  begin
    perform hr.arm_write();
    update hr.jurisdiction_rule set status = 'active' where id = v_rule.id;
    raise exception 'proof failed: a migration-shaped write promoted a platform rule';
  exception when sqlstate '42501' then
    v_raised := true;  -- refused by the authority gate, as D25 requires
  end;
  if not v_raised then
    raise exception 'proof failed: authority gate did not fire';
  end if;

  -- D25 PROOF 2: the door itself refuses a non-superadmin caller with an envelope, not a raise.
  v_res := hr.jurisdiction_rule_set_status(v_rule.id, 'active', 'proof probe');
  if coalesce(v_res ->> 'granted', 'true') <> 'false'
     or v_res ->> 'reason' <> 'not_superadmin' then
    raise exception 'proof failed: status door did not refuse a non-superadmin (%)', v_res;
  end if;

  -- read doors refuse cleanly with no session
  v_res := hr.jurisdiction_rules_admin_data();
  if coalesce(v_res ->> 'granted', 'true') <> 'false' then
    raise exception 'proof failed: admin read door open to a non-superadmin';
  end if;
  v_res := hr.law_portal_data('39c38960-d30c-4840-b0c1-c9960de95582'::uuid);
  if coalesce(v_res ->> 'granted', 'true') <> 'false' then
    raise exception 'proof failed: law portal open without HR standing';
  end if;

  raise notice 'hr_l9_00 proof green: authority gate live, doors sealed, refusals are envelopes';
end
$$;
