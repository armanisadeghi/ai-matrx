-- HR domain C4 — migration 26 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 THE ACTUAL FRAME. hr_c4_25 guarded the pre-flight and the raise STILL escaped, because I had
-- guessed at which line threw instead of asking Postgres. Asking it settles it in one read:
--
--   PG CONTEXT: PL/pgSQL function _approval_subject(text,uuid) line 53 at RAISE
--               PL/pgSQL function wf_request(...) line 74 at assignment
--
-- Line 74 is the FIRST place the door touches the subject, long before any pre-flight:
--
--   v_subject := coalesce(p_subject_employment_id,
--                         hr._approval_subject(v_tbl, p_target_id),   -- ← raises here
--                         v_requester);
--
-- `hr._approval_subject` RAISES for a target table it cannot map (its message names
-- `hr.can_approve`, which is what sent me looking in the wrong place). So `hr.wf_request` throws an
-- exception out of the RPC — past the refusal-envelope law, past every caller — for any registered
-- flow whose target is not on that allowlist. Today that is `signature_request` / `esign_envelope`,
-- and it is what `hrb011_proof.py` aborts on at 106 assertions.
--
-- hr_c4_25's guard on the pre-flight stays: it is correct, it is the same condition, and a target
-- that maps at line 74 could still fail there. This adds the frame that actually fires first.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE SAME ENVELOPE, FROM ALL THREE LAYERS. `definition_invalid` with
--    `approval_subject_unmapped: hr.can_approve cannot resolve a subject for <table> (<sqlerrm>)` is
--    now what the door's subject resolution, the door's pre-flight, and the resolver
--    (RECORDED DECISION 5) all return. A caller cannot tell which caught it, and the three cannot
--    drift into three stories about one condition.
--
-- 2. 🚨 AN EXPLICIT SUBJECT IS STILL HONOURED, AND IS TRIED FIRST. `coalesce` already prefers
--    `p_subject_employment_id`, but `coalesce` evaluates its arguments eagerly enough that the
--    raise fired even when a caller HAD passed one. So the guarded lookup runs only when no
--    explicit subject was supplied — which means a caller who knows the subject can drive an
--    unmapped target perfectly well, and only a caller relying on the allowlist gets the refusal.
--    That is strictly more capability than before, not less.
--
-- 3. IT DOES NOT MAKE `signature_request` ROUTABLE, AND SAYS SO. It makes it fail HONESTLY. The
--    allowlist entry that would make it route is an unresolved design question reported to the
--    coordinator: `esign.envelope` has ZERO columns that FK to an employment, so there is nothing
--    to derive and nothing is guessed here.
--
-- 4. THE FAIL-CLOSED PATH IS FALSIFIED, NOT ASSUMED — the proof drives a genuinely unmapped target
--    and asserts the named refusal, so RECORDED DECISION 5 keeps a live control rather than being
--    quietly deleted by the very fix that stops it firing.
--
-- Authority: SPEC-WORKFLOW-ENGINE §2.2 RECORDED DECISION 5, §4.2 (the refusal-envelope law).
-- Applied live as `hr_c4_26_the_door_fails_closed_on_an_unmapped_subject`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_26_conf_before', v_bad::text, true);
end $$;

do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  v_subject := coalesce(p_subject_employment_id,
                        hr._approval_subject(v_tbl, p_target_id),
                        v_requester);$o$;
  v_rep constant text := $o$  -- 🚨 THE FIRST PLACE THE DOOR TOUCHES THE SUBJECT, AND IT MUST NOT THROW.
  -- hr._approval_subject RAISES for a target table it cannot map, so an unguarded call here threw
  -- an exception out of hr.wf_request for any registered flow whose target is off that allowlist —
  -- past the refusal-envelope law and past every caller. It now returns the SAME named refusal the
  -- resolver's RECORDED DECISION 5 gives, so all three layers tell one story.
  -- An explicit subject is honoured first and never needs the allowlist at all.
  if p_subject_employment_id is not null then
    v_subject := p_subject_employment_id;
  else
    declare v_looked uuid;
    begin
      v_looked := hr._approval_subject(v_tbl, p_target_id);
    exception when others then
      return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
        'detail', format('approval_subject_unmapped: hr.can_approve cannot resolve a subject for %s (%s)',
                         v_tbl, sqlerrm),
        'flow_key', p_flow_key, 'target_token', p_target_token,
        'remedy', 'Add this target table to hr._approval_subject''s allowlist together with the column that names its subject employment, or pass p_subject_employment_id explicitly.');
    end;
    v_subject := coalesce(v_looked, v_requester);
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  v_def := pg_get_functiondef(v_oid);
  if position($chk$THE FIRST PLACE THE DOOR TOUCHES THE SUBJECT$chk$ in v_def) > 0 then
    raise notice 'hr_c4_26: the door already fails closed on an unmapped subject';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_26: hr.wf_request does not carry the expected subject assignment — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_26: hr.wf_request now refuses instead of raising on an unmapped subject';
  end if;
end
$mig$;

-- ============================================================ post-conditions
do $$
declare v_src text; v_bad integer; v_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_src !~ 'THE FIRST PLACE THE DOOR TOUCHES THE SUBJECT' then
    raise exception 'hr_c4_26: the subject lookup is still unguarded';
  end if;
  -- RD 2: an explicit subject is still preferred, and skips the allowlist entirely
  if v_src !~ 'if p_subject_employment_id is not null then' then
    raise exception 'hr_c4_26: an explicitly-supplied subject is no longer honoured first';
  end if;
  -- RD 1: all three layers say the same thing
  if v_src !~ 'approval_subject_unmapped' then
    raise exception 'hr_c4_26: the door does not use the resolver''s reason';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'approval_subject_unmapped' then
    raise exception 'hr_c4_26: RECORDED DECISION 5 was lost from the resolver';
  end if;
  -- hr_c4_25's pre-flight guard stays
  if (select count(*) from regexp_matches(v_src, 'approval_subject_unmapped', 'g')) < 2 then
    raise exception 'hr_c4_26: hr_c4_25''s pre-flight guard was lost';
  end if;

  -- hr_c4_21..24 still in force
  if v_src !~ 'WF_NO_POSSIBLE_APPROVER' then
    raise exception 'hr_c4_26: hr_c4_21''s pre-flight was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_submit') !~ 'target_pinned' then
    raise exception 'hr_c4_26: hr_c4_24''s digest re-pin was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_26: % engine function(s) touch hr.privileged_write directly', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_26_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_26: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
end $$;
