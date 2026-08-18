-- edu_import_review_history — THE one sanctioned seed path for imported
-- spaced-repetition state (IC-11 §3, education-platform INTEGRATION_MAP).
-- Applied live via Supabase MCP 2026-08-17. A switching Anki user keeps their
-- due dates: the client maps Anki state to FSRS and this RPC seeds
-- education.item_mastery for cards the caller owns. It NEVER overwrites an
-- existing mastery row and writes no study_attempt rows (foreign reviews are
-- not Matrx attempts; the ledger stays honest).

create or replace function public.edu_import_review_history(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_seeded integer := 0;
  v_skipped integer := 0;
  r jsonb;
  v_item_id uuid;
begin
  if v_uid is null then
    raise exception 'edu_import_review_history: not authenticated' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'edu_import_review_history: p_items must be a jsonb array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 10000 then
    raise exception 'edu_import_review_history: at most 10000 items per call' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(p_items) loop
    begin
      v_item_id := (r->>'item_id')::uuid;
    exception when others then
      v_skipped := v_skipped + 1; continue;
    end;
    if r->>'due_at' is null or r->>'stability' is null then
      v_skipped := v_skipped + 1; continue;
    end if;
    -- The card must be the caller's own row.
    if not exists (
      select 1 from education.fc_card c
      where c.id = v_item_id and c.created_by = v_uid and c.deleted_at is null
    ) then
      v_skipped := v_skipped + 1; continue;
    end if;

    insert into education.item_mastery as m (
      created_by, item_type, item_id,
      difficulty, stability, retrievability, mastery_score,
      lapses, interval_days, due_at, last_review, last_attempt_at,
      attempt_count, correct_count, metadata
    ) values (
      v_uid, 'fc_card', v_item_id,
      coalesce((r->>'difficulty')::numeric, 5),
      (r->>'stability')::numeric,
      coalesce((r->>'retrievability')::numeric, 0.9),
      coalesce((r->>'retrievability')::numeric, 0.9),
      coalesce((r->>'lapses')::integer, 0),
      greatest(0, round((r->>'stability')::numeric)::integer),
      (r->>'due_at')::timestamptz,
      (r->>'last_review')::timestamptz,
      (r->>'last_review')::timestamptz,
      coalesce((r->>'reps')::integer, 0),
      greatest(0, coalesce((r->>'reps')::integer, 0) - coalesce((r->>'lapses')::integer, 0)),
      jsonb_build_object('imported_from', coalesce(r->>'source', 'import'))
    )
    on conflict (created_by, item_type, item_id) do nothing;
    if found then
      v_seeded := v_seeded + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('seeded', v_seeded, 'skipped', v_skipped);
end $function$;

revoke all on function public.edu_import_review_history(jsonb) from public, anon;
grant execute on function public.edu_import_review_history(jsonb) to authenticated;
