-- HR domain C4 — migration 27 (register item HRB-008 follow-up; closes D281's derivable half).
--
-- 🚨 THREE ACTIVE FLOWS TARGET TABLES `hr._approval_subject` REFUSES TO MAP, SO THEY RAISE.
-- Measured across every active flow type's target table:
--
--   esign_envelope        esign.envelope           RAISES   ← signature_request
--   hr_shift              hr.shift                 RAISES   ← open_shift_claim, calloff_replacement
--   hr_asset_assignment   hr.asset_assignment      RAISES   ← expense_or_asset_recovery
--   (every other active flow's target maps)
--
-- DERIVED, NOT GUESSED — and two of the three came out clean.
--
-- ===================================================================================
-- 1. `esign.envelope` → NULL. THE ESIGN LANE ALREADY WROTE THE CONTRACT DOWN.
--
-- `esign.envelope` has **zero** columns that FK to an employment (its FKs are category,
-- certificate, created_by, organization, reopened_from, superseded_by, updated_by). The signers
-- live on a child table, `esign.envelope_signer`, which can hold MANY per envelope and whose own
-- subject pointer (`subject_ref_type`/`subject_ref_id`) is polymorphic, nullable and un-FK'd.
-- On the schema alone this is the coordinator's STOP condition — zero derivable columns.
--
-- But it is not ambiguous, because the governing lane already asserts the answer in its own proof
-- (`scripts/hr/hrb011_proof.py`, section I — *"THE WORKFLOW HOOK DOES NOT FORGE A SIGNATURE"*):
--
--   rec("I workflow", "hr._approval_subject resolves esign.envelope without raising",
--       "select hr._approval_subject('esign.envelope', $1) is null", env, "NULL subject")
--
-- **An envelope has no subject employment, and must resolve to NULL without raising.** That is
-- exactly the case this function already models for `hr.requisition`, `hr.offer` and `hr.schedule`,
-- in its own words: *"a target with no subject employment at all … There is nobody to be, so rule 1
-- cannot fire and the resolver returns NULL."* An envelope joins that group; nothing is invented.
--
-- ===================================================================================
-- 2. `hr.shift` → `employment_id`. EXACTLY ONE FK, so the coordinator's rule decides it.
--
-- `hr.shift` has precisely one foreign key into `hr.employment` (`employment_id`) and no other
-- employment-shaped column. One candidate, so it is the answer and this proceeds.
--
-- ===================================================================================
-- 3. 🚨 `hr.asset_assignment` IS **NOT** DONE HERE — TWO CANDIDATES, SO IT STOPS AND IS REPORTED.
--
-- It carries TWO FKs into `hr.employment`: `employment_id` and `assigned_by_employment_id`. That is
-- the coordinator's explicit "more than one → STOP" case and it is not resolved by this file.
-- (For the record, my reading is `employment_id` — the person who HAS the asset — because
-- `assigned_by_*` is an actor-provenance column of the same family as `created_by`, and the
-- existing `hr.checklist_item` entry already picks the about-whom column, `assignee_employment_id`,
-- over the actor. But the rule was written to catch exactly this shape, and the subject of a
-- RECOVERY action being the wrong person is not a mistake worth saving one round-trip on.)
-- Until it is ruled, `expense_or_asset_recovery` stays unroutable — and now fails CLOSED with a
-- named refusal rather than raising, thanks to hr_c4_25/26.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE FAIL-CLOSED PATH KEEPS A LIVE CONTROL. Mapping these two removes two of the three tables
--    that could demonstrate RECORDED DECISION 5, so the proof's control moves to a table that is
--    not a flow target at all and never will be — the guarantee is falsified against something the
--    next fix cannot accidentally delete.
--
-- 2. THIS TOUCHES THE ACCESS LANE'S FUNCTION, DELIBERATELY AND NARROWLY. `hr._approval_subject` is
--    SPEC-ACCESS's. Two rows are added to its allowlist and nothing else changes — no signature, no
--    behaviour for any table already mapped, no raise removed. Recorded here so the access lane can
--    see exactly what moved and why.
--
-- Authority: SPEC-ACCESS §1.4 (the subject predicate), SPEC-WORKFLOW-ENGINE §2.2 RECORDED
-- DECISION 5, and `hrb011_proof.py` section I for the esign contract.
-- Applied live as `hr_c4_27_approval_subject_allowlist_esign_and_shift`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_27_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    when 'hr.schedule'              then null
    else '!unknown'$o$;
  v_rep constant text := $o$    when 'hr.schedule'              then null
    -- 🚨 AN ENVELOPE HAS NO SUBJECT EMPLOYMENT, AND THAT IS THE CONTRACT, NOT A GAP. Zero of its
    -- columns FK to an employment; its signers live on a child table that holds MANY per envelope
    -- and whose own subject pointer is polymorphic and un-FK'd. The esign lane asserts exactly this
    -- in hrb011_proof.py section I ("THE WORKFLOW HOOK DOES NOT FORGE A SIGNATURE"):
    -- `hr._approval_subject('esign.envelope', …) is null`, without raising. Same group as
    -- requisition / offer / schedule above: there is nobody to be, so rule 1 cannot fire.
    when 'esign.envelope'           then null
    -- exactly ONE FK into hr.employment on this table, so there is nothing to choose between
    when 'hr.shift'                 then 'employment_id'
    else '!unknown'$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_approval_subject';
  if v_oid is null then raise exception 'hr_c4_27: hr._approval_subject does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$when 'esign.envelope'$chk$ in v_def) > 0 then
    raise notice 'hr_c4_27: the allowlist already carries esign.envelope';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_27: hr._approval_subject does not carry the expected allowlist tail — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_27: esign.envelope (NULL subject) and hr.shift (employment_id) added to the allowlist';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_sub uuid;
begin
  -- 1. the esign contract, exactly as hrb011 states it: resolves, and resolves to NULL
  begin
    v_sub := hr._approval_subject('esign.envelope', gen_random_uuid());
  exception when others then
    raise exception 'hr_c4_27: hr._approval_subject still raises for esign.envelope (%)', sqlerrm;
  end;
  if v_sub is not null then
    raise exception 'hr_c4_27: esign.envelope resolved a subject employment; the contract is NULL';
  end if;

  -- 2. hr.shift maps, and to the one column that exists
  begin
    perform hr._approval_subject('hr.shift', gen_random_uuid());
  exception when others then
    raise exception 'hr_c4_27: hr._approval_subject still raises for hr.shift (%)', sqlerrm;
  end;
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_approval_subject';
  if v_src !~ 'when ''hr\.shift''\s+then ''employment_id''' then
    raise exception 'hr_c4_27: hr.shift is not mapped to employment_id';
  end if;

  -- 3. 🚨 RD 1 — THE FAIL-CLOSED PATH STILL FIRES. Falsified against a table that is not a flow
  -- target and never will be, so the next allowlist entry cannot quietly delete this control.
  begin
    perform hr._approval_subject('hr.jurisdiction', gen_random_uuid());
    raise exception 'hr_c4_27: an unmapped target no longer raises — RECORDED DECISION 5 has no control left';
  exception
    when sqlstate '22023' then null;   -- the named refusal, as designed
    when others then
      if sqlerrm like 'hr_c4_27:%' then raise; end if;
  end;

  -- 4. the STOP case is untouched and still fails closed at the door
  if v_src ~ 'asset_assignment' then
    raise exception 'hr_c4_27: hr.asset_assignment was mapped despite two candidate columns — that is the coordinator''s ruling to make';
  end if;

  -- hr_c4_25/26's guards are still in place, so an unmapped target refuses rather than raising
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if (select count(*) from regexp_matches(v_src, 'approval_subject_unmapped', 'g')) < 2 then
    raise exception 'hr_c4_27: hr_c4_25/26''s fail-closed guards were lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_27_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_27: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
