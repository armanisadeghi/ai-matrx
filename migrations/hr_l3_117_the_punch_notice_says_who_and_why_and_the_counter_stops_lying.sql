-- hr_l3_117 — THE PUNCH-EDITED NOTICE NAMES WHO AND WHY, ITS LINK LANDS ON THE CORRECTED DAY,
--             AND THE COUNTER THAT SAID "2 NOTIFIED" COUNTS INSERTS INSTEAD OF LOOP TURNS.
--
-- Three defects, one lane, all three found by T-9's verification pass and all three re-measured
-- against db.matrxserver.com before a line was written.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 0. WHAT WAS ACTUALLY WRONG — MEASURED, NOT ASSUMED.
--
-- (A) THE TEMPLATES DROP THE ACTOR AND THE REASON. SPEC-TIME §4.1's flowchart is explicit, and it
--     is an Arman RULING of 2026-08-25, not a preference:
--
--       "Notification hr.time.punch_edited to the EMPLOYEE: what changed, who changed it, why.
--        A silently edited timecard is a wage claim."
--       "the employee is always notified of what changed and why"
--
--     The producer has carried both facts since hr_l3_03: `hr._punch_notify_edited` writes
--     `changed_by_user_id` and `reason` into every payload it has ever produced. The three live
--     templates interpolate `{{date}}`, `{{change.summary}}`, `{{link.*}}` and
--     `{{employer.short_name}}` — and NOTHING ELSE. So the facts were gathered, stored, and then
--     dropped at the one step the employee can see. One of three clauses shipped.
--
-- (B) 🚨 AND THE SMS LEG WAS ALREADY TWO SEGMENTS BEFORE THIS LANE TOUCHED IT.
--     Migration 0560 built the GSM-7 septet counter and measured the two workflow templates with
--     it. It never measured this one. Measured now, at the widest values that exist in this
--     database (employer abbreviation 3, `hr._punch_change_words`' longest sentence 60, a minted
--     short link 36, a formatted work date 12):
--
--       "AIM: Your punch on Sep 28, 2026 was changed: the break start at 12:38 PM became a break
--        start at 12:38 PM https://www.aimatrx.com/r/abcdefgh23 Reply STOP to opt out."
--         = 165 GSM-7 septets = TWO BILLED SEGMENTS, five over.
--
--     `hr._punch_change_words` is EMAIL prose — up to 60 characters — exactly the shape of 0558's
--     defect that 0560 fixed for `hr._wf_decision_words`. So this migration does what 0560 did:
--     the long map stays on the email and in-app bodies, and the SMS leg gets its OWN short word
--     from `hr._punch_change_words_short` (§2), capped and asserted on every apply.
--
--     WHAT THE SMS LEG KEEPS AND WHAT IT GIVES UP, stated rather than discovered later:
--     it keeps WHO (a bounded display name) and WHAT (the short word) and the link. It does NOT
--     carry WHY: `p_reason` is free text a manager types, it has no upper bound, and one segment
--     has none to give. The reason rides the deep link, and is carried VERBATIM on the email and
--     in-app bodies, which are the channels §7.1 guarantees a ⚖ notice can never be reduced below.
--
-- (C) THE DEEP LINK'S `?punch=` PARAMETER WAS IGNORED BY THE PAGE IT POINTS AT. The producer has
--     written `/hr/me/timesheet?org=…&punch=<id>` since hr_l3_111. `hr.my_timesheet_context` — the
--     one resolver route 5 asks "which period am I looking at" — took `p_employment_id` and
--     nothing else, so the employee landed on whatever period covers TODAY and was told nothing
--     about the correction they had just been texted about. §5 gives the resolver the punch.
--
--     The registry row's own `deep_link_template` said `&period={{period.id}}`, which is a THIRD
--     shape nobody emits. It is corrected to the link the producer actually writes (§7).
--
-- (D) 🚨 THE LYING COUNTER — the lie-on-screen class, and it is genuinely on a screen.
--     `hr._punch_notify_edited` ends each channel's turn with
--
--         if v_status in ('pending', 'render_pending') then v_n := v_n + 1; end if;
--
--     placed AFTER an `insert … on conflict do nothing`. `on conflict do nothing` does not raise
--     and does not decrement: when the dedupe key collides, ZERO rows are written and the counter
--     still goes up. `hr.punch_correct` returns that number as
--     `notifications.rows_written`, and
--     `matrx-frontend/features/hr/time/punches/fromLivePunches.ts:105` reads it as
--
--         employeeNotified: num(obj(notifications).rowsWritten) > 0
--
--     which `PunchCorrectionDialog.tsx:187` renders to the manager as the sentence saying the
--     employee was told. T-9 observed `rows_written: 2` against ZERO inserted rows. A door that
--     tells a manager it notified somebody it did not notify is worse than one that says nothing.
--
--     THE SAME PATTERN IS IN BOTH SIBLING PRODUCERS, and one of them is worse.
--     A census of every function inserting into communication.notification (four: `hr._wf_notify`,
--     `hr._l1_notify_consent_requested`, `hr._punch_notify_edited`, `esign._notify`; the last is
--     not in this class — its subject/body are its callers' parameters and it has never written a
--     row) shows the identical line in the first two. And `hr._wf_not_attested` carries a comment
--     reading "🚨 READ BACK, DO NOT ASSERT. hr._wf_notify returns how many notices it actually
--     wrote" — which was FALSE — and uses it to publish
--
--         'notified_user_id', case when v_sent > 0 then v_to_user end
--
--     on the attestation door. That does not merely overstate a count; it names a PERSON as
--     notified on the strength of a number that counted loop turns. §6 fixes both.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

set local statement_timeout = '600s';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. WHO CHANGED IT — A PERSON, THROUGH THE ONE NAME-RULE BODY, NEVER A RAW UUID.
--
-- The payload has always carried `changed_by_user_id`. A uuid is not an answer to "who changed
-- it", and pasting one into a sentence would be the same defect the round-36 attestation panel and
-- the round-41 bulk panel were written up for.
--
-- 0556 established the name rule and this reuses its body rather than writing a second one:
-- `hr._employee_display_name(employee, VIEWER)` resolves the name AS THE READER SEES IT, so a
-- directory opt-out is honoured per recipient — the subject themselves and HR in that employer
-- still see the name, everybody else gets NULL. This function is the actor-shaped front door to
-- it: an actor is known by their `auth.users` id, the name rule is keyed by `hr.employee`, and the
-- bridge is `login_user_id` WITHIN THE EMPLOYER THE NOTICE BELONGS TO — never a global lookup,
-- because one person may be an employee of two companies under two employee rows and the
-- employee reading this notice is entitled to the name their OWN employer knows.
--
-- NULL is a real answer here (no employee row in that employer, or the opt-out withheld it). The
-- caller substitutes a truthful generic; it never substitutes an id.
create or replace function hr._actor_display_name(
  p_actor_user uuid, p_organization_id uuid, p_uid uuid) returns text
language plpgsql stable security definer set search_path to 'hr', 'public' as $fn$
declare v_employee uuid;
begin
  if p_actor_user is null or p_organization_id is null or p_uid is null then return null; end if;

  select e.id into v_employee
    from hr.employee e
   where e.login_user_id = p_actor_user
     and e.organization_id = p_organization_id
     and e.deleted_at is null
   order by e.created_at
   limit 1;

  return hr._employee_display_name(v_employee, p_uid);
end
$fn$;

revoke all on function hr._actor_display_name(uuid, uuid, uuid) from public;

comment on function hr._actor_display_name(uuid, uuid, uuid) is
  'hr_l3_117: the ACTOR of a notice, named as a person, resolved per READER through the one '
  'name-rule body (hr._employee_display_name) so a directory opt-out is honoured. NULL when the '
  'actor holds no employee row in that employer or the opt-out withheld the name — the caller '
  'substitutes a truthful generic and NEVER a uuid.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE SMS WORD — 0560's SHAPE, FOR THE PUNCH MAP.
--
-- `hr._punch_change_words` answers up to 60 characters because it is written to be READ in an
-- email. This is the same fact in the width one segment can afford: the NEW state only, because
-- the old state is what the link is for. The four arms mirror that function's four arms exactly,
-- in the same order and off the same keys, so the two can never disagree about which case a
-- change is — they differ only in how much they say.
--
-- Widest possible answer, asserted in §9: 'now a break start at 12:38 PM' = 29 characters.
create or replace function hr._punch_change_words_short(p_change jsonb, p_tz text)
returns text language plpgsql stable as $fn$
declare
  v_tz    text := coalesce(nullif(btrim(coalesce(p_tz, '')), ''), 'UTC');
  v_from  timestamptz;
  v_to    timestamptz;
  v_fkind text;
  v_tkind text;
begin
  if p_change is null or jsonb_typeof(p_change) <> 'object' then
    return 'changed';
  end if;

  if coalesce((p_change ->> 'voided')::boolean, false) or p_change -> 'to' is null
     or jsonb_typeof(p_change -> 'to') = 'null' then
    return 'removed';
  end if;

  v_from  := nullif(btrim(coalesce(p_change #>> '{from,occurred_at}', '')), '')::timestamptz;
  v_to    := nullif(btrim(coalesce(p_change #>> '{to,occurred_at}', '')), '')::timestamptz;
  v_fkind := nullif(btrim(coalesce(p_change #>> '{from,punch_kind}', '')), '');
  v_tkind := nullif(btrim(coalesce(p_change #>> '{to,punch_kind}', '')), '');

  if v_from is not null and v_to is not null and v_from <> v_to
     and v_fkind is not null and v_tkind is not null and v_fkind <> v_tkind then
    return format('now a %s at %s', replace(v_tkind, '_', ' '),
                  to_char(v_to at time zone v_tz, 'FMHH12:MI AM'));
  end if;

  if v_from is not null and v_to is not null and v_from <> v_to then
    return format('moved to %s', to_char(v_to at time zone v_tz, 'FMHH12:MI AM'));
  end if;

  if v_fkind is not null and v_tkind is not null and v_fkind <> v_tkind then
    return format('now a %s', replace(v_tkind, '_', ' '));
  end if;

  -- Same rule as the long map: the unrecognised shape gets the safe general word. An empty string
  -- fails the strict renderer, and for a ⚖ notice that means the employee is told nothing at all.
  return 'changed';
end
$fn$;

revoke all on function hr._punch_change_words_short(jsonb, text) from public;

comment on function hr._punch_change_words_short(jsonb, text) is
  'hr_l3_117: the SMS word for a punch change — 0560''s shape. hr._punch_change_words is email '
  'prose (up to 60 chars) and merging it into the §3.7 one-segment SMS costs 165 septets = two '
  'billed segments. Same four arms, same keys, same order; the new state only. Widest answer 29 '
  'characters, asserted on every apply.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE PRODUCER — WHO, WHY, THE SHORT WORD, AND A COUNTER THAT COUNTS INSERTS.
--
-- 🚨 THE RETURN TYPE CHANGES from `integer` to `jsonb`, so it must be DROPped rather than
-- REPLACEd. That is deliberate and it is why the change is safe: an integer cannot say
-- "I wrote one row and suppressed one duplicate", and the whole defect in §0(D) is that a single
-- number was made to stand for two different facts. Both callers (hr.punch_correct and
-- hr.punch_void — the complete census; no others exist) are rewritten in §4 in this same
-- transaction, and §9 fails the apply if any other function still calls it.
-- The key `rows_written` KEEPS ITS NAME so the client mapper does not move; it simply stops lying.
drop function if exists hr._punch_notify_edited(uuid, uuid, uuid, uuid, text, uuid, jsonb);

create function hr._punch_notify_edited(
  p_organization_id uuid, p_employment_id uuid, p_voided_punch_id uuid,
  p_replacement_punch_id uuid, p_reason text, p_actor_user uuid, p_change jsonb)
returns jsonb
language plpgsql security definer set search_path to 'hr', 'public' as $fn$
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
$fn$;

revoke all on function hr._punch_notify_edited(uuid, uuid, uuid, uuid, text, uuid, jsonb) from public;

comment on function hr._punch_notify_edited(uuid, uuid, uuid, uuid, text, uuid, jsonb) is
  'hr_l3_117: the hr.time.punch_edited producer. Carries SPEC-TIME §4.1''s three clauses into the '
  'payload — what changed (hr._punch_change_words / _short), WHO changed it (hr._actor_display_name, '
  'a person per reader, never a uuid) and WHY (the reason, verbatim). Returns a jsonb envelope, not '
  'an integer: rows_written is ACTUAL INSERTS read from ROW_COUNT, and a dedupe-suppressed notice '
  'is reported by name as duplicates_suppressed instead of being counted as a send.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. THE TWO DOORS READ THE ENVELOPE.
--
-- Both published `notifications: {event_key, rows_written, org_overridable}`; both now publish the
-- truth under the same key plus the two facts the number used to hide. Nothing is renamed, so
-- `fromLivePunches.ts` keeps working and simply becomes correct.
--
-- 🚨 `pg_get_function_ARGUMENTS`, NOT `_identity_arguments`. The identity form omits DEFAULTs, so
-- recreating `hr.punch_correct` from it would silently drop `p_category uuid DEFAULT NULL` and
-- every three-argument caller — which is all of them, since hr_l3_97 added the fourth precisely so
-- existing callers would keep working — would start failing with "function does not exist".
do $doors$
declare v_src text; v_new text; v_args text;
begin
  ------------------------------------------------------------------ hr.punch_correct
  select p.prosrc, pg_get_function_arguments(p.oid) into v_src, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_correct';
  if v_src is null then raise exception 'hr_l3_117: hr.punch_correct is missing'; end if;

  if position('v_notified  integer := 0;' in v_src) = 0
     or position('v_notified := v_notified + hr._punch_notify_edited(' in v_src) = 0
     or position('''rows_written'', v_notified,' in v_src) = 0 then
    raise exception 'hr_l3_117: hr.punch_correct does not carry the three shapes this rewrite '
                    'replaces — inspect it by hand rather than guessing';
  end if;

  v_new := replace(v_src,
    'v_notified  integer := 0;',
    'v_notified  integer := 0;'||E'\n'||
    '  v_dupes     integer := 0;   -- hr_l3_117: dedupe-suppressed notices, named not swallowed'||E'\n'||
    '  v_nskip     integer := 0;'||E'\n'||
    '  v_notify    jsonb;');

  v_new := replace(v_new,
    'v_notified := v_notified + hr._punch_notify_edited(',
    'v_notify := hr._punch_notify_edited(');

  -- close the call and accumulate the envelope (the call''s final argument line is stable)
  if position('''punch_kind'',  v_item -> ''new_punch_kind'')));' in v_new) = 0 then
    raise exception 'hr_l3_117: could not locate the end of the hr._punch_notify_edited call in '
                    'hr.punch_correct';
  end if;
  v_new := replace(v_new,
    '''punch_kind'',  v_item -> ''new_punch_kind'')));',
    '''punch_kind'',  v_item -> ''new_punch_kind'')));'||E'\n'||
    '    -- hr_l3_117: ACTUAL INSERTS, plus the dedupe case reported by name.'||E'\n'||
    '    v_notified := v_notified + coalesce((v_notify ->> ''rows_written'')::integer, 0);'||E'\n'||
    '    v_dupes    := v_dupes    + coalesce((v_notify ->> ''duplicates_suppressed'')::integer, 0);'||E'\n'||
    '    v_nskip    := v_nskip    + coalesce((v_notify ->> ''skipped'')::integer, 0);');

  v_new := replace(v_new,
    '''rows_written'', v_notified,',
    '''rows_written'', v_notified,'||E'\n'||
    '                                        ''duplicates_suppressed'', v_dupes,'||E'\n'||
    '                                        ''skipped'', v_nskip,');

  execute format(
    'create or replace function hr.punch_correct(%s) returns jsonb language plpgsql '
    'security definer set search_path to ''hr'',''public'' as $body$%s$body$', v_args, v_new);

  ------------------------------------------------------------------ hr.punch_void
  select p.prosrc, pg_get_function_arguments(p.oid) into v_src, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_void';
  if v_src is null then raise exception 'hr_l3_117: hr.punch_void is missing'; end if;

  if position('v_notified integer;' in v_src) = 0
     or position('v_notified := hr._punch_notify_edited(' in v_src) = 0
     or position('''rows_written'', v_notified,' in v_src) = 0 then
    raise exception 'hr_l3_117: hr.punch_void does not carry the three shapes this rewrite '
                    'replaces — inspect it by hand rather than guessing';
  end if;

  v_new := replace(v_src, 'v_notified integer;', 'v_notify   jsonb;');
  v_new := replace(v_new, 'v_notified := hr._punch_notify_edited(',
                          'v_notify := hr._punch_notify_edited(');
  v_new := replace(v_new,
    '''rows_written'', v_notified, ''org_overridable'', false),',
    '''rows_written'', coalesce((v_notify ->> ''rows_written'')::integer, 0),'||E'\n'||
    '                                        ''duplicates_suppressed'', coalesce((v_notify ->> ''duplicates_suppressed'')::integer, 0),'||E'\n'||
    '                                        ''skipped'', coalesce((v_notify ->> ''skipped'')::integer, 0),'||E'\n'||
    '                                        ''org_overridable'', false),');

  execute format(
    'create or replace function hr.punch_void(%s) returns jsonb language plpgsql '
    'security definer set search_path to ''hr'',''public'' as $body$%s$body$', v_args, v_new);

  -- the rewrites must have TAKEN — a replace() that matched nothing is silent by nature
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'punch_correct'
                    and p.prosrc like '%duplicates_suppressed%')
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'hr' and p.proname = 'punch_void'
                       and p.prosrc like '%duplicates_suppressed%') then
    raise exception 'hr_l3_117: the punch-door rewrites did not take effect';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr' and p.proname in ('punch_correct','punch_void')
                and p.prosrc like '%v_notified := v_notified + hr._punch_notify_edited%') then
    raise exception 'hr_l3_117: a door still adds the producer''s return straight to an integer';
  end if;
end
$doors$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE LINK LANDS ON THE CORRECTED DAY.
--
-- 🚨 THE 1-ARG FUNCTION IS DROPPED, NOT OVERLOADED. Adding `p_punch_id uuid default null` beside
-- the existing signature would leave TWO functions and let PostgREST pick either — 0555's overload
-- trap, which cost that lane a day. There is exactly one resolver before and after.
drop function if exists public.hr_my_timesheet_context(uuid);
drop function if exists hr.my_timesheet_context(uuid);

create function hr.my_timesheet_context(
  p_employment_id uuid default null, p_punch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'hr', 'public' as $fn$
declare
  v_uid   uuid := auth.uid();
  v_mine  uuid[];
  v_emp   uuid;
  v_pg    uuid;
  v_rows  integer;
  v_basis text;
  v_note  text;
  v_reason text;
  v_pid   uuid;
  v_from  date;
  v_to    date;
  v_state text;
  v_punch_emp  uuid;   -- hr_l3_117
  v_punch_day  date;
  v_focus      uuid;
  v_focus_note text;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'Your timesheet is always read as somebody.');
  end if;

  v_mine := hr.employments_of(v_uid, current_date);
  if v_mine is null or cardinality(v_mine) = 0 then
    -- B5: the four-armed "why you hold no live employment" sentence already exists. Reuse it
    -- rather than writing a fifth wording of the same fact.
    return hr._time_not_employed_refusal(v_uid, 'There is no timesheet to show you.');
  end if;

  -- 🚨 hr_l3_117 — THE PUNCH THE NOTICE POINTED AT.
  -- `hr._punch_notify_edited` has written `/hr/me/timesheet?org=…&punch=<id>` since hr_l3_111 and
  -- this resolver could not see the parameter, so an employee following a ⚖ "your punch was
  -- changed" notice landed on whatever period covers TODAY and was told nothing. The punch is read
  -- BEFORE the ordinary resolution because it decides both the employment and the period.
  --
  -- SELF ONLY, by the same rule and the same refusal name B1 uses for `?employment=`: an id in a
  -- URL is checked, never trusted. A punch that belongs to somebody else is refused BY NAME rather
  -- than silently ignored, because silently resolving somebody else's day would be the wrong
  -- answer dressed as the right one.
  if p_punch_id is not null then
    select p.employment_id, p.local_work_date into v_punch_emp, v_punch_day
      from hr.punch p where p.id = p_punch_id;

    if v_punch_emp is null then
      -- An id that names no punch is a stale or mistyped link, not an authorisation problem.
      -- Refusing the whole page for it would be hostile, so the ordinary resolution runs and the
      -- reader is TOLD the link could not be honoured rather than being quietly redirected.
      v_focus_note := 'The link you followed pointed at a punch that is not on record, so this is '
                   || 'your usual timesheet instead.';
    elsif not (v_punch_emp = any (v_mine)) then
      return hr._time_refusal('hr_timesheet_context_not_self',
        'This page only ever works out your own timesheet. A manager opens a report''s hours from '
        || 'their team list instead.',
        jsonb_build_object('checked', 'the punch belongs to the signed-in person',
                           'as_of', current_date));
    else
      v_emp := v_punch_emp;
    end if;
  end if;

  -- 🚨 B1 — SELF ONLY, AND AN EXPLICIT ID IS CHECKED, NEVER TRUSTED. Route 5 is self-only by
  -- construction (§2.2); a manager reviewing a report uses route 29. An `?employment=` that is not
  -- the caller's own is refused by name so the surface can say what happened instead of resolving
  -- somebody else's period and handing it to a door that would then refuse in different words.
  if v_emp is null and p_employment_id is not null then
    if not (p_employment_id = any (v_mine)) then
      return hr._time_refusal('hr_timesheet_context_not_self',
        'This page only ever works out your own timesheet. A manager opens a report''s hours from '
        || 'their team list instead.',
        jsonb_build_object('checked', 'the employment belongs to the signed-in person',
                           'as_of', current_date));
    end if;
    v_emp := p_employment_id;
  elsif v_emp is null then
    -- The active spell wins; the most recent hire date breaks a tie. This mirrors the resolution
    -- `hr.my_time_off` already uses for the sibling self-service routes.
    select em.id into v_emp
      from hr.employment em
     where em.id = any (v_mine) and em.status = 'active'
     order by em.hire_date desc, em.created_at desc
     limit 1;
    if v_emp is null then
      select em.id into v_emp
        from hr.employment em
       where em.id = any (v_mine)
       order by em.hire_date desc, em.created_at desc
       limit 1;
    end if;
  end if;

  select em.pay_group_id into v_pg from hr.employment em where em.id = v_emp;

  -- hr_l3_117: the punch's own day decides the period, not today.
  if v_punch_day is not null and v_emp = v_punch_emp then
    select pp.id, pp.period_start_on, pp.period_end_on, pp.state
      into v_pid, v_from, v_to, v_state
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
     where ppe.employment_id = v_emp
       and (v_pg is null or pp.pay_group_id = v_pg)
       and v_punch_day between pp.period_start_on and pp.period_end_on
     order by pp.period_start_on desc, pp.sequence_number desc
     limit 1;

    if v_pid is not null then
      v_basis := 'punch';
      v_focus := p_punch_id;
      -- The honest sentence, and ONLY when there is something to be honest about: if this period
      -- is also the one covering today, the page is showing exactly what it always shows and a
      -- note would be noise. B4's wording is the pattern; this is the same fact for a different
      -- reason, so it is said the same way.
      if not (current_date between v_from and v_to) then
        v_focus_note := format('These are your hours for %s to %s — the period that covers the day '
                            || 'your punch was corrected, not the one open today.',
                               to_char(v_from, 'FMMon FMDD'), to_char(v_to, 'FMMon FMDD, YYYY'));
      end if;
    else
      -- The punch exists and is the reader's, but no pay period they are enrolled in covers its
      -- day. That is a real state (a correction to a day before their first period), and it is
      -- named rather than being resolved into a different day's hours pretending to be this one.
      v_focus_note := format('Your punch on %s was corrected, but no pay period of yours covers '
                          || 'that day yet, so it has no timesheet to open.',
                             to_char(v_punch_day, 'FMMon FMDD, YYYY'));
    end if;
  end if;

  -- B3: the period the person is IN, proven by their OWN `pay_period_employment` row. The
  -- employment's pay group disambiguates the several overlapping calendars an org can run.
  if v_pid is null then
    select pp.id, pp.period_start_on, pp.period_end_on, pp.state
      into v_pid, v_from, v_to, v_state
      from hr.pay_period_employment ppe
      join hr.pay_period pp on pp.id = ppe.pay_period_id
     where ppe.employment_id = v_emp
       and (v_pg is null or pp.pay_group_id = v_pg)
       and current_date between pp.period_start_on and pp.period_end_on
     order by pp.period_start_on desc, pp.sequence_number desc
     limit 1;

    if v_pid is not null then
      v_basis := 'current';
    else
      -- B4: no period contains today. The most recent one the person is actually enrolled in is a
      -- real answer with real hours in it — and it is LABELLED, because rendering a closed period as
      -- "your timesheet" without saying so is the same class of defect as a negative bookable balance.
      select pp.id, pp.period_start_on, pp.period_end_on, pp.state
        into v_pid, v_from, v_to, v_state
        from hr.pay_period_employment ppe
        join hr.pay_period pp on pp.id = ppe.pay_period_id
       where ppe.employment_id = v_emp
         and (v_pg is null or pp.pay_group_id = v_pg)
         and pp.period_end_on < current_date
       order by pp.period_end_on desc, pp.sequence_number desc
       limit 1;

      if v_pid is not null then
        v_basis := 'most_recent';
        v_note  := format('No pay period is open for today. These are your hours for %s to %s, the '
                       || 'most recent period you were in.',
                          to_char(v_from, 'FMMon FMDD'), to_char(v_to, 'FMMon FMDD, YYYY'));
      else
        v_basis := 'none';
        -- B5: the reason, in the three shapes it comes in. Never "not wired up yet".
        select count(*)::integer into v_rows
          from hr.pay_period_employment ppe where ppe.employment_id = v_emp;
        if v_pg is null then
          v_reason := 'You are not in a pay group yet, so no pay periods have been created for you '
                   || 'and there is no timesheet to total. HR sets this up on your position.';
        elsif coalesce(v_rows, 0) = 0 then
          v_reason := 'Your pay group has not opened a pay period that includes you yet. Your hours '
                   || 'are being recorded; they appear here as soon as a period covers them.';
        else
          v_reason := 'You are in a pay group, but no pay period covering today has been opened yet. '
                   || 'Your hours appear here as soon as one is.';
        end if;
      end if;
    end if;
  end if;

  return hr._time_ok(jsonb_build_object(
    'employment_id',   v_emp,
    'pay_group_id',    v_pg,
    'pay_period_id',   v_pid,
    'period_start_on', v_from,
    'period_end_on',   v_to,
    'period_state',    v_state,
    'basis',           v_basis,
    'period_note',     v_note,
    'no_period_reason', v_reason,
    -- hr_l3_117: echoed back ONLY when the punch was honoured, so the surface can never focus a
    -- row on the strength of a parameter the server refused to act on.
    'focus_punch_id',        v_focus,
    'focus_local_work_date', case when v_focus is not null then v_punch_day end,
    'focus_note',            v_focus_note));
end
$fn$;

revoke all on function hr.my_timesheet_context(uuid, uuid) from public;

comment on function hr.my_timesheet_context(uuid, uuid) is
  'Route 5''s period resolver. hr_l3_117 gives it the punch: a ⚖ hr.time.punch_edited notice links '
  '/hr/me/timesheet?org=…&punch=<id> and this resolver could not see the parameter, so the employee '
  'landed on today''s period and was told nothing about the correction. Self-only by the same '
  'refusal B1 uses for ?employment=; an unknown id is named, never silently redirected.';

create function public.hr_my_timesheet_context(
  p_employment_id uuid default null, p_punch_id uuid default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select hr.my_timesheet_context($1, $2);
$fn$;

-- 🚨 THE DOOR DECLARATION MOVES WITH THE SIGNATURE, AND IT MUST GO BEFORE THE GRANT.
-- `platform.client_callable_door` keys on `identity_args`, so widening this wrapper to two
-- arguments orphaned its existing row: `platform._ddl_guard` fired
-- `definer_client_grant_revoked` on the dry run — "every client call now returns 42501 / HTTP 403
-- — if you just granted it, THE GRANT DID NOT STICK" — which is route 5 going dark for every
-- employee in the product. The original reason is carried VERBATIM and extended, because none of
-- it stopped being true; the door simply answers one more question.
update platform.client_callable_door
   set identity_args = 'p_employment_id uuid, p_punch_id uuid',
       reason = reason || ' | AMENDED 2026-08-29 by hr_l3_117: the wrapper gained p_punch_id, so '
                       || 'the declared identity_args had to follow or the guard revokes the '
                       || 'client grant. The safety argument is UNCHANGED and the new argument '
                       || 'does not widen it: a punch id is checked against '
                       || 'hr.employments_of(auth.uid()) exactly as an employment id is, and is '
                       || 'refused with the same hr_timesheet_context_not_self when it belongs to '
                       || 'somebody else. The answer is still two ids and a sentence.'
 where schema_name = 'public' and function_name = 'hr_my_timesheet_context';

do $door$
begin
  if not exists (select 1 from platform.client_callable_door
                  where schema_name = 'public' and function_name = 'hr_my_timesheet_context'
                    and identity_args = 'p_employment_id uuid, p_punch_id uuid') then
    raise exception 'hr_l3_117: the client-callable door for public.hr_my_timesheet_context does '
                    'not name the new signature — the grant below will not stick and route 5 goes '
                    'dark for every employee';
  end if;
end
$door$;

revoke all on function public.hr_my_timesheet_context(uuid, uuid) from public;
grant execute on function public.hr_my_timesheet_context(uuid, uuid) to authenticated, service_role;

comment on function public.hr_my_timesheet_context(uuid, uuid) is
  'PostgREST door for hr.my_timesheet_context. hr_l3_117 added p_punch_id (defaulted, so every '
  'existing caller is byte-identical) and DROPPED the 1-arg signature rather than overloading it — '
  '0555''s overload trap.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. THE SAME COUNTER, IN THE TWO SIBLING PRODUCERS.
--
-- These keep `returns integer`: `hr._wf_notify` has twelve callers and `hr._l1_notify_consent_requested`
-- is called from a public door, and widening a return type across thirteen call sites to carry a
-- number that is about to become CORRECT would be a change with no reader. What changes is that
-- the integer stops meaning "loop turns" and starts meaning "rows written", which is what
-- `hr._wf_not_attested` already believed it meant — in a comment, in writing, while publishing
-- `notified_user_id` off it.
--
-- The dedupe case has no row to carry a named skip, so it is raised as a WARNING: visible in the
-- server log, attributable to a step and a channel, and impossible to mistake for a send.
--
-- Rewritten by TEXT SUBSTITUTION on the live prosrc rather than re-emitted, deliberately: both
-- bodies carry contract pins asserting tokens elsewhere in them (hr_c4_47, hr_l3_111, hr_l3_114,
-- 0555, 0556), and re-typing 200 lines to change four is how a pinned token gets dropped by hand.
--
-- TWO TRAPS CLOSED HERE BY CONSTRUCTION, both of which would have shipped silently:
--
--  (i)  The two functions name their channel loop variable DIFFERENTLY — `ch` in `hr._wf_notify`,
--       `v_ch` in `hr._l1_notify_consent_requested`. plpgsql compiles a body LAZILY, so a warning
--       naming the wrong variable would create cleanly, pass every post-condition in this file,
--       and raise `undefined column` the first time a real duplicate was suppressed — inside a
--       decision transaction. The variable is read off the source instead of assumed.
--  (ii) `pg_get_function_ARGUMENTS` again: `hr._wf_notify` carries `p_extra jsonb DEFAULT '{}'`,
--       and the identity form would drop it. `search_path` and the SECURITY mode are likewise read
--       from `pg_proc`, never retyped — the two differ (`'hr','public'` vs `'public','hr'`).
do $siblings$
declare
  v_src text; v_new text; v_args text; v_name text; v_sec text; v_cfg text; v_chan text;
  v_counter constant text := 'if v_status in (''pending'', ''render_pending'') then v_n := v_n + 1; end if;';
  v_hit integer;
begin
  foreach v_name in array array['_wf_notify', '_l1_notify_consent_requested'] loop
    select p.prosrc, pg_get_function_arguments(p.oid),
           case when p.prosecdef then 'security definer' else 'security invoker' end,
           (select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
      into v_src, v_args, v_sec, v_cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.proname = v_name;
    if v_src is null then
      raise exception 'hr_l3_117: hr.% is missing', v_name;
    end if;
    if v_cfg is null then
      raise exception 'hr_l3_117: hr.% has no pinned search_path — refusing to guess one', v_name;
    end if;

    v_hit := (length(v_src) - length(replace(v_src, v_counter, ''))) / length(v_counter);
    if v_hit <> 1 then
      raise exception 'hr_l3_117: expected exactly ONE lying counter in hr.%, found % — inspect it '
                      'by hand rather than guessing', v_name, v_hit;
    end if;

    -- trap (i): the channel variable, READ not assumed.
    v_chan := case
                when v_src ~ '(?n)^\s*foreach\s+ch\s+in\s+array'    then 'ch'
                when v_src ~ '(?n)^\s*foreach\s+v_ch\s+in\s+array'  then 'v_ch'
              end;
    if v_chan is null then
      raise exception 'hr_l3_117: could not read the channel loop variable out of hr.% — a warning '
                      'naming the wrong one compiles fine and dies at run time', v_name;
    end if;

    if position('v_n integer := 0;' in v_src) = 0 then
      raise exception 'hr_l3_117: could not find the counter declaration in hr.%', v_name;
    end if;
    -- 🚨 THE NEW DECLARATION GETS ITS OWN LINE, AND SO DOES EVERYTHING AFTER IT.
    -- The first draft of this appended `v_ins integer := 0;  -- comment` INLINE, and both bodies
    -- declare several variables per line: the `--` swallowed the rest of the line, taking
    -- `v_link text; v_payload jsonb;` with it. Caught by the dry run as `"v_link" is not a known
    -- variable`, which is the whole reason this file is rehearsed in a rolled-back transaction
    -- before it is applied.
    v_new := replace(v_src, 'v_n integer := 0;',
      'v_n integer := 0;' || E'\n' ||
      '  v_ins integer := 0;   -- hr_l3_117: ROW_COUNT of the insert just made' || E'\n' ||
      '  ');

    v_new := replace(v_new, v_counter,
      '-- 🚨 hr_l3_117 — INSERTS, NOT LOOP TURNS. `on conflict do nothing` writes nothing and'||E'\n'||
      '        -- raises nothing, so this counter went up for a notice that was never written.'||E'\n'||
      '        -- hr._wf_not_attested publishes `notified_user_id` off this number.'||E'\n'||
      '        get diagnostics v_ins = row_count;'||E'\n'||
      '        if v_status in (''pending'', ''render_pending'') then'||E'\n'||
      '          if v_ins > 0 then'||E'\n'||
      '            v_n := v_n + 1;'||E'\n'||
      '          else'||E'\n'||
      '            -- A NAMED skip. There is no row to record it on — the insert was suppressed —'||E'\n'||
      '            -- so it is raised where it can be seen, never counted as a send.'||E'\n'||
      '            raise warning ''hr_l3_117: a % notice was suppressed as a duplicate and NOT '||
                    'counted as sent'', ' || v_chan || ';'||E'\n'||
      '          end if;'||E'\n'||
      '        end if;');

    execute format(
      'create or replace function hr.%I(%s) returns integer language plpgsql %s set %s '
      'as $body$%s$body$',
      v_name, v_args, v_sec, v_cfg, v_new);

    -- 🚨 NOTHING HERE COMPILES THE NEW BODY, AND SAYING OTHERWISE WOULD BE THE DEFECT THIS
    -- MIGRATION EXISTS TO FIX. `check_function_bodies` parses plpgsql at CREATE time but resolves
    -- variable references LAZILY, at first execution — so a warning naming a variable that does
    -- not exist would create cleanly and die months later. That is exactly why the channel
    -- variable is READ off the `foreach` line above instead of assumed, and why the assertion
    -- below checks the emitted text rather than trusting the replace() to have matched.
    if position('raise warning ''hr_l3_117:' in v_new) = 0
       or position(', ' || v_chan || ';' in v_new) = 0 then
      raise exception 'hr_l3_117: the named-skip warning did not land in hr.% naming %',
        v_name, v_chan;
    end if;
  end loop;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr'
                and p.proname in ('_wf_notify', '_l1_notify_consent_requested',
                                  '_punch_notify_edited')
                and p.prosrc like '%then v_n := v_n + 1; end if;%') then
    raise exception 'hr_l3_117: a producer still counts loop turns instead of inserts';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname in ('_wf_notify', '_l1_notify_consent_requested')
         and p.prosrc like '%get diagnostics v_ins = row_count;%') <> 2 then
    raise exception 'hr_l3_117: the sibling counter rewrite did not take effect in both producers';
  end if;
end
$siblings$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. THE WORDS.
--
-- 🚨 THE ROW IS THE KNOB AFTER BIRTH (SPEC-NOTIFICATIONS §7.1, and `reconcile_notification_event_types`
-- enforces it: `templates` is in the never-rewritten set, so editing the Python declaration alone
-- changes NOTHING for an event that already exists). Both halves therefore move — the declaration
-- in `aidream/services/notifications/hr_catalog/time.py` for the next database born, and this row
-- for the one we have.
--
-- And because the row is the admin's, this migration REFUSES to overwrite an edited one: each
-- current body is asserted to be byte-identical to what the catalog seeded before it is replaced.
-- If an admin has reworded any of the three, this apply fails and a human merges the two intents.
-- 0559 established that discipline when it repaired the literal `\n` escape inside 165 rows.
do $words$
declare
  v_cfg jsonb; v_t jsonb;
  v_in_app  constant text := 'Your punch on {{date}} was changed: {{change.summary}}';
  v_email   constant text :=
    'Your punch on {{date}} was changed: {{change.summary}}' || E'\n\n' ||
    'Open it: {{link.deep}}' || E'\n\n' || '--' || E'\n' ||
    '{{employer.short_name}} sent this through AI Matrx. Manage notifications: {{link.preferences}}';
  v_sms     constant text :=
    '{{employer.short_name}}: Your punch on {{date}} was changed: {{change.summary}} '
    '{{link.deep_short}} Reply STOP to opt out.';
begin
  select config into v_cfg from communication.notification_event_type
   where event_key = 'hr.time.punch_edited' and deleted_at is null;
  if v_cfg is null then
    raise exception 'hr_l3_117: hr.time.punch_edited is not registered';
  end if;
  v_t := coalesce(v_cfg -> 'templates', '{}'::jsonb);

  if (v_t -> 'in_app' ->> 'body') is distinct from v_in_app
     or (v_t -> 'email' ->> 'body') is distinct from v_email
     or (v_t -> 'email' ->> 'subject') is distinct from v_in_app
     or (v_t -> 'sms'   ->> 'body') is distinct from v_sms then
    raise exception 'hr_l3_117: a hr.time.punch_edited template is not the value the catalog '
                    'seeded — the row is the admin''s knob after birth (§7.1) and this migration '
                    'will not silently discard an edit. Merge the two intents by hand. Live '
                    'in_app=%, email_subject=%, sms=%',
      v_t -> 'in_app' ->> 'body', v_t -> 'email' ->> 'subject', v_t -> 'sms' ->> 'body';
  end if;

  v_cfg := jsonb_set(v_cfg, '{templates}', jsonb_build_object(
    'in_app', jsonb_build_object(
      'subject', 'Punch edited',
      'body', '{{actor.name}} changed your punch on {{date}}: {{change.summary}}. '
           || 'Reason given: {{change.reason}}'),
    'email', jsonb_build_object(
      'subject', 'Your punch on {{date}} was changed by {{actor.name}}',
      'body', '{{actor.name}} changed your punch on {{date}}: {{change.summary}}.' || E'\n\n' ||
              'Reason given: {{change.reason}}' || E'\n\n' ||
              'Open it: {{link.deep}}' || E'\n\n' || '--' || E'\n' ||
              '{{employer.short_name}} sent this through AI Matrx. '
              'Manage notifications: {{link.preferences}}'),
    -- 🚨 THE SMS LEG CARRIES WHO AND WHAT, AND SENDS THE READER TO WHY.
    -- §3.7 gives this sentence one segment. `{{change.summary}}` is email prose worth up to 60
    -- characters and the free-text reason has no bound at all; carrying either costs a second
    -- billed segment (§0(B): the CURRENT template is already 165 septets, five over, and nothing
    -- had ever measured it). So: the short word, the actor's name, and the link — and the reason
    -- verbatim on the two channels §7.1 guarantees can never be switched off.
    'sms', jsonb_build_object(
      'body', '{{employer.short_name}}: {{actor.name}} changed your {{date}} punch: '
           || '{{change.summary_short}} {{link.deep_short}} Reply STOP to opt out.')));

  -- The registry declared `&period={{period.id}}` — a THIRD link shape, emitted by nobody. The
  -- producer has written `&punch=` since hr_l3_111 and §5 now makes the page honour it.
  v_cfg := jsonb_set(v_cfg, '{deep_link_template}',
                     to_jsonb('/hr/me/timesheet?org={{organization.id}}&punch={{punch.id}}'::text));

  update communication.notification_event_type
     set config = v_cfg, updated_at = now()
   where event_key = 'hr.time.punch_edited' and deleted_at is null;
end
$words$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. CONTRACT PINS.
--
-- 🚨 ONE EXISTING PIN IS AMENDED, NOT REPLACED, AND ITS ORIGINAL REASON IS CARRIED VERBATIM.
-- hr_c4_47 pinned the literal `if v_status in ('pending', 'render_pending') then v_n := v_n + 1`
-- on `hr._wf_notify` — the lying counter itself. Its clause (c) is not wrong; it is INCOMPLETE, and
-- it named this exact failure mode one level up: "count only DELIVERABLE notices in its return, or
-- hr._wf_not_attested reads a skipped-no-address row as a reached recipient (the D285 falsehood)."
-- A suppressed insert is the same falsehood by a different route: the status was deliverable and
-- no row exists. The pin now asserts BOTH halves — the status test AND the ROW_COUNT read — and
-- BANS the bare increment that stood in for them.
update hr.function_contract
   set must_contain = array['communication.resolve_channel_address',
                            'notice=',
                            'if v_status in (''pending'', ''render_pending'') then',
                            'get diagnostics v_ins = row_count;'],
       must_not_contain = array['p_user, ''user'', ch, v_payload,',
                                'then v_n := v_n + 1; end if;'],
       reason = reason || ' | AMENDED 2026-08-29 by hr_l3_117: clause (c) is unchanged in force '
                       || 'and was INCOMPLETE, not wrong. It required a deliverable STATUS; it did '
                       || 'not require a written ROW. `on conflict do nothing` supplies a '
                       || 'deliverable status with zero rows written, so the counter reported '
                       || 'sends that never happened — the same D285 falsehood clause (c) exists '
                       || 'to prevent, reached by a second route. The pin now names the status '
                       || 'test AND the ROW_COUNT read, and BANS the bare increment that used to '
                       || 'stand for both.'
 where function_name = '_wf_notify' and home_migration = 'hr_c4_47';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   must_be_definer)
values
  ('hr', '_punch_notify_edited', 'hr_l3_117',
   array['hr._actor_display_name', 'hr._punch_change_words_short',
         '''summary_short'', v_summary_short', '''reason'', v_reason',
         'get diagnostics v_ins = row_count;', '''duplicates_suppressed'', v_dup'],
   array['then v_n := v_n + 1; end if;'],
   'hr_l3_117: SPEC-TIME §4.1 is an Arman ruling of 2026-08-25 with THREE clauses — the employee '
   'is told what changed, WHO changed it and WHY — and only the first shipped. The producer had '
   'carried changed_by_user_id and reason in its payload since hr_l3_03 and the templates '
   'interpolated neither. The actor must be resolved through hr._actor_display_name (a person, per '
   'reader, honouring the directory opt-out; never a raw uuid) and the reason must reach the '
   'payload as a guaranteed-non-empty merge value, or the strict renderer fails the notice and the '
   'employee is told nothing at all. The short word is the §3.7 one-segment leg (the long map is '
   '165 septets = two billed segments). And the counter must read ROW_COUNT: `on conflict do '
   'nothing` writes nothing and raises nothing, so the old increment counted loop turns — T-9 '
   'measured rows_written=2 against zero rows, and PunchCorrectionDialog.tsx renders that number '
   'to a manager as the sentence saying the employee was notified.',
   true),

  ('hr', '_actor_display_name', 'hr_l3_117',
   array['hr._employee_display_name', 'login_user_id', 'organization_id = p_organization_id'],
   array[]::text[],
   'hr_l3_117: the ONE name-rule body (0556) must be reused, not re-implemented — it is what '
   'honours a directory opt-out per reader. And the actor is resolved WITHIN THE EMPLOYER the '
   'notice belongs to: one person can hold employee rows at two companies, and the employee '
   'reading the notice is entitled to the name their own employer knows.',
   true),

  ('hr', '_punch_change_words_short', 'hr_l3_117',
   array['''removed''', '''moved to %s''', '''now a %s at %s''', '''changed'''],
   array[]::text[],
   'hr_l3_117: 0560''s shape for the punch map. The four arms must mirror hr._punch_change_words '
   'arm for arm and key for key so the SMS and the email can never disagree about WHICH CASE a '
   'change is — they may only differ in how much they say. The fall-through must be a real word: '
   'an empty string fails the strict renderer and a ⚖ notice then reaches nobody.',
   null),

  ('hr', '_l1_notify_consent_requested', 'hr_l3_117',
   array['get diagnostics v_ins = row_count;'],
   array['then v_n := v_n + 1; end if;'],
   'hr_l3_117: the same lying counter as hr._punch_notify_edited and hr._wf_notify — a census of '
   'every function inserting into communication.notification found the identical line in all '
   'three. The return must be INSERTS, not loop turns.',
   null),

  ('hr', 'punch_correct', 'hr_l3_117',
   array['duplicates_suppressed', '''rows_written'', v_notified'],
   array['v_notified := v_notified + hr._punch_notify_edited'],
   'hr_l3_117: this door publishes notifications.rows_written, which '
   'features/hr/time/punches/fromLivePunches.ts reads as `employeeNotified` and '
   'PunchCorrectionDialog.tsx renders to the manager as the promise §4.1 exists to make. It must '
   'report ACTUAL INSERTS and must name the dedupe case rather than counting it as a send.',
   true),

  ('hr', 'punch_void', 'hr_l3_117',
   array['duplicates_suppressed'],
   array['v_notified := hr._punch_notify_edited'],
   'hr_l3_117: the sibling door, same published shape, same client mapper, same requirement.',
   true),

  ('hr', 'my_timesheet_context', 'hr_l3_117',
   array['p_punch_id', 'focus_punch_id', 'hr_timesheet_context_not_self', 'local_work_date'],
   array[]::text[],
   'hr_l3_117: a ⚖ hr.time.punch_edited notice links /hr/me/timesheet?org=…&punch=<id>. This '
   'resolver ignored the parameter, so an employee following the notice landed on whatever period '
   'covers TODAY and was told nothing about the correction. The punch must decide the period, and '
   'it must be checked as SELF by the same refusal ?employment= uses — an id in a URL is checked, '
   'never trusted.',
   true);

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 9. THE ASSERTIONS.
do $post$
declare
  v_kind text; v_short text; v_body text; v_subj text; v_max integer; v_n integer;
  v_kinds text[] := array['clock_in','clock_out','break_start','break_end','meal_start',
                          'meal_end','transfer'];
  v_change jsonb;
begin
  ---------------------------------------------------------------- (a) the short map's 29 ceiling
  -- Both moved is the widest arm. A 12-hour clock with a two-digit hour is the widest time.
  foreach v_kind in array v_kinds loop
    v_change := jsonb_build_object(
      'from', jsonb_build_object('occurred_at', '2026-09-28T06:38:00Z', 'punch_kind', 'clock_in'),
      'to',   jsonb_build_object('occurred_at', '2026-09-28T19:38:00Z', 'punch_kind', v_kind));
    v_short := hr._punch_change_words_short(v_change, 'UTC');
    if length(v_short) > 29 then
      raise exception 'hr_l3_117: hr._punch_change_words_short answers % characters for % ("%"); '
                      'the one-segment budget in §7 allows 29. Shorten it or re-do the arithmetic.',
        length(v_short), v_kind, v_short;
    end if;
    -- (a2) NO DRIFT with the long map: neither may fall through while the other recognises the case.
    if v_short = 'changed' and hr._punch_change_words(v_change, 'UTC') <> 'it was changed' then
      raise exception 'hr_l3_117: the short map does not know the % case while the long map does — '
                      'they have drifted', v_kind;
    end if;
  end loop;
  -- the void arm, both maps
  if hr._punch_change_words_short(jsonb_build_object('voided', true, 'to', null), 'UTC') <> 'removed'
     or hr._punch_change_words(jsonb_build_object('voided', true, 'to', null), 'UTC') <> 'it was removed' then
    raise exception 'hr_l3_117: the void arm disagrees between the two maps';
  end if;

  ---------------------------------------------------------------- (b) the templates carry the clauses
  select config -> 'templates' -> 'sms' ->> 'body' into v_body
    from communication.notification_event_type where event_key = 'hr.time.punch_edited'
      and deleted_at is null;
  if v_body not like '%{{actor.name}}%' or v_body not like '%{{change.summary_short}}%' then
    raise exception 'hr_l3_117: the sms body lost the actor or the short word: %', v_body;
  end if;
  if v_body like '%{{change.summary}}%' or v_body like '%{{change.reason}}%' then
    raise exception 'hr_l3_117: the sms body merges an UNBOUNDED value ({{change.summary}} is up to '
                    '60 characters, {{change.reason}} is free text a manager types). That is the '
                    'two-segment defect §0(B) measured: %', v_body;
  end if;

  foreach v_kind in array array['email', 'in_app'] loop
    select config -> 'templates' -> v_kind ->> 'body' into v_body
      from communication.notification_event_type where event_key = 'hr.time.punch_edited'
        and deleted_at is null;
    -- 🚨 ALL THREE OF §4.1's CLAUSES, ON EVERY CHANNEL §7.1 GUARANTEES.
    if v_body not like '%{{change.summary}}%' then
      raise exception 'hr_l3_117: the % body lost WHAT CHANGED: %', v_kind, v_body;
    end if;
    if v_body not like '%{{actor.name}}%' then
      raise exception 'hr_l3_117: the % body does not say WHO CHANGED IT — SPEC-TIME §4.1, ruled '
                      '2026-08-25: %', v_kind, v_body;
    end if;
    if v_body not like '%{{change.reason}}%' then
      raise exception 'hr_l3_117: the % body does not say WHY — SPEC-TIME §4.1, ruled 2026-08-25: %',
        v_kind, v_body;
    end if;
    -- 0559's defect, kept executable: a literal backslash-n where a line break belongs.
    -- 🚨 `strpos`, NOT `like '%\n%'`: backslash is LIKE's own escape character, so that pattern
    -- means "contains the letter n" and fires on every template ever written. It fired on this
    -- one, in the dry run, which is the only reason the assertion is correct now.
    if strpos(v_body, '\n') > 0 then
      raise exception 'hr_l3_117: the % body carries a literal \n escape (0559''s defect): %',
        v_kind, v_body;
    end if;
  end loop;

  ---------------------------------------------------------------- (c) COUNTED, NOT ESTIMATED
  -- 0560 §4(d)'s arithmetic, for this template. Every merge value is a real live maximum re-read
  -- from the tables, so this assertion TIGHTENS BY ITSELF as the data grows. It is the check
  -- nobody ever ran on this event: at the values in this database today, the template it replaces
  -- is 165 septets — five over one segment — and has been since it was seeded.
  select config -> 'templates' -> 'sms' ->> 'body' into v_body
    from communication.notification_event_type where event_key = 'hr.time.punch_edited'
      and deleted_at is null;
  select 160
       - length(v_body)
       + length('{{employer.short_name}}') + length('{{actor.name}}') + length('{{date}}')
       + length('{{change.summary_short}}') + length('{{link.deep_short}}')
       - length('https://www.aimatrx.com/r/0123456789')     -- a minted short URL
       - coalesce((select max(length(coalesce(nullif(btrim(abbreviation), ''), btrim(name))))
                     from iam.organizations), 0)
       - coalesce((select max(length(display_name)) from hr.employee where deleted_at is null), 0)
       - 12                                                  -- FMMon FMDD, YYYY: "Sep 28, 2026"
       - 29                                                  -- the short map's ceiling, (a) above
    into v_max;
  if v_max < 0 then
    raise exception 'hr_l3_117: the punch_edited sms is % septets OVER one GSM-7 segment at the '
                    'widest values in this database. Re-do the arithmetic in §7; do not relax '
                    'this.', -v_max;
  end if;
  raise notice 'hr_l3_117: punch_edited sms fits one GSM-7 segment with % septets to spare at '
               'live-max values.', v_max;

  ---------------------------------------------------------------- (d) NO OVERLOADS (0555's trap)
  foreach v_kind in array array['my_timesheet_context', '_punch_notify_edited'] loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.proname = v_kind;
    if v_n <> 1 then
      raise exception 'hr_l3_117: expected exactly ONE hr.%, found % — that is 0555''s overload '
                      'trap', v_kind, v_n;
    end if;
  end loop;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_my_timesheet_context';
  if v_n <> 1 then
    raise exception 'hr_l3_117: expected exactly ONE public.hr_my_timesheet_context, found %', v_n;
  end if;

  ---------------------------------------------------------------- (e) the producer's callers
  -- The return type changed from integer to jsonb. Anything still adding it to a number is a
  -- caller this migration did not know about.
  -- 🚨 A CALL, NOT A MENTION. Written as a `like`, this fired on hr.my_timesheet_context — which
  -- merely NAMES the producer in a comment explaining where the ?punch= link comes from. An
  -- assertion that cannot tell a call site from prose is an assertion somebody deletes.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~ 'hr\._punch_notify_edited\s*\('
     and p.proname not in ('_punch_notify_edited', 'punch_correct', 'punch_void');
  if v_n > 0 then
    raise exception 'hr_l3_117: % function(s) call hr._punch_notify_edited outside the two doors '
                    'this migration rewrote — its return type changed and they will break', v_n;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_punch_notify_edited'
                    and p.prorettype = 'jsonb'::regtype) then
    raise exception 'hr_l3_117: hr._punch_notify_edited does not return jsonb';
  end if;

  ---------------------------------------------------------------- (f) the producer census is still four
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ~* 'insert\s+into\s+communication\.notification\M';
  if v_n <> 4 then
    raise exception 'hr_l3_117: % functions insert into communication.notification; this lane '
                    'swept the four that existed (hr._wf_notify, hr._l1_notify_consent_requested, '
                    'hr._punch_notify_edited, esign._notify). A new one needs the same counter '
                    'audit.', v_n;
  end if;

  ---------------------------------------------------------------- (g) no implicit PUBLIC EXECUTE
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'hr'
                and p.proname in ('_actor_display_name', '_punch_change_words_short',
                                  '_punch_notify_edited', 'my_timesheet_context')
                and p.proacl is null) then
    raise exception 'hr_l3_117: a function created here carries a NULL acl — implicit PUBLIC EXECUTE';
  end if;

  ---------------------------------------------------------------- (h) route 5's grant STUCK
  -- The guard revokes a client grant on a SECURITY DEFINER function whose door is not declared,
  -- and it does so AFTER the grant runs. Asserting the grant here is the difference between
  -- "I issued a GRANT" and "an employee can open their timesheet".
  if not has_function_privilege('authenticated',
        'public.hr_my_timesheet_context(uuid, uuid)', 'execute') then
    raise exception 'hr_l3_117: `authenticated` cannot execute public.hr_my_timesheet_context — '
                    'route 5 is dark for every employee in the product';
  end if;
  if has_function_privilege('anon', 'public.hr_my_timesheet_context(uuid, uuid)', 'execute') then
    raise exception 'hr_l3_117: `anon` can execute public.hr_my_timesheet_context — the door''s own '
                    'declaration says NEVER by anon';
  end if;

  ---------------------------------------------------------------- (i) every pin holds
  select count(*) into v_n from hr.function_contracts_broken();
  if v_n > 0 then
    raise exception 'hr_l3_117: % contract(s) broken after this migration', v_n;
  end if;

  raise notice 'hr_l3_117: who + why shipped, the link resolves a punch, the counter counts '
               'inserts, % contracts broken', v_n;
end
$post$;

commit;
