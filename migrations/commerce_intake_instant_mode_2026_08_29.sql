-- commerce_intake_instant_mode — the CLIENT-side instant-analysis lane of the canonical
-- commerce intake capture app (/commerce/intake/instant), ported from the product-capture
-- trial per Arman's directive.
--
-- One change: the mandate row `commerce_intake.instant_analysis` (DATA, mandate.definition).
-- The agent identity lives in the DATABASE per the mandates law; the client resolves the key
-- and never names an agent UUID. Same initial default Holder and output kind as the trial's
-- `product_capture.instant_analysis` row; key follows the W5 `commerce_intake.*` family
-- (aidream commerce_intake/mandates.py) and the registry-blessed `mandate:<feature>.<key>`
-- source-feature pattern. Rebind/swap (e.g. a pricing workflow later) happens in the mandate
-- UI — no deploy. Idempotent (guard by existence; mandate_key has no unique constraint).
--
-- Applied live as `commerce_intake_instant_mode_mandate` (2026-08-29).
--
-- Storage note (no DDL needed): the instant lane's durable seams live on
-- `commerce.intake_asset.metadata` (`instant_run` pointer + `instant_analysis` record).
-- `commerce.asset_mandate_result` is deliberately NOT written from the client: its `step`
-- CHECK enumerates the W5 pipeline steps and W5 reads the latest non-superseded succeeded
-- row per step as that step's output under its own idempotency contract — a client-lane
-- row there would corrupt the ledger.

insert into mandate.definition
  (mandate_key, label, goal, description, output_kind, origin, goal_grounding,
   default_holder_type, default_holder_id, is_enabled, organization_id, visibility,
   accepts_user_input, pins, pinned_context, required_output_keys, required_context_policies,
   metadata)
select
  'commerce_intake.instant_analysis',
  'Commerce Intake — Instant Analysis',
  'Analyzes one intake asset''s photos right from the commerce capture surface (the '
  || 'client-triggered instant lane): identifies the product, extracts identifiers, flags '
  || 'condition issues, and returns the electronics_intake_analysis record the UI streams '
  || 'live. The server-side W5 pipeline runs the same job through the sweep on the '
  || 'captured pipeline_state instead; an instant-processed asset skips that state.',
  'Analyzes one intake asset''s photos right from the commerce capture surface (the '
  || 'client-triggered instant lane): identifies the product, extracts identifiers, flags '
  || 'condition issues, and returns the electronics_intake_analysis record the UI streams '
  || 'live. The server-side W5 pipeline runs the same job through the sweep on the '
  || 'captured pipeline_state instead; an instant-processed asset skips that state.',
  'electronics_intake_analysis',
  'code', 'A',
  'agent',
  '9ffae063-48b2-488e-ae84-5b515998a7ae',  -- Electronics Intake Analyzer (initial default; rebindable in the mandate UI)
  true,
  '39c38960-d30c-4840-b0c1-c9960de95582',  -- the system-mandates org (matches every platform mandate row)
  'public', true,
  '{}'::jsonb, '{}'::jsonb, array[]::text[], array[]::text[], '{}'::jsonb
where not exists (select 1 from mandate.definition
                   where mandate_key = 'commerce_intake.instant_analysis'
                     and deleted_at is null);

do $verify$
begin
  if not exists (select 1 from mandate.definition
                  where mandate_key = 'commerce_intake.instant_analysis' and is_enabled) then
    raise exception 'commerce instant_mode: mandate row missing after insert';
  end if;
end
$verify$;
