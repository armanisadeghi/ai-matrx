-- HR domain L5 — migration 33. The leave surfaces tell a person the WHOLE truth about their own
-- numbers: the balance sentence accounts for every deduction the figure makes, and the request
-- preview speaks in the case that matters most instead of going silent.
--
-- Two defects, one subject: **a panel that explains itself incompletely is a panel that lies by
-- omission.** Both were found by adversarial walks against LIVE data, both are reproduced below
-- with the exact live figures, and neither is a rounding or a formatting problem — in both cases
-- the ENGINE was right and the WORDS were short.
--
-- =====================================================================================
-- PART A — THE BALANCE SENTENCE COULD NOT BE RECONCILED WITH ITS OWN TILES.
--
-- Measured live, `/hr/me/time-off`, employment 11dfa190 (Tomo Iversen-G32), policy 5e6a0d1c:
--
--     Accrued to date 40 h · Used (taken) 0 h · Approved upcoming 16 h · Pending approval 8 h
--     Available 16 h
--     "Available already excludes the 16 hours you have approved and not yet taken."
--
-- 40 − 0 − 16 = 24, not 16. The figure ALSO deducts the 8 hours pending approval
-- (`bookable_now = greatest(0, ledger_balance − pending_approval)`), and the sentence never
-- mentioned them. A person following the explanation lands on the wrong number and concludes the
-- product is wrong about their time off — which is the single most-disputed figure in any HR
-- product (§5's own words).
--
-- 🚨 THE BRANCH WAS NOT MERELY INCOMPLETE — IT WAS EITHER/OR WHERE THE SPEC IS BOTH/AND.
-- SPEC-LEAVE §5 writes the normal sentence as a COMPOSITION:
--
--     "You earn 3.08 hours each pay period. Available already excludes the 16 hours you have
--      approved for Sep 14–15."
--
-- — the accrual sentence AND the exclusion clause. `hr._leave_sentence` had forked that into
-- `if v_up > 0 then <exclusion> else <accrual method> end`, so a person either learned how they
-- earn or learned what is excluded, never both; and where the ONLY deduction was pending
-- (`v_up = 0`, `v_pend > 0`) the exclusion branch did not fire at all and the deduction went
-- completely unmentioned. This migration restores the spec's shape.
--
-- RECORDED DECISIONS — PART A
--
-- A1. THE CLAUSE IS BUILT ONCE, FROM WHAT IS ACTUALLY NON-ZERO, AND NEVER CLAIMS A DEDUCTION THAT
--     DID NOT HAPPEN. `hr._leave_deduction_clause` names approved-upcoming, pending-approval and
--     removed time, in that order, only where each is > 0, and returns NULL when there is nothing
--     to explain — so the "neither" shape is unchanged and no sentence acquires a phantom clause.
--
-- A2. `removed` IS NAMED EVEN THOUGH IT HAS NO TILE. §5's identity is
--     `accrued − used − upcoming − forfeited/expired/paid-out = balance`, and the five figures do
--     not include the fourth term. Silence about a deduction a person cannot see anywhere is
--     strictly worse than naming it in words, so it is named.
--
-- A3. THE CLAUSE IS APPENDED TO THE BRANCHES THAT PREEMPT IT, NOT JUST BOLTED ONTO ONE.
--     The balance-cap and per-hours-worked sentences return BEFORE the exclusion branch, so an
--     employee at their cap with a pending request read a sentence about earning and nothing about
--     the deduction. Both now carry the clause. The overhang branch (`pending_beyond_balance > 0`,
--     hr_c4_55) is deliberately NOT touched: it already names the banked figure, the pending
--     figure, the overhang and the projected date, and appending would say it twice.
--
-- A4. THE NOT-YET-USABLE AND NEGATIVE-BALANCE BRANCHES ARE NOT TOUCHED either. Neither is a
--     sentence about reconciling a bookable figure — the first is about a date, the second states
--     the balance itself — and both fire in states where `bookable_now` is zero.
--
-- FALSIFIED AGAINST FOUR REAL SHAPES (see the assertions at the foot of this file):
--   · both        (up 16, pend 8) — employment 11dfa190 live: sentence must name BOTH.
--   · approved    (up 24, pend 0) — employment 9c0b1d0c live: sentence must be unchanged.
--   · pending     (up 0,  pend n) — must name pending, which it never did before.
--   · neither     (up 0,  pend 0) — must be the plain accrual sentence, with no clause at all.
--
-- =====================================================================================
-- PART B — THE REQUEST PREVIEW SPOKE WHEN THE REQUEST WAS AFFORDABLE AND WENT SILENT WHEN IT
--          WAS NOT. EXACTLY BACKWARDS.
--
-- Measured live through `public.hr_leave_request_preview` as the real signed-in employee
-- 9c0b1d0c (38.5 h bookable, `negative_balance_allowed = false`):
--
--   starts 2026-08-29 (today), 528 h  → projection_sentence NULL   submittable TRUE   blocker NULL
--   starts 2026-09-01,        520 h  → "…so it will not be accepted."   (the branch works)
--   starts 2028-09-01,        536 h  → projection_sentence NULL   submittable TRUE   blocker NULL
--
-- A person could build a request for THIRTEEN TIMES their balance, see nothing at all, and press
-- "Send request" — while `hr.leave_wf_validate` was standing behind the door ready to hard-refuse
-- it with `insufficient_balance`.
--
-- 🚨 THE ROOT CAUSE IS ONE MISSING `coalesce`, AND ITS SHAPE IS THE FAMILY THIS PROGRAM KEEPS
-- MEETING: the preview and the door ask the SAME source and then treat its answer differently.
--
--     the door   (hr.leave_wf_validate):
--       v_projbal := coalesce((v_proj ->> 'projected_available')::numeric, v_bal);   ← FALLBACK
--       v_after   := v_projbal - cost;   if v_after < 0 and not negative_allowed → hard refusal
--
--     the preview (hr.leave_request_preview), before this migration:
--       v_projav  := nullif(v_proj ->> 'projected_available','')::numeric;           ← NO fallback
--       ...and every over-balance branch was gated on `v_projav is not null`, with a final
--       `else v_proj_sentence := null` catching everything that fell through.
--
-- `hr.leave_project_balance` returns NO `projected_available` key in exactly two states:
--   1. the requested start is TODAY or earlier — it returns the ledger-replay branch
--      (`projected = false`), which is a figures block, not a projection; and
--   2. the start is beyond `hr.leave.balance_projection_horizon_days` — it returns
--      `{ok:false, refused:'LEAVE_PROJECTION_BEYOND_HORIZON'}`.
--
-- Both are ordinary, common requests. In both the door still decides (on today's `available`), and
-- in both the preview said nothing. The silence was not a policy about uncertainty; it was a
-- fall-through.
--
-- RECORDED DECISIONS — PART B
--
-- B1. THE PREVIEW TAKES THE DOOR'S COALESCE, VERBATIM. `v_check := coalesce(projected_available,
--     available)` is character-for-character the quantity `hr.leave_wf_validate` subtracts the cost
--     from. The preview does not re-derive affordability, does not clamp, and does not invent a
--     second rule — the split between two rules IS this defect.
--
-- B2. A SENTENCE THAT WAS NOT PROJECTED NEVER SAYS "PROJECTED". Where the projection is absent the
--     wording names today's figure instead of quoting a projected one, because §5's rule ("a
--     projected figure is never shown without the word and the date it assumes") cuts both ways:
--     inventing a projection date for a number nobody projected would be the same defect mirrored.
--
-- B3. THE CONTROL REFLECTS WHAT THE DOOR WILL DO, AND NEVER WITHOUT A SENTENCE. `submittable`
--     becomes false and `blocker` carries the refusal wording exactly when the door's own test
--     (`v_check − cost < 0` and not `negative_balance_allowed`) fires. `LeaveRequestForm` already
--     disables Send on `submittable === false` and renders `blocker` verbatim in its destructive
--     alert, so no client change is required. A block with no sentence is forbidden here; that is
--     why the two are computed together and asserted together below.
--
-- B4. IN THE REFUSAL CASE THE SENTENCE LIVES IN `blocker` AND `projection_sentence` IS NULL. There
--     is ONE wording, in the alert where a refusal belongs. Populating both would render the same
--     sentence twice on the form — once calmly, once in red — and two copies of a sentence is how
--     two sentences start.
--
-- B5. NOT A SINGLE AFFORDABLE-PATH WORDING CHANGES. The `cost <= bookable_now` sentence, the
--     projected-basis sentence, the unlimited case and `projection_note` are byte-identical, and
--     the assertions at the foot pin the affordable sentence against the live employment that
--     produced it.
--
-- No table, column, grant, RLS policy or signature is touched by this migration. Two function
-- bodies are replaced and one helper is created.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- A1 — the deduction clause. One place, built from what is non-zero.
-- -------------------------------------------------------------------------------------

create or replace function hr._leave_deduction_clause(p_fig jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v_up   numeric := coalesce((p_fig ->> 'approved_upcoming')::numeric, 0);
  v_pend numeric := coalesce((p_fig ->> 'pending_approval')::numeric, 0);
  v_rem  numeric := coalesce((p_fig ->> 'removed')::numeric, 0);
  v_parts text[] := array[]::text[];
begin
  -- 🚨 ONLY WHAT ACTUALLY HAPPENED. A clause naming a deduction of zero hours is a false
  -- statement about this person's balance, so each part is admitted on its own value.
  if v_up > 0 then
    v_parts := v_parts || format('the %s hours you have approved and not yet taken',
                                 hr._leave_hours_text(v_up));
  end if;
  if v_pend > 0 then
    v_parts := v_parts || format('the %s hours still waiting for a decision',
                                 hr._leave_hours_text(v_pend));
  end if;
  -- A2: named although no tile carries it — §5's identity deducts it and the five figures do not
  -- show it, so words are the only place a person can meet it at all.
  if v_rem > 0 then
    v_parts := v_parts || format('the %s hours removed from your balance',
                                 hr._leave_hours_text(v_rem));
  end if;

  if cardinality(v_parts) = 0 then
    return null;                       -- nothing was deducted: the caller adds no clause
  elsif cardinality(v_parts) = 1 then
    return format('Available already excludes %s.', v_parts[1]);
  elsif cardinality(v_parts) = 2 then
    return format('Available already excludes %s and %s.', v_parts[1], v_parts[2]);
  else
    return format('Available already excludes %s, %s and %s.', v_parts[1], v_parts[2], v_parts[3]);
  end if;
end
$function$;

comment on function hr._leave_deduction_clause(jsonb) is
  'SPEC-LEAVE §5. The one sentence that accounts for every deduction standing between the visible '
  'tiles and "Available": approved-upcoming, pending-approval and removed time, each named only '
  'when it is non-zero. Built here so no branch of hr._leave_sentence can explain half of them.';

-- -------------------------------------------------------------------------------------
-- A — the balance sentence. Every wording below is the live one except where marked.
-- -------------------------------------------------------------------------------------

create or replace function hr._leave_sentence(p_fig jsonb)
returns text
language plpgsql
immutable
as $function$
declare
  v_method text := p_fig ->> 'accrual_method';
  v_bal    numeric := coalesce((p_fig ->> 'ledger_balance')::numeric, 0);
  v_up     numeric := coalesce((p_fig ->> 'approved_upcoming')::numeric, 0);
  v_cap    numeric := nullif(p_fig ->> 'balance_cap','')::numeric;
  v_usable date    := nullif(p_fig ->> 'usable_on','')::date;
  v_floor  numeric := nullif(p_fig ->> 'negative_balance_floor','')::numeric;
  v_over   numeric := coalesce((p_fig ->> 'pending_beyond_balance')::numeric, 0);
  v_pend   numeric := coalesce((p_fig ->> 'pending_approval')::numeric, 0);
  v_projav numeric := nullif(p_fig ->> 'projected_available','')::numeric;
  v_projon date    := nullif(p_fig ->> 'projected_as_of','')::date;
  -- 🚨 A1/A3. Built ONCE, up front, so no branch below can return a sentence that leaves the
  -- "Available" tile unexplained. NULL when nothing is deducted.
  v_excl   text    := hr._leave_deduction_clause(p_fig);
  v_base   text;
begin
  if coalesce((p_fig ->> 'unlimited')::boolean, false) then
    return 'Unlimited — requests still need approval.';
  end if;
  -- A4: a date sentence, not a reconciliation sentence.
  if v_usable is not null and v_usable > current_date then
    return format('You''ve earned %s hours. You can start using this time on %s.',
                  hr._leave_hours_text(coalesce((p_fig ->> 'accrued_to_date')::numeric, 0)),
                  to_char(v_usable, 'FMMon FMDD'));
  end if;
  -- A4: states the balance itself; bookable_now is zero here.
  if v_bal < 0 then
    return case when v_floor is not null
      then format('Your balance is %s hours. Your organization allows down to %s.',
                  hr._leave_hours_text(v_bal), hr._leave_hours_text(v_floor))
      else format('Your balance is %s hours.', hr._leave_hours_text(v_bal)) end;
  end if;

  -- 🚨 THE OVERHANG SENTENCE (A2 of hr_c4_55). It fires exactly when the hours already asked for
  -- exceed the hours in the bank — the state that used to render as a negative "Available". It
  -- never appears without a number for the overhang, and where the composer supplied the ENGINE'S
  -- OWN projection (`hr.leave_project_balance`, the same call `hr.leave_wf_validate` decides on)
  -- it names the projected figure and the date it assumes, which is §5's standing rule for any
  -- projected number.
  --
  -- 🚨 A3: NO DEDUCTION CLAUSE IS APPENDED HERE. This branch already names the banked hours, the
  -- pending hours, the overhang and the projected date — appending would state the same deduction
  -- a second time in different words, which is how two wordings of one fact start drifting.
  if v_over > 0 then
    if v_projav is not null and v_projon is not null then
      return format(
        'You have %s hours banked and %s hours waiting for a decision, so %s of those hours will '
        || 'be earned before you take them. Projected to %s — the last day one of those requests '
        || 'starts — you would have %s hours.',
        hr._leave_hours_text(v_bal), hr._leave_hours_text(v_pend), hr._leave_hours_text(v_over),
        to_char(v_projon, 'FMMon FMDD, YYYY'), hr._leave_hours_text(v_projav));
    end if;
    return format(
      'You have %s hours banked and %s hours waiting for a decision, so %s of those hours will be '
      || 'earned before you take them. There is nothing left to book until one of them is decided.',
      hr._leave_hours_text(v_bal), hr._leave_hours_text(v_pend), hr._leave_hours_text(v_over));
  end if;

  -- 🚨 A3. THE CAP SENTENCE NO LONGER PREEMPTS THE DEDUCTION CLAUSE. An employee sitting at their
  -- cap with 8 hours pending used to read a sentence purely about earning, while "Available"
  -- silently subtracted the 8.
  if v_cap is not null and v_bal >= v_cap then
    v_base := format('You''ve reached this policy''s %s-hour cap. You''ll start earning again as soon '
                  || 'as you use some time. Nothing expires.', hr._leave_hours_text(v_cap));
    return case when v_excl is null then v_base else v_base || ' ' || v_excl end;
  end if;
  -- 🚨 A3. Same preemption, same fix.
  if v_method = 'per_hours_worked' then
    v_base := format('You earn %s hour(s) for every %s you work.',
                     hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)),
                     hr._leave_hours_text(coalesce((p_fig ->> 'accrual_per_units')::numeric, 0)));
    return case when v_excl is null then v_base else v_base || ' ' || v_excl end;
  end if;

  -- 🚨 THE DEFECT THIS MIGRATION IS NAMED FOR. This was `if v_up > 0 then <exclusion clause on
  -- approved-upcoming ALONE> end` — either/or with the accrual sentence below, blind to pending,
  -- and therefore unreconcilable with its own tiles the moment a request was awaiting a decision.
  -- SPEC-LEAVE §5 writes this as a COMPOSITION of the accrual sentence and the exclusion clause,
  -- and that is what it is again.
  v_base := case v_method
    when 'per_pay_period'    then format('You earn %s hours each pay period.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'per_month'         then format('You earn %s hours each month.',
                                    hr._leave_hours_text(coalesce((p_fig ->> 'accrual_rate')::numeric, 0)))
    when 'annual_lump'       then 'Your whole allowance is granted at the start of each policy year.'
    when 'anniversary_lump'  then 'Your whole allowance is granted on your work anniversary.'
    when 'none'              then 'This balance changes only when your organization grants time.'
    else 'Available is what you can book right now.' end;

  return case when v_excl is null then v_base else v_base || ' ' || v_excl end;
end
$function$;

-- -------------------------------------------------------------------------------------
-- B — the request preview. The affordable-path wordings are byte-identical (B5).
-- -------------------------------------------------------------------------------------

create or replace function hr.leave_request_preview(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to 'hr', 'public'
as $function$
declare
  v_view jsonb; v_span jsonb; v_fig jsonb; v_proj jsonb; v_pol hr.leave_policy%rowtype;
  v_words text; v_excl text;
  v_cost numeric; v_book numeric; v_projav numeric; v_on date; v_proj_sentence text;
  v_check numeric; v_projected boolean; v_costless boolean;
  v_refused boolean := false; v_blocker text;
begin
  v_view := hr._leave_viewer(p_employment_id);
  if (v_view ->> 'rung') = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason');
  end if;
  if p_ends_on < p_starts_on then
    return jsonb_build_object('granted', false, 'reason','dates_reversed',
      'detail','The end date is before the start date.');
  end if;

  v_pol  := hr._leave_policy_at(p_leave_policy_id);
  v_span := hr.leave_span_hours(p_employment_id, p_starts_on, p_ends_on, p_day_parts);
  v_fig  := hr.leave_figures(p_employment_id, p_leave_policy_id, current_date);
  v_on   := greatest(p_starts_on, current_date);
  -- 🚨 THE ENGINE'S OWN CALL, VERBATIM. `hr.leave_wf_validate` runs exactly this line to obtain
  -- `projected_balance_at_start`. The preview and the decision therefore cannot disagree.
  v_proj := hr.leave_project_balance(p_employment_id, p_leave_policy_id, v_on);

  select string_agg(distinct coalesce(d ->> 'label', 'Non-working day'), ', ')
    into v_excl
    from jsonb_array_elements(v_span -> 'days') d
   where coalesce((d ->> 'excluded')::boolean, false);

  -- §4.1: "a request whose cost the employee cannot see is a request they will dispute" — and a
  -- cost that reads "16. hours" is a cost they will not trust.
  v_words := format('%s day%s selected · %s working day%s · %s hours',
                    (v_span ->> 'calendar_days'),
                    case when (v_span ->> 'calendar_days')::int = 1 then '' else 's' end,
                    (v_span ->> 'working_days'),
                    case when (v_span ->> 'working_days')::int = 1 then '' else 's' end,
                    hr._leave_hours_text((v_span ->> 'total_hours')::numeric));
  if v_excl is not null then
    v_words := v_words || ' · ' || v_excl || ' excluded';
  end if;

  /*
    🚨 WHAT THIS REQUEST IS BEING SPENT AGAINST, IN WORDS, BEFORE SUBMIT — IN EVERY CASE,
    INCLUDING (ESPECIALLY) THE ONES THAT WILL BE REFUSED.

    The previous body gated every over-balance branch on `v_projav is not null` and ended with a
    bare `else v_proj_sentence := null`. `hr.leave_project_balance` returns no `projected_available`
    for a request starting today or earlier (it replays the ledger instead) and none beyond the
    projection horizon — so those two perfectly ordinary requests fell through to the null and the
    preview said NOTHING while the door stood ready to refuse them. Measured live: a 528-hour
    request against 38.5 bookable, starting today, rendered no sentence, no warning and an enabled
    "Send request".

    B1: the check quantity is the DOOR'S, fallback included, so the preview cannot reach a verdict
    the door disagrees with.
  */
  v_cost      := coalesce((v_span ->> 'total_hours')::numeric, 0);
  v_book      := coalesce((v_fig ->> 'bookable_now')::numeric, 0);
  v_projav    := nullif(v_proj ->> 'projected_available','')::numeric;
  v_projected := v_projav is not null;
  v_check     := coalesce(v_projav, (v_fig ->> 'available')::numeric, 0);

  if coalesce((v_fig ->> 'unlimited')::boolean, false) then
    v_proj_sentence := null;                                   -- §5 forbids a number here
  elsif v_proj ->> 'projection_note' is not null then
    v_proj_sentence := v_proj ->> 'projection_note';            -- the server's own words
  elsif v_cost <= v_book then
    -- B5: unchanged.
    v_proj_sentence := format('You can book %s hours right now, and this costs %s.',
                              hr._leave_hours_text(v_book), hr._leave_hours_text(v_cost));
  elsif v_projected and v_cost <= v_check then
    -- B5: unchanged. Affordable only because accrual between today and the start date counts.
    v_proj_sentence := format(
      'This books against time you have not earned yet. You can book %s hours right now, but by %s '
      || 'you are projected to have %s — and this costs %s, so it is checked against the projected '
      || 'figure rather than today''s.',
      hr._leave_hours_text(v_book), to_char(v_on, 'FMMon FMDD, YYYY'),
      hr._leave_hours_text(v_projav), hr._leave_hours_text(v_cost));
  elsif not v_pol.negative_balance_allowed then
    -- The door will hard-refuse this with `insufficient_balance`. B3: say so, and mean it.
    v_refused := true;
    v_proj_sentence := case when v_projected then format(
        'This costs %s hours and you are projected to have %s by %s, so it will not be accepted. '
        || 'Shortening the request or moving it later would fix it.',
        hr._leave_hours_text(v_cost), hr._leave_hours_text(v_projav),
        to_char(v_on, 'FMMon FMDD, YYYY'))
      -- B2: nothing was projected, so nothing here says "projected".
      else format(
        'This costs %s hours and you have %s available, so it will not be accepted. Shortening the '
        || 'request or moving it later would fix it.',
        hr._leave_hours_text(v_cost), hr._leave_hours_text(v_check)) end;
  else
    -- Over the balance, but this organization permits going below zero: a person decides.
    v_proj_sentence := case when v_projected then format(
        'This costs %s hours and you are projected to have %s by %s, so approving it would leave you '
        || 'below zero. Your organization allows that, and a person decides it.',
        hr._leave_hours_text(v_cost), hr._leave_hours_text(v_projav),
        to_char(v_on, 'FMMon FMDD, YYYY'))
      else format(
        'This costs %s hours and you have %s available, so approving it would leave you below zero. '
        || 'Your organization allows that, and a person decides it.',
        hr._leave_hours_text(v_cost), hr._leave_hours_text(v_check)) end;
  end if;

  -- B3/B4: the control state and the sentence are decided TOGETHER, and the refusal wording moves
  -- into `blocker` so the form renders it once, in its alert, rather than twice.
  v_costless := hr._leave_span_is_costless(v_span);
  if v_costless then
    v_blocker :=
      'We cannot work out how long your working day is, so this request would cost no time at '
      || 'all. There is no shift scheduled on these days and no standard weekly hours on your '
      || 'position. Ask HR to set your standard hours, or pick days you are scheduled to work.';
  elsif v_refused then
    v_blocker := v_proj_sentence;
    v_proj_sentence := null;
  end if;

  return jsonb_build_object(
    'granted', true, 'span', v_span, 'breakdown_sentence', v_words,
    'figures', v_fig, 'projection', v_proj,
    'projection_sentence', v_proj_sentence,
    'policy_name', v_pol.name, 'increment_minutes', v_pol.increment_minutes,
    'mandated_uses', v_pol.mandated_uses,
    'documentation_required_after_days', v_pol.documentation_required_after_days,
    'documentation_required',
      (v_pol.documentation_required_after_days is not null
       and (p_ends_on - p_starts_on) + 1 > v_pol.documentation_required_after_days),
    'submittable', not (v_costless or v_refused),
    'blocker', v_blocker);
end
$function$;

-- =====================================================================================
-- CONTRACTS — what a later edit may not quietly remove.
-- =====================================================================================

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer)
values
  ('hr', '_leave_sentence', 'hr_l5_33',
   array['hr._leave_deduction_clause(p_fig)'],
   array[]::text[],
   'hr_l5_33 PART A: the balance sentence must account for EVERY deduction between the visible '
   || 'tiles and "Available". It previously named approved-upcoming alone, either/or with the '
   || 'accrual sentence, so a person with 40 accrued / 16 upcoming / 8 pending read a sentence that '
   || 'explained 24 while the tile said 16 — and a pending-only balance had its deduction '
   || 'mentioned nowhere at all. The clause is composed in ONE function; re-inlining a partial copy '
   || 'here is the exact move that produced the defect.',
   true, false),
  ('hr', '_leave_deduction_clause', 'hr_l5_33',
   array['approved_upcoming', 'pending_approval', 'removed', 'cardinality(v_parts) = 0'],
   array[]::text[],
   'hr_l5_33 PART A: names a deduction ONLY when it is non-zero, and returns null when there is '
   || 'none, so no sentence can ever claim a deduction that did not happen. All three terms must '
   || 'stay: `removed` has no tile on any balance block, which makes words the only place an '
   || 'employee can meet it.',
   true, false),
  ('hr', 'leave_request_preview', 'hr_l5_33',
   array['coalesce(v_projav, (v_fig ->> ''available'')::numeric, 0)',
         'v_refused', 'not (v_costless or v_refused)'],
   array[]::text[],
   'hr_l5_33 PART B: the preview must check the request against the SAME quantity the door '
   || 'subtracts from — hr.leave_wf_validate uses coalesce(projected_available, available), and '
   || 'dropping that fallback is what made the preview silent for every request starting today or '
   || 'beyond the projection horizon (measured live: 528 h against 38.5 bookable, no sentence, no '
   || 'warning, Send enabled). `submittable` must keep reflecting the refusal, and a block is never '
   || 'shipped without the sentence that explains it.',
   true, true);

-- =====================================================================================
-- ASSERTIONS. Every one runs against LIVE rows or a synthesised figures block; a wording claim
-- that is not executed is a wording claim that is not true.
-- =====================================================================================

do $$
declare
  v_s text; v_bad integer; v_fig jsonb;
begin
  ---------------------------------------------------------------- PART A, the four shapes
  -- both: the live shape that produced the defect (accrued 40, used 0, upcoming 16, pending 8,
  -- balance 24, bookable 16).
  v_fig := jsonb_build_object('accrual_method','per_pay_period','accrual_rate',3.08,
             'ledger_balance',24,'accrued_to_date',40,'used_taken',0,'approved_upcoming',16,
             'pending_approval',8,'removed',0,'pending_beyond_balance',0,'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s not like '%16 hours you have approved and not yet taken%'
     or v_s not like '%8 hours still waiting for a decision%' then
    raise exception 'hr_l5_33 A/both: the sentence still does not name both deductions: %', v_s;
  end if;

  -- approved-only: must not acquire a pending clause it has no basis for.
  v_fig := jsonb_build_object('accrual_method','per_pay_period','accrual_rate',3.08,
             'ledger_balance',38.5,'accrued_to_date',62.5,'used_taken',0,'approved_upcoming',24,
             'pending_approval',0,'removed',0,'pending_beyond_balance',0,'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s not like '%24 hours you have approved and not yet taken%'
     or v_s like '%waiting for a decision%' then
    raise exception 'hr_l5_33 A/approved-only: wrong clause set: %', v_s;
  end if;

  -- pending-only: the deduction that used to be mentioned NOWHERE.
  v_fig := jsonb_build_object('accrual_method','per_month','accrual_rate',8,
             'ledger_balance',30,'accrued_to_date',30,'used_taken',0,'approved_upcoming',0,
             'pending_approval',6,'removed',0,'pending_beyond_balance',0,'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s not like '%6 hours still waiting for a decision%'
     or v_s like '%approved and not yet taken%' then
    raise exception 'hr_l5_33 A/pending-only: wrong clause set: %', v_s;
  end if;

  -- neither: no clause at all, and the accrual sentence intact.
  v_fig := jsonb_build_object('accrual_method','per_pay_period','accrual_rate',3.08,
             'ledger_balance',30,'accrued_to_date',30,'used_taken',0,'approved_upcoming',0,
             'pending_approval',0,'removed',0,'pending_beyond_balance',0,'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s <> 'You earn 3.08 hours each pay period.' then
    raise exception 'hr_l5_33 A/neither: a clause appeared with nothing to explain: %', v_s;
  end if;

  -- removed: named although it has no tile (A2).
  v_fig := jsonb_build_object('accrual_method','none',
             'ledger_balance',10,'accrued_to_date',20,'used_taken',0,'approved_upcoming',0,
             'pending_approval',0,'removed',10,'pending_beyond_balance',0,'unlimited',false);
  if hr._leave_sentence(v_fig) not like '%10 hours removed from your balance%' then
    raise exception 'hr_l5_33 A/removed: an invisible deduction went unmentioned: %',
      hr._leave_sentence(v_fig);
  end if;

  -- the cap branch no longer preempts the clause (A3).
  v_fig := jsonb_build_object('accrual_method','per_pay_period','accrual_rate',3.08,
             'balance_cap',120,'ledger_balance',120,'accrued_to_date',128,'used_taken',0,
             'approved_upcoming',0,'pending_approval',8,'removed',0,'pending_beyond_balance',0,
             'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s not like '%cap%' or v_s not like '%8 hours still waiting for a decision%' then
    raise exception 'hr_l5_33 A/cap: the cap sentence still hides the deduction: %', v_s;
  end if;

  -- the overhang branch is untouched, and acquires NO second clause (A3).
  v_fig := jsonb_build_object('accrual_method','per_pay_period','accrual_rate',3.08,
             'ledger_balance',24,'accrued_to_date',40,'used_taken',0,'approved_upcoming',16,
             'pending_approval',40,'removed',0,'pending_beyond_balance',16,'unlimited',false);
  v_s := hr._leave_sentence(v_fig);
  if v_s not like '%will be earned before you take them%' or v_s like '%Available already excludes%' then
    raise exception 'hr_l5_33 A/overhang: the overhang sentence was disturbed: %', v_s;
  end if;

  -- unlimited is still the word and nothing else.
  if hr._leave_sentence(jsonb_build_object('unlimited', true))
     <> 'Unlimited — requests still need approval.' then
    raise exception 'hr_l5_33 A/unlimited: the one sentence §5 fixes verbatim has moved';
  end if;

  ---------------------------------------------------------------- PART B, structural
  -- 🚨 PART B CANNOT BE ASSERTED BY CALLING THE FUNCTION FROM HERE, AND PRETENDING OTHERWISE
  -- WOULD BE THE WORSE OPTION. `hr.leave_request_preview` opens with `hr._leave_viewer`, which
  -- resolves `auth.uid()`; a migration has no authenticated caller, so every call from this block
  -- returns `{"granted": false, "reason": "no_authenticated_caller"}` and an assertion written
  -- against it would pass while testing nothing. Setting a jwt claim to fake a caller would make
  -- the gate green by disabling the very check that makes the door a door.
  --
  -- So this block asserts only what it can honestly assert — that the door's own fallback and the
  -- refusal wiring are PRESENT — and PART B's four falsification cases are executed against the
  -- LIVE door over PostgREST as a real signed-in employee, before and after this migration. The
  -- measured results are recorded in this file's header and in the migration report.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'leave_request_preview')
     not like '%coalesce(v_projav, (v_fig ->> ''available'')::numeric, 0)%' then
    raise exception 'hr_l5_33 B: the preview is not using the door''s own fallback quantity';
  end if;
  -- The un-projected refusal wording must exist, because it is the ONLY thing standing in the
  -- gap the old body fell through: a request starting today, or past the horizon, that the door
  -- will refuse. Its absence means the silence is back.
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'leave_request_preview')
     not like '% available, so it will not be accepted%' then
    raise exception 'hr_l5_33 B: the un-projected refusal sentence is gone — the silence is back';
  end if;

  ---------------------------------------------------------------- contracts
  select coalesce(count(*), 0) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_l5_33: % function contract(s) broken', v_bad;
  end if;

  raise notice 'hr_l5_33: the leave panels account for their own numbers';
end $$;
