-- LANE ARCHIVED-ORG-WORK — AN ARCHIVED ORGANIZATION TAKES ITS WAITING WORK WITH IT, AND GIVES IT
-- BACK WHEN IT IS RESTORED.
--
-- THE DEFECT (UI-FIX-19 "found, not mine", measured again on production 2026-09-25): admin@admin.com
-- had 7 pending approvals in Ironclad Mobile Mechanic, an organization archived on 2026-09-23.
-- custom.inbox_counts(<Ironclad>) answered waiting 7 and custom.work_inbox(<Ironclad>) listed all
-- seven with Approve. Across production 131 pending approvals in 29 archived organizations, 5 open
-- assignments in 2 and 1 unanswered signature request in 1 were still "waiting" on somebody.
-- Lane S5-PRIME made a TABLE or RECORD archive withdraw what was waiting on it, and S5-PRIME-2
-- stopped reminders for an archived organization; an ORGANIZATION archive withdrew nothing, and
-- the per-organization doors still listed and counted it.
--
-- WHAT THIS FILE LANDS
--   1. `custom._organization_work_withdraw(org, by)` — THE ARCHIVE HALF. Every pending approval in
--      the organization becomes `withdrawn` (decided_at, withdrawn_by = whoever archived it,
--      withdrawn_reason, outcome, withdrawn_with = 'organization'); every open assignment (a live
--      record whose Assignee is a person and whose state is not finished) is unassigned; every
--      signature request still waiting on its signer is stopped (invalidated_at, a reason, and
--      invalidated_with = 'organization'). Each is an UPDATE of the store's own row, so
--      history.record_capture keeps it, and every version it writes reads "archive of
--      organization" and points at ONE archive event in history.migration_log (verb archive,
--      target_kind organization, inverse.took listing exactly what it took, assignees included).
--   2. `custom._organization_work_return(org, by)` — THE RESTORE HALF, the same shape as
--      STORE-TAILS-3's record_restore of an archive event: it reads the organization's open
--      archive event and brings back ONLY what the event took, ONLY while its subject is still
--      live — an approval goes back to pending only if custom.work_approval_withdrawal still
--      answers null for it and nobody changed it since; an assignment comes back only if the
--      record is live, nobody reassigned it and the person record is live; a signature request
--      only if its record is live and it was not otherwise answered. What stays behind is counted
--      in the event with why. The event is stamped undone.
--   3. `iam.organization_archive` / `iam.organization_restore` call the two halves (the only two
--      functions that write archived_at; all 134 archived organizations went through the first), and
--      their answer and their org_admin_audit row say what was withdrawn / brought back.
--   4. `custom._inbox_items` answers NOTHING for an archived organization — so custom.work_inbox,
--      custom.inbox_counts(<org>), the four snooze/clear doors and custom.inbox_remind_tick never
--      list, count or remind about work whose organization is archived (inbox_counts() without an
--      organization already skipped them; the per-organization call did not).
--
-- INVERSE: migrations/inverse/archorgwork_an_archived_organization_takes_its_waiting_work_with_it_down.sql
--
-- based-on: custom._inbox_items(uuid, uuid, boolean) 344b873a74d28901b6ddcefa16fc7010ff09efc0db0b0979435007164be4f8a4
-- based-on: iam.organization_archive(uuid, text, text) 1da2329a8040b6cd35b43e077fc73f39dd051637f602c7a898ee3faf44d749fa
-- based-on: iam.organization_restore(uuid, text) 305ef105e8fd191cfbc23a2175f9c326867338bd348a531cbf616306518ba00a
-- lane: ARCHIVED-ORG-WORK

set lock_timeout = '30s';
set statement_timeout = '300s';

-- ── 1. THE ARCHIVE HALF ─────────────────────────────────────────────────────────────────────────
create or replace function custom._organization_work_withdraw(p_organization_id uuid, p_by uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_org     iam.organizations%rowtype;
  v_when    timestamptz;
  v_at      text;
  v_reason  text;
  v_sreason text;
  v_log     uuid := gen_random_uuid();
  v_appr    jsonb := '[]'::jsonb;
  v_asg     jsonb := '[]'::jsonb;
  v_sign    jsonb := '[]'::jsonb;
  v_note    text;
begin
  select * into v_org from iam.organizations g where g.id = p_organization_id;
  if not found or v_org.archived_at is null then
    return null;                               -- only an archived organization gives anything up
  end if;
  v_when := v_org.archived_at;
  v_at   := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_reason := format('%s was archived on %s, so this change can no longer be made there.',
                     v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'))
              || coalesce(' Reason given: ' || nullif(btrim(v_org.archive_reason), '') || '.', '');
  v_sreason := format('%s was archived on %s, so this signature request was withdrawn and the link no longer works.',
                      v_org.name, to_char(v_when at time zone 'utc', 'YYYY-MM-DD'));

  -- EVERY VERSION THIS WRITES POINTS AT ONE EVENT (history.record_capture reads these three).
  perform set_config('history.mark_at',   statement_timestamp()::text, true);
  perform set_config('history.mark_id',   v_log::text,                 true);
  perform set_config('history.mark_verb', 'archive of organization',   true);

  -- a. PENDING APPROVALS
  with w as (
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     p_by::text,
             'withdrawn_reason', v_reason,
             'withdrawn_with',   'organization',
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and coalesce(r.data ->> 'state', 'pending') = 'pending'
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_appr from w;

  -- b. OPEN ASSIGNMENTS (the same predicate custom._inbox_items lists: a live record whose Assignee
  --    names a person record, in a state that is not finished)
  with open_work as (
    select r.id, r.data ->> 'assignee' as assignee
      from custom.record r
      join custom.record pr
        on pr.organization_id = r.organization_id
       and pr.id::text = r.data ->> 'assignee'
       and pr.table_id = custom.person_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where r.organization_id = p_organization_id
       and r.data_class = 'record'
       and r.deleted_at is null
       and nullif(r.data ->> 'assignee', '') is not null
       and not coalesce((s.data ->> 'terminal')::boolean, false)
  ),
  w as (
    update custom.record r
       set data = r.data - 'assignee'
      from open_work o
     where r.organization_id = p_organization_id and r.id = o.id
    returning r.id, o.assignee, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.assignee, w.version) order by w.id), '[]'::jsonb) into v_asg from w;

  -- c. SIGNATURE REQUESTS STILL WAITING ON THEIR SIGNER
  with w as (
    update custom.record r
       set data = r.data || jsonb_build_object(
             'invalidated_at',      now(),
             'invalidation_reason', v_sreason,
             'invalidated_by',      p_by::text,
             'invalidated_with',    'organization')
     where r.organization_id = p_organization_id
       and r.data_class = 'sign_request'
       and r.deleted_at is null
       and custom.sign_request_state(r.data) in ('sent', 'viewed')
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_array(w.id, w.version) order by w.id), '[]'::jsonb) into v_sign from w;

  if jsonb_array_length(v_appr) + jsonb_array_length(v_asg) + jsonb_array_length(v_sign) = 0 then
    return jsonb_build_object('event_id', null, 'approvals', 0, 'assignments', 0, 'sign_requests', 0);
  end if;

  v_note := format('%s archived: %s waiting approval(s) withdrawn, %s open assignment(s) unassigned, %s signature request(s) stopped. Restoring the organization brings back each one whose subject is still live.',
                   v_org.name, jsonb_array_length(v_appr), jsonb_array_length(v_asg), jsonb_array_length(v_sign));
  insert into history.migration_log (id, organization_id, verb, target_kind, target_id, inverse, applied_by, note)
  values (v_log, p_organization_id, 'archive', 'organization', p_organization_id,
          jsonb_build_object(
            'kind',        'organization_restore',
            'open',        false,
            'archived_at', v_when,
            'reason',      v_reason,
            'took',        jsonb_build_object('approvals', v_appr, 'assignments', v_asg, 'sign_requests', v_sign)),
          p_by, v_note);

  return jsonb_build_object('event_id', v_log,
                            'approvals', jsonb_array_length(v_appr),
                            'assignments', jsonb_array_length(v_asg),
                            'sign_requests', jsonb_array_length(v_sign),
                            'sentence', v_note);
end
$function$;
comment on function custom._organization_work_withdraw(uuid, uuid) is
  'Lane ARCHIVED-ORG-WORK. An archived organization gives up what was waiting in it: pending approvals withdrawn (withdrawn_with organization), open assignments unassigned, unanswered signature requests stopped; one history.migration_log archive event (target_kind organization) lists what it took. Internal: called by iam.organization_archive and the audited repair; no client calls it.';
revoke all on function custom._organization_work_withdraw(uuid, uuid) from public, anon, authenticated;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_organization_work_withdraw', 'p_organization_id uuid, p_by uuid', array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id: acted on only when that organization is archived (null or live answers null). p_by: recorded as the archiver, may be null.',
        'archorgwork_an_archived_organization_takes_its_waiting_work_with_it.sql',
        'internal: not a door. Called only from inside iam.organization_archive / iam.organization_restore (which check owner or platform admin first) and the audited repair; no client ever calls it.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 2. THE RESTORE HALF ─────────────────────────────────────────────────────────────────────────
create or replace function custom._organization_work_return(p_organization_id uuid, p_by uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  m        history.migration_log%rowtype;
  x        jsonb;
  v_back_a integer := 0;
  v_back_s integer := 0;
  v_back_w integer := 0;
  v_left   jsonb := '[]'::jsonb;
  v_n      integer;
  v_d      jsonb;
  v_ver    integer;
  v_del    timestamptz;
  v_total  integer := 0;
  v_events integer := 0;
begin
  if exists (select 1 from iam.organizations g where g.id = p_organization_id and g.archived_at is not null) then
    return null;                               -- still archived: nothing comes back
  end if;

  -- EVERY OPEN EVENT, newest first (an organization archived, restored and archived again has one
  -- open event per archive that nothing has undone yet).
  for m in
    select * from history.migration_log l
     where l.organization_id = p_organization_id
       and l.target_kind = 'organization' and l.target_id = p_organization_id
       and l.verb = 'archive' and l.undone_at is null
     order by l.applied_at desc
  loop
    v_events := v_events + 1;
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   m.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive of organization', true);

    -- a. APPROVALS: back to pending only if nothing changed them since and their subject is live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,approvals}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.version, r.deleted_at into v_d, v_ver, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'the approval itself was archived'));
      elsif v_d ->> 'state' <> 'withdrawn' or v_d ->> 'withdrawn_with' is distinct from 'organization'
            or v_ver <> (x ->> 1)::integer then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval', 'why', 'it was changed after the organization was archived'));
      elsif custom.work_approval_withdrawal(p_organization_id, v_d) is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'approval',
                    'why', custom.work_approval_withdrawal(p_organization_id, v_d)));
      else
        update custom.record r
           set data = (r.data - 'decided_at' - 'withdrawn_by' - 'withdrawn_reason' - 'withdrawn_with' - 'outcome')
                      || '{"state":"pending"}'::jsonb
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        v_back_a := v_back_a + 1;
      end if;
    end loop;

    -- b. ASSIGNMENTS: back to the same person only if the record is live, nobody reassigned it and
    --    that person record is still live.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,assignments}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'the record was archived'));
      elsif nullif(v_d ->> 'assignee', '') is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'it was assigned again since'));
      elsif not exists (select 1 from custom.record pr
                         where pr.organization_id = p_organization_id and pr.id::text = x ->> 1
                           and pr.table_id = custom.person_kernel_id() and pr.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'assignment', 'why', 'that person is no longer here'));
      else
        update custom.record r
           set data = r.data || jsonb_build_object('assignee', x ->> 1)
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        v_back_w := v_back_w + 1;
      end if;
    end loop;

    -- c. SIGNATURE REQUESTS: the same link works again only if its record is live and nothing
    --    else answered or stopped it.
    for x in select value from jsonb_array_elements(coalesce(m.inverse #> '{took,sign_requests}', '[]'::jsonb)) loop
      v_total := v_total + 1;
      select r.data, r.deleted_at into v_d, v_del
        from custom.record r
       where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
      if v_d is null or v_del is not null then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the request was archived'));
      elsif v_d ->> 'invalidated_with' is distinct from 'organization' or v_d ? 'signed_at' or v_d ? 'declined_at' then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'it was answered or stopped some other way'));
      elsif not exists (select 1 from custom.record s
                         where s.organization_id = p_organization_id and s.id = nullif(v_d ->> 'record_id', '')::uuid
                           and s.deleted_at is null) then
        v_left := v_left || jsonb_build_array(jsonb_build_object('id', x ->> 0, 'kind', 'sign_request', 'why', 'the record it asks about was archived'));
      else
        update custom.record r
           set data = r.data - 'invalidated_at' - 'invalidation_reason' - 'invalidated_by' - 'invalidated_with'
         where r.organization_id = p_organization_id and r.id = (x ->> 0)::uuid;
        v_back_s := v_back_s + 1;
      end if;
    end loop;

    update history.migration_log l
       set undone_at = now(), undone_by = p_by,
           inverse = l.inverse || jsonb_build_object('left', v_left)
     where l.organization_id = p_organization_id and l.id = m.id;
  end loop;

  return jsonb_build_object('events', v_events, 'approvals', v_back_a, 'assignments', v_back_w,
                            'sign_requests', v_back_s, 'left', v_left,
                            'sentence', format('%s of %s waiting item(s) came back; %s stayed withdrawn.',
                                               v_back_a + v_back_w + v_back_s, v_total, jsonb_array_length(v_left)));
end
$function$;
comment on function custom._organization_work_return(uuid, uuid) is
  'Lane ARCHIVED-ORG-WORK. A restored organization gets back exactly what its open archive event(s) took, only while each subject is still live and unchanged; what stays behind is written into the event with why, and the event is stamped undone. Internal: called by iam.organization_restore; no client calls it.';
revoke all on function custom._organization_work_return(uuid, uuid) from public, anon, authenticated;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', '_organization_work_return', 'p_organization_id uuid, p_by uuid', array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id: acted on only when that organization is live (still archived answers null). p_by: recorded as who restored it, may be null.',
        'archorgwork_an_archived_organization_takes_its_waiting_work_with_it.sql',
        'internal: not a door. Called only from inside iam.organization_archive / iam.organization_restore (which check owner or platform admin first) and the audited repair; no client ever calls it.',
        false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ── 3. BOTH DOORS THAT ARCHIVE AND RESTORE AN ORGANIZATION CARRY ITS WORK ─────────────────────
-- Folded into the two doors rather than a new trigger on iam.organizations: `pnpm db:rehearse`
-- measured CREATE/DROP TRIGGER there as ACCESS EXCLUSIVE on iam.organizations plus the 23
-- auth/storage/realtime relations of the supautils set (sign-in frozen to commit). Every one of
-- production's 134 archived organizations was archived through iam.organization_archive (each has
-- its organization.archived audit row), and scripts/campaign-tests/archorgwork_census.sql goes RED
-- if anything ever waits in an archived organization again.
CREATE OR REPLACE FUNCTION iam.organization_archive(p_org uuid, p_confirm_name text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_org  iam.organizations%rowtype;
  v_took jsonb;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    perform platform.refuse_not_found('That organization no longer exists.');
  end if;

  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception 'Only an owner of % can archive it.', v_org.name using errcode = '42501';
  end if;

  if coalesce(v_org.is_personal, false) then
    raise exception
      'Your personal workspace cannot be archived — it is where your own work lives.'
      using errcode = '23514';
  end if;

  if v_org.is_system then
    raise exception
      '% is a system organization and cannot be archived.', v_org.name using errcode = '23514';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to archive it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is not null then
    return jsonb_build_object(
      'archived', true,
      'changed', false,
      'archived_at', v_org.archived_at,
      'sentence', format('%s was already archived on %s.',
                         v_org.name, to_char(v_org.archived_at, 'DD Month YYYY')));
  end if;

  update iam.organizations
     set archived_at    = now(),
         archived_by    = v_uid,
         archive_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  -- LANE ARCHIVED-ORG-WORK: THE WORK WAITING IN IT GOES WITH IT. Every pending approval is
  -- withdrawn, every open assignment unassigned and every unanswered signature request stopped,
  -- with the reason and whoever archived it; one history.migration_log event lists what it took,
  -- and organization_restore gives back each one whose subject is still live.
  v_took := custom._organization_work_withdraw(p_org, v_uid);

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.archived',
          jsonb_build_object('reason', v_org.archive_reason, 'name', v_org.name,
                             'withdrew', v_took));

  return jsonb_build_object(
    'archived', true,
    'changed', true,
    'archived_at', v_org.archived_at,
    'withdrew', v_took,
    'sentence', format(
      '%s is archived. Its members cannot open it and nothing inside it runs, but nothing was '
      'deleted — an owner can restore it at any time.', v_org.name)
      || case when coalesce((v_took ->> 'approvals')::integer, 0) + coalesce((v_took ->> 'assignments')::integer, 0)
                   + coalesce((v_took ->> 'sign_requests')::integer, 0) > 0
              then format(' %s waiting approval(s), %s open assignment(s) and %s signature request(s) in it were withdrawn; restoring it brings back each one that is still live.',
                          coalesce((v_took ->> 'approvals')::integer, 0), coalesce((v_took ->> 'assignments')::integer, 0),
                          coalesce((v_took ->> 'sign_requests')::integer, 0))
              else '' end);
end
$function$;

CREATE OR REPLACE FUNCTION iam.organization_restore(p_org uuid, p_confirm_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations%rowtype;
  v_back jsonb;
begin
  select * into v_org from iam.organizations where id = p_org;
  if not found then
    perform platform.refuse_not_found('That organization no longer exists.');
  end if;

  -- is_org_owner answers about YOURSELF without asking my_orgs(), so an owner can still be
  -- recognised as the owner of an organization the archive has taken out of my_orgs().
  if not ((select public.is_platform_admin()) or iam.is_org_owner(p_org, v_uid)) then
    raise exception
      'Only an owner of %, or a super admin, can restore it.', v_org.name using errcode = '42501';
  end if;

  if p_confirm_name is distinct from v_org.name then
    raise exception
      'Type the organization''s name exactly — % — to restore it.', v_org.name
      using errcode = '23514';
  end if;

  if v_org.archived_at is null then
    return jsonb_build_object(
      'archived', false, 'changed', false,
      'sentence', format('%s is not archived.', v_org.name));
  end if;

  update iam.organizations
     set archived_at    = null,
         archived_by    = null,
         archive_reason = null,
         updated_at     = now(),
         updated_by     = coalesce(v_uid, updated_by)
   where id = p_org
  returning * into v_org;

  -- LANE ARCHIVED-ORG-WORK: WHAT THE ARCHIVE TOOK COMES BACK, but only what is still live.
  v_back := custom._organization_work_return(p_org, v_uid);

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.restored', jsonb_build_object('name', v_org.name, 'brought_back', v_back));

  return jsonb_build_object(
    'archived', false, 'changed', true,
    'brought_back', v_back,
    'sentence', format(
      '%s is open again. Its members have their access back and everything inside it — records, '
      'agents, schedules — is exactly as they left it.', v_org.name)
      || case when coalesce((v_back ->> 'events')::integer, 0) > 0
              then ' Waiting work: ' || (v_back ->> 'sentence')
              else '' end);
end
$function$;

-- ── 4. THE ONE PREDICATE ANSWERS NOTHING FOR AN ARCHIVED ORGANIZATION ───────────────────────────
create or replace function custom._inbox_items(p_organization_id uuid, p_user_id uuid,
                                               p_include_decided boolean default false)
 returns table(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text,
               summary text, state text, due_on timestamptz, due_state text, actionable boolean,
               requested_by uuid, requested_by_name text, at timestamptz, table_id uuid,
               table_name text, decided_by uuid, decided_by_name text, decided_at timestamptz,
               outcome text, snoozed_until timestamptz, cleared_at timestamptz,
               reminded_at timestamptz, woke_at timestamptz, inbox_state text, sort_at timestamptz,
               touched_by uuid, item_version integer)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- NOT a definer, on purpose: it has no client EXECUTE and is only ever reached from inside the
-- definer doors below (and pg_cron's tick, which runs as the store's owner), so it runs with their
-- rights and needs no door of its own.
declare
  v_now    timestamptz := custom._inbox_now();
  v_person uuid;
begin
  -- LANE ARCHIVED-ORG-WORK: AN ARCHIVED ORGANIZATION HAS NOTHING WAITING IN IT. Its members cannot
  -- open it, its waiting work was withdrawn when it was archived, and the inbox, the badge's count
  -- and the reminders (all this one function) never list, count or remind about any of it.
  if exists (select 1 from iam.organizations g where g.id = p_organization_id and g.archived_at is not null) then
    return;
  end if;

  -- WHAT IS WAITING ON ONE PERSON, asked for that person by id — so the inbox screen, the shell
  -- badge's count and the reminder tick cannot disagree: they are this one function.
  -- Approvals: the ones this person is among the approvers of (the same ladder
  -- custom.work_approval_may_decide asks). Assignments: open records whose Assignee is this
  -- person's person-record, that they can see (the same predicate as custom.work_list 'mine';
  -- the seat suite asserts the two agree). p_user_id null is the store owner's server lane,
  -- which sees every approval and has no assignments, exactly as work_inbox always answered it.
  if p_user_id is not null then
    select r.id into v_person
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.person_kernel_id()
       and r.deleted_at is null
       and r.data ->> 'user_id' = p_user_id::text
     order by r.created_at
     limit 1;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_by, r.version,
           case when coalesce(r.data ->> 'subject_kind', 'record') = 'table'
                  then nullif(r.data ->> 'subject_id', '')::uuid
                when lower(coalesce(r.data #>> '{change,kind}', '')) = 'table_add' then null
                else nullif(r.data ->> 'subject_table_id', '')::uuid end as tid,
           nullif(coalesce(r.data ->> 'decided_by', r.data ->> 'withdrawn_by'), '')::uuid as who
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       -- LANE S5-PRIME: A DECISION ABOUT AN ARCHIVED THING IS NEVER LISTED AS WAITING.
       and (coalesce(r.data ->> 'state', 'pending') <> 'pending'
            or custom.work_approval_withdrawal(p_organization_id, r.data) is null)
       -- A PERSON'S OWN REQUEST IS NOT WAITING ON THEM: custom.work_approval_decide refuses the
       -- requester of a person's ask ("You asked for this change, so somebody else approves it"),
       -- so listing it with Approve would be a control that fails when pressed. An agent's
       -- request, which the decide door lets its person decide, stays.
       and not (p_user_id is not null
                and coalesce(r.data ->> 'state', 'pending') = 'pending'
                and r.data ->> 'requested_by' = p_user_id::text
                and coalesce(r.data ->> 'origin', 'person') <> 'agent')
       and case when p_user_id is null then custom.query_is_store_owner()
                else exists (select 1
                               from custom.work_approval_approvers(p_organization_id,
                                      nullif(r.data ->> 'subject_id', '')::uuid,
                                      nullif(r.data ->> 'approver_id', '')::uuid) a
                              where a.user_id = p_user_id) end
  ),
  items as (
    select a.id as item_id,
           case when coalesce(a.d ->> 'origin', 'person') = 'agent' then 'proposal' else 'approval' end as kind,
           coalesce(a.d ->> 'origin', 'person') as origin,
           case when (a.d -> 'change') ->> 'kind' = 'field_add'
                then format('Add %s to %s',
                            coalesce(nullif(a.d #>> '{change,field,label}', ''),
                                     nullif(a.d #>> '{change,field,key}', ''), 'a column'),
                            coalesce(a.d ->> 'subject_title', 'a table'))
                else format('Change %s', coalesce(a.d ->> 'subject_title', 'a record')) end as title,
           nullif(a.d ->> 'subject_id', '')::uuid as subject_id,
           coalesce(a.d ->> 'subject_kind', 'record') as subject_kind,
           coalesce(nullif(a.d ->> 'note', ''),
                    case when (a.d -> 'change') ->> 'kind' = 'field_add'
                         then 'A new column on a table that already existed.'
                         else (select string_agg(k, ', ' order by k)
                                 from jsonb_object_keys(a.d #> '{change,patch}') k) end) as summary,
           coalesce(a.d ->> 'state', 'pending') as state,
           null::timestamptz as due_on,
           null::text as due_state,
           coalesce(a.d ->> 'state', 'pending') = 'pending' as actionable,
           nullif(a.d ->> 'requested_by', '')::uuid as requested_by,
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = nullif(a.d ->> 'requested_by', '')::uuid) as requested_by_name,
           a.created_at as at,
           a.tid as table_id,
           (select coalesce(nullif(t.data ->> 'name', ''), 'a table')
              from custom.record t where t.organization_id = p_organization_id and t.id = a.tid) as table_name,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then a.who end as decided_by,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then
             (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                              nullif(u.raw_user_meta_data ->> 'full_name', ''),
                              split_part(u.email::text, '@', 1))::text
                from auth.users u where u.id = a.who) end as decided_by_name,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
                then nullif(a.d ->> 'decided_at', '')::timestamptz end as decided_at,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
                then coalesce(nullif(a.d ->> 'outcome', ''), nullif(a.d ->> 'withdrawn_reason', '')) end as outcome,
           coalesce(a.d ->> 'state', 'pending') <> 'pending' as closed,
           a.updated_by as touched_by,
           a.version as item_version
      from approvals a
    union all
    select r.id, 'assignment', 'person',
           coalesce(custom._card_words(r.organization_id, r.data ->> coalesce(t.data ->> 'title_field', 'name'),
                                       lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record'))),
                    'Untitled'),
           r.id, 'record',
           format('%s · %s', coalesce(t.data ->> 'name', 'a table'), coalesce(s.data ->> 'name', 'no state')),
           coalesce(s.data ->> 'name', 'open'),
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           true,
           r.updated_by,
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = r.updated_by),
           r.updated_at,
           r.table_id, t.data ->> 'name',
           null::uuid, null::text, null::timestamptz, null::text,
           coalesce((s.data ->> 'terminal')::boolean, false),
           r.updated_by,
           r.version
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id
       and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where v_person is not null
       and r.organization_id = p_organization_id
       and r.deleted_at is null
       and r.data_class = 'record'
       -- compared as text: a hand-typed name in somebody's Assignee must not take the inbox down
       and r.data ->> 'assignee' = v_person::text
       and (coalesce(p_include_decided, false)
            or not coalesce((s.data ->> 'terminal')::boolean, false))
       and custom.has_visibility(p_user_id, 'record', r.id, 'viewer'::public.permission_level)
  )
  select i.item_id, i.kind, i.origin, i.title, i.subject_id, i.subject_kind, i.summary, i.state,
         i.due_on, i.due_state, i.actionable, i.requested_by, i.requested_by_name, i.at,
         i.table_id, i.table_name, i.decided_by, i.decided_by_name, i.decided_at, i.outcome,
         st.snoozed_until, st.cleared_at, st.reminded_at, st.woke_at,
         case when i.closed then 'closed'
              -- DONE STAYS DONE until somebody ELSE changes it (Superhuman: new activity brings a
              -- thread back) — a newer version of the item than the one she cleared, written by
              -- someone else. Her own edit to her own assignment does not.
              when st.cleared_at is not null
                   and not (i.item_version > coalesce(st.cleared_version, i.item_version)
                            and i.touched_by is distinct from p_user_id)
                then 'cleared'
              when st.snoozed_until is not null and st.snoozed_until > v_now then 'snoozed'
              else 'waiting' end,
         -- A SNOOZED ITEM COMES BACK AT THE TOP: it sorts by the moment it returned.
         case when st.snoozed_until is not null and st.snoozed_until <= v_now
                   and st.snoozed_until > i.at then st.snoozed_until
              else i.at end,
         i.touched_by, i.item_version
    from items i
    left join custom.inbox_item_state st
      on st.organization_id = p_organization_id
     and st.person_id = p_user_id
     and st.item_id = i.item_id;
end
$function$;
revoke all on function custom._inbox_items(uuid, uuid, boolean) from public, anon, authenticated;
