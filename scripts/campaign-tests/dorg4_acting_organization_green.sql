-- DEFAULT-ORG-4 — the fourteen remaining doors take the organization from the CALL, the
-- RECORD or the ladder, and REFUSE when nothing answers. Never the caller's own workspace.
--
-- THE USE CASE THIS SUITE NAMES (no fake test data): Thornfield Veterinary Group, a
-- three-clinic small-animal practice in Boise, Idaho — two surgeons, four associate vets,
-- eleven technicians. Their practice manager runs the recall list: every patient whose annual
-- vaccination or heartworm re-test has come due gets a task on the front-desk board so a
-- technician calls the owner before the appointment lapses. A recall task belongs to
-- THORNFIELD, because that is whose patient it is and whose front desk has to do the calling.
--
-- WHY THE ORGANIZATION IS THE WHOLE POINT. `public.wsp_upsert_system_task` deduplicates on
-- `(organization_id, dedupe_key)` and `workspace.tasks` is read through organization-scoped
-- RLS. Before migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql
-- the door answered a missing `p_organization_id` with
-- `public.ensure_personal_organization(auth.uid())` — so a recall task raised for Thornfield's
-- patients landed in the practice manager's OWN private workspace, where no technician at any
-- of the three clinics could ever see it, and where the same dedupe key would collide with
-- nothing so the next sweep raised it again.
--
-- THE SEAT AND THE ORGANIZATION ARE DELIBERATELY DIFFERENT. admin@admin.com's own personal
-- workspace is not Thornfield, so "the organization the call names" and "an organization
-- derived from the person" give different answers here and this suite can tell them apart.
-- Clause 0 refuses to run if they ever coincide. Thornfield is created fresh inside the
-- transaction precisely so it can never BE the actor's own.
--
-- RED BEFORE / GREEN AFTER. Run this before the migration and clause 2 raises; run it after
-- and every clause passes. It ends in ROLLBACK and leaves nothing behind.
--
-- IT TAKES THE SEAT (SEAT-RECIPE): the assertions run as `authenticated` with
-- admin@admin.com's claims, because every door here reads auth.uid() or is RLS-scoped.

\set suite 'dorg4_acting_organization_green.sql'
\set requires 'function:public.wsp_upsert_system_task|function:public.wsp_resolve_system_task|function:public.dm_get_or_create_direct_conversation|function:public.fork_shared_quiz|relation:workspace.tasks|relation:iam.organizations'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_thornfield uuid;
  v_actor_org uuid;
  v_task jsonb;
  v_task_id uuid;
  v_row workspace.tasks;
  v_res jsonb;
  v_sqlstate text;
  v_dedupe text := 'thornfield-recall:2026-w39:heartworm-retest';
  v_unanswered text;
begin
  -- Provenance: platform._stamp_actor_tier refuses an automated write that names no system.
  perform set_config('app.actor_system', 'campaign.default_org_4_suite', true);

  -- ── THE FIXTURE, AS THE SERVER. Thornfield exists for the length of this transaction. ──
  insert into iam.organizations (name, slug, abbreviation)
  values ('Thornfield Veterinary Group', 'thornfield-veterinary-dorg4', 'TVG')
  returning id into v_thornfield;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_thornfield, 'organization', v_thornfield, c_admin, 'owner', 'active');
  -- iam.organization_member is a VIEW over iam.memberships; the row above IS the membership.

  -- ── 0 — take the seat and prove it, and prove the two answers are distinguishable. ──
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if auth.uid() <> c_admin then
    raise exception '0: the seat is not admin@admin.com — auth.uid() is %', auth.uid();
  end if;
  -- The organization a person-derived answer WOULD give. Read for ONE reason: to prove no
  -- clause below lands there. Nothing in this suite uses it to decide anything.
  select o.id into v_actor_org
    from iam.organizations o
    join iam.memberships m on m.organization_id = o.id and m.container_type = 'organization'
   where m.user_id = c_admin and o.is_personal
   limit 1;
  if v_actor_org is null or v_actor_org = v_thornfield then
    raise exception '0: this suite needs the actor''s own workspace (%) to differ from Thornfield (%), or it cannot tell the two answers apart',
      v_actor_org, v_thornfield;
  end if;

  -- ── 1 — THE RECALL TASK LANDS IN THORNFIELD WHEN THE CALL NAMES IT. ──
  v_task := public.wsp_upsert_system_task(
    p_dedupe_key := v_dedupe,
    p_title := 'Call Mrs. Alvarado — Biscuit (Labrador, 7y) heartworm re-test overdue 11 days',
    p_description := 'Annual re-test lapsed; prescription refill is blocked until it is run. Offer the Thursday 8:10 slot at Fairview.',
    p_origin := 'system',
    p_source_type := 'recall_list',
    p_source_label := 'Week 39 recall sweep',
    p_organization_id := v_thornfield);
  v_task_id := (v_task ->> 'id')::uuid;
  if v_task_id is null or (v_task ->> 'created')::boolean is not true then
    raise exception '1: the recall task was not created: %', v_task;
  end if;
  select * into v_row from workspace.tasks where id = v_task_id;
  if v_row.organization_id is distinct from v_thornfield then
    raise exception '1: the recall task landed in organization % — Thornfield is %',
      v_row.organization_id, v_thornfield;
  end if;
  if v_row.organization_id = v_actor_org then
    raise exception '1: the recall task landed in the ACTOR''s own workspace (%), which is exactly the answer this lane removes',
      v_actor_org;
  end if;

  -- ── 2 — NOTHING NAMES THE ORGANIZATION: REFUSE, DO NOT SUBSTITUTE. ──
  --        THIS is the clause the old body failed: it filed the task in the actor's workspace.
  begin
    perform public.wsp_upsert_system_task(
      p_dedupe_key := 'thornfield-recall:2026-w39:unplaceable',
      p_title := 'Call the Bhatt family — Pepper (DSH, 4y) rabies booster due');
    raise exception '2: wsp_upsert_system_task accepted a task nothing could place — it must refuse';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception '2: wsp_upsert_system_task raised % when nothing named the organization — expected 23502', v_sqlstate;
    end if;
  end;
  if exists (select 1 from workspace.tasks
              where dedupe_key = 'thornfield-recall:2026-w39:unplaceable') then
    raise exception '2: the refused task was written anyway';
  end if;

  -- ── 3 — RESOLVING ONE WORKS WHEN THE CALL NAMES THE ORGANIZATION, AND REFUSES WHEN IT DOES NOT. ──
  begin
    perform public.wsp_resolve_system_task(v_dedupe, 'completed');
    raise exception '3: wsp_resolve_system_task resolved a task without being told whose it is';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception '3: wsp_resolve_system_task raised % with no organization — expected 23502', v_sqlstate;
    end if;
  end;
  v_res := public.wsp_resolve_system_task(v_dedupe, 'completed', v_thornfield);
  if (v_res ->> 'resolved')::boolean is not true then
    raise exception '3: the recall task was not resolved when the organization was named: %', v_res;
  end if;

  -- ── 4 — A DIRECT CONVERSATION NEEDS A TENANT, AND WILL NOT INVENT ONE. ──
  begin
    perform public.dm_get_or_create_direct_conversation(c_admin, gen_random_uuid());
    raise exception '4: dm_get_or_create_direct_conversation created a conversation with no organization named';
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    if v_sqlstate <> '23502' then
      raise exception '4: dm_get_or_create_direct_conversation raised % with no organization — expected 23502', v_sqlstate;
    end if;
  end;

  -- ── 5 — THE RETIRED FORK ARITY IS LOUD, NOT DEAD. A stale client gets a sentence, not a
  --        copy filed in a workspace nobody chose. ──
  v_res := public.fork_shared_quiz(gen_random_uuid());
  if (v_res ->> 'success')::boolean is not false or (v_res ->> 'code') is distinct from 'organization_required' then
    raise exception '5: the two-argument fork_shared_quiz did not ask for an organization: %', v_res;
  end if;

  -- ── 6 — THE NEW ARITY READS ITS ARGUMENT RATHER THAN DECORATING WITH IT. Naming an
  --        organization the caller is not a member of is refused. ──
  --        (An organization id nobody holds — not admin@admin.com, not anyone. A super-admin
  --        seat reaches every REAL organization, so a real one would not discriminate here.)
  v_res := public.fork_shared_quiz(gen_random_uuid(), gen_random_uuid());
  if (v_res ->> 'success')::boolean is not false
     or (v_res ->> 'error') not like '%not a member%' then
    raise exception '6: fork_shared_quiz accepted an organization the caller does not belong to: %', v_res;
  end if;
  v_res := public.fork_shared_quiz(gen_random_uuid(), null);
  if (v_res ->> 'success')::boolean is not false
     or (v_res ->> 'error') not like '%organization%' then
    raise exception '6: fork_shared_quiz accepted a NULL organization: %', v_res;
  end if;

  -- ── 7 — THE CENSUS, ASSERTED IN SQL RATHER THAN TAKEN FROM A GUARD'S WORD. ──
  --        Every live function body in every non-system schema is read. The only bodies
  --        allowed to name a personal-organization substitution or a stated default are the
  --        display preference itself, its constraint trigger, and the three signup CREATION
  --        sites, each of which says so IN ITS OWN BODY.
  --        The body is read the way the guard reads it: block comments, line comments and
  --        single-quoted literals removed first, so a body that merely DOCUMENTS the removed
  --        shape (every migration that fixed one quotes what it took out) is not counted as
  --        carrying it.
  select string_agg(sig, ', ' order by sig) into v_unanswered
  from (
    select n.nspname || '.' || p.proname || '(' ||
             coalesce(pg_catalog.oidvectortypes(p.proargtypes), '') || ')' as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
      lateral (
        select regexp_replace(
                 regexp_replace(
                   regexp_replace(pg_get_functiondef(p.oid), '/\*.*?\*/', ' ', 'gn'),
                   '--[^\n]*', '', 'g'),
                 '''(?:[^'']|'''')*''', '''''', 'g') as code
      ) c
     where n.nspname not in ('pg_catalog', 'information_schema')
       and p.prokind = 'f'
       -- \m is a WORD START. Without it `_d31_impl_ensure_personal_organization` -- the
       -- primitive's own implementation -- matches its own name and the census never reaches
       -- zero. The guard's own pattern carries \b for exactly this reason.
       and (c.code ~* '\m(ensure_personal_organization|current_personal_org_id)\s*\('
            or c.code ~* '\mdefault_organization_id\M')
       and n.nspname || '.' || p.proname not in
             ('iam.default_organization_id', 'iam._default_organization_is_a_membership')
       and pg_get_functiondef(p.oid) not like '%personal-organization-creation:%'
       -- A function's own CREATE header is a DEFINITION of the primitive, not a call to it.
       and c.code !~* 'create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?(?:ensure_personal_organization|current_personal_org_id)\s*\('
  ) s;
  if v_unanswered is not null then
    raise exception '7: these live function bodies still answer "which organization?" with the caller''s own: %',
      v_unanswered;
  end if;

  -- ── 8 — THE THREE SIGNUP CREATION SITES ARE DECLARED, IN THE DATABASE, NOT IN A FILE. ──
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('_provision_new_user_personal_org', '_provision_new_user_profile', 'handle_new_dm_user')
         and pg_get_functiondef(p.oid) like '%personal-organization-creation:%') <> 3 then
    raise exception '8: a signup provisioning body does not carry its own -- personal-organization-creation: declaration';
  end if;

  raise notice 'dorg4_acting_organization_green.sql: 9/9 — Thornfield Veterinary Group''s recall task lands in Thornfield (%), never in the actor''s workspace (%), and every door that cannot be told whose work it is refuses instead of guessing.',
    v_thornfield, v_actor_org;
end $$;

rollback;
