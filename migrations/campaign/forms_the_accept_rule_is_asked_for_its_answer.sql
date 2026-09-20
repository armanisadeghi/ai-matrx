-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.anon_clear(uuid, uuid) 6b898e34a584009568631746d710b3f67a8370e72be25025965b1cd3e48b2815
--
-- LANE FORMS — A ONE-WORD DEFECT THAT MADE THE WHOLE ANONYMOUS DOOR UNUSABLE.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, with a real published form and a real
-- accept Rule that says "every required answer is there":
--
--   custom.rule_run(org, rule, {full_name, date_of_birth, mobile})
--     → {"kind":"predicate","answer":true,"rule_id":…,"rule_name":…,"rule_version":1}
--   custom.rule_truth(that whole object)   → NULL
--   custom.rule_truth(that object->'answer') → true
--
-- `custom.rule_truth` answers NULL for anything that is not a JSON boolean, and
-- `custom.rule_run` answers an ENVELOPE whose boolean lives under `answer`.
-- `custom.anon_clear` handed it the envelope:
--
--     if not coalesce(custom.rule_truth(v_answer), false) then   -- always TRUE
--       update … set state = 'rejected', rejection_reason = …
--
-- so EVERY anonymous submission was rejected with "The form's rule did not admit this
-- submission", whatever the Rule said, and `record_id` could never stop being null.
-- Quarantine with no exit is not a strict default; it is a door that does not open.
--
-- THE CLASS, AND THE CENSUS THAT CLOSES IT. Ten call sites read `custom.rule_truth` on
-- this database. NINE of them already write `-> 'answer'` —
-- `custom._record_rule_uses`, `custom.record_applicability`, `custom.resolve_first_match`,
-- `custom.rule_applies`, `custom.rule_members`, `custom.rule_membership` and the three
-- inside `custom.rule_eval`, which hand it a bare `rule_eval` result (a value, not an
-- envelope) and are correct as they stand. `custom.anon_clear` was the only one reading
-- the envelope, so the convention was already right everywhere else and this is the one
-- instance of it — measured, not assumed:
--
--   select n.nspname||'.'||p.proname||' :: '||btrim(ln)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     cross join lateral unnest(string_to_array(pg_get_functiondef(p.oid), chr(10))) ln
--    where p.prokind = 'f' and p.proname <> 'rule_truth' and ln like '%rule_truth%';
--
-- WHY THE FIX IS NOT JUST THE ONE WORD. An UNDECIDED Rule — `custom.rule_truth`'s own
-- third answer, which it gives for a test whose leaves nobody has answered — was being
-- read as "no". Undecided is not false anywhere else in this store (the rule evaluator
-- says so in as many words, and `FormRunner` shows a question whose condition is
-- undecided rather than skipping past it), so a submission an accept Rule cannot decide
-- now STAYS QUARANTINED for a person instead of being rejected in their name. The three
-- outcomes are now three outcomes: true clears it, false rejects it with the Rule's own
-- sentence, undecided holds it and says why.
--
-- Everything else in this body is byte-for-byte what was there: the same door, the same
-- organization match, the same `custom.record_write`, the same `custom.anon_replay`
-- update, the same early returns.
--
-- THE INVERSE: `migrations/inverse/forms_down.sql` does NOT restore this — restoring a
-- function that rejects every submission is not a rollback anybody wants, and the file
-- says so there.

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
  -- answer} — and the truth is under `answer`. Handing the envelope to
  -- `custom.rule_truth` returns NULL for every Rule that ever existed, which read as
  -- "refused" and rejected every submission this door was ever given.
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

  -- Cleared: NOW it becomes a record, through the ONE write door, with its source stamped so
  -- the record itself can always say it came from a stranger.
  v_id := custom.record_write(p_organization_id, v_sub.table_id,
                              v_sub.payload || jsonb_build_object('_actor', 'anonymous'));

  update custom.anon_submission
     set state = 'cleared', record_id = v_id, cleared_at = now(),
         cleared_by_rule_id = v_form.quarantine_rule_id
   where organization_id = p_organization_id and id = p_submission_id;
  update custom.anon_replay set record_id = v_id
   where organization_id = p_organization_id and submission_id = p_submission_id;
  return v_id;
end;
$fn$;
