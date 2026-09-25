-- Inverse of migrations/campaign/sc2_agents_read_context_from_the_old_system_until_the_switch.sql (lane SC-2').
-- Removes the knob row (and, by its foreign key, any organization override of it). With the knob
-- gone, knob_resolve answers null, which the aidream chooser reads as the old path.
delete from platform.feature_knob where feature = 'custom' and key = 'agent_context_reads_the_copy';
