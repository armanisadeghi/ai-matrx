import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import { filterToolsByOrgKnobs } from "@/lib/knobs/toolKnobGating";

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
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw pgErrorToError(error);

  // ELIGIBILITY. Almost every tool is platform-wide and flows straight through. A tool
  // whose usefulness depends on an organization switch (`records`, whose every action
  // answers "the custom data store is switched off" when the store is closed) is shown
  // only where that organization actually has it — see lib/knobs/toolKnobGating.ts. A
  // control that is present and can only refuse is the dead-control shape the platform
  // forbids; absent is the honest form.
  const state = getState();
  return await filterToolsByOrgKnobs(
    data ?? [],
    state.appContext?.organization_id ?? null,
    state.userAuth?.id ?? null,
  );
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
