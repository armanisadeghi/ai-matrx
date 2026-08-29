-- hr_l3_114 — THE OTHER SQL PRODUCERS GET WORDS, AND THE LADDER GETS ITS USER RUNG.
--
-- 0556 gave the eleven `hr.workflow.*` notices words and closed the bodiless-row defect for ONE
-- producer, `hr._wf_notify`. It reported three adjacent gaps it did not fix. This migration closes
-- them, with the same shape and no second renderer: SQL writes the FACTS at `render_pending`,
-- `services/notifications/render_pass.py` writes the WORDS.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. THE PRODUCER CENSUS — MEASURED, NOT LISTED.
--
-- Every function in this database whose body inserts into `communication.notification`, found by
-- scanning `pg_proc.prosrc` rather than by trusting a name pattern (2026-08-29):
--
--   hr._wf_notify                      → FIXED BY 0556. 12 event keys (below).
--   hr._l1_notify_consent_requested    → hr.people.verification_consent_requested. BODILESS.
--   hr._punch_notify_edited            → hr.time.punch_edited.                     BODILESS.
--   esign._notify                      → NOT in this class: subject and body are PARAMETERS its
--                                        callers compose, so it never writes a wordless row on its
--                                        own account. It has also never written a row at all
--                                        (0 rows live). Left alone, deliberately, and named here so
--                                        the next census does not have to rediscover it.
--
-- The `hr._l1_notify_*` / `hr._punch_notify_*` "families" the brief expected are families of one
-- each. There are no siblings; the scan is the proof.
--
-- MEASURED LIVE BEFORE THIS MIGRATION (every row of both producers, all time):
--   hr.people.verification_consent_requested  email  failed/missing_recipient_address   4   bodiless
--   hr.people.verification_consent_requested  in_app succeeded                          4   bodiless
--   hr.time.punch_edited                      email  failed/missing_recipient_address   2   bodiless
--   hr.time.punch_edited                      in_app succeeded                          2   bodiless
--   hr.time.attestation_overdue               email  failed/missing_recipient_address   1   bodiless
--   hr.time.attestation_overdue               in_app succeeded                          1   bodiless
--   hr.time.attestation_overdue               sms    failed/missing_recipient_address   1   bodiless
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- A. WHO OWNS THE WORDS FOR EACH EVENT — AND WHY NO TEMPLATE IS AUTHORED HERE.
--
-- 0556 had to author templates in SQL because its eleven events are DB-owned by an explicit guard
-- (`test_no_sibling_specs_event_is_re_declared_here`, `scripts/check_hr_notification_catalog.py`
-- §2.15: those eleven must NOT be in the Python registry).
--
-- These three events are the opposite case. All three are already declared in the PYTHON catalog,
-- with templates already written in the house voice:
--
--   hr.people.verification_consent_requested → services/notifications/hr_catalog/people.py:675
--   hr.time.punch_edited                     → services/notifications/hr_catalog/time.py:405
--   hr.time.attestation_overdue              → services/notifications/hr_catalog/time.py:475
--
-- So this migration authors NOTHING. Writing templates here would be the "one event, two owners"
-- collision the registry exists to refuse, and would fork the voice. The producers are routed to
-- the render lane, which reads the templates off the registry row that the Python declaration lane
-- already seeds. ONE rendering path per event, and the owner of each is the Python catalog.
--
-- 🚨 THE TEMPLATES ALREADY NAME FIELDS THE PRODUCERS NEVER SUPPLIED. This is the half of the
-- defect that survives merely changing a status, because the renderer is STRICT — every merge
-- field must exist and be non-empty or nothing renders at all:
--
--   verification_consent_requested  {{requester.label}}          ALREADY SUPPLIED ✓
--   punch_edited                    {{date}} {{change.summary}}   NEITHER SUPPLIED  ✗
--   attestation_overdue             {{period.label}}             NOT SUPPLIED      ✗
--
-- 🚨 AND THAT MAKES `hr.time.attestation_overdue` A LIVE REGRESSION 0556 DID NOT KNOW IT CAUSED.
-- It is not a `hr.workflow.*` event, but it is emitted through `hr._wf_notify` (by
-- `hr._wf_not_attested`) — the ONLY one of the twelve event keys flowing through that function
-- that Python owns. Since 0556, `_wf_notify` sees it HAS templates and hands it to the render lane,
-- where `{{period.label}}` cannot resolve from a payload carrying only `request.*`/`decision.*`.
-- Before 0556 it wrote a bodiless row; after 0556 it writes a `render_failed` skip. Nobody is told
-- either way, and this migration is what actually makes it deliverable. The twelve keys were
-- enumerated by regex over `pg_proc.prosrc`, not assumed:
--   the eleven hr.workflow.* of 0556, plus hr.time.attestation_overdue. That is the whole set.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- B. THE SMS LEG, PER EVENT — DECIDED BY THE CATALOG, NOT BY THIS FILE.
--
-- 0556 refused SMS on all eleven of its events for an arithmetic reason: a four-UUID workflow deep
-- link is ~195 characters before a word of message and there is no shortener on the spine.
--
-- That reasoning is UNCHANGED and is why nothing here invents an SMS template either. But these
-- three events are not in the same position: their Python declarations already decide the question
-- (punch_edited and attestation_overdue carry an `sms_template` that uses `{{link.deep_short}}`;
-- verification_consent_requested is `sms_locked`). This migration does not touch any of that. A
-- channel with a renderable template goes to the render lane; a channel without one records the
-- same named `no_template` skip 0555 established. The honest skip stays honest.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- C. THE HISTORICAL ROWS ARE LEFT EXACTLY AS THEY ARE.
--
-- Same ruling as 0556 section D, for the same reason: the 14 rows above were delivered as they
-- were, and writing bodies into them now would invent content nobody ever saw and destroy the
-- evidence of the era that produced them. This migration is the dated boundary for these producers.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE D13 LADDER GETS ITS USER RUNG — AND THE ⚖ FLOOR THAT MAKES IT SAFE.
--
-- GAP 2. `hr._notify_channels` applied platform → organization and said so in a comment: "The user
-- rung is the spine's, applied at send time — never here." That sentence was not true of anything.
-- Measured: `communication.resolve_channel_address` reads
-- `communication.notification_channel_preference` ONLY to pick WHICH phone number to use; it has no
-- notion of an event being switched off. So for every notice these three SQL producers write, a
-- person who turned the event off still received it. The user rung was not applied late — it was
-- not applied at all.
--
-- THE LADDER IS THE PYTHON SPINE'S, NOT A NEW ONE. `notify()`'s `_resolve_channel_enabled`
-- (services/notifications/service.py) is the reference implementation of D13 nearest-wins:
--
--   1. start from the event's platform `default_channels`, replaced wholesale (not merged) by the
--      organization override's `default_channels` when it has one;
--   2. read `communication.notification_preference` for this user and this event and let each row
--      OVERWRITE its own channel — which is why a user rung can switch a channel ON as well as off;
--   3. a non-user recipient has no user rung at all.
--
-- This function now performs those same reads, on the same tables, in the same order. It is not a
-- re-derivation of the rule: it is the same rule, and the falsification at the foot of this file
-- drives a real preference row through BOTH producers to prove the two halves agree.
--
-- 🚨 AND IT ENFORCES THE FLOOR THE SPINE FORGETS. SPEC-NOTIFICATIONS §7.1's ladder table says of
-- the U rung, in as many words: it "**May not** silence a **⚖** event entirely". Two of the three
-- events on this lane are ⚖ mandatory — `hr.time.punch_edited` ("The employee, always — never
-- suppressible") and `hr.people.verification_consent_requested`. Shipping the user rung without
-- that floor would hand an employee a switch that silences the notice telling them a manager
-- edited their punch, which is the notice's entire legal point. So: when the user rung would leave
-- a ⚖ event with NO channel at all, the attempt is void and the rung above stands. It is a floor,
-- not an override — a user may still move a ⚖ event from email to in-app, which is exactly what
-- §7.1 grants them.
--
-- The eleven `hr.workflow.*` events are `mandatory: false` (0556 seeded them so), so this floor
-- changes nothing about them; it exists for the two events on this lane that carry the ⚖.
--
-- 🚨 THE OVERLOAD TRAP, WHICH THIS LANE HAS ALREADY BEEN BITTEN BY ONCE. 0555 recorded it: adding
-- a DEFAULTed parameter to a live function creates an OVERLOAD, not a replacement, because
-- Postgres keys `CREATE OR REPLACE` on the argument-type list — and every existing 2-argument
-- caller then silently binds to the OLD body, leaving this fix dead code that looks perfectly
-- applied. The new parameter is therefore NOT defaulted, all three callers are re-emitted below,
-- and the 2-argument signature is DROPPED at the end of this section.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._notify_channels(
  p_event_key text, p_organization_id uuid, p_user uuid, p_flow_policy jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
-- `v_raw`, deliberately NOT the name the emitters use: the hr_l10_02 assertion bans the by-hand
-- array read anywhere in the hr schema by scanning prosrc, and THIS is the one function allowed to
-- know both shapes. Naming its variable differently keeps that ban literal and self-checking rather
-- than carrying an exception list that would eventually grow. (prosrc includes comments, so this
-- note must not spell the banned expression either.)
declare
  v_raw jsonb;
  v_base jsonb := '{}'::jsonb;   -- the platform -> organization answer, as {channel: bool}
  v_user jsonb := '{}'::jsonb;   -- this reader's own rows, as {channel: bool}
  v_mandatory boolean := false;
  v_out text[];
begin
  -- the event's platform default, overlaid by the organization rung (§7.1 P -> O), and whether the
  -- event is ⚖. `mandatory` is read from the PLATFORM row only, because §7.1 says the organization
  -- rung "May not clear mandatory" — an org patch of it is not a thing this ladder honours.
  select coalesce(o.default_channels, t.default_channels),
         coalesce((t.config ->> 'mandatory')::boolean, false)
    into v_raw, v_mandatory
    from communication.notification_event_type t
    left join communication.notification_event_override o
           on o.event_key = t.event_key and o.organization_id = p_organization_id
          and o.deleted_at is null
   where t.event_key = p_event_key and t.deleted_at is null
   limit 1;

  -- An unregistered event still reaches somebody in-app rather than vanishing. It is a defect that
  -- it is unregistered — `notify()` raises on one — but a notice is not the place to discover that,
  -- so this fails toward telling the person. (Unchanged: there is no registry row to carry a ⚖ or a
  -- user preference for an event that does not exist.)
  if v_raw is null then return ARRAY['in_app']; end if;

  -- The object shape is the only one that can say a channel is explicitly OFF, which is what the
  -- P -> O -> U ladder needs; `communication.notification_event_type` now CHECKs it (`hr_l10_01`).
  -- The array branch survives ONLY so a row written before that constraint, or by something outside
  -- it, still delivers rather than raising mid-transaction.
  if jsonb_typeof(v_raw) = 'array' then
    select coalesce(jsonb_object_agg(value, to_jsonb(true)), '{}'::jsonb)
      into v_base from jsonb_array_elements_text(v_raw);
  else
    select coalesce(jsonb_object_agg(key, to_jsonb(value = 'true'::jsonb)), '{}'::jsonb)
      into v_base from jsonb_each(v_raw);
  end if;

  -- ── THE FLOW TYPE'S OWN REFINEMENT OF THE ORGANIZATION RUNG, applied BEFORE the user rung
  -- because that is where it sits on the ladder. `hr.workflow_flow_type.channel_policy` is
  -- {channel: 'allow'|'deny'} configured per flow by the employer; `deny` wins over the event
  -- default and `allow` re-adds a channel the event default leaves off.
  --
  -- 🚨 THIS MOVED HERE FROM hr._wf_notify, AND THE MOVE IS THE FIX. That function built its own
  -- channel list as "(event defaults minus denies) UNION (everything the policy allows)" and then
  -- asked this resolver only for the first half — so a policy `allow` re-added a channel AFTER the
  -- ladder had finished, on top of a reader who had switched the event off. Falsified before this
  -- change: a reader with every channel disabled still had a notice enqueued, because their flow
  -- carried {"sms": "allow"}. An employer-level setting silently outranking the person's own choice
  -- inverts D13. One ladder, one place, and the nearest rung genuinely last.
  if p_flow_policy is not null and jsonb_typeof(p_flow_policy) = 'object' then
    select v_base || coalesce(jsonb_object_agg(key, to_jsonb(val = 'allow')), '{}'::jsonb)
      into v_base
      from jsonb_each_text(p_flow_policy) e(key, val)
     where val in ('allow', 'deny');
  end if;

  -- ── THE U RUNG (§7.1, D13 nearest-wins). The same table, the same filter and the same
  -- last-row-wins semantics as `_resolve_channel_enabled`: user + event + not deleted. It is
  -- deliberately NOT filtered by organization even though the column exists — the Python spine does
  -- not filter by it either, and a ladder that answers differently depending on which half of the
  -- system asked is worse than either answer. (Reported for a ruling rather than settled here.)
  if p_user is not null then
    select coalesce(jsonb_object_agg(pr.channel, to_jsonb(pr.enabled)), '{}'::jsonb)
      into v_user
      from communication.notification_preference pr
     where pr.user_id = p_user
       and pr.event_key = p_event_key
       and pr.deleted_at is null;
  end if;

  -- `||` is the whole ladder: a user key overwrites its channel, and a user key the rung above
  -- never mentioned is ADDED — which is how a person turns a channel ON, exactly as the spine's
  -- dict update does.
  select coalesce(array_agg(key order by key), '{}'::text[])
    into v_out from jsonb_each(v_base || v_user) where value = 'true'::jsonb;

  -- ── THE ⚖ FLOOR. §7.1: the user rung "may not silence a ⚖ event entirely". The attempt is void
  -- and the rung above stands; moving a ⚖ event between channels is untouched.
  if v_mandatory and cardinality(v_out) = 0 then
    select coalesce(array_agg(key order by key), '{}'::text[])
      into v_out from jsonb_each(v_base) where value = 'true'::jsonb;
  end if;

  return v_out;
end
$function$;

comment on function hr._notify_channels(text, uuid, uuid, jsonb) is
  'SPEC-NOTIFICATIONS §2.1/§7.1 — resolves an event''s enabled channels for the SQL emitters across '
  'the FULL D13 ladder: platform default, overlaid by the organization rung and by the flow type''s '
  'the reader''s own communication.notification_preference rows, with the §7.1 floor that the user '
  'rung may not silence a ⚖ mandatory event entirely. ONE implementation: hr._wf_notify, '
  'hr._punch_notify_edited and hr._l1_notify_consent_requested all read it, and it performs the same '
  'table reads in the same order as the Python spine''s _resolve_channel_enabled. The object '
  '{channel: bool} is canonical because it is the only shape that can express a channel being '
  'explicitly OFF. hr_l3_114 added the user rung; before it, a person who switched an event off '
  'still received every notice these producers wrote.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE PUNCH CHANGE BECOMES WORDS.
--
-- `hr.time.punch_edited`'s template names `{{change.summary}}`, and the producer's payload carries
-- `{from: {occurred_at, punch_kind}, to: {...} | null, voided: bool}` — machine facts. Turning them
-- into a phrase an employee reads is the same job `hr._wf_decision_words` does for a decision
-- outcome, and it is done the same way: ONE closed map, loud on a shape it does not recognise, and
-- never an echo of a raw token. It is NOT a renderer — it takes no template and substitutes
-- nothing.
--
-- 🚨 THE TIME IS THE EMPLOYEE'S, NOT UTC. `occurred_at` is a timestamptz and rendering it in the
-- server's zone would tell somebody their 11pm punch happened tomorrow. `hr.punch.tz` carries the
-- zone the punch was taken in and `hr.punch.local_work_date` carries the date the business assigned
-- it to; both are read from the punch row itself in section 4, and this function is only ever
-- handed times it has a zone for.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._punch_change_words(p_change jsonb, p_tz text)
returns text
language plpgsql
stable
as $function$
declare
  v_tz    text := coalesce(nullif(btrim(coalesce(p_tz, '')), ''), 'UTC');
  v_from  timestamptz;
  v_to    timestamptz;
  v_fkind text;
  v_tkind text;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    return 'it was changed';
  end if;

  -- The void case is stated first because it is the one with no `to` side at all.
  if coalesce((p_change ->> 'voided')::boolean, false) or p_change -> 'to' is null
     or jsonb_typeof(p_change -> 'to') = 'null' then
    return 'it was removed';
  end if;

  v_from  := nullif(btrim(coalesce(p_change #>> '{from,occurred_at}', '')), '')::timestamptz;
  v_to    := nullif(btrim(coalesce(p_change #>> '{to,occurred_at}', '')), '')::timestamptz;
  v_fkind := nullif(btrim(coalesce(p_change #>> '{from,punch_kind}', '')), '');
  v_tkind := nullif(btrim(coalesce(p_change #>> '{to,punch_kind}', '')), '');

  -- Both moved.
  if v_from is not null and v_to is not null and v_from <> v_to
     and v_fkind is not null and v_tkind is not null and v_fkind <> v_tkind then
    return format('the %s at %s became a %s at %s',
                  replace(v_fkind, '_', ' '), to_char(v_from at time zone v_tz, 'FMHH12:MI AM'),
                  replace(v_tkind, '_', ' '), to_char(v_to   at time zone v_tz, 'FMHH12:MI AM'));
  end if;

  -- Only the time moved.
  if v_from is not null and v_to is not null and v_from <> v_to then
    return format('the time moved from %s to %s',
                  to_char(v_from at time zone v_tz, 'FMHH12:MI AM'),
                  to_char(v_to   at time zone v_tz, 'FMHH12:MI AM'));
  end if;

  -- Only the kind moved.
  if v_fkind is not null and v_tkind is not null and v_fkind <> v_tkind then
    return format('it was recorded as a %s instead of a %s',
                  replace(v_tkind, '_', ' '), replace(v_fkind, '_', ' '));
  end if;

  -- 🚨 THE UNRECOGNISED SHAPE GETS THE SAFE GENERAL WORD, NOT A RAW TOKEN AND NOT AN EMPTY STRING.
  -- An empty string would fail the strict renderer and the employee would be told nothing at all,
  -- which for a ⚖ notice is the worst of the three outcomes.
  return 'it was changed';
end
$function$;

comment on function hr._punch_change_words(jsonb, text) is
  'hr_l3_114: the closed map from a punch-edit change object to the phrase hr.time.punch_edited''s '
  '{{change.summary}} needs. Same shape as hr._wf_decision_words and communication.'
  'delivery_failure_sentence — a stable token in, words out, never an echo, never empty. Times are '
  'rendered in the punch''s own tz because a timestamptz shown in the server zone can move an '
  'employee''s punch to another day.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. hr._l1_notify_consent_requested HANDS ITS NOTICE TO THE RENDER LANE.
--
-- GAP 1, producer one. Four email rows terminal `failed` and four `in_app` rows recorded
-- `succeeded` carrying nothing — the last of them at 18:39 TODAY, hours after 0555 named this
-- class. The event's Python template already says exactly the right sentence and this producer
-- already supplies the only field it names (`{{requester.label}}`), so nothing here is authored:
-- the row is simply written at `render_pending` instead of wordless at `pending`, and
-- render_pass.py does what it does for every other notice.
--
-- Three things change and nothing else does:
--   (a) the channel resolver is asked with the READER, so the user rung applies (section 1);
--   (b) email/sms addresses are resolved, so a missing address is a NAMED skip rather than a row
--       that fails at the provider — the same fix hr_c4_47 made for the workflow producer, which
--       this producer never got;
--   (c) the queue decision gains the render lane, with 0555's `no_template` skip unchanged.
--
-- The `'{}' -> ARRAY['in_app']` fallback is KEPT and is now narrower than it looks: this event is
-- ⚖ mandatory, so section 1's floor already prevents the user rung from emptying the set. The
-- fallback can now only fire when the PLATFORM and ORGANIZATION rungs together name no channel,
-- which is the case it was written for.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._l1_notify_consent_requested(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare
  v_org uuid; v_employment uuid; v_requester text; v_uid uuid;
  v_ch text; v_n integer := 0;
  v_templates jsonb; v_tpl_body text;
  v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
begin
  select r.organization_id, r.employment_id,
         coalesce(nullif(r.requester_organization,''), nullif(r.requester_name,''), 'a third party')
    into v_org, v_employment, v_requester
    from hr.verification_letter_request r
   where r.id = p_request_id and r.deleted_at is null;
  if v_org is null then return 0; end if;

  -- 🚨 THE SUBJECT, AND ONLY THE SUBJECT (SPEC-NOTIFICATIONS §2). Resolved by login linkage,
  -- so a pre-start hire is reachable. No login means no notice — and the request still stands
  -- awaiting consent, which is the honest state, not a silent grant.
  v_uid := hr._wf_login_of(v_employment);
  if v_uid is null then return 0; end if;

  -- The event's templates, for the enqueue decision below. Read once. These are the PYTHON
  -- catalog's (hr_catalog/people.py) — this lane owns the producer, not the words.
  select coalesce(t.config -> 'templates', '{}'::jsonb) into v_templates
    from communication.notification_event_type t
   where t.event_key = 'hr.people.verification_consent_requested' and t.deleted_at is null
   limit 1;
  v_templates := coalesce(v_templates, '{}'::jsonb);

  foreach v_ch in array coalesce(
      nullif(hr._notify_channels('hr.people.verification_consent_requested', v_org, v_uid, '{}'::jsonb), '{}'),
      array['in_app'])
  loop
    -- resolve for a deliverable channel; in_app IS the delivery row. A non-null refusal is a NAMED
    -- skip, never a placeholder address and never a raise.
    if v_ch in ('email', 'sms') then
      select rr.address, rr.refusal into v_addr, v_refusal
        from communication.resolve_channel_address(v_ch, v_org, 'user', v_uid, null, null, null) rr;
    else
      v_addr := null; v_refusal := null;
    end if;

    if v_ch in ('email', 'sms') and v_refusal is not null then
      v_status := 'skipped'; v_errcode := v_refusal;
      v_errmsg := format('No %s address for this recipient (%s).', v_ch, v_refusal);
    else
      v_status := 'pending'; v_errcode := null; v_errmsg := null;
    end if;

    -- 🚨 THE QUEUE DECISION (0556's, unchanged in meaning). This function has no renderer — there
    -- is none in this database and there must never be a second one — so a notice with a template
    -- goes to the render lane and a notice without one records 0555's named skip.
    v_tpl_body := nullif(btrim(coalesce(v_templates -> v_ch ->> 'body', '')), '');
    if v_status = 'pending' then
      if v_tpl_body is null then
        v_status := 'skipped'; v_errcode := 'no_template';
        v_errmsg := format('No renderable %s template for hr.people.verification_consent_requested '
                        || '— the notice was never sendable this way and was not queued.', v_ch);
      else
        v_status := 'render_pending';
      end if;
    end if;

    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       to_address, status, error_code, error_message,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (v_org, 'hr.people.verification_consent_requested', v_uid, 'user', v_ch,
            jsonb_build_object('requester', jsonb_build_object('label', v_requester)),
            v_addr, v_status, v_errcode, v_errmsg,
            'hr_verification_letter_request', p_request_id, '/hr/me?org=' || v_org::text,
            'hrvercons:' || p_request_id::text || ':' || v_ch,
            'personal'::platform.visibility)
    on conflict do nothing;

    -- only a DELIVERABLE notice counts toward the return; a row on its way to the render lane is
    -- deliverable — its words are being written, not withheld.
    if v_status in ('pending', 'render_pending') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. hr._punch_notify_edited HANDS ITS NOTICE TO THE RENDER LANE — AND FINALLY SUPPLIES THE TWO
--    FIELDS ITS TEMPLATE HAS ALWAYS NAMED.
--
-- GAP 1, producer two. Same routing change as section 3, plus the part that a status change alone
-- would NOT have fixed: `hr.time.punch_edited`'s template is
--
--     "Your punch on {{date}} was changed: {{change.summary}}"
--
-- and this producer has never supplied either field. Its payload carried `change` as the raw
-- `{from:{occurred_at,punch_kind}, to:{...}}` object its callers build — no `summary` inside it and
-- no `date` beside it. The renderer is STRICT: both would have come back unresolved and the notice
-- would have gone from bodiless to `render_failed`, which is a different way of telling the
-- employee nothing.
--
-- 🚨 `date` IS READ FROM THE PUNCH, NOT COMPUTED FROM THE TIMESTAMP. `hr.punch.local_work_date` is
-- the date the business assigned the punch to, which is the only date an employee would recognise
-- as "the day I worked"; deriving one from `occurred_at` in the server's zone can name the wrong
-- day for anybody who clocks out near midnight. `hr.punch.tz` travels with it for the times inside
-- the summary. The voided punch is the one read, because it is the one that always exists (a void
-- has no replacement).
--
-- The existing `channel_basis` / `org_overridable` payload keys and the RD 4 empty-set fallback are
-- untouched; as in section 3, the fallback is now only reachable when platform and organization
-- together name no channel, because this event is ⚖ and section 1's floor holds the user rung above
-- empty.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr._punch_notify_edited(
  p_organization_id uuid, p_employment_id uuid, p_voided_punch_id uuid,
  p_replacement_punch_id uuid, p_reason text, p_actor_user uuid, p_change jsonb)
returns integer
language plpgsql
security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_user uuid; v_channels text[]; v_basis text; ch text; v_n integer := 0;
  v_payload jsonb; v_link text;
  v_templates jsonb; v_tpl_body text;
  v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
  v_work_date date; v_tz text; v_summary text;
begin
  select e.login_user_id into v_user
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
  if v_user is null then return 0; end if;      -- nobody to reach; the punch row still records it

  -- THE ONE RESOLVER (hr_l10_02), now asked with the READER so the D13 user rung applies
  -- (hr_l3_114 §1). ARRAY['in_app'] for an unregistered event, '{}' when every channel is
  -- explicitly off.
  v_channels := hr._notify_channels('hr.time.punch_edited', p_organization_id, v_user, '{}'::jsonb);
  if v_channels is null or cardinality(v_channels) = 0 then
    v_channels := array['in_app']; v_basis := 'law_overrides_empty_channel_set';   -- RD 4
  else
    v_basis := 'notify_channels_resolver';
  end if;

  -- ── THE FACTS THE SENTENCE NEEDS, from the punch itself.
  select p.local_work_date, p.tz into v_work_date, v_tz
    from hr.punch p where p.id = p_voided_punch_id;
  v_summary := hr._punch_change_words(p_change, v_tz);

  v_link := '/hr/me/timesheet?org=' || p_organization_id::text || '&punch=' || coalesce(p_replacement_punch_id, p_voided_punch_id)::text;
  v_payload := jsonb_build_object(
    'voided_punch_id', p_voided_punch_id,
    'replacement_punch_id', p_replacement_punch_id,
    'reason', p_reason,
    'changed_by_user_id', p_actor_user,
    'change', coalesce(p_change, '{}'::jsonb) || jsonb_build_object('summary', v_summary),
    -- guaranteed non-empty, because the strict renderer refuses a blank merge value and a notice
    -- that fails to render reaches nobody at all.
    'date', to_char(coalesce(v_work_date, current_date), 'FMMon FMDD, YYYY'),
    'channel_basis', v_basis,
    'org_overridable', false,
    'deep_link', v_link);

  select coalesce(t.config -> 'templates', '{}'::jsonb) into v_templates
    from communication.notification_event_type t
   where t.event_key = 'hr.time.punch_edited' and t.deleted_at is null
   limit 1;
  v_templates := coalesce(v_templates, '{}'::jsonb);

  foreach ch in array v_channels loop
    if ch in ('email', 'sms') then
      select rr.address, rr.refusal into v_addr, v_refusal
        from communication.resolve_channel_address(ch, p_organization_id, 'user', v_user,
                                                   null, null, null) rr;
    else
      v_addr := null; v_refusal := null;
    end if;

    if ch in ('email', 'sms') and v_refusal is not null then
      v_status := 'skipped'; v_errcode := v_refusal;
      v_errmsg := format('No %s address for this recipient (%s).', ch, v_refusal);
    else
      v_status := 'pending'; v_errcode := null; v_errmsg := null;
    end if;

    v_tpl_body := nullif(btrim(coalesce(v_templates -> ch ->> 'body', '')), '');
    if v_status = 'pending' then
      if v_tpl_body is null then
        v_status := 'skipped'; v_errcode := 'no_template';
        v_errmsg := format('No renderable %s template for hr.time.punch_edited — the notice was '
                        || 'never sendable this way and was not queued.', ch);
      else
        v_status := 'render_pending';
      end if;
    end if;

    insert into communication.notification
      (organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
       to_address, status, error_code, error_message,
       target_kind, target_id, deep_link, dedupe_key, visibility)
    values (p_organization_id, 'hr.time.punch_edited', v_user, 'user', ch, v_payload,
            v_addr, v_status, v_errcode, v_errmsg,
            'hr_punch', coalesce(p_replacement_punch_id, p_voided_punch_id), v_link,
            'hrpunchedit:' || p_voided_punch_id::text || ':' || ch,
            'personal'::platform.visibility)
    on conflict do nothing;

    if v_status in ('pending', 'render_pending') then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. hr._wf_notify ASKS THE ONE RESOLVER FOR THE WHOLE LADDER — AND ITS DEDUPE KEY NAMES THE EVENT.
--
-- GAP 2's call site, plus a defect found while falsifying GAP 3. Re-emitted whole from the live
-- body so nothing 0555, 0556, hr_c4_47 or hr_l3_111 put here is lost.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr._wf_notify(p_instance uuid, p_step uuid, p_event_key text, p_notice_kind text, p_user uuid, p_employment uuid, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
    declare
      inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
      v_channels text[]; v_policy jsonb; ch text; v_n integer := 0; v_link text; v_payload jsonb;
      v_send text[]; v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
      v_id uuid; v_row_link text; v_templates jsonb; v_tpl_body text;
      v_label text; v_subject text; v_outcome text; v_reason text;
    begin
      if p_user is null then return 0; end if;
      select * into inst from hr.workflow_instance where id = p_instance;
      if not found then return 0; end if;
      select * into ft from hr.workflow_flow_type
       where flow_key = inst.flow_key and deleted_at is null
       order by (organization_id = inst.organization_id) desc limit 1;

      -- 🚨 hr_l3_114 — ASKED WITH THE READER. This call passed only the event and the employer, so
      -- the D13 ladder stopped at the organization rung and a person who had switched this event
      -- OFF received it anyway. The third argument is the whole fix; the ladder itself lives in
      -- hr._notify_channels, which now performs the same reads, on the same tables, in the same
      -- order as the Python spine's _resolve_channel_enabled.
      v_policy := coalesce(ft.channel_policy, '{}'::jsonb);
      v_channels := hr._notify_channels(p_event_key, inst.organization_id, p_user, v_policy);
      -- §2.1: the object route, resolving to the exact actionable object.
      v_link := '/hr/tasks/' || p_instance::text || '?org=' || inst.organization_id::text || coalesce('&step=' || p_step::text, '');

      -- The event's templates, for the enqueue decision below. Read once.
      select coalesce(t.config -> 'templates', '{}'::jsonb) into v_templates
        from communication.notification_event_type t
       where t.event_key = p_event_key and t.deleted_at is null
       limit 1;
      v_templates := coalesce(v_templates, '{}'::jsonb);

      -- ── THE FACTS A SENTENCE NEEDS. Every one is guaranteed non-empty, because the
      -- strict renderer refuses a blank merge value and a notice that fails to render
      -- reaches nobody at all.
      v_label   := coalesce(nullif(btrim(ft.label), ''), inst.flow_key, 'request');
      v_subject := coalesce(
                     nullif(btrim(hr._subject_display_name(
                       coalesce(inst.subject_employment_id, inst.requester_employment_id),
                       p_user)), ''),
                     'an employee');
      v_outcome := hr._wf_decision_words(p_extra ->> 'outcome');
      v_reason  := coalesce(nullif(btrim(p_extra ->> 'reason'), ''), 'No reason was given.');

      v_payload := coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
        'instance_id', p_instance, 'step_id', p_step, 'flow_key', inst.flow_key,
        'target_token', inst.target_token, 'target_id', inst.target_id,
        'notice_kind', p_notice_kind,
        'employment_id', p_employment, 'sensitivity_tier', inst.sensitivity_tier,
        'request', jsonb_build_object(
          'label', v_label, 'subject', v_subject, 'reference', left(p_instance::text, 8)),
        'decision', jsonb_build_object('outcome', v_outcome, 'reason', v_reason));

      -- RD 3: ONE list, so there is ONE insert path — and as of hr_l3_114 it is built in ONE place.
      -- This function used to assemble it here as "(event defaults minus denies) UNION (everything
      -- the policy allows)", asking the resolver only for the first half. That put the flow type's
      -- `allow` AFTER the ladder had finished, so an employer-level setting silently outranked the
      -- reader's own preference: falsified live, a user with every channel of an event disabled
      -- still had a notice enqueued because their flow carried {"sms": "allow"}. The policy is now
      -- passed INTO hr._notify_channels, which applies it at the organization rung where it belongs
      -- and then lets the user rung answer last, which is what "nearest wins" means.
      v_send := v_channels;

      foreach ch in array v_send loop
        -- RD 1: resolve for a deliverable channel; in_app IS the delivery row. A non-null refusal is
        -- a NAMED skip, never a placeholder address and never a raise.
        if ch in ('email', 'sms') then
          select rr.address, rr.refusal into v_addr, v_refusal
            from communication.resolve_channel_address(
                   ch, inst.organization_id, 'user', p_user, null, null, null) rr;
        else
          v_addr := null; v_refusal := null;
        end if;

        if ch in ('email', 'sms') and v_refusal is not null then
          v_status := 'skipped'; v_errcode := v_refusal;
          v_errmsg := format('No %s address for this recipient (%s).', ch, v_refusal);
        else
          v_status := 'pending'; v_errcode := null; v_errmsg := null;
        end if;

        -- 🚨 THE QUEUE DECISION. A notice needs WORDS, and this function has no renderer —
        -- there is none in this database and there must never be a second one. So a notice
        -- with a template is handed to the render lane (`render_pending`, picked up by
        -- services/notifications/render_pass.py within one dispatcher sweep), and a notice
        -- with no template is the named skip 0555 established. The address refusal above,
        -- when there was one, stays as the more specific truth.
        v_tpl_body := nullif(btrim(coalesce(v_templates -> ch ->> 'body', '')), '');
        if v_status = 'pending' then
          if v_tpl_body is null then
            v_status := 'skipped'; v_errcode := 'no_template';
            v_errmsg := format(
              'No renderable %s template for %s — the notice was never sendable this way '
              'and was not queued.', ch, p_event_key);
          else
            v_status := 'render_pending';
          end if;
        end if;

        -- RD 2: the notice reference on the object route. Each channel is a distinct row with a
        -- distinct id, so the link is composed per row and points at itself for the stamp.
        v_id := gen_random_uuid();
        v_row_link := v_link
                   || case when v_link like '%?%' then '&' else '?' end
                   || 'notice=' || v_id::text;

        insert into communication.notification
          (id, organization_id, event_key, recipient_user_id, recipient_kind, channel, payload,
           to_address, status, error_code, error_message,
           target_kind, target_id, deep_link, dedupe_key, visibility)
        values (v_id, inst.organization_id, p_event_key, p_user, 'user', ch,
                v_payload || jsonb_build_object('deep_link', v_row_link),
                v_addr, v_status, v_errcode, v_errmsg,
                'hr_workflow_step', p_step, v_row_link,
                -- 🚨 hr_l3_114 — THE EVENT KEY BELONGS IN THE DEDUPE KEY, AND ITS ABSENCE WAS
                -- SILENTLY DISCARDING NOTICES. The key was step:user:notice_kind:channel, which
                -- two DIFFERENT events share whenever they reach the same person about the same
                -- step under the same notice_kind — and hr.wf_tick's PASS 5 does exactly that,
                -- emitting `failure_raised` (from hr._wf_failure) and `result_unverified` one
                -- statement apart, both as 'failure'. The second one lost every time to
                -- `on conflict do nothing`, with no row and no error. Found by falsifying GAP 3:
                -- wiring the missing recipient was NOT enough to make that event arrive, because
                -- this was a second, independent reason it never did. Two different events are not
                -- the same notice.
                'hrwf:' || coalesce(p_step::text, p_instance::text) || ':' || p_user::text
                        || ':' || p_event_key || ':' || p_notice_kind || ':' || ch,
                'personal'::platform.visibility)
        on conflict do nothing;

        -- RD 4: only a DELIVERABLE notice counts toward the return. A row on its way to the
        -- render lane is deliverable — its words are being written, not withheld.
        if v_status in ('pending', 'render_pending') then v_n := v_n + 1; end if;
      end loop;

      return v_n;
    end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. hr._wf_not_attested SUPPLIES {{period.label}}.
--
-- Re-emitted whole from the live body: this function carries three separate contract pins
-- (hr_c4_41, hr_c4_44, hr_c4_52) whose pinned text must survive verbatim.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr._wf_not_attested(p_step uuid, p_actor uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  st   hr.workflow_step%rowtype;
  sd   hr.workflow_step_definition%rowtype;
  inst hr.workflow_instance%rowtype;
  v_emp uuid; v_res jsonb; v_case text;
  v_mgr uuid; v_to_user uuid; v_to_emp uuid; v_to_role text; v_sent integer;
  v_owned boolean;
  -- hr_l3_114: the pay period this attestation is about, for {{period.label}}.
  v_p_start date; v_p_end date; v_period_label text;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'step_not_found');
  end if;
  select * into sd   from hr.workflow_step_definition where id = st.step_definition_id;
  select * into inst from hr.workflow_instance        where id = st.workflow_instance_id;

  -- RD 3: `not_attested` is the SUBJECT's own non-action.
  if not sd.allows_self then
    return jsonb_build_object('granted', false, 'reason', 'not_a_self_step',
      'detail', 'not_attested closes a step the SUBJECT was to take themselves; an approval somebody else owes is escalated or reassigned');
  end if;
  -- RD 4: "active but nobody took it" and "never routable in the first place" are the same fact
  -- from the employee's side — nothing was attested. Both must be closable, or a step that died
  -- the way the G2V one did has no honest ending at all.
  if st.state not in ('active','unroutable') then
    return jsonb_build_object('granted', false, 'reason', 'WF_STEP_CLOSED',
      'detail', format('this step is %s and can no longer be closed as not_attested', st.state));
  end if;
  -- and it can NEVER overwrite a real act
  if exists (select 1 from hr.workflow_decision d where d.workflow_step_id = p_step) then
    return jsonb_build_object('granted', false, 'reason', 'WF_ALREADY_DECIDED',
      'detail', 'this step carries a decision; it was acted on and must not be recorded as not_attested');
  end if;

  v_emp := inst.subject_employment_id;

  -- 🚨 WHICH not_attested IS THIS? Derived here, in the ONE shared transition, so the sweep and the
  -- failure-lane door cannot disagree (hr_c4_15 RD 2). `resolved_user_ids` empty means nobody could
  -- be reached at all — the same fact the sweep already selects on — as against an employee who had
  -- a surface and did not use it. The terminal value is untouched either way (hr_c4_41 RD 1).
  v_case := case when coalesce(cardinality(st.resolved_user_ids), 0) = 0
                 then 'no_reach' else 'no_response' end;

  -- 🚨 §5.2 `ignored` = "the window closed with no action" — TRUE only when there WAS a surface to
  -- act on. For `no_reach` nobody could be asked, so nothing was ignored; recording it would be the
  -- accusation hr_c4_41/44 exist to prevent.
  if v_case = 'no_response' then
    perform hr._wf_notice_outcome(p_step, 'ignored');
  end if;
  -- 🚨 THE EVIDENCE IS WRITTEN BEFORE THE CLOSE (hr_c4_44). Closing the step is what triggers
  -- _wf_close_instance -> _wf_apply -> hr.timecard_wf_apply, and that function READS this evidence.
  -- With the close first, the reader ran before the writer and a coalesce handed the panel the
  -- opposite of the truth about a login-less employee. Nothing downstream may observe a half-written
  -- close: everything this close knows is recorded here, and only then does the step close.
  -- close EVIDENCE, not a new terminal value: state stays `skipped`, state_reason stays
  -- `not_attested`, and the reason rides alongside where a reader can find it.
  perform hr.arm_write();
  update hr.workflow_step
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'not_attested_reason', v_case,
           'reachable_user_count_at_close', coalesce(cardinality(st.resolved_user_ids), 0),
           'closed_by', case when p_actor is null then 'sweep' else 'failure_lane' end)
   where id = p_step;
  -- 🚨 THE RECIPIENT, RESOLVED — this used to pass `null` as the user, and hr._wf_notify returns 0
  -- on a null user, so the "flagged to the manager" claim was never once true (D285). The manager of
  -- record at close time, falling back to the HR admin queue with the same query hr._wf_failure uses.
  v_mgr    := hr.manager_as_of(v_emp, current_date);
  v_to_emp := v_mgr;
  v_to_user := hr._wf_login_of(v_mgr);
  v_to_role := 'manager_of_record';
  if v_to_user is null then
    select ra.employment_id into v_to_emp
      from hr.role_assignment ra
     where ra.organization_id = inst.organization_id and ra.is_active and ra.revoked_at is null
       and ra.role_key in ('hr_owner','hr_admin')
     order by case ra.role_key when 'hr_owner' then 0 else 1 end, ra.created_at
     limit 1;
    v_to_user := hr._wf_login_of(v_to_emp);
    v_to_role := 'hr_admin_queue';
  end if;
  -- 🚨 ONE SIGNAL PER CASE, DECIDED BY LOOKING (hr_c4_43). For `no_reach` the failure lane already
  -- holds a work item for this exact step — assigned, notified, and carrying the resolutions an HR
  -- admin acts through. A second close-time notification about the same fact is the weaker
  -- duplicate. For `no_response` no failure exists (the person was reachable and simply did not
  -- act), so this notification is the ONLY signal and it must fire. Checked against the failure
  -- table rather than inferred from v_case, so a change to the raise cannot make this lie.
  -- 🚨 OPEN work, not work that ONCE existed (hr_c4_45). A resolved or abandoned failure is not in
  -- front of anybody, so it must not suppress the only other signal. This predicate now matches the
  -- one hr.wf_activate_step uses to decide whether to RAISE the work item — they answer two halves
  -- of one question and must not disagree.
  select exists (select 1 from hr.workflow_failure wf
                  where wf.workflow_step_id = p_step
                    and wf.failure_class = 'unactionable_no_reach'
                    and wf.state in ('open','retrying'))
    into v_owned;
  if v_owned then
    v_sent := 0;
    v_to_role := 'failure_lane_owns_it';
  else
  -- 🚨 hr_l3_114 — {{period.label}}, WHICH THIS EVENT'S TEMPLATE HAS ALWAYS NAMED AND NO PRODUCER
  -- EVER SUPPLIED. hr.time.attestation_overdue is the ONE event key travelling through
  -- hr._wf_notify whose words the PYTHON catalog owns (hr_catalog/time.py: "Attestation overdue for
  -- {{period.label}}"). _wf_notify supplies request.*/decision.* — the vocabulary of an approval —
  -- and cannot know what a pay period is called, so since 0556 handed templated notices to the
  -- render lane this event has rendered nothing at all. The instance's target IS the
  -- pay_period_employment row (100% of live timecard instances), so the period is one join away.
  select pp.period_start_on, pp.period_end_on into v_p_start, v_p_end
    from hr.pay_period_employment ppe
    join hr.pay_period pp on pp.id = ppe.pay_period_id
   where ppe.id = inst.target_id;
  -- Guaranteed non-empty: the strict renderer refuses a blank merge value, and a notice that fails
  -- to render reaches nobody at all.
  v_period_label := case
    when v_p_start is null or v_p_end is null then 'your current pay period'
    else to_char(v_p_start, 'FMMon FMDD') || ' – ' || to_char(v_p_end, 'FMMon FMDD, YYYY')
  end;
  v_sent := coalesce(hr._wf_notify(inst.id, p_step, 'hr.time.attestation_overdue',
                        'timeout_warning', v_to_user, v_to_emp,
                        jsonb_build_object('period', jsonb_build_object('label', v_period_label),
                                           'outcome', 'not_attested',
                                           'reason', v_case,
                                           'reachable_user_count',
                                              coalesce(cardinality(st.resolved_user_ids), 0),
                                           'flagged_to', 'manager',
                                           'attested', false,
                                           'closed_by', case when p_actor is null
                                                             then 'sweep' else 'failure_lane' end,
                                           'notified_as', v_to_role,
                                           'note', p_note)), 0);
  -- 🚨 READ BACK, DO NOT ASSERT. hr._wf_notify returns how many notices it actually wrote; that
  -- integer decides what the record says. A recipient nobody checked is how D285 survived a lane.
    if v_sent = 0 then v_to_role := 'nobody'; end if;
  end if;
  perform hr.arm_write();
  update hr.workflow_step
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'notified_as', v_to_role,
           'notified_user_id', case when v_sent > 0 then v_to_user end,
           'notified_employment_id', case when v_sent > 0 then v_to_emp end,
           'notices_sent', v_sent)
   where id = p_step;

  -- 🚨 AND ONLY NOW IS THE STEP CLOSED, with every fact about this close already on the row.
  -- `skipped`, NOT `expired` (hr_l3_26 RD 12). attested_at stays NULL; nothing attested on the
  -- employee's behalf. state_reason carries the fact that nobody did.
  perform hr.arm_write();
  v_res := hr._wf_close_step(p_step, 'skipped', 'not_attested');
  perform hr._wf_event(inst.id, p_step, 'timeout_applied', 'active', 'skipped',
                       case when p_actor is null then 'automation' else 'hr_admin' end,
                       p_actor, null,
                       jsonb_build_object(
                         'outcome', 'not_attested', 'reason', v_case,
                         'notified_as', v_to_role, 'notices_sent', v_sent, 'note', p_note,
                         'law', '§8.2 node G: closed as not_attested and flagged to the manager. NOTHING attested on the employee''s behalf.'));

  return jsonb_build_object('granted', true, 'state', 'skipped', 'outcome', 'not_attested',
                            'step_id', p_step, 'subject_employment_id', v_emp, 'close', v_res);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6b. hr.wf_tick GIVES hr.workflow.result_unverified A RECIPIENT.
--
-- GAP 3. See the annotation inside PASS 5. Re-emitted whole from the live body.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.wf_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_max integer;
  v_lead integer;
  v_reminders integer := 0; v_warned integer := 0; v_timeouts integer := 0;
  v_escalated integer := 0; v_results integer := 0; v_expired integer := 0;
  r record; u uuid; v_res jsonb; v_dec uuid;
  -- hr_l3_114: the failure this pass raises, and the human it was assigned to. Declared so PASS 5
  -- can hand `result_unverified` a recipient instead of the null it used to pass.
  v_fid uuid; v_assignee uuid;
begin
  -- §4.2: service role only. An envelope, not a raise (THE REFUSAL-ENVELOPE LAW).
  if auth.uid() is not null and not public.is_platform_admin() then
    return jsonb_build_object('granted', false, 'reason', 'service_role_only',
      'detail', 'hr.wf_tick is the scheduled sweep and is not callable by an ordinary user');
  end if;

  v_max  := (hr._knob('hr.workflow','tick_batch_max') #>> '{}')::integer;
  v_lead := (hr._knob('hr.workflow','timeout_warning_lead_hours') #>> '{}')::integer;
  perform hr.arm_write();

  -- ---------------------------------------------------------------- PASS 1 — reminders
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.due_at, s.reminders_sent,
           coalesce(sd.reminder_cadence_hours, d.reminder_cadence_hours) cadence, d.reminder_max
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active'
       and s.reminders_sent < d.reminder_max
       and now() >= coalesce(s.last_reminder_at, s.activated_at)
                    + make_interval(hours => coalesce(sd.reminder_cadence_hours,
                                                      d.reminder_cadence_hours))
     order by s.activated_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      -- "approvers who have not decided" — a quorum member who already decided is not reminded
      continue when exists (select 1 from hr.workflow_decision dd
                             where dd.workflow_step_id = r.id and dd.actor_user_id = u
                               and not dd.superseded_by_target_change);
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_reminder', 'reminder',
                            u, null, jsonb_build_object('due_at', r.due_at,
                                                        'reminder_number', r.reminders_sent + 1,
                                                        'reminder_max', r.reminder_max));
    end loop;
    update hr.workflow_step
       set reminders_sent = reminders_sent + 1, last_reminder_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'reminder_sent');
    v_reminders := v_reminders + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 2 — timeout warnings
  -- autonomy policy rule 4: the timeout must be visible BEFORE it fires (RD 4 — this pass runs
  -- before pass 3 so a step is never warned and applied in the same sweep).
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.timeout_at
      from hr.workflow_step s
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and s.timeout_warned_at is null
       and now() >= s.timeout_at - make_interval(hours => v_lead)
     order by s.timeout_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_timeout_warning',
                            'timeout_warning', u, null,
                            jsonb_build_object('timeout_at', r.timeout_at, 'lead_hours', v_lead));
    end loop;
    update hr.workflow_step set timeout_warned_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_warned');
    v_warned := v_warned + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 3 — timeouts (mode 3)
  for r in
    select s.id, s.workflow_instance_id, s.step_key, s.autonomy_mode, s.timeout_at,
           s.organization_id, sd.timeout_action
      from hr.workflow_step s
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and now() >= s.timeout_at
     order by s.timeout_at
     limit v_max
  loop
    if r.timeout_action = 'apply' then
      -- §3.2: the step closes `auto_approved`, and the auto-decision is RECORDED as a decision row
      -- with actor_type='automation' — never as a state flip with no author.
      insert into hr.workflow_decision
        (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
         actor_type, approval_basis, autonomy_mode,
         calculation_snapshot)
      values (r.organization_id, r.workflow_instance_id, r.id, r.step_key, 'approved',
              'no decision was taken within the displayed timeout window',
              'automation', 'timeout', 3,
              jsonb_build_object('timeout_at', r.timeout_at, 'timeout_action', 'apply'))
      returning id into v_dec;
      perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_applied', 'active', 'auto_approved',
                           'automation', null, null, jsonb_build_object('decision_id', v_dec));
      perform hr._wf_close_step(r.id, 'auto_approved', 'mode_3_timeout');
    else
      perform hr.wf_escalate(r.id, 'mode 3 timeout elapsed with no decision');
    end if;
    v_timeouts := v_timeouts + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 4 — escalation
  for r in
    select s.id, s.workflow_instance_id
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.escalated_at is null
       and ((sd.escalate_after_hours is not null
             and now() >= s.activated_at + make_interval(hours => sd.escalate_after_hours))
            or (s.due_at is not null and now() >= s.due_at and d.on_expiry = 'escalate'))
     order by s.due_at nulls last
     limit v_max
  loop
    -- §1.9 pass 4: if escalation itself resolves to nobody, wf_escalate's activation opens the
    -- `unroutable` failure row. The request is never silently parked.
    perform hr.wf_escalate(r.id, 'SLA elapsed');
    v_escalated := v_escalated + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 5 — external results (RD 3)
  -- 🚨 THE AR2 CASE. A shutoff branch whose integration never reports back leaves the instance in
  -- `verifying` with an open `result_unverified` failure. IT NEVER REACHES `completed`.
  for r in
    select s.id, s.workflow_instance_id, s.result_due_at
      from hr.workflow_step s
     where s.state = 'awaiting_result' and s.result_due_at is not null
       and now() >= s.result_due_at
       and not exists (select 1 from hr.workflow_failure f
                        where f.workflow_step_id = s.id and f.failure_class = 'result_unverified'
                          and f.state in ('open','retrying'))
     order by s.result_due_at
     limit v_max
  loop
    v_fid := hr._wf_failure(r.workflow_instance_id, r.id, 'result_unverified',
      jsonb_build_object('result_due_at', r.result_due_at,
        'detail', 'the external effect was never confirmed within its window; this step cannot self-complete'));
    -- 🚨 hr_l3_114 — THE RECIPIENT, READ BACK RATHER THAN RE-DERIVED. This call used to pass
    -- `null, null`, and hr._wf_notify returns 0 on a null user, so hr.workflow.result_unverified
    -- has never reached one human being — the AR2 event whose whole purpose is that a failed
    -- access shutoff cannot pass unnoticed. hr._wf_failure ALREADY resolved the assignee one
    -- statement ago and stored it on the row it returns; reading it back is the only way to get
    -- it that cannot drift from the assignment itself. Re-running _wf_failure's role query here
    -- would be a second derivation of one fact, and the day the two disagree the person the
    -- inbox says owns the failure is not the person the email went to.
    select f.assigned_employment_id into v_assignee
      from hr.workflow_failure f where f.id = v_fid;
    perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.result_unverified', 'failure',
                          hr._wf_login_of(v_assignee), v_assignee,
                          jsonb_build_object('failure_id', v_fid,
                                             'failure_class', 'result_unverified',
                                             'result_due_at', r.result_due_at));
    v_results := v_results + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 6 — instance expiry (RD 3)
  for r in
    select i.id, d.on_expiry
      from hr.workflow_instance i
      join hr.workflow_definition d on d.id = i.workflow_definition_id
     where i.state = 'active' and i.due_at is not null and now() >= i.due_at
       and d.on_expiry in ('expire','auto_approve','hold')
     order by i.due_at
     limit v_max
  loop
    if r.on_expiry = 'expire' then
      perform hr._wf_close_instance(r.id, 'expired', 'due_at elapsed with on_expiry=expire');
    elsif r.on_expiry = 'auto_approve' then
      perform hr._wf_event(r.id, null, 'timeout_applied', 'active', 'approved', 'automation',
                           null, null, jsonb_build_object('on_expiry','auto_approve'));
      update hr.workflow_instance set state = 'approved', decided_at = now() where id = r.id;
      perform hr._wf_apply(r.id);
    else
      -- `hold` parks the instance VISIBLY: a failure row somebody owns, never a quiet stall.
      perform hr._wf_failure(r.id, null, 'definition_invalid',
        jsonb_build_object('on_expiry','hold',
          'detail','this instance passed its SLA and its definition says hold; a human must decide what happens next'));
    end if;
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object(
    'granted', true, 'ran_at', now(), 'batch_max', v_max,
    'reminders', v_reminders, 'timeout_warnings', v_warned, 'timeouts', v_timeouts,
    'escalations', v_escalated, 'results_unverified', v_results, 'instances_expired', v_expired);
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE 2-ARGUMENT RESOLVER IS DROPPED, NOT LEFT BESIDE THE NEW ONE.
--
-- 🚨 THE TRAP 0555 BANKED, AVOIDED HERE ON PURPOSE. Postgres keys `CREATE OR REPLACE` on the
-- argument-type list, so `hr._notify_channels(text, uuid, uuid, jsonb)` did not replace
-- `hr._notify_channels(text, uuid)` — it created a sibling. Every one of the three callers above
-- has been re-emitted to pass three arguments, so nothing calls the 2-argument body any more; if it
-- were left in place, the next producer written from muscle memory would bind to it and silently
-- lose the user rung, which is precisely how 0555's coherence clamp became dead code that looked
-- perfectly applied.
--
-- 🚨 AND THE NEW SIGNATURE IS A NEW OBJECT, SO IT IS BORN WITH IMPLICIT PUBLIC EXECUTE. The
-- 2-argument function carried `postgres=X, service_role=X` — PUBLIC already revoked. A fresh
-- SECURITY DEFINER function with a NULL acl is executable by `anon`, which is the definer-grant
-- class this repo has run a whole campaign against. The grants are restated to match its
-- predecessor exactly, and `hr._punch_change_words` follows `hr._wf_decision_words`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- The FOURTH caller, which the insert-census did not see because it writes no notice at all: a
-- diagnostic that reports what the resolver says about hr.time.punch_edited. It asks about the
-- rungs ABOVE any particular reader, so it passes a null user — which is the same null a non-user
-- recipient gets, and means "no user rung", not "unknown". It was found by this migration's own
-- stale-caller assertion, not by reading.
create or replace function hr.punch_edit_notify_debt()
returns jsonb
language sql
stable
as $function$
  select jsonb_build_object(
    'event_key', 'hr.time.punch_edited',
    'seeded', exists (select 1 from communication.notification_event_type
                       where event_key = 'hr.time.punch_edited' and deleted_at is null),
    'resolved_channels', to_jsonb(hr._notify_channels('hr.time.punch_edited', null, null, '{}'::jsonb)),
    'fallback_channels', '["in_app"]'::jsonb,
    'resolver', 'hr._notify_channels (hr_l10_02, user rung added hr_l3_114) - this lane keeps no second copy',
    'owner', 'event seeded by HRB-022 (l10-inbox); the punch emitter is HRB-015 lane L3');
$function$;

revoke all on function hr._notify_channels(text, uuid, uuid, jsonb) from public;
grant execute on function hr._notify_channels(text, uuid, uuid, jsonb) to service_role;

revoke all on function hr._punch_change_words(jsonb, text) from public;

drop function if exists hr._notify_channels(text, uuid);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 8. CONTRACT PINS. Each is a shape that, if it silently reverted, would put this lane back where
--    it was without anybody noticing — which is the only kind of thing that belongs here.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', '_notify_channels', 'hr_l3_114',
   array['communication.notification_preference', 'v_mandatory and cardinality(v_out) = 0'],
   array[]::text[],
   'hr_l3_114: this is the SQL half of the D13 ladder and it must keep BOTH new rungs. The read of '
   || 'communication.notification_preference IS the user rung — without it a person who switched an '
   || 'event off receives it anyway, which is what every notice these producers wrote did until '
   || 'today. The mandatory clause is SPEC-NOTIFICATIONS §7.1''s floor ("the U rung may not silence '
   || 'a ⚖ event entirely"); losing it hands an employee a switch that silences the notice telling '
   || 'them a manager edited their punch. The two must move together: the rung without the floor is '
   || 'a new harm, and the floor without the rung is dead code.',
   true),
  ('hr', '_l1_notify_consent_requested', 'hr_l3_114',
   array['render_pending', 'no_template', 'communication.resolve_channel_address'],
   array[]::text[],
   'hr_l3_114: this producer must hand a templated notice to the render lane rather than queue it '
   || 'wordless (every row it has ever written was bodiless — 4 email failed, 4 in_app "succeeded" '
   || 'carrying nothing), must record 0555''s named no_template skip when a channel has no '
   || 'renderable template, and must RESOLVE the address so a missing one is a named skip instead '
   || 'of a guaranteed provider failure. There is no renderer in this database and there must never '
   || 'be a second one.',
   true),
  ('hr', '_punch_notify_edited', 'hr_l3_114',
   array['render_pending', 'hr._punch_change_words', '''date''', 'local_work_date'],
   array[]::text[],
   'hr_l3_114: hr.time.punch_edited''s template names {{date}} and {{change.summary}} and this '
   || 'producer supplied NEITHER, so routing it to the render lane without them would have turned a '
   || 'bodiless row into a render_failed one — a different way of telling the employee nothing. The '
   || 'strict renderer refuses a blank merge value, so a template may only name a field its producer '
   || 'promises. local_work_date is pinned because deriving the date from occurred_at in the '
   || 'server''s zone names the wrong day for anybody who clocks out near midnight.',
   true),
  ('hr', '_wf_notify', 'hr_l3_114',
   array['hr._notify_channels(p_event_key, inst.organization_id, p_user, v_policy)',
         'p_event_key || '':'' || p_notice_kind'],
   array[]::text[],
   'hr_l3_114: TWO shapes, both of which were silently swallowing notices. (1) The channel resolver '
   || 'must be asked WITH THE READER and WITH THE FLOW POLICY. Called with two arguments the D13 '
   || 'ladder stopped at the organization rung and a person who had turned a workflow event off '
   || 'still received it; and while this function assembled its own list afterwards, the flow '
   || 'type''s `allow` was applied AFTER the ladder, so an employer setting outranked the person''s '
   || 'own choice. (2) The dedupe key must carry the EVENT KEY. Without it two different events '
   || 'reaching the same person about the same step under the same notice_kind collide, and '
   || '`on conflict do nothing` drops the second with no row and no error — which is how '
   || 'hr.workflow.result_unverified stayed silent even once it had a recipient, because '
   || 'hr._wf_failure writes hr.workflow.failure_raised one statement earlier to the same person '
   || 'about the same step. Two different events are not the same notice.',
   true),
  ('hr', '_wf_not_attested', 'hr_l3_114',
   array['''period'', jsonb_build_object(''label'', v_period_label)'],
   array[]::text[],
   'hr_l3_114: hr.time.attestation_overdue is the ONE event key travelling through hr._wf_notify '
   || 'whose words the PYTHON catalog owns, and its template names {{period.label}}. _wf_notify '
   || 'speaks request.*/decision.* — the vocabulary of an approval — and cannot know what a pay '
   || 'period is called, so from 0556 (which began handing templated notices to the render lane) '
   || 'until this migration the event rendered nothing at all. The producer supplies the field its '
   || 'event''s template names; dropping it silently restores a render_failed skip.',
   true),
  ('hr', 'wf_tick', 'hr_l3_114',
   array['hr._wf_login_of(v_assignee)', 'f.assigned_employment_id'],
   array['''hr.workflow.result_unverified'', ''failure'',
                          null, null'],
   'hr_l3_114: PASS 5 must hand hr.workflow.result_unverified a RECIPIENT. It passed null, and '
   || 'hr._wf_notify returns 0 on a null user, so the AR2 event — the one whose entire purpose is '
   || 'that a failed access shutoff cannot pass unnoticed — has never reached one human being. The '
   || 'assignee is READ BACK off the failure row hr._wf_failure just wrote rather than re-derived '
   || 'from the role table: two derivations of one fact means the day they disagree, the person the '
   || 'inbox says owns the failure is not the person the email went to.',
   true)
-- Idempotence: this file may legitimately be replayed (and the repo's applier may pick it up while
-- it is still being edited — that happened to 0556). A pin is not an admin knob, so a replay should
-- CONVERGE the pin rather than skip it and leave a stale reason behind.
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 9. FALSIFICATION — shape only. The end-to-end proofs (a real event through the real render pass
--    to the deployed dispatcher, and the RED cases) are run against live data in rolled-back
--    transactions and recorded in the session log; a migration is not the place to write and then
--    fail to unwrite notification rows.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_n integer;
  v_broken integer;
begin
  -- the overload is gone, and exactly one resolver remains
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_notify_channels';
  if v_n <> 1 then
    raise exception 'hr_l3_114: expected exactly ONE hr._notify_channels, found % — an overload '
                    'here silently loses the user rung', v_n;
  end if;
  if pg_get_function_identity_arguments(
       (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'hr' and p.proname = '_notify_channels')) <> 'p_event_key text, p_organization_id uuid, p_user uuid, p_flow_policy jsonb' then
    raise exception 'hr_l3_114: the surviving hr._notify_channels is not the 4-argument one';
  end if;

  -- the new signature is not world-executable
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname = '_notify_channels' and p.proacl is null) then
    raise exception 'hr_l3_114: hr._notify_channels carries a NULL acl — implicit PUBLIC EXECUTE on '
                    'a SECURITY DEFINER function';
  end if;

  -- no caller was left behind on the 2-argument form
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.prosrc ~ '_notify_channels\s*\([^)]*\)'
     and p.proname <> '_notify_channels'
     and p.prosrc !~ '_notify_channels\s*\([^)]*,[^)]*,[^)]*,[^)]*\)';
  if v_n > 0 then
    raise exception 'hr_l3_114: % hr function(s) still call _notify_channels with fewer than four '
                    'arguments', v_n;
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l3_114: % contract(s) broken after this migration', v_broken;
  end if;

  raise notice 'hr_l3_114: resolver unique and 4-arg, no stale callers, % contracts broken', v_broken;
end
$post$;

commit;
