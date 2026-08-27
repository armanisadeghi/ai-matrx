-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- hr_l3_47_unable_reason_scoped_by_ppe_target.sql — lane L3 / HRB-015, 2026-08-27. U2 follow-up.
--
-- ✅ APPLIED AND VERIFIED LIVE. `hr.pay_period_get` on the real G2V Window row 3a71adf6 now answers
--    attestation_outcome = 'not_attested', unable_reason = 'no_login', attested_at = NULL,
--    manager_approved_at = 2026-08-27T11:35:56Z.
--
-- 🚨 THE BUG hr_l3_46 SHIPPED, found when it was applied: `unable_reason` came back NULL on the
-- exact row the answer exists for.
--
--   the row's resolved instance is 8529b285 (timecard_approval, closed) → 0 reason-bearing failures
--   the reason lives on           470e7247 (timecard_attestation, closed) → 2 reason-bearing failures
--
-- `i` — the lateral that classifies `health` — resolves ONE instance per row, ordered
-- `is_open desc, created_at desc`. On an APPROVED row that is the approval instance, because the
-- attestation instance closed first. Scoping the reason lookup to `i` therefore asked the approval
-- flow why the employee could not attest, and got silence.
--
-- 🚨 THE DESIGN CORRECTION, and it is the general lesson rather than a patch: **"why couldn't they
-- act" is a question about the TIMECARD, not about one instance.** It belongs to whichever instance
-- on that pay_period_employment holds the answer. So the lookup is scoped by the PPE TARGET across
-- every bound instance. `health` still resolves one instance — that is correct, because "is this
-- row's flow alive" genuinely is a question about the current flow.
--
-- ORDERING, DELIBERATELY, AND IT DEVIATES FROM "MOST-RECENT-RELEVANT":
--   1. the attestation flow first — the question is why they could not ATTEST;
--   2. then EARLIEST, because earliest is the ROOT cause.
-- On the live row the earliest is `no_login` at 10:09 — a durable fact about the person — while the
-- later `excluded_by_caller` at 11:23 is a consequence of retrying against that same root cause.
-- Most-recent would surface the symptom and hide the cause, and would render "they are excluded
-- from deciding their own record" to a manager whose actual problem is that the employee has no
-- login at all.
--
-- Read-path only: one lateral rewritten inside a jsonb projection. No table written, no grants
-- changed, `health` untouched.
--
-- NOTE ON ASSERTIONS: this file deliberately does NOT assert by calling `hr.pay_period_get`. That
-- reader refuses when `auth.uid()` is null, which it always is inside a migration — an assertion
-- written that way passes or fails for the wrong reason. (The first draft of this file did exactly
-- that and rolled itself back on a false negative.) The live-row check is run separately, under an
-- authenticated session, and its result is recorded at the top of this file.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_def text; v_new text;
  l_old constant text := $q$                  left join lateral (
                    -- WHY the subject could not act, e.g. 'no_login'. ANY state on purpose: a
                    -- resolved failure still explains why nobody could ever attest, and that
                    -- explanation is the entire point of the sentence this feeds.
                    select wf.detail -> 'refused' -> 0 ->> 'why' as unable_reason
                      from hr.workflow_failure wf
                     where wf.workflow_instance_id = i.id
                       and wf.detail -> 'refused' -> 0 ->> 'why' is not null
                     order by wf.occurred_at asc limit 1) fr on true$q$;
  l_new constant text := $q$                  left join lateral (
                    -- WHY the subject could not act, e.g. 'no_login'.
                    --
                    -- SCOPED BY THE PPE TARGET, across EVERY instance bound to this timecard --
                    -- not by `i`, the single resolved instance. `i` resolves to the newest/open
                    -- binding, which on an approved row is the APPROVAL instance; the reason the
                    -- employee could never attest sits on the ATTESTATION instance. Scoping to `i`
                    -- returned NULL on exactly the rows the answer exists for.
                    --
                    -- ANY failure state on purpose: a RESOLVED failure still explains why nobody
                    -- could ever attest, and that explanation is the whole point of this field.
                    --
                    -- Ordering, deliberately: the attestation flow first (the question is why they
                    -- could not ATTEST), then EARLIEST. Earliest is the ROOT cause -- on the live
                    -- row that is 'no_login' at 10:09, a durable fact about the person, rather than
                    -- the 'excluded_by_caller' at 11:23 which is a consequence of retrying against
                    -- that same root cause. Most-recent would surface the symptom and hide the cause.
                    select wf.detail -> 'refused' -> 0 ->> 'why' as unable_reason
                      from hr.workflow_binding b2
                      join hr.workflow_instance wi2 on wi2.id = b2.workflow_instance_id
                      join hr.workflow_failure wf on wf.workflow_instance_id = wi2.id
                     where b2.target_token = 'hr_pay_period_employment'
                       and b2.target_id = ppe.id
                       and wf.detail -> 'refused' -> 0 ->> 'why' is not null
                     order by (wi2.flow_key = 'timecard_attestation') desc, wf.occurred_at asc
                     limit 1) fr on true$q$;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if v_def is null then raise exception 'hr.pay_period_get does not exist'; end if;

  -- Idempotent.
  if position('b2.target_id = ppe.id' in v_def) > 0 then
    raise notice 'unable_reason is already scoped by the ppe target';
    return;
  end if;
  if position(l_old in v_def) = 0 then
    raise exception 'the instance-scoped lateral does not match; re-derive rather than force';
  end if;

  v_new := replace(v_def, l_old, l_new);
  execute v_new;
end $$;

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';

  if position('b2.target_id = ppe.id' in v_src) = 0 then
    raise exception 'ASSERTION FAILED: unable_reason is still scoped to a single instance';
  end if;
  -- `health` must be untouched: the open/retrying lateral that feeds `stuck` still exists.
  if position($q$where wf.workflow_instance_id = i.id and wf.state in ('open','retrying')$q$ in v_src) = 0 then
    raise exception 'ASSERTION FAILED: the open/retrying lateral that feeds health was lost';
  end if;
  raise notice 'OK: unable_reason scoped by ppe target; health classification untouched';
end $$;
