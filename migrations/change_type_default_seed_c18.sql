-- GENERATED from features/change-policy/catalogue.ts — do not hand-edit rows.
-- Idempotent: upserts every catalogue row, then reports (never deletes) strays.
insert into platform.change_type_default
  (change_type_key, row_num, tier, label, description, default_mode,
   default_timeout_minutes, default_timeout_expiry, floor_human_only, note)
values
  ('swap_to_cheaper_model', 1, 1, 'Swap to a cheaper model that replays equivalently', 'Replace the model behind a step with a cheaper one that replay has proven equivalent on real history.', 'automatic', 2880, 'proceed', false, ''),
  ('swap_to_stronger_model', 2, 1, 'Swap to a stronger model where quality is failing', 'Replace the model behind a failing step with a stronger (usually costlier) one.', 'review_with_timeout', 2880, 'proceed', false, ''),
  ('adjust_model_settings', 3, 1, 'Adjust model settings', 'Temperature, max tokens, reasoning effort, and other per-call parameters.', 'automatic', 2880, 'proceed', false, ''),
  ('tighten_loop_stop_condition', 4, 1, 'Tighten a loop''s stopping condition', 'Stop a loop earlier once continued iterations are measured to add nothing.', 'automatic', 2880, 'proceed', false, ''),
  ('adjust_retry_policy', 5, 1, 'Adjust a retry policy or backoff', 'Change how many times a step retries and how long it waits between attempts.', 'automatic', 2880, 'proceed', false, ''),
  ('reorder_independent_steps', 6, 1, 'Reorder independent steps for latency', 'Run steps with no data dependency in a faster order or in parallel.', 'automatic', 2880, 'proceed', false, ''),
  ('convert_full_to_preview_return', 7, 1, 'Convert a full response return to a preview return', 'Return a bounded preview plus a reference instead of a full payload where the full payload is waste.', 'automatic', 2880, 'proceed', false, ''),
  ('adjust_context_eviction', 8, 1, 'Add or adjust context eviction on an Orchestrator', 'Change what an Orchestrator forgets as its context window fills.', 'review_with_timeout', 2880, 'proceed', false, ''),
  ('edit_agent_instructions', 9, 2, 'Edit an Agent''s system prompt / instructions', 'Rewrite part of an Agent''s standing instructions based on reviewed evidence.', 'review_with_timeout', 2880, 'hold', false, ''),
  ('edit_roster_description', 10, 2, 'Edit an Orchestrator''s roster description of an Agent', 'Change how an Agent is described to the Orchestrator that decides when to call it.', 'review_with_timeout', 2880, 'hold', false, ''),
  ('change_gate_threshold', 11, 2, 'Change a step''s pass/fail definition or gate threshold', 'Move the line that decides whether a step''s output counts as good enough.', 'review', 2880, 'hold', false, ''),
  ('edit_rubric', 12, 2, 'Edit a rubric', 'Change the criteria a judge scores against.', 'review', 2880, 'hold', false, ''),
  ('change_agent_tools', 13, 2, 'Add or remove a Tool from an Agent', 'Change what an Agent is able to do by changing its toolset.', 'review', 2880, 'hold', false, ''),
  ('change_output_schema', 14, 2, 'Change an output schema / Content IR shape', 'Change the structured shape a unit promises to produce — every consumer of that shape is affected.', 'review', 2880, 'hold', false, ''),
  ('adjust_completion_criteria', 15, 2, 'Adjust an Orchestrator''s completion criteria', 'Change what an Orchestrator treats as ''done''.', 'review', 2880, 'hold', false, ''),
  ('replace_agent_with_agent', 16, 3, 'Replace an Agent with a different existing Agent', 'Point a slot at another Agent already in the catalog.', 'review', 2880, 'hold', false, ''),
  ('replace_workflow_with_workflow', 17, 3, 'Replace a Workflow with a different existing Workflow', 'Point a slot at another Workflow already in the catalog.', 'review', 2880, 'hold', false, ''),
  ('replace_agent_with_orchestra', 18, 3, 'Replace an Agent with an existing Orchestra', 'Swap a single Agent for a composed Orchestra where one mind was not enough.', 'review', 2880, 'hold', false, ''),
  ('replace_orchestra_with_workflow', 19, 3, 'Replace an Orchestra with an existing Workflow', 'Layer collapse using a catalog unit: the pattern held, so the improvisation hardens into steps.', 'review', 2880, 'hold', false, ''),
  ('replace_agent_call_with_function', 20, 3, 'Replace an Agent call with a Function, Tool, or Matrx Action', 'Swap judgment for determinism where the judgment call always lands the same way.', 'review', 2880, 'hold', false, ''),
  ('replace_function_with_agent', 21, 3, 'Replace a Function with an Agent where determinism was too rigid', 'Swap determinism for judgment where fixed code keeps mishandling real variety.', 'review', 2880, 'hold', false, ''),
  ('create_replacement_agent', 22, 4, 'Create a new Agent to replace one that isn''t getting the job done', 'Author a brand-new Agent, not pick an existing one.', 'review', 2880, 'hold', false, ''),
  ('crystallize_workflow_from_orchestra', 23, 4, 'Create a new Workflow by crystallizing an Orchestra''s repeated pattern', 'Turn a pattern an Orchestra keeps improvising into a fixed, cheaper Workflow.', 'review', 2880, 'hold', false, ''),
  ('create_orchestra_from_workflow', 24, 4, 'Create a new Orchestra to replace an over-rigid Workflow', 'Expand fixed steps back into judgment where the Workflow keeps failing on variety.', 'review', 2880, 'hold', false, ''),
  ('create_function_or_tool', 25, 4, 'Create a new Function or Tool', 'Author new executable capability.', 'review', 2880, 'hold', false, 'Will additionally route through the context-starved code reviewer once that guard is wired into the apply path.'),
  ('create_rubric_or_gate', 26, 4, 'Create a new rubric or gate where none existed', 'Add a quality bar where output previously shipped unjudged.', 'review', 2880, 'hold', false, ''),
  ('admit_unit_to_catalog', 27, 4, 'Admit a newly created unit into the org catalog', 'Make a new unit visible for other runs and builders to pick up.', 'review', 2880, 'hold', false, ''),
  ('add_workflow_step', 28, 5, 'Add a step to a Workflow', 'Grow the shape of a Workflow by one step.', 'review', 2880, 'hold', false, ''),
  ('remove_workflow_step', 29, 5, 'Remove a step from a Workflow', 'Shrink the shape of a Workflow by one step.', 'review', 2880, 'hold', false, ''),
  ('add_orchestra_member', 30, 5, 'Add an Agent to an Orchestra''s roster', 'Give an Orchestra a new member to delegate to.', 'review', 2880, 'hold', false, ''),
  ('remove_orchestra_member', 31, 5, 'Remove an Agent from an Orchestra''s roster', 'Take a member away from an Orchestra.', 'review', 2880, 'hold', false, ''),
  ('collapse_layer', 32, 5, 'Collapse a layer (Orchestra → Workflow)', 'Harden a judgment layer into deterministic steps.', 'review', 2880, 'hold', false, ''),
  ('expand_layer', 33, 5, 'Expand a layer (Workflow → Orchestra) after failures', 'Reopen a hardened layer into judgment after the fixed shape keeps failing.', 'review', 2880, 'hold', false, ''),
  ('split_or_merge_units', 34, 5, 'Split one unit into two, or merge two into one', 'Change how responsibility is divided between units.', 'review', 2880, 'hold', false, ''),
  ('move_layer_boundary', 35, 5, 'Change where a layer boundary sits', 'Move responsibility between layers of the composition.', 'review', 2880, 'hold', false, ''),
  ('promote_provisional_path', 36, 6, 'Promote a provisional path to compiled', 'Make a provisional route the standing one.', 'review', 2880, 'hold', false, ''),
  ('remove_passing_gate', 37, 6, 'Remove a gate that has passed N consecutive times', 'Judge compilation (Part VII): retire a check that never fires — which is also how a system blinds itself.', 'review', 2880, 'hold', false, ''),
  ('change_own_handling_mode', 38, 6, 'Change a change-type''s own handling mode', 'Edit THIS surface — how any kind of change is handled. Human only, always: the system may never widen its own permissions.', 'off', 2880, 'hold', true, 'Floored structurally in platform.resolve_change_handling — no catalogue edit, seed, or org row can lift it.'),
  ('revert_human_approved_change', 39, 6, 'Auto-revert a human-approved change to its prior version', 'Undo something a person explicitly approved (Part 0.13). The system may propose the revert; a person decides.', 'review', 2880, 'hold', false, 'Doc default is ''Propose revert'' — expressed here as Review: the proposal is the revert.'),
  ('rewrite_unit_purpose', 40, 6, 'Rewrite a unit''s stated purpose', 'Change what a unit SAYS it is for (Part 0.14) — the reference Internal Affairs measures it against.', 'review', 2880, 'hold', false, 'Stricter than its tier alone implies: purpose drift is how a system quietly redefines success.'),
  ('internal_affairs_revert_ai_change', 41, 6, 'Internal Affairs reverting an AI-authored change', 'AI may freely undo what AI did (Part 0.13) — the original change''s review window does not transfer to the correction.', 'automatic', 2880, 'hold', false, 'No waiting period inherited from the change being reverted.'),
  ('outreach.attribution_credit', 42, 1, 'Credit an outreach outcome to a campaign (attribution)', 'A pitched domain plus a link inside the window is credited to the campaign that pitched it — reversible in one click.', 'auto_with_audit', 2880, 'proceed', false, 'Registered by aidream services/outcome_attribution (D-W4-7/8/9). Default is Arman''s low-bar ruling: act, show, keep it reversible.')
on conflict (change_type_key) do update set
  row_num = excluded.row_num,
  tier = excluded.tier,
  label = excluded.label,
  description = excluded.description,
  default_mode = excluded.default_mode,
  default_timeout_minutes = excluded.default_timeout_minutes,
  default_timeout_expiry = excluded.default_timeout_expiry,
  floor_human_only = excluded.floor_human_only,
  note = excluded.note,
  updated_at = now();

do $seed_check$
declare
  v_strays text;
begin
  select string_agg(change_type_key, ', ') into v_strays
  from platform.change_type_default
  where change_type_key not in ('swap_to_cheaper_model', 'swap_to_stronger_model', 'adjust_model_settings', 'tighten_loop_stop_condition', 'adjust_retry_policy', 'reorder_independent_steps', 'convert_full_to_preview_return', 'adjust_context_eviction', 'edit_agent_instructions', 'edit_roster_description', 'change_gate_threshold', 'edit_rubric', 'change_agent_tools', 'change_output_schema', 'adjust_completion_criteria', 'replace_agent_with_agent', 'replace_workflow_with_workflow', 'replace_agent_with_orchestra', 'replace_orchestra_with_workflow', 'replace_agent_call_with_function', 'replace_function_with_agent', 'create_replacement_agent', 'crystallize_workflow_from_orchestra', 'create_orchestra_from_workflow', 'create_function_or_tool', 'create_rubric_or_gate', 'admit_unit_to_catalog', 'add_workflow_step', 'remove_workflow_step', 'add_orchestra_member', 'remove_orchestra_member', 'collapse_layer', 'expand_layer', 'split_or_merge_units', 'move_layer_boundary', 'promote_provisional_path', 'remove_passing_gate', 'change_own_handling_mode', 'revert_human_approved_change', 'rewrite_unit_purpose', 'internal_affairs_revert_ai_change', 'outreach.attribution_credit');
  if v_strays is not null then
    raise warning '[change-policy seed] rows in platform.change_type_default but NOT in the catalogue: % — the catalogue is the source of truth; reconcile it (rows are never auto-deleted).', v_strays;
  end if;
end
$seed_check$;

