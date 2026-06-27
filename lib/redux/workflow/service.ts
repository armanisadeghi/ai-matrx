import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { createClient } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type { Database } from "@/types/database.types";
import {
  Workflow,
  WorkflowCreateInput,
  WorkflowRowInsert,
  WorkflowRowUpdate,
  WorkflowUpdateInput,
} from "./types";

type GraveyardWorkflowRow = Database["graveyard"]["Tables"]["workflow"]["Row"];

/** Read-only access to preserved workflow rows in the graveyard schema. */
const graveyardWorkflow = () => graveyardDb(createClient()).from("workflow");

/**
 * JSON columns come back as `unknown` from the generated DB types. At the
 * service boundary we tag them with the app-level shape — callers can then
 * work with the narrowed union without per-call casts. The narrowing is a
 * pure type assertion; if a non-JSON DB column is renamed or removed, the
 * Workflow shape (derived from the DB row) surfaces the drift at compile time.
 */
const narrowWorkflow = (row: GraveyardWorkflowRow): Workflow =>
  row as unknown as Workflow;

const toInsert = (workflow: WorkflowCreateInput): WorkflowRowInsert =>
  workflow as unknown as WorkflowRowInsert;

const toUpdate = (updates: WorkflowUpdateInput): WorkflowRowUpdate =>
  updates as unknown as WorkflowRowUpdate;

export const workflowService = {
  async fetchAll(): Promise<Workflow[]> {
    try {
      const { data, error } = await graveyardWorkflow()
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn(
          "[workflow/service] graveyard.workflow fetchAll error:",
          error,
        );
        return [];
      }
      return (data ?? []).map(narrowWorkflow);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      return [];
    }
  },

  async fetchOne(id: string): Promise<Workflow> {
    try {
      const { data, error } = await graveyardWorkflow()
        .select("*")
        .eq("id", id)
        .eq("is_deleted", false)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Workflow not found");
      return narrowWorkflow(data);
    } catch (error) {
      console.error("Error fetching workflow:", error);
      throw error;
    }
  },

  async create(workflow: WorkflowCreateInput): Promise<Workflow> {
    try {
      const { data, error } = await fromDeprecatedTable(
        "workflow_data",
        "lib/redux/workflow/service.ts:create",
      )
        .insert([toInsert(workflow)])
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to create workflow");
      return narrowWorkflow(data);
    } catch (error) {
      console.error("Error creating workflow:", error);
      throw error;
    }
  },

  async update(id: string, updates: WorkflowUpdateInput): Promise<Workflow> {
    try {
      const { data, error } = await fromDeprecatedTable(
        "workflow_data",
        "lib/redux/workflow/service.ts:update",
      )
        .update(toUpdate(updates))
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to update workflow");
      return narrowWorkflow(data);
    } catch (error) {
      console.error("Error updating workflow:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<string> {
    try {
      const { error } = await fromDeprecatedTable(
        "workflow_data",
        "lib/redux/workflow/service.ts:delete",
      )
        .update({ is_deleted: true })
        .eq("id", id);

      if (error) throw error;
      return id;
    } catch (error) {
      console.error("Error deleting workflow:", error);
      throw error;
    }
  },
};
