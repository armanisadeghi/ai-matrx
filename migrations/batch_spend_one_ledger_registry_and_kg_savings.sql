-- batch_spend_one_ledger_registry_and_kg_savings — batch spend is IN the headline now,
-- and the kg-cost savings tile reads the one honest savings computation.
--
-- WHY (2026-09-14). aidream migration 0679 landed every completed batch work item on
-- runtime.global_execution (link_kind batch_work_item) — the ledger this dashboard's
-- headline already sums. Two consequences here:
--   1. The registry still called batch.work_item "additive" ("separate spend") and said
--      "last write 2026-08-15". Read literally, that asks a reader to ADD it on top of a
--      headline that now contains it: the same dollar twice. It becomes an overlap lens,
--      and a measured row names where batch money lives in the headline.
--   2. fn_kg_cost_summary computed batch_savings_7d_usd as est_live_cost_usd - cost_usd:
--      a pre-submission ESTIMATE against a real bill (the 2026-09-13 run showed 76.8% for
--      what was really 50%). It now reads batch.savings_summary — the one place a batch
--      saving is computed (actual tokens at the live catalog rate).
--
-- Guards: aidream tests/test_batch_spend_ledger_live.py (registry must not call
-- batch.work_item additive/primary) and aidream scripts/check_batch_savings_source.py --live.

-- based-on: public._spend_ledger_registry() f68198d3b907f39eb19a96b21f47254a78bb9cebf97c953719a18e87a753617b
CREATE OR REPLACE FUNCTION public._spend_ledger_registry()
 RETURNS TABLE(ledger_key text, label text, schema_name text, table_name text, cost_column text, ts_column text, role text, note text)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT * FROM (VALUES
    ('runtime.global_execution', 'AI / provider executions', 'runtime', 'global_execution', 'cost', 'created_at', 'primary',
     'The canonical execution ledger. Every headline number on this page is this table and only this table.'),

    ('chat.user_request', 'Chat user requests', 'chat', 'user_request', 'total_cost', 'created_at', 'overlap',
     'The same provider spend seen per chat request rather than per execution. Shown for cross-checking; never added to the headline.'),
    ('chat.agent_run', 'Agent runs', 'chat', 'agent_run', 'total_cost', 'created_at', 'overlap',
     'Per-run roll-up of the same executions. Never added to the headline.'),
    ('chat.tool_call', 'Tool calls', 'chat', 'tool_call', 'cost_usd', 'created_at', 'overlap',
     'Tool-level slice, almost entirely $0 because model cost is billed on the execution, not the tool.'),

    ('batch.global_execution', 'Batch API work (inside the headline)', NULL, NULL, NULL, NULL, 'overlap',
     'Measured, and inside the primary total since 2026-09-14 — not additive. Every completed, priced batch.work_item is ONE runtime.global_execution row (link_kind batch_work_item, context.batch_lane batch or escalated_live) at its billed price, so the explorer''s Source dimension shows it as batch_work_item. A partial unique index refuses a second row per item. The money batching SAVED is batch.savings_summary: the same actual tokens priced at the live catalog rate, minus the bill.'),
    ('batch.cost_event', 'Background AI cost events', 'batch', 'cost_event', 'cost_usd', 'created_at', 'additive',
     'Mixed producers keyed by idempotency prefix (batch_item:, auto_ingest:, ner_agents:, sweeps). Its batch_item: rows are the SAME money as batch.work_item and are already inside the headline; the other prefixes are shown here for cross-checking and are not re-verified against the primary ledger. Never sum this table and call it batch spend.'),
    ('batch.work_item', 'Batch work items', 'batch', 'work_item', 'actual_cost_usd', 'created_at', 'overlap',
     'Per-item batch detail: actual_cost_usd is what the provider billed. Every completed item is also one runtime.global_execution row, so this is the drill-down, never spend to add.'),
    ('ops.proof_run', 'Proof runs', 'ops', 'proof_run', 'cost_usd', 'created_at', 'additive',
     'Resilience-lab proof runs. Live and small.'),
    ('rag.ingest_run', 'RAG ingest runs', 'rag', 'ingest_run', 'total_cost_usd', 'created_at', 'additive',
     'Separate embedding/extraction spend; last write 2026-09-03.'),
    ('hindsight.replay_step', 'Hindsight replays', 'hindsight', 'replay_step', 'cost_usd', 'created_at', 'additive',
     'Regression replays; last write 2026-08-17.'),

    ('rag.kg_sweep_run', 'Knowledge-graph sweeps', 'rag', 'kg_sweep_run', 'cost_usd', 'created_at', 'additive',
     'Priced 2026-09-12. Every sweep model call already lands on the primary ledger as an internal_agent_run execution; cost_usd is the sweep-level roll-up, now fed by the corrected tally (it used to collapse an unpriced call to $0). All 62 live rows predate the fix and made 0 model calls, so their $0 is a measured zero, not a hole.'),
    ('docproc.derive_runs', 'Document derive runs', 'docproc', 'derive_runs', 'cost_usd', 'started_at', 'gap',
     'Cost column exists and has never been written.'),
    ('docproc.page_extraction_runs', 'Page extraction runs', 'docproc', 'page_extraction_runs', 'total_cost', 'created_at', 'additive',
     'Priced 2026-09-12. Two defects fixed together: the chunk executor read cost from a key the AI layer never returns (always $0), and the run settle never persisted the total. The same figure is now also metered onto the primary ledger, so read this column as the per-run detail, not as spend to add.'),
    ('docproc.processed_documents', 'Document cleaning', 'docproc', 'processed_documents', 'clean_content_cost_usd', 'created_at', 'additive',
     'Priced 2026-09-12 on the whole-document cleaning path, which now writes the cleaner agent''s real cost. The resumable per-page cleaning path still writes nothing: its runner returns a bare dict across the matrx-rag package seam, so cost cannot reach the row without changing that protocol. Rows before 2026-09-12 are NULL.'),
    ('communication.sms_messages', 'SMS (Twilio)', 'communication', 'sms_messages', 'price', 'created_at', 'additive',
     'Written since 2026-09-12. The outbound dispatcher now stores Twilio''s own answer on every accepted send — num_segments always, price/price_unit whenever Twilio has priced the message — and opens a matching primary-ledger row (link_kind external_api, twilio:sms) charged at segments x the twilio_sms_segment_usd knob, or at Twilio''s real price when it returned one. Read this column as the per-message detail, not as spend to add: the same money is already in the headline. Rows before 2026-09-12 are NULL, and Twilio''s create response usually prices a message as null (it prices after the carrier accepts), so a populated price is the exception, not the rule.'),
    ('crm.enrichment_call', 'CRM enrichment calls', 'crm', 'enrichment_call', 'estimated_cost_usd', 'created_at', 'gap',
     'Table has zero rows.'),
    ('crm.registry_ingest_run', 'CRM registry ingest', 'crm', 'registry_ingest_run', 'estimated_cost_usd', 'created_at', 'gap',
     'Table has zero rows.'),

        ('unmeasured.email',        'Email (Resend)',                NULL, NULL, NULL, NULL, 'unmeasured',
     'Plan-billed, never per email: part of the fixed monthly figure entered in the platform.spend.fixed_monthly_usd setting, shown per day under the headline.'),
    ('speech.global_execution', 'Text-to-speech and transcription', NULL, NULL, NULL, NULL, 'overlap',
     'Measured, and already inside the primary total — not a gap. STT and TTS are priced by the AI catalog like any model (ai.offering pricing, per audio-second or per character) and settle as global_execution rows with link_kind audio_transcription / audio_speech: 3,364 transcriptions and 29,819 audio seconds for $0.38 since 2026-07-15. That is genuinely near-free: $0.046/hour against Groq whisper-large-v3-turbo''s $0.04/hour list. The 5 zero-cost rows were an unpriced call recorded as a believable $0; since 2026-09-12 such a call records meters.unpriced_calls instead. Meet note-taker STT (LiveKit/Deepgram) is billed by LiveKit and has no row here.'),
    ('search.global_execution', 'Search and SEO data APIs',      NULL, NULL, NULL, NULL, 'overlap',
     'Measured since 2026-09-12, and already inside the primary total — no longer a gap. Every SerpAPI, Brave and DataForSEO call opens its own global_execution row (link_kind external_api, agent_run_label "<provider>:<operation>"), because all three funnel through exactly one transport apiece and the host observes each one. DataForSEO reports its own price in every response envelope and that real figure is recorded; SerpAPI and Brave sell calls in a bundle and report nothing, so they are priced from the platform.external_api_prices knobs (serpapi_search_usd, brave_search_usd) an admin can turn. A call we cannot price is recorded UNPRICED with a screaming log line, never as $0 — a $0 row would have this page claim a paid search was free.'),
    ('unmeasured.print_fulfil', 'Print fulfilment (Lulu)',        NULL, NULL, NULL, NULL, 'unmeasured',
     'Captured per order on commerce.print_order.lulu_total_incl_tax, which the Print orders tile shows — it is not in this ledger total.'),
        ('unmeasured.infra',        'Hosting and infrastructure',     NULL, NULL, NULL, NULL, 'unmeasured',
     'AWS ECS/Fargate, sandbox EC2, Supabase, Vercel. Billed by invoice: the fixed monthly figure entered in the platform.spend.fixed_monthly_usd setting, shown per day under the headline.')
  ) AS t(ledger_key, label, schema_name, table_name, cost_column, ts_column, role, note);
$function$;

-- based-on: public.fn_kg_cost_summary() a6e152373dae7ec635f10436fb01a51f7a2cc97ef7c95ca7942d5629cfe8ab58
CREATE OR REPLACE FUNCTION public.fn_kg_cost_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam', 'batch'
AS $function$
DECLARE
  v_spend_today numeric;
  v_spend_7d numeric;
  v_pending_batches int;
  v_orgs_over_80pct int;
  v_ner_chunks int;
  v_leaf_chunks int;
  v_ner_coverage_pct numeric;
  v_batch_savings_7d numeric;
  v_batch_savings jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION '/kg-cost is admin-only';
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_spend_today FROM batch.cost_event
   WHERE created_at >= now() - interval '24 hours';
  SELECT COALESCE(SUM(cost_usd), 0) INTO v_spend_7d FROM batch.cost_event
   WHERE created_at >= now() - interval '7 days';
  SELECT COUNT(*) INTO v_pending_batches FROM batch.provider_batch WHERE status IN ('pending', 'in_progress');
  -- The ONE savings computation (actual tokens at the live catalog rate, minus the
  -- bill). Never est_live_cost_usd, which prices estimated tokens.
  v_batch_savings := batch.savings_summary(now() - interval '7 days', now(), NULL);
  v_batch_savings_7d := COALESCE((v_batch_savings ->> 'saved_usd')::numeric, 0);
  SELECT COUNT(*) INTO v_orgs_over_80pct FROM iam.organization_preferences
   WHERE daily_auto_rag_budget_usd > 0
     AND (daily_auto_rag_window_start IS NULL OR daily_auto_rag_window_start >= now() - interval '24 hours')
     AND daily_auto_rag_cost_used_usd >= daily_auto_rag_budget_usd * 0.8;

  SELECT COUNT(DISTINCT chunk_id) INTO v_ner_chunks FROM rag.kg_chunk_entities;
  SELECT COUNT(*) INTO v_leaf_chunks FROM rag.kg_chunks c
   WHERE c.valid_to IS NULL AND NOT EXISTS (SELECT 1 FROM rag.kg_chunks ch WHERE ch.parent_chunk_id = c.id);
  v_ner_coverage_pct := CASE WHEN v_leaf_chunks <= 0 THEN 0
    ELSE LEAST(100.0, GREATEST(0.0, 100.0 * v_ner_chunks / v_leaf_chunks)) END;

  RETURN jsonb_build_object(
    'spend_today_usd', v_spend_today, 'spend_7d_usd', v_spend_7d,
    'orgs_over_80pct', v_orgs_over_80pct, 'pending_batches', v_pending_batches,
    'ner_coverage_pct', v_ner_coverage_pct,
    'batch_savings_7d_usd', v_batch_savings_7d,
    'batch_savings_7d_items', COALESCE((v_batch_savings ->> 'items')::int, 0),
    'batch_savings_7d_discount_pct', (v_batch_savings ->> 'discount_pct')::numeric
  );
END;
$function$;
