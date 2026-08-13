import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { DatabaseTool } from "@/utils/supabase/tools-service";

type WithTools = { tools: { tools: DatabaseTool[]; status: string } };

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
    if (!data) throw new Error(`Tool ${toolId} was not found`);
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
