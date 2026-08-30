-- hr_l3_119 — A WORKWEEK STRADDLES, AND TWO WORKWEEKS STRADDLE.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- THE FINDING. The HR boundary panel's third sentence renders
--
--     "2 workweek(s) straddle this period's edges."
--
-- `workweek(s)` is the form-letter cop-out — the shape a sentence takes when nobody decided what
-- it should say at N=1. And at N=1 it is not merely ugly, it is ungrammatical: the live database
-- has two pay periods with exactly one straddling workweek, and each of them renders
-- "1 workweek(s) straddle this period's edges" — a plural verb on a singular subject, on a panel a
-- payroll manager reads before approving wages.
--
-- ── THE PREMISE, CORRECTED BEFORE A LINE WAS WRITTEN ──────────────────────────────────────────
-- 🚨 THE COUNT IS CORRECT. This is not a counting defect and this migration does not touch any
-- counting logic. `hr.pay_period.boundary_workweek_ids` genuinely holds the right ids — verified
-- live 2026-08-29 across all 70 populated periods (67 at N=0, 2 at N=1, 1 at N=2) — and its only
-- writer, `hr.recompute_apply`, is not read, referenced, or amended here. Neither is
-- `hr.export_period_facts`, which produces the export gate's `pending_workweek_ids`.
--
-- THE DEFECT IS PURELY WORDING, in four live function bodies:
--
--   1. hr.pay_period_get      — composes `boundary_note`, the panel's sentence.
--   2. hr.timesheet_get       — composes `totals.pay_period.note`, the same fact at a second grain.
--   3. hr.export_claim        — the export finality gate's hr_state_conflict message. This one is
--                               read by a human at the moment an export is REFUSED; "1 workweek(s)
--                               ... are not final yet" is the worst possible register for it.
--   4. hr._ppe_rollup_refresh — `calc.split_pending_note` on every rolled-up timesheet row.
--
-- ── WHY THE SERVER SENTENCE HAS TO BE WORTHY, RATHER THAN THE CLIENT PATCHED ───────────────────
-- The correct sentence already exists client-side, in
-- `features/hr/time/periods/periodStateMachine.ts` → `boundaryWeeksSentence()`, which switches
-- both the noun and the verb on the count. But `BoundaryWeeksPanel.tsx` deliberately PREFERS the
-- server's `boundary_note` (`boundaryNote ?? boundaryWeeksSentence(...)`) and falls back to the
-- client only for the list read, which carries no note. That preference is CORRECT — one sentence,
-- composed where the fact lives, is the house rule — so the fix belongs on the server side of the
-- seam. The client fallback is not touched by this migration.
--
-- 📌 ONE KNOWN, DELIBERATE DIVERGENCE, LEFT FOR ARMAN: after this migration the server sentence and
-- the client fallback are identical except for one word — the server says overtime "is computed on
-- the whole WORKWEEK", the client says "on the whole WEEK". Both are true and neither is a defect;
-- aligning them is a copy decision, not a correctness one, so it is reported rather than taken.
--
-- ── THE RESOLUTION: ONE COMPOSER, FOUR RE-EMITS ───────────────────────────────────────────────
-- §1 adds `hr._workweek_subject(count, singular_verb, plural_verb)` — the ONE body in this
-- database that decides workweek plural-and-verb agreement. Four call sites, one rule; the next
-- sentence that needs it calls it instead of inventing a fifth `(s)`.
--
-- §2 re-emits the four functions THROUGH THEIR OWN LIVE DEFINITIONS. These bodies are 6.7k–21k
-- characters of load-bearing payroll logic (permission gates, the double-payment rule, the
-- staleness predicate, the hr_l3_92 boundary_computed disclosure). Hand-transcribing them to fix a
-- noun would be the single riskiest way to change a word, and it is exactly how a re-emit silently
-- reverts a neighbouring migration. So each function is rewritten mechanically:
--   pg_get_functiondef → assert each old fragment occurs EXACTLY ONCE → replace() → execute →
--   assert the old fragment is gone and the new wording is present.
-- Nothing else in any of the four bodies can change, because nothing else is touched.
--
-- ── ONE INVESTIGATED QUESTION, ANSWERED ───────────────────────────────────────────────────────
-- `hr._ppe_rollup_refresh`'s `split_pending_note` interpolated NO count, so the work order asked
-- whether one was derivable or whether the sentence had to go count-free. It IS derivable, and
-- honestly: the note is emitted only inside `case when v_split is not null then …`, where
-- `v_split jsonb` is the `jsonb_agg(...)` of the offending workweeks. jsonb_agg returns NULL for
-- zero rows, so inside that branch the array is guaranteed non-empty and
-- `jsonb_array_length(v_split)` is the exact number of workweeks the note is about — the same
-- workweeks already named, one object each, in the sibling `split_pending` key. So this one gets a
-- real count rather than the count-free wording. No new query, no new scan; the count is read off
-- the value the branch is already conditioned on.
--
-- ── WHAT THIS MIGRATION MUST NOT DISTURB, ASSERTED AT THE END ─────────────────────────────────
--   · the ZERO case: `pay_period_get` emits NULL boundary_note at N=0 (the panel then reads
--     `boundary_computed`), and `timesheet_get` emits its own no-boundary sentence. Both untouched.
--   · hr_l3_92's `boundary_computed` pre-compute branch — the honest "this has not been asked of
--     anything yet" disclosure, which is the whole reason an empty array is not "none found".
--   · every hr.function_contract pin. Checked live before writing: NO pin asserts on the
--     `workweek(s)` text (the three pay_period_get pins hold `boundary_computed`,
--     `_subject_display_name`, the attestation-reachability strings and the org-scoped
--     permission call; export_claim's holds the staleness predicate; timesheet_get's holds
--     `v_reach`). None of those strings are inside any fragment replaced here, so NO PIN IS
--     AMENDED BY THIS MIGRATION — and `hr.function_contracts_broken()` is asserted at 0 anyway.
--
-- Idempotent: each function is skipped with a notice if its old fragments are already absent and
-- the new wording already present; a body that matches NEITHER shape raises, because that means it
-- drifted and a blind replace would be a lie.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

set local statement_timeout = '600s';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE ONE PLACE THE PLURAL IS DECIDED.
--
-- Takes the count and the two verb forms, returns the whole subject-and-verb. The verbs are
-- parameters rather than baked in because the four sentences need three different verbs
-- ('straddles/straddle', 'is/are', 'carries/carry') and the thing worth centralising is the
-- AGREEMENT RULE, not any one verb.
create or replace function hr._workweek_subject(
  p_count int, p_singular_verb text, p_plural_verb text) returns text
language sql immutable as $fn$
  select p_count::text || ' workweek' || case when p_count = 1 then '' else 's' end
      || ' ' || case when p_count = 1 then p_singular_verb else p_plural_verb end;
$fn$;

-- The house forbids implicit PUBLIC EXECUTE (hr_l3_117 asserts it on every function it ships).
-- No role grant is needed to replace it: all four callers are SECURITY DEFINER owned by postgres,
-- so this runs as postgres inside them. Granting it to service_role would widen reach for nothing.
revoke all on function hr._workweek_subject(int, text, text) from public;

comment on function hr._workweek_subject(int, text, text) is
  'THE ONE PLACE workweek plural-and-verb agreement is decided. Returns "1 workweek straddles" / '
  '"2 workweeks straddle" / "1 workweek is" / "2 workweeks are". Every sentence in this database '
  'that counts workweeks composes its subject here — hr.pay_period_get (boundary_note), '
  'hr.timesheet_get (totals.pay_period.note), hr.export_claim (the finality refusal) and '
  'hr._ppe_rollup_refresh (calc.split_pending_note) since hr_l3_119, which retired the '
  '"workweek(s)" form letter. Never re-introduce "(s)" in a workweek sentence; call this instead. '
  'The boundary sentence must stay in step with the client fallback boundaryWeeksSentence() in '
  'matrx-frontend/features/hr/time/periods/periodStateMachine.ts — the panel prefers the server '
  'note and falls back to that function, so the two must never say different things.';

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. THE FOUR RE-EMITS.
--
-- Every fragment below was verified against the LIVE prosrc on db.matrxserver.com 2026-08-29 to
-- occur exactly once, and every NEW fragment was chosen so the OLD fragment is NOT a substring of
-- it — which is what makes the idempotence test (old absent AND new present ⇒ already done)
-- decidable rather than a guess.
create temporary table _ww_rewrite (
  fn text not null, ord int not null, old_text text not null, new_text text not null
) on commit drop;

insert into _ww_rewrite (fn, ord, old_text, new_text) values

-- ── 2.1 hr.pay_period_get — the panel's third sentence, the one in the finding ────────────────
-- OLD: "2 workweek(s) straddle this period's edges. Overtime for those weeks is computed on the
--       whole workweek and attributed to the period containing the week's end date."
-- NEW: "2 workweeks straddle this period's edges. …"  /  "1 workweek straddles this period's edges. …"
-- The format() call and its `%s` survive; what changes is that `%s` is now the whole subject and
-- verb rather than a bare number with a fixed plural verb welded after it.
('pay_period_get', 1,
 $q$%s workweek(s) straddle this period''s edges.$q$,
 $q$%s this period''s edges.$q$),
('pay_period_get', 2,
 $q$cardinality(v_per.boundary_workweek_ids))$q$,
 $q$hr._workweek_subject(cardinality(v_per.boundary_workweek_ids), 'straddles', 'straddle'))$q$),

-- ── 2.2 hr.timesheet_get — the same fact, one grain down, on totals.pay_period.note ───────────
-- OLD: "This total is a sum of days, for display. 2 workweek(s) straddle this period's edges: …"
-- NEW: "This total is a sum of days, for display. 2 workweeks straddle this period's edges: …"
-- The N=0 branch of this same `case` — "This total is a sum of days, for display. Overtime is
-- computed on the workweek, not on the pay period." — is NOT a fragment here and cannot move.
('timesheet_get', 1,
 $q$%s workweek(s) straddle this period''s edges:$q$,
 $q$%s this period''s edges:$q$),
('timesheet_get', 2,
 $q$neighbouring period.', v_bnd)$q$,
 $q$neighbouring period.', hr._workweek_subject(v_bnd, 'straddles', 'straddle'))$q$),

-- ── 2.3 hr.export_claim — the refusal a human reads at the moment an export is blocked ────────
-- OLD: "hr_state_conflict: 1 workweek(s) covering pay period <id> are not final yet (<ids>); …"
-- NEW: "hr_state_conflict: 1 workweek is not final yet for pay period <id> (<ids>); …"
--      "hr_state_conflict: 2 workweeks are not final yet for pay period <id> (<ids>); …"
-- 🚨 THE CLAUSE ORDER MOVES ON PURPOSE. `hr._workweek_subject` glues the verb straight onto the
-- noun, so "N workweeks covering pay period X are not final" cannot be composed from it without
-- splitting the subject from its verb across an interposed modifier — which is precisely the
-- construction that let the disagreement hide in the first place. Putting the period AFTER the
-- verb keeps subject and verb adjacent, so the agreement is visible in the sentence itself.
-- The three `%` arguments keep their existing ORDER (subject, period id, id list), so the second
-- fragment below only re-wraps the first argument; nothing is re-ordered at the call.
-- The errcode, the SQLSTATE and the HINT (which is what tells the operator how to clear it) are
-- outside both fragments and are untouched.
('export_claim', 1,
 $q$hr_state_conflict: % workweek(s) covering pay period % are not final yet (%); overtime is computed across a whole workweek, so an unfinalised week would export hours that can still change$q$,
 $q$hr_state_conflict: % not final yet for pay period % (%); overtime is computed across a whole workweek, so an unfinalised week would export hours that can still change$q$),
('export_claim', 2,
 E'cardinality(v_facts.pending_workweek_ids),\n',
 E'hr._workweek_subject(cardinality(v_facts.pending_workweek_ids), ''is'', ''are''),\n'),

-- ── 2.4 hr._ppe_rollup_refresh — calc.split_pending_note, now with the count it always had ────
-- OLD: "The workweek(s) named here carry computed overtime that was never split onto their
--       intervals, so the hours above sum un-split inputs and read 0 overtime. The totals are a
--       true sum of the current intervals; they are behind the workweek until it is re-drained
--       through the current engine."
-- NEW: "2 workweeks carry computed overtime that was never split onto the intervals in this
--       period, so the hours above sum un-split inputs and read 0 overtime. The totals are a true
--       sum of the current intervals; they stay behind until every workweek named in split_pending
--       is re-drained through the current engine."
-- Three things move, and each for a stated reason:
--   · the subject gains the real count (see the header) and loses "(s)";
--   · "their intervals" → "the intervals in this period", because "their" was the possessive that
--     only worked while the subject was a vague plural, and the intervals in question are this
--     period's current ones anyway;
--   · the closing "behind the workweek until IT is re-drained" was singular prose on a set. It now
--     points the reader at `split_pending` — the sibling key that names the workweeks, object by
--     object — which is a better answer than any pronoun, at every N.
-- The `case when v_split is not null` guard, the `split_pending` array itself, and hr_l3_59's
-- surgical key-drop for the null case are all outside these fragments.
('_ppe_rollup_refresh', 1,
 $q$'The workweek(s) named here carry computed overtime that was never split onto '$q$,
 $q$hr._workweek_subject(jsonb_array_length(v_split), 'carries', 'carry') || ' computed overtime that was never split onto '$q$),
('_ppe_rollup_refresh', 2,
 $q$|| 'their intervals, so the hours above sum un-split inputs and read 0 overtime. '$q$,
 $q$|| 'the intervals in this period, so the hours above sum un-split inputs and read 0 overtime. '$q$),
('_ppe_rollup_refresh', 3,
 $q$|| 'The totals are a true sum of the current intervals; they are behind the '$q$,
 $q$|| 'The totals are a true sum of the current intervals; they stay behind until '$q$),
('_ppe_rollup_refresh', 4,
 $q$|| 'workweek until it is re-drained through the current engine.'$q$,
 $q$|| 'every workweek named in split_pending is re-drained through the current engine.'$q$);

do $rw$
declare
  r          record;
  p          record;
  v_oid      oid;
  v_n        int;
  v_def      text;
  v_new      text;
  v_hits     int;
  v_already  int;
  v_pairs    int;
begin
  for r in select distinct fn from _ww_rewrite order by 1 loop

    -- The target must be unambiguous. An overload would make "the" body a fiction.
    select count(*) into v_n
      from pg_proc p2 join pg_namespace ns on ns.oid = p2.pronamespace
     where ns.nspname = 'hr' and p2.proname = r.fn;
    if v_n <> 1 then
      raise exception 'hr_l3_119: expected exactly one hr.% , found %', r.fn, v_n;
    end if;

    select p2.oid into v_oid
      from pg_proc p2 join pg_namespace ns on ns.oid = p2.pronamespace
     where ns.nspname = 'hr' and p2.proname = r.fn;

    v_def := pg_get_functiondef(v_oid);

    -- pg_get_functiondef quotes the body with $function$ unconditionally, so the token must appear
    -- exactly twice — the open and the close. A body that itself contained it would round-trip into
    -- something that does not parse. Verified false for all four before writing, and re-verified
    -- here because a later re-emit could introduce it.
    if (length(v_def) - length(replace(v_def, '$function$', ''))) / 10 <> 2 then
      raise exception 'hr_l3_119: hr.% body collides with the $function$ quote tag; rewrite it by hand',
        r.fn;
    end if;

    v_new    := v_def;
    v_hits   := 0;
    v_already:= 0;
    v_pairs  := 0;

    for p in select ord, old_text, new_text from _ww_rewrite where fn = r.fn order by ord loop
      v_pairs := v_pairs + 1;
      v_n := (length(v_new) - length(replace(v_new, p.old_text, ''))) / length(p.old_text);

      if v_n = 1 then
        v_new  := replace(v_new, p.old_text, p.new_text);
        v_hits := v_hits + 1;
      elsif v_n = 0 and position(p.new_text in v_new) > 0 then
        v_already := v_already + 1;                       -- this fragment is already rewritten
      else
        raise exception
          'hr_l3_119: hr.% fragment % matched neither shape (old occurrences: %, new present: %) — the body drifted; re-read it before re-running',
          r.fn, p.ord, v_n, (position(p.new_text in v_new) > 0);
      end if;
    end loop;

    if v_hits = 0 and v_already = v_pairs then
      raise notice 'hr_l3_119: hr.% already carries the agreeing sentence — skipped', r.fn;
      continue;
    end if;
    if v_hits <> v_pairs then
      raise exception
        'hr_l3_119: hr.% is HALF rewritten (% of % fragments old, % already new) — refusing to leave a mixed body',
        r.fn, v_hits, v_pairs, v_already;
    end if;

    execute v_new;

    -- Read the result back out of the catalog; do not trust the string we just built.
    for p in select ord, old_text, new_text from _ww_rewrite where fn = r.fn order by ord loop
      select p2.prosrc into v_def
        from pg_proc p2 join pg_namespace ns on ns.oid = p2.pronamespace
       where ns.nspname = 'hr' and p2.proname = r.fn;
      if position(p.old_text in v_def) > 0 then
        raise exception 'hr_l3_119: hr.% still carries old fragment % after the rewrite', r.fn, p.ord;
      end if;
      if position(p.new_text in v_def) = 0 then
        raise exception 'hr_l3_119: hr.% is missing new fragment % after the rewrite', r.fn, p.ord;
      end if;
    end loop;

    raise notice 'hr_l3_119: hr.% re-emitted with % agreeing fragment(s)', r.fn, v_hits;
  end loop;
end
$rw$;

-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. SELF-CHECK.
--
-- 📌 ON (c) BELOW, STATED RATHER THAN GLOSSED: the boundary sentence is NOT asserted by calling
-- hr.pay_period_get. That door is SECURITY DEFINER behind an org-scoped `payroll.read` gate keyed
-- to auth.uid(), which is NULL for the role applying a migration — so calling it here would assert
-- nothing about the sentence and would fail for a reason unrelated to this change. Instead the
-- check composes the sentence the way the rewritten body composes it, over the REAL rows of
-- hr.pay_period, and asserts the exact string at N=1 and N=2. No uuid is pinned: the ids in the
-- work order were checked live and one of them was wrong (the N=1 example is b7849cbb…, not
-- ba6c4998…, and there are TWO N=1 periods), so the check selects by cardinality instead.
do $post$
declare
  v_acl      text;
  v_one      text;
  v_two      text;
  v_src      text;
  v_bad      int;
  v_n1       int;
  v_n2       int;
  v_expect_1 constant text :=
    '1 workweek straddles this period''s edges. Overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date.';
  v_expect_2 constant text :=
    '2 workweeks straddle this period''s edges. Overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date.';
begin
  -- (a) the composer exists, is not PUBLIC-executable, and says exactly what it must.
  select p.proacl::text into v_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_workweek_subject'
     and pg_get_function_identity_arguments(p.oid) = 'p_count integer, p_singular_verb text, p_plural_verb text';
  if not found then
    raise exception 'hr_l3_119: hr._workweek_subject(int,text,text) does not exist';
  end if;
  if v_acl is null then
    raise exception 'hr_l3_119: hr._workweek_subject has a NULL acl — that is implicit PUBLIC EXECUTE, which the house forbids';
  end if;
  -- A PUBLIC entry is an acl element with an EMPTY grantee — '{=X/postgres,…}' or ',=X/…' — which
  -- is why the test is anchored on the element boundary and not on '=X' anywhere in the string.
  if v_acl ~ '(^\{|,)=' then
    raise exception 'hr_l3_119: hr._workweek_subject still grants EXECUTE to PUBLIC (acl %)', v_acl;
  end if;

  if hr._workweek_subject(1, 'straddles', 'straddle') <> '1 workweek straddles' then
    raise exception 'hr_l3_119: composer wrong at n=1: %', hr._workweek_subject(1, 'straddles', 'straddle');
  end if;
  if hr._workweek_subject(2, 'straddles', 'straddle') <> '2 workweeks straddle' then
    raise exception 'hr_l3_119: composer wrong at n=2: %', hr._workweek_subject(2, 'straddles', 'straddle');
  end if;
  if hr._workweek_subject(1, 'is', 'are') <> '1 workweek is'
     or hr._workweek_subject(2, 'is', 'are') <> '2 workweeks are'
     or hr._workweek_subject(1, 'carries', 'carry') <> '1 workweek carries'
     or hr._workweek_subject(3, 'carries', 'carry') <> '3 workweeks carry' then
    raise exception 'hr_l3_119: composer wrong on a non-straddle verb pair';
  end if;

  -- (b) the artifact is gone from all four bodies, everywhere in hr, in fact.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prosrc like '%workweek(s)%';
  if v_bad <> 0 then
    raise exception 'hr_l3_119: % hr function(s) still contain the literal "workweek(s)"', v_bad;
  end if;

  -- (c) the sentence itself, at both live cardinalities, composed as the rewritten body composes it.
  select count(*) into v_n1 from hr.pay_period
   where cardinality(coalesce(boundary_workweek_ids, '{}'::uuid[])) = 1;
  select count(*) into v_n2 from hr.pay_period
   where cardinality(coalesce(boundary_workweek_ids, '{}'::uuid[])) = 2;
  if v_n1 = 0 or v_n2 = 0 then
    raise exception 'hr_l3_119: cannot prove the sentence — live pay periods at N=1: %, at N=2: % (both must be > 0)',
      v_n1, v_n2;
  end if;

  select format('%s this period''s edges. Overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date.',
                hr._workweek_subject(cardinality(pp.boundary_workweek_ids), 'straddles', 'straddle'))
    into v_one
    from hr.pay_period pp
   where cardinality(coalesce(pp.boundary_workweek_ids, '{}'::uuid[])) = 1
   order by pp.id limit 1;

  select format('%s this period''s edges. Overtime for those weeks is computed on the whole workweek and attributed to the period containing the week''s end date.',
                hr._workweek_subject(cardinality(pp.boundary_workweek_ids), 'straddles', 'straddle'))
    into v_two
    from hr.pay_period pp
   where cardinality(coalesce(pp.boundary_workweek_ids, '{}'::uuid[])) = 2
   order by pp.id limit 1;

  if v_one is distinct from v_expect_1 then
    raise exception 'hr_l3_119: N=1 renders "%" — expected "%"', v_one, v_expect_1;
  end if;
  if v_two is distinct from v_expect_2 then
    raise exception 'hr_l3_119: N=2 renders "%" — expected "%"', v_two, v_expect_2;
  end if;

  -- …and that the door really does compose it that way: the format template and the composer call
  -- must both be in hr.pay_period_get's body, and the same for hr.timesheet_get.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if position($chk$format('%s this period''s edges.$chk$ in v_src) = 0
     or position($chk$hr._workweek_subject(cardinality(v_per.boundary_workweek_ids), 'straddles', 'straddle')$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.pay_period_get does not compose boundary_note through hr._workweek_subject';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timesheet_get';
  if position($chk$hr._workweek_subject(v_bnd, 'straddles', 'straddle')$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.timesheet_get does not compose its pay-period note through hr._workweek_subject';
  end if;

  -- (d) THE ZERO CASE IS UNCHANGED. pay_period_get keeps its `> 0` guard and its NULL else (a
  -- sentence at N=0 would be the very claim hr_l3_92 forbids), and timesheet_get keeps its own
  -- no-boundary sentence word for word.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if position($chk$cardinality(coalesce(v_per.boundary_workweek_ids,'{}'::uuid[])) > 0$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.pay_period_get lost its N=0 guard on boundary_note';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timesheet_get';
  if position($chk$else 'This total is a sum of days, for display. Overtime is computed on the workweek, not on the pay period.' end$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.timesheet_get lost its N=0 pay-period note';
  end if;

  -- (e) hr_l3_92's pre-compute disclosure survives. "Not computed" is not "none found", and the
  -- panel depends on this key to avoid asserting a world-fact nobody has computed.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if position($chk$'boundary_computed', exists (select 1 from hr.work_interval wi$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.pay_period_get lost the hr_l3_92 boundary_computed branch';
  end if;

  -- …and the rollup note carries a real count now, from the value its own branch is conditioned on.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_ppe_rollup_refresh';
  if position($chk$hr._workweek_subject(jsonb_array_length(v_split), 'carries', 'carry')$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr._ppe_rollup_refresh does not compose split_pending_note through hr._workweek_subject';
  end if;
  if position($chk$case when v_split is not null then$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr._ppe_rollup_refresh lost the guard that makes jsonb_array_length(v_split) safe';
  end if;

  -- …and the export refusal agrees with itself.
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'export_claim';
  if position($chk$hr_state_conflict: % not final yet for pay period %$chk$ in v_src) = 0
     or position($chk$hr._workweek_subject(cardinality(v_facts.pending_workweek_ids), 'is', 'are')$chk$ in v_src) = 0 then
    raise exception 'hr_l3_119: hr.export_claim does not compose its finality refusal through hr._workweek_subject';
  end if;

  -- (f) no contract pin anywhere went red. No pin was amended by this migration — none asserts on
  -- the wording that moved — so this must be 0 by construction, and is asserted rather than assumed.
  select count(*) into v_bad from hr.function_contracts_broken();
  if v_bad <> 0 then
    raise exception 'hr_l3_119: hr.function_contracts_broken() returns % row(s)', v_bad;
  end if;

  raise notice 'hr_l3_119: green — "%" / "%"', v_expect_1, v_expect_2;
end
$post$;

commit;
