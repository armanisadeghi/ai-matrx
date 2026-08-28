-- HR domain C4 — migration 52 (HRB-001 completeness item 1; SPEC-NOTIFICATIONS §5).
--
-- 🚨 `record_notification_outcome` WORKS AND NOTHING HAS EVER CALLED IT — 0 producers, 0/498 rows.
--
-- §5: *"`outcome` is set by the PRODUCER, not the spine: `decided` (an approval decision was
-- recorded), `acknowledged` (an acknowledgment/attestation completed), `ignored` (the window closed
-- with no action), `superseded` (the object changed and a newer notice replaced this one),
-- `undeliverable` (every channel dead-lettered)."* Every one of those five is a real event this
-- engine already reaches — none of them was wired. §6.1's lifecycle
-- (`… ▸ read_at ▸ acted_at ▸ outcome/outcome_at`) therefore stopped one column short of its end.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 THE PUBLIC DOOR CANNOT BE THE PRODUCER PATH, AND THAT IS WHY THERE WERE NO PRODUCERS.
--    `communication.record_notification_outcome` authorizes on
--    `recipient_user_id = auth.uid() OR created_by = auth.uid() OR is_platform_admin()` — correct
--    for a human recording their own outcome, but three of the five producers are the ENGINE acting
--    on somebody ELSE's notice: the sweep closing an employee's window, a requester's edit
--    superseding a prior approver's notice, the worker dead-lettering. So this adds
--    `communication._set_notification_outcome` — the same write and the same vocabulary, with no
--    caller check, revoked from every client role and callable only from owner-context producers.
--    The public door is untouched: it stays the human path.
--
-- 2. FIRST OUTCOME WINS, IN THE INTERNAL WRITER ONLY. It refuses to overwrite a recorded outcome
--    (`and n.outcome is null`). A notice that already recorded `decided` was completed, not
--    superseded — and an engine producer must never clobber a human-recorded outcome. The public
--    door keeps its existing overwrite semantics; only the machine path is one-way.
--
-- 3. 🚨 A `skipped` NOTICE IS NEVER GIVEN AN OUTCOME. `hr._wf_notice_outcome` excludes
--    `status = 'skipped'` — a notice that was never deliverable never ASKED anybody, so it cannot
--    have been acted on, ignored, or superseded. This is hr_c4_41/44's law continued: never record a
--    non-ask as the person's failure. `ignored` in particular would be an accusation.
--
-- 4. THE FIVE PRODUCERS, AT THE EVENTS §5 NAMES:
--      · `decided`      — `hr.wf_decide`, right after the decision row is written, on the notices
--                         that ASKED THIS DECIDER (scoped to `recipient_user_id = v_uid`).
--      · `acknowledged` — the same call site, when the decision is an attestation
--                         (`attested` / `attested_with_exception`) rather than an approval. §5 draws
--                         exactly this distinction and the engine already has the value in hand.
--      · `ignored`      — `hr._wf_not_attested`, and ONLY for `no_response`. For `no_reach` nobody
--                         could be asked, so nothing was ignored (RD 3).
--      · `superseded`   — `hr._wf_target_changed`, on each reopened step's prior notices, BEFORE the
--                         fresh ask goes out — which is precisely "a newer notice replaced this one".
--      · `undeliverable`— `communication.finalize_notification`'s terminal branch, when the row
--                         lands in `dead_letter` (every channel exhausted). `failed_terminal` is NOT
--                         given the outcome: §5 says "every channel dead-lettered", and the spine
--                         distinguishes the two statuses.
--
-- 5. ONE LINE PER PRODUCER. Each engine call site gains a single `perform hr._wf_notice_outcome(...)`
--    rather than an inlined loop, so the "which notices" rule lives in one function and the surgery
--    on four live functions stays minimal.
--
-- Authority: SPEC-NOTIFICATIONS §5.2 (the outcome vocabulary and producer rule), §6.1 (the notice
-- row is the evidence record, `outcome` is its last column).
-- Applied live as `hr_c4_52_the_outcome_door_gets_its_producers`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  perform set_config('matrx.hr_c4_52_conf_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the internal writer (RD 1/2)
create or replace function communication._set_notification_outcome(
  p_notification_id uuid, p_outcome text, p_acted_at timestamptz default now())
returns boolean
language plpgsql security definer set search_path to 'communication', 'public'
as $fn$
begin
  -- the SAME vocabulary as the public door (SPEC-NOTIFICATIONS §5.2). The contract row below
  -- requires both functions to carry all five, so they cannot drift apart.
  if p_outcome is null or p_outcome not in
     ('decided', 'acknowledged', 'ignored', 'superseded', 'undeliverable') then
    raise exception
      '_set_notification_outcome: % is not a declared outcome (decided | acknowledged | ignored | superseded | undeliverable)',
      p_outcome using errcode = '22023';
  end if;
  -- RD 2: FIRST OUTCOME WINS. An engine producer never overwrites a recorded outcome — a notice
  -- that already carries `decided` was completed, not superseded, and a human's record stands.
  update communication.notification n
     set outcome    = p_outcome,
         outcome_at = now(),
         acted_at   = coalesce(n.acted_at, p_acted_at),
         updated_at = now()
   where n.id = p_notification_id
     and n.outcome is null;
  return found;
end
$fn$;

revoke all on function communication._set_notification_outcome(uuid, text, timestamptz)
  from public, anon, authenticated;

comment on function communication._set_notification_outcome is
  'The PRODUCER path for SPEC-NOTIFICATIONS §5.2 outcomes. Same write and same vocabulary as communication.record_notification_outcome, minus the caller check — three of the five producers are the engine acting on somebody else''s notice (the sweep, a supersede, the dead-letter worker), which the public door correctly refuses. Revoked from every client role: owner-context producers only. First outcome wins; never overwrites a recorded one.';

-- ============================================================ 2. which notices (RD 3/5)
create or replace function hr._wf_notice_outcome(p_step uuid, p_outcome text, p_user uuid default null)
returns integer
language plpgsql security definer set search_path to 'hr', 'public'
as $fn$
declare r record; v_n integer := 0;
begin
  if p_step is null or p_outcome is null then return 0; end if;
  for r in
    select nt.id
      from communication.notification nt
     where nt.target_kind = 'hr_workflow_step'
       and nt.target_id   = p_step
       and nt.outcome is null
       -- 🚨 RD 3: a `skipped` notice never ASKED anybody, so it cannot have been acted on, ignored
       -- or superseded. Recording `ignored` on one would be an accusation against somebody nobody
       -- could reach — hr_c4_41/44's law, continued.
       and nt.status <> 'skipped'
       and (p_user is null or nt.recipient_user_id = p_user)
  loop
    if communication._set_notification_outcome(r.id, p_outcome) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end
$fn$;

revoke all on function hr._wf_notice_outcome(uuid, text, uuid) from public, anon, authenticated;

comment on function hr._wf_notice_outcome is
  'Records a SPEC-NOTIFICATIONS §5.2 outcome on the notices for one workflow step — optionally only those sent to one recipient. The ONE place the "which notices" rule lives, so each producer call site is a single line. Never touches a `skipped` notice: one that was never deliverable never asked anybody.';

-- ============================================================ 3. the producers (RD 4)
do $mig$
declare v_oid oid; v_def text;
  -- decided / acknowledged: hr.wf_decide, immediately after the decision row is written
  v_dec_old constant text := $o$  returning id into v_dec;

  perform hr._wf_event(inst.id, p_step_id, 'decided', 'active', null,$o$;
  v_dec_new constant text := $o$  returning id into v_dec;

  -- 🚨 §5.2: the notice that ASKED THIS PERSON to decide has now been acted on. `acknowledged` when
  -- the act is an attestation, `decided` when it is an approval — the distinction §5.2 draws, and
  -- the engine already holds the value. Scoped to this decider's own notices.
  perform hr._wf_notice_outcome(p_step_id,
            case when p_decision in ('attested','attested_with_exception')
                 then 'acknowledged' else 'decided' end,
            v_uid);

  perform hr._wf_event(inst.id, p_step_id, 'decided', 'active', null,$o$;
  -- ignored: hr._wf_not_attested, and ONLY for no_response
  v_ign_old constant text := $o$  v_case := case when coalesce(cardinality(st.resolved_user_ids), 0) = 0
                 then 'no_reach' else 'no_response' end;$o$;
  v_ign_new constant text := $o$  v_case := case when coalesce(cardinality(st.resolved_user_ids), 0) = 0
                 then 'no_reach' else 'no_response' end;

  -- 🚨 §5.2 `ignored` = "the window closed with no action" — TRUE only when there WAS a surface to
  -- act on. For `no_reach` nobody could be asked, so nothing was ignored; recording it would be the
  -- accusation hr_c4_41/44 exist to prevent.
  if v_case = 'no_response' then
    perform hr._wf_notice_outcome(p_step, 'ignored');
  end if;$o$;
  -- superseded: hr._wf_target_changed, on the reopened step's prior notices, before the fresh ask
  v_sup_old constant text := $o$    -- every PRIOR APPROVER is told the request changed and needs a fresh look (§3.4)$o$;
  v_sup_new constant text := $o$    -- 🚨 §5.2 `superseded` = "the object changed and a newer notice replaced this one". Recorded
    -- on the prior notices BEFORE the fresh ask goes out, which is exactly that sentence.
    perform hr._wf_notice_outcome(r.id, 'superseded');
    -- every PRIOR APPROVER is told the request changed and needs a fresh look (§3.4)$o$;
  -- undeliverable: the terminal dead_letter branch of the spine's own finalizer
  v_und_old constant text := $o$      status = case when p_outcome = 'failed_terminal' then 'failed' else 'dead_letter' end,$o$;
  v_und_new constant text := $o$      status = case when p_outcome = 'failed_terminal' then 'failed' else 'dead_letter' end,
      -- 🚨 §5.2 `undeliverable` = "every channel dead-lettered". Only the dead_letter case: the
      -- spine distinguishes it from failed_terminal, and so does the outcome.
      outcome = case when p_outcome = 'failed_terminal' then outcome
                     else coalesce(outcome, 'undeliverable') end,
      outcome_at = case when p_outcome = 'failed_terminal' or outcome is not null
                        then outcome_at else now() end,$o$;
begin
  -- 3a. hr.wf_decide
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_decide';
  v_def := pg_get_functiondef(v_oid);
  if position('_wf_notice_outcome' in v_def) > 0 then
    raise notice 'hr_c4_52: hr.wf_decide already records an outcome';
  else
    if position(v_dec_old in v_def) = 0 then
      raise exception 'hr_c4_52: hr.wf_decide does not carry the expected decision-insert anchor';
    end if;
    execute replace(v_def, v_dec_old, v_dec_new);
    raise notice 'hr_c4_52: hr.wf_decide records decided/acknowledged';
  end if;

  -- 3b. hr._wf_not_attested
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_not_attested';
  v_def := pg_get_functiondef(v_oid);
  if position('_wf_notice_outcome' in v_def) > 0 then
    raise notice 'hr_c4_52: hr._wf_not_attested already records an outcome';
  else
    if position(v_ign_old in v_def) = 0 then
      raise exception 'hr_c4_52: hr._wf_not_attested does not carry the expected v_case anchor';
    end if;
    execute replace(v_def, v_ign_old, v_ign_new);
    raise notice 'hr_c4_52: hr._wf_not_attested records ignored (no_response only)';
  end if;

  -- 3c. hr._wf_target_changed
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_target_changed';
  v_def := pg_get_functiondef(v_oid);
  if position('_wf_notice_outcome' in v_def) > 0 then
    raise notice 'hr_c4_52: hr._wf_target_changed already records an outcome';
  else
    if position(v_sup_old in v_def) = 0 then
      raise exception 'hr_c4_52: hr._wf_target_changed does not carry the expected prior-approver anchor';
    end if;
    execute replace(v_def, v_sup_old, v_sup_new);
    raise notice 'hr_c4_52: hr._wf_target_changed records superseded';
  end if;

  -- 3d. communication.finalize_notification
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'communication' and p.proname = 'finalize_notification';
  v_def := pg_get_functiondef(v_oid);
  if position('''undeliverable''' in v_def) > 0 then
    raise notice 'hr_c4_52: finalize_notification already records undeliverable';
  else
    if position(v_und_old in v_def) = 0 then
      raise exception 'hr_c4_52: finalize_notification does not carry the expected terminal branch';
    end if;
    execute replace(v_def, v_und_old, v_und_new);
    raise notice 'hr_c4_52: finalize_notification records undeliverable on dead_letter';
  end if;
end
$mig$;

-- ============================================================ 4. the contracts
do $$
begin
  delete from hr.function_contract where home_migration = 'hr_c4_52';
  insert into hr.function_contract (schema_name, function_name, home_migration,
                                    must_contain, must_not_contain, must_be_definer, reason)
  values
  ('communication', '_set_notification_outcome', 'hr_c4_52',
   array['''decided''', '''acknowledged''', '''ignored''', '''superseded''', '''undeliverable''',
         'n.outcome is null'],
   '{}', true,
   'hr_c4_52 (SPEC-NOTIFICATIONS §5.2): the producer path must carry the SAME five-value outcome vocabulary as communication.record_notification_outcome — the two writers exist because their AUTHORIZATION differs, never their vocabulary, and a value accepted by one and refused by the other is the drift this row prevents. `n.outcome is null` is first-outcome-wins: an engine producer must never overwrite a recorded outcome, least of all a human''s.'),
  ('hr', '_wf_notice_outcome', 'hr_c4_52',
   array['nt.status <> ''skipped''', 'nt.outcome is null', 'hr_workflow_step'],
   '{}', true,
   'hr_c4_52: a `skipped` notice was never deliverable, so it never ASKED anybody and can never be recorded as acted on, ignored or superseded — recording `ignored` on one is an accusation against somebody nobody could reach (hr_c4_41/44''s law). Dropping the skipped guard re-creates exactly the blaming record those migrations removed.'),
  ('hr', 'wf_decide', 'hr_c4_52',
   array['hr._wf_notice_outcome(p_step_id', '''acknowledged''', '''decided'''],
   '{}', true,
   'hr_c4_52 (§5.2): a recorded decision must record the outcome on the notice that ASKED this decider — `acknowledged` for an attestation, `decided` for an approval, the distinction §5.2 draws. Without it the outcome door has no producer for its two commonest values and §6.1''s lifecycle stops one column short.'),
  ('hr', '_wf_not_attested', 'hr_c4_52',
   array['if v_case = ''no_response'' then', 'hr._wf_notice_outcome(p_step, ''ignored'')'],
   '{}', true,
   'hr_c4_52 (§5.2): `ignored` means "the window closed with no action" and is TRUE only when there was a surface to act on. It must stay gated on v_case = ''no_response'': for `no_reach` nobody could be asked, so nothing was ignored, and recording it would blame a person who was never reachable.');
end $$;

-- ============================================================ 5. post-conditions that EXECUTE
do $$
declare v_bad integer; v_before integer; v_n integer; v_nid uuid; v_ok boolean; v_refused boolean;
begin
  -- the vocabulary is enforced on the producer path (the door still refuses a bad one)
  v_refused := false;
  begin
    perform communication._set_notification_outcome(gen_random_uuid(), 'not_a_real_outcome');
  exception when others then
    v_refused := sqlerrm like '%not a declared outcome%';
  end;
  if not v_refused then
    raise exception 'hr_c4_52: the producer path accepted an undeclared outcome';
  end if;

  -- all four producers are wired
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname = 'hr' and p.proname in ('wf_decide','_wf_not_attested','_wf_target_changed')
          and p.prosrc ~ '_wf_notice_outcome')
      or (n.nspname = 'communication' and p.proname = 'finalize_notification'
          and p.prosrc ~ 'undeliverable');
  if v_n <> 4 then
    raise exception 'hr_c4_52: % of 4 producers are wired', v_n;
  end if;

  -- EXECUTED: a real notice takes an outcome through the producer path, and a skipped one never does
  select id into v_nid from communication.notification
   where target_kind = 'hr_workflow_step' and outcome is null and status <> 'skipped' limit 1;
  if v_nid is not null then
    begin
      v_ok := communication._set_notification_outcome(v_nid, 'decided');
      if not v_ok then raise exception 'hr_c4_52: the producer path did not record an outcome'; end if;
      -- first outcome wins: a second, different write is refused
      if communication._set_notification_outcome(v_nid, 'ignored') then
        raise exception 'hr_c4_52: the producer path overwrote a recorded outcome';
      end if;
      raise exception 'hr_c4_52_rollback_marker';
    exception when others then
      if sqlerrm !~ 'hr_c4_52_rollback_marker' then raise; end if;
    end;
  end if;

  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_52: % function contract(s) broken: %', v_bad,
      (select string_agg(b::text, ' | ') from hr.function_contracts_broken() b);
  end if;
  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn' and c.status in ('FAIL','WARN');
  v_before := current_setting('matrx.hr_c4_52_conf_before')::integer;
  if v_bad > v_before then
    raise exception 'hr_c4_52: hr conformance findings rose from % to %', v_before, v_bad;
  end if;
  raise notice 'hr_c4_52: the outcome door has its five producers';
end $$;
