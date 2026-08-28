-- Product pipeline — the AI-driven listing workflow over capture items:
-- intake analysis → research → human-in-the-loop review → finalize →
-- listing approval. Adds to the existing workbench.product_capture_item
-- (see workbench_product_capture_2026_08_28.sql + the status/close
-- lifecycle migration):
--
--   1. `stage` — WHERE the item sits in the pipeline. The table is already
--      instrumented with workflow.watch_table, so stage transitions are
--      caller-independent workflow event triggers (register workflow.trigger
--      kind='event' when_column=stage per hop): humans move analysis→research
--      ("send to research"), review→research (resubmit with answers),
--      finalize→listing ("generate listing"); agents move intake→analysis,
--      research→review, listing (draft written). `listed` = approved.
--      Never fire workflows from client code — the stage write is the
--      trigger path, identical for UI, agents, SQL, imports.
--   2. `featured_file_id` — the human-designated featured image (drives the
--      image-first mobile Q&A queue and list thumbnails everywhere).
--   3. `workbench.product_capture_question` — the human-in-the-loop queue:
--      agents raise questions; humans answer (desktop workspace or the
--      mobile quick-answer queue), skip (back of the queue via skip_count),
--      or defer ("not a quick answer" → routed out of the quick flow).
--   4. `workbench.product_capture_payload` — the per-stage AI payload store:
--      ONE row per (item, kind) holding the agent-written, human-edited
--      document (analysis / research / grading / listing) as jsonb.
--      Deliberately jsonb-per-kind: the shapes WILL change rapidly while the
--      pipeline is learned; the shape contract lives in
--      features/product-capture/pipeline-types.ts, versioned inside the
--      payload (`version` key), so iteration never needs DDL. First-class
--      facts the UI filters/joins on stay REAL columns on the item (stage,
--      code, featured image) — the payload is the document, not the index.
--
-- Idempotent. Applied live via Supabase MCP + ledgered (source='matrx-frontend').

-- 1 + 2. Pipeline position + featured image on the item.
ALTER TABLE workbench.product_capture_item
    ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'intake';
ALTER TABLE workbench.product_capture_item
    DROP CONSTRAINT IF EXISTS product_capture_item_stage_check;
ALTER TABLE workbench.product_capture_item
    ADD CONSTRAINT product_capture_item_stage_check
    CHECK (stage = ANY (ARRAY[
      'intake'::text,      -- captured, awaiting/undergoing first AI analysis
      'analysis'::text,    -- first vision pass written; human can inspect/split
      'research'::text,    -- research agents working (or queued)
      'review'::text,      -- open questions need humans (HITL cycle)
      'finalize'::text,    -- grading + last tweaks before generation
      'listing'::text,     -- listing draft generated, awaiting approval
      'listed'::text       -- approved (export-ready; publishing is future scope)
    ]));

ALTER TABLE workbench.product_capture_item
    ADD COLUMN IF NOT EXISTS featured_file_id uuid REFERENCES files.files(id) ON DELETE SET NULL;

COMMENT ON COLUMN workbench.product_capture_item.stage IS
    'Pipeline position (intake→analysis→research→review→finalize→listing→listed). Transitions fire workflow event triggers via workflow.watch_table — the stage write IS the workflow handoff; never fire pipeline workflows from client code.';
COMMENT ON COLUMN workbench.product_capture_item.featured_file_id IS
    'Human-designated featured image (files.files). Drives the mobile Q&A queue and thumbnails; falls back to the first photo when null.';

CREATE INDEX IF NOT EXISTS product_capture_item_stage_idx
    ON workbench.product_capture_item (organization_id, stage, created_at DESC)
    WHERE deleted_at IS NULL;

-- 3. The human-in-the-loop question queue.
do $$
begin
  if to_regclass('workbench.product_capture_question') is null then
    perform platform.create_entity_table(
      p_schema => 'workbench', p_table => 'product_capture_question',
      p_token => 'product_capture_question', p_label => 'Product Capture Question',
      p_fields => array[
        'item_id uuid NOT NULL REFERENCES workbench.product_capture_item(id) ON DELETE CASCADE',
        -- The question itself + why the agent needs it.
        'prompt text NOT NULL',
        'context text',
        -- choice renders quick-answer chips (options = [{value,label}]);
        -- boolean renders Yes/No; text renders free text + voice.
        $f$kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','choice','boolean'))$f$,
        $f$options jsonb NOT NULL DEFAULT '[]'::jsonb$f$,
        -- Which pass raised it (drives grouping + resubmit routing).
        $f$source text NOT NULL DEFAULT 'research' CHECK (source IN ('analysis','research','finalize','human'))$f$,
        -- open → answered (by a human) → resolved (consumed by an agent on
        -- resubmit). deferred = "not a quick answer" — routed out of the
        -- quick-answer flow (physical testing etc.), never re-surfaced there.
        $f$status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','deferred','resolved'))$f$,
        'answer text',
        'answered_at timestamptz',
        'deferred_reason text',
        -- Skip = +1 and back of the queue (quick-answer orders by skip_count
        -- ASC, priority DESC, created_at ASC). blocking sorts above nice-to-have.
        'skip_count integer NOT NULL DEFAULT 0',
        'priority integer NOT NULL DEFAULT 0'
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false,
      p_visibility => 'none', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false,
      p_parents => array['product_capture_item:item_id']);
  end if;
end $$;

CREATE INDEX IF NOT EXISTS product_capture_question_queue_idx
    ON workbench.product_capture_question (organization_id, status, skip_count, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS product_capture_question_item_idx
    ON workbench.product_capture_question (item_id, status);

-- 4. The per-stage AI payload store (one document per item per kind).
do $$
begin
  if to_regclass('workbench.product_capture_payload') is null then
    perform platform.create_entity_table(
      p_schema => 'workbench', p_table => 'product_capture_payload',
      p_token => 'product_capture_payload', p_label => 'Product Capture Payload',
      p_fields => array[
        'item_id uuid NOT NULL REFERENCES workbench.product_capture_item(id) ON DELETE CASCADE',
        $f$kind text NOT NULL CHECK (kind IN ('analysis','research','grading','listing'))$f$,
        -- The document. Shape contract (versioned via a `version` key inside)
        -- lives in features/product-capture/pipeline-types.ts.
        $f$data jsonb NOT NULL DEFAULT '{}'::jsonb$f$
      ],
      p_variant => 'component', p_versioned => false, p_soft_delete => false,
      p_visibility => 'none', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => true,
      p_parents => array['product_capture_item:item_id']);
  end if;
end $$;

-- One document per (item, kind) — agents and humans CAS onto the same row.
CREATE UNIQUE INDEX IF NOT EXISTS product_capture_payload_item_kind_uk
    ON workbench.product_capture_payload (item_id, kind);
