-- Canonicalization flip (2026-07-02): collapse two research M2M junctions into
-- platform.associations, per canonicalization_worklog.md §4.1 / §4.2.
--
--   research.rs_source_tag     → association research_source → research_tag   (46 rows, 0 dependent fns)
--   research.rs_keyword_source → association research_source → research_keyword (3023 rows, 0 dependent fns)
--
-- SOP (worklog §2): insert edges (org from rs_source, legacy_table+legacy_id in
-- metadata), verify count(new edges)==count(*) junction (RAISE→rollback on
-- mismatch), de-register the junction token, drop its composition relationship
-- rows, retire the table to graveyard (never DROP), log to deprecated_relations.
--
-- Idempotent: each block is guarded on the junction still living in `research`;
-- once retired to graveyard the block is a no-op. Atomic under apply_migration.

DO $$
DECLARE n_j int; n_a int;
BEGIN
  -- ── §4.1  research.rs_source_tag → research_source → research_tag ───────────
  IF to_regclass('research.rs_source_tag') IS NOT NULL THEN
    INSERT INTO platform.associations
      (source_type, source_id, target_type, target_id, organization_id,
       role, position, label, created_by, created_at, metadata)
    SELECT 'research_source', j.source_id, 'research_tag', j.tag_id,
           s.organization_id, NULL, NULL, NULL, NULL,
           COALESCE(j.created_at, now()),
           jsonb_strip_nulls(jsonb_build_object(
             'is_primary_source', j.is_primary_source,
             'confidence',        j.confidence,
             'assigned_by',       j.assigned_by))
           || jsonb_build_object('legacy_table','research.rs_source_tag','legacy_id', j.id)
    FROM research.rs_source_tag j
    LEFT JOIN research.rs_source s ON s.id = j.source_id
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    SELECT count(*) INTO n_j FROM research.rs_source_tag;
    SELECT count(*) INTO n_a FROM platform.associations
      WHERE source_type='research_source' AND target_type='research_tag'
        AND metadata->>'legacy_table'='research.rs_source_tag';
    IF n_j <> n_a THEN
      RAISE EXCEPTION 'rs_source_tag edge count mismatch: junction=% assoc=%', n_j, n_a;
    END IF;

    DELETE FROM platform.entity_relationships WHERE child_type='research_source_tag';
    DELETE FROM platform.entity_types        WHERE token='research_source_tag';
    ALTER TABLE research.rs_source_tag SET SCHEMA graveyard;
    INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, archived_as)
    VALUES ('research.rs_source_tag',
            'platform.associations (research_source→research_tag)',
            'M2M collapse to canonical associations (worklog §4.1)',
            'graveyard.rs_source_tag');
  END IF;

  -- ── §4.2  research.rs_keyword_source → research_source → research_keyword ───
  IF to_regclass('research.rs_keyword_source') IS NOT NULL THEN
    INSERT INTO platform.associations
      (source_type, source_id, target_type, target_id, organization_id,
       role, position, label, created_by, created_at, metadata)
    SELECT 'research_source', j.source_id, 'research_keyword', j.keyword_id,
           s.organization_id, NULL, j.rank_for_keyword, NULL, NULL,
           COALESCE(j.created_at, now()),
           jsonb_build_object('legacy_table','research.rs_keyword_source','legacy_id', j.id)
    FROM research.rs_keyword_source j
    LEFT JOIN research.rs_source s ON s.id = j.source_id
    ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

    SELECT count(*) INTO n_j FROM research.rs_keyword_source;
    SELECT count(*) INTO n_a FROM platform.associations
      WHERE source_type='research_source' AND target_type='research_keyword'
        AND metadata->>'legacy_table'='research.rs_keyword_source';
    IF n_j <> n_a THEN
      RAISE EXCEPTION 'rs_keyword_source edge count mismatch: junction=% assoc=%', n_j, n_a;
    END IF;

    DELETE FROM platform.entity_relationships WHERE child_type='research_keyword_source';
    DELETE FROM platform.entity_types        WHERE token='research_keyword_source';
    ALTER TABLE research.rs_keyword_source SET SCHEMA graveyard;
    INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, archived_as)
    VALUES ('research.rs_keyword_source',
            'platform.associations (research_source→research_keyword)',
            'M2M collapse to canonical associations (worklog §4.2)',
            'graveyard.rs_keyword_source');
  END IF;
END $$;
