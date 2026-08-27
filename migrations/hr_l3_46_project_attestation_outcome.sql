-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- hr_l3_46_project_attestation_outcome.sql — lane L3 / HRB-015, 2026-08-27. Finding U2.
--
-- ✅ APPLIED. (The authoring session's two attempts were refused by the permission classifier; it
-- was applied afterwards by an approved hand.)
--
-- 🚨 THIS FILE SHIPPED A BUG — see `hr_l3_47_unable_reason_scoped_by_ppe_target.sql`, which fixes
-- it and must be applied alongside. The `unable_reason` lateral below is scoped to `i`, the single
-- resolved instance, which on an APPROVED row is the approval instance — while the reason the
-- employee could never attest lives on the ATTESTATION instance. So `unable_reason` came back NULL
-- on exactly the rows the answer exists for. Do not apply this file without 47.
--
-- 🚨 THE DEFECT. An APPROVED period renders "Employee attested 0 / Manager approved 1" and leaves a
-- manager to work out BY SUBTRACTION that pay was released on a timecard its subject never
-- confirmed. SPEC-TIME §7.1's ruling exists precisely to make that case safe — a missed attestation
-- *"auto-closes as not_attested and is flagged to the manager. NEVER silently attested"* — and a
-- ruling whose outcome is invisible on the screen where money is released is not in force.
--
-- 🚨 THE RECORD ALREADY HOLDS THE TRUTH; ONLY THE READER IS SILENT.
-- `hr.pay_period_employment` carries, verified live on row 3a71adf6 of G2V Window Biweekly:
--     metadata.attestation_outcome   = 'not_attested'
--     metadata.attestation_note      = 'The attestation deadline passed with no action from the
--                                       employee. The step was closed as not_attested and flagged
--                                       to the manager. NOTHING here attested on their behalf.'
--     metadata.attestation_closed_at = 2026-08-27T11:35:56Z
--     attested_at                    = NULL
--     manager_approved_at            = 2026-08-27T11:35:56Z
-- and the reason the subject could never act is in the flow's own failure detail:
--     workflow_failure.detail->'refused'->0->>'why' = 'no_login'
--
-- None of that is projected by `hr.pay_period_get`, so no client can say it. This adds the six
-- fields to the workflow block's per-row projection. It is a READ-PATH change only: no table is
-- written, no data modified, no grant touched.
--
-- 🚨 WHY THE CLIENT MUST NOT INFER THIS INSTEAD. `counts.attested = 0` beside `approved = 1` looks
-- like proof and is not: those are CURRENT-state counts, so a row that attested and was then
-- approved has LEFT `attested` and ENTERED `approved`. Inferring "never attested" from them would
-- be a guess dressed as a fact, and on this particular screen the guess is about whether somebody
-- confirmed the hours they were paid for. The outcome is read from the record, or it is not shown.
--
-- 🚨 `health` IS DELIBERATELY UNCHANGED. The open/retrying failure lateral that feeds `stuck` is
-- untouched. The new lateral looks at failures of ANY state, and only to explain WHY the subject
-- could not act — a RESOLVED failure still explains that, which is exactly the live case here.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_def text; v_new text;
  k_old constant text := $q$                          'failure_class', h.failure_class,
                          'failure_id', h.failure_id) order by h.health, h.employment_id), '[]'::jsonb))$q$;
  k_new constant text := $q$                          'failure_class', h.failure_class,
                          'failure_id', h.failure_id,
                          -- U2: the outcome, READ from the record — never inferred by a client.
                          'attestation_outcome', h.attestation_outcome,
                          'attestation_note', h.attestation_note,
                          'attestation_closed_at', h.attestation_closed_at,
                          'attested_at', h.attested_at,
                          'manager_approved_at', h.manager_approved_at,
                          'unable_reason', h.unable_reason) order by h.health, h.employment_id), '[]'::jsonb))$q$;
  s_old constant text := $q$                select ppe.id as ppe_id, ppe.employment_id, ppe.state as row_state,
                       i.flow_key, i.id as instance_id, i.state as instance_state,
                       f.failure_class, f.id as failure_id,$q$;
  s_new constant text := $q$                select ppe.id as ppe_id, ppe.employment_id, ppe.state as row_state,
                       i.flow_key, i.id as instance_id, i.state as instance_state,
                       f.failure_class, f.id as failure_id,
                       ppe.metadata ->> 'attestation_outcome'   as attestation_outcome,
                       ppe.metadata ->> 'attestation_note'      as attestation_note,
                       ppe.metadata ->> 'attestation_closed_at' as attestation_closed_at,
                       ppe.attested_at, ppe.manager_approved_at,
                       fr.unable_reason,$q$;
  l_old constant text := $q$                     order by wf.occurred_at desc limit 1) f on true$q$;
  l_new constant text := $q$                     order by wf.occurred_at desc limit 1) f on true
                  left join lateral (
                    -- WHY the subject could not act, e.g. 'no_login'. ANY state on purpose: a
                    -- resolved failure still explains why nobody could ever attest, and that
                    -- explanation is the entire point of the sentence this feeds.
                    select wf.detail -> 'refused' -> 0 ->> 'why' as unable_reason
                      from hr.workflow_failure wf
                     where wf.workflow_instance_id = i.id
                       and wf.detail -> 'refused' -> 0 ->> 'why' is not null
                     order by wf.occurred_at asc limit 1) fr on true$q$;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if v_def is null then raise exception 'hr.pay_period_get does not exist'; end if;

  -- Idempotent: a second apply finds the projection already in place and does nothing.
  if position('attestation_outcome' in v_def) > 0 then
    raise notice 'hr.pay_period_get already projects the attestation outcome';
    return;
  end if;

  if position(k_old in v_def) = 0 or position(s_old in v_def) = 0 or position(l_old in v_def) = 0 then
    raise exception
      'hr.pay_period_get''s workflow block does not match what this migration expects — the body changed underneath it; re-derive the replacement rather than forcing it';
  end if;

  v_new := replace(v_def, k_old, k_new);
  v_new := replace(v_new, s_old, s_new);
  v_new := replace(v_new, l_old, l_new);
  execute v_new;
end $$;

-- ── Assertions. A migration that cannot fail proves nothing. ────────────────────────────────────
do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';

  if position('attestation_outcome' in v_src) = 0 then
    raise exception 'ASSERTION FAILED: attestation_outcome is not projected';
  end if;
  if position('unable_reason' in v_src) = 0 then
    raise exception 'ASSERTION FAILED: unable_reason is not projected';
  end if;
  -- The classification that feeds `stuck` must survive untouched.
  if position($q$and wf.state in ('open','retrying')$q$ in v_src) = 0 then
    raise exception 'ASSERTION FAILED: the open/retrying lateral that feeds health was lost';
  end if;
  raise notice 'OK: attestation outcome projected; health classification untouched';
end $$;
