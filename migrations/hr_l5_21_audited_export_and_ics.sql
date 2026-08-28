-- HR domain L5 — migration 21 (register item HRB-017, lane L5 Leave & PTO).
--
-- THE TWO EXPORTS THE SPEC ASKS FOR, AND NEITHER IS A SECOND IMPLEMENTATION OF ANYTHING.
--
-- Both are §-specified, so both are built rather than deferred:
--   • §5.1 — *"Actions: adjust balance, export (audited), open ledger."*
--   • §12  — *"Export is audited (one `hr.access_audit` row carrying `row_count`, per SPEC-ACCESS
--     §4.2)."*
--   • §10  — *"Export (ICS subscription per team) is `hr_admin` + manager-scoped, and carries only
--     what the viewer's ladder rung permits."*
--
-- 🚨 THE LADDER IS NOT REIMPLEMENTED FOR THE CALENDAR FEED, IT IS INHERITED.
-- The obvious way to build an ICS feed is a fresh query over `hr.leave_request`. That is how the
-- disclosure ladder gets a second body — and the copy that drifts is the one nobody is watching,
-- because a calendar feed renders in somebody else's client where no reviewer will ever look at
-- it. `hr.leave_calendar_ics` calls `hr.leave_calendar` and serialises **its already-laddered
-- output**: a peer's entry is the word "Out" with no hours in the ICS for exactly the same reason
-- it is on the screen, and it cannot come apart from the screen because there is one decision.
--
-- The audit row is written by the export doors themselves, not asked of the caller, because an
-- audit somebody has to remember to write is an audit that is missing on the day it matters.
--
-- Authority: SPEC-LEAVE §5.1, §10, §12; SPEC-ACCESS §4.2. RFC 5545 for the ICS shape.
-- Applied live as `hr_l5_21_audited_export_and_ics`. Idempotent.

-- -----------------------------------------------------------------------------------
-- 1. Audited balances export (§5.1)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_balances_export(
  p_organization_id uuid, p_scope text default 'organization', p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_res jsonb; v_n integer; v_audit uuid; v_uid uuid := auth.uid(); v_me uuid;
begin
  -- ONE reader. The export is the list, not a second query that might disagree with it.
  v_res := hr.leave_balances(p_organization_id, p_scope, p_filters);
  if coalesce((v_res ->> 'granted')::boolean, false) is not true then
    return v_res;
  end if;
  v_n := jsonb_array_length(coalesce(v_res -> 'rows', '[]'::jsonb));

  select em.id into v_me from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;

  -- §12 / SPEC-ACCESS §4.2: ONE audit row, carrying the row count. Taking other people's balances
  -- out of the product is the act worth recording, not reading them on a screen.
  v_audit := hr._record_access_audit(
    p_organization_id => p_organization_id, p_action => 'export',
    p_target_token => 'hr_leave_enrollment', p_purpose => 'reporting',
    p_basis => case when (v_res ->> 'scope') = 'mine' then 'self' else 'role' end,
    p_granted => true, p_row_count => v_n,
    p_sensitivity_tier => 'internal',
    p_is_self_access => ((v_res ->> 'scope') = 'mine'),
    p_actor_type => 'hr_admin', p_actor_employment_id => v_me, p_actor_user_id => v_uid,
    p_request_context => jsonb_build_object('scope', v_res ->> 'scope', 'filters', p_filters));

  return v_res || jsonb_build_object('exported', true, 'row_count', v_n, 'audit_id', v_audit);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 2. Audited ledger export (§12)
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_ledger_export(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare v_res jsonb; v_n integer; v_audit uuid; v_uid uuid := auth.uid(); v_org uuid; v_me uuid;
begin
  v_res := hr.leave_ledger_view(p_employment_id, p_leave_policy_id, p_as_of);
  if coalesce((v_res ->> 'granted')::boolean, false) is not true then
    return v_res;
  end if;
  v_n := jsonb_array_length(coalesce(v_res -> 'entries', '[]'::jsonb));

  select em.organization_id into v_org from hr.employment em where em.id = p_employment_id;
  select em.id into v_me from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = v_org and em.deleted_at is null limit 1;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'export', p_target_token => 'hr_leave_ledger',
    p_purpose => 'reporting',
    p_basis => case when (v_res ->> 'viewer_rung') = 'self' then 'self' else 'role' end,
    p_granted => true, p_row_count => v_n,
    p_subject_employment_id => p_employment_id, p_sensitivity_tier => 'internal',
    p_is_self_access => ((v_res ->> 'viewer_rung') = 'self'),
    p_actor_type => case when (v_res ->> 'viewer_rung') = 'self' then 'employee' else 'hr_admin' end,
    p_actor_employment_id => v_me, p_actor_user_id => v_uid,
    p_request_context => jsonb_build_object('leave_policy_id', p_leave_policy_id, 'as_of', p_as_of));

  return v_res || jsonb_build_object('exported', true, 'row_count', v_n, 'audit_id', v_audit);
end
$function$;

-- -----------------------------------------------------------------------------------
-- 3. The who's-out ICS feed (§10), serialised FROM the laddered calendar
-- -----------------------------------------------------------------------------------

create or replace function hr.leave_calendar_ics(
  p_organization_id uuid, p_from date, p_to date, p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_cal jsonb; v_e jsonb; v_body text; v_n integer := 0; v_audit uuid;
  v_uid uuid := auth.uid(); v_me uuid; v_rung text; v_stamp text;
begin
  v_rung := hr._leave_admin_rung(p_organization_id);
  select em.id into v_me from hr.employment em join hr.employee e on e.id = em.employee_id
   where e.login_user_id = v_uid and em.organization_id = p_organization_id
     and em.deleted_at is null limit 1;

  -- §10: the feed is hr_admin + manager-scoped. A peer may READ the calendar on screen and may
  -- not subscribe a feed of it — a file that keeps refreshing in somebody's phone is a different
  -- act from looking at a page, and the spec draws the line there.
  if v_rung not in ('hr_admin','hr_owner','leave_administrator')
     and not (v_me is not null and hr._leave_has_reports(v_me)) then
    return jsonb_build_object('granted', false, 'reason','not_subscribable',
      'detail','A calendar subscription is for HR and for managers of the people on it. You can '
            || 'still see who is out on the page.');
  end if;

  -- ONE decision about who may see what. This calls the laddered reader and serialises its
  -- output; it never queries hr.leave_request itself.
  v_cal := hr.leave_calendar(p_organization_id, p_from, p_to, p_filters);
  if coalesce((v_cal ->> 'granted')::boolean, false) is not true then
    return v_cal;
  end if;

  v_stamp := to_char(now() at time zone 'utc', 'YYYYMMDD"T"HH24MISS"Z"');
  v_body := 'BEGIN:VCALENDAR' || E'\r\n'
         || 'VERSION:2.0' || E'\r\n'
         || 'PRODID:-//AI Matrx//HR Time Off//EN' || E'\r\n'
         || 'CALSCALE:GREGORIAN' || E'\r\n'
         || 'METHOD:PUBLISH' || E'\r\n'
         || 'X-WR-CALNAME:Who is out' || E'\r\n';

  for v_e in select jsonb_array_elements(coalesce(v_cal -> 'entries', '[]'::jsonb)) loop
    v_n := v_n + 1;
    v_body := v_body
      || 'BEGIN:VEVENT' || E'\r\n'
      -- stable per (person, span) so a re-subscribe updates rather than duplicates
      || 'UID:' || md5((v_e ->> 'employment_id') || (v_e ->> 'starts_on') || (v_e ->> 'ends_on'))
         || '@aimatrx' || E'\r\n'
      || 'DTSTAMP:' || v_stamp || E'\r\n'
      || 'DTSTART;VALUE=DATE:' || to_char((v_e ->> 'starts_on')::date, 'YYYYMMDD') || E'\r\n'
      -- DTEND is exclusive for all-day events (RFC 5545), so a one-day absence ends tomorrow
      || 'DTEND;VALUE=DATE:' || to_char(((v_e ->> 'ends_on')::date + 1), 'YYYYMMDD') || E'\r\n'
      -- 🚨 The SUMMARY is the ladder's own label. A peer's entry says "Out" here because it says
      -- "Out" on the screen — one decision, two renderings.
      || 'SUMMARY:' || hr._ics_escape(coalesce(v_e ->> 'employee_name', 'Someone')
                                      || ' — ' || coalesce(v_e ->> 'label', 'Out')) || E'\r\n'
      || case when v_e ->> 'existence_statement' is not null
              then 'DESCRIPTION:' || hr._ics_escape(v_e ->> 'existence_statement') || E'\r\n'
              else '' end
      || 'TRANSP:TRANSPARENT' || E'\r\n'
      || 'END:VEVENT' || E'\r\n';
  end loop;
  v_body := v_body || 'END:VCALENDAR' || E'\r\n';

  v_audit := hr._record_access_audit(
    p_organization_id => p_organization_id, p_action => 'export',
    p_target_token => 'hr_leave_request', p_purpose => 'reporting', p_basis => 'role',
    p_granted => true, p_row_count => v_n, p_sensitivity_tier => 'internal',
    p_actor_type => 'hr_admin', p_actor_employment_id => v_me, p_actor_user_id => v_uid,
    p_request_context => jsonb_build_object('from', p_from, 'to', p_to, 'filters', p_filters,
                                            'format','ics'));

  return jsonb_build_object('granted', true, 'format','text/calendar',
                            'filename', format('who-is-out-%s-to-%s.ics', p_from, p_to),
                            'event_count', v_n, 'audit_id', v_audit, 'body', v_body);
end
$function$;

create or replace function hr._ics_escape(p_text text)
returns text
language sql
immutable
as $function$
  -- RFC 5545 §3.3.11: backslash first, or the escapes we add get escaped again.
  select replace(replace(replace(replace(coalesce(p_text,''),
           '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
$function$;

-- -----------------------------------------------------------------------------------
-- 4. Doors
-- -----------------------------------------------------------------------------------

create or replace function public.hr_leave_balances_export(
  p_organization_id uuid, p_scope text default 'organization', p_filters jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_balances_export(p_organization_id, p_scope, p_filters); $function$;

create or replace function public.hr_leave_ledger_export(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_ledger_export(p_employment_id, p_leave_policy_id, p_as_of); $function$;

create or replace function public.hr_leave_calendar_ics(
  p_organization_id uuid, p_from date, p_to date, p_filters jsonb default '{}'::jsonb)
returns jsonb language sql security definer set search_path to 'public','hr'
as $function$ select hr.leave_calendar_ics(p_organization_id, p_from, p_to, p_filters); $function$;

grant execute on function public.hr_leave_balances_export(uuid,text,jsonb) to authenticated;
grant execute on function public.hr_leave_ledger_export(uuid,uuid,date) to authenticated;
grant execute on function public.hr_leave_calendar_ics(uuid,date,date,jsonb) to authenticated;

-- 🚨 THE DOOR SEAL (hr_l5_04). `grant ... to authenticated` does NOT remove the anon EXECUTE that
-- Supabase's default privileges hand every new public function, and `revoke from public` does not
-- either — anon holds its own explicit grant. Both revokes must be explicit and name anon. This
-- lane shipped five SECURITY DEFINER doors, one a WRITE, executable by anon. Replaying this file
-- re-seals rather than regressing.

select hr.leave_seal_door('hr_leave_balances_export');
select hr.leave_seal_door('hr_leave_ledger_export');
select hr.leave_seal_door('hr_leave_calendar_ics');

do $$
declare v_anon text;
begin
  select string_agg(p.proname, ', ') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hr_leave_balances_export', 'hr_leave_ledger_export', 'hr_leave_calendar_ics')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon is not null then
    raise exception 'hr_l5_21: these doors are executable by anon: %', v_anon;
  end if;
end $$;

-- -----------------------------------------------------------------------------------
-- 5. Self-proof
-- -----------------------------------------------------------------------------------

do $$
declare v_bad text;
begin
  if hr._ics_escape('a;b,c\d') <> 'a\;b\,c\\d' then
    raise exception 'hr_l5_21: ICS escaping is wrong: %', hr._ics_escape('a;b,c\d');
  end if;

  -- the feed must NOT query the request table itself — the ladder has one body
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'leave_calendar_ics') like '%from hr.leave_request%' then
    raise exception 'hr_l5_21: the ICS feed queries hr.leave_request itself, which is a second body of the disclosure ladder';
  end if;

  -- every export must write an audit row
  foreach v_bad in array array['leave_balances_export','leave_ledger_export','leave_calendar_ics'] loop
    if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'hr' and p.proname = v_bad) not like '%_record_access_audit%' then
      raise exception 'hr_l5_21: hr.% exports without writing an audit row', v_bad;
    end if;
  end loop;

  if (select count(*) from hr.leave_door_grant_audit() where verdict like 'DEFECT%') > 0 then
    raise exception 'hr_l5_21: an export door is reachable and checks nobody';
  end if;
end $$;
