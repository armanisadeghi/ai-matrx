-- additive: yes
-- lane: CHAIR-NOTION-FIDELITY
-- based-on: custom.decoration_colors() 8b193593d530c0baee66be25b4774de41e132a2563f3a34e92522fc63ef01e1b
-- LOCKS: one function body (CREATE OR REPLACE keeps its grants). No table, row, trigger, grant or policy is touched.
--
-- A HIGHLIGHT MAY WEAR NOTION'S TEN COLOURS (CHAIR-NOTION-FIDELITY item 4). The palette a row, a cell or a
-- column may be highlighted in was seven names (slate, green, amber, red, blue, violet, teal). A page that
-- came over from Notion wears orange, yellow, pink, brown and gray too, so the palette grows by those five.
-- The new names are APPENDED: the order is the order an uncoloured choice takes, and the first seven are
-- the rotation it always took, so no existing table changes colour. The grid's own palette
-- (@ai-matrx/design-system STYLE_COLORS) carries the same twelve names; custom.table_decorate and the colour
-- rules judge every colour against this list and refuse one that is not on it.
-- Inverse: migrations/inverse/chairnotion_a_a_highlight_may_wear_notions_ten_colours_down.sql.

create or replace function custom.decoration_colors()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  select array['slate', 'green', 'amber', 'red', 'blue', 'violet', 'teal',
               'orange', 'yellow', 'pink', 'brown', 'gray']::text[]
$fn$;

comment on function custom.decoration_colors() is
  'GRID-PRIMITIVES G1 + CHAIR-NOTION-FIDELITY: the colors a row, a cell or a column may wear. The grid''s STYLE_COLORS, in the same order (the first seven are the order an uncolored choice takes).';
