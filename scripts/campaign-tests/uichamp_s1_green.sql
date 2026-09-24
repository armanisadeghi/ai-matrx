-- LANE S1' VIEW-KEYS — THE GREEN SUITE. Every per-view setting is a declared key of the one saved
-- view, judged by custom.view_declare's shape guard and merged on update.
--
-- THE USE CASE (_uichamp_s1_harbor_point.sql): Marisol Vega (test@test.com) dispatches for Harbor
-- Point Plumbing & Drain. She saves her dispatch board: columns by Status, swimlanes by Technician,
-- Done collapsed, Price summed under every column, cards sorted by Priority then by Window,
-- filtered (S2-PRIME's `where`) to (Emergency OR Warranty) AND NOT Cancelled, coloured by Priority, the Job column
-- pinned, 40-pixel rows, the grid grouped by Technician then by Priority with one section shut,
-- the calendar on Window, the gallery's cover the Site photo. The owner (admin@admin.com) opens
-- the same view.
--
-- RUN IT (from matrx-frontend):
--   "$PSQL" "<clone or branch DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/uichamp_s1_green.sql
--
-- WHAT MAKES IT FAIL — one clause per part:
--   0  custom.view_keys() is absent, a signed-in person holds no EXECUTE on it, or it does not
--      declare every key this suite sets.
--   A  a key Marisol saves does not come back, the same, through custom.views for her AND the
--      owner — or a Field she named by id is stored by id instead of by its key.
--   B  the view's filter does not narrow custom.pipeline_board through S2's filter argument
--      (New 2 / $850, Scheduled 3 / $595, On site 1 / $1,320, Done 2 / $1,070, Cancelled 0).
--   C  a setting the store cannot honour is STORED: an undeclared key; an undeclared look;
--      clearing a setting no view has; an archived colour field; a free-text colour field; four
--      grouping levels; the same field at two levels; a sixth sort; one column sorted twice; a
--      direction that is neither; the column sum on a word; the calendar on a price; the
--      swimlanes on the board's own columns; a Field of another Table; a question node a list
--      cannot ask; a Rule under the flat filters; a question that is no Rule; a row 200 pixels
--      tall; a kind of view nobody draws. And a refusal must change nothing.
--   D  an update that omits a key drops it (hidden columns, swimlane, sorts), or a column archived
--      AFTER the view named it makes the next unrelated save fail.
--   E  a stranger saves or reads a view of Harbor Point's Jobs.
-- RED on S0's body: part 0 (view_keys absent); and with `-v red_probe=1` every clause of A and C
-- runs and the suite names each key the door stored unjudged. GREEN after both lane files.

\set ON_ERROR_STOP on
\timing off
\set suite 'uichamp_s1_green.sql'
\set requires 'function:custom.view_declare|function:custom.views|function:custom.pipeline_board'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- ══ 0. THE REGISTRY, AND ITS DOOR, BEFORE THE FIXTURE ══
-- `-v red_probe=1` (the RED run on S0's body): part 0 only says what is missing, so every later
-- clause runs and names each key the door does not judge.
\if :{?red_probe}
\else
\set red_probe 0
\endif
select set_config('s1.red_probe', :'red_probe', false);

do $g$
declare v_missing text;
begin
  if current_setting('s1.red_probe') = '1' then
    raise notice 'S1 part 0 SKIPPED (red probe) — custom.view_keys() present: %', to_regprocedure('custom.view_keys()') is not null;
    return;
  end if;
  if to_regprocedure('custom.view_keys()') is null then
    raise exception 'S1-0: custom.view_keys() is not on this database — apply uichamp_s1_a_view_keeps_every_setting_it_is_given.sql';
  end if;
  if not has_function_privilege('authenticated', 'custom.view_keys()', 'execute') then
    raise exception 'S1-0: a signed-in person holds no EXECUTE on custom.view_keys() — apply uichamp_s1_a_signed_in_person_may_read_the_view_keys.sql';
  end if;
  select string_agg(w, ', ') into v_missing
    from unnest(array['layout','filters','group_field','swimlane_field','collapsed_columns','measure','date_field',
                      'image_field','sorts','where','presentation.style','presentation.frozen','presentation.grouping',
                      'presentation.rowHeight','presentation.hiddenFields','grid','order','moved_from']) w
   where not exists (select 1 from custom.view_keys() k where k.path = w);
  if v_missing is not null then
    raise exception 'S1-0: the registry does not declare %', v_missing;
  end if;
  raise notice 'S1 part 0 PASS — custom.view_keys() declares every key this suite sets, and a signed-in person may read it.';
end $g$;

\i scripts/campaign-tests/_uichamp_s1_harbor_point.sql

do $t$
declare
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_marisol_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  v_org uuid; v_jobs uuid; v_view uuid; v_other uuid;
  f_tech text; f_priority text; f_status text; f_price text; f_window text; f_job text; f_legacy text;
  f_crew text; f_customer text; f_photo text; f_address text;
  e_filter jsonb; v_def jsonb; v_before jsonb; v_after jsonb; v_board jsonb; v_seat text;
  v_row record; v_n integer; v_caught text; v_case record; v_fails text[] := '{}'; v_red text[] := '{}';
begin
  select v into v_org from s1 where k = 'org'; select v into v_jobs from s1 where k = 'jobs';
  select v::text into f_tech from s1 where k = 'f_tech';        select v::text into f_priority from s1 where k = 'f_priority';
  select v::text into f_status from s1 where k = 'f_status';    select v::text into f_price from s1 where k = 'f_price';
  select v::text into f_window from s1 where k = 'f_window';    select v::text into f_job from s1 where k = 'f_job';
  select v::text into f_legacy from s1 where k = 'f_legacy';    select v::text into f_crew from s1 where k = 'f_crew';
  select v::text into f_customer from s1 where k = 'f_customer'; select v::text into f_photo from s1 where k = 'f_photo';
  select v::text into f_address from s1 where k = 'f_address';

  -- (Emergency OR Warranty) AND NOT Cancelled — the condition builder's Rule, Fields by id.
  e_filter := jsonb_build_object('op','and','args', jsonb_build_array(
    jsonb_build_object('op','or','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_priority), jsonb_build_object('const','emergency'))),
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_priority), jsonb_build_object('const','warranty'))))),
    jsonb_build_object('op','not','args', jsonb_build_array(
      jsonb_build_object('op','eq','args', jsonb_build_array(jsonb_build_object('field', f_status), jsonb_build_object('const','cancelled')))))));

  -- ══ A. MARISOL SAVES HER BOARD, AND BOTH SEATS READ IT BACK ══
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_marisol_j, true);
  v_view := custom.view_declare(v_org, v_jobs, jsonb_build_object(
    'name', 'Dispatch board',
    'definition', jsonb_build_object(
      'where', e_filter,                                          -- S2-PRIME's board filter
      'layout', 'kanban',
      'group_field', 'status',
      'swimlane_field', f_tech,                                   -- by id: stored by key
      'collapsed_columns', jsonb_build_array('done'),
      'measure', 'price',
      'sorts', jsonb_build_array(
        jsonb_build_object('field', f_priority, 'direction', 'asc'),
        jsonb_build_object('field', 'arrival_window', 'direction', 'asc')),
      'date_field', 'arrival_window',
      'image_field', 'site_photo',
      'is_default', false,
      'hidden_fields', jsonb_build_array(f_price),                 -- the mover's shape: ids
      'presentation', jsonb_build_object(
        'style', jsonb_build_object('version', 1, 'colorBy', jsonb_build_object('field', f_priority, 'target', 'row')),
        'frozen', jsonb_build_array(f_job),
        'rowHeight', 40,
        'grouping', jsonb_build_object('field', 'technician',
                                       'then', jsonb_build_array(jsonb_build_object('field', f_priority)),
                                       'collapsed', jsonb_build_array('s:tom_lindqvist')),
        'gallerySize', 'large'))));

  foreach v_seat in array array['marisol', 'owner'] loop
    perform set_config('request.jwt.claims', case v_seat when 'marisol' then c_marisol_j else c_admin_j end, true);
    select * into v_row from custom.views(v_org, v_jobs) where view_id = v_view;
    v_def := v_row.definition;
    if v_row.view_id is null then
      raise exception 'S1-A (%): the Dispatch board is not listed by custom.views', v_seat;
    end if;
    select string_agg(w.k, ', ') into v_caught from (values
      ('layout',            v_def ->> 'layout' = 'kanban'),
      ('group_field',       v_def ->> 'group_field' = 'status'),
      ('swimlane_field',    v_def ->> 'swimlane_field' = 'technician'),
      ('collapsed_columns', v_def -> 'collapsed_columns' = '["done"]'::jsonb),
      ('measure',           v_def ->> 'measure' = 'price'),
      ('sorts',             v_def -> 'sorts' = '[{"field":"priority","direction":"asc"},{"field":"arrival_window","direction":"asc"}]'::jsonb),
      ('date_field',        v_def ->> 'date_field' = 'arrival_window'),
      ('image_field',       v_def ->> 'image_field' = 'site_photo'),
      ('presentation.style.colorBy', v_def -> 'presentation' -> 'style' -> 'colorBy' ->> 'field' = 'priority'),
      ('presentation.frozen',   v_def -> 'presentation' -> 'frozen' = '["job_no"]'::jsonb),
      ('presentation.rowHeight', v_def -> 'presentation' ->> 'rowHeight' = '40'),
      ('presentation.grouping', v_def -> 'presentation' -> 'grouping' ->> 'field' = 'technician'
                                 and v_def -> 'presentation' -> 'grouping' -> 'then' -> 0 ->> 'field' = 'priority'
                                 and v_def -> 'presentation' -> 'grouping' -> 'collapsed' = '["s:tom_lindqvist"]'::jsonb),
      ('presentation.hiddenFields', v_def -> 'presentation' -> 'hiddenFields' = '["price"]'::jsonb),
      ('presentation.gallerySize',  v_def -> 'presentation' ->> 'gallerySize' = 'large'),
      ('where',             v_def -> 'where' = e_filter)
    ) w(k, ok) where w.ok is not true;
    if v_row.view_id is null or v_caught is not null then
      if current_setting('s1.red_probe') = '1' then
        v_red := v_red || format('A (%s): %s', v_seat, v_caught);
      else
        raise exception 'S1-A (%): these keys did not come back as saved: % — definition %', v_seat, v_caught, v_def;
      end if;
    end if;
  end loop;
  if cardinality(v_red) = 0 then raise notice 'S1 part A PASS — every key of the Dispatch board comes back the same for Marisol and the owner; the swimlane, sort, colour, pinned and sub-group Fields she named by id are stored by key.'; end if;

  -- ══ B. THE VIEW'S FILTER NARROWS THE BOARD THROUGH S2''s FILTER ARGUMENT ══
  perform set_config('request.jwt.claims', c_marisol_j, true);
  select v.definition, v.definition -> 'where' into v_def, e_filter from custom.views(v_org, v_jobs) v where v.view_id = v_view;
  select jsonb_object_agg(b.stage_key, jsonb_build_object('cards', b.cards, 'total', coalesce(b.total, 0))) into v_board
    from custom.pipeline_board(v_org, v_jobs, v_def ->> 'measure', e_filter) b;
  if (v_board #>> '{new,cards}')::int <> 2 or (v_board #>> '{new,total}')::numeric <> 850
     or (v_board #>> '{scheduled,cards}')::int <> 3 or (v_board #>> '{scheduled,total}')::numeric <> 595
     or (v_board #>> '{on_site,cards}')::int <> 1 or (v_board #>> '{on_site,total}')::numeric <> 1320
     or (v_board #>> '{done,cards}')::int <> 2 or (v_board #>> '{done,total}')::numeric <> 1070
     or (v_board #>> '{cancelled,cards}')::int <> 0 then
    raise exception 'S1-B: the board under the saved view''s filter was %', v_board;
  end if;
  select sum(b.cards)::int into v_n from custom.pipeline_board(v_org, v_jobs, 'price') b;
  if v_n <> 12 then raise exception 'S1-B2: the unfiltered board counts % jobs, not 12', v_n; end if;
  raise notice 'S1 part B PASS — the saved filter narrows the board: New 2 / $850, Scheduled 3 / $595, On site 1 / $1,320, Done 2 / $1,070, Cancelled 0; unfiltered it holds all 12.';

  -- ══ C. EVERY SETTING THE STORE CANNOT HONOUR IS REFUSED, AND A REFUSAL CHANGES NOTHING ══
  select definition into v_before from platform.saved_view where id = v_view;
  for v_case in select * from (values
    ('C1 an undeclared key',               jsonb_build_object('definition', jsonb_build_object('swimlane', 'technician')),                         'no setting called "swimlane"'),
    ('C2 an undeclared look',              jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('rowheight', 40))), 'no choice called "rowheight"'),
    ('C3 clearing a setting no view has',  jsonb_build_object('definition', jsonb_build_object('swimlanes', null)),                                'nothing to clear'),
    ('C4 an archived colour field',        jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('style', jsonb_build_object('version', 1, 'colorBy', jsonb_build_object('field', f_legacy, 'target', 'row'))))), 'has been archived'),
    ('C5 a free-text colour field',        jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('style', jsonb_build_object('version', 1, 'colorBy', jsonb_build_object('field', 'customer', 'target', 'row'))))), 'is not a choice'),
    ('C6 four grouping levels',            jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('grouping', jsonb_build_object('field', 'technician', 'then', jsonb_build_array(jsonb_build_object('field', 'priority'), jsonb_build_object('field', 'status'), jsonb_build_object('field', 'customer')))))), 'at most three levels'),
    ('C7 one field at two levels',         jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('grouping', jsonb_build_object('field', 'technician', 'then', jsonb_build_array(jsonb_build_object('field', f_tech)))))), 'at two levels'),
    ('C8 a sixth sort',                    jsonb_build_object('definition', jsonb_build_object('sorts', jsonb_build_array(
                                              jsonb_build_object('field','job_no'), jsonb_build_object('field','customer'), jsonb_build_object('field','address'),
                                              jsonb_build_object('field','priority'), jsonb_build_object('field','price'), jsonb_build_object('field','status')))), 'at most five'),
    ('C9 one column sorted twice',         jsonb_build_object('definition', jsonb_build_object('sorts', jsonb_build_array(jsonb_build_object('field','price'), jsonb_build_object('field', f_price, 'direction', 'desc')))), 'twice'),
    ('C10 a direction that is neither',    jsonb_build_object('definition', jsonb_build_object('sorts', jsonb_build_array(jsonb_build_object('field','price','direction','sideways')))), 'asc or desc'),
    ('C11 the column sum on a word',       jsonb_build_object('definition', jsonb_build_object('measure', 'customer')), 'sums a number'),
    ('C12 the calendar on a price',        jsonb_build_object('definition', jsonb_build_object('date_field', 'price')), 'by a date'),
    ('C13 swimlanes on the board''s columns', jsonb_build_object('definition', jsonb_build_object('swimlane_field', 'status')), 'every lane would hold one column'),
    ('C14 a Field of another Table',       jsonb_build_object('definition', jsonb_build_object('group_field', f_crew)), 'not a field of this table'),
    ('C15 a filter node a list cannot ask', jsonb_build_object('definition', jsonb_build_object('where', jsonb_build_object('op','sibling_count','args', jsonb_build_array(jsonb_build_object('field', f_tech))))), 'sibling_count'),
    ('C18 a Rule under the flat filters',  jsonb_build_object('filters', e_filter), 'flat field-to-value map'),
    ('C19 a question that is no Rule',     jsonb_build_object('definition', jsonb_build_object('where', jsonb_build_object('priority', 'emergency'))), 'is not one'),
    ('C16 a row 200 pixels tall',          jsonb_build_object('definition', jsonb_build_object('presentation', jsonb_build_object('rowHeight', 200))), '24 to 96'),
    ('C17 a kind of view nobody draws',    jsonb_build_object('definition', jsonb_build_object('layout', 'timeline')), 'grid, a kanban, a calendar or a gallery')
  ) c(label, spec, says) loop
    v_caught := null;
    begin
      perform custom.view_declare(v_org, v_jobs, v_case.spec || jsonb_build_object('view_id', v_view));
    exception when others then v_caught := sqlerrm;
    end;
    if v_caught is null then
      v_fails := v_fails || format('%s: STORED — the door took it', v_case.label);
      -- put the view back for the next case (the red probe runs on a door that stores anything)
      perform set_config('role', 'postgres', true);
      update platform.saved_view set definition = v_before where id = v_view;
      perform set_config('role', 'authenticated', true);
    elsif position(lower(v_case.says) in lower(v_caught)) = 0 then
      v_fails := v_fails || format('%s: refused, but not for the reason: %s', v_case.label, v_caught);
    end if;
  end loop;
  if cardinality(v_fails) > 0 and current_setting('s1.red_probe') = '1' then
    v_red := v_red || v_fails;
  elsif cardinality(v_fails) > 0 then
    raise exception 'S1-C: % of 19 failed —%', cardinality(v_fails), E'\n  ' || array_to_string(v_fails, E'\n  ');
  end if;
  -- A refused save at birth writes no view either.
  select count(*) into v_n from platform.saved_view where subject_id = v_jobs and deleted_at is null;
  begin
    perform custom.view_declare(v_org, v_jobs, jsonb_build_object('name', 'Bad', 'definition', jsonb_build_object('measure', 'customer')));
  exception when others then null;
  end;
  if current_setting('s1.red_probe') = '1' then
    raise exception 'S1 RED (the door does not judge view keys) — % clause(s) failed:%', cardinality(v_red),
                    E'\n  ' || array_to_string(v_red, E'\n  ');
  end if;
  select definition into v_after from platform.saved_view where id = v_view;
  if v_after <> v_before or (select count(*) from platform.saved_view where subject_id = v_jobs and deleted_at is null) <> v_n then
    raise exception 'S1-C: a refused save changed the stored views (% → %)', v_before, v_after;
  end if;
  raise notice 'S1 part C PASS — nineteen settings the store cannot honour are refused with their reason, and nothing changed.';

  -- ══ D. AN UPDATE THAT OMITS A KEY KEEPS IT; A COLUMN ARCHIVED SINCE NEVER BLOCKS A SAVE ══
  perform custom.view_declare(v_org, v_jobs, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('collapsed_columns', jsonb_build_array('done', 'cancelled'))));
  select definition into v_after from platform.saved_view where id = v_view;
  if v_after -> 'collapsed_columns' <> '["done","cancelled"]'::jsonb
     or v_after -> 'presentation' -> 'hiddenFields' <> '["price"]'::jsonb
     or v_after ->> 'swimlane_field' <> 'technician' or v_after -> 'sorts' <> v_before -> 'sorts'
     or v_after -> 'presentation' -> 'grouping' <> v_before -> 'presentation' -> 'grouping' then
    raise exception 'S1-D1: collapsing a second column lost another key: %', v_after;
  end if;
  -- The owner archives Site photo, which the view already names; the next save that resends the
  -- whole look (what the grid does on every press) must still land.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.field_retire(v_org, f_photo::uuid);
  perform set_config('request.jwt.claims', c_marisol_j, true);
  perform custom.view_declare(v_org, v_jobs, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object(
      'image_field', 'site_photo',
      'presentation', (v_after -> 'presentation') || jsonb_build_object('rowHeight', 32))));
  select definition into v_after from platform.saved_view where id = v_view;
  if (v_after -> 'presentation' ->> 'rowHeight')::int <> 32 then
    raise exception 'S1-D2: the resend after an archive did not land: %', v_after;
  end if;
  -- But naming the archived column anew, on a key that never named it, is refused.
  begin
    perform custom.view_declare(v_org, v_jobs, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('swimlane_field', f_legacy)));
    raise exception 'S1-D3: a newly named archived column was stored';
  exception when invalid_parameter_value then null;
  end;
  -- A cleared key goes; the rest stays.
  perform custom.view_declare(v_org, v_jobs, jsonb_build_object('view_id', v_view,
    'definition', jsonb_build_object('swimlane_field', null)));
  select definition into v_after from platform.saved_view where id = v_view;
  if v_after ? 'swimlane_field' or v_after ->> 'measure' <> 'price' then
    raise exception 'S1-D4: clearing the swimlanes did not remove exactly that key: %', v_after;
  end if;
  raise notice 'S1 part D PASS — an update keeps every key it did not name; a column archived after the view named it never blocks a save; naming it anew is refused; a cleared key is removed alone.';

  -- ══ E. A STRANGER ══
  perform set_config('request.jwt.claims', c_stranger_j, true);
  v_caught := null;
  begin
    perform custom.view_declare(v_org, v_jobs, jsonb_build_object('view_id', v_view,
      'definition', jsonb_build_object('measure', 'price')));
  exception when others then v_caught := sqlstate;
  end;
  if v_caught is null then raise exception 'S1-E1: a stranger saved Harbor Point''s view'; end if;
  v_caught := null;
  begin
    perform 1 from custom.views(v_org, v_jobs);
  exception when others then v_caught := sqlstate;
  end;
  if v_caught is null then raise exception 'S1-E2: a stranger read Harbor Point''s views'; end if;
  raise notice 'S1 part E PASS — a stranger is refused both the save and the read.';
  raise notice 'S1-PRIME VIEW-KEYS GREEN — every part passed.';
end $t$;
rollback;
