-- workbench_product_capture_instant_mode — the CLIENT-side instant-analysis test lane.
--
-- Arman is A/B-testing two process modes for product capture:
--   · SERVER lane (existing): closeItem() moves status capturing → 'captured'; the aidream
--     workflow trigger (to be attached via workflow.watch_table) fires on that transition and
--     runs the pipeline server-side.
--   · INSTANT lane (this migration): the capture surface itself runs the intake-analysis agent
--     (mandate `product_capture.instant_analysis`, default Holder: Electronics Intake Analyzer)
--     and streams the `electronics_intake_analysis` kind straight back into the UI. On success
--     the item goes capturing → 'processed' DIRECTLY — it never enters 'captured', so the
--     server-side workflow can never double-process an instant-lane item. No new status value
--     is needed; the lane distinction is "which transition the item took".
--
-- Two changes:
--   1. `workbench.product_capture_payload.kind` gains 'instant_analysis' — the raw agent-kind
--      object is stored verbatim under its own kind (NEVER shoehorned into 'analysis', whose
--      shape is the pipeline's AnalysisResult contract in pipeline-types.ts).
--   2. The mandate row `product_capture.instant_analysis` (DATA, agent.mandate) — the agent
--      identity lives in the DATABASE per the mandates law; the client resolves the key and
--      never names an agent UUID. System org + public visibility, matching the platform's
--      system mandates. Rebind/swap happens in the mandate UI, no deploy.
--
-- Applied live as `workbench_product_capture_instant_mode`. Idempotent.

alter table workbench.product_capture_payload
  drop constraint if exists product_capture_payload_kind_check;
alter table workbench.product_capture_payload
  add constraint product_capture_payload_kind_check
  check (kind = any (array['analysis'::text, 'research'::text, 'grading'::text,
                           'listing'::text, 'instant_analysis'::text]));

insert into agent.mandate
  (mandate_key, label, description, output_kind, contract,
   default_agent_id, use_latest, is_enabled, organization_id, visibility,
   metadata, pins, pinned_context)
select
  'product_capture.instant_analysis',
  'Product Capture — Instant Intake Analysis',
  'Analyzes one captured item''s photos right from the capture surface (the client-triggered '
  || 'test lane): identifies the product, extracts identifiers, flags condition issues, and '
  || 'returns the electronics_intake_analysis record the UI streams live. The server-side lane '
  || 'runs the same job through the workflow trigger on the captured-status transition instead.',
  'electronics_intake_analysis',
  '{"accepts_user_input": true, "required_variables": [], "required_output_keys": [],
    "auto_context_disabled": false, "required_context_policies": []}'::jsonb,
  '9ffae063-48b2-488e-ae84-5b515998a7ae',  -- Electronics Intake Analyzer (initial default; rebindable in the mandate UI)
  true, true,
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- the system-mandates org (matches every platform mandate row)
  'public', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
-- agent.mandate has no unique constraint on mandate_key — guard by existence instead of ON CONFLICT.
where not exists (select 1 from agent.mandate
                   where mandate_key = 'product_capture.instant_analysis'
                     and deleted_at is null);

do $verify$
begin
  if not exists (select 1 from agent.mandate
                  where mandate_key = 'product_capture.instant_analysis' and is_enabled) then
    raise exception 'instant_mode: mandate row missing after insert';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'product_capture_payload_kind_check'
                    and pg_get_constraintdef(oid) like '%instant_analysis%') then
    raise exception 'instant_mode: payload kind CHECK not extended';
  end if;
end
$verify$;
