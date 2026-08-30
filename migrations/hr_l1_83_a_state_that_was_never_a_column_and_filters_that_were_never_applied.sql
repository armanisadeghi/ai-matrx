-- hr_l1_83 — A STATE THAT WAS NEVER A COLUMN, AND FILTERS THAT WERE NEVER APPLIED.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend') + supabase_migrations.schema_migrations.
-- Slot: hr_l1 #0083 (re-checked against both ledgers and both migration directories at commit).
--
-- The server-side half of the route-16 closure. That lane found the defect, could only work around
-- it in the browser, and filed this. Three things, one door.
--
-- ── 1. THE GHOST COLUMN ───────────────────────────────────────────────────────────────────────
--
-- 🚨 `hr._door_list` ADVERTISED A FILTER OVER A COLUMN THAT DOES NOT EXIST. Its per-token
-- allowlist named `state` for `hr_corrective_action`, and `hr.corrective_action` has no `state`
-- column and never has — §4.8's state is DERIVED from `outcome`, `employee_acknowledgement_kind`,
-- `employee_acknowledged_at` and `follow_up_on`. The key went straight into the dynamic SQL, so
-- every corrective-action state question came back **42703 `column "state" does not exist`**,
-- swallowed by the transport into a toast. Measured on the deployed body before this change, as
-- the issuer, in a rolled-back transaction:
--
--     hr._door_list('hr_corrective_action', {organization_id, state:'acknowledged'})  → 42703
--     hr_relations_list(org, {state:'intake'})                                        → 42703
--
-- The second line is the wider harm: route 15 asks BOTH doors with ONE filter, so ANY state at
-- all — including a perfectly good INCIDENT state — took the whole queue's state control down.
--
-- 🚨 AND THE FIX IS NOT "DROP THE KEY". Dropping it would have left the state filter unservable
-- for good and left §4.8's definition written twice — once in TypeScript for the chip, and nowhere
-- for the filter. `hr.corrective_action_state(outcome, kind, acknowledged_at, follow_up_on)` is now
-- THE definition: `hr._project_row` stamps it onto every row the get and list doors emit, and
-- `hr._door_list` filters with the SAME function. A row this filter selects cannot carry a
-- different chip than the one that was asked for. All ten branches were checked against the
-- client's derivation and match branch for branch, including the two that matter most —
-- an outcome outranks everything (a RESCINDED action is not "Acknowledged"), and a refusal is
-- `declined`, never `acknowledged`, because that sentence may be read in a deposition.
--
-- ── 2. THE CENSUS ─────────────────────────────────────────────────────────────────────────────
--
-- Every name in the allowlist was re-read off `information_schema.columns` on 2026-08-30.
-- `hr_corrective_action.state` was the ONLY ghost; the other twenty names across the five
-- remaining tokens all exist, and both range columns (`incident.reported_at`,
-- `corrective_action.issued_on`) exist.
--
-- ── 3. THE FILTERS THAT WERE SILENTLY DROPPED ─────────────────────────────────────────────────
--
-- 🚨 A KEY THE DOOR DID NOT RECOGNISE WAS IGNORED, IN SILENCE, WITH `granted: true` ON TOP OF IT.
-- The caller asked a narrow question, the door answered a wider one, and the surface printed the
-- wide answer under the narrow label. This is the "Open returned 0 of 9" class wearing the
-- opposite sign — and it is the worse sign, because too many rows on a confidential queue is rows
-- the viewer just filtered away being put back in front of them. Three live instances, all
-- measured against the deployed body before this change:
--
--   • route 17's verification queue: `hr_verification_letter_request` was not in the allowlist AT
--     ALL, so its `state` and `employment_id` filters did nothing. "Awaiting consent" returned all
--     8 letters — `awaiting_consent`, `denied` AND `generated`. It now returns 1.
--   • route 15 "Assigned to": the client sends `assignee_employment_id`, the door's allowlist says
--     `assigned_to_employment_id`. Narrowed NOTHING — 17 of 17 rows came back.
--   • route 15 "OSHA recordable": no corrective action has that property, so the key was dropped on
--     that side and the door returned the employer's ENTIRE corrective-action ladder — 8 rows that
--     are not OSHA-recordable anything — under an OSHA filter. It now returns 0, which is the true
--     answer (ground truth: 0 of 9 incidents are recordable, 0 of 9 are assigned).
--
-- An unsupported filter now REFUSES BY NAME, and the refusal names what IS supported, because
-- "unsupported filter" with no list is a dead end for the next caller. Fifteen of the twenty-one
-- audited tokens still have an empty allowlist: any filter on those now says so out loud instead
-- of quietly widening a confidential list.
--
-- 🚨 AND THE UNION IS WHERE THE TWO VOCABULARIES MEET, SO THE TRANSLATION LIVES THERE. Strictness
-- alone would have turned route 15's own controls into 400s: `hr.incident` calls its subject
-- `subject_employment_id` and `hr.corrective_action` calls it `employment_id`, and an assignee
-- does not exist on a corrective action at all. `public.hr_relations_list` now maps its one
-- vocabulary onto each side's own, and for a question no corrective action can satisfy it does not
-- ask that door and contributes zero rows — `corrective_actions_granted` stays TRUE, because a
-- definite empty is an answer and `partial` must never be raised over one.
--
-- ── FALSIFICATION (live, as the issuer, rolled back; before → after) ───────────────────────────
--
--   CA state=acknowledged            42703            → 4 rows, all 'acknowledged'
--   CA state=outcome-recorded        42703            → 3 rows
--   CA state=issued                  42703            → 1 row          (4+3+1 = the 8 live rows)
--   CA unsupported key               8 rows, silent   → refuses, naming the key and the supported set
--   CA no filter / level=written     8 / 0            → 8 / 0          UNCHANGED
--   INC state=intake                 9                → 9             UNCHANGED
--   INC state=action_pending         0                → 0             UNCHANGED
--   INC no filter / osha=true        9 / 0            → 9 / 0          UNCHANGED
--   employer profile, org only       1                → 1             UNCHANGED
--   VERIF state=awaiting_consent     8 (IGNORED)      → 1
--   RELATIONS state=intake           42703            → 9 incidents, both sides granted
--   RELATIONS state=acknowledged     42703            → 4 corrective actions, both sides granted
--   RELATIONS osha_recordable        8 wrong rows     → 0
--   RELATIONS assignee               17 (IGNORED)     → 0
--
-- The client half is one file: `features/hr/people/relations/types.ts` reads the projected state
-- and keeps its identical local derivation only as the off-door fallback.

begin;

-- ── 1. THE ONE DEFINITION OF A CORRECTIVE ACTION'S STATE ──────────────────────────────────────
create or replace function hr.corrective_action_state(
  p_outcome text,
  p_acknowledgement_kind text,
  p_acknowledged_at timestamptz,
  p_follow_up_on date)
returns text
language sql
stable
as $fn$
  select case
    -- §4.8 node I. An outcome is recorded and the ladder step is closed. Terminal, and checked
    -- first: `rescinded` is an OUTCOME, not a deletion, and it outranks whatever the signature did.
    when nullif(p_outcome, '') is not null then 'outcome-recorded'
    -- §4.8 node F4. A refusal leaves `employee_acknowledged_at` NULL ON PURPOSE — nobody
    -- acknowledged anything — and stamps the kind. Checked BEFORE the acknowledged branch for
    -- exactly that reason. It is never "Acknowledged": that would put a false statement about a
    -- person on the one record that may be read in a deposition.
    when p_acknowledgement_kind = 'refused' then 'declined'
    when p_acknowledged_at is not null then
      case when p_follow_up_on is not null and p_follow_up_on <= current_date
           then 'follow-up-due'
           else 'acknowledged' end
    else 'issued'
  end
$fn$;

comment on function hr.corrective_action_state(text, text, timestamptz, date) is
  'SPEC-EMPLOYEES §4.8. THE definition of a corrective action''s state. hr.corrective_action has no state column and never has — the lifecycle is spread across outcome / employee_acknowledgement_kind / employee_acknowledged_at / follow_up_on. hr._project_row emits this onto every projected row and hr._door_list filters with it, so the chip a viewer reads and the filter that selected the row are the same rule.';

-- ── 2. THE DOOR PROJECTS IT, SO NOTHING DOWNSTREAM HAS TO RE-DERIVE IT ────────────────────────
create or replace function hr._project_row(p_token text, p_schema text, p_table text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'hr', 'public'
as $function$
declare v_row jsonb; c text; v_subject uuid; v_author uuid;
begin
  execute format('select to_jsonb(t) from %I.%I t where t.id = $1', p_schema, p_table)
     into v_row using p_id;
  if v_row is null then return null; end if;
  foreach c in array coalesce(
      (select client_excluded_columns from platform.entity_types where token = p_token), '{}'::text[])
  loop
    v_row := v_row - c;
  end loop;

  -- hr_l3_41 decision 1: whichever subject column this class actually carries. `hr.incident` names
  -- it `subject_employment_id`; the rest name it `employment_id`. Anything else keeps no name.
  v_subject := coalesce(nullif(v_row ->> 'subject_employment_id',''),
                        nullif(v_row ->> 'employment_id',''))::uuid;
  if v_subject is not null then
    v_row := v_row || jsonb_build_object(
      'subject_name', hr._subject_display_name(v_subject, auth.uid()));
  end if;

  -- hr_l3_120a: the row's AUTHOR, on its own key. A note or a piece of guidance names the person
  -- who WROTE it, which is a different fact from who it is about — `hr.restricted_note` and
  -- `hr.schedule_guidance` carry `author_employment_id` and no subject column at all, so before
  -- this branch they went out unsigned. Same one display-name door as the subject branch, so the
  -- viewer's own directory permissions decide it: a suppressed name comes back NULL and the
  -- surface renders the note without a byline. NEVER the uuid.
  v_author := nullif(v_row ->> 'author_employment_id','')::uuid;
  if v_author is not null then
    v_row := v_row || jsonb_build_object(
      'author_name', hr._subject_display_name(v_author, auth.uid()));
  end if;

  -- 🚨 hr_l1_83 — THE CORRECTIVE ACTION'S STATE IS DERIVED, AND IT IS DERIVED EXACTLY ONCE, HERE.
  -- Before this, the chip was computed in TypeScript from four raw columns while `hr._door_list`
  -- advertised a `state` filter over a column that does not exist. Two spellings of one idea is
  -- how a filter and the chip it selected can disagree; projecting it means the wire carries the
  -- answer and the door filters on the same function.
  --
  -- Keyed on the ROW'S SHAPE, never on `p_token` — hr_l3_120's rule, and it is the right rule
  -- here too: `employee_acknowledgement_kind` exists on exactly one table in the database today
  -- (checked 2026-08-30), and if a second class ever carries the same acknowledgment shape it
  -- should get the same state rather than wait for someone to add its token to a list.
  if v_row ? 'employee_acknowledgement_kind' then
    v_row := v_row || jsonb_build_object('state', hr.corrective_action_state(
      v_row ->> 'outcome',
      v_row ->> 'employee_acknowledgement_kind',
      (nullif(v_row ->> 'employee_acknowledged_at',''))::timestamptz,
      (nullif(v_row ->> 'follow_up_on',''))::date));
  end if;

  return v_row;
end
$function$;

-- ── 3. THE DOOR: NO GHOST COLUMNS, AND A FILTER IT CANNOT SERVE REFUSES BY NAME ───────────────
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
  v_derived text[]; v_consumed text[]; v_unknown text[];
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
  -- the user had just filtered away. The column name comes from this literal array and never from
  -- the caller, so `quote_ident` here is a belt over a brace. Adding a token means adding its row.
  --
  -- 🚨 hr_l1_83 — EVERY NAME BELOW WAS RE-READ OFF `information_schema.columns` ON 2026-08-30, AND
  -- ONE OF THEM WAS A GHOST. `hr_corrective_action` advertised `state`, and `hr.corrective_action`
  -- HAS NO `state` COLUMN — the key went straight into SQL and came back `42703 column "state"
  -- does not exist`, so every corrective-action state question on route 15 was a 400. It moves to
  -- `v_derived` below, where the real §4.8 predicate lives. The other five tokens' twenty-one
  -- names all exist. `hr_verification_letter_request` is NEW here: route 17 has been sending
  -- `state` and `employment_id` since hr_l1_80 and the door was dropping BOTH on the floor.
  v_allowed := case p_token
    when 'hr_incident'          then array['state','incident_kind','subject_employment_id',
                                           'assigned_to_employment_id','establishment_id',
                                           'osha_recordable','reported_anonymously']
    when 'hr_incident_party'    then array['incident_id','party_role','employment_id']
    when 'hr_corrective_action' then array['level','employment_id',
                                           'issued_by_employment_id','outcome']
    when 'hr_restricted_note'   then array['subject_token','subject_id','note_kind']
    when 'hr_leave_case'        then array['employment_id','case_kind','state']
    when 'hr_accommodation_request' then array['employment_id','state']
    when 'hr_verification_letter_request' then array['state','employment_id','verification_kind',
                                                     'request_source','includes_compensation']
    else '{}'::text[] end;

  -- Filters that are NOT a column comparison. A derived key is served by an expression over the
  -- row's real columns, so it is as answerable as any other filter — it just cannot be spelled
  -- `%I = %L`. Listed separately because the census above is a census of COLUMNS.
  v_derived := case p_token when 'hr_corrective_action' then array['state'] else '{}'::text[] end;

  -- Keys the door itself consumes for every token. `organization_id` scopes the whole call above;
  -- `from`/`to` are added below only where the token has a "when did this land" column.
  v_consumed := array['organization_id'] || v_allowed || v_derived;

  foreach v_col in array v_allowed loop
    if nullif(p_filter ->> v_col, '') is not null then
      -- compared AS TEXT so a boolean, a uuid and an enum-shaped text column all work without the
      -- caller having to know the column's type. The value is a quoted literal, never spliced.
      v_where := v_where || format(' and %I::text = %L', v_col, p_filter ->> v_col);
    end if;
  end loop;

  -- §4.8's state, expressed once, in `hr.corrective_action_state`. The SAME function
  -- `hr._project_row` stamps onto every row it emits — so a row this filter selects can never
  -- carry a different state chip than the one that was asked for.
  if p_token = 'hr_corrective_action' and nullif(p_filter ->> 'state','') is not null then
    v_where := v_where || format(
      ' and hr.corrective_action_state(outcome, employee_acknowledgement_kind,'
      || ' employee_acknowledged_at, follow_up_on) = %L', p_filter ->> 'state');
  end if;

  -- the one non-equality filter the relations queue needs: a date window over the row's own
  -- "when did this land" column, which is named differently on each side of the union.
  v_range_col := case p_token when 'hr_incident' then 'reported_at'
                              when 'hr_corrective_action' then 'issued_on' end;
  if v_range_col is not null then
    v_consumed := v_consumed || array['from','to'];
    if nullif(p_filter ->> 'from','') is not null then
      v_where := v_where || format(' and %I >= %L', v_range_col, p_filter ->> 'from');
    end if;
    if nullif(p_filter ->> 'to','') is not null then
      v_where := v_where || format(' and %I <= %L', v_range_col, p_filter ->> 'to');
    end if;
  end if;

  -- 🚨 hr_l1_83 — A FILTER THIS DOOR CANNOT SERVE NOW REFUSES BY NAME. It used to be DROPPED, in
  -- silence, with `granted: true` on top of it: the caller asked a narrow question, the door
  -- answered a wider one, and the surface printed the wide answer under the narrow label. That is
  -- the same class as "Open returned 0 of 9" wearing the opposite sign — one shows too few, this
  -- shows too many — and it is worse, because too many rows on a CONFIDENTIAL queue is rows the
  -- viewer filtered away being put back in front of them. Measured live on 2026-08-30: route 17's
  -- `state` and `employment_id` and route 15's `assignee_employment_id` were all being dropped.
  -- Fifteen of the twenty-one audited tokens still have an EMPTY allowlist, so any filter at all
  -- on those now says so instead of quietly widening. A refusal names the keys AND what is
  -- available, because "unsupported filter" with no list is a dead end for the next caller.
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_unknown
    from jsonb_object_keys(coalesce(p_filter, '{}'::jsonb)) k
   where k <> all (v_consumed);
  if array_length(v_unknown, 1) > 0 then
    raise exception 'hr audited door: % does not support the filter(s) %; it supports %',
      p_token, array_to_string(v_unknown, ', '),
      case when array_length(v_consumed,1) is null then '(none)'
           else array_to_string(v_consumed, ', ') end
      using errcode = '22023';
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

-- ── 4. ROUTE 15's UNION OWNS THE TRANSLATION BETWEEN THE TWO VOCABULARIES ─────────────────────
create or replace function public.hr_relations_list(p_organization_id uuid, p_filter jsonb default '{}'::jsonb, p_limit integer default 100)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_kind text := nullif(p_filter ->> 'case_kind','');
  v_ca jsonb := '{}'::jsonb; v_inc jsonb := '{}'::jsonb; v_rows jsonb := '[]'::jsonb;
  v_ca_filter jsonb; v_inc_filter jsonb; v_unknown text[];
  v_incident_only boolean;
  v_known constant text[] := array['organization_id','case_kind','state','assignee_employment_id',
                                   'subject_employment_id','osha_recordable','from','to'];
begin
  if v_uid is null then
    raise exception 'hr_relations_list: no authenticated caller' using errcode = '42501';
  end if;

  -- 🚨 RECORDED TECHNICAL DECISION 16c — `granted` FROM THE DOOR IS NOT THE ACCESS VERDICT HERE,
  -- AND TRUSTING IT LEAKED. Probed live as a user with no standing in the employer at all:
  -- `hr._door_list` returned `granted:true, rows:[]` — because the door's job is to scope a list,
  -- and a scope that matches nothing is an empty list, not a refusal. Rendered faithfully that is
  -- **"you have access to Employee Relations and there are no cases"** told to a stranger, which
  -- is precisely the statement §2.2 r15 forbids: no-access must make the route and the nav item
  -- ABSENT, and "an empty list says there are no cases, which is a different and false statement".
  --
  -- So standing in the employer is checked FIRST, before the door is consulted at all. The
  -- capability check stays the door's — this only establishes that the caller is somebody in this
  -- employer, which is the floor beneath every relations lane.
  if hr._l1_org_role(v_uid, p_organization_id) is null
     and hr._l1_self_employment(v_uid, p_organization_id, current_date) is null then
    perform hr._record_access_audit(
      p_organization_id => p_organization_id, p_action => 'denied',
      p_target_token => 'hr_incident', p_purpose => 'relations_list', p_basis => 'refused',
      p_granted => false, p_row_count => 0, p_sensitivity_tier => 'restricted',
      p_denial_reason => 'no_standing_in_employer');
    return jsonb_build_object('granted', false, 'reason', 'not_reachable');
  end if;

  -- hr_l1_83, same law as the door beneath it: a filter this route does not serve refuses by name.
  select coalesce(array_agg(k order by k), '{}'::text[]) into v_unknown
    from jsonb_object_keys(coalesce(p_filter, '{}'::jsonb)) k
   where k <> all (v_known);
  if array_length(v_unknown, 1) > 0 then
    raise exception 'hr_relations_list does not support the filter(s) %; it supports %',
      array_to_string(v_unknown, ', '), array_to_string(v_known, ', ')
      using errcode = '22023';
  end if;

  -- 🚨 hr_l1_83 — THE TWO CASE KINDS DO NOT SPELL THE SAME QUESTION THE SAME WAY, AND THIS UNION
  -- IS THE ONLY PLACE THAT KNOWS BOTH SPELLINGS. Route 15's controls are written in one
  -- vocabulary; `hr.incident` calls its subject `subject_employment_id` while
  -- `hr.corrective_action` calls it `employment_id`, and the assignee is `assigned_to_employment_id`
  -- on the incident and does not exist at all on the corrective action. Passing the caller's
  -- filter through UNTRANSLATED is what made three of these controls dead: measured live on
  -- 2026-08-30, "Assigned to me" narrowed NOTHING on either side (the door's allowlist names
  -- `assigned_to_employment_id`, the caller sent `assignee_employment_id`) and a subject filter
  -- narrowed the incidents while returning every corrective action in the employer.
  v_inc_filter := jsonb_strip_nulls(jsonb_build_object(
    'organization_id', p_organization_id,
    'state',                     nullif(p_filter ->> 'state',''),
    'subject_employment_id',     nullif(p_filter ->> 'subject_employment_id',''),
    'assigned_to_employment_id', nullif(p_filter ->> 'assignee_employment_id',''),
    'osha_recordable',           nullif(p_filter ->> 'osha_recordable',''),
    'from',                      nullif(p_filter ->> 'from',''),
    'to',                        nullif(p_filter ->> 'to','')));

  v_ca_filter := jsonb_strip_nulls(jsonb_build_object(
    'organization_id', p_organization_id,
    -- served by `hr.corrective_action_state` inside the door since hr_l1_83; before that this key
    -- raised 42703 on this side and took the whole queue's state control down with it.
    'state',           nullif(p_filter ->> 'state',''),
    'employment_id',   nullif(p_filter ->> 'subject_employment_id',''),
    'from',            nullif(p_filter ->> 'from',''),
    'to',              nullif(p_filter ->> 'to','')));

  -- 🚨 AN INCIDENT-ONLY QUESTION HAS AN ANSWER ON THE CORRECTIVE-ACTION SIDE, AND THE ANSWER IS
  -- "NONE" — NOT "ALL OF THEM". "OSHA recordable" and "assigned to" are properties no corrective
  -- action has, so no corrective action can satisfy them. Dropping the key and answering with the
  -- whole ladder is the silent-widening defect; asking the door with a key it refuses by name
  -- would turn a legitimate filter into a 400. So this side is not asked, and it contributes zero
  -- rows. `corrective_actions_granted` stays TRUE because nothing refused: the answer is a
  -- definite empty, which is what `partial` must NOT be raised over.
  v_incident_only := nullif(p_filter ->> 'osha_recordable','') is not null
                  or nullif(p_filter ->> 'assignee_employment_id','') is not null;

  -- 🚨 RECORDED TECHNICAL DECISION 16b — THE TWO CASE KINDS ARE NOT ON THE SAME TIER, AND THE
  -- REGISTRY IS THE ONLY HONEST SOURCE FOR WHICH.
  -- SPEC-EMPLOYEES §2.2 r15 calls `hr_restricted_list` for BOTH; §13 D-4 records the underlying
  -- disagreement (SPEC-ACCESS makes `hr.corrective_action` CONF so the subject can read what they
  -- are asked to sign; SPEC-DATA-MODEL §10.1 says restricted). Live, `hr._door_spec` returns
  -- **confidential** for `hr_corrective_action` and **restricted** for `hr_incident` — and the
  -- shared door RAISES on a tier mismatch, by design, because asking the wrong family is a caller
  -- mistake and not a refusal. Passing the tier from the registry instead of a literal means this
  -- function keeps working whichever way the ruling finally lands.
  if (v_kind is null or v_kind = 'corrective_action') and not v_incident_only then
    select hr._door_list('hr_corrective_action', v_ca_filter, p_limit, null, 'relations_list', d.tier)
      into v_ca from hr._door_spec('hr_corrective_action') d;
  elsif v_kind is null or v_kind = 'corrective_action' then
    v_ca := jsonb_build_object('granted', true, 'rows', '[]'::jsonb, 'row_count', 0);
  end if;
  if v_kind is null or v_kind = 'incident' then
    select hr._door_list('hr_incident', v_inc_filter, p_limit, null, 'relations_list', d.tier)
      into v_inc from hr._door_spec('hr_incident') d;
  end if;

  -- 🚨 no-access here is the STRONGEST instance of §1.3: the caller gets `granted:false` and the
  -- client makes the route AND the nav item absent. It is never an empty list, because an empty
  -- list says "there are no cases" and that is a different, false statement.
  if not coalesce((v_ca ->> 'granted')::boolean, false)
     and not coalesce((v_inc ->> 'granted')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason',
      coalesce(v_ca ->> 'reason', v_inc ->> 'reason', 'no_lane'),
      'audit_id', coalesce(v_ca ->> 'audit_id', v_inc ->> 'audit_id'));
  end if;

  select coalesce(jsonb_agg(r order by r ->> 'sort_at' desc), '[]'::jsonb) into v_rows from (
    select (row || jsonb_build_object('case_kind','corrective_action',
              'sort_at', row ->> 'issued_on')) as r
      from jsonb_array_elements(coalesce(v_ca -> 'rows', '[]'::jsonb)) as row
    union all
    select (row || jsonb_build_object('case_kind','incident',
              'sort_at', row ->> 'reported_at')) as r
      from jsonb_array_elements(coalesce(v_inc -> 'rows', '[]'::jsonb)) as row) s;

  return jsonb_build_object(
    'granted', true, 'rows', v_rows,
    -- RECORDED DECISION 16: this total is what THIS viewer may see, by design.
    'total', jsonb_array_length(v_rows),
    'total_is_viewer_scoped', true,
    'corrective_actions_granted', coalesce((v_ca ->> 'granted')::boolean, false),
    'incidents_granted', coalesce((v_inc ->> 'granted')::boolean, false),
    -- §2.2 r15: export is ABSENT on this route in v1. A CSV of complaints is exactly the artifact
    -- that should not exist by accident.
    'export_available', false);
end
$function$;

-- ── 5. THE CONTRACTS, AMENDED WITH REASONS ───────────────────────────────────────────────────
update hr.function_contract set
  home_migration = 'hr_l1_83',
  must_contain = array[
    'v_allowed := case p_token',
    'and deleted_at is null',
    'format('' and %I::text = %L'', v_col, p_filter ->> v_col)',
    'does not support the filter(s)',
    'hr.corrective_action_state(outcome, employee_acknowledgement_kind,'],
  must_not_contain = array[
    'where organization_id = $1 %s order by id limit $2',
    'array[''state'',''level'',''employment_id'''],
  reason = 'hr_l1_75: filters come from a per-token ALLOWLIST and are quoted, never spliced. Soft-deleted rows are excluded. The first banned string is the pre-hr_l1_75 scan that applied no filter but the employer. AMENDED hr_l1_83, two reasons. (a) The allowlist named `state` for hr_corrective_action and that column DOES NOT EXIST — every corrective-action state question was a live 42703, and because hr_relations_list asks both doors with one filter it took the incident side''s state control down too. The second banned string is that exact ghost spelling. §4.8''s state is now served by hr.corrective_action_state(), the SAME function hr._project_row stamps onto every projected row, so the filter and the chip can never disagree. (b) A key the door does not support used to be DROPPED IN SILENCE under granted:true — measured live, route 17''s state filter returned 8 of 8 letters and route 15''s assignee filter returned 17 of 17 rows. It now refuses by name and names what is supported. NOTE: this function still returns granted:true with an empty rows array for a caller with no capability, ON PURPOSE — public.hr_relations_list (hr_l1_74, RECORDED DECISION 16c) owns the refusal by checking standing in the employer first.'
where schema_name = 'hr' and function_name = '_door_list';

-- 🚨 AMENDED, NOT REPLACED, AND THE BAN ON `p_token =` STAYS. hr_l3_120's rule is that a per-token
-- column name in this function is how the next author-shaped table goes out unsigned, so the
-- corrective-action state branch added by hr_l1_83 keys on the ROW'S SHAPE
-- (`v_row ? 'employee_acknowledgement_kind'`) exactly as the subject and author branches do.
update hr.function_contract set
  home_migration = 'hr_l1_83',
  must_contain = array['subject_employment_id', 'author_employment_id', '_subject_display_name',
                       'hr.corrective_action_state('],
  must_not_contain = array['directory_opt_out', '_punch_capability', 'p_token ='],
  reason = 'hr_l3_120: this is the ONE projection every audited HR door returns through. It resolves a person''s name for BOTH shapes a table can carry — subject (hr_l3_41) and author (hr_l3_120) — and it resolves neither itself: both go through hr._subject_display_name so the directory-suppression rule has exactly one body. A per-token column name in here means the next author-shaped table renders unsigned again, which is the defect that migration fixed. AMENDED hr_l1_83: it now also stamps the corrective action''s DERIVED §4.8 state, because this is the one place both audited doors pass through — projecting it at either door would give the get and the list different answers. It keys on the row''s shape, never on p_token, which is why the ban above is unchanged.'
where schema_name = 'hr' and function_name = '_project_row';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer)
values
  ('hr', 'corrective_action_state', 'hr_l1_83',
   array['then ''outcome-recorded''', 'then ''declined''', 'then ''follow-up-due''', 'else ''issued'''],
   array[]::text[],
   'SPEC-EMPLOYEES §4.8. THE definition of a corrective action''s state, and the only one. hr.corrective_action has no state column; the lifecycle is spread across four columns. The branch ORDER is the contract: an outcome outranks everything (a rescinded action is not "Acknowledged"), and a refusal is `declined` — never `acknowledged` — because that sentence may be read in a deposition, and a refusal deliberately leaves employee_acknowledged_at NULL. Not SECURITY DEFINER and not needed as one: it reads no table, only its four arguments.',
   true, false),
  ('public', 'hr_relations_list', 'hr_l1_83',
   array['assigned_to_employment_id', 'v_incident_only', 'does not support the filter(s)'],
   array[]::text[],
   'Route 15''s union owner, and the ONLY place that knows both case kinds'' spellings. hr_l1_83: passing the caller''s one filter through untranslated made three controls dead — the door''s allowlist says assigned_to_employment_id while the caller sends assignee_employment_id, and hr.corrective_action names its subject employment_id, not subject_employment_id. An incident-only question (OSHA, assignee) is not asked of the corrective-action door at all: no corrective action can satisfy it, so the honest answer is zero rows, and corrective_actions_granted stays true because nothing refused. Standing in the employer is still checked BEFORE either door (hr_l1_74, RECORDED DECISION 16c).',
   true, true)
on conflict (schema_name, function_name, home_migration) do nothing;

commit;
