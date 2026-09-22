-- DEFAULT-ORG-4 RED TWIN — it asserts the DEFECT, positively.
--
-- Same use case as dorg4_acting_organization_green.sql: Thornfield Veterinary Group, the
-- three-clinic small-animal practice in Boise whose practice manager runs the weekly recall
-- list. The green suite proves a recall task lands at THORNFIELD. This one proves the thing
-- that used to happen instead — the task filed in the practice manager's OWN private
-- workspace, where no technician at any of the three clinics could ever see it.
--
-- HOW TO READ IT. A red twin PASSES while the defect is live and FAILS once it is fixed.
-- Run it before migrations/campaign/dorg4_fourteen_doors_name_the_organization_they_act_in.sql
-- (or after its inverse) and every clause holds; run it after and clause R1 raises. If this
-- file ever passes again, the substitution is back.
--
-- It ends in ROLLBACK and leaves nothing behind.

\set suite 'dorg4_acting_organization_red.sql'
\set requires 'function:public.wsp_upsert_system_task|function:public.wsp_resolve_system_task|function:public.fork_shared_quiz|relation:workspace.tasks'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  v_actor_org uuid;
  v_task jsonb;
  v_row workspace.tasks;
  v_res jsonb;
  v_dedupe text := 'thornfield-recall:red:2026-w39:heartworm-retest';
  v_unanswered int;
begin
  perform set_config('app.actor_system', 'campaign.default_org_4_red_twin', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() <> c_admin then
    raise exception 'R0: the seat is not admin@admin.com — auth.uid() is %', auth.uid();
  end if;
  select o.id into v_actor_org
    from iam.organizations o
    join iam.memberships m on m.organization_id = o.id and m.container_type = 'organization'
   where m.user_id = c_admin and o.is_personal
   limit 1;
  if v_actor_org is null then
    raise exception 'R0: the actor has no personal workspace, so the defect has nowhere to put the task';
  end if;

  -- ── R1 — THE DEFECT ITSELF: a recall task nobody placed is filed in the ACTOR'S OWN
  --        personal workspace, silently, and reports success. ──
  v_task := public.wsp_upsert_system_task(
    p_dedupe_key := v_dedupe,
    p_title := 'Call Mrs. Alvarado — Biscuit (Labrador, 7y) heartworm re-test overdue 11 days');
  select * into v_row from workspace.tasks where id = (v_task ->> 'id')::uuid;
  if v_row.organization_id is distinct from v_actor_org then
    raise exception 'R1: the substitution is GONE — the task landed in % rather than the actor''s own workspace (%). This red twin is meant to fail once DEFAULT-ORG-4 has landed.',
      v_row.organization_id, v_actor_org;
  end if;

  -- ── R2 — resolving one without naming an organization quietly works, against whatever
  --        the substitution picked. ──
  v_res := public.wsp_resolve_system_task(v_dedupe, 'completed');
  if (v_res ->> 'resolved')::boolean is not true then
    raise exception 'R2: wsp_resolve_system_task no longer resolves without an organization: %', v_res;
  end if;

  -- ── R3 — the fork door takes no organization at all and does not ask for one. ──
  v_res := public.fork_shared_quiz(gen_random_uuid());
  if (v_res ->> 'code') is not distinct from 'organization_required' then
    raise exception 'R3: fork_shared_quiz now asks for an organization: %', v_res;
  end if;

  -- ── R4 — and the live catalogue is full of bodies that answer the question this way. ──
  select count(*) into v_unanswered
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
     and (c.code ~* '\m(ensure_personal_organization|current_personal_org_id)\s*\('
          or c.code ~* '\mdefault_organization_id\M')
     and n.nspname || '.' || p.proname not in
           ('iam.default_organization_id', 'iam._default_organization_is_a_membership')
     and pg_get_functiondef(p.oid) not like '%personal-organization-creation:%'
     and c.code !~* 'create\s+(?:or\s+replace\s+)?function\s+(?:[a-z_]+\.)?(?:ensure_personal_organization|current_personal_org_id)\s*\(';
  if v_unanswered < 14 then
    raise exception 'R4: only % live bodies still carry the shape — this twin describes the state where at least fourteen do', v_unanswered;
  end if;

  raise notice 'dorg4_acting_organization_red.sql: THE DEFECT IS LIVE — a Thornfield recall task filed with no organization landed in the practice manager''s own workspace (%), and % live function bodies still answer "which organization?" that way.',
    v_actor_org, v_unanswered;
end $$;

rollback;
