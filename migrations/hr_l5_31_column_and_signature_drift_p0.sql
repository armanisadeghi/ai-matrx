-- HR domain L5 — migration 31 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 P0 — TWO DRIFTED LEAVE FUNCTIONS DRAG SIX hr TABLES BELOW canonical_certify_ok, and one of
-- them is a LIVE PRODUCT BREAK. Both are drift in the exact sense the function_contract law exists
-- for: a reference that was correct when written, silently invalidated by a change elsewhere, and
-- caught by nothing because no test read the thing that moved. Contract rows are declared at the
-- end so the next schema change cannot re-break either silently.
--
-- ===================================================================================
-- FIX 1 — hr.leave_case_open: COLUMN DRIFT, LIVE. `hr.workweek` has no `starts_on`; the FMLA
-- eligibility test joined `hr.workweek w` and read `w.starts_on` in three places (the 1,250-hours
-- sum and the frozen `workweek_ids`). Proven live: `public.hr_leave_case_open` is authenticated-
-- EXECUTE, and driven as an hr_owner it raises `42703: column w.starts_on does not exist` — **a
-- real leave administrator opening a protected leave case fails today.** The real column is
-- `week_start_local_date` (a `date`): the test compares against `p_starts_on`, itself a date, and
-- the workweek's LOCAL start date is the grain the 12-month window is measured on. `week_start_at`
-- is a `timestamptz` and would force an implicit cast on every comparison; the local date is the
-- honest match. `work_interval.hours` / `.hours_category` are correct and untouched — `w.starts_on`
-- was the sole broken reference.
--
-- FIX 2 — public.hr_leave_accrual_apply: SIGNATURE DRIFT, LIVE (not cert-only — see below). It
-- calls `hr._leave_jurisdiction_key_or_federal(p_employment_id)` — the ONE-arg, text-returning
-- form. `hr_l5_19` expanded that resolver to THREE args
-- `(p_employment_id, p_leave_policy_id, p_as_of)` returning **jsonb** `{key, derived,
-- fallback_reason}`, and updated `hr.leave_ledger_post` and `hr.leave_adjust` to read `->> 'key'`
-- — but this door, written by the aidream engine lane, was the straggler. The 1-arg form no longer
-- exists, so the call raises `42883`.
--
-- 🚨 THIS IS A LIVE ACCRUAL BREAK, NOT CERT-ONLY. `aidream/services/hr/leave/repository.py` names
-- `hr_leave_accrual_apply` as its `WRITER_RPC_NAME` and `apply()` invokes it; the engine is
-- registered as a dispatch-on-demand system task (`run_hr_leave_accrual`). The broken call is
-- guarded by `if p_jurisdiction_key is null` — and `repository.jurisdiction_key_for` returns
-- `None` for *"an org with no locations stamped yet"* (its own words), which the engine passes
-- straight through as `jurisdiction_key=None`. So **every accrual of an employment whose
-- jurisdiction is not yet stamped — the common early-org case — 42883s on the wage-writing path**,
-- through both the accrual HTTP endpoints and the on-demand worker. It is gated today only by
-- nothing being on a running cron; the moment an accrual is dispatched for an unstamped employment,
-- it fails. The fix uses the SAME 3-arg jsonb pattern `hr.leave_ledger_post` uses, so both doors
-- name the same jurisdiction for the same person.
--
-- Authority: SPEC-LEAVE §9.8/AR 1.6 (the eligibility test), §3.4 (the accrual jurisdiction ladder);
-- hr_l5_19 (the resolver's shape). Applied live as
-- `hr_l5_31_column_and_signature_drift_p0`. Idempotent.
-- ===================================================================================

-- -----------------------------------------------------------------------------------
-- FIX 1 — the workweek column
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_case_open';

  if v_def not like '%w.starts_on%' then
    raise notice 'hr_l5_31 FIX 1: no w.starts_on reference remains — nothing to do.';
  else
    -- every `w.starts_on` in this body is the workweek join; there is no other. `p_starts_on`
    -- (the case start argument) and the `starts_on` insert column are untouched — neither is
    -- prefixed `w.`.
    v_new := replace(v_def, 'w.starts_on', 'w.week_start_local_date');
    if v_new = v_def then
      raise exception 'hr_l5_31 FIX 1: the replacement produced no change — re-derive';
    end if;
    execute v_new;
  end if;
end $$;

-- -----------------------------------------------------------------------------------
-- FIX 2 — the resolver signature and return shape
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_leave_accrual_apply';

  if v_def like '%_leave_jurisdiction_key_or_federal(p_employment_id, p_leave_policy_id%' then
    raise notice 'hr_l5_31 FIX 2: the resolver call is already 3-arg — nothing to do.';
  else
    -- match the exact live line and replace with the 3-arg jsonb form, reading ->> 'key' so the
    -- text variable v_juris keeps its type. p_leave_policy_id and p_occurred_on are both in scope.
    v_new := replace(v_def,
      'v_juris := hr._leave_jurisdiction_key_or_federal(p_employment_id);',
      'v_juris := hr._leave_jurisdiction_key_or_federal('
        || 'p_employment_id, p_leave_policy_id, p_occurred_on) ->> ''key'';');
    if v_new = v_def then
      raise exception 'hr_l5_31 FIX 2: the resolver call line did not match — re-derive from the live body';
    end if;
    execute v_new;
  end if;
end $$;

-- -----------------------------------------------------------------------------------
-- Contract rows — the drift class this law exists for
-- -----------------------------------------------------------------------------------

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('hr', 'leave_case_open', 'hr_l5_31',
   array['w.week_start_local_date', 'hr.workweek'],
   array['w.starts_on'],
   'hr_l5_31: the FMLA 1,250-hours eligibility test joins hr.workweek and measures the 12-month '
   || 'window on week_start_local_date (a date, matching p_starts_on). hr.workweek has no '
   || 'starts_on — a column rename elsewhere raised 42703 on a real leave admin opening a case, '
   || 'and no test read the workweek column. If workweek renames again, this must break loudly '
   || 'at cert, not silently at a live case open.',
   true),
  ('public', 'hr_leave_accrual_apply', 'hr_l5_31',
   array['_leave_jurisdiction_key_or_federal(p_employment_id, p_leave_policy_id',
         '->> ''key'''],
   array['_leave_jurisdiction_key_or_federal(p_employment_id)'],
   'hr_l5_31: the resolver takes (employment, policy, as_of) and returns jsonb {key,derived,...} '
   || 'since hr_l5_19. This door is a LIVE writer for the aidream accrual engine and passes a null '
   || 'jurisdiction_key for unstamped-location orgs, so the 1-arg text form 42883''d on the '
   || 'wage-writing path. It must call the 3-arg form and read ->> ''key'', matching '
   || 'hr.leave_ledger_post, or an accrual for an unstamped employment breaks again.',
   true)
on conflict do nothing;

-- -----------------------------------------------------------------------------------
-- Self-proof — falsify both live, and re-assert the contracts hold on declaration
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_bad text;
begin
  -- FIX 1: no w.starts_on anywhere in the body
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_case_open';
  if v_def like '%w.starts_on%' then
    raise exception 'hr_l5_31: leave_case_open still references w.starts_on';
  end if;
  if v_def not like '%w.week_start_local_date%' then
    raise exception 'hr_l5_31: leave_case_open lost its workweek date comparison entirely';
  end if;

  -- FIX 2: the 1-arg form is gone and the 3-arg ->> 'key' form is present
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_leave_accrual_apply';
  if v_def like '%_leave_jurisdiction_key_or_federal(p_employment_id)%' then
    raise exception 'hr_l5_31: the 1-arg resolver call survives in hr_leave_accrual_apply';
  end if;
  if v_def not like '%_leave_jurisdiction_key_or_federal(p_employment_id, p_leave_policy_id%'
     or v_def not like '%->> ''key''%' then
    raise exception 'hr_l5_31: the 3-arg jsonb resolver call did not land';
  end if;

  -- every contract this file declares must hold right now (must_contain present, must_not absent)
  for v_bad in
    select c.schema_name || '.' || c.function_name
      from hr.function_contract c
     where c.home_migration = 'hr_l5_31' and c.is_active
       and (
         exists (select 1 from unnest(c.must_contain) m
                  where (select pg_get_functiondef(p.oid) from pg_proc p
                           join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname = c.schema_name and p.proname = c.function_name limit 1)
                        not like '%' || m || '%')
         or exists (select 1 from unnest(c.must_not_contain) m
                     where (select pg_get_functiondef(p.oid) from pg_proc p
                              join pg_namespace n on n.oid = p.pronamespace
                             where n.nspname = c.schema_name and p.proname = c.function_name limit 1)
                           like '%' || m || '%'))
  loop
    raise exception 'hr_l5_31: contract violated on declaration for %', v_bad;
  end loop;
end $$;
