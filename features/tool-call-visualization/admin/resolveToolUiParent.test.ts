/**
 * A renderer saved by tool name is linked to its tool (tool.ui RLS reads only
 * through tool_id — an unlinked renderer is invisible to every user).
 */
import {
  resolveToolUiParent,
  SYSTEM_ORG_ID,
  type ToolDefinitionLookup,
} from "./resolveToolUiParent";

const MEMORY = {
  id: "3c121dff-1df9-47e7-9894-a5693e89a7d5",
  name: "memory",
  organization_id: SYSTEM_ORG_ID,
};

const lookup: ToolDefinitionLookup = {
  byId: async (id) => (id === MEMORY.id ? MEMORY : null),
  byName: async (name) => (name === MEMORY.name ? MEMORY : null),
};

describe("resolveToolUiParent", () => {
  it("links a renderer saved by name to the tool of that name", async () => {
    await expect(
      resolveToolUiParent(lookup, { tool_name: "memory" }),
    ).resolves.toEqual({ tool_id: MEMORY.id, organization_id: SYSTEM_ORG_ID });
  });

  it("keeps an explicit tool_id and takes its organization", async () => {
    await expect(
      resolveToolUiParent(lookup, { tool_id: MEMORY.id, tool_name: "memory" }),
    ).resolves.toEqual({ tool_id: MEMORY.id, organization_id: SYSTEM_ORG_ID });
  });

  it("leaves a renderer with no backing tool unlinked in the system org", async () => {
    await expect(
      resolveToolUiParent(lookup, { tool_name: "weekly_digest_card" }),
    ).resolves.toEqual({ tool_id: null, organization_id: SYSTEM_ORG_ID });
  });
});
