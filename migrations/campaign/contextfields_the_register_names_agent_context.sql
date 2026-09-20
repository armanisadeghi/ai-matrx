-- chair-step: replacing campaign_watch.ramp_consumer's body is how a consumer joins the ramp, and this runner judges every CREATE OR REPLACE VIEW by hand
--
-- CONTEXT-FIELDS — THE RAMP REGISTER NAMES AGENT CONTEXT.
--
-- The register is a VIEW on purpose: which consumers exist is a fact about the codebase,
-- not data a person edits, so adding one is a migration with a diff. This file adds ONE
-- ROW — `agent_context` — and changes nothing else: same column list, same types, same
-- order, so every function declaring `campaign_watch.ramp_consumer%rowtype` is unaffected.
--
-- WHY IT SHARES RUNG 3 WITH SCOPES, AND THAT IS NOT AN OVERSIGHT. Agent context reads
-- SCOPE values. It cannot honestly be on before scopes are, so it belongs in the same
-- batch (`scopes_education_checkout`) at the same rung rather than at one of its own that
-- would imply it could be ramped independently.
--
-- INVERSE: migrations/inverse/contextfields_the_register_names_agent_context_down.sql —
-- the same view without this row.

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace view campaign_watch.ramp_consumer with (security_invoker = true) as
select *
  from (values
    ('grid', 'The data grid', 1, null::text, 'W6-GRID',
     timestamptz '2026-09-18 20:35+00', null::text,
     array['record']::text[], false, 'consumer_grid_enabled'),

    ('saved_ai_outputs', 'Saved AI outputs', 2, null, 'W5-AGENT / W5-MERGE',
     timestamptz '2026-09-16 05:40+00', null,
     array['message','conversation']::text[], false, 'consumer_saved_ai_outputs_enabled'),

    ('scopes', 'Scopes', 3, 'scopes_education_checkout', 'W2-ACCESS',
     null, 'No BUILD-LOG row records this consumer as landed. W2-ACCESS owns it.',
     array['scope']::text[], false, 'consumer_scopes_enabled'),

    ('agent_context', 'Agent context', 3, 'scopes_education_checkout', 'CONTEXT-FIELDS',
     timestamptz '2026-09-20 00:00+00', null,
     array['scope','record']::text[], false, 'consumer_context_enabled'),

    ('education', 'Education', 4, 'scopes_education_checkout', 'W6-BOOK',
     null, 'No BUILD-LOG row records this consumer as landed. W6-BOOK owns it.',
     array['fc_card']::text[], false, 'consumer_education_enabled'),

    ('checkout', 'Checkout', 5, 'scopes_education_checkout', 'W6-PORTAL',
     null, 'No BUILD-LOG row records this consumer as landed. W6-PORTAL owns it.',
     array['project']::text[], false, 'consumer_checkout_enabled'),

    ('extension', 'The Chrome extension', 6, null, 'W6-EXT',
     timestamptz '2026-09-19 01:30+00', null,
     array['record']::text[], false, 'consumer_extension_enabled'),

    ('chat_seeding', 'Chat seeding', 7, null, 'W5-RCHAT',
     null, 'No BUILD-LOG row records this consumer as landed. W5-RCHAT owns it.',
     array['thread','conversation']::text[], false, 'consumer_chat_seeding_enabled'),

    ('retirement', 'Retirement of the old stores', 8, null, 'W7-DEPR-DATA',
     null, 'The old stores are still live and nothing has retired them. This is the only step '
           'in the ramp with no rollback, and it is the owner''s call, never an agent''s.',
     array[]::text[], true, 'consumer_retirement_enabled')
  ) as c (consumer_id, label, ramp_order, batch, owning_lane, landed_at, not_ready_why,
          record_types, no_rollback, knob_key);
