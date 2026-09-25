-- INVERSE of migrations/campaign/archorgwork_an_archived_organization_takes_its_waiting_work_with_it.sql
-- (lane ARCHIVED-ORG-WORK). Puts iam.organization_archive (1da2329a…), iam.organization_restore
-- (305ef105…) and custom._inbox_items (344b873a…) back to production's bodies before the file, then
-- drops the two internal halves.
-- What an archive already withdrew stays withdrawn (its history.migration_log event still lists it);
-- run the repair file's inverse first to give that back.

-- chair-step: inverse of lane ARCHIVED-ORG-WORK's organization-archive file; restores the three pre-file bodies and drops two internal functions.
-- based-on: iam.organization_archive(uuid, text, text) 8f654a8eb3f77aa90f1752b16ea86454e60ebdd3472d3ef2e5d772c4afabb747
-- based-on: iam.organization_restore(uuid, text) 78811d51df8e3f8a3c26704068620d6dfaf89e4839214e02f65ceb09dcb13a0e
-- based-on: custom._inbox_items(uuid, uuid, boolean) 9f3f7ac773c74bc887c72ad1e55f8f0befccd01d984647224942bacfdc19931a

set lock_timeout = '2s';
set statement_timeout = '120s';

CREATE OR REPLACE FUNCTION iam.organization_archive(p_org uuid, p_confirm_name text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid  uuid := (select auth.uid());
  v_org  iam.organizations%rowtype;
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

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.archived',
          jsonb_build_object('reason', v_org.archive_reason, 'name', v_org.name));

  return jsonb_build_object(
    'archived', true,
    'changed', true,
    'archived_at', v_org.archived_at,
    'sentence', format(
      '%s is archived. Its members cannot open it and nothing inside it runs, but nothing was '
      'deleted — an owner can restore it at any time.', v_org.name));
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

  insert into iam.org_admin_audit (organization_id, actor_user_id, action, detail)
  values (p_org, v_uid, 'organization.restored', jsonb_build_object('name', v_org.name));

  return jsonb_build_object(
    'archived', false, 'changed', true,
    'sentence', format(
      '%s is open again. Its members have their access back and everything inside it — records, '
      'agents, schedules — is exactly as they left it.', v_org.name));
end
$function$;


CREATE OR REPLACE FUNCTION custom._inbox_items(p_organization_id uuid, p_user_id uuid, p_include_decided boolean DEFAULT false)
 RETURNS TABLE(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text, summary text, state text, due_on timestamp with time zone, due_state text, actionable boolean, requested_by uuid, requested_by_name text, at timestamp with time zone, table_id uuid, table_name text, decided_by uuid, decided_by_name text, decided_at timestamp with time zone, outcome text, snoozed_until timestamp with time zone, cleared_at timestamp with time zone, reminded_at timestamp with time zone, woke_at timestamp with time zone, inbox_state text, sort_at timestamp with time zone, touched_by uuid, item_version integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- NOT a definer, on purpose: it has no client EXECUTE and is only ever reached from inside the
-- definer doors below (and pg_cron's tick, which runs as the store's owner), so it runs with their
-- rights and needs no door of its own.
declare
  v_now    timestamptz := custom._inbox_now();
  v_person uuid;
begin
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
$function$

;
revoke all on function custom._inbox_items(uuid, uuid, boolean) from public, anon, authenticated;

drop function if exists custom._organization_work_return(uuid, uuid);
drop function if exists custom._organization_work_withdraw(uuid, uuid);
delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('_organization_work_withdraw', '_organization_work_return');
