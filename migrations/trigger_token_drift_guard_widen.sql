-- Widen `audit.trigger_token_drift` to EVERY trigger function that takes an
-- entity token as its first argument — not just the two that happened to be
-- broken when the guard was written hours earlier today.
--
-- WHY. `trigger_token_drift_repair_and_guard.sql` watched `_version_capture`
-- and `_gc_entity_associations`, because those were the two carrying the 13
-- drifted triggers. That is a guard shaped around one incident rather than
-- around the class. A full census of trigger functions taking arguments shows
-- four token-takers, and the guard was watching half of them:
--
--   platform._gc_entity_associations   534 triggers   watched
--   platform._guard_governance_columns 181 triggers   NOT watched
--   platform._version_capture          173 triggers   watched
--   plan._site_edge                      2 triggers   NOT watched
--
-- Both unwatched functions are swept clean live (0 drift today), so this
-- changes nothing now — which is exactly when to widen a guard, before it has
-- something to catch. `_guard_governance_columns` is the one that would hurt
-- most quietly: it enforces who may write `visibility` / `organization_id`, so
-- a dead token there means the governance check silently resolves against
-- nothing.
--
-- The other parent-naming trigger families are covered separately or verified
-- clean and deliberately NOT folded in here, because they name a
-- schema/table/column rather than a token and need different checks:
--   platform.inherit_org_from_parent   116  -> audit.inherit_org_trigger_drift
--   platform.component_created_by_from_parent 167 -> swept clean 2026-08-21
--                                       (every schema/table/fk triple resolves,
--                                        every named parent has created_by)
--   crm._inherit_parent_org             10  -> swept clean 2026-08-21
--
-- Idempotent: DROP VIEW IF EXISTS + CREATE. (Not CREATE OR REPLACE: the new
-- shape adds a `trigger_function` column mid-list, and REPLACE cannot rename or
-- reorder a view's columns — it errors rather than doing something surprising.)

BEGIN;

DROP VIEW IF EXISTS audit.trigger_token_drift;

CREATE VIEW audit.trigger_token_drift AS
SELECT n.nspname                        AS schema_name,
       c.relname                        AS table_name,
       tg.tgname                        AS trigger_name,
       p.proname                        AS trigger_function,
       (regexp_match(pg_get_triggerdef(tg.oid), '\(''([a-z0-9_]+)''\)'))[1] AS trigger_token,
       e.token                          AS registered_token
FROM pg_trigger tg
JOIN pg_class c      ON c.oid = tg.tgrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
JOIN pg_proc p       ON p.oid = tg.tgfoid
LEFT JOIN platform.entity_types e
       ON e.schema_name = n.nspname AND e.table_name = c.relname
WHERE NOT tg.tgisinternal
  AND p.proname IN ('_version_capture', '_gc_entity_associations',
                    '_guard_governance_columns', '_site_edge')
  AND e.token IS NOT NULL
  AND (regexp_match(pg_get_triggerdef(tg.oid), '\(''([a-z0-9_]+)''\)'))[1] IS DISTINCT FROM e.token;

COMMENT ON VIEW audit.trigger_token_drift IS
  'Any row = a trigger whose entity-token ARGUMENT disagrees with the registered token of the table it sits on. Covers every token-taking trigger function: _version_capture, _gc_entity_associations, _guard_governance_columns, _site_edge. That drift is silent in every direction — association GC matches nothing (trash/restore/delete leave edges behind), version snapshots are filed into history.row_versions under a name no canonical lookup can find, and a governance guard resolves against a token that does not exist. Found 2026-08-21 with 13 drifted triggers across 5 renamed tables. Parent-NAMING triggers are a different check: see audit.inherit_org_trigger_drift. Sibling of audit.registry_location_drift (db-rules §1). MUST BE EMPTY.';

DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM audit.trigger_token_drift;
  IF v <> 0 THEN
    RAISE EXCEPTION 'widened audit.trigger_token_drift is not empty: % row(s)', v;
  END IF;
END $$;

COMMIT;
