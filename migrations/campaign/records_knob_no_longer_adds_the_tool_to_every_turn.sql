-- chair-step: rewrites the label and description of ONE platform knob row
-- (custom/records_tool_default). An UPDATE of two text columns: no DDL, no lock beyond the
-- one row, no grant, no value change. Its inverse puts both texts back verbatim.
--
-- WHY (owner, 2026-10-02: "REMOVE CUSTOM data tool"). The server never adds a tool on its
-- own. aidream's turn-time injection of `records` (tool_merge.ORG_KNOB_DEFAULT_TOOLS) is
-- removed in the same change, so this knob no longer puts `records` into every agent turn.
-- What it still governs is the agent INSERT seed (agent.org_default_tool +
-- agent._seed_org_default_tools): a new agent written with no tools starts carrying it.
-- The settings screen said "every agent turn is offered the records tool"; it now says
-- what the switch does.
SELECT set_config('app.actor_system', 'migration:records_knob_no_longer_adds_the_tool_to_every_turn', true);

UPDATE platform.feature_knob
   SET label = 'New agents start with records',
       description = 'New agents with no tools of their own start with the records tool.'
 WHERE feature = 'custom' AND key = 'records_tool_default';
