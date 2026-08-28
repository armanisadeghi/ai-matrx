-- HR domain C4 — migration 32 (register item HRB-008; closes D281 on the coordinator's ruling).
--
-- 🚨 THE LAST UNMAPPED TARGET OF AN ACTIVE FLOW, AND THE RULE THAT DECIDES THE NEXT ONE.
--
-- `hr.asset_assignment` (the `expense_or_asset_recovery` flow's target) carries TWO foreign keys
-- into `hr.employment`, which is why hr_c4_27 stopped rather than choosing:
--
--   employment_id               → the worker the asset was issued TO
--   assigned_by_employment_id   → the person who issued it
--
-- RULED (coordinator, 2026-08-28): **`employment_id`.**
--
-- THE BASIS, recorded here so the next two-FK table gets the same test rather than another round
-- trip: **the approval subject is whom the action is ABOUT, never who performed it.** An asset
-- recovery is about the worker holding the asset. `assigned_by_employment_id` is an ACTOR column,
-- the same family as `created_by` — and the whole subject/actor distinction this engine rests on
-- collapses if an actor column can be a subject: never-approve-yourself tests the SUBJECT
-- (§2.2 eligible() rule 1), and authority resolves over the SUBJECT's scope and chain
-- (§2.1 `population_contains`, §2.2's rungs). Point either at the issuer and the person who handed
-- out a laptop becomes the person whose recovery is being approved, with their manager's authority
-- deciding it.
--
-- The same test already decided `hr.checklist_item` → `assignee_employment_id` (whom it is about)
-- over its actor columns, so this is the existing rule stated out loud, not a new one.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE BASIS LIVES IN THE ALLOWLIST, NOT ONLY IN THIS HEADER. A migration header is read once, by
--    whoever is looking for it. The next person choosing between two employment FKs is reading
--    `hr._approval_subject`, so the one-sentence test goes there, beside the entries it governs.
--
-- 2. NOTHING ELSE MOVES. One `when` branch. Every table already mapped keeps its column, the
--    subject-less group (`hr.requisition`, `hr.offer`, `hr.schedule`, `esign.envelope`) keeps its
--    NULL, and the `!unknown` raise still guards everything unlisted — which is what
--    RECORDED DECISION 5 and hr_c4_25/26/28/29's door guards turn into a named refusal.
--
-- 3. THE PROOF'S NAMED EXCEPTION IS RETIRED IN THE SAME BREATH. `hrb008_proof.py` asserted that
--    exactly one active flow target was unmapped and named it, so the open ruling was visible rather
--    than hidden. With the ruling landed, that assertion becomes "every active flow's target maps,
--    with no exceptions" — the exception list shrinks by deletion, the way check 26's and check 28's
--    allowlists did.
--
-- Authority: coordinator ruling 2026-08-28; SPEC-WORKFLOW-ENGINE §2.2 (eligible() rule 1 and the
-- rungs, both subject-scoped), §2.1 (authority scope over the subject); SPEC-ACCESS §1.4.
-- Applied live as `hr_c4_32_asset_assignment_subject_ruled`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_32_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$    -- exactly ONE FK into hr.employment on this table, so there is nothing to choose between
    when 'hr.shift'                 then 'employment_id'$o$;
  v_rep constant text := $o$    -- exactly ONE FK into hr.employment on this table, so there is nothing to choose between
    when 'hr.shift'                 then 'employment_id'
    -- 🚨 THE TEST FOR A TABLE WITH TWO EMPLOYMENT FKs, and it decides this one:
    -- THE SUBJECT IS WHOM THE ACTION IS ABOUT, NEVER WHO PERFORMED IT.
    -- hr.asset_assignment has both `employment_id` (the worker holding the asset) and
    -- `assigned_by_employment_id` (who issued it). An actor column can never be the subject: this
    -- engine's whole subject/actor distinction rests on it — never-approve-yourself tests the
    -- SUBJECT (§2.2 rule 1) and authority resolves over the SUBJECT's scope and chain (§2.1). Point
    -- one at the issuer and the person who handed out a laptop becomes the person whose recovery is
    -- being approved, judged by THEIR manager. Same test already chose hr.checklist_item's
    -- `assignee_employment_id` over its actor columns. (Coordinator ruling, 2026-08-28.)
    when 'hr.asset_assignment'      then 'employment_id'$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_approval_subject';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$when 'hr.asset_assignment'$chk$ in v_def) > 0 then
    raise notice 'hr_c4_32: the allowlist already carries hr.asset_assignment';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_32: hr._approval_subject does not carry hr_c4_27''s hr.shift entry — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_32: hr.asset_assignment -> employment_id (subject = whom the action is about)';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer; v_res jsonb; v_unmapped text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_approval_subject';

  -- the ruling, and the ACTOR column explicitly not chosen
  if v_src !~ 'when ''hr\.asset_assignment''\s+then ''employment_id''' then
    raise exception 'hr_c4_32: hr.asset_assignment is not mapped to employment_id';
  end if;
  if v_src ~ 'then ''assigned_by_employment_id''' then
    raise exception 'hr_c4_32: an ACTOR column was chosen as an approval subject';
  end if;
  -- RD 1: the basis is recorded where the next chooser will read it
  if v_src !~ 'NEVER WHO PERFORMED IT' then
    raise exception 'hr_c4_32: the ruling''s basis is not recorded in the allowlist itself';
  end if;

  -- it actually resolves, and to the right column
  begin
    perform hr._approval_subject('hr.asset_assignment', gen_random_uuid());
  exception when others then
    raise exception 'hr_c4_32: hr._approval_subject still raises for hr.asset_assignment (%)', sqlerrm;
  end;

  -- 🚨 THE BOARD: every active flow's target now maps. No exceptions left to name.
  -- Each target is CALLED, not read: the whole point is whether _approval_subject raises for it.
  -- `v_unmapped` is declared in this block's own DECLARE, never inside the per-target handler —
  -- the hr_c4_25/26 scope lesson, one migration old.
  declare r record; v_tbl text;
  begin
    for r in select distinct target_token as tok from hr.workflow_flow_type
              where deleted_at is null and is_active order by 1
    loop
      v_tbl := hr._wf_target_table(r.tok);
      continue when v_tbl is null;
      begin
        perform hr._approval_subject(v_tbl, gen_random_uuid());
      exception when others then
        v_unmapped := concat_ws(', ', v_unmapped, r.tok);
      end;
    end loop;
  end;
  if v_unmapped is not null and v_unmapped <> '' then
    raise exception 'hr_c4_32: active flow target(s) still unmapped: %', v_unmapped;
  end if;

  -- RECORDED DECISION 5 keeps a live control on a table that is not a flow target
  begin
    perform hr._approval_subject('hr.jurisdiction', gen_random_uuid());
    raise exception 'hr_c4_32: an unmapped target no longer raises — RD5 has no control left';
  exception
    when sqlstate '22023' then null;
    when others then if sqlerrm like 'hr_c4_32:%' then raise; end if;
  end;

  -- the door still returns envelopes, and every contract holds
  v_res := hr._wf_door_smoke();
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception 'hr_c4_32: the door smoke test failed: %', v_res;
  end if;
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_32: % function contract(s) broken', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_32_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_32: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
