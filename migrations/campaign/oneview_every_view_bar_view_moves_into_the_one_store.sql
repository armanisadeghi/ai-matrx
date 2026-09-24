-- chair-step: a DATA MOVE. Every saved view the view bar kept as a record of an organization's
--   package-owned `records_ui_view` Table is copied into `platform.saved_view` (surface
--   `custom/records`) UNDER THE SAME ID, then every `records_ui_view` Table is ARCHIVED through
--   the store's own `custom.table_archive` (soft: everything in it can be brought back; nothing
--   is deleted). The mover's hidden columns (`definition.hidden_fields`, Field IDS nothing reads)
--   become the view's live hidden list (`definition.presentation.hiddenFields`, Field KEYS, what
--   the grid and the gallery read); the ids stay as provenance under `moved_from.hidden_fields`.
--   ORDER AT PRODUCTION: only AFTER the records-ui release that reads and writes views through
--   custom.views / custom.view_declare is live in every host (matrx-frontend /data-v2). An older
--   records-ui on a live page would find no view Table and declare a fresh one. Re-running this
--   file is safe and is the remedy for that case: a copied view is never copied twice
--   (`on conflict (id)`: kept as it is, or brought back if the inverse withdrew it) and a Table
--   already archived is not touched again.
--   Apply AFTER oneview_a_saved_view_keeps_what_it_was_not_sent.sql.
--   The inverse is `migrations/inverse/oneview_every_view_bar_view_moves_into_the_one_store_down.sql`.
-- lock: custom,platform
-- lane: S0-ONE-SAVED-VIEW
--
-- LANE S0 ONE-SAVED-VIEW (chair ruling 2026-09-23: `platform.saved_view` is the ONE saved-view
-- store; UI-CHAMPIONS-PLAN-ATTACK hole 1). Two stores held "a saved view": the screens saved a
-- record in each organization's `records_ui_view` Table (records-ui ViewBar / TablePage), while
-- the digests, the notify rules, the agent's boards, G1/G7's grid choices, G13's hand-set order,
-- the embed token and the mover all used `platform.saved_view`. A view the mover carried in
-- never reached the view bar, and a view saved in the bar was invisible to every subscription.
--
-- THE MAPPING (records_ui_view field → platform.saved_view):
--   name → name · subject → subject_id and definition.table_id · layout → definition.layout ·
--   group_field / measure / date_field / image_field → the same keys (null ones left out) ·
--   sorts (a JSON string) → definition.sorts (an array) · rule_id → definition.rule_id ·
--   is_default ("true"/"false") → definition.is_default (boolean) · presentation (a JSON string,
--   "" for none) → definition.presentation (an object, left out when empty) · filters → {} (the
--   record store's views never carried a flat filter; membership is the Rule) ·
--   organization_id, created_by, created_at, deleted_at → the same columns · visibility internal.
--   definition.moved_from = {store, view_table_id, archived_at} says where it came from.
-- A record whose subject is not a Table id cannot be a view of anything: it is left where it is
-- (inside the archived Table, recoverable) and counted in the notice.
--
-- LOCKS. insert into platform.saved_view and updates of custom.record rows (through the store's
-- own archive door). No DDL. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '10min';
-- A write with no person behind it names the system that made it (platform.associations refuses
-- actor_tier=code with no actor_system).
set local app.actor_system = 'migration:oneview_every_view_bar_view_moves_into_the_one_store';

do $move$
declare
  v_moved     integer := 0;
  v_unmovable integer := 0;
  v_hidden    integer := 0;
  v_tables    integer := 0;
  t           record;
  v_answer    jsonb;
begin
  -- 1. THE COPY, under the same id. `now()` is this transaction's instant, so every row this file
  --    writes and every row the archive below soft-deletes carries the same one — the inverse
  --    finds exactly these by it.
  with vt as (
    select r.organization_id, r.id as view_table_id
      from custom.record r
     where r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.data ->> 'slug' = 'records_ui_view'
  ),
  src as (
    select v.id, v.organization_id, v.created_by, v.created_at, v.updated_at, v.deleted_at,
           vt.view_table_id, v.data as d,
           case when (v.data ->> 'subject') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (v.data ->> 'subject')::uuid end as subject
      from custom.record v
      join vt on vt.organization_id = v.organization_id and vt.view_table_id = v.table_id
     where v.data_class = 'record'
  ),
  shaped as (
    select s.*,
           case when jsonb_typeof(s.d -> 'sorts') = 'array' then s.d -> 'sorts'
                when coalesce(btrim(s.d ->> 'sorts'), '') ~ '^\[.*\]$' then (s.d ->> 'sorts')::jsonb
                else '[]'::jsonb end as sorts,
           case when jsonb_typeof(s.d -> 'presentation') = 'object' then s.d -> 'presentation'
                when coalesce(btrim(s.d ->> 'presentation'), '') ~ '^\{.*\}$' then (s.d ->> 'presentation')::jsonb
                end as presentation
      from src s
  ),
  ins as (
    insert into platform.saved_view
      (id, name, surface_key, subject_id, definition, organization_id, created_by,
       created_at, updated_at, deleted_at, visibility)
    select sh.id,
           coalesce(nullif(btrim(sh.d ->> 'name'), ''), 'Untitled view'),
           'custom/records',
           sh.subject,
           jsonb_strip_nulls(jsonb_build_object(
             'table_id',     sh.subject,
             'layout',       coalesce(nullif(sh.d ->> 'layout', ''), 'grid'),
             'group_field',  nullif(sh.d ->> 'group_field', ''),
             'measure',      nullif(sh.d ->> 'measure', ''),
             'date_field',   nullif(sh.d ->> 'date_field', ''),
             'image_field',  nullif(sh.d ->> 'image_field', ''),
             'rule_id',      nullif(sh.d ->> 'rule_id', ''),
             'presentation', case when sh.presentation = '{}'::jsonb then null else sh.presentation end))
           || jsonb_build_object(
             'filters',    '{}'::jsonb,
             'sorts',      sh.sorts,
             'is_default', coalesce(sh.d ->> 'is_default', 'false') = 'true',
             'moved_from', jsonb_build_object('store', 'records_ui_view',
                                              'view_table_id', sh.view_table_id,
                                              'archived_at', now())),
           sh.organization_id, sh.created_by, sh.created_at, sh.updated_at, sh.deleted_at,
           'internal'::platform.visibility
      from shaped sh
     where sh.subject is not null
    -- A copy is never made twice. One the inverse WITHDREW comes back as it was when withdrawn
    -- (edits made to it after the first move included), carrying this run's instant.
    on conflict (id) do update
       set deleted_at = excluded.deleted_at,
           definition = jsonb_set(platform.saved_view.definition, '{moved_from}',
                                  ((platform.saved_view.definition -> 'moved_from') - 'withdrawn'::text)
                                  || jsonb_build_object('archived_at', now()))
     where platform.saved_view.definition -> 'moved_from' ->> 'withdrawn' = 'true'
    returning 1
  )
  select (select count(*) from ins),
         (select count(*) from src where subject is null)
    into v_moved, v_unmovable;

  -- 2. ONE HIDDEN-COLUMN LIST. The mover carried an older view's hidden columns by Field ID into
  --    `definition.hidden_fields`, which nothing reads; the grid and the gallery read
  --    `presentation.hiddenFields` by Field KEY. The ids stay, as provenance, under moved_from.
  with h as (
    select sv.id,
           coalesce((select jsonb_agg(distinct f.data ->> 'key')
                       from jsonb_array_elements_text(sv.definition -> 'hidden_fields') x(fid)
                       join custom.record f
                         on f.organization_id = sv.organization_id
                        and f.id::text = x.fid
                        and f.data_class = 'field'
                        and f.data ->> 'key' is not null), '[]'::jsonb) as keys
      from platform.saved_view sv
     where sv.surface_key = 'custom/records'
       and jsonb_typeof(sv.definition -> 'hidden_fields') = 'array'
  ),
  upd as (
    update platform.saved_view sv
       set definition = jsonb_set(
                          jsonb_set(sv.definition - 'hidden_fields'::text, '{moved_from}',
                                    coalesce(sv.definition -> 'moved_from', '{}'::jsonb)
                                    || jsonb_build_object('hidden_fields', sv.definition -> 'hidden_fields')),
                          '{presentation}',
                          coalesce(case when jsonb_typeof(sv.definition -> 'presentation') = 'object'
                                        then sv.definition -> 'presentation' end, '{}'::jsonb)
                          || jsonb_build_object('hiddenFields', h.keys)),
           updated_at = now()
      from h
     where sv.id = h.id
    returning 1
  )
  select count(*) into v_hidden from upd;

  -- 3. THE ARCHIVE, through the store's own door, Table by Table. Soft: the Table and every record
  --    in it can be brought back (the inverse does exactly that).
  for t in
    select r.organization_id, r.id
      from custom.record r
     where r.table_id = custom.table_kernel_id()
       and r.data_class = 'table'
       and r.data ->> 'slug' = 'records_ui_view'
       and r.deleted_at is null
     order by r.organization_id, r.id
  loop
    loop
      v_answer := custom.table_archive(t.organization_id, t.id, 1000, true);
      exit when coalesce((v_answer ->> 'done')::boolean, false);
    end loop;
    v_tables := v_tables + 1;
  end loop;

  raise notice 'S0 ONE-SAVED-VIEW: % view(s) copied into platform.saved_view under their own ids; % left in place (no table named); % hidden-column list(s) made live; % records_ui_view table(s) archived.',
    v_moved, v_unmovable, v_hidden, v_tables;
end
$move$;
