-- chair-step: a DATA MOVE. It SUPERSEDES oneview_every_view_bar_view_moves_into_the_one_store.sql
--   (S0 ONE-SAVED-VIEW's move) at production, where S0's file was never applied: it does exactly
--   what S0's does, byte for byte (steps 1, 2 and 3 below), plus ONE rule (step 1b): A TABLE HAS
--   ONE DEFAULT VIEW. Every saved view the view bar kept as a record of an organization's
--   package-owned `records_ui_view` Table is copied into `platform.saved_view` (surface
--   `custom/records`) UNDER THE SAME ID, then every `records_ui_view` Table is ARCHIVED through
--   the store's own `custom.table_archive` (soft: everything in it can be brought back; nothing
--   is deleted). A copy that claimed its table's default arrives NOT default when the table
--   already has a live default view in the one store (the designated Sheet, or a default a person
--   or the page chose), or when another copy of the same run wins (the live one saved last);
--   `moved_from.was_default = true` keeps what it claimed. The designated default always wins.
--   ORDER AT PRODUCTION: only AFTER the records-ui release that reads and writes views through
--   custom.views / custom.view_declare (0.85.5 and later) is live in every host. An older
--   records-ui on a live page would find no view Table and declare a fresh one. Re-running THIS
--   file is safe and is the remedy for that case (never S0's, which has no one-default rule): a
--   copied view is never copied twice (`on conflict (id)`) and a Table already archived is not
--   touched again. Apply AFTER oneview_a_saved_view_keeps_what_it_was_not_sent.sql.
--   The inverse is
--   `migrations/inverse/viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands_down.sql`.
-- lock: custom,platform
-- lane: VIEW-KEYS-SHEET
--
-- LANE VIEW-KEYS-SHEET, over S0 ONE-SAVED-VIEW (chair ruling 2026-09-23: `platform.saved_view` is
-- the ONE saved-view store). WHY THE RULE. Measured on production 2026-09-25 ~00:55Z: the older
-- store holds page-seed "All records" defaults for tables that already have their default in the
-- one store — Rincon Service Calls (the designated Sheet), Coding Accounts and Table 1 · 2nd (the
-- mover's copies, now `layout: "sheet"`), and several page-seeded grids — and some tables hold two
-- or more live seeds of their own (an older records-ui seeded once per open). S0's move copied
-- every claim as it was, so each such table would have opened on a coin toss between two views both
-- named "All records". Linear, Airtable and Notion have exactly one default view per table; so
-- does this store, at the moment the views arrive.
--
-- THE MAPPING (records_ui_view field → platform.saved_view), unchanged from S0:
--   name → name · subject → subject_id and definition.table_id · layout → definition.layout ·
--   group_field / measure / date_field / image_field → the same keys (null ones left out) ·
--   sorts (a JSON string) → definition.sorts (an array) · rule_id → definition.rule_id ·
--   is_default ("true"/"false") → definition.is_default (boolean; then step 1b) · presentation
--   (a JSON string, "" for none) → definition.presentation (an object, left out when empty) ·
--   filters → {} · organization_id, created_by, created_at, deleted_at → the same columns ·
--   visibility internal. definition.moved_from = {store, view_table_id, archived_at}.
-- A record whose subject is not a Table id cannot be a view of anything: it is left where it is
-- (inside the archived Table, recoverable) and counted in the notice.
--
-- LOCKS. insert into / update of platform.saved_view and updates of custom.record rows (through
-- the store's own archive door). No DDL. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '10min';
-- A write with no person behind it names the system that made it (platform.associations refuses
-- actor_tier=code with no actor_system).
set local app.actor_system = 'migration:viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands';

do $move$
declare
  v_moved     integer := 0;
  v_unmovable integer := 0;
  v_hidden    integer := 0;
  v_tables    integer := 0;
  v_demoted   integer := 0;
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

  -- 1b. ONE DEFAULT PER TABLE. The copies this run made or brought back (they carry this
  --     transaction's instant) that claim the default keep it only when the table has no other live
  --     default in the one store and they are the one live copy saved last; every other claim
  --     arrives not default, with what it claimed kept under moved_from.
  with run as (
    select sv.id, sv.subject_id, sv.updated_at, sv.deleted_at
      from platform.saved_view sv
     where sv.surface_key = 'custom/records'
       and sv.definition -> 'moved_from' ->> 'store' = 'records_ui_view'
       and (sv.definition -> 'moved_from' ->> 'archived_at')::timestamptz = now()
       and sv.definition -> 'is_default' = 'true'::jsonb
  ),
  ranked as (
    select r.id,
           r.deleted_at is null
           and not exists (
             select 1 from platform.saved_view o
              where o.surface_key = 'custom/records'
                and o.subject_id = r.subject_id
                and o.deleted_at is null
                and o.id not in (select id from run)
                and (o.is_default
                     or o.definition -> 'is_default' = 'true'::jsonb
                     or o.definition -> 'moved_from' ->> 'kind' = 'default_view'))
           and row_number() over (partition by r.subject_id
                                  order by (r.deleted_at is null) desc, r.updated_at desc nulls last, r.id) = 1
             as keeps
      from run r
  ),
  demoted as (
    update platform.saved_view sv
       set definition = jsonb_set(
                          jsonb_set(sv.definition, '{is_default}', 'false'::jsonb),
                          '{moved_from}',
                          (sv.definition -> 'moved_from')
                          || jsonb_build_object('was_default', true,
                                                'demoted_by', 'viewkeyssheet_every_view_bar_view_moves_in_and_one_default_stands'))
      from ranked k
     where sv.id = k.id and not k.keeps
    returning 1
  )
  select count(*) into v_demoted from demoted;

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

  raise notice 'VIEW-KEYS-SHEET (S0''s move, one default per table): % view(s) copied into platform.saved_view under their own ids; % arrived not default (their table already had one); % left in place (no table named); % hidden-column list(s) made live; % records_ui_view table(s) archived.',
    v_moved, v_demoted, v_unmovable, v_hidden, v_tables;
end
$move$;
