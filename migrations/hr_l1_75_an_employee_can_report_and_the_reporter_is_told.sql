-- hr_l1_75 — AN EMPLOYEE CAN REPORT, AND THE REPORTER IS TOLD SOMETHING TRUE.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Slot: hr_l1 #0075.
--
-- Closes the DATABASE half of verifier C's T-L1-6 verdict (2026-08-29). The subject-exclusion
-- CORE was verified bulletproof by that pass — the veto overrides `incident.read`, the self lane,
-- `hr_owner` and break-glass, absolutely, every denial audited. NOTHING HERE WEAKENS IT. Every
-- change below is falsified against "the veto still overrides everything" in PART 7.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────────────────────────
--
-- 🚨 (1) THE EXCLUSION TRIGGER IGNORED `subject_excluded = false`, so the veto fired on records it
-- was never meant to touch. `hr._incident_excluded_actors_refresh` materialised
-- `new.subject_employment_id` into `excluded_actor_ids` UNCONDITIONALLY. §4.9b C3 says a safety
-- report or a near miss defaults `subject_excluded` FALSE, and `hr_incident_create` honours that
-- (it inserts the subject's `accused` party row only `if … and v_excluded`) — but the trigger then
-- put the subject in the array anyway. The forklift near-miss is the case the spec names, and the
-- one person who can explain what happened was vetoed out of their own record, with the denial
-- audited as if they had been probing a complaint about themselves.
--
-- The fix is EXACTLY ONE CLAUSE WIDE: the subject arm becomes conditional on
-- `new.subject_excluded`. The reporter arm, the `accused` arm and the manager expansion are
-- untouched, because none of them is what the flag governs:
--   · `accused` parties are excluded because being accused IS the exclusion act — a person added
--     as a respondent to a NON-excluded safety incident still loses reach, and must.
--   · the reporter arm exists solely to pull the REPORTER'S MANAGER into the array
--     (`hr.incident_excluded` subtracts the reporter themselves — see its header) — that is the
--     "I reported my own manager" protection and it does not depend on the subject flag.
-- So on a harassment case, where `subject_excluded` is PLATFORM-LOCKED true by
-- `hr_incident_create`, this trigger produces a byte-identical array to the one it produced
-- before. PART 7 asserts that, per incident, over the live table.
--
-- 🚨 (2) `hr_incident_status` HANDED THE REPORTER A RAW ENUM AND NO NEXT STEP. §2.2 route 16 and
-- §4.9b J both promise the reporter "state, last-updated, and the declared NEXT STEP". The door
-- returned `state` (the raw `intake`), `updated_at`, and `next_step_on` — which is
-- `hr.incident.follow_up_on`, A DATE. There is no next-step text column on `hr.incident` and the
-- spec never declared one, so the word "declared" had nothing behind it: the reporter's surface
-- could render a badge reading `intake` and literally nothing under "What happens next".
--
-- The door now ships the key AND the label in one payload — the house pattern
-- (SPEC-LEAVE's `blackouts_hit: [{key, label, mode}]` is the corpus precedent for an enum a user
-- reads) — plus `next_step`, A SENTENCE, derived from the state and `follow_up_on` and NOTHING
-- ELSE. That derivation lives in the DOOR and not in the client for the reason the client
-- component's own header gives: this is a separate door precisely so it cannot leak, and a door
-- cannot leak a field it was never given. `next_step_on` and `state` are KEPT — this is strictly
-- additive on the wire.
--
-- 🚨 (3) THE REPORTER'S STATUS PAGE WAS REACHABLE ONLY BY GUESSING A URL. `hr_incident_status`
-- takes an incident id, and an ordinary employee has no door anywhere that would ever tell them
-- one: `hr_restricted_list('hr_incident', …)` scopes them out, and route 15 is ABSENT for
-- employees by §2.2. Somebody who reported harassment had a real need the product could not meet.
-- `hr_my_incident_reports()` is that door, and it is deliberately the SAME PROJECTION as
-- `hr_incident_status` — no summary, no parties, no assignee, no notes — over exactly the rows
-- where the caller is the reporter. The veto is applied per row.
--
-- 🚨 (4) `hr._door_list` IGNORED EVERY FILTER EXCEPT `organization_id`, and returned soft-deleted
-- rows. Its scan is `where organization_id = $1` and nothing else, so route 15's state / subject /
-- assignee / date / OSHA filters were decorative — the client asked, the door answered with
-- everything, and the surface showed rows the user had filtered out. There is also no way to ask
-- it for one incident's party rows, which §2.2 route 16 requires ("`hr.incident_party`
-- (component, conveyed by the parent's reach)"). Filters are now applied from a PER-TOKEN
-- ALLOWLIST — a key not on the list is IGNORED, never interpolated — and soft-deleted rows are
-- excluded.
--
-- 🚨 WHAT THIS FILE DELIBERATELY DOES **NOT** DO. `hr._door_list` still returns
-- `granted:true, rows:[]` for a caller with no capability, and that is now CORRECT BY DESIGN and
-- owned one level up: `public.hr_relations_list` (hr_l1_74, RECORDED DECISION 16c) checks standing
-- in the employer BEFORE consulting the door and returns `granted:false` itself. Changing the
-- door's granted semantics here would break that decision. The client fix for "a refusal renders
-- as an empty list" is to CALL hr_relations_list, and it lands in the same commit.
--
-- ── APPLY PATH ────────────────────────────────────────────────────────────────────────────────
-- Idempotent: every statement is CREATE OR REPLACE or an upsert. Re-running is a no-op.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 0 — THE PRE-STATE, CAPTURED SO PART 7 CAN COMPARE AGAINST IT.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create temporary table _hr_l1_75_before on commit drop as
select i.id, i.subject_excluded, i.excluded_actor_ids
  from hr.incident i;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — THE VETO STOPS FIRING ON RECORDS IT WAS NEVER MEANT TO TOUCH.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._incident_excluded_actors_refresh()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'hr', 'public'
as $function$
declare
  v_on      date;
  v_direct  uuid[];
begin
  v_on := (new.occurred_at)::date;

  v_direct := array(
    select distinct x from (
      -- 🚨 THE SUBJECT ARM IS THE ONE THE FLAG GOVERNS, AND IT USED TO BE UNCONDITIONAL.
      -- §4.9b C2/C3: complaint / ethics / harassment / discrimination default the subject OUT
      -- (and the first three are PLATFORM-LOCKED true in hr_incident_create, so this arm cannot
      -- be switched off for them by any org, any knob, or any payload); safety and near_miss
      -- default the subject IN, because the person involved in a forklift near-miss is the one
      -- who can explain it. Without this guard the subject of a NON-excluded incident was vetoed
      -- from their own record and their read was audited as a denial — the opposite of what
      -- `defaultSubjectExcluded()` tells the reporter on the intake form.
      select case when new.subject_excluded then new.subject_employment_id end as x
      union all
      -- The reporter arm is NOT conditional and must not become so. hr.incident_excluded()
      -- SUBTRACTS the reporter themselves (§5 names them by giving them hr_incident_status), so
      -- the only person this arm actually vetoes is the reporter's MANAGER — "I reported my own
      -- manager" is the classic leak, and it is not a fact about the subject flag.
      select case when new.reported_anonymously then null else new.reporter_employment_id end
      union all
      -- An `accused` party is excluded because BEING ACCUSED IS THE EXCLUSION ACT. This arm stays
      -- unconditional: a person added as a respondent to a safety incident still loses reach on
      -- their very next request, exactly as §4.9b H1 requires.
      select ip.employment_id
        from hr.incident_party ip
       where ip.incident_id = new.id
         and ip.party_role = 'accused'
         and ip.deleted_at is null
    ) s
    where x is not null);

  new.excluded_actor_ids := array(
    select distinct y from (
      select unnest(v_direct) as y
      union all
      select hr.manager_as_of(d, v_on) from unnest(v_direct) d
    ) t
    where y is not null);

  return new;
end
$function$;

-- Re-drive every existing row through the corrected trigger. `hr._incident_party_redrive_veto`
-- already uses this exact no-op-update idiom; this is the same act over the whole table.
-- NOTE: platform._touch_row bumps `updated_at` on every row this re-drive touches, which moves
-- the "Last updated" the reporter sees by the width of this migration. That is a truthful
-- statement about the record — its exclusion set really did change today — and it is preferable
-- to a set that stays wrong.
do $$
begin
  perform hr.arm_write();
  update hr.incident i set subject_excluded = i.subject_excluded;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — THE SHARED LIST DOOR ANSWERS THE QUESTION IT WAS ASKED.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._door_list(p_token text, p_filter jsonb, p_limit integer, p_cursor text, p_purpose text, p_expect_tier text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'hr', 'public'
as $function$
declare
  v_uid uuid := auth.uid(); d record; v_schema text; v_table text; v_org uuid;
  v_ids uuid[] := '{}'; v_rows jsonb := '[]'::jsonb; v_audit uuid; rec record;
  v_limit int; v_kept int := 0; v_verdict jsonb; v_next text;
  v_allowed text[]; v_col text; v_where text := ''; v_range_col text;
begin
  if v_uid is null then
    raise exception 'hr audited door: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr audited door: % is not an audited-tier token', p_token using errcode = '22023';
  end if;
  if p_expect_tier is not null and d.tier <> p_expect_tier then
    raise exception 'hr audited door: % is the % tier', p_token, d.tier using errcode = '22023';
  end if;

  v_org := nullif(p_filter ->> 'organization_id','')::uuid;
  if v_org is null then
    select em.organization_id into v_org
      from hr.employment em where em.id = any(hr.employments_of(v_uid)) limit 1;
  end if;
  if v_org is null then
    raise exception 'hr audited door: a list call needs an organization; pass p_filter.organization_id'
      using errcode = '22023';
  end if;

  if d.caps is null then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_row_count => 0, p_sensitivity_tier => d.tier, p_denial_reason => d.no_door_reason);
    return jsonb_build_object('granted', false, 'reason', 'no_door', 'detail', d.no_door_reason,
                              'audit_id', v_audit);
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;

  -- 🚨 THE FILTER ALLOWLIST. Before hr_l1_75 this function applied NO filter but the employer, so
  -- route 15's state / subject / assignee / OSHA / date controls were decorative: the client
  -- asked a narrow question and the door answered with everything, and the surface showed rows
  -- the user had just filtered away. A key that is not on this list is IGNORED — it is never
  -- interpolated into SQL, and the column name comes from this literal array and never from the
  -- caller, so `quote_ident` here is a belt over a brace. Adding a token means adding its row.
  v_allowed := case p_token
    when 'hr_incident'          then array['state','incident_kind','subject_employment_id',
                                           'assigned_to_employment_id','establishment_id',
                                           'osha_recordable','reported_anonymously']
    when 'hr_incident_party'    then array['incident_id','party_role','employment_id']
    when 'hr_corrective_action' then array['state','level','employment_id',
                                           'issued_by_employment_id','outcome']
    when 'hr_restricted_note'   then array['subject_token','subject_id','note_kind']
    when 'hr_leave_case'        then array['employment_id','case_kind','state']
    when 'hr_accommodation_request' then array['employment_id','state']
    else '{}'::text[] end;

  foreach v_col in array v_allowed loop
    if nullif(p_filter ->> v_col, '') is not null then
      -- compared AS TEXT so a boolean, a uuid and an enum-shaped text column all work without the
      -- caller having to know the column's type. The value is a quoted literal, never spliced.
      v_where := v_where || format(' and %I::text = %L', v_col, p_filter ->> v_col);
    end if;
  end loop;

  -- the one non-equality filter the relations queue needs: a date window over the row's own
  -- "when did this land" column, which is named differently on each side of the union.
  v_range_col := case p_token when 'hr_incident' then 'reported_at'
                              when 'hr_corrective_action' then 'issued_on' end;
  if v_range_col is not null then
    if nullif(p_filter ->> 'from','') is not null then
      v_where := v_where || format(' and %I >= %L', v_range_col, p_filter ->> 'from');
    end if;
    if nullif(p_filter ->> 'to','') is not null then
      v_where := v_where || format(' and %I <= %L', v_range_col, p_filter ->> 'to');
    end if;
  end if;

  -- 🚨 A SOFT-DELETED ROW IS NOT A LISTABLE ROW, AND THIS FUNCTION USED TO LIST ONE. Every token
  -- hr._door_spec knows carries `deleted_at` (platform.entity_types.has_soft_delete is true for
  -- all 21), so this is unconditional. It is NOT the void lane: a VOIDED incident (hr_l1_76) is
  -- never hidden — it keeps `deleted_at IS NULL` and renders struck through, because a hidden
  -- void is a destroyed record.
  v_where := v_where || ' and deleted_at is null';

  -- §4.2 performance is a REQUIREMENT: 200 rows must come back inside the authenticated role's 8s
  -- statement_timeout with room to spare (§9 T-18 asserts p95 < 500 ms). A slow audited path is
  -- how HR admins end up demanding a bulk export, which is a worse outcome than the read they
  -- were slowed down on.
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);

  for rec in execute format(
      'select id from %I.%I where organization_id = $1 %s %s order by id limit $2',
      v_schema, v_table, v_where,
      case when to_jsonb(p_cursor) is null or p_cursor is null then ''
           else 'and id > ' || quote_literal(p_cursor) || '::uuid' end)
    using v_org, v_limit * 4
  loop
    v_verdict := hr._door_verdict(v_uid, p_token, rec.id, false);
    if (v_verdict ->> 'allowed')::boolean then
      v_ids := v_ids || rec.id;
      v_rows := v_rows || jsonb_build_array(hr._project_row(p_token, v_schema, v_table, rec.id));
      v_kept := v_kept + 1;
      exit when v_kept >= v_limit;
    end if;
  end loop;

  if v_kept > 0 then v_next := v_ids[array_upper(v_ids,1)]::text; end if;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => p_token,
    p_purpose => coalesce(p_purpose,'operational'),
    p_basis => case when v_kept = 0 then 'refused' else 'role' end,
    p_granted => (v_kept > 0),
    p_target_ids => v_ids[1:100], p_row_count => v_kept, p_sensitivity_tier => d.tier,
    p_denial_reason => case when v_kept = 0 then 'no row in this organization is reachable by the caller''s capabilities' end);

  return jsonb_build_object('granted', true, 'rows', v_rows, 'row_count', v_kept,
                            'next_cursor', v_next, 'audit_id', v_audit);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — THE REPORTER IS TOLD SOMETHING TRUE, IN WORDS.
-- ──────────────────────────────────────────────────────────────────────────────────────────────

-- The state's human label. One definition, so the badge, the queue and the reporter's page can
-- never disagree about what `action_pending` is called.
create or replace function hr.incident_state_label(p_state text)
 returns text
 language sql
 immutable
as $function$
  select case p_state
    when 'intake'         then 'Open'
    when 'investigating'  then 'Investigating'
    when 'action_pending' then 'Action pending'
    when 'resolved'       then 'Resolved'
    when 'closed'         then 'Closed'
    when 'referred'       then 'Referred'
    else initcap(replace(coalesce(p_state,''), '_', ' ')) end;
$function$;

-- 🚨 THE DECLARED NEXT STEP, AND WHY IT IS BUILT HERE AND NOT IN THE CLIENT.
-- §2.2 r16 and §4.9b J promise the reporter a next step. `hr.incident` carries no next-step text
-- column and the spec never declared one — the only fact available is `follow_up_on`, a date. So
-- the sentence is DERIVED, and it is derived from the state and that date and NOTHING ELSE. It is
-- built inside the database because the reporter's view is a separate door precisely so it cannot
-- leak: a sentence assembled here can only ever contain the two facts passed into this function,
-- whereas a sentence assembled on the case payload would grow a new leak every time somebody adds
-- a field. Nothing from `summary`, nothing from a party, nothing from a note. Ever.
create or replace function hr.incident_next_step_sentence(p_state text, p_follow_up_on date)
 returns text
 language sql
 immutable
as $function$
  select case p_state
    when 'intake' then
      'Your report has been received and is waiting to be picked up by the people who handle these.'
    when 'investigating' then
      'Someone is looking into what you reported.'
    when 'action_pending' then
      'The review is finished and a decision is being made about what happens next.'
    when 'resolved' then
      'This has been resolved. You will not be told what was decided about anyone else.'
    when 'closed' then
      'This is closed. The record is kept for as long as the law requires.'
    when 'referred' then
      'This has been passed to someone outside the usual team to handle.'
    else 'Your report is on file.' end
  || case when p_follow_up_on is null then ''
          else ' The next check-in on it is set for '
               || to_char(p_follow_up_on, 'FMMonth FMDD, YYYY') || '.' end;
$function$;

create or replace function public.hr_incident_status(p_incident_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'hr'
as $function$
declare v_uid uuid := auth.uid(); i hr.incident%rowtype; v_mine uuid[]; v_audit uuid; v_is_reporter boolean;
begin
  if v_uid is null then
    raise exception 'hr_incident_status: no authenticated caller' using errcode = '42501';
  end if;
  select * into i from hr.incident where id = p_incident_id and deleted_at is null;
  if not found then
    raise exception 'hr_incident_status: no hr.incident with id %', p_incident_id using errcode = 'P0002';
  end if;
  v_mine := hr.employments_of(v_uid);
  v_is_reporter := i.reporter_employment_id is not null and i.reporter_employment_id = any(v_mine);

  if not (v_is_reporter or hr.capability(v_uid,'incident.read', null, current_date, i.organization_id)
          or exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'investigator'
                        and ip.deleted_at is null and ip.employment_id = any(v_mine))) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'the caller is neither the reporter, an investigator, nor an incident.read holder');
    return jsonb_build_object('granted', false, 'reason', 'no_capability', 'audit_id', v_audit);
  end if;

  -- the veto still applies: a SUBJECT probing for their own case leaves a trail and gets nothing
  if hr.incident_excluded(v_uid, p_incident_id) then
    v_audit := hr._record_access_audit(
      p_organization_id => i.organization_id, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'employee_request', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_sensitivity_tier => 'restricted',
      p_subject_employment_id => i.subject_employment_id,
      p_denial_reason => 'SPEC-ACCESS §5: subject-exclusion veto');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  v_audit := hr._record_access_audit(
    p_organization_id => i.organization_id, p_action => 'read', p_target_token => 'hr_incident',
    p_purpose => 'employee_request', p_basis => case when v_is_reporter then 'self' else 'role' end,
    p_granted => true, p_target_ids => ARRAY[p_incident_id], p_row_count => 1,
    p_sensitivity_tier => 'restricted', p_subject_employment_id => i.subject_employment_id,
    p_is_self_access => v_is_reporter and i.subject_employment_id = any(v_mine));

  -- state, last-updated and the declared next step. NOTHING else — no summary, no parties, no
  -- notes. `state_label` and `next_step` ride alongside the raw values, never instead of them:
  -- the key and the label in one payload is the house pattern, and a caller that wants the enum
  -- still has it.
  return jsonb_build_object('granted', true, 'audit_id', v_audit,
    'incident_id', i.id, 'state', i.state,
    'state_label', hr.incident_state_label(i.state),
    'updated_at', i.updated_at,
    'next_step', hr.incident_next_step_sentence(i.state, i.follow_up_on),
    'next_step_on', i.follow_up_on, 'reported_at', i.reported_at,
    'resolved_at', i.resolved_at);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 4 — THE REPORTER CAN FIND THEIR OWN REPORT WITHOUT GUESSING A URL.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
--
-- 🚨 THE SAME PROJECTION AS hr_incident_status, DELIBERATELY. This function is the list twin of
-- that door and it ships exactly the fields that door ships plus the kind the reporter themselves
-- chose. It does NOT ship the summary — not because the summary is secret from its own author,
-- but because the guarantee that makes the reporter lane safe is structural: a door that was
-- never given a field cannot leak it, and "the reporter lane carries status and nothing else" is
-- a sentence somebody can check by reading this body.
--
-- An ANONYMOUS report has no `reporter_employment_id` by construction (§4.9b A2), so it can never
-- appear here — which is the anonymity working, not a gap.
create or replace function public.hr_my_incident_reports(p_organization_id uuid DEFAULT NULL)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_mine uuid[]; v_rows jsonb := '[]'::jsonb; v_ids uuid[] := '{}';
  v_audit uuid; v_org uuid := p_organization_id; rec record;
begin
  if v_uid is null then
    raise exception 'hr_my_incident_reports: no authenticated caller' using errcode = '42501';
  end if;
  v_mine := hr.employments_of(v_uid);
  if v_org is null then
    select em.organization_id into v_org
      from hr.employment em where em.id = any(v_mine) limit 1;
  end if;
  if v_org is null then
    -- no employment anywhere: an honest empty list, not a refusal. This person has filed nothing
    -- because this person is not an employee, and saying so leaks nothing about any record.
    return jsonb_build_object('granted', true, 'rows', '[]'::jsonb, 'row_count', 0);
  end if;

  for rec in
    select i.* from hr.incident i
     where i.organization_id = v_org
       and i.deleted_at is null
       and i.reported_anonymously = false
       and i.reporter_employment_id = any(v_mine)
     order by i.reported_at desc
     limit 200
  loop
    -- the veto is applied PER ROW and it is applied here too: a reporter who has since been named
    -- as a respondent on their own report loses it from this list on their very next request.
    continue when hr.incident_excluded(v_uid, rec.id);
    v_ids := v_ids || rec.id;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'incident_id',   rec.id,
      'incident_kind', rec.incident_kind,
      'state',         rec.state,
      'state_label',   hr.incident_state_label(rec.state),
      'next_step',     hr.incident_next_step_sentence(rec.state, rec.follow_up_on),
      'next_step_on',  rec.follow_up_on,
      'reported_at',   rec.reported_at,
      'updated_at',    rec.updated_at,
      'resolved_at',   rec.resolved_at));
  end loop;

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'list', p_target_token => 'hr_incident',
    p_purpose => 'employee_request', p_basis => 'self',
    p_granted => true, p_target_ids => v_ids[1:100],
    p_row_count => coalesce(array_length(v_ids,1), 0),
    p_sensitivity_tier => 'restricted', p_is_self_access => true);

  return jsonb_build_object('granted', true, 'rows', v_rows,
    'row_count', coalesce(array_length(v_ids,1), 0), 'audit_id', v_audit);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 5 — REGISTER BEFORE YOU GRANT.
-- The DDL guard strips an EXECUTE grant on a function that is not declared a client door, so the
-- registry row goes in FIRST and the grant second. Order is load-bearing, not stylistic.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'hr_my_incident_reports', 'p_organization_id uuid', 'hr_l1_75',
   'SPEC-EMPLOYEES §2.2 route 16 / §4.9b J. The list twin of hr_incident_status: an ordinary '
   || 'employee who filed a report can find it without being handed a uuid. It authorizes inside '
   || 'the door — rows are restricted to incidents where the caller''s own employment is the '
   || 'reporter, and hr.incident_excluded() is applied per row — and it ships the status '
   || 'projection only: state, label, next step, dates. No summary, no parties, no notes, ever. '
   || 'Anonymous reports carry no reporter linkage and so can never appear.'),
  ('public', 'hr_incident_status', 'p_incident_id uuid', 'hr_l1_75',
   'Re-declared by hr_l1_75, which added state_label and the declared next-step sentence to the '
   || 'payload. SPEC-EMPLOYEES §2.2 route 16: the reporter reaches state, last-updated and the '
   || 'declared next step, and nothing in the notes. Gated inside the door to the reporter, an '
   || 'investigator party, or an incident.read holder, with §5''s veto evaluated over all three.')
on conflict do nothing;

grant execute on function public.hr_my_incident_reports(uuid) to authenticated;
revoke all on function public.hr_my_incident_reports(uuid) from public, anon;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 6 — CONTRACT PINS. What a later re-emit may not quietly drop.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', '_incident_excluded_actors_refresh', 'hr_l1_75',
   array['case when new.subject_excluded then new.subject_employment_id end',
         'ip.party_role = ''accused'''],
   array['select new.subject_employment_id as x'],
   'hr_l1_75: the subject arm is CONDITIONAL on subject_excluded (§4.9b C3 — the forklift '
   || 'near-miss subject reads their own record) and the accused arm is NOT (being accused is the '
   || 'exclusion act). The banned clause is the exact unconditional line this migration replaced: '
   || 'restoring it re-vetoes every safety subject from their own record and audits the read as a '
   || 'denial. Widening in the other direction is worse — making the accused arm conditional would '
   || 'hand a respondent the case about them on any incident an org left unflagged.',
   true),
  ('public', 'hr_incident_status', 'hr_l1_75',
   array['''state_label'', hr.incident_state_label(i.state)',
         '''next_step'', hr.incident_next_step_sentence(i.state, i.follow_up_on)',
         'hr.incident_excluded(v_uid, p_incident_id)'],
   array['i.summary', 'restricted_note', 'incident_party ip
                      where ip.incident_id = i.id and ip.party_role = ''accused'''],
   'hr_l1_75: the reporter''s door ships the label and the derived next-step sentence, and the '
   || 'veto is evaluated inside it. The banned strings are the leak this door exists to prevent: '
   || 'the summary is not the reporter''s to be handed back through a status lane, and a note or a '
   || 'party list here would make the reporter an investigator, which SPEC-ACCESS §5 says they are '
   || 'not. next_step is derived from state and follow_up_on ONLY — that is why both arguments are '
   || 'pinned by name.',
   true),
  ('public', 'hr_my_incident_reports', 'hr_l1_75',
   array['i.reporter_employment_id = any(v_mine)',
         'i.reported_anonymously = false',
         'continue when hr.incident_excluded(v_uid, rec.id)'],
   array['''summary''', 'incident_party'],
   'hr_l1_75: three clauses make this door safe and all three are pinned. The reporter filter is '
   || 'the whole authorization; the anonymity filter keeps a walk-in HR typed as anonymous out of '
   || 'any list; the per-row veto means a reporter who has since been accused loses their own '
   || 'report on the next request. It ships the hr_incident_status projection and nothing wider.',
   true),
  ('hr', '_door_list', 'hr_l1_75',
   array['v_allowed := case p_token', 'and deleted_at is null',
         'format('' and %I::text = %L'', v_col, p_filter ->> v_col)'],
   array['where organization_id = $1 %s order by id limit $2'],
   'hr_l1_75: filters come from a per-token ALLOWLIST and are quoted, never spliced — a key that '
   || 'is not on the list is ignored rather than interpolated. Soft-deleted rows are excluded. The '
   || 'banned string is the pre-hr_l1_75 scan that applied no filter but the employer, which made '
   || 'every filter control on route 15 decorative and made one incident''s party rows '
   || 'unaskable-for. NOTE: this function still returns granted:true with an empty rows array for '
   || 'a caller with no capability, ON PURPOSE — public.hr_relations_list (hr_l1_74, RECORDED '
   || 'DECISION 16c) owns the refusal by checking standing in the employer first.',
   true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART 7 — FALSIFICATION. Every assert is about the VETO STILL OVERRIDING EVERYTHING.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bad int; v_broken int; v_moved int; v_soft int;
begin
  -- 1. THE CORE IS UNCHANGED WHERE IT MATTERS. For every incident whose subject IS excluded — the
  --    entire complaint/ethics/harassment/discrimination family, platform-locked — the newly
  --    materialised array must be IDENTICAL to the one that stood before this migration ran.
  select count(*) into v_bad
    from _hr_l1_75_before b join hr.incident i on i.id = b.id
   where b.subject_excluded
     and (select array_agg(x order by x) from unnest(b.excluded_actor_ids) x) is distinct from
         (select array_agg(x order by x) from unnest(i.excluded_actor_ids) x);
  if v_bad > 0 then
    raise exception 'hr_l1_75: % excluded-subject incident(s) changed their exclusion set. The core moved. Refusing.', v_bad;
  end if;

  -- 2. THE FIX ACTUALLY FIRED. For an incident with subject_excluded = false and a real subject,
  --    that subject must no longer be in the array.
  select count(*) into v_bad
    from hr.incident i
   where not i.subject_excluded
     and i.subject_employment_id is not null
     and i.subject_employment_id = any(i.excluded_actor_ids)
     and not exists (select 1 from hr.incident_party ip
                      where ip.incident_id = i.id and ip.party_role = 'accused'
                        and ip.deleted_at is null
                        and ip.employment_id = i.subject_employment_id);
  if v_bad > 0 then
    raise exception 'hr_l1_75: % non-excluded subject(s) are still vetoed from their own record.', v_bad;
  end if;

  -- 3. AN ACCUSED PARTY IS STILL VETOED, ON EVERY INCIDENT, EXCLUDED OR NOT. This is the arm the
  --    fix deliberately did NOT touch, and it is the one that would matter most if it slipped.
  select count(*) into v_bad
    from hr.incident_party ip join hr.incident i on i.id = ip.incident_id
   where ip.party_role = 'accused' and ip.deleted_at is null
     and ip.employment_id is not null
     and not (ip.employment_id = any(i.excluded_actor_ids));
  if v_bad > 0 then
    raise exception 'hr_l1_75: % accused part(ies) are NOT in their incident''s exclusion set.', v_bad;
  end if;

  -- 4. Report what moved, so the record says it rather than implying it.
  select count(*) into v_moved
    from _hr_l1_75_before b join hr.incident i on i.id = b.id
   where (select array_agg(x order by x) from unnest(b.excluded_actor_ids) x) is distinct from
         (select array_agg(x order by x) from unnest(i.excluded_actor_ids) x);
  raise notice 'hr_l1_75: % incident exclusion set(s) changed (all of them non-excluded subjects).', v_moved;

  -- 5. Blast radius of the new `deleted_at is null` list filter, measured rather than assumed.
  select count(*) into v_soft from hr.incident where deleted_at is not null;
  raise notice 'hr_l1_75: % soft-deleted hr.incident row(s) newly excluded from lists.', v_soft;

  -- 6. The label and sentence functions answer for every live state value.
  if exists (select 1 from hr.incident i
              where hr.incident_state_label(i.state) is null
                 or hr.incident_next_step_sentence(i.state, i.follow_up_on) is null) then
    raise exception 'hr_l1_75: a live incident state has no label or no next-step sentence.';
  end if;

  -- 7. No contract anywhere in hr is broken by this file.
  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_75: % contract(s) broken', v_broken;
  end if;
end $$;
