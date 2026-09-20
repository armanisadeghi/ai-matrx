-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.anon_clear(uuid, uuid) 9d408ef746d6e58ed9c1ab6c47827d6d6f0cdd8f83734ae98e0d203d89076b00
--
-- LANE FORMS — TWO MORE THINGS THAT MADE `custom.anon_clear` UNABLE TO EVER WRITE A
-- RECORD, both of them one line past the Rule defect the previous file fixed, and
-- neither reachable until it was.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, on a real published form:
--
-- 1. THE ORGANIZATION WALL HAS NOBODY TO LET THROUGH.
--      custom.record_write → custom.assert_client_may_change → custom.assert_client_may_reach
--      → "You are not a member of that organization, so custom.record_write has nothing to
--        do there." (42501)
--    A submission from a stranger has no principal, and `iam.has_org_access` reads
--    `auth.uid()`. So the door correctly refused, and the anonymous write door could
--    never produce a record — the last step of its own reason for existing.
--
-- 2. `anonymous` IS NOT A WORD THIS STORE KNOWS.
--      select custom.actor_vocabulary();  →  {user, agent, system}
--    and `custom.anon_clear` wrote `jsonb_build_object('_actor', 'anonymous')`, which
--    `custom.actor_word` refuses by name with 22023. Exactly the class W4-ANON's own
--    suite caught four times inside the door ("four invented `_actor` words against a
--    closed vocabulary") — this is the fifth, in the one statement the suite never
--    reached because the Rule check above it rejected everything first.
--
-- WHOSE WRITE IS IT, THEN? AGT-N-5, VERBATIM: *"the principal of an unattended run is
-- the person who set it up."* A form is exactly that — an unattended run with a link on
-- the front — and the person who set it up is `custom.anon_form.published_by`, whom
-- `custom.anon_publish` already required to hold ADMIN on the Table. So when there is no
-- principal at all, this door assumes the PUBLISHER's, transaction-locally, for the one
-- statement that writes the record, and puts it back afterwards. Nothing widens: the
-- publisher could already write to that Table, the caller cannot influence who the
-- publisher is, and a caller who IS signed in keeps their own principal — the triage
-- screen clears a submission as the person clicking, exactly as before.
--
-- AND THE RECORD SAYS WHERE IT CAME FROM. `_actor` is `system`, because no person and no
-- agent typed it, and `_source` carries the submission's own provenance — the form, its
-- version, the moment, the origin and the channel — so "who filled this in" is answerable
-- from the record forever without joining anything. The value envelopes read
-- `"actor": "system"` beside it (measured on this database).
--
-- Everything else in this body is byte-for-byte the previous file's.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql`, which does NOT restore either of
-- these bodies and says why.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.anon_clear(p_organization_id uuid, p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_sub    custom.anon_submission;
  v_form   custom.anon_form;
  v_answer jsonb;
  v_truth  boolean;
  v_id     uuid;
  v_held   text;
  v_stood  boolean := false;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.anon_clear');
  select * into v_sub from custom.anon_submission
   where organization_id = p_organization_id and id = p_submission_id;
  if not found then return null; end if;
  if v_sub.state <> 'quarantined' then return v_sub.record_id; end if;

  select * into v_form from custom.anon_form
   where organization_id = p_organization_id and id = v_sub.form_id;

  if v_form.quarantine_rule_id is null then
    -- No Rule means no automatic clearing. Staying quarantined is the correct answer, not a
    -- failure — and it is what makes "closed by default" true all the way through.
    return null;
  end if;

  -- The SAME evaluator every other Rule uses. A second "is this submission ok" mechanism would
  -- be the first one to disagree with the Rule the organization actually wrote.
  v_answer := custom.rule_run(p_organization_id, v_form.quarantine_rule_id, v_sub.payload,
                              jsonb_build_object('source', v_sub.source,
                                                 'origin', v_sub.remote_origin,
                                                 'form_id', v_sub.form_id));
  -- `custom.rule_run` answers an ENVELOPE — {rule_id, rule_version, rule_name, kind,
  -- answer} — and the truth is under `answer`.
  v_truth := custom.rule_truth(v_answer -> 'answer');

  if v_truth is null then
    -- UNDECIDED IS NOT NO. A Rule whose leaves nobody answered has not refused anything,
    -- so the submission waits for a person instead of being turned away in their name.
    update custom.anon_submission
       set rejection_reason = format(
             'The form''s rule "%s" could not decide this submission, so it is waiting for a person rather than being turned away.',
             coalesce(v_answer ->> 'rule_name', 'accept'))
     where organization_id = p_organization_id and id = p_submission_id;
    return null;
  end if;

  if not v_truth then
    update custom.anon_submission
       set state = 'rejected',
           rejection_reason = coalesce(v_answer ->> 'why',
             format('The form''s rule "%s" did not admit this submission.',
                    coalesce(v_answer ->> 'rule_name', 'accept')))
     where organization_id = p_organization_id and id = p_submission_id;
    return null;
  end if;

  -- ── AGT-N-5: THE PRINCIPAL OF AN UNATTENDED RUN IS THE PERSON WHO SET IT UP ──────
  -- Only when there is NO principal at all, and only to the publisher — whom
  -- custom.anon_publish already required to hold ADMIN on this Table. A signed-in
  -- caller (the triage screen) keeps their own, so nothing about that path moves.
  if custom.query_principal() is null and v_form.published_by is not null then
    v_held := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims',
                       jsonb_build_object('sub', v_form.published_by,
                                          'role', 'authenticated')::text,
                       true);
    v_stood := true;
  end if;

  -- Cleared: NOW it becomes a record, through the ONE write door, with `_actor` from the
  -- store's own closed vocabulary and `_source` saying where it really came from — so the
  -- record answers "a stranger, through this form, at this moment" forever, without a
  -- word the vocabulary does not have and without joining anything.
  begin
    v_id := custom.record_write(
              p_organization_id, v_sub.table_id,
              v_sub.payload
                || jsonb_build_object('_actor', 'system')
                || jsonb_build_object('_source', jsonb_build_object(
                     'via',          coalesce(v_sub.source, 'anonymous'),
                     'form_id',      v_sub.form_id,
                     'form_version', v_form.version,
                     'submission_id', v_sub.id,
                     'origin',       v_sub.remote_origin,
                     'at',           to_char(now() at time zone 'utc',
                                             'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  exception when others then
    -- THE STAND-IN IS PUT BACK EVEN WHEN THE WRITE FAILS. A door that left a session
    -- impersonating somebody because a validation raised would be a far worse defect
    -- than the one this block exists to fix.
    if v_stood then
      perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
    end if;
    raise;
  end;
  if v_stood then
    perform set_config('request.jwt.claims', coalesce(v_held, ''), true);
  end if;

  update custom.anon_submission
     set state = 'cleared', record_id = v_id, cleared_at = now(),
         cleared_by_rule_id = v_form.quarantine_rule_id
   where organization_id = p_organization_id and id = p_submission_id;
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and submission_id = p_submission_id;
  return v_id;
end;
$fn$;
