-- The old Sheet (deleted in 1c4e8b0d0d) saved its views in `platform.saved_view` under surface
-- `matrx-user/data-tables`. `custom.views` reads only `custom/records`, so those views are
-- unreachable: a person's "Current" view on Coding Accounts (saved 2026-09-28) cannot be listed.
--
-- Every LIVE `matrx-user/data-tables` view is COPIED into the store's own surface (`custom/records`)
-- as a grid view of the same Table, under a NEW id (the surface is part of the old row's identity;
-- the two rows can never share one). The originals are KEPT, never deleted, and marked
-- `metadata.moved_to = {surface_key, id, by, at}`. A copy carries `definition.moved_from` with the
-- original's id and its WHOLE Sheet definition, so nothing the Sheet remembered is lost even where
-- the store has no key for it (search text, page size).
--
-- THE MAPPING (Sheet definition -> custom.view_keys paths)
--   hidden            -> presentation.hiddenFields        (by Field key, as the Sheet kept it)
--   order             -> presentation.columnOrder         (left out when empty)
--   widths            -> presentation.widths              (left out when empty)
--   density           -> presentation.rowHeight           (compact 28, tall 64, default = none)
--   wrap              -> presentation.wrap                (when the Sheet chose one)
--   freezeFirst       -> presentation.freezeFirst         (only when true)
--   summaries         -> presentation.summaries           (left out when empty)
--   layout scroll/fit -> presentation.fit                 (default = the store's auto)
--   sortField + sortDirection -> sorts [{field, direction}]
--   filters {key: {mode:"values", values, negate}} -> where, a Rule: eq / or of eq, wrapped in not
--        when negated, ANDed across keys. A filter this cannot say (includeBlank, another mode)
--        REFUSES THE WHOLE FILE by name — nothing is ever copied with its question dropped.
--   layout -> "grid"   is_default -> false (what it claimed is kept as moved_from.was_default)
--
-- Only live views move: a view its owner already deleted stays a tombstone where it is.
-- Re-running is safe: an original already marked moved_to is skipped.
-- Inverse: migrations/inverse/sheetleft_a_a_view_the_old_sheet_saved_is_a_view_of_its_table_again_down.sql
-- lock: platform
-- lane: SHEET-LEFTOVERS
set local lock_timeout = '2s';
set local statement_timeout = '60s';
set local app.actor_system = 'migration:sheetleft_a_a_view_the_old_sheet_saved_is_a_view_of_its_table_again';

do $move$
declare
  s          record;
  v_new      uuid;
  v_where    jsonb;
  v_fkey     text;
  v_fspec    jsonb;
  v_field_id text;
  v_expr     jsonb;
  v_exprs    jsonb;
  v_pres     jsonb;
  v_def      jsonb;
  v_moved    integer := 0;
  v_skipped  integer := 0;
  v_before   integer;
begin
  select count(*) into v_before from platform.saved_view where surface_key = 'custom/records' and deleted_at is null;

  for s in
    select * from platform.saved_view
     where surface_key = 'matrx-user/data-tables' and deleted_at is null
     order by created_at, id
  loop
    if s.metadata ? 'moved_to' then v_skipped := v_skipped + 1; continue; end if;

    -- THE QUESTION (filters -> a Rule over Fields by id)
    v_exprs := '[]'::jsonb;
    for v_fkey, v_fspec in select * from jsonb_each(coalesce(s.definition -> 'filters', '{}'::jsonb)) loop
      if jsonb_typeof(v_fspec) <> 'object'
         or v_fspec ->> 'mode' <> 'values'
         or coalesce((v_fspec ->> 'includeBlank')::boolean, false)
         or jsonb_typeof(v_fspec -> 'values') <> 'array'
         or jsonb_array_length(v_fspec -> 'values') = 0 then
        raise exception 'SHEET-LEFTOVERS: view % "%" has a filter on "%" the store cannot say (%); nothing was copied',
          s.id, s.name, v_fkey, v_fspec using errcode = '22023';
      end if;
      select f.id::text into v_field_id
        from custom.record f
       where f.data_class = 'field'
         and f.data ->> 'entity_definition_id' = s.subject_id::text
         and f.data ->> 'key' = v_fkey
         and f.deleted_at is null
       limit 1;
      if v_field_id is null then
        raise exception 'SHEET-LEFTOVERS: view % "%" filters on "%", which is not a Field of its Table; nothing was copied',
          s.id, s.name, v_fkey using errcode = '22023';
      end if;
      select case when count(*) = 1 then min(e::text)::jsonb
                  else jsonb_build_object('op', 'or', 'args', jsonb_agg(e)) end
        into v_expr
        from (select jsonb_build_object('op', 'eq', 'args',
                       jsonb_build_array(jsonb_build_object('field', v_field_id), jsonb_build_object('const', val))) as e
                from jsonb_array_elements(v_fspec -> 'values') val) q;
      if coalesce((v_fspec ->> 'negate')::boolean, false) then
        v_expr := jsonb_build_object('op', 'not', 'args', jsonb_build_array(v_expr));
      end if;
      v_exprs := v_exprs || jsonb_build_array(v_expr);
    end loop;
    v_where := case jsonb_array_length(v_exprs)
                 when 0 then null
                 when 1 then v_exprs -> 0
                 else jsonb_build_object('op', 'and', 'args', v_exprs) end;

    -- THE LOOK
    v_pres := '{}'::jsonb;
    if jsonb_typeof(s.definition -> 'hidden') = 'array' and jsonb_array_length(s.definition -> 'hidden') > 0 then
      v_pres := v_pres || jsonb_build_object('hiddenFields', s.definition -> 'hidden'); end if;
    if jsonb_typeof(s.definition -> 'order') = 'array' and jsonb_array_length(s.definition -> 'order') > 0 then
      v_pres := v_pres || jsonb_build_object('columnOrder', s.definition -> 'order'); end if;
    if jsonb_typeof(s.definition -> 'widths') = 'object' and s.definition -> 'widths' <> '{}'::jsonb then
      v_pres := v_pres || jsonb_build_object('widths', s.definition -> 'widths'); end if;
    if s.definition ->> 'density' = 'compact' then v_pres := v_pres || '{"rowHeight":28}'::jsonb;
    elsif s.definition ->> 'density' = 'tall' then v_pres := v_pres || '{"rowHeight":64}'::jsonb; end if;
    if jsonb_typeof(s.definition -> 'wrap') = 'boolean' then
      v_pres := v_pres || jsonb_build_object('wrap', s.definition -> 'wrap'); end if;
    if s.definition -> 'freezeFirst' = 'true'::jsonb then v_pres := v_pres || '{"freezeFirst":true}'::jsonb; end if;
    if jsonb_typeof(s.definition -> 'summaries') = 'object' and s.definition -> 'summaries' <> '{}'::jsonb then
      v_pres := v_pres || jsonb_build_object('summaries', s.definition -> 'summaries'); end if;
    if s.definition ->> 'layout' in ('scroll', 'fit') then
      v_pres := v_pres || jsonb_build_object('fit', s.definition ->> 'layout'); end if;

    v_new := gen_random_uuid();
    v_def := jsonb_build_object(
               'table_id', s.subject_id,
               'layout',   'grid',
               'filters',  '{}'::jsonb,
               'sorts',    case when coalesce(s.definition ->> 'sortField', '') <> ''
                                then jsonb_build_array(jsonb_build_object(
                                       'field', s.definition ->> 'sortField',
                                       'direction', case when s.definition ->> 'sortDirection' = 'desc' then 'desc' else 'asc' end))
                                else '[]'::jsonb end,
               'is_default', false,
               'moved_from', jsonb_build_object(
                               'store', 'platform.saved_view/matrx-user/data-tables',
                               'id', s.id,
                               'by', 'SHEET-LEFTOVERS',
                               'at', now(),
                               'was_default', s.is_default,
                               'sheet_definition', s.definition));
    if v_where is not null then v_def := v_def || jsonb_build_object('where', v_where); end if;
    if v_pres <> '{}'::jsonb then v_def := v_def || jsonb_build_object('presentation', v_pres); end if;

    insert into platform.saved_view
      (id, name, description, surface_key, subject_id, definition, organization_id, created_by,
       created_at, updated_at, visibility)
    values
      (v_new, s.name, s.description, 'custom/records', s.subject_id, v_def, s.organization_id, s.created_by,
       s.created_at, now(), 'internal'::platform.visibility);

    update platform.saved_view
       set metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('moved_to', jsonb_build_object(
                           'surface_key', 'custom/records', 'id', v_new,
                           'by', 'SHEET-LEFTOVERS', 'at', now()))
     where id = s.id;
    v_moved := v_moved + 1;
  end loop;

  raise notice 'SHEET-LEFTOVERS A: % live view(s) copied into custom/records (live there: % before, % after); % already moved, skipped; originals kept and marked metadata.moved_to',
    v_moved, v_before,
    (select count(*) from platform.saved_view where surface_key = 'custom/records' and deleted_at is null),
    v_skipped;
end
$move$;
