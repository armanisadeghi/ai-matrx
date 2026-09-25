// features/bindings/workflow-versions.ts
//
// The published versions of ONE workflow, newest first — what a binding may
// pin to. `workflow.definition_version` is the snapshot table the server's
// resolver reads for `holder_version_id` (bindings.py `_validate_workflow_holder`
// loads `is_version=True, version_id=…`), so the ids offered here are exactly
// the ids the server accepts.

import { createClient } from "@/utils/supabase/client";

export interface WorkflowVersionChoice {
  /** `workflow.definition_version.id` — what `holder_version_id` stores. */
  id: string;
  versionNumber: number;
  changeNote: string | null;
}

export async function listWorkflowVersionChoices(
  workflowId: string,
): Promise<WorkflowVersionChoice[]> {
  const { data, error } = await createClient()
    .schema("workflow")
    .from("definition_version")
    .select("id, version_number, change_note")
    .eq("definition_id", workflowId)
    .is("deleted_at", null)
    .order("version_number", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not list this workflow's versions: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    versionNumber: row.version_number,
    changeNote: row.change_note ?? null,
  }));
}
