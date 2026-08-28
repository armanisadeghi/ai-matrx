-- Product capture: item close lifecycle + workflow-event instrumentation.
--
-- The status column becomes a real capture lifecycle:
--   capturing  — the photographer is still on this item (photos/notes landing)
--   captured   — the item is CLOSED (Next / QR-advance / manual "mark ready");
--                the downstream handoff marker consumers key on
--   processed  — a downstream consumer (the intake workflow) finished it
--
-- Items are now BORN 'capturing' and flip to 'captured' when the photographer
-- moves on. The transition INTO 'captured' is what fires the product-capture
-- event trigger (workflow.trigger kind='event' on this table, when_column=
-- status, when_value=captured) — so a half-captured item never processes, and
-- flipping 'processed' back to 'captured' IS the reprocess action (the
-- transition fires again). Existing rows keep status='captured' (they were
-- finished captures).
--
-- workflow.watch_table attaches the generic capture trigger
-- (workflow.emit_trigger_events, matrx-graph migration 0111) — the
-- caller-independent chokepoint: browser writes, agent writes, and SQL all
-- fire it identically. With no active event trigger registered for this
-- table the function matches nothing and is a no-op.
--
-- Idempotent. Applied live via Supabase MCP + ledgered (source='matrx-frontend').

ALTER TABLE workbench.product_capture_item
    DROP CONSTRAINT IF EXISTS product_capture_item_status_check;
ALTER TABLE workbench.product_capture_item
    ADD CONSTRAINT product_capture_item_status_check
    CHECK (status = ANY (ARRAY['capturing'::text, 'captured'::text, 'processed'::text]));

ALTER TABLE workbench.product_capture_item
    ALTER COLUMN status SET DEFAULT 'capturing';

COMMENT ON COLUMN workbench.product_capture_item.status IS
    'Capture lifecycle: capturing (open on the capture surface) → captured (closed; fires the workflow event trigger on the transition; the downstream handoff marker) → processed (consumer finished). processed → captured = reprocess.';

SELECT workflow.watch_table('workbench.product_capture_item');
