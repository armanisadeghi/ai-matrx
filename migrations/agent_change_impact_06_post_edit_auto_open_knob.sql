-- agent_change_impact_06_post_edit_auto_open_knob.sql
-- I6 — whether the post-edit "this change reaches N mandates" badge also OPENS the impact
-- panel by itself, as an organization knob (opinions become knobs; limits-are-knobs).
--
-- After a person saves an agent, the frontend reads `POST /mandates/impact/mine` for that
-- agent and its duplicated descendants. When the change reaches at least one job, a
-- non-blocking badge appears beside the save pill and a toast offers a "Review" door; both
-- open the batch panel scoped to that agent. This knob decides whether the panel ALSO opens
-- on its own. Default OFF: a save is the person's moment, and a window that jumps up on
-- every save is the interruption the mandate explicitly did not ask for ("not that it
-- should stop me, but it should make it pretty clear"). An organization that wants the
-- panel every time flips it on. Read through the settings ladder
-- (`platform.knob_resolve`, organization → user → device) in
-- features/mandates/admin/impact.ts::readPostEditAutoOpen — never a constant in code.
--
-- Agent-set under blind approval by Claude Opus 5, 2026-09-14; Arman has NOT reviewed it.
-- Review due 2026-10-13, with the other agent_impact rows. Idempotent.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, taxonomy_node_id)
values
  ('agent_impact', 'post_edit_auto_open', 'false'::jsonb, 'false'::jsonb, 'boolean', null, null, null, null,
   'Open the impact panel automatically after saving an agent',
   'After you save an agent that a job pins, a badge and a toast always say how many jobs the change reaches and offer to open the impact panel. Turn this on to open that panel every time without clicking.',
   'agent',
   'New with the post-edit badge (Agent Change Impact I6); read live through platform.knob_resolve in features/mandates/admin/impact.ts. Off by default so a save never pops a window uninvited.',
   date '2026-10-13', '{organization}', 'any',
   (select taxonomy_node_id from platform.feature_knob where feature = 'agent_impact' and taxonomy_node_id is not null limit 1))
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  overridable_by = excluded.overridable_by,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human' then platform.feature_knob.review_due else excluded.review_due end;

do $$ begin
  if not exists (select 1 from platform.feature_knob where feature = 'agent_impact' and key = 'post_edit_auto_open') then
    raise exception 'agent_impact.post_edit_auto_open was not registered';
  end if;
end $$;
