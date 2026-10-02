/**
 * resolveToolUiParent — the parent tool a new `tool.ui` row belongs to.
 *
 * `tool.ui` is a component of `tool.definition`: its RLS read answers only
 * through `tool_id`. A renderer saved by name alone for a tool that exists
 * (tool_id NULL) is invisible to every person outside the admin lane, so chat
 * always falls back to the generic card — 14 of 17 `matrx-default/default`
 * renderers, `memory` among them, measured 2026-10-01. A child also lives in
 * its parent's organization (`_1_refuse_foreign_org`).
 *
 * NULL `tool_id` remains only for a renderer with no backing tool (workflow
 * emit components); those take the system org, as before.
 */

export const SYSTEM_ORG_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

export interface ToolDefinitionLookup {
  byId(id: string): Promise<{ id: string; organization_id: string } | null>;
  byName(name: string): Promise<{ id: string; organization_id: string } | null>;
}

export async function resolveToolUiParent(
  lookup: ToolDefinitionLookup,
  input: { tool_id?: string | null; tool_name: string },
): Promise<{ tool_id: string | null; organization_id: string }> {
  const tool = input.tool_id
    ? await lookup.byId(input.tool_id)
    : await lookup.byName(input.tool_name);
  if (tool) return { tool_id: tool.id, organization_id: tool.organization_id };
  return { tool_id: input.tool_id || null, organization_id: SYSTEM_ORG_ID };
}
