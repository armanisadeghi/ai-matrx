-- agent_definition_version_notnull_parity
--
-- THE PROBLEM: `agent.definition_version` is a row-for-row snapshot of
-- `agent.definition`, written by trg_agx_agent_create_v1_snapshot /
-- trg_agx_agent_snapshot_version, which copy NEW.<col> straight across. But the
-- version table left agent_type / name / tools / tags / is_active NULLABLE
-- while the live table declares all five NOT NULL. The two tables disagreed
-- about their own contract, so every reader of agx_get_version_snapshot had to
-- guess which half to trust — and the frontend parser guessed "non-null" for
-- change_note too, which IS legitimately nullable, and threw a TypeError on
-- ~79% of saved versions (the snapshot trigger writes
-- current_setting('app.change_note', true), NULL for every ordinary save).
--
-- THE FIX: make the version table's nullability mirror the live table for the
-- five columns that can never be NULL, so the remaining nullable set
-- (description, category, model_id, change_note, input_kind, and the JSON
-- columns) is the honest, intentional one. Zero rows violate any of these
-- today; the SET NOT NULL statements verify that as they run.
--
-- NOT touched: change_note stays nullable — NULL is its normal value, and the
-- frontend parser was corrected to accept it rather than the column being
-- coerced to satisfy a wrong parser.
--
-- Idempotent: SET NOT NULL on an already-NOT NULL column is a no-op.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

DO $$
DECLARE
  v_col text;
  v_bad bigint;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['agent_type', 'name', 'tools', 'tags', 'is_active']
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM agent.definition_version WHERE %I IS NULL', v_col
    ) INTO v_bad;

    IF v_bad > 0 THEN
      RAISE EXCEPTION
        'agent.definition_version.% holds % NULL row(s); refusing SET NOT NULL. '
        'Investigate the writer before re-running — the snapshot triggers copy '
        'from agent.definition, where this column is NOT NULL.',
        v_col, v_bad;
    END IF;

    EXECUTE format(
      'ALTER TABLE agent.definition_version ALTER COLUMN %I SET NOT NULL', v_col
    );
  END LOOP;
END $$;
