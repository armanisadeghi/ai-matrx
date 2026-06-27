import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { DatabaseTool } from "@/utils/supabase/tools-service";

type WithTools = { tools: { tools: DatabaseTool[]; status: string } };

export const fetchAvailableTools = createAsyncThunk<
  DatabaseTool[],
  void,
  { state: WithTools }
>("tools/fetchAvailable", async (_, { getState }) => {
  if (getState().tools.status === "succeeded") {
    return getState().tools.tools;
  }

  const { data, error } = await supabase
    .schema("tool").from("definition")
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw pgErrorToError(error);
  return data ?? [];
});
