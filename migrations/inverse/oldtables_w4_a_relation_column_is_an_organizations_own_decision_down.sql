-- chair-step: the inverse of
--   `migrations/campaign/oldtables_w4_a_relation_column_is_an_organizations_own_decision.sql`.
--   It deletes the ONE `platform.feature_knob` register row that file added,
--   `data_tables.relation.relation_columns_enabled`, which nothing before 2026-09-22 ever held.
--
--   IT DELETES NO `platform.knob_override` ROW AND NO COLUMN. An organization that turned the
--   feature on keeps its override row, and every relation column anybody created keeps working:
--   the knob gates CREATION and never reading, and a column somebody filled in is data, not
--   configuration. What running this does is remove the register row, after which
--   `lib/knobs/featureKnobs` RAISES `Missing feature knob "data_tables.relation.relation_columns_enabled"` for
--   its one reader rather than guessing — which is the knob system working as designed
--   (a retired knob is ABSENT and its readers fail visibly), and is why this is a chair step.
--
--   NO DDL, NO LOCK ON ANY RELATION A READER USES. One DELETE on a register table.
--
-- lock: platform
-- lane: OLD-TABLES-2

delete from platform.feature_knob
 where feature = 'data_tables.relation'
   and key = 'relation_columns_enabled';
