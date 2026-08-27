-- HR domain C4 — migration 21 (register item HRB-008 follow-up, lane workflow-engine; round-16).
--
-- 🚨 A FRESH ORG COULD NOT APPROVE A PAY CHANGE AT ALL, AND FOUND OUT ONLY AFTER SUBMITTING ONE.
--
-- Check 28 (`hr.pay_changes_without_an_approver`) measured it and correctly refused to invent the
-- answer from a read lane. The SQL lane's three premise corrections are accepted and recorded:
-- SPEC-ACCESS §1.1's bootstrap enumerates what activation creates and **no `approval_authority` row
-- is in that list** (`hr_activate_employer` matches the spec exactly), the D14 citation was wrong,
-- and the org is **unseeded, not deadlocked** — `hr_authority_grant` admits
-- `iam.organization_member.role = 'owner'` explicitly, so the owner could always have granted it.
-- The design call is the coordinator's under D13's default-with-override doctrine; this file builds
-- it.
--
-- ===================================================================================
-- 1. ACTIVATION SEEDS THE OWNER AS THE RANK-1 HOLDER OF THE `require_second_actor` ACTIONS
--
-- The owner is ALREADY the backstop — `hr_authority_grant` has an explicit owner arm. Seeding makes
-- that default **visible in the authority register** instead of latent inside a gate, which is the
-- D13 shape: a default you can see, revoke and re-grant. An org that wants different governance
-- revokes the founding rows and grants its own; nothing here is unrevocable.
--
-- 🚨 **SCOPE WIDENED FROM THE BRIEF, DELIBERATELY, AND REPORTED.** The instruction named four
-- actions parenthetically (pay change, termination, offer, adverse action) but defined the set as
-- *"the risk-split set"*. Live, `sole_authority_mode = require_second_actor` covers **twelve**:
-- the four named plus `address_change_approve`, `asset_recovery_approve`, `corrective_action_issue`,
-- `position_change_approve`, `profile_change_approve`, `requisition_approve`,
-- `signature_countersign`, `timecard_correction_approve`. Seeding only four would leave the same
-- hole open on the other eight — every one of which is equally unapprovable today, since
-- `hr.approval_authority` is empty database-wide. The set is taken from the vocabulary, so it
-- cannot drift from the risk split it is named after.
--
-- 🚨 **`granted_by` DOES NOT EXIST ON THIS TABLE.** `hr.approval_authority` carries `source`
-- (CHECK: `assigned | delegated` only) and `metadata`. So the rows are `source = 'assigned'` — they
-- ARE assigned, not delegated — and the provenance lives in `metadata`, carrying
-- `basis = 'activation'` to match the bootstrap's one audit pattern
-- (`hr._record_access_audit(..., p_basis => 'activation', p_actor_type => 'org_owner')`), plus the
-- function that wrote them. The activation audit's `p_target_ids` gains the new rows, so the single
-- highest-privilege event in the domain's life names them too.
--
-- ===================================================================================
-- 2. PRE-FLIGHT: A SUBMISSION THAT NOBODY COULD EVER APPROVE IS REFUSED AT THE FRONT DOOR
--
-- Minting an instance that fails `approver_ineligible` a moment later tells the requester nothing
-- they can act on. `hr.wf_request` now asks, BEFORE it writes anything, whether any active
-- employment with a login in this organization satisfies **`hr.can_approve`** for the first human
-- step's action against this target — the PREDICATE, never a re-derived copy of the resolver — and
-- refuses with the named condition and the door if none does.
--
-- The post-hoc failure machinery stays exactly as it is: a concurrent revocation between submit and
-- a later step's activation can still strand an instance, and that is what `unroutable` /
-- `approver_ineligible` / `sole_actor_deadlock` and the failure queue are for. The pre-flight is the
-- front door's honesty, not a replacement for them.
--
-- Deliberately NOT pre-flighted: self-steps (`allows_self` — the subject is always the approver),
-- and modes 1–2 (deterministic auto-decide never resolves an approver at all, §7.1).
--
-- Authority: SPEC-ACCESS §1.1 (the bootstrap and its audit pattern), §1.4 rule 3 (the risk split),
-- D13 (default-with-override); SPEC-WORKFLOW-ENGINE §2.2, §4.2.
-- Applied live as `hr_c4_21_founding_authorities_and_preflight`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn'
     and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_21_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the founding-authority writer
-- ONE function, so activation and the backfill cannot diverge (the same discipline as
-- hr._wf_not_attested). It is idempotent per (org, holder, action).
create or replace function hr._seed_founding_authorities(p_organization_id uuid,
                                                         p_holder_employment_id uuid,
                                                         p_basis text default 'activation')
returns uuid[]
language plpgsql security definer set search_path = hr, public
as $fn$
declare v_ids uuid[] := '{}'; v_id uuid; r record;
begin
  if p_organization_id is null or p_holder_employment_id is null then
    return v_ids;
  end if;
  perform hr.arm_write();
  for r in
    -- the set is READ FROM THE VOCABULARY, so it cannot drift from the risk split it is named after
    select c.slug from platform.categories c
     where c.dimension = 'hr_approval_action' and c.deleted_at is null
       and c.metadata ->> 'sole_authority_mode' = 'require_second_actor'
     order by c.slug
  loop
    if exists (select 1 from hr.approval_authority a
                where a.organization_id = p_organization_id
                  and a.action_type = r.slug
                  and a.holder_kind = 'employment'
                  and a.holder_id = p_holder_employment_id::text) then
      continue;
    end if;
    insert into hr.approval_authority
      (organization_id, holder_kind, holder_id, action_type, scope_kind, scope_id,
       rank, source, is_active, effective_from, metadata)
    values (p_organization_id, 'employment', p_holder_employment_id::text, r.slug, 'org', null,
            1, 'assigned', true, current_date,
            -- `granted_by` is not a column on this table; the provenance lives here, and `basis`
            -- matches the bootstrap's own audit vocabulary (hr._record_access_audit p_basis).
            jsonb_build_object(
              'basis', p_basis,
              'granted_by', 'hr._seed_founding_authorities',
              'doctrine', 'D13 default-with-override: the org owner is seeded as the rank-1 holder of every require_second_actor action so the default is VISIBLE in the authority register instead of latent in a gate. Revoke and re-grant to govern differently.',
              'seeded_at', now()))
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end
$fn$;

revoke all on function hr._seed_founding_authorities(uuid, uuid, text) from public, anon, authenticated;

comment on function hr._seed_founding_authorities is
  'SPEC-ACCESS §1.1 / §1.4 rule 3 / D13 — seeds the org owner as rank-1, org-scoped holder of every `require_second_actor` approval action, so a fresh org can approve a pay change without a hand-grant and the default is visible and revocable in the authority register. Called by hr_activate_employer and by hr_c4_21''s backfill, so the two cannot diverge. Idempotent per (org, holder, action). source=assigned (the CHECK admits only assigned|delegated); provenance in metadata.basis.';

-- ============================================================ 2. activation calls it
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra], p_sensitivity_tier => 'directory',$o$;
  v_rep constant text := $o$    -- D13 / §1.4 rule 3: the owner is seeded as rank-1 holder of the require_second_actor
    -- actions, so a fresh org can approve a pay change without a hand-grant and the default is
    -- VISIBLE in the authority register rather than latent in hr_authority_grant's owner arm.
    p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra]
                    || hr._seed_founding_authorities(v_org, v_empl, 'activation'),
    p_sensitivity_tier => 'directory',$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_activate_employer';
  if v_oid is null then raise exception 'hr_c4_21: public.hr_activate_employer does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$_seed_founding_authorities$chk$ in v_def) > 0 then
    raise notice 'hr_c4_21: activation already seeds the founding authorities';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_21: hr_activate_employer does not carry the expected audit call — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_21: activation now seeds the founding authorities and names them in its audit';
  end if;
end
$mig$;

-- ============================================================ 3. backfill, same writer, same marks
do $$
declare v_org uuid; v_holder uuid; v_n integer := 0; v_rows integer := 0; r record;
begin
  for r in
    -- the owner IS the first hr_owner role assignment, which is exactly what activation creates
    select ra.organization_id, min(ra.employment_id::text)::uuid as holder
      from hr.role_assignment ra
      join hr.employment em on em.id = ra.employment_id and em.deleted_at is null
     where ra.role_key = 'hr_owner' and ra.is_active and ra.revoked_at is null
     group by ra.organization_id
  loop
    v_rows := cardinality(hr._seed_founding_authorities(r.organization_id, r.holder, 'activation_backfill'));
    if v_rows > 0 then v_n := v_n + 1; end if;
  end loop;
  raise notice 'hr_c4_21: backfilled founding authorities into % organization(s)', v_n;
end $$;

-- ============================================================ 4. the pre-flight
do $mig$
declare
  v_oid oid; v_def text;
  v_up_old constant text := $o$          and e2.login_user_id is not null
          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))$o$;
  v_up_new constant text := $o$          and e2.login_user_id is not null
          -- §2.2 eligibility rule 2: where the flow type marks the requester an interested party,
          -- the resolver will strike them. A pre-flight that counted them would wave through
          -- exactly the case it exists to catch.
          and not (coalesce(ft.requester_is_interested_party, false)
                   and v_requester is not null
                   and em2.id = v_requester
                   and v_requester is distinct from v_subject)
          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))$o$;
  v_dec_old constant text := $o$  v_tbl text; v_subject uuid; v_digest text; v_version integer; sd record; v_org uuid;$o$;
  v_dec_new constant text := $o$  v_tbl text; v_subject uuid; v_digest text; v_version integer; sd record; v_org uuid;
  v_pf_action text; v_pf_step text;$o$;
  v_old constant text := $o$  -- ---- 🚨 D275: THE EXCLUSIVE BINDING IS CHECKED BEFORE ANYTHING IS WRITTEN.$o$;
  v_rep constant text := $o$  -- ---- 🚨 PRE-FLIGHT (hr_c4_21): A REQUEST NOBODY COULD EVER APPROVE IS REFUSED AT THE FRONT
  -- DOOR, not minted and then failed `approver_ineligible` a moment later. The question is put to
  -- hr.can_approve — THE PREDICATE, never a re-derived copy of the resolver — for the first human
  -- step of the pinned definition. Self-steps and modes 1-2 are skipped on purpose: the subject is
  -- always the approver of the former, and the latter never resolve an approver at all (§7.1).
  -- The post-hoc machinery stays for concurrent revocation between submit and a later activation.
  select sd2.authority_action, sd2.step_key into v_pf_action, v_pf_step
    from hr.workflow_step_definition sd2
   where sd2.workflow_definition_id = defn.id and sd2.deleted_at is null
     and sd2.authority_action is not null
     and not sd2.allows_self
     and coalesce(sd2.autonomy_mode, 4) not in (1, 2)
   order by sd2.step_order, sd2.step_key
   limit 1;
  if v_pf_action is not null
     and not exists (
       select 1 from hr.employment em2
         join hr.employee e2 on e2.id = em2.employee_id
        where em2.organization_id = p_organization_id
          and em2.deleted_at is null and em2.status = 'active'
          and e2.login_user_id is not null
          -- §2.2 eligibility rule 2: where the flow type marks the requester an interested party,
          -- the resolver will strike them. A pre-flight that counted them would wave through
          -- exactly the case it exists to catch — the sole authority holder proposing a pay change
          -- for somebody else, which then fails approver_ineligible after the fact.
          and not (coalesce(ft.requester_is_interested_party, false)
                   and v_requester is not null
                   and em2.id = v_requester
                   and v_requester is distinct from v_subject)
          and hr.can_approve(e2.login_user_id, v_pf_action, v_tbl, p_target_id))
  then
    return jsonb_build_object(
      'granted', false, 'reason', 'WF_NO_POSSIBLE_APPROVER',
      'detail', format('Nobody in this organization can approve a %s yet. Grant the authority first, then submit again.',
                       replace(replace(p_flow_key, '_', ' '), ' request', '')),
      'action_type', v_pf_action, 'step_key', v_pf_step, 'flow_key', p_flow_key,
      'door', 'hr_authority_grant',
      'remedy', 'An organization owner or HR administrator grants this approval authority to somebody; the request can then be submitted and will route to them.');
  end if;

  -- ---- 🚨 D275: THE EXCLUSIVE BINDING IS CHECKED BEFORE ANYTHING IS WRITTEN.$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  v_def := pg_get_functiondef(v_oid);
  -- the marker is the TIGHTENED predicate: an earlier run installed a pre-flight that counted a
  -- requester §2.2 rule 2 will strike, and keying on the older marker would leave it standing.
  -- 🚨 THREE STATES. An earlier run installed a pre-flight that COUNTED a requester §2.2 rule 2
  -- will strike — so the sole authority holder proposing somebody else's pay change sailed through
  -- the front door and failed approver_ineligible a moment later, which is the exact case the
  -- pre-flight exists to catch. Upgrading has to patch the predicate WITHOUT re-running the declare,
  -- or plpgsql refuses the duplicate v_pf_action.
  if position($chk$requester_is_interested_party, false)$chk$ in v_def) > 0 then
    raise notice 'hr_c4_21: hr.wf_request already pre-flights, requester-aware';
  elsif position($chk$WF_NO_POSSIBLE_APPROVER$chk$ in v_def) > 0 then
    if position(v_up_old in v_def) = 0 then
      raise exception 'hr_c4_21: hr.wf_request carries a pre-flight in a shape this file does not recognise';
    end if;
    execute replace(v_def, v_up_old, v_up_new);
    raise notice 'hr_c4_21: hr.wf_request''s pre-flight no longer counts a requester the resolver will strike';
  else
    if position(v_dec_old in v_def) = 0 or position(v_old in v_def) = 0 then
      raise exception 'hr_c4_21: hr.wf_request does not carry the expected declare/binding text — refusing to half-apply';
    end if;
    execute replace(replace(v_def, v_dec_old, v_dec_new), v_old, v_rep);
    raise notice 'hr_c4_21: hr.wf_request refuses up front when nobody could ever approve';
  end if;
end
$mig$;

-- ============================================================ 5. check 28's allowlist, deleted
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$   where t.compensation_id not in (
           -- KNOWN 2026-08-27, owned by the workflow/access lane. Re-date only with a fix.
           'eeb61ea4-d194-4f73-b88e-e5c1626708e0'::uuid,
           'a2b5f2b9-ec20-4f97-b362-f6763b8eb62a'::uuid);$o$;
  v_rep constant text := $o$   ;
  -- CLOSED 2026-08-27 (hr_c4_21): the allowlist is deleted, not re-dated. A fresh org's owner is
  -- now seeded as the rank-1 holder of every require_second_actor action at activation (D13
  -- default-with-override, visible and revocable in the authority register), and existing orgs were
  -- backfilled by the same writer with the same provenance.$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$CLOSED 2026-08-27 (hr_c4_21)$chk$ in v_def) > 0 then
    raise notice 'hr_c4_21: check 28''s allowlist is already deleted';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_21: check 28 does not carry the expected allowlist — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_21: check 28''s allowlist deleted';
  end if;
end
$mig$;

-- ============================================================ 6. post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_left jsonb;
begin
  -- 🚨 THE MEASUREMENT: no pay change is without an approver, and the allowlist is gone.
  select coalesce(jsonb_agg(jsonb_build_object('subject', t.subject, 'shape', t.shape)), '[]'::jsonb)
    into v_left from hr.pay_changes_without_an_approver() t;
  if v_left <> '[]'::jsonb then
    raise exception 'hr_c4_21: % pay change(s) still have no approver: %',
      jsonb_array_length(v_left), v_left;
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if v_src ~ 'eeb61ea4-d194-4f73-b88e-e5c1626708e0' then
    raise exception 'hr_c4_21: check 28 still carries its allowlist';
  end if;
  -- and check 26 stayed closed
  if (select count(*) from hr.timecards_without_an_approver()) > 0 then
    raise exception 'hr_c4_21: check 26 reopened';
  end if;

  -- the founding rows exist, carry their provenance, and are revocable ordinary rows
  select count(*) into v_bad from hr.approval_authority
   where metadata ->> 'basis' in ('activation','activation_backfill')
     and (source <> 'assigned' or rank <> 1 or scope_kind <> 'org' or holder_kind <> 'employment');
  if v_bad > 0 then
    raise exception 'hr_c4_21: % founding row(s) are not rank-1 org-scoped assigned employment rows', v_bad;
  end if;
  select count(*) into v_bad from hr.approval_authority
   where metadata ->> 'basis' in ('activation','activation_backfill')
     and metadata ->> 'granted_by' is distinct from 'hr._seed_founding_authorities';
  if v_bad > 0 then
    raise exception 'hr_c4_21: % founding row(s) do not name what granted them', v_bad;
  end if;

  -- ONE writer: activation and the backfill cannot diverge
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hr_activate_employer')
     !~ '_seed_founding_authorities' then
    raise exception 'hr_c4_21: activation does not seed the founding authorities';
  end if;
  -- and the seeded set is the vocabulary's risk split, not a literal list
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_seed_founding_authorities')
     !~ 'sole_authority_mode'' = ''require_second_actor' then
    raise exception 'hr_c4_21: the seeded action set is not read from the vocabulary';
  end if;

  -- the pre-flight defers to the PREDICATE and skips what it must
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_src !~ 'WF_NO_POSSIBLE_APPROVER' or v_src !~ 'hr\.can_approve\(e2\.login_user_id' then
    raise exception 'hr_c4_21: hr.wf_request does not pre-flight against hr.can_approve';
  end if;
  if v_src !~ 'not sd2\.allows_self' or v_src !~ 'autonomy_mode, 4\) not in \(1, 2\)' then
    raise exception 'hr_c4_21: the pre-flight does not skip self-steps and auto-decide modes';
  end if;
  if v_src !~ 'requester_is_interested_party, false\)' then
    raise exception 'hr_c4_21: the pre-flight counts a requester the resolver will strike (§2.2 rule 2)';
  end if;
  -- the post-hoc machinery is untouched
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'sole_actor_deadlock' then
    raise exception 'hr_c4_21: the post-hoc failure naming was lost';
  end if;

  -- hr_c4_20 still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'can_approve')
     !~ 'coalesce\(v_mode, ''require_second_actor''\) = ''auto_record''' then
    raise exception 'hr_c4_21: hr_c4_20''s tier-scoped RULE 2b was lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn'
     and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_21_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_21: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
