-- agent_change_impact_04_batch_size_knob.sql
-- I3 — the one limit the batch pin advance carries, as a knob (limits-are-knobs).
--
-- `POST /mandates/impact/advance` takes a list of apply tokens and writes each row inside its
-- own transaction (R8). The list is bounded so one request cannot hold the serving loop for
-- an unbounded number of row transactions; past the cap the request is REFUSED with the number
-- and the cap so the caller pages it, never answered partially. Platform-locked (`{}`): an
-- engineering ceiling, not a customer preference. Starting value 500 — the same ceiling the
-- impact read already carries for agent ids (`agent_impact.max_agent_ids`); read live through
-- `knob_int` in aidream/services/agent_impact/advance.py.
--
-- Agent-set under blind approval by Claude Opus 5, 2026-09-12; Arman has NOT reviewed it.
-- Review due 2026-10-13, with the other agent_impact rows. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, taxonomy_node_id)
values
  ('agent_impact', 'max_batch_tokens', '500', '500', 'integer', 'rows', 1, 5000, null,
   'Most rows in one batch pin advance',
   'The most jobs one batch advance or revert may write at once. Above it the request is refused with the number and the cap, so the caller can split it.',
   'agent',
   'New with the batch pin advance (Agent Change Impact I3); read live through knob_int in aidream/services/agent_impact/advance.py.',
   date '2026-10-13', '{}', 'any',
   (select taxonomy_node_id from platform.feature_knob where feature = 'agent_impact' and taxonomy_node_id is not null limit 1))
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.review_due else excluded.review_due end;

do $$ begin
  if not exists (select 1 from platform.feature_knob where feature = 'agent_impact' and key = 'max_batch_tokens') then
    raise exception 'agent_impact.max_batch_tokens was not registered';
  end if;
end $$;
