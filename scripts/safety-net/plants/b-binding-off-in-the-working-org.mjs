// SAFETY-NET-B · A01. The code-path switch that lets a bound variable read a table is turned off on admin@admin.com's
// OWN rung of the settings ladder (the user rung, which outranks the organization's; the row already exists and says
// true). The cross-organization binding preview must stop delivering the Cedar Ridge marker: A01 must go RED.
// Committed on the clone for one probe run; restored to true and read back.
const WHERE = `feature = 'custom' and key = 'code_paths_enabled' and scope_kind = 'user'
               and scope_id = '87a6e699-3622-4869-8843-d0867456c0dd' and organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f'`;
export default {
  id: "b-binding-off-in-the-working-org",
  check: "agents.api-mcp",
  items: ["A01"],
  description: "custom/code_paths_enabled = false on admin@admin.com's user rung in admin's Workspace (clone, one run)",
  mode: "committed",
  apply: `update platform.knob_override set value = 'false'::jsonb where ${WHERE} and value = 'true'::jsonb;`,
  restore: `update platform.knob_override set value = 'true'::jsonb where ${WHERE};`,
  readback: `select value = 'true'::jsonb from platform.knob_override where ${WHERE};`,
};
