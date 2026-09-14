-- agent_change_impact_07_org_knobs.sql
-- I9 — the two organization knobs the mandate names beside `revert_window_hours` (opinions become
-- knobs; limits-are-knobs). Both overridable by an organization; both read live, never a constant.
--
-- `auto_advance_green` (boolean, default OFF): after a person saves an agent, the pins that meet
-- EVERY hard condition — grade green or identical, no blocker, zero unexpected settings findings,
-- the capability check ran, no duplicated descendant at a higher grade, and a target at least
-- `minimum_version_age_hours` old — are advanced through the SAME advance route the batch panel
-- uses, and the result announces itself with a "Put back" door (the revert). OFF means nothing
-- automatic, ever: the badge and the panel still show every pin. Read through the settings ladder
-- (`platform.knob_resolve`) in features/mandates/admin/impact.ts::readAutoAdvanceGreen.
--
-- `minimum_version_age_hours` (integer, default 24, 0–720): a version younger than this has not
-- been observed running anywhere, so it never auto-advances — the server reads the ROW's own
-- organization through `scoped_knob_int` (aidream/services/agent_impact/service.py) and the verdict
-- carries the reason as a `pin.too_young` finding ("v30 is 3 h old; this organization waits 24 h").
-- A person may still advance such a pin by hand. 0 = no wait; 720 h = 30 days, past which a knob
-- would only hide the wait's purpose.
--
-- Agent-set under blind approval by Claude Opus 5, 2026-09-14; Arman has NOT reviewed them.
-- Review due 2026-10-13, with the other agent_impact rows. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, taxonomy_node_id)
values
  ('agent_impact', 'auto_advance_green', 'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null, null,
   'Advance green pins automatically after an agent is saved',
   'When you save an agent, the jobs pinned to it whose change is green or identical, whose settings check ran clean, whose duplicates are no worse, and whose new version is older than the minimum version age are moved to the new version by themselves. Every automatic move announces itself with a Put back button. Off means nothing moves without a click.',
   'agent',
   'Agent Change Impact I9 (mandate: earned later, on instrumented batches — off by default). Read live through platform.knob_resolve in features/mandates/admin/impact.ts; the hard conditions are not knobs.',
   date '2026-10-13', '{organization}', 'any',
   (select taxonomy_node_id from platform.feature_knob where feature = 'agent_impact' and taxonomy_node_id is not null limit 1)),
  ('agent_impact', 'minimum_version_age_hours', '24', '24', 'integer', 'hours', 0, 720, null,
   'Minimum age of a version before it auto-advances',
   'A new agent version must be at least this many hours old before any pin moves to it automatically. Younger versions can still be advanced by a person; the impact table says how old the version is and how long this organization waits.',
   'agent',
   'Agent Change Impact I9; was the constant MINIMUM_VERSION_AGE_HOURS = 24 in aidream/services/agent_impact/service.py, now read per row organization through scoped_knob_int there.',
   date '2026-10-13', '{organization}', 'any',
   (select taxonomy_node_id from platform.feature_knob where feature = 'agent_impact' and taxonomy_node_id is not null limit 1))
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  overridable_by = excluded.overridable_by,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.review_due else excluded.review_due end;

do $$ begin
  if (select count(*) from platform.feature_knob
      where feature = 'agent_impact' and key in ('auto_advance_green', 'minimum_version_age_hours')) <> 2 then
    raise exception 'agent_impact.auto_advance_green / minimum_version_age_hours were not registered';
  end if;
end $$;
