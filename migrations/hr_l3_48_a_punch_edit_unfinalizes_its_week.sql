-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 A VOID BETWEEN FINALITY AND EXPORT SHIPPED PRE-VOID NUMBERS IN THE PAYROLL FILE.
--
-- `hr.punch_void` enqueued NO recompute and left `hr.workweek.is_final = true`. So: a week is
-- finalised, a manager voids a duplicate punch, and every downstream reader still sees a final week
-- whose computed hours were derived from a punch that no longer counts. The export gate asks
-- `is_final` and gets `true`. The file ships the pre-void hours, permanently, and nothing anywhere
-- says a word — the function even returned `intervals.is_stale = true` and pointed at a recompute
-- door it never called, which reads as diligence and is the opposite.
--
-- THE RULING (coordinator), in the same transaction as the punch change:
--   1. `punch_void` calls `hr._recompute_enqueue(...)` exactly as `punch_correct` already does.
--   2. BOTH doors set `is_final = false` on the affected week in-transaction — the flag is false
--      from the instant the facts change until a recompute re-derives it. A guard that reads
--      `is_final` must never see `true` over changed facts, even briefly. (`punch_correct` had the
--      same window; it was seconds wide instead of permanent, which is not a different bug.)
--
-- Authority: coordinator ruling (finality/export batch); SPEC-TIME §4.4 (export preconditions),
-- §5.1 (overtime is computed on the whole workweek).
--
-- Applied live as `hr_l3_48_a_punch_edit_unfinalizes_its_week`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. FOUR WRITERS TOUCH `hr.punch`, NOT TWO, AND ALL FOUR GET IT. The ruling names void and
--    correct. Measured against the live catalogue first, the real inventory is:
--
--      hr.punch_void ................. enqueue NO   un-final NO   ← ruled; the worst, and permanent
--      hr.punch_correct .............. enqueue YES  un-final NO   ← ruled
--      hr.punch_record ............... enqueue YES  un-final NO   ← extended (see decision 2)
--      hr._punch_auto_close_orphan ... enqueue NO*  un-final NO   ← extended (see decision 3)
--
--    Fixing only the two named would have left the same defect in the other two, reachable by a
--    different door. Reported as an extension rather than folded in silently.
-- 2. `hr.punch_record` NEEDS IT BECAUSE I MADE BACK-DATING LEGAL. Before hr_l3_40 a recorded punch
--    always landed on the current, non-final week, so the omission was harmless. hr_l3_40 made a
--    manager entry for a day that has already ended a first-class operation — which means
--    `punch_record` can now change the facts of a FINAL week, and it did not un-finalise it. That
--    is my own defect, created two batches ago, and it is the same defect as the void.
-- 3. `hr._punch_auto_close_orphan` WRITES A PUNCH ON A DIFFERENT DAY THAN THE ONE THAT TRIGGERED
--    IT. It closes an orphaned `clock_in` from an earlier shift, so its punch lands on the ORPHAN's
--    local work date — while `punch_record`'s enqueue (*the only reason it is covered at all) fires
--    for the NEW punch's date. When those fall in different weeks, the orphan's week is changed and
--    neither un-finalised nor enqueued. It un-finalises its own week now.
-- 4. ONE IMPLEMENTATION, FOUR CALL SITES. `hr._punch_unfinalize_week` resolves the week through
--    `hr._recompute_workweek_start` — the SAME resolver the enqueue lane already uses — so the flag
--    and the queue can never disagree about which week was affected. Four inline copies of a week
--    lookup is how they start to.
-- 5. IT RETURNS THE IDS IT CLEARED, AND THE DOORS REPORT THEM. A silent un-finalise is only half a
--    step better than no un-finalise: the next person debugging an export that will not claim needs
--    to see which week moved and why. `punch_void`'s answer also stops advertising a recompute door
--    it never called and now carries the enqueue it actually made.
-- 6. THE FLAG IS ONLY EVER CLEARED, NEVER SET. Re-finalising is `hr.recompute_apply`'s job, from
--    re-derived facts. Nothing here can mark a week final, so this migration can only ever make the
--    export gate more conservative — never less.

-- ── 1. the one implementation (decision 4) ──────────────────────────────────────────────────
create or replace function hr._punch_unfinalize_week(p_employment_id uuid, p_local_work_date date)
returns jsonb
language plpgsql volatile security definer set search_path to 'hr','public'
as $fn$
declare v_ids uuid[];
begin
  if p_employment_id is null or p_local_work_date is null then
    return '[]'::jsonb;
  end if;

  perform hr.arm_write();
  -- decision 6: `is_final` is only ever cleared here. `and w.is_final` keeps this a no-op on a week
  -- that was already open, so the common path writes nothing and touches no updated_at.
  with cleared as (
    update hr.workweek w
       set is_final = false
     where w.employment_id = p_employment_id
       and w.week_start_local_date
           = hr._recompute_workweek_start(p_employment_id, p_local_work_date)
       and w.is_final
    returning w.id)
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from cleared;

  return to_jsonb(v_ids);
end
$fn$;

revoke execute on function hr._punch_unfinalize_week(uuid,date) from public, anon;

-- ── 2. wire it into all four writers, plus the void's missing enqueue ───────────────────────
do $mig$
declare v_def text;
begin
  ---------------------------------------------------------------- hr.punch_void (ruling 1 and 2)
  v_def := pg_get_functiondef('hr.punch_void(uuid,text)'::regprocedure);
  if position('_punch_unfinalize_week' in v_def) = 0 then
    if position('  v_notified integer;' in v_def) = 0
       or position('''intervals'', jsonb_build_object(''is_stale'', true, ''recompute_door'', ''POST /hr/time/recompute''));' in v_def) = 0 then
      raise exception 'hr_l3_48: punch_void does not match what this migration expects; refusing to guess';
    end if;

    v_def := replace(v_def, '  v_notified integer;',
      '  v_notified integer;' || E'\n' ||
      '  v_unfinal  jsonb;' || E'\n' ||
      '  v_enq      jsonb;');

    v_def := replace(v_def,
      '  return jsonb_build_object(' || E'\n' || '    ''ok'', true,' || E'\n' || '    ''reason'', p_reason,',
      '  -- hr_l3_48: the facts on this week just changed. The flag drops in THIS transaction and' || E'\n' ||
      '  -- the recompute is queued -- a void that does neither ships pre-void hours in the file.' || E'\n' ||
      '  v_unfinal := hr._punch_unfinalize_week(v_p.employment_id, v_p.local_work_date);' || E'\n' ||
      '  v_enq := hr._recompute_enqueue(v_p.employment_id, v_p.local_work_date,' || E'\n' ||
      '                                 v_p.organization_id, ''punch_void'');' || E'\n\n' ||
      '  return jsonb_build_object(' || E'\n' || '    ''ok'', true,' || E'\n' || '    ''reason'', p_reason,' || E'\n' ||
      '    ''recompute'', v_enq,');

    v_def := replace(v_def,
      '''intervals'', jsonb_build_object(''is_stale'', true, ''recompute_door'', ''POST /hr/time/recompute''));',
      '''intervals'', jsonb_build_object(''is_stale'', true,' || E'\n' ||
      '                                    ''recompute_door'', ''POST /hr/time/recompute'',' || E'\n' ||
      '                                    ''unfinalized_workweek_ids'', v_unfinal));');
    execute v_def;
  end if;

  ---------------------------------------------------------------- hr.punch_correct (ruling 2)
  v_def := pg_get_functiondef('hr.punch_correct(uuid[],jsonb,text)'::regprocedure);
  if position('_punch_unfinalize_week' in v_def) = 0 then
    if position('    v_enqs := v_enqs || jsonb_build_array(v_enq);' in v_def) = 0 then
      raise exception 'hr_l3_48: punch_correct''s enqueue loop has moved; refusing to guess';
    end if;
    v_def := replace(v_def, '  v_closed    jsonb := ''[]''::jsonb;',
      '  v_closed    jsonb := ''[]''::jsonb;' || E'\n' ||
      '  v_unfinal   jsonb := ''[]''::jsonb;');
    v_def := replace(v_def,
      '    v_enqs := v_enqs || jsonb_build_array(v_enq);',
      '    v_enqs := v_enqs || jsonb_build_array(v_enq);' || E'\n' ||
      '    -- hr_l3_48: same transaction as the correction, so no reader ever sees a final week' || E'\n' ||
      '    -- over corrected facts -- not even for the seconds the enqueue took to be picked up.' || E'\n' ||
      '    v_unfinal := v_unfinal || hr._punch_unfinalize_week(' || E'\n' ||
      '                   (v_item ->> ''employment_id'')::uuid, (v_item ->> ''local_work_date'')::date);');
    v_def := replace(v_def, '    ''recompute'', v_enqs,',
      '    ''recompute'', v_enqs,' || E'\n' || '    ''unfinalized_workweek_ids'', v_unfinal,');
    execute v_def;
  end if;

  ---------------------------------------------------------------- hr.punch_record (decision 2)
  v_def := pg_get_functiondef(
    'hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure);
  if position('_punch_unfinalize_week' in v_def) = 0 then
    if position('  v_enq := hr._recompute_enqueue(p_employment_id, v_date, v_org, ''punch_record'');' in v_def) = 0 then
      raise exception 'hr_l3_48: punch_record''s enqueue site has moved; refusing to guess';
    end if;
    v_def := replace(v_def,
      '  v_enq := hr._recompute_enqueue(p_employment_id, v_date, v_org, ''punch_record'');',
      '  -- hr_l3_48 decision 2: since hr_l3_40 a manager entry may be back-dated onto a week that' || E'\n' ||
      '  -- is already final. Changing its facts must drop the flag in this same transaction.' || E'\n' ||
      '  perform hr._punch_unfinalize_week(p_employment_id, v_date);' || E'\n' ||
      '  v_enq := hr._recompute_enqueue(p_employment_id, v_date, v_org, ''punch_record'');');
    execute v_def;
  end if;

  ---------------------------------------------------------------- the orphan sweep (decision 3)
  v_def := pg_get_functiondef('hr._punch_auto_close_orphan(uuid)'::regprocedure);
  if position('_punch_unfinalize_week' in v_def) = 0 then
    if position('  if v_enabled then' || E'\n' || '    perform hr.arm_write();' in v_def) = 0 then
      raise exception 'hr_l3_48: the orphan auto-close write site has moved; refusing to guess';
    end if;
    v_def := replace(v_def,
      '  if v_enabled then' || E'\n' || '    perform hr.arm_write();',
      '  if v_enabled then' || E'\n' ||
      '    -- hr_l3_48 decision 3: this punch lands on the ORPHAN''s work date, which can sit in an' || E'\n' ||
      '    -- earlier -- possibly final -- week than the punch that triggered the sweep.' || E'\n' ||
      '    perform hr._punch_unfinalize_week(p_employment_id, v_first.local_work_date);' || E'\n' ||
      '    perform hr.arm_write();');
    execute v_def;
  end if;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- all four writers un-finalise
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and (p.prosrc ~ ('insert ' || 'into hr\.punch\y') or p.prosrc ~ ('update ' || 'hr\.punch\y'))
     and p.prosrc !~ '_punch_unfinalize_week';
  if v_bad is not null then
    raise exception 'hr_l3_48: a punch writer does not un-finalize its week: %', v_bad;
  end if;

  -- the void enqueues, which was ruling 1
  if (select prosrc from pg_proc where oid='hr.punch_void(uuid,text)'::regprocedure)
     !~ '_recompute_enqueue\(v_p\.employment_id' then
    raise exception 'hr_l3_48: punch_void still enqueues no recompute';
  end if;

  -- decision 6: nothing outside recompute may SET is_final true
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and p.proname not in ('recompute_apply')
     and p.prosrc ~ 'set is_final\s*=\s*true';
  if v_bad is not null then
    raise exception 'hr_l3_48: something other than recompute marks a week final: %', v_bad;
  end if;

  -- the resolver is shared with the enqueue lane (decision 4)
  if (select prosrc from pg_proc where oid='hr._punch_unfinalize_week(uuid,date)'::regprocedure)
     !~ '_recompute_workweek_start' then
    raise exception 'hr_l3_48: the un-finalize resolves the week its own way';
  end if;
end
$chk$;
