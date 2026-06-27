import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import { createClient } from "@/utils/supabase/client";
import {
  WorkflowNode,
  WorkflowNodeCreateInput,
  WorkflowNodeRow,
  WorkflowNodeRowInsert,
  WorkflowNodeRowUpdate,
  WorkflowNodeUpdateInput,
} from "./types";

/** Read-only access to preserved workflow node rows in the graveyard schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const graveyardWorkflowNode = () => (createClient() as any).schema("graveyard").from("workflow_node");

/**
 * JSON columns come back as `unknown` from the generated DB types. At the
 * service boundary we tag them with the app-level shape — callers can then
 * work with the narrowed union without per-call casts. The narrowing is a
 * pure type assertion; if a DB column is renamed or removed, the WorkflowNode
 * shape (derived from the DB row) will surface the drift at compile time.
 */
const narrowNode = (row: WorkflowNodeRow): WorkflowNode =>
  row as unknown as WorkflowNode;

const toInsert = (node: WorkflowNodeCreateInput): WorkflowNodeRowInsert =>
  node as unknown as WorkflowNodeRowInsert;

const toUpdate = (updates: WorkflowNodeUpdateInput): WorkflowNodeRowUpdate =>
  updates as unknown as WorkflowNodeRowUpdate;

export const workflowNodeService = {
  async fetchAll(): Promise<WorkflowNode[]> {
    try {
      const { data, error } = await graveyardWorkflowNode()
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[workflow-nodes/service] graveyard.workflow_node fetchAll error:", error);
        return [];
      }
      return (data ?? []).map(narrowNode);
    } catch (error) {
      console.error("Error fetching workflow nodes:", error);
      return [];
    }
  },

  async fetchOne(id: string): Promise<WorkflowNode> {
    try {
      const { data, error } = await graveyardWorkflowNode()
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      if (!data) throw new Error("Workflow node not found");
      return narrowNode(data);
    } catch (error) {
      console.error("Error fetching workflow node:", error);
      throw error;
    }
  },

  async fetchByWorkflowId(workflowId: string): Promise<WorkflowNode[]> {
    try {
      const { data, error } = await graveyardWorkflowNode()
        .select("*")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("[workflow-nodes/service] graveyard.workflow_node fetchByWorkflowId error:", error);
        return [];
      }
      return (data ?? []).map(narrowNode);
    } catch (error) {
      console.error("Error fetching workflow nodes by workflow ID:", error);
      return [];
    }
  },

  async create(node: WorkflowNodeCreateInput): Promise<WorkflowNode> {
    try {
      const { data, error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:create",
      )
        .insert([toInsert(node)])
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to create workflow node");
      return narrowNode(data);
    } catch (error) {
      console.error("Error creating workflow node:", error);
      throw error;
    }
  },

  async update(
    id: string,
    updates: WorkflowNodeUpdateInput,
  ): Promise<WorkflowNode> {
    try {
      const { data, error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:update",
      )
        .update(toUpdate(updates))
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to update workflow node");
      return narrowNode(data);
    } catch (error) {
      console.error("Error updating workflow node:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<string> {
    try {
      const { error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:delete",
      )
        .delete()
        .eq("id", id);

      if (error) throw error;
      return id;
    } catch (error) {
      console.error("Error deleting workflow node:", error);
      throw error;
    }
  },
};
