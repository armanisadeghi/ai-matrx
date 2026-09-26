-- target: branch,production
-- additive: yes
--   REPLACES one body — `custom.view_keys()` (byte for byte as TABLE-PAGE-CHROME left it, plus ONE
--   row, `presentation.columnOrder`, shape `fields`: the existing list-of-Fields check in
--   `custom._view_key_value`, which resolves each id or key to the table's own key). No table,
--   trigger, policy, index, grant or stored row changes. Inverse:
--   migrations/inverse/gridmerge_a_view_keeps_its_column_order_down.sql.
-- guard: custom/system_enabled
-- lock: custom
-- lane: data-tables-grid-overhaul (merged grid — data paths)
-- based-on: custom.view_keys() 4a2f0f8ae96f6c16fa45a7b6759f2bdc81712c2a05c51f2ca24646518a0db0fa
--
-- A VIEW KEEPS ITS COLUMN ORDER.
--
-- THE USE CASE: in the older /data grid a person drags "Due date" next to "Customer" and the
-- order is still there tomorrow (inventory D4). On the merged records-ui grid the same drag was
-- REFUSED by the store — `view_look_set` / `view_declare` judge every presentation key against this
-- registry, and `presentation.columnOrder` was not in it, so a reorder was lost on reload. The
-- client mirror (`@ai-matrx/records-ui` viewKeys.ts) has declared the key since 0.88; this is the
-- store half. Airtable, Sheets and Notion all keep a column order per view.
--
-- LOCKS. create or replace function x1. Not window-class.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.view_keys()
 RETURNS TABLE(path text, shape text, layouts text[], writer text, sentence text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select * from (values
    ('layout',                  'kind',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'Which of the ways to look at the table this view is: grid, kanban, calendar, gallery, or sheet (the Sheet the host draws; a table whose default view is layout sheet opens as the Sheet).'),
    ('filters',                 'filter',        array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The flat question the digests and the notifier read: a map of Field key to value, null or a window. Sent as spec.filters. Never a Rule expression — that is `where`.'),
    ('where',                   'rule',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The view''s own question as the condition builder writes it (S2-PRIME): a Rule expression {op, args}, ALL / ANY / NOT nested to any depth, Fields by id; the board filter. custom.record_filter_sql compiles it for the grid, the board and the numbers.'),
    ('group_field',             'field',         array['kanban'],                                     'caller', 'The Field whose values are the board''s columns.'),
    ('swimlane_field',          'field:lane',    array['kanban'],                                     'caller', 'The Field whose values cut the board into swimlanes across the columns (a choice, a person, a relation, a yes/no or a word).'),
    ('collapsed_columns',       'values',        array['kanban'],                                     'caller', 'The board columns this view keeps shut to a strip, by the column''s stored value.'),
    ('measure',                 'field:number',  array['kanban'],                                     'caller', 'The number, money or percentage Field summed under every board column heading.'),
    ('date_field',              'field:date',    array['calendar'],                                   'caller', 'The date Field that places a record on the calendar.'),
    ('image_field',             'field',         array['gallery'],                                    'caller', 'The Field drawn large as the gallery card''s cover.'),
    ('sorts',                   'sorts',         array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The sort stack: an ordered list of {field, direction} (asc or desc), at most five, each Field once.'),
    ('rule_id',                 'uuid',          array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The membership Rule whose members the view shows.'),
    ('is_default',              'boolean',       array['grid','kanban','calendar','gallery','sheet'], 'caller', 'Whether this is the table''s default view.'),
    ('presentation',            'presentation',  array['grid','kanban','calendar','gallery','sheet'], 'caller', 'How the view looks. Each of its keys is declared below.'),
    ('presentation.style',      'style',         array['grid','kanban','calendar','gallery','sheet'], 'caller', 'The view''s colours over the table''s own (G1 table_decorations): colorBy {field, target} names a choice or yes/no Field — the calendar''s and the cards'' colour field — plus rules and hand highlights.'),
    ('presentation.formats',    'object',        array['grid','sheet'],                               'caller', 'Per-column display formats, by Field key.'),
    ('presentation.frozen',     'fields',        array['grid','sheet'],                               'caller', 'The pinned Fields that stay put while the grid scrolls sideways, in order, at most ten.'),
    ('presentation.grouping',   'grouping',      array['grid','gallery','sheet'],                     'caller', 'Sections by a Field ({field, order, aggregates, collapsed}) and up to two sub-groups (then: [{field, order}]); at most three levels; collapsed holds the sections kept shut at every level.'),
    ('presentation.widths',     'widths',        array['grid','sheet'],                               'caller', 'The width a person dragged a column to, in pixels, by Field key.'),
    ('presentation.rowHeight',  'row_height',    array['grid','sheet'],                               'caller', 'The body row height this view remembers, 24 to 96 pixels.'),
    ('presentation.hiddenFields','fields',       array['grid','gallery','sheet'],                     'caller', 'The Fields hidden from this view, by key.'),
    ('presentation.columnOrder','fields',       array['grid','sheet'],                               'caller', 'The order of the columns this view keeps, by Field key: a column dragged somewhere else stays there. A column not named keeps its own place after the named ones.'),
    ('presentation.gallerySize','gallery_size',  array['gallery'],                                    'caller', 'The gallery''s card size: small, medium or large.'),
    ('presentation.wrap',       'boolean',       array['grid','sheet'],                               'caller', 'Whether long values wrap onto more lines.'),
    ('presentation.fit',        'fit',           array['grid','sheet'],                               'caller', 'How the grid shares its width: auto, fit or scroll.'),
    ('presentation.freezeFirst','boolean',       array['grid','sheet'],                               'caller', 'Whether the first column stays put.'),
    ('presentation.footer',     'footer',        array['grid','sheet'],                               'caller', 'Where the grid''s footer (the counts and the pages) sits: sticky, pinned to the bottom of the screen, or inline, right after the last row.'),
    ('presentation.summaries',  'summaries',     array['grid','sheet'],                               'caller', 'The summary shown under each column, by Field key (count, sum, avg, min, max, median, filled, empty, unique).'),
    ('grid',                    'grid',          array['grid','sheet'],                               'caller', 'G1/G7 grid choices (mode, row_height, freeze_first_column, wrap, widths by Field id), judged by custom.grid_layout_check.'),
    ('hidden_fields',           'input',         array['grid','gallery','sheet'],                     'input',  'Hidden columns by Field id (the mover''s shape); written as presentation.hiddenFields by key.'),
    ('table_id',                'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'The view''s Table, fixed at birth.'),
    ('order',                   'server',        array['grid','sheet'],                               'server', 'G13''s hand-set order, written only by custom.view_record_order_set.'),
    ('moved_from',              'server',        array['grid','kanban','calendar','gallery','sheet'], 'server', 'Where the view was moved in from; set once, at birth, by the mover.')
  ) as k(path, shape, layouts, writer, sentence);
$function$;
