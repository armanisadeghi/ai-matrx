-- chair-step: THE INVERSE of `records_knob_no_longer_adds_the_tool_to_every_turn.sql`.
-- Puts the knob's label and description back verbatim. Two text columns of one row.
SELECT set_config('app.actor_system', 'migration:records_knob_no_longer_adds_the_tool_to_every_turn.inverse', true);

UPDATE platform.feature_knob
   SET label = 'Agents get the records tool',
       description = 'When this organization''s custom data store is on, every agent turn is offered the '
                     '`records` tool without anyone attaching it — the same way agents are offered the '
                     'generic user-data tools. Turn it off to require that each agent name the tool '
                     'explicitly. An organization whose store is off never sees the tool either way.'
 WHERE feature = 'custom' AND key = 'records_tool_default';
