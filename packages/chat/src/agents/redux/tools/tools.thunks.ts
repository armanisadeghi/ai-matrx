import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "../../../host/db";
import { pgErrorToError } from "@ai-matrx/data";
import { recordUnavailable } from "../../../host/diagnostics";
import type { DatabaseTool } from "@host/utils/supabase/tools-service";

type WithTools = {
  tools: { tools: DatabaseTool[]; status: string };
  // Read-only, for the organization-knob eligibility pass below. Both slices are
  // already in the store on every signed-in screen; neither is written here.
  appContext?: { organization_id?: string | null } | null;
  userAuth?: { id?: string | null } | null;
};

type ToolLookupStatus = "idle" | "loading" | "succeeded" | "failed";
type WithToolLookups = WithTools & {
  tools: WithTools["tools"] & {
    identityById: Record<string, DatabaseTool>;
    lookupStatusById: Record<string, ToolLookupStatus>;
  };
};

export const fetchAvailableTools = createAsyncThunk<
  DatabaseTool[],
  void,
  { state: WithTools }
>("tools/fetchAvailable", async (_, { getState }) => {
  if (getState().tools.status === "succeeded") {
    return getState().tools.tools;
  }

  // VIEW LAW: public catalog by design — tool definitions are platform-wide, not user-owned
  const { data, error } = await supabase
    .schema("tool")
    .from("definition")
    .select("*")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw pgErrorToError(error);

  // THE CATALOGUE IS A READ: every tool the person can pick, never narrowed by the ACTIVE
  // organization (active-org-is-never-a-list-filter). Whether a gated tool (`records`) is
  // available depends on the organization the AGENT runs in, so the picker MARKS it per agent
  // (lib/knobs/toolKnobGating.ts `toolsWithheldInOrganization`) — it never hides it here.
  return data ?? [];
});

/**
 * Resolve one historical tool reference, including inactive tools.
 *
 * The active catalogue intentionally excludes deactivated tools because it
 * feeds pickers. Audit/version surfaces have the opposite requirement: an old
 * FK must remain understandable after the tool is retired. Keep that lookup in
 * the existing tools slice so every reference shares one cache and one DB path.
 */
export const fetchToolById = createAsyncThunk<
  DatabaseTool,
  string,
  { state: WithToolLookups }
>(
  "tools/fetchById",
  async (toolId) => {
    const { data, error } = await supabase
      .schema("tool")
      .from("definition")
      .select("*")
      .eq("id", toolId)
      .maybeSingle();

    if (error) throw pgErrorToError(error);
    if (!data) {
      throw recordUnavailable({
        entity: "tool",
        reason: "unknown",
        recordId: toolId,
        token: "tool",
        relation: "tool.definition",
      });
    }
    return data;
  },
  {
    condition: (toolId, { getState }) => {
      const state = getState().tools;
      if (state.tools.some((tool) => tool.id === toolId)) return false;
      if (state.identityById[toolId]) return false;
      const status = state.lookupStatusById[toolId];
      return (
        status !== "loading" && status !== "succeeded" && status !== "failed"
      );
    },
  },
);
