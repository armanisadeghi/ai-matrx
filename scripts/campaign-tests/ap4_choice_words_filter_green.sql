-- AP-4 — A CUSTOM CHOICE FIELD IS FILTERED BY THE WORD A PERSON SEES, IN EVERY READ DOOR.
--
-- THE USE CASE (no fake data): Oak Street Studio's contacts carry its "Preferred channel" choice
-- field (Email / Phone / Text message). Dana Ruiz prefers a text message, Mari Okonkwo email. The
-- owner (admin@admin.com) asks "who wants a text message?" — in the word on her screen, the same word
-- the write door accepted. Elfrieda Weber (persona factory) runs her own organization, no tie to the
-- studio.
--
-- 1 · platform.drill_rows (the Table API path, api: true, and a drill page, api: false): where on the
--     field = "Text message" returns Dana and only Dana; the stored key text_message still does; a list
--     and {in: [...]} of words return Dana and Mari; a word that names no choice returns 0 rows.
-- 2 · platform.drill_ask counts the same filter: 1.
-- 3 · custom.entity_records_find (p_value "Text message") returns Dana and echoes the value as asked;
--     the stored key still works.
-- 4 · Elfrieda never sees Dana through the word filter: in her own organization the studio's column
--     is not hers, and the studio's name is refused.
--
-- RED TWIN: ap4_choice_words_filter_red.sql takes the mapping back out of platform._drill_plan and
-- custom.entity_records_find inside its own rolled-back transaction and requires "Text message" to
-- find nobody. Ends in ROLLBACK.

\set suite 'ap4_choice_words_filter_green.sql'
\set requires 'function:custom.choice_value_keys|function:platform.drill_rows|function:custom.entity_records_find'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;

do $$
declare
  c_owner    uuid := '87a6e699-3622-4869-8843-d0867456c0dd';  -- admin@admin.com, studio owner
  c_outsider uuid := 'c62de98e-46e2-4bc4-bfe3-8b19e7909e32';  -- elfrieda.weber.859b00@fixtures.aimatrx.com
  c_outsider_org uuid := '92f75c84-3df2-4b36-b570-01c4d170b470'; -- Elfrieda's Org
  c_studio   uuid := '2643e470-b275-47f3-95f3-ae275ad3ca47';  -- Oak Street Studio
  c_col      text := 'cf:2e39664c-91bf-4eea-8de7-2736189bbd54'; -- "Preferred channel"
  c_dana     uuid := '686f46e7-74d4-48df-8e54-aff77a22114e';
  c_mari     uuid := 'febe7f2c-615d-4fcd-9f5f-e2b86b0e79f4';
  v_boss     text := current_user;
  v_api      boolean;
  v_res      jsonb; v_ids uuid[]; v_n bigint; v_state text;
begin
  perform set_config('app.actor_system', 'campaign.ap4_choice_words_filter_suite', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_owner::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ══ 1 · drill_rows, both paths ═══════════════════════════════════════════════════════════════
  foreach v_api in array array[true, false] loop
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'Text message'), 'limit', 50));
    select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
    if v_ids is distinct from array[c_dana] then
      raise exception '1a (api %): "Text message" should find Dana alone, found %', v_api, v_ids;
    end if;
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'text_message'), 'limit', 50));
    select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
    if v_ids is distinct from array[c_dana] then
      raise exception '1b (api %): the stored key text_message should still find Dana alone, found %', v_api, v_ids;
    end if;
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, jsonb_build_object('in', jsonb_build_array('Text message', 'Email'))), 'limit', 50));
    select coalesce(array_agg((r ->> 'id')::uuid order by r ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
    if v_ids is distinct from (select array_agg(x order by x::text) from unnest(array[c_dana, c_mari]) x) then
      raise exception '1c (api %): {in: [Text message, Email]} should find Dana and Mari, found %', v_api, v_ids;
    end if;
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, jsonb_build_array('Text message')), 'limit', 50));
    select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
    if v_ids is distinct from array[c_dana] then
      raise exception '1d (api %): a list of one word should find Dana alone, found %', v_api, v_ids;
    end if;
    v_res := platform.drill_rows(c_studio, jsonb_build_object('kind', 'entity', 'token', 'party', 'api', v_api),
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'Carrier pigeon'), 'limit', 50));
    if jsonb_array_length(v_res -> 'rows') <> 0 then
      raise exception '1e (api %): a word that names no choice should find nobody, found %', v_api, v_res -> 'rows';
    end if;
  end loop;

  -- ══ 2 · drill_ask counts it ══════════════════════════════════════════════════════════════════
  select (a.measures ->> 'count')::bigint into v_n
    from platform.drill_ask(c_studio, '{"kind":"entity","token":"party"}'::jsonb,
                            jsonb_build_object('where', jsonb_build_object(c_col, 'Text message'))) a
   where a.kind = 'total';
  if v_n is distinct from 1 then
    raise exception '2: drill_ask should count 1 contact who wants a text message, counted %', v_n;
  end if;

  -- ══ 3 · entity_records_find ══════════════════════════════════════════════════════════════════
  v_res := custom.entity_records_find(c_studio, 'party', 'preferred_channel', '"Text message"'::jsonb, 50, 0);
  select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
  if v_ids is distinct from array[c_dana] or v_res ->> 'value' is distinct from 'Text message' then
    raise exception '3a: entity_records_find "Text message" should find Dana and echo the word, answered %', v_res;
  end if;
  v_res := custom.entity_records_find(c_studio, 'party', 'preferred_channel', '"text_message"'::jsonb, 50, 0);
  select coalesce(array_agg((r ->> 'id')::uuid), '{}') into v_ids from jsonb_array_elements(v_res -> 'rows') r;
  if v_ids is distinct from array[c_dana] then
    raise exception '3b: entity_records_find by the stored key should still find Dana, found %', v_ids;
  end if;

  -- ══ 4 · A SECOND ORGANIZATION'S MEMBER ══════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', c_outsider::text, 'role', 'authenticated')::text, true);
  begin
    v_res := platform.drill_rows(c_outsider_org, '{"kind":"entity","token":"party","api":true}'::jsonb,
                                 jsonb_build_object('where', jsonb_build_object(c_col, 'Text message'), 'limit', 50));
    if exists (select 1 from jsonb_array_elements(v_res -> 'rows') r where (r ->> 'id')::uuid = c_dana) then
      raise exception '4a: LEAK — the outsider found Dana through the studio''s choice field';
    end if;
  exception when sqlstate '22023' or sqlstate '42703' then null;   -- the column is not hers: refused by name
  end;
  begin
    perform platform.drill_rows(c_studio, '{"kind":"entity","token":"party","api":true}'::jsonb,
                                jsonb_build_object('where', jsonb_build_object(c_col, 'Text message')));
    raise exception '4b: the outsider asked in the studio''s name and was not refused';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.entity_records_find(c_studio, 'party', 'preferred_channel', '"Text message"'::jsonb, 50, 0);
    raise exception '4c: the outsider searched the studio''s contacts and was not refused';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', v_boss, true);
  raise notice 'ap4_choice_words_filter_green: all clauses passed — the word, the key, a list and in find the right contacts in drill_rows (both paths), drill_ask and entity_records_find; an unknown word finds nobody; an outsider finds nothing';
end $$;

rollback;
