-- hr_l3_100 — an approval is FOR A NUMBER, and a recompute makes it stale.
--
-- THE GAP, MEASURED
--   Correcting a punch on an APPROVED period runs the recompute and nothing else moves. Live in this
--   database when this was written:
--
--     baca7abf-…  state=approved   approved_at 2026-08-28 13:22
--                 current hours 8.00   superseded hours 8.50   1 interval created after approval
--     27da579d-…  state=exported   current 8.00   superseded 17.00   (this one already shipped)
--
--   The approval on file was given for 8.50. The export would carry 8.00. Nobody is told, the period
--   still reads "ready for a payroll export", and the timecard still reads "already been decided".
--   The correction dialog even CLAIMS the rule — "this pay period had already been approved, so it
--   has to be approved again before it can go to payroll" — while nothing enacted it. A rule claimed
--   and not enforced is worse than one absent: it buys the trust of a control that is not there.
--
-- WHAT THE SPEC SAYS, AND THE SEAM IT LEAVES
--   SPEC-TIME §4.1: *"Period flagged recomputed-since-approval. Banner on route 29 shows prior vs
--   current. Re-approval required before export."* §2.4 names `recomputed-since-approval` as a route
--   29 banner state showing *"the prior and current figures and who triggered the recompute"*. So the
--   period does NOT leave `approved`; it carries a flag.
--
--   🚨 BUT THE TRANSITION GRAPH HAD NO EDGE FOR THE RE-APPROVAL THE SPEC REQUIRES. The legal pairs
--   are open→submitted, submitted→approved, approved→exported, exported→locked, locked→closed,
--   locked→reopened, reopened→approved. A period that is `approved` and flagged has nowhere to go but
--   `exported` — so enforcing "re-approval before export" without an edge would DEADLOCK it: export
--   refused for want of a re-approval that no door could perform.
--
--   This adds `('approved','approved')` — re-approval IN PLACE. It is the only option consistent with
--   the spec's own wording (the period stays approved, flagged), it adds NO backward edge so the
--   one-way graph is intact, and the row trigger already permits it: `hr._pay_period_transition`
--   short-circuits `new.state is not distinct from old.state` before it checks the edge list, so
--   same-state updates were always legal at the data layer — only the RPC's list was stricter.
--   Re-approving bumps `approved_at`, which is what CLEARS the flag, because the flag is derived.
--
-- 🚨 THE FLAG IS DERIVED, NEVER STORED. A stored boolean is a thing every future writer must remember
--   to set, and the one that forgets ships stale hours silently — which is the failure being fixed. A
--   period is stale iff it has a CURRENT interval created after its own `approved_at`. Nothing to
--   maintain, nothing to drift, and it self-clears on re-approval by construction.
--
-- Applied live as `hr_l3_100_an_approval_is_for_a_number`. Idempotent.
--
-- RECORDED TECHNICAL DECISIONS
--   · A SEPARATE FACTS FUNCTION, NOT A WIDER `hr.export_period_facts`. Adding a column to that
--     function's RETURNS TABLE needs DROP + CREATE, which silently drops its ACL — hr_l3_98's exact
--     trap. A new function beside it changes no signature and takes no grant with it.
--   · `hr.export_claim` CALLS THE PREDICATE, it does not copy it — that door's own recorded rule, and
--     the reason its workweek-finality check is a call rather than an inlined query.
--   · THE REFUSAL NAMES THE TWO NUMBERS. "Stale" is not actionable; "approved for 8.50, now 8.00" is.

-- ── 1. THE FACT ──────────────────────────────────────────────────────────────────────────────────
create or replace function hr.period_approval_staleness(p_pay_period_id uuid)
returns table (
  pay_period_id uuid,
  approved_at timestamptz,
  recomputed_since_approval boolean,
  hours_at_approval numeric,
  hours_now numeric,
  intervals_since_approval integer
)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
  select pp.id,
         pp.approved_at,
         -- Stale iff a CURRENT interval was written after the approval was given.
         coalesce(count(*) filter (
           where wi.is_current and pp.approved_at is not null
             and wi.created_at > pp.approved_at), 0) > 0,
         -- What the approval was FOR: everything that was current at the moment it was given —
         -- written by then, and either still current or superseded only afterwards.
         coalesce(sum(wi.hours) filter (
           where pp.approved_at is not null
             and wi.created_at <= pp.approved_at
             and (wi.is_current or s.created_at > pp.approved_at)), 0)::numeric,
         coalesce(sum(wi.hours) filter (where wi.is_current), 0)::numeric,
         coalesce(count(*) filter (
           where wi.is_current and pp.approved_at is not null
             and wi.created_at > pp.approved_at), 0)::integer
    from hr.pay_period pp
    left join hr.work_interval wi on wi.pay_period_id = pp.id
    left join hr.work_interval s on s.id = wi.superseded_by_id
   where pp.id = p_pay_period_id
   group by pp.id, pp.approved_at;
$fn$;

revoke execute on function hr.period_approval_staleness(uuid) from public;
revoke execute on function hr.period_approval_staleness(uuid) from anon;
revoke execute on function hr.period_approval_staleness(uuid) from authenticated;

-- ── 2. THE EXPORT DOOR REFUSES A STALE APPROVAL ──────────────────────────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'export_claim';
  if v_src is null then
    raise exception 'hr_l3_100: hr.export_claim not found';
  end if;
  if position('hr_export_approval_stale' in v_src) > 0 then
    return;
  end if;

  v_new := replace(v_src,
    $q$  if p_supersedes_export_id is not null then$q$,
    $q$  -- hr_l3_100 — §4.1: RE-APPROVAL IS REQUIRED BEFORE EXPORT.
  -- The approval on file was given FOR A NUMBER. If the computed hours moved after it was given,
  -- that approval is stale BY CONSTRUCTION — nobody has approved what this file would carry. The
  -- predicate is CALLED, not copied, like the workweek-finality check above it.
  declare
    v_stale record;
  begin
    select s.recomputed_since_approval, s.hours_at_approval, s.hours_now,
           s.intervals_since_approval, s.approved_at
      into v_stale
      from hr.period_approval_staleness(p_pay_period_id) s;
    if coalesce(v_stale.recomputed_since_approval, false) then
      raise exception 'hr_export_approval_stale: pay period % was approved at % for % hour(s), but its hours are now % after % recomputed interval(s); the approval on file is not for the numbers this file would carry',
        p_pay_period_id, v_stale.approved_at, v_stale.hours_at_approval, v_stale.hours_now,
        v_stale.intervals_since_approval
        using errcode = 'P0001',
              hint = 'Re-approve the period (it stays approved; approving again restamps it for the current numbers), then export. SPEC-TIME 4.1.';
    end if;
  end;

  if p_supersedes_export_id is not null then$q$);

  execute v_new;
end
$mig$;

-- ── 3. THE RE-APPROVAL EDGE, so the refusal above is not a deadlock ──────────────────────────────
do $edge$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_src is null then
    raise exception 'hr_l3_100: hr.pay_period_transition not found';
  end if;
  if position($q$('approved','approved')$q$ in v_src) > 0 then
    return;
  end if;

  -- Both occurrences: the guard's tuple list AND the `legal_next_states` the refusal reports, so a
  -- caller who IS refused is told the truth about where they can go.
  v_new := replace(v_src,
    $q$('open','submitted'), ('submitted','approved'), ('approved','exported'),$q$,
    $q$('open','submitted'), ('submitted','approved'), ('approved','exported'),
        -- hr_l3_100: RE-APPROVAL IN PLACE. §4.1 requires an already-approved period to be approved
        -- again after a recompute, and the period does not leave `approved` to do it. No backward
        -- edge is added; the row trigger already allowed a same-state update.
        ('approved','approved'),$q$);
  execute v_new;
end
$edge$;

-- ── 4. THE SURFACE IS TOLD ───────────────────────────────────────────────────────────────────────
do $get$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if v_src is null then
    raise exception 'hr_l3_100: hr.pay_period_get not found';
  end if;
  if position('recomputed_since_approval' in v_src) > 0 then
    return;
  end if;
  v_new := replace(v_src,
    $q$           'boundary_computed',$q$,
    $q$           -- hr_l3_100: §4.1's banner. The approval was FOR a number; when the number moved,
           -- the surface must say so and demand a re-approval before payroll sees it.
           'recomputed_since_approval', (select s.recomputed_since_approval
                                           from hr.period_approval_staleness(v_per.id) s),
           'hours_at_approval', (select s.hours_at_approval
                                   from hr.period_approval_staleness(v_per.id) s),
           'hours_now', (select s.hours_now from hr.period_approval_staleness(v_per.id) s),
           'boundary_computed',$q$);
  execute v_new;
end
$get$;

-- ── SELF-CHECK ───────────────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  if to_regprocedure('hr.period_approval_staleness(uuid)') is null then
    raise exception 'hr_l3_100: the facts function did not land';
  end if;
  if has_function_privilege('anon', 'hr.period_approval_staleness(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'hr.period_approval_staleness(uuid)', 'EXECUTE') then
    raise exception 'hr_l3_100: the facts function is client-reachable';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'export_claim';
  if position('hr_export_approval_stale' in v_src) = 0 then
    raise exception 'hr_l3_100: the export refusal did not land';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if position($q$('approved','approved')$q$ in v_src) = 0 then
    raise exception 'hr_l3_100: the re-approval edge did not land - the export refusal would deadlock';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if position('recomputed_since_approval' in v_src) = 0 then
    raise exception 'hr_l3_100: the surface is still not told';
  end if;
end
$chk$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'export_claim', 'hr_l3_100_an_approval_is_for_a_number',
   array['hr_export_approval_stale', 'hr.period_approval_staleness('],
   array[]::text[],
   'SPEC-TIME §4.1 requires re-approval before export. An approval is given FOR A NUMBER, so when a '
   || 'recompute moves the hours the approval on file is stale by construction and nobody has '
   || 'approved what the file would carry — measured live: a period approved for 8.50 hours reading '
   || '8.00, and another already exported at 8.00 against a superseded 17.00. The predicate is '
   || 'CALLED, never copied. A re-emit that drops it ships unapproved wages.',
   true, true, false),
  ('hr', 'pay_period_transition', 'hr_l3_100_an_approval_is_for_a_number',
   array['(''approved'',''approved'')'],
   array[]::text[],
   'The re-approval edge. §4.1 requires an already-approved period to be approved again after a '
   || 'recompute, and the period does not leave `approved` to do it. Without this pair the export '
   || 'refusal above is a DEADLOCK: export refused for want of a re-approval no door can perform. '
   || 'It adds no backward edge, and the row trigger already permitted a same-state update.',
   true, true, false)
on conflict do nothing;
