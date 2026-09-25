-- additive: no
--
-- chair-step: THE INVERSE of migrations/campaign/links2_an_hr_link_names_its_employer.sql. It
--   restores the four function bodies that file replaced, exactly as they were, and DROPS
--   `hr.link_names_its_employer`. It touches no table and no row of anybody's data.
--
-- based-on: hr._wf_notify(uuid, uuid, text, text, uuid, uuid, jsonb) 883922fd208fd3a530912596f895fa589e05d2360128b4723a4c19cbaafe7820
-- based-on: hr._l1_notify_consent_requested(uuid) 1a6fb53c493dd447efdb2324e57330d0e69ac9ebe04fa5e0c473f1ba12674365
-- based-on: hr._punch_notify_edited(uuid, uuid, uuid, uuid, text, uuid, jsonb) aaf06d0ca547fe11aa178e443e569939039abb2423ac4176fd4db2465fdae3a6
-- based-on: hr.hr_links_without_employer() 38dd62a65bcbaf2b0f1ecfdde1fcbbe695a7c236121abcc41442623e37387ea8
--
-- WHAT IS DELIBERATELY NOT UNDONE, AND WHY
--
-- 1. THE THREE `platform.client_callable_door` ROWS STAY. They declare what has been true of
--    `hr._wf_notify`, `hr._l1_notify_consent_requested` and `hr._punch_notify_edited` since
--    long before this lane: server-only, no client grant, no caller checked. Deleting them
--    would recreate an undeclared-definer debt that the up-file merely paid, and would leave
--    `provision_shape_guard` blind to three live definers. An honest declaration is not this
--    lane's to take away.
--
-- 2. THE EMPLOYER STAMPED ON ANY NOTICE ROW STAYS. The up-file's one data statement adds a
--    missing `org=` to an `/hr` notice link. It matched 0 rows on both databases, and even if
--    it had matched, an employer-free HR link is a defect — putting one back is not a rollback,
--    it is a regression. Nothing here rewrites a notice.

set local statement_timeout = '600s';
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION hr._wf_notify(p_instance uuid, p_step uuid, p_event_key text, p_notice_kind text, p_user uuid, p_employment uuid, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
    declare
      inst hr.workflow_instance%rowtype; ft hr.workflow_flow_type%rowtype;
      v_channels text[]; v_policy jsonb; ch text; v_n integer := 0;
  v_ins integer := 0;   -- hr_l3_117: ROW_COUNT of the insert just made
   v_link text; v_payload jsonb;
      v_send text[]; v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
      v_id uuid; v_row_link text; v_templates jsonb; v_tpl_body text;
      v_label text; v_subject text; v_outcome text; v_outcome_short text; v_reason text;
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
      -- 0560: the SMS word. NOT derived from v_outcome — two readings of one token, never
      -- a re-parse of the other channel's prose.
      v_outcome_short := hr._wf_decision_words_short(p_extra ->> 'outcome');
      v_reason  := coalesce(nullif(btrim(p_extra ->> 'reason'), ''), 'No reason was given.');

      v_payload := coalesce(p_extra,'{}'::jsonb) || jsonb_build_object(
        'instance_id', p_instance, 'step_id', p_step, 'flow_key', inst.flow_key,
        'target_token', inst.target_token, 'target_id', inst.target_id,
        'notice_kind', p_notice_kind,
        'employment_id', p_employment, 'sensitivity_tier', inst.sensitivity_tier,
        'request', jsonb_build_object(
          'label', v_label, 'subject', v_subject, 'reference', left(p_instance::text, 8)),
        'decision', jsonb_build_object(
          'outcome', v_outcome, 'outcome_short', v_outcome_short, 'reason', v_reason));

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
        -- 🚨 hr_l3_117 — INSERTS, NOT LOOP TURNS. `on conflict do nothing` writes nothing and
        -- raises nothing, so this counter went up for a notice that was never written.
        -- hr._wf_not_attested publishes `notified_user_id` off this number.
        get diagnostics v_ins = row_count;
        if v_status in ('pending', 'render_pending') then
          if v_ins > 0 then
            v_n := v_n + 1;
          else
            -- A NAMED skip. There is no row to record it on — the insert was suppressed —
            -- so it is raised where it can be seen, never counted as a send.
            raise warning 'hr_l3_117: a % notice was suppressed as a duplicate and NOT counted as sent', ch;
          end if;
        end if;
      end loop;

      return v_n;
    end
$function$

;

CREATE OR REPLACE FUNCTION hr._l1_notify_consent_requested(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_org uuid; v_employment uuid; v_requester text; v_uid uuid;
  v_ch text; v_n integer := 0;
  v_ins integer := 0;   -- hr_l3_117: ROW_COUNT of the insert just made
  
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
    -- 🚨 hr_l3_117 — INSERTS, NOT LOOP TURNS. `on conflict do nothing` writes nothing and
        -- raises nothing, so this counter went up for a notice that was never written.
        -- hr._wf_not_attested publishes `notified_user_id` off this number.
        get diagnostics v_ins = row_count;
        if v_status in ('pending', 'render_pending') then
          if v_ins > 0 then
            v_n := v_n + 1;
          else
            -- A NAMED skip. There is no row to record it on — the insert was suppressed —
            -- so it is raised where it can be seen, never counted as a send.
            raise warning 'hr_l3_117: a % notice was suppressed as a duplicate and NOT counted as sent', v_ch;
          end if;
        end if;
  end loop;
  return v_n;
end
$function$

;

CREATE OR REPLACE FUNCTION hr._punch_notify_edited(p_organization_id uuid, p_employment_id uuid, p_voided_punch_id uuid, p_replacement_punch_id uuid, p_reason text, p_actor_user uuid, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_user uuid; v_channels text[]; v_basis text; ch text;
  v_n integer := 0; v_dup integer := 0; v_skipped integer := 0; v_ins integer;
  v_written text[] := '{}';
  v_payload jsonb; v_link text;
  v_templates jsonb; v_tpl_body text;
  v_addr text; v_refusal text; v_status text; v_errcode text; v_errmsg text;
  v_work_date date; v_tz text; v_summary text; v_summary_short text;
  v_actor text; v_reason text;
begin
  select e.login_user_id into v_user
    from hr.employment em join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id;
  if v_user is null then
    -- nobody to reach; the punch row still records it. An honest envelope, not a bare 0.
    return jsonb_build_object('rows_written', 0, 'duplicates_suppressed', 0,
                              'skipped', 0, 'channels', '[]'::jsonb,
                              'reached_nobody_because', 'the employment has no linked login');
  end if;

  -- THE ONE RESOLVER (hr_l10_02), asked with the READER so the D13 user rung applies
  -- (hr_l3_114 §1, hr_l3_116 §3). ARRAY['in_app'] for an unregistered event, '{}' when every
  -- channel is explicitly off.
  v_channels := hr._notify_channels('hr.time.punch_edited', p_organization_id, v_user, '{}'::jsonb);
  if v_channels is null or cardinality(v_channels) = 0 then
    v_channels := array['in_app']; v_basis := 'law_overrides_empty_channel_set';   -- RD 4
  else
    v_basis := 'notify_channels_resolver';
  end if;

  -- ── THE FACTS THE SENTENCE NEEDS, from the punch itself.
  select p.local_work_date, p.tz into v_work_date, v_tz
    from hr.punch p where p.id = p_voided_punch_id;
  v_summary       := hr._punch_change_words(p_change, v_tz);
  v_summary_short := hr._punch_change_words_short(p_change, v_tz);

  -- 🚨 WHO AND WHY — SPEC-TIME §4.1's other two clauses (hr_l3_117 §0(A)).
  -- Every merge value the strict renderer will meet is guaranteed non-empty here, because a
  -- template that fails to render reaches nobody at all and this is a ⚖ notice.
  -- The name is resolved AS THE EMPLOYEE READS IT (v_user, not the actor), so a directory
  -- opt-out is honoured; 'a manager' is the truthful generic, and matches the actor_type both
  -- calling doors stamp on the punch row itself.
  v_actor  := coalesce(nullif(btrim(hr._actor_display_name(p_actor_user, p_organization_id, v_user)), ''),
                       'a manager');
  -- Both doors refuse a reason under two characters, so this coalesce is a belt on a worn belt —
  -- but hr._wf_notify's `v_reason` uses exactly this sentence and one wording beats two.
  v_reason := coalesce(nullif(btrim(p_reason), ''), 'No reason was given.');

  v_link := '/hr/me/timesheet?org=' || p_organization_id::text || '&punch=' || coalesce(p_replacement_punch_id, p_voided_punch_id)::text;
  v_payload := jsonb_build_object(
    'voided_punch_id', p_voided_punch_id,
    'replacement_punch_id', p_replacement_punch_id,
    'reason', p_reason,
    'changed_by_user_id', p_actor_user,
    -- the three merge values a sentence needs, under the names the templates use
    'actor', jsonb_build_object('name', v_actor),
    'change', coalesce(p_change, '{}'::jsonb)
              || jsonb_build_object('summary', v_summary,
                                    'summary_short', v_summary_short,
                                    'reason', v_reason),
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

    -- 🚨 hr_l3_117 — THE COUNTER COUNTS INSERTS. `on conflict do nothing` writes nothing and
    -- raises nothing, so the old `v_n := v_n + 1` here counted LOOP TURNS: T-9 measured
    -- rows_written = 2 against zero rows, and a manager was shown the sentence that says the
    -- employee was told. ROW_COUNT is read immediately after the INSERT; only comments separate
    -- them, and a comment is not a statement.
    get diagnostics v_ins = row_count;
    if v_status in ('pending', 'render_pending') then
      -- RD 4: only a DELIVERABLE notice counts. A row on its way to the render lane is
      -- deliverable — its words are being written, not withheld.
      if v_ins > 0 then
        v_n := v_n + 1;
        v_written := v_written || ch;
      else
        -- A NAMED SKIP, not silent success theatre (0555/0556's convention, which until now
        -- could only be recorded ON a row — and a suppressed insert has no row to record it on).
        -- This is the honest state: an identical notice for this punch and channel already
        -- exists, so the employee HAS been told; they are not being told twice.
        v_dup := v_dup + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'rows_written', v_n,
    'duplicates_suppressed', v_dup,
    'skipped', v_skipped,
    'channels', to_jsonb(v_written),
    'channel_basis', v_basis);
end
$function$

;

CREATE OR REPLACE FUNCTION hr.hr_links_without_employer()
 RETURNS TABLE(schema_name text, function_name text, line_no integer, line text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'hr', 'public'
AS $function$
  with scoped as (
    select n.nspname::text as schema_name, p.proname::text as function_name, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and ( n.nspname in ('hr', 'communication')
          or (n.nspname = 'public' and p.proname like 'hr\_%') )
       -- 🚨 THE GUARD MACHINERY ITSELF, and nothing else. These two functions DESCRIBE the banned
       -- shape (a match pattern, a diagnostic sentence) rather than navigate to it, so they carry
       -- it by construction and can never carry a real link — a diagnostic row is not an href.
       -- Exactly the exemption `no-hand-built-hr-urls.test.ts` grants `features/hr/routes.ts`:
       -- banning the literal in the one place that exists to talk about it bans the guard, and a
       -- guard that goes red on its own prose gets switched off the first time somebody reworders
       -- a sentence. Every other function in these schemas is in scope, with no allowlist.
       and not (n.nspname = 'hr'
                and p.proname in ('hr_links_without_employer', 'punch_write_path_conformance'))
  ), src as (
    -- RD 5: NAVIGATION POSITION IN SQL IS "the literal starts at the path". A link literal opens
    -- at the path; an HTTP-route mention names the verb first (POST /hr/...) and a prose comment
    -- opens no quote at all. Matching quote-then-path is what keeps this guard narrow enough to
    -- survive. The quote is chr(39) rather than an escaped literal so this pattern does not
    -- itself contain the shape it is looking for.
    select s.schema_name, s.function_name, u.ord::integer as line_no, u.t as line
      from scoped s, unnest(string_to_array(s.prosrc, E'\n')) with ordinality as u(t, ord)
     where u.t like '%' || chr(39) || '/hr%'
  )
  select schema_name, function_name, line_no, btrim(line)
    from src
   -- RD 6: same line, deliberately. And the escape hatch is a marker with an author, never a
   -- heuristic — the standard `no-hand-built-hr-urls.test.ts` set for the TypeScript half.
   where line !~ 'org=' and line !~ 'hr-url-exempt:'
   order by schema_name, function_name, line_no;
$function$

;


drop function if exists hr.link_names_its_employer(text, uuid);

do $assert$
declare v_n integer;
begin
  if to_regprocedure('hr.link_names_its_employer(text, uuid)') is not null then
    raise exception 'links2 inverse: hr.link_names_its_employer is still there';
  end if;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr'
     and p.proname in ('_wf_notify', '_l1_notify_consent_requested', '_punch_notify_edited')
     and p.prosrc ~ 'link_names_its_employer';
  if v_n <> 0 then
    raise exception 'links2 inverse: % producers still reference the builder', v_n;
  end if;
  select count(*) into v_n from hr.hr_links_without_employer();
  if v_n <> 0 then
    raise exception 'links2 inverse: the restored census returned % rows', v_n;
  end if;
  raise notice 'links2 inverse: the four bodies are back and the census is 0';
end
$assert$;
