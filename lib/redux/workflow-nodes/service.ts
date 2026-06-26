import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import {
  WorkflowNode,
  WorkflowNodeCreateInput,
  WorkflowNodeRow,
  WorkflowNodeRowInsert,
  WorkflowNodeRowUpdate,
  WorkflowNodeUpdateInput,
} from "./types";

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
      const { data, error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:fetchAll",
      )
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(narrowNode);
    } catch (error) {
      console.error("Error fetching workflow nodes:", error);
      throw error;
    }
  },

  async fetchOne(id: string): Promise<WorkflowNode> {
    try {
      const { data, error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:fetchOne",
      )
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
      const { data, error } = await fromDeprecatedTable(
        "workflow_node_data",
        "lib/redux/workflow-nodes/service.ts:fetchByWorkflowId",
      )
        .select("*")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(narrowNode);
    } catch (error) {
      console.error("Error fetching workflow nodes by workflow ID:", error);
      throw error;
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
