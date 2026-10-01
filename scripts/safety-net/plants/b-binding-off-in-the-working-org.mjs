// SAFETY-NET-B · A01. The code-path switch that lets a bound variable read a table is off for admin's Workspace (the
// run's working organization) only, through the organization rung of the settings ladder. The cross-organization
// binding preview must stop delivering the Cedar Ridge marker: A01 "binding.cross_org_preview" must go RED.
export default {
  id: "b-binding-off-in-the-working-org",
  check: "agents.api-mcp",
  items: ["A01"],
  description: "custom/code_paths_enabled = false at the organization rung for admin's Workspace (clone, one run)",
  mode: "committed",
  apply: `insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
          values ('custom', 'code_paths_enabled', 'organization', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'false'::jsonb,
                  'safety-net-b plant (clone, one run)');`,
  restore: `delete from platform.knob_override where feature = 'custom' and key = 'code_paths_enabled' and scope_kind = 'organization'
             and scope_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and set_note = 'safety-net-b plant (clone, one run)';`,
  readback: `select not exists (select 1 from platform.knob_override where feature = 'custom' and key = 'code_paths_enabled'
                                and scope_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and set_note = 'safety-net-b plant (clone, one run)');`,
};
