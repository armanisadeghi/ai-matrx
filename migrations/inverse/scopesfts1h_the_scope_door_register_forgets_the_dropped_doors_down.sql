-- chair-step: INVERSE of migrations/campaign/scopesfts1h_the_scope_door_register_forgets_the_dropped_doors.sql (lane FINISH-THE-SWITCH, FTS-1h): the 19 register rows back.
-- lane: FINISH-THE-SWITCH (FTS-1h)
-- lock: context

insert into context.scope_door_registry (function_name, door_class, reason, reviewed_at) values
  ('context.provision_scope_dataset', 'unreachable', 'Reached only from a trigger that never fires: all 204 context_items.reference_source are NULL live.', '2026-09-11'),
  ('public._edu_class', 'education', 'Resolves a class row for the education gates; every caller of it is itself gated.', '2026-09-11'),
  ('public.accept_context_item_suggestion', 'org_lane', 'Acts on a field definition of a scope type the caller administers.', '2026-09-11'),
  ('public.accept_scope_suggestion', 'membraned', 'Creates a scope and seeds its cells; the assert cannot refuse the creator today and is there so the class stays closed.', '2026-09-11'),
  ('public.apply_template', 'org_lane', 'Creates record types and field definitions in an organization the caller administers.', '2026-09-11'),
  ('public.apply_template_definition', 'org_lane', 'Same as apply_template, from an inline definition.', '2026-09-11'),
  ('public.create_context_item', 'org_lane', 'Creates a field definition on a scope type; organization-admin gated.', '2026-09-11'),
  ('public.create_scope', 'org_lane', 'Creates a record the caller will own.', '2026-09-11'),
  ('public.delete_context_item', 'org_lane', 'Removes a field definition; organization-admin gated.', '2026-09-11'),
  ('public.delete_scope', 'org_lane', 'Removes a record; see the register note — this one wants a record-level assert, not an org one.', '2026-09-11'),
  ('public.delete_scope_type', 'org_lane', 'Removes a record type; organization-admin gated.', '2026-09-11'),
  ('public.get_entity_scopes', 'org_lane', 'Lists the scope tags on one entity the caller can already read.', '2026-09-11'),
  ('public.get_org_structure', 'org_lane', 'Organization shape for an organization the caller belongs to.', '2026-09-11'),
  ('public.get_user_scopes', 'org_lane', 'Lists the caller''s own scopes.', '2026-09-11'),
  ('public.get_value_history', 'membraned', 'Returns one cell''s full revision history, which is the same customer data as the cell.', '2026-09-11'),
  ('public.set_context_value', 'membraned', 'The agent/server write door for a cell; asserts editor for the acting user and renders the refusal in its envelope.', '2026-09-11'),
  ('public.set_scope_context_value', 'membraned', 'The client write door for a cell; asserts editor on the record.', '2026-09-11'),
  ('public.update_context_item', 'org_lane', 'Edits a field definition; organization-admin gated.', '2026-09-11'),
  ('public.update_scope', 'org_lane', 'Edits a record; see the register note — this one wants a record-level assert, not an org one.', '2026-09-11')
on conflict (function_name) do nothing;
