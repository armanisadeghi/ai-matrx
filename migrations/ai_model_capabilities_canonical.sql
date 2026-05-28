-- ai_model_capabilities_canonical.sql
--
-- Canonical-shape backfill for public.ai_model.capabilities. Before this
-- migration the column was a zoo — null / empty string / flat string
-- array / Google-style boolean object / OpenAI-style I/O object / the
-- literal `"[transcription]"` — and every reader did its own ad-hoc
-- normalization.
--
-- After this migration every row has the shape:
--   {input: ContentType[], output: ContentType[], features: FeatureKey[], interaction: "turn"|"realtime"}
-- where the union types are defined in features/ai-models/capabilities/types.ts
-- and parsed/normalized by features/ai-models/capabilities/parse.ts.
--
-- Strategy:
--   1. Add capabilities_pre_canonical JSONB snapshot column.
--   2. Copy every row's prior capabilities into the snapshot.
--   3. Apply 189 row-by-row UPDATEs computed by the TS parser (the row
--      list lived in /tmp/caps-updates.sql at migration time; SQL is
--      idempotent because the parser is deterministic on canonical input).
--
-- Reversion: `UPDATE public.ai_model SET capabilities = capabilities_pre_canonical`.
-- The snapshot column is kept for one release cycle, then dropped.
--
-- Applied 2026-05-28 via the Supabase MCP. This file captures the DDL +
-- a one-shot regeneration recipe for future deploys.

-- ─── DDL: snapshot column ──────────────────────────────────────────────
ALTER TABLE public.ai_model
  ADD COLUMN IF NOT EXISTS capabilities_pre_canonical JSONB;

COMMENT ON COLUMN public.ai_model.capabilities_pre_canonical IS
  'Snapshot of capabilities before the canonical-shape backfill (May 2026). Safety net for revert. Drop after one release.';

UPDATE public.ai_model
   SET capabilities_pre_canonical = capabilities
 WHERE capabilities_pre_canonical IS NULL;

-- ─── Data backfill ────────────────────────────────────────────────────
-- The UPDATE statements are computed by running the TypeScript parser at
-- features/ai-models/capabilities/parse.ts over every row. To regenerate
-- (e.g. after adding a new legacy shape variant):
--
--   1. Fetch all rows:
--      SELECT id, api_class, provider, capabilities_pre_canonical
--      FROM public.ai_model ORDER BY id;
--
--   2. Run the parser locally and emit UPDATE statements
--      (see scripts/caps-parse.py in dev history; logic mirrors parse.ts).
--
--   3. Wrap the UPDATE list in BEGIN; ... COMMIT; and apply.
--
-- The applied UPDATEs are intentionally NOT inlined into this file —
-- they are 189 row-specific JSON blobs and would obscure the migration's
-- intent. The TS parser is the source of truth; this file documents the
-- "how" so the next agent can re-run the backfill if it ever drifts.
