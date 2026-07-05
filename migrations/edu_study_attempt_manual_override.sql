-- Lets a learner manually override their own graded attempt's result/score
-- (e.g. the AI grader marked something wrong that was actually right). Additive:
-- 6 new nullable/defaulted columns on the append-only study_attempt ledger, so
-- past rows are untouched and every reader that doesn't know about overrides
-- keeps working exactly as before.
--
-- Preserves the ORIGINAL grade (first-ever grade only — re-editing an already
-- overridden attempt does not clobber the true original) so an override is
-- visible and reversible-in-spirit, never a silent rewrite of history. This is
-- the same "flag it, never hide it" posture as a chat app's "(edited)" badge —
-- nothing is disqualified today, but `is_manually_edited` is a ready-made,
-- directly queryable flag for a future contest/leaderboard integrity rule, and
-- `edited_by` lets a parent see whose account made the change.
--
-- study_attempt is a "ledger" RLS variant (org-scoped SELECT; writes are
-- service-role/SECURITY DEFINER-RPC only — see edu_03_register_and_rls.sql),
-- so the override path is a new RPC (study_override_attempt), never a direct
-- client-side .update(). Because item_mastery's box/streak are sequential
-- (each attempt's scheduler step depends on the previous one), editing a
-- historical attempt requires replaying the FULL attempt history for that
-- item — not a delta patch — so the RPC recomputes item_mastery from scratch
-- for (created_by, item_type, item_id) every time it's called.
--
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP.

alter table education.study_attempt
  add column if not exists is_manually_edited boolean not null default false,
  add column if not exists original_result text,
  add column if not exists original_score jsonb,
  add column if not exists original_score_value numeric,
  add column if not exists edited_by uuid references auth.users(id),
  add column if not exists edited_at timestamptz;

comment on column education.study_attempt.is_manually_edited is
  'True once a learner has overridden this attempt''s grade via study_override_attempt. Queryable integrity flag (e.g. for future contest/leaderboard disqualification) — not enforced anywhere today.';
comment on column education.study_attempt.original_result is
  'The result exactly as first graded, captured on the FIRST override only — never overwritten by later overrides.';
comment on column education.study_attempt.original_score_value is
  'The score_value exactly as first graded, captured on the FIRST override only.';
comment on column education.study_attempt.edited_by is
  'auth.users.id of whoever ran the override (the learner, or a parent/guardian using the same account) — visible provenance, not an access gate.';

create index if not exists idx_study_attempt_manually_edited
  on education.study_attempt(session_id)
  where is_manually_edited;

-- ── study_override_attempt: the only write path for a manual grade edit ────────
create or replace function public.study_override_attempt(
  p_attempt_id uuid,
  p_result text,
  p_score_value numeric default null,
  p_score jsonb default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row education.study_attempt%rowtype;
  v_mrow education.item_mastery%rowtype;
  v_box smallint := 1;
  v_streak integer := 0;
  v_prev_streak integer := 0;
  v_interval integer;
  v_mastery numeric;
  v_attempt_count integer := 0;
  v_correct_count integer := 0;
  v_correct boolean := false;
  v_partial boolean := false;
  v_last_result text;
  r record;
begin
  if v_uid is null then
    raise exception 'study_override_attempt: not authenticated' using errcode = '42501';
  end if;

  if p_result not in ('correct', 'partial', 'incorrect') then
    raise exception 'study_override_attempt: invalid result %', p_result using errcode = '22023';
  end if;

  select * into v_row from education.study_attempt
   where id = p_attempt_id and deleted_at is null
   for update;

  if v_row.id is null then
    raise exception 'study_override_attempt: attempt not found' using errcode = 'P0002';
  end if;
  if v_row.created_by is distinct from v_uid then
    raise exception 'study_override_attempt: not your attempt' using errcode = '42501';
  end if;

  update education.study_attempt set
    original_result       = case when is_manually_edited then original_result else result end,
    original_score         = case when is_manually_edited then original_score else score end,
    original_score_value   = case when is_manually_edited then original_score_value else score_value end,
    result          = p_result,
    score_value     = coalesce(p_score_value, score_value),
    score           = coalesce(p_score, score),
    is_manually_edited = true,
    edited_by       = v_uid,
    edited_at       = now()
  where id = p_attempt_id
  returning * into v_row;

  -- Replay item_mastery from the full, now-corrected ledger for this item —
  -- box/streak/correct_count are sequential, so a mid-history edit must
  -- recompute forward from the start rather than patch the current row.
  for r in
    select result, score_value
    from education.study_attempt
    where created_by = v_uid
      and item_type = v_row.item_type
      and item_id = v_row.item_id
      and deleted_at is null
    order by created_at asc
  loop
    v_attempt_count := v_attempt_count + 1;
    if r.result is null then
      continue;
    end if;
    v_prev_streak := v_streak;
    v_correct := (r.result = 'correct');
    v_partial := (r.result = 'partial');
    if v_correct then
      v_box := least(v_box + 1, 6);
      v_streak := v_streak + 1;
      v_correct_count := v_correct_count + 1;
    elsif v_partial then
      v_box := greatest(v_box, 1);
      v_streak := 0;
    else
      v_box := 1;
      v_streak := 0;
    end if;
    v_mastery := coalesce(r.score_value, (v_box - 1)::numeric / 5.0);
    v_last_result := r.result;
  end loop;

  v_interval := case v_box when 1 then 0 when 2 then 1 when 3 then 3
                           when 4 then 7 when 5 then 16 else 35 end;

  insert into education.item_mastery as m (
    created_by, item_type, item_id, mastery_score, box, interval_days, due_at,
    last_review, last_result, last_attempt_at, attempt_count, correct_count, streak, struggle_flag
  ) values (
    v_uid, v_row.item_type, v_row.item_id, v_mastery, v_box, v_interval,
    now() + make_interval(days => v_interval), now(), v_last_result, now(),
    v_attempt_count, v_correct_count, v_streak,
    (not v_correct and not v_partial) or (v_prev_streak = 0 and not v_correct)
  )
  on conflict (created_by, item_type, item_id) do update set
    mastery_score   = excluded.mastery_score,
    box             = excluded.box,
    interval_days   = excluded.interval_days,
    due_at          = excluded.due_at,
    last_review     = excluded.last_review,
    last_result     = excluded.last_result,
    last_attempt_at = excluded.last_attempt_at,
    attempt_count   = excluded.attempt_count,
    correct_count   = excluded.correct_count,
    streak          = excluded.streak,
    struggle_flag   = excluded.struggle_flag
  returning * into v_mrow;

  return jsonb_build_object('attempt', to_jsonb(v_row), 'mastery', to_jsonb(v_mrow));
end $fn$;

grant execute on function public.study_override_attempt(uuid, text, numeric, jsonb) to authenticated, service_role;
