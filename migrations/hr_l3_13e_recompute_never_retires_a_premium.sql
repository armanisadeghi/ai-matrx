-- HR domain L3 — migration 13e (register item HRB-015, lane L3 punch + kiosk).
--
-- 🚨 A RECOMPUTE WIPED EVERY STATUTORY PREMIUM ONCE THE EXCEPTION WAS RESOLVED. Found by execution
-- while pinning the premium invariant from both sides. This is the same class hr_l3_13c fixed, but
-- through the path that actually happens in production, and 13c did not cover it.
--
-- 13c protected a premium by adding it to `v_keep` when the premium loop hit its per-day dedupe.
-- But that loop only scans exceptions in `('open','acknowledged')`. As soon as a manager RESOLVES
-- the meal/rest exception - `corrected`, which is the normal outcome - the exception leaves that
-- set, the loop never reaches the dedupe, `v_keep` stays empty, and step 7 supersedes the premium
-- line as "not in this recompute's output".
-- Measured: recompute wrote 2 premiums, both exceptions were resolved (each keeping exactly one
-- line - the reverse-direction guard works), then ONE more recompute of worked hours left
-- 0 current premium rows. An hour of statutory pay per axis, silently retired by an unrelated
-- recompute, on rows that still exist so nothing looks deleted.
--
-- THE FIX, AND WHY IT IS THE PREDICATE RATHER THAN A BIGGER `v_keep`:
-- a premium line is a STATUTORY FACT attached to an exception, not a figure derived from the punch
-- chain. A recompute of worked hours has no business retiring one at all. So the sweep now refuses
-- to supersede any current `premium_only` row UNLESS this very recompute produced a replacement
-- premium for the same (local_work_date, earning_code_id). Superseding a premium therefore requires
-- putting a new premium in its place - which is the only circumstance in which retiring one is
-- correct. `v_keep` stays, for the open/acknowledged path it already covers.
--
-- The cap is still per (day, earning code), so a meal premium and a rest premium on one day remain
-- two lines and are never merged (SPEC-TIME 4.3).
-- Applied live as `hr_l3_13e_recompute_never_retires_a_premium`. Idempotent.

do $outer$
declare
  v_def text;
  v_from constant text :=
E'       and not (w.id = any(v_new_ids || v_keep))
    returning w.id)';
  v_to constant text :=
E'       and not (w.id = any(v_new_ids || v_keep))
       -- 🚨 hr_l3_13e: a premium is a statutory fact, not a derived figure. It is only ever
       -- superseded by a REPLACEMENT premium for the same day and code - never merely by being
       -- absent from a recompute of worked hours.
       and not (w.interval_kind = ''premium_only''
                and not exists (select 1 from hr.work_interval n
                                 where n.id = any(v_new_ids)
                                   and n.interval_kind = ''premium_only''
                                   and n.local_work_date = w.local_work_date
                                   and n.earning_code_id = w.earning_code_id))
    returning w.id)';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('hr_l3_13e' in v_def) > 0 then
    raise notice 'hr_l3_13e: already applied'; return;
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_13e: the supersede predicate was not found in hr.recompute_apply';
  end if;

  execute replace(v_def, v_from, v_to);
end $outer$;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);
  if v_def not like '%hr_l3_13e%' then
    raise exception 'hr_l3_13e: the premium-retirement guard did not land';
  end if;
  if v_def not like '%n.interval_kind = ''premium_only''%' then
    raise exception 'hr_l3_13e: the replacement-premium predicate is missing';
  end if;
end $$;
