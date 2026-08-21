import { supabase } from "@/utils/supabase/client";
import {
  parseUiGates,
  type UiGates,
} from "@/lib/redux/slices/agent-settings/ui-gates";

interface InputCapabilitiesSnapshotRef {
  agentId: string;
  agentVersionId?: string | null;
}

/**
 * Read the exact authored input capabilities for an execution target.
 * A pinned version never falls through to the current live definition.
 */
export async function fetchInputCapabilitiesSnapshot({
  agentId,
  agentVersionId,
}: InputCapabilitiesSnapshotRef): Promise<UiGates> {
  const query = agentVersionId
    ? supabase
        .schema("agent")
        .from("definition_version")
        .select("ui_gates")
        .eq("id", agentVersionId)
        .single()
    : supabase
        .schema("agent")
        .from("definition")
        .select("ui_gates")
        .eq("id", agentId)
        .single();

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Failed to load input capabilities for ${agentVersionId ?? agentId}: ${error.message}`,
    );
  }
  return parseUiGates(data.ui_gates);
}
