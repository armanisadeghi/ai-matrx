-- lane: CHAIR-NOTION-FIDELITY
-- chair-step: restores one function body as it was; no grant, table or row is touched.
-- based-on: custom.decoration_colors() 15eaa76c5c4dcce4afc0e2c6802ad82e721539a4324afc5e2fee392e95a0b2f6
-- Inverse of migrations/campaign/chairnotion_a_a_highlight_may_wear_notions_ten_colours.sql: the highlight palette is the original seven again.

create or replace function custom.decoration_colors()
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- The choice-chip palette minus "neutral", which is "no color" (lib/field-formats/choices.ts,
  -- features/data-tables/table-style.ts STYLE_COLORS). Order is the order a choice column's
  -- options take when an option declares no color of its own.
  select array['slate', 'green', 'amber', 'red', 'blue', 'violet', 'teal']::text[]
$fn$;

comment on function custom.decoration_colors() is
  'GRID-PRIMITIVES G1: the colors a row, a cell or a column may wear. The older grid''s STYLE_COLORS, in the same order.';
