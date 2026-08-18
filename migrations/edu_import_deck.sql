-- edu_import_deck — the transactional server door for IC-11 deck import.
-- Applied live via Supabase MCP 2026-08-18. One canonical writer callable by
-- ANY authed client (frontend, Chrome extension): creates the set, bulk-
-- inserts cards, and writes canonical membership edges via public.assoc_add —
-- atomically. organization_id comes from _stamp_org_default. Scheduling
-- seeding is the separate edu_import_review_history call.

create or replace function public.edu_import_deck(p_deck jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_set_id uuid;
  v_card jsonb;
  v_card_id uuid;
  v_card_ids uuid[] := '{}';
  v_pos integer := 0;
  v_front text;
  v_back text;
  v_skipped integer := 0;
begin
  if v_uid is null then
    raise exception 'edu_import_deck: not authenticated' using errcode = '42501';
  end if;
  if p_deck is null or jsonb_typeof(p_deck) <> 'object'
     or jsonb_typeof(p_deck->'cards') <> 'array' then
    raise exception 'edu_import_deck: p_deck must be {name, cards[]}' using errcode = '22023';
  end if;
  if jsonb_array_length(p_deck->'cards') = 0 then
    raise exception 'edu_import_deck: no cards to import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_deck->'cards') > 5000 then
    raise exception 'edu_import_deck: at most 5000 cards per call' using errcode = '22023';
  end if;

  insert into education.fc_set (name, description, topic, difficulty, metadata)
  values (
    coalesce(nullif(trim(p_deck->>'name'), ''), 'Imported deck'),
    nullif(trim(coalesce(p_deck->>'description', '')), ''),
    nullif(trim(coalesce(p_deck->>'topic', '')), ''),
    nullif(trim(coalesce(p_deck->>'difficulty', '')), ''),
    jsonb_build_object('imported_from', coalesce(p_deck->>'source', 'import'))
  )
  returning id into v_set_id;

  for v_card in select * from jsonb_array_elements(p_deck->'cards') loop
    v_front := trim(coalesce(v_card->>'front', ''));
    v_back := trim(coalesce(v_card->>'back', ''));
    if v_front = '' and v_back = '' then
      v_skipped := v_skipped + 1; continue;
    end if;
    insert into education.fc_card (front, back, card_kind, difficulty, topic, metadata)
    values (
      case when v_front <> '' then v_front else v_back end,
      case when v_front <> '' then v_back else '' end,
      coalesce(nullif(v_card->>'card_kind', ''), 'basic'),
      nullif(v_card->>'difficulty', ''),
      nullif(v_card->>'topic', ''),
      coalesce(v_card->'metadata', '{}'::jsonb)
    )
    returning id into v_card_id;
    v_card_ids := v_card_ids || v_card_id;

    perform public.assoc_add(
      p_source_type => 'fc_card',
      p_source_id => v_card_id,
      p_target_type => 'fc_set',
      p_target_id => v_set_id,
      p_org_id => null,
      p_label => null,
      p_metadata => null,
      p_role => 'member',
      p_position => v_pos,
      p_payload_kind => null,
      p_payload => null
    );
    v_pos := v_pos + 1;
  end loop;

  if v_pos = 0 then
    raise exception 'edu_import_deck: every card was empty' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'set_id', v_set_id,
    'name', (select name from education.fc_set where id = v_set_id),
    'card_count', v_pos,
    'skipped', v_skipped,
    'card_ids', to_jsonb(v_card_ids)
  );
end $function$;

revoke all on function public.edu_import_deck(jsonb) from public, anon;
grant execute on function public.edu_import_deck(jsonb) to authenticated;
