-- LANE CHOICE-COLUMN-EDIT — THE GREEN SUITE. A choice column's choices are re-worded, added,
-- retired (soft) and reordered where they live, on a MOVED table exactly as on a native one:
--   · custom.field_update `options` takes {id, words} entries: a re-worded choice is the SAME
--     option (same id, same key), so every cell that holds it reads the new words; an entry with
--     no id adds; a choice the list no longer names is retired (archived, never deleted); every
--     option gets the position it has in the list. It writes the options table's own title field
--     (`name` on a mover's copy), which is why a moved column is editable at all;
--   · a moved pick-list choice the mover left without a stamped key keeps the key its cells hold
--     when it is re-worded (custom._resolve_choice_words);
--   · `options_add` adds without touching the rest; custom.record_update_adding_choices adds a
--     typed word and saves the cell in ONE transaction; custom.choice_nudge answers the knob;
--   · before the press, a choice a person retired on a list's copy is not "not copied" (readiness
--     and the press's own list archive), and one a person added on the copy is not "removed on
--     the older side" (Copy again would archive it);
--   · Switch back carries a column's own choice edits (and the older cells of a re-worded choice)
--     and a pick list's copy (re-worded, added, retired) into the older tables.
--
-- THE REAL USE CASE: admin@admin.com's Workspace on the clone. "Table 1 · 2nd" has a Continent
-- column with its own choices (Africa, Asia, Europe, North America, Oceania2, South America) and a
-- Country column that chooses from the pick list "Countries by Continent". Before switching, the
-- owner takes Kenya and Egypt off the list's copy and adds Portugal. After switching she fixes the
-- typo "Oceania2" → "Oceania", writes "Europe (EU)", adds Antarctica at the top, drops South
-- America; on the list she writes "France (FR)" and "United States of America"; a cell typed
-- "Andorra" is added to the list as it is saved. Then she switches back. Everything is rolled back.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/choicecolumnedit_green.sql
-- ITS RED: without the campaign file (after its inverse) it fails at 0 (no door); with the file's
-- field_update body alone it fails at A (a retired copy choice says "not copied").

\set ON_ERROR_STOP on
\timing off

\set suite 'choicecolumnedit_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '20s';
set local statement_timeout = '300s';

-- ── 0. the file is there ──
do $t$
begin
  if to_regprocedure('custom._field_choices_save(uuid,uuid,jsonb,boolean)') is null
     or to_regprocedure('custom.record_update_adding_choices(uuid,uuid,jsonb,jsonb,integer)') is null
     or to_regprocedure('custom.choice_nudge(uuid)') is null
     or not exists (select 1 from platform.feature_knob where feature = 'custom' and key = 'choice_nudge') then
    raise exception '0: no choice door — a moved column''s choices cannot be re-worded or added to, and a cell cannot add what was typed';
  end if;
  if not has_function_privilege('authenticated', 'custom.record_update_adding_choices(uuid,uuid,jsonb,jsonb,integer)', 'execute')
     or not has_function_privilege('authenticated', 'custom.choice_nudge(uuid)', 'execute')
     or has_function_privilege('authenticated', 'custom._field_choices_save(uuid,uuid,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'custom.record_update_adding_choices(uuid,uuid,jsonb,jsonb,integer)', 'execute') then
    raise exception '0b: a door is reachable by a role it must not be';
  end if;
end
$t$;

create temp table _cc on commit drop as
  select '87a6e699-3622-4869-8843-d0867456c0dd'::uuid as admin,
         '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'::uuid as ws,
         (select d.id from workbench.udt_datasets d
           where d.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'
             and d.table_name = 'Table 1 · 2nd' and d.deleted_at is null limit 1) as tbl,
         null::uuid as continent, null::uuid as country, null::uuid as copts, null::uuid as lst,
         gen_random_uuid() as press_new, gen_random_uuid() as press_old;
update _cc set
  continent = (select cf.id from custom.record cf where cf.organization_id = _cc.ws and cf.data_class = 'field'
                and cf.deleted_at is null and cf.data ->> 'entity_definition_id' = _cc.tbl::text and cf.data ->> 'key' = 'continent'),
  country   = (select cf.id from custom.record cf where cf.organization_id = _cc.ws and cf.data_class = 'field'
                and cf.deleted_at is null and cf.data ->> 'entity_definition_id' = _cc.tbl::text and cf.data ->> 'key' = 'country');
update _cc set
  copts = (select (cf.data -> 'config' ->> 'options_table_id')::uuid from custom.record cf where cf.id = _cc.continent),
  lst   = (select (cf.data -> 'config' ->> 'options_table_id')::uuid from custom.record cf where cf.id = _cc.country);
grant select on _cc to authenticated;

do $t$
declare f _cc;
begin
  select * into f from _cc;
  if f.tbl is null or f.continent is null or f.country is null or f.copts is null or f.lst is null
     or not exists (select 1 from workbench.udt_structured_lists l where l.id = f.lst and l.deleted_at is null) then
    raise exception 'fixture: admin''s Workspace needs the live older table "Table 1 · 2nd" with its copied Continent and Country columns and the live list "Countries by Continent"';
  end if;
  if (platform._cutover_seam_last_done('older_tables', f.ws)).direction = 'new' then
    raise exception 'fixture: admin''s Workspace is already switched on this database';
  end if;
end
$t$;

-- ── A. before the press, in the owner's seat: Kenya and Egypt off the list's copy, Portugal added ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicecol0001"}', true);

do $t$
declare f _cc; v_entries jsonb;
begin
  select * into f from _cc;
  select jsonb_agg(jsonb_build_object('id', o.id, 'words', o.data ->> 'name') order by o.data ->> 'name') into v_entries
    from custom.field_options(f.ws, f.country) o where o.deleted_at is null
     and o.data ->> 'name' not in ('Kenya', 'Egypt');
  perform custom.field_update(f.ws, f.country, jsonb_build_object('options', v_entries));
  perform custom.field_update(f.ws, f.country, jsonb_build_object('options_add', jsonb_build_array('Portugal')));
end
$t$;

reset role;
do $t$
declare f _cc; v jsonb; v_rm jsonb;
begin
  select * into f from _cc;
  if (select count(*) from custom.record o where o.table_id = f.lst and o.data ->> 'name' in ('Kenya', 'Egypt') and o.deleted_at is not null) <> 2 then
    raise exception 'Apre: Kenya and Egypt are not retired (archived) on the list''s copy';
  end if;
  if not exists (select 1 from custom.record o where o.table_id = f.lst and o.data ->> 'name' = 'Portugal' and o.deleted_at is null
                  and not (o.data ? 'title')) then
    raise exception 'Apre2: Portugal was not added to the list''s copy in its own title field (name)';
  end if;
  v := (select c from jsonb_array_elements(platform._cutover_seam_readiness('older_tables', f.ws) -> 'checks') c
         where c ->> 'key' = 'lists_copied');
  if not (v ->> 'met')::boolean then
    raise exception 'A: two choices a person retired on the copy read as "not copied yet", which Copy again can never clear: %', v ->> 'detail';
  end if;
  v_rm := platform.cutover_older_removals(f.ws);
  if exists (select 1 from platform.cutover_older_removal_rows(f.ws) r where r.what like '%Portugal%') then
    raise exception 'A2: a choice a person added on the copy is counted as removed on the older side (Copy again would archive it): %', v_rm;
  end if;
end
$t$;

-- ── B. the press (as the database owner, what platform.cutover_seam_press does after readiness) ──
do $t$
declare f _cc; v_did jsonb;
begin
  select * into f from _cc;
  v_did := platform._cutover_seam_apply('older_tables', f.ws, 'new', f.admin, f.press_new);
  -- One transaction has one now(): the press is dated a minute earlier so the edits below come after it,
  -- as they do when a person makes them after pressing.
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note, pressed_at)
  values (f.press_new, 'older_tables', f.ws, 'new', 'done', 'Switched to the new system.', f.admin, v_did, 'choicecolumnedit_green',
          now() - interval '1 minute');
  if not coalesce(v_did -> 'archived_lists', '[]'::jsonb) @> to_jsonb(array[f.lst::text]) then
    raise exception 'B: the press did not archive the older list whose retired choices live on its copy (%)', v_did -> 'archived_lists';
  end if;
end
$t$;

-- ── C. switched, in the owner's seat ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicecol0002"}', true);

do $t$
declare
  f _cc; v_id uuid; v_e jsonb; v_err text; v_ver int; v_row uuid; v_words text;
  id_europe uuid; id_oceania uuid; id_sa uuid; id_fr uuid; id_us uuid;
begin
  select * into f from _cc;
  select id into id_europe  from custom.field_options(f.ws, f.continent) where data ->> 'name' = 'Europe' and deleted_at is null;
  select id into id_oceania from custom.field_options(f.ws, f.continent) where data ->> 'name' = 'Oceania2' and deleted_at is null;

  -- C1. the column's own choices: a new one first, two re-worded, one dropped, the rest reordered
  perform custom.field_update(f.ws, f.continent, jsonb_build_object('options', jsonb_build_array(
    'Antarctica',
    jsonb_build_object('id', (select id from custom.field_options(f.ws, f.continent) where data ->> 'name' = 'Africa' and deleted_at is null), 'words', 'Africa'),
    jsonb_build_object('id', (select id from custom.field_options(f.ws, f.continent) where data ->> 'name' = 'Asia' and deleted_at is null), 'words', 'Asia'),
    jsonb_build_object('id', id_europe, 'words', 'Europe (EU)'),
    jsonb_build_object('id', (select id from custom.field_options(f.ws, f.continent) where data ->> 'name' = 'North America' and deleted_at is null), 'words', 'North America'),
    jsonb_build_object('id', id_oceania, 'words', 'Oceania'))));
end
$t$;

reset role;
do $t$
declare f _cc; v_key text; v_words text;
begin
  select * into f from _cc;
  if (select data ->> 'name' from custom.record where table_id = f.copts and metadata ->> 'option_key' = 'oceania2') is distinct from 'Oceania'
     or (select deleted_at from custom.record where table_id = f.copts and metadata ->> 'option_key' = 'oceania2') is not null then
    raise exception 'C1: "Oceania2" was not re-worded IN PLACE to "Oceania" (same option, same key)';
  end if;
  if exists (select 1 from custom.record where table_id = f.copts and data ? 'title') then
    raise exception 'C1b: a choice was written into a `title` field the mover''s options table does not have';
  end if;
  -- the cell that held Oceania2 still holds its key and now reads "Oceania"
  select custom.field_words(f.ws, f.continent, r.data -> 'continent') into v_words
    from custom.record r where r.id = '04becacc-682e-4b74-bef2-27b348bd5faf';
  if v_words is distinct from 'Oceania' then
    raise exception 'C1c: the cell that held Oceania2 reads "%" instead of "Oceania"', v_words;
  end if;
  if (select deleted_at from custom.record where table_id = f.copts and data ->> 'name' = 'South America') is null then
    raise exception 'C1d: South America, which the list no longer names, was not retired';
  end if;
  if not exists (select 1 from custom.record where id in (select id from custom.record where table_id = f.copts and data ->> 'name' = 'South America')) then
    raise exception 'C1e: South America was deleted instead of archived';
  end if;
  if (select string_agg(data ->> 'name', ',' order by (metadata ->> 'option_position')::int)
        from custom.record where table_id = f.copts and deleted_at is null)
     is distinct from 'Antarctica,Africa,Asia,Europe (EU),North America,Oceania' then
    raise exception 'C1f: the choices are not in the order given: %',
      (select string_agg(data ->> 'name', ',' order by (metadata ->> 'option_position')::int nulls last)
         from custom.record where table_id = f.copts and deleted_at is null);
  end if;
  -- the South America cell keeps its (retired) choice and still reads as its words
  select custom.field_words(f.ws, f.continent, r.data -> 'continent') into v_words
    from custom.record r where r.id = '75ca0fe9-7b4e-4503-b65b-33e034f7736e';
  if v_words is distinct from 'South America' then
    raise exception 'C1g: the cell holding the retired South America reads "%"', v_words;
  end if;
end
$t$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-choicecol0003"}', true);

do $t$
declare f _cc; v_entries jsonb; v_err text; v_ver int;
begin
  select * into f from _cc;
  -- C2. the pick list's copy: two choices the mover left unkeyed are re-worded
  select jsonb_agg(jsonb_build_object('id', o.id, 'words',
           case o.data ->> 'name' when 'France' then 'France (FR)' when 'United States' then 'United States of America'
                else o.data ->> 'name' end) order by o.data ->> 'name') into v_entries
    from custom.field_options(f.ws, f.country) o where o.deleted_at is null;
  perform custom.field_update(f.ws, f.country, jsonb_build_object('options', v_entries));

  -- C3. a cell typed "Andorra", added as it is saved, in one transaction
  v_ver := custom.record_update_adding_choices(f.ws, '75ca0fe9-7b4e-4503-b65b-33e034f7736e'::uuid,
             jsonb_build_object('country', 'Andorra'), jsonb_build_object('country', jsonb_build_array('Andorra')));

  -- C4. the knob, as she reads it
  if custom.choice_nudge(f.ws) is distinct from 'ask' then
    raise exception 'C4: custom/choice_nudge does not answer its default "ask" (%)', custom.choice_nudge(f.ws);
  end if;

  -- C5. adding choices and changing what the column stores in one save is refused by name
  begin
    perform custom.field_update(f.ws, f.continent, jsonb_build_object('type', 'text', 'options_add', jsonb_build_array('Zealandia')));
    raise exception 'C5: options_add beside a retype was accepted (and would have been dropped)';
  exception when sqlstate '23514' then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%two saves%' then raise; end if;
  end;
end
$t$;

reset role;
do $t$
declare f _cc; v_words text;
begin
  select * into f from _cc;
  if (select metadata ->> 'option_key' from custom.record where table_id = f.lst and data ->> 'name' = 'United States of America') is distinct from 'united_states' then
    raise exception 'C2: re-wording an unkeyed moved choice changed its key (cells holding "united_states" now point at nothing): %',
      (select metadata ->> 'option_key' from custom.record where table_id = f.lst and data ->> 'name' = 'United States of America');
  end if;
  select custom.field_words(f.ws, f.country, r.data -> 'country') into v_words
    from custom.record r where r.id = 'f3413922-4399-4c32-b547-f770510ccc59';
  if v_words is distinct from 'United States of America' then
    raise exception 'C2b: the cell that held United States reads "%"', v_words;
  end if;
  if (select r.data ->> 'country' from custom.record r where r.id = '75ca0fe9-7b4e-4503-b65b-33e034f7736e') is distinct from 'andorra'
     or not exists (select 1 from custom.record o where o.table_id = f.lst and o.data ->> 'name' = 'Andorra' and o.deleted_at is null) then
    raise exception 'C3: the typed "Andorra" was not added to the list and taken by the cell (cell = %)',
      (select r.data -> 'country' from custom.record r where r.id = '75ca0fe9-7b4e-4503-b65b-33e034f7736e');
  end if;
  -- the relationship to the older list holds: same id, still marked as its copy, the older list archived with moved_to
  if not exists (select 1 from custom.record t where t.id = f.lst and t.data_class = 'table'
                  and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists')
     or not exists (select 1 from workbench.udt_structured_lists l where l.id = f.lst and l.deleted_at is not null and l.metadata ? 'moved_to') then
    raise exception 'C6: the list''s copy relationship to the older list no longer holds';
  end if;
end
$t$;

-- ── D. Switch back: the plan says what it carries; then it carries it ──
do $t$
declare f _cc; v_last platform.cutover_seam_press; v jsonb; v_says text;
begin
  select * into f from _cc;
  select * into v_last from platform.cutover_seam_press where id = f.press_new;
  v := platform._cutover_carry_back(f.ws, v_last, false);
  v_says := (select string_agg(x, ' ') from jsonb_array_elements_text(v -> 'says') x);
  if v_says not like '%Countries by Continent: 2 re-worded choices, 2 new choices, 2 removed choices and 1 cell holding a re-worded choice are carried back into the older list.%' then
    raise exception 'D: the Switch back plan does not say the list''s edits are carried back: %', v_says;
  end if;
  if v_says not like '%Table 1 · 2nd:%the changed choices of 1 column%' then
    raise exception 'D2: the Switch back plan does not say the column''s own choices are carried back: %', v_says;
  end if;

  perform platform._cutover_seam_apply('older_tables', f.ws, 'old', f.admin, f.press_old);
  v := platform._cutover_carry_back(f.ws, v_last, true, f.press_old, f.admin, true);
  insert into platform.cutover_seam_press (id, seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values (f.press_old, 'older_tables', f.ws, 'old', 'done', 'Switched back.', f.admin, jsonb_build_object('carried_back', v), 'choicecolumnedit_green');
end
$t$;

do $t$
declare f _cc; v_ch text;
begin
  select * into f from _cc;
  select string_agg(case when jsonb_typeof(c) = 'object' then c ->> 'value' else c #>> '{}' end, ',' order by n) into v_ch
    from workbench.udt_dataset_fields o, jsonb_array_elements(o.metadata #> '{format,options,choices}') with ordinality a(c, n)
   where o.id = f.continent;
  if v_ch is distinct from 'Antarctica,Africa,Asia,Europe (EU),North America,Oceania' then
    raise exception 'E1: the older Continent column''s choices are not the copy''s: %', v_ch;
  end if;
  if (select w.data ->> 'continent' from workbench.udt_dataset_rows w where w.id = '04becacc-682e-4b74-bef2-27b348bd5faf') is distinct from 'Oceania' then
    raise exception 'E2: the older cell that held Oceania2 was not re-worded: %',
      (select w.data ->> 'continent' from workbench.udt_dataset_rows w where w.id = '04becacc-682e-4b74-bef2-27b348bd5faf');
  end if;
  if (select string_agg(i.label, ',' order by i.label) from workbench.udt_structured_list_items i
       where i.list_id = f.lst and i.deleted_at is null and i.label in ('France (FR)', 'United States of America', 'Portugal', 'Andorra', 'Kenya', 'Egypt', 'France', 'United States'))
     is distinct from 'Andorra,France (FR),Portugal,United States of America' then
    raise exception 'E3: the older list is not what its copy was: %',
      (select string_agg(i.label, ',' order by i.label) from workbench.udt_structured_list_items i where i.list_id = f.lst and i.deleted_at is null);
  end if;
  if (select count(*) from workbench.udt_structured_list_items i where i.list_id = f.lst and i.label in ('Kenya', 'Egypt') and i.deleted_at is not null) <> 2 then
    raise exception 'E4: Kenya and Egypt, retired on the copy, are not retired (archived) on the older list';
  end if;
  if (select w.data ->> 'country' from workbench.udt_dataset_rows w where w.id = 'f3413922-4399-4c32-b547-f770510ccc59') is distinct from 'United States of America'
     or (select w.data ->> 'country' from workbench.udt_dataset_rows w where w.id = '75ca0fe9-7b4e-4503-b65b-33e034f7736e') is distinct from 'Andorra' then
    raise exception 'E5: the older Country cells do not carry the new words (US row %, the Andorra row %)',
      (select w.data ->> 'country' from workbench.udt_dataset_rows w where w.id = 'f3413922-4399-4c32-b547-f770510ccc59'),
      (select w.data ->> 'country' from workbench.udt_dataset_rows w where w.id = '75ca0fe9-7b4e-4503-b65b-33e034f7736e');
  end if;
  raise notice 'choicecolumnedit_green.sql: GREEN — re-worded in place (keys kept), added, retired, reordered on a moved column and a moved pick list; one-save add; readiness and removals count person edits as edits; Switch back carries all of it.';
end
$t$;

rollback;
