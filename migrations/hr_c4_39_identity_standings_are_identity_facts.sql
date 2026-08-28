-- HR domain C4 — migration 39 (register item HRB-008; D284 ruled by the coordinator 2026-08-28,
-- and the refusal-sentence correction from the same ruling).
--
-- 🚨 A PRE-START HIRE COULD NOT READ THEIR OWN REQUEST.
--
-- `hr.employments_of(user, at)` filters `em.hire_date <= p_at`, so an employment whose hire date is
-- in the future resolves to `{}`. Every workflow visibility standing was built on that array, so a
-- person onboarded but not yet started failed ALL FIVE — including *"subject of it"* — on a request
-- ABOUT THEMSELVES. Measured: Marisol Okonkwo-R36 (`hire_date 2026-09-15`, status `pending`),
-- subject AND requester of a closed `profile_edit_request`, was told by the instance door
-- *"you have no standing on this request"*.
--
-- ===================================================================================
-- THE RULING — an extension of hr_l3_88's law:
--   **IDENTITY STANDINGS ARE IDENTITY FACTS, NOT DATE-SCOPED ONES.**
--
-- hr_l3_88 RD 2b found exactly this, one lane over, and wrote it down: *"Self is an IDENTITY fact —
-- this employment's employee is me — and identity is not date-scoped."* That lane's first cut had
-- mirrored the capability arm onto the self arm and denied a `pending` hire her own timesheet. This
-- migration applies the same law to workflow visibility.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE VARIANT IS READ-STANDING ONLY, AND `hr.employments_of` IS NOT TOUCHED. `hr.employments_of`
--    is the backbone of `hr.capability` and of every HR write door; widening it would widen read AND
--    WRITE standing everywhere at once, which is why D284 was filed rather than fixed in the lane
--    that found it. `hr._employments_of_identity` is a SEPARATE function — the identity linkage with
--    the date window removed and nothing else changed — and it is called from exactly two places,
--    both of them read paths, both listed in contract rows.
--
-- 2. 🚨 ONLY THE TWO IDENTITY ARMS MOVE. In `hr._wf_instance_visible`:
--      · "filed it" (requester) and "subject of it"  → identity linkage. CHANGED.
--      · "routed it" (`p_user = any(s.resolved_user_ids)`) and "decided it"
--        (`d.actor_user_id = p_user`) → already resolve on the USER id and are RECORDED FACTS about
--        what happened. Untouched, and they never needed `employments_of` in the first place.
--      · `workflow.view_queue` → capability-gated and DATE-SCOPED. Untouched, deliberately: a
--        pre-start hire must wield no admin power. This is hr_l3_43's law (current standing governs
--        what history you may read) and it is the line that keeps this change a READ widening of
--        self-standing rather than a grant of anything.
--
-- 3. THE INBOX'S OWN-REQUESTS ARM MOVES TOO, AND ONLY THAT ONE. `hr.wf_pending`'s
--    `waiting_on_others` is by its own comment *"the person's own filed requests"* — the same
--    identity standing, resolved through the same date-scoped array, so a pre-start hire's inbox
--    could not list a request they had filed. `failures_assigned_to_me` and `recently_decided` stay
--    on `hr.employments_of`: those are work assigned to, or performed by, somebody with CURRENT
--    standing, and neither is a self-read of one's own request. `hr.wf_inbox`'s own `v_emp` is
--    likewise untouched — it feeds the `queue` and `team` SCOPES, which are capability and
--    manager-chain surfaces.
--
-- 4. THE REFUSAL SENTENCE, CORRECTED BY THE SAME RULING. hr_c4_38 narrowed publishing to hr_owner
--    but kept the old sentence, which told an hr_admin they needed *"HR administration standing"* —
--    the exact standing they hold. It now reads: *"Publishing a routing definition rewrites who
--    approves what, so it needs the HR owner — HR administration standing is not enough."* It states
--    the bar and why, names no remedy, and stays in `detail`; no schema change.
--
-- Authority: the coordinator's ruling (2026-08-28, AMENDMENT-QUEUE); hr_l3_88 RD 2b (identity is
-- not date-scoped); hr_l3_43 (current standing governs history reads); SPEC-ACCESS §1.4.
-- Applied live as `hr_c4_39_identity_standings_are_identity_facts`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_39_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the read-standing variant (RD 1)
create or replace function hr._employments_of_identity(p_user uuid)
returns uuid[]
language sql stable security definer set search_path = hr, public
as $fn$
  -- hr.employments_of, with the DATE WINDOW REMOVED and nothing else changed. This answers
  -- "which employments are MINE" — an identity fact — rather than "which employments am I
  -- currently standing in", which is what hr.employments_of answers and must keep answering.
  -- Soft-deletes are still honoured: a deleted row is not a fact about anybody.
  select coalesce(array_agg(distinct em.id), '{}'::uuid[])
    from hr.employee e
    join hr.employment em on em.employee_id = e.id and em.deleted_at is null
   where e.login_user_id = p_user
     and e.deleted_at is null;
$fn$;

revoke all on function hr._employments_of_identity(uuid) from public, anon, authenticated;

comment on function hr._employments_of_identity is
  'Which employments belong to this login, as an IDENTITY fact — hr.employments_of without the hire_date/termination_date window. READ STANDING ONLY: it exists so a pre-start or past employee can see their OWN request (hr_c4_39, D284), and it must never be used for capability or write standing, which stay date-scoped on hr.employments_of. Called from hr._wf_instance_visible and hr.wf_pending''s own-requests arm, and nowhere else.';

-- ============================================================ 2. the two identity arms (RD 2)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  v_mine := hr.employments_of(p_user);$o$;
  v_new constant text := $o$  -- 🚨 IDENTITY STANDINGS ARE IDENTITY FACTS, NOT DATE-SCOPED ONES (hr_l3_88 RD 2b, extended).
  -- hr.employments_of filters hire_date <= today, so a PRE-START hire resolved to {} and failed
  -- "filed it" and "subject of it" on a request ABOUT THEMSELVES — the instance door told Marisol
  -- Okonkwo-R36 "you have no standing on this request" about her own profile edit (D284). Whether
  -- this request is MINE is a fact about identity, not about today's date. The capability arm below
  -- keeps using hr.capability and stays date-scoped: a pre-start hire wields no admin power.
  v_mine := hr._employments_of_identity(p_user);$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_instance_visible';
  v_def := pg_get_functiondef(v_oid);
  if position('_employments_of_identity' in v_def) > 0 then
    raise notice 'hr_c4_39: the visibility predicate already resolves identity standings by identity';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_39: hr._wf_instance_visible does not carry the expected resolution — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_39: hr._wf_instance_visible resolves "filed it" and "subject of it" by identity';
  end if;
end
$mig$;

-- ============================================================ 3. the inbox's own-requests arm (RD 3)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$       where i.state in ('validating','routing','active','applying','verifying')
         and (i.requester_employment_id = any(v_emp) or i.subject_employment_id = any(v_emp))),$o$;
  v_new constant text := $o$       where i.state in ('validating','routing','active','applying','verifying')
         -- 🚨 THE PERSON'S OWN FILED REQUESTS ARE AN IDENTITY STANDING (hr_c4_39 / D284). Resolved
         -- through the date-scoped array, a pre-start hire's own inbox could not list a request
         -- they had just filed. The other arms of this function stay on hr.employments_of: an
         -- assigned failure and a recorded decision are work by somebody with CURRENT standing.
         and (i.requester_employment_id = any(hr._employments_of_identity(v_uid))
              or i.subject_employment_id = any(hr._employments_of_identity(v_uid)))),$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_pending';
  v_def := pg_get_functiondef(v_oid);
  if position('_employments_of_identity' in v_def) > 0 then
    raise notice 'hr_c4_39: the inbox already lists a pre-start hire their own requests';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_39: hr.wf_pending does not carry the expected own-requests arm — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_39: hr.wf_pending resolves the own-requests arm by identity';
  end if;
end
$mig$;

-- ============================================================ 4. the sentence (RD 4)
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$      'publishing a routing definition needs HR administration standing', null, ARRAY[p_definition_id]);$o$;
  v_new constant text := $o$      'Publishing a routing definition rewrites who approves what, so it needs the HR owner — HR administration standing is not enough.',
      null, ARRAY[p_definition_id]);$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_publish_definition';
  v_def := pg_get_functiondef(v_oid);
  if position('HR administration standing is not enough' in v_def) > 0 then
    raise notice 'hr_c4_39: the refusal sentence already states the actual bar';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_39: hr.wf_publish_definition does not carry the expected sentence — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_new);
    raise notice 'hr_c4_39: the publish refusal now states the actual bar';
  end if;
end
$mig$;

-- ============================================================ 5. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_39';
  delete from hr.function_contract
   where schema_name = 'hr' and function_name = 'wf_publish_definition' and home_migration = 'hr_c4_38';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('hr', '_employments_of_identity', 'hr_c4_39',
   array['login_user_id', 'deleted_at is null'], array['hire_date', 'termination_date'], true,
   'hr_c4_39: this is hr.employments_of WITHOUT the date window, and the absence of that window is the whole function. Re-introducing hire_date or termination_date here restores D284 — a pre-start hire unable to read their own request — silently, because every caller would keep compiling. Soft-deletes must keep being honoured.'),
  ('hr', '_wf_instance_visible', 'hr_c4_39',
   array['hr._employments_of_identity(p_user)', 'workflow.view_queue',
         'requester_employment_id', 'subject_employment_id', 'resolved_user_ids', 'actor_user_id'],
   array['hr.employments_of(p_user)'], true,
   'hr_c4_39: the two IDENTITY standings ("filed it", "subject of it") must resolve by identity linkage, never through the date-scoped hr.employments_of — that is D284. The capability arm must KEEP reading workflow.view_queue through hr.capability, which stays date-scoped: this change widens self-READ standing only, and a pre-start hire must wield no admin power. The routed-it and decided-it arms resolve on the user id and are recorded facts; all five standings must remain present.'),
  ('hr', 'wf_pending', 'hr_c4_39',
   array['hr._employments_of_identity(v_uid)', 'hr.employments_of(v_uid)', 'workflow.view_queue'],
   '{}', true,
   'hr_c4_39: BOTH resolutions must stay, because this function holds both kinds of standing. The own-requests arm (waiting_on_others) is an IDENTITY standing and reads _employments_of_identity, so a pre-start hire''s inbox lists a request they just filed (D284). The assigned-failure and recently-decided arms stay on hr.employments_of — work assigned to, or done by, somebody with CURRENT standing — and the other-person''s-queue branch stays capability-gated. Collapsing the two onto either one is a defect in one direction or the other.'),
  ('hr', 'wf_publish_definition', 'hr_c4_39',
   array['auth.uid()', 'no_publish_authority', 'workflow.publish_definition',
         'HR administration standing is not enough'],
   array['''workflow.cancel'''], true,
   'hr_c4_39: THE GATE and its sentence. Publishing rewrites WHO APPROVES WHAT — authority.grant''s power class — so it is gated on workflow.publish_definition, hr_owner only, and workflow.cancel is BANNED here so the old stand-in cannot return. The sentence must keep stating the ACTUAL bar: hr_c4_38 shipped "needs HR administration standing", which is the exact standing the refused hr_admin holds, so the refusal read as a bug to the only person who normally sees it. Supersedes the hr_c4_38 row.');
end $$;

-- ============================================================ 6. post-conditions that EXECUTE
do $$
declare
  v_bad integer; v_before integer; v_res jsonb; v_pre uuid; v_uid uuid; v_inst uuid; v_org uuid;
begin
  -- RD 1: hr.employments_of itself is UNCHANGED — the whole safety of this migration rests on it
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'employments_of') !~ 'hire_date <= p_at' then
    raise exception 'hr_c4_39: hr.employments_of lost its date window — write standing was widened';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_employments_of_identity') ~ 'hire_date' then
    raise exception 'hr_c4_39: the identity variant carries a date window and fixes nothing';
  end if;
  -- RD 1: exactly two callers, both read paths
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prosrc ~ '_employments_of_identity'
     and p.proname <> '_employments_of_identity';
  if v_bad <> 2 then
    raise exception 'hr_c4_39: the identity variant has % callers, expected exactly 2', v_bad;
  end if;
  -- RD 2: the capability arm stayed date-scoped
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_instance_visible') !~ 'workflow\.view_queue' then
    raise exception 'hr_c4_39: the visibility predicate lost its capability arm';
  end if;

  -- 🚨 THE RULING, EXECUTED ON THE PERSON IT WAS RULED FOR.
  select em.id, e.login_user_id, em.organization_id into v_pre, v_uid, v_org
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.deleted_at is null and em.hire_date > current_date and e.login_user_id is not null
     and exists (select 1 from hr.workflow_instance i
                  where i.subject_employment_id = em.id or i.requester_employment_id = em.id)
   limit 1;
  if v_pre is not null then
    select i.id into v_inst from hr.workflow_instance i
     where i.subject_employment_id = v_pre or i.requester_employment_id = v_pre limit 1;
    -- BAR 1: she reads her own request
    if not hr._wf_instance_visible(v_inst, v_uid) then
      raise exception 'hr_c4_39: the pre-start subject still cannot read their own request (D284 not fixed)';
    end if;
    -- BAR 2: and gains NOTHING that acts. The capability lane is untouched and date-scoped.
    if hr.capability(v_uid, 'workflow.view_queue', null, current_date, v_org)
       or hr.capability(v_uid, 'workflow.publish_definition', null, current_date, v_org)
       or hr.capability(v_uid, 'workflow.cancel', null, current_date, v_org) then
      raise exception 'hr_c4_39: a pre-start hire gained a workflow capability — the variant leaked into hr.capability';
    end if;
    -- and cannot read somebody ELSE's request either
    if exists (select 1 from hr.workflow_instance i
                where i.subject_employment_id is distinct from v_pre
                  and i.requester_employment_id is distinct from v_pre
                  and hr._wf_instance_visible(i.id, v_uid)) then
      raise exception 'hr_c4_39: the pre-start hire can read a request that is not theirs';
    end if;
  end if;

  -- RD 4: the sentence states the bar, and the old misdirection is gone
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_publish_definition')
     !~ 'HR administration standing is not enough' then
    raise exception 'hr_c4_39: the publish refusal does not state the actual bar';
  end if;

  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false)
     or coalesce((v_res ->> 'doors_all_definer')::boolean, false) is not true then
    raise exception 'hr_c4_39: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_39: % function contract(s) broken', v_bad;
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_39_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_39: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_39: identity standings resolve by identity; capability standing untouched';
end $$;
