-- LEVEL-FIX (2 of 4) — THE INVERSE. The knob row exactly as it stood: a platform constant no
-- organization could set, with the label and sentence it shipped with.

set lock_timeout = '3s';
set statement_timeout = '60s';

update platform.feature_knob
   set overridable_by   = array[]::text[],
       value_type       = 'string',
       allowed_values   = null,
       taxonomy_node_id = null,
       label            = 'What membership alone confers',
       description      = 'VIS-19 / AGT-5: the level organization membership alone confers on a record of a table, before any per-thing grant. An organization raises or lowers it; a value on the Table record overrides it for that table. "none" means membership confers nothing and every read needs a grant of its own.'
 where feature = 'custom' and key = 'member_default_level';
