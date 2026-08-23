-- 🚨 THIRTEEN TRIGGERS ON FIVE TABLES WERE PASSING A TOKEN THAT NO LONGER
-- EXISTS — so association GC did nothing and version history was being filed
-- under a dead name. Plus a standing guard so the class cannot come back.
--
-- ============================================================================
-- WHAT WAS WRONG
-- ============================================================================
-- `platform._version_capture('<token>')` and
-- `platform._gc_entity_associations('<token>')` take the entity token as a
-- TRIGGER ARGUMENT. Five tables were renamed and re-tokenised, and the token
-- moved everywhere EXCEPT the trigger arguments, which still named the old one:
--
--   agent.mandate            -> triggers said 'agent_slot'            (real: 'mandate')
--   agent.mandate_binding    -> triggers said 'agent_slot_binding'    (real: 'mandate_binding')
--   agent.mandate_exemplar   -> triggers said 'agent_slot_exemplar'   (real: 'mandate_exemplar')
--   agent.message_template   -> triggers said 'content_template'      (real: 'message_template')
--   platform.rulebook        -> trigger  said 'expertise_pack'        (real: 'rulebook')
--
-- **None of those five old tokens exists in `platform.entity_types` at all** —
-- not even as an inactive row. This is the same ONE TOKEN class db-rules §6c
-- documents for RPC bodies and policy literals (`content_template` is literally
-- one of the tokens it names, on this very table — the POLICY half was fixed and
-- the TRIGGER half was missed), reaching a third surface: trigger arguments.
--
-- ============================================================================
-- TWO REAL FAILURES, BOTH MEASURED LIVE (rolled back), NOT INFERRED
-- ============================================================================
-- 1. ASSOCIATION GC SILENTLY DID NOTHING. `_gc_entity_associations` matches
--    `source_type = v_token OR target_type = v_token`. Edges are stored under
--    the REAL token — 340 `mandate` edges and 9 `rulebook` edges live, and ZERO
--    under any of the dead tokens. So trash/restore/hard-delete of a mandate
--    matched nothing:
--
--      BEFORE — mandate 12b62185 has 1 live edge; soft-deleted it;
--               edges tombstoned = 0   (should be 1)
--      AFTER  — same operation, edges tombstoned = 1
--
--    The RESTORE arm is keyed on `deleted_via_type = v_token` too, so it was
--    doubly dead. Net effect: an entity could be trashed while its edges stayed
--    live, and no restore could ever bring the right ones back.
--
-- 2. VERSION HISTORY WAS FILED UNDER A NAME NOTHING CAN LOOK UP.
--    `_version_capture` writes `TG_ARGV[0]` straight into
--    `history.row_versions.entity_type` with NO validation (the column is free
--    text — the table's only constraint is its PK), so it wrote the dead token
--    happily and forever:
--
--      BEFORE — soft-deleting that mandate wrote its SOFT_DELETE snapshot as
--               entity_type='agent_slot'  (canonical 'mandate' rows: 0)
--
--    Live census before the repair — the history of each table was SPLIT, with
--    the dead half still growing TODAY while the canonical half stopped at the
--    rename:
--
--      agent_slot           3,190 rows, latest 2026-08-23 07:53   <- still growing
--      mandate                694 rows, latest 2026-08-17
--      agent_slot_exemplar     95 rows, latest 2026-08-23 06:17   <- still growing
--      mandate_exemplar       334 rows, latest 2026-08-17
--      agent_slot_binding       8 rows, latest 2026-08-22
--      mandate_binding         18 rows, latest 2026-08-08
--      expertise_pack         130 rows, latest 2026-08-20
--      rulebook                48 rows, latest 2026-08-17
--      content_template        12 rows, latest 2026-08-16
--      message_template         2 rows, latest 2026-07-22
--
--    Anything asking "show me this mandate's version history" by the canonical
--    token saw the pre-rename rows only, and silently missed every change since.
--
-- ============================================================================
-- THE REPAIR
-- ============================================================================
-- 1. Repoint every drifted trigger. Done GENERICALLY — the fix reads each
--    trigger's own definition and rewrites only the token literal, so it
--    repairs any table with this drift rather than a hand-listed five. 13
--    triggers were repointed in the dry run.
--
-- 2. Relabel the 3,435 mis-filed `history.row_versions` rows onto the canonical
--    token, reuniting each table's history.
--
--    ON MUTATING AN APPEND-ONLY LEDGER — deliberate and narrow. Not one
--    recorded FACT changes: `row_data`, `actor_id`, `actor_tier`, `operation`,
--    `occurred_at`, `version` are all untouched. Only `entity_type` moves, and
--    it currently points at a token that does not exist, which makes the row
--    unreachable by any canonical lookup. Correcting a pointer to a dead name is
--    a repair; leaving it would permanently strand the history of five tables.
--    The mapping is 1:1 and unambiguous (each dead token belongs to exactly one
--    table, and the codebase already treats them as legacy aliases — e.g.
--    `aidream/services/references/resources.py` maps "expertise_pack" ->
--    "rulebook"). No code reads history by the dead tokens (swept both repos).
--
-- 3. A STANDING GUARD, `audit.trigger_token_drift`, modelled on
--    `audit.registry_location_drift` (db-rules §1). Any row = a trigger whose
--    token argument disagrees with the registered token of the table it sits
--    on. This class was invisible until now precisely because nothing compared
--    the two; it should never again be found by hand.
--
-- Idempotent: the repoint is a no-op once no trigger drifts, the relabel is a
-- no-op once no dead-token rows remain, and the view is CREATE OR REPLACE.

BEGIN;

-- 1. Repoint every drifted _version_capture / _gc_entity_associations trigger.
DO $$
DECLARE
  r record;
  v_arg text;
  v_real text;
  v_def text;
  v_fixed int := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl, tg.tgname,
           pg_get_triggerdef(tg.oid) AS def
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT tg.tgisinternal
      AND pg_get_triggerdef(tg.oid) ~ '(_version_capture|_gc_entity_associations)\('
  LOOP
    v_arg  := (regexp_match(r.def, '\(''([a-z0-9_]+)''\)'))[1];
    SELECT e.token INTO v_real FROM platform.entity_types e
     WHERE e.schema_name = r.sch AND e.table_name = r.tbl;

    IF v_arg IS NOT NULL AND v_real IS NOT NULL AND v_arg <> v_real THEN
      EXECUTE format('DROP TRIGGER %I ON %I.%I', r.tgname, r.sch, r.tbl);
      v_def := replace(r.def, '(''' || v_arg || ''')', '(''' || v_real || ''')');
      EXECUTE v_def;
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'repointed %.% trigger % : % -> %', r.sch, r.tbl, r.tgname, v_arg, v_real;
    END IF;
  END LOOP;
  RAISE NOTICE 'trigger token repointing: % trigger(s) fixed', v_fixed;
END $$;

-- 2. Reunite the split histories. Label only — no recorded fact is altered.
UPDATE history.row_versions SET entity_type = 'mandate'           WHERE entity_type = 'agent_slot';
UPDATE history.row_versions SET entity_type = 'mandate_binding'   WHERE entity_type = 'agent_slot_binding';
UPDATE history.row_versions SET entity_type = 'mandate_exemplar'  WHERE entity_type = 'agent_slot_exemplar';
UPDATE history.row_versions SET entity_type = 'message_template'  WHERE entity_type = 'content_template';
UPDATE history.row_versions SET entity_type = 'rulebook'          WHERE entity_type = 'expertise_pack';

-- 3. The standing guard this class needed.
CREATE OR REPLACE VIEW audit.trigger_token_drift AS
SELECT n.nspname                        AS schema_name,
       c.relname                        AS table_name,
       tg.tgname                        AS trigger_name,
       (regexp_match(pg_get_triggerdef(tg.oid), '\(''([a-z0-9_]+)''\)'))[1] AS trigger_token,
       e.token                          AS registered_token
FROM pg_trigger tg
JOIN pg_class c      ON c.oid = tg.tgrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
LEFT JOIN platform.entity_types e
       ON e.schema_name = n.nspname AND e.table_name = c.relname
WHERE NOT tg.tgisinternal
  AND pg_get_triggerdef(tg.oid) ~ '(_version_capture|_gc_entity_associations)\('
  AND e.token IS NOT NULL
  AND (regexp_match(pg_get_triggerdef(tg.oid), '\(''([a-z0-9_]+)''\)'))[1] IS DISTINCT FROM e.token;

COMMENT ON VIEW audit.trigger_token_drift IS
  'Any row = a _version_capture / _gc_entity_associations trigger whose token ARGUMENT disagrees with the registered token of the table it sits on. That drift is silent in both directions: association GC matches nothing (trash/restore/delete leave edges behind) and version snapshots are filed into history.row_versions under a name no canonical lookup can find. Found 2026-08-21 with 13 drifted triggers across 5 renamed tables. Sibling of audit.registry_location_drift (db-rules §1). MUST BE EMPTY.';

-- 4. Prove it, or nothing lands.
DO $$
DECLARE v_drift int; v_dead int;
BEGIN
  SELECT count(*) INTO v_drift FROM audit.trigger_token_drift;
  IF v_drift <> 0 THEN
    RAISE EXCEPTION 'audit.trigger_token_drift is not empty after the repair: % row(s)', v_drift;
  END IF;

  SELECT count(*) INTO v_dead FROM history.row_versions
   WHERE entity_type IN ('agent_slot','agent_slot_binding','agent_slot_exemplar','content_template','expertise_pack');
  IF v_dead <> 0 THEN
    RAISE EXCEPTION '% history row(s) still filed under a dead token', v_dead;
  END IF;

  -- No history row should reference a token that does not exist at all.
  SELECT count(*) INTO v_dead
    FROM (SELECT DISTINCT entity_type FROM history.row_versions) h
   WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = h.entity_type);
  RAISE NOTICE 'history.row_versions references % distinct token(s) with no entity_types row (pre-existing, not created here)', v_dead;
END $$;

COMMIT;
