import { supabase } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import type {
  DataBroker,
  BrokerValue,
  ResolvedBrokerValue,
  CompleteBrokerData,
  BulkUpsertBrokerResult,
  BrokerContext,
  CreateBrokerInput,
  UpdateBrokerInput,
  CreateBrokerValueInput,
  BulkBrokerValueInput,
} from "../types";

export class BrokerService {
  // ==========================================
  // DATA BROKER CRUD
  // ==========================================

  /**
   * Get all brokers, optionally filtered by user
   */
  static async getBrokers(userId?: string): Promise<DataBroker[]> {
    let query = fromDeprecatedTable(
      "data_broker",
      "features/brokers/services/core-broker-crud.ts:getBrokers",
    )
      .select("*")
      .order("name");

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single broker by ID
   */
  static async getBrokerById(id: string): Promise<DataBroker | null> {
    const { data, error } = await fromDeprecatedTable(
      "data_broker",
      "features/brokers/services/core-broker-crud.ts:getBrokerById",
    )
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a new broker
   */
  static async createBroker(input: CreateBrokerInput): Promise<DataBroker> {
    const { data, error } = await fromDeprecatedTable(
      "data_broker",
      "features/brokers/services/core-broker-crud.ts:createBroker",
    )
      .insert(input)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update an existing broker
   */
  static async updateBroker(
    id: string,
    input: UpdateBrokerInput,
  ): Promise<DataBroker> {
    const { data, error } = await fromDeprecatedTable(
      "data_broker",
      "features/brokers/services/core-broker-crud.ts:updateBroker",
    )
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a broker
   */
  static async deleteBroker(id: string): Promise<void> {
    const { error } = await fromDeprecatedTable(
      "data_broker",
      "features/brokers/services/core-broker-crud.ts:deleteBroker",
    )
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  // ==========================================
  // BROKER VALUES CRUD
  // ==========================================

  /**
   * Get all broker values for a specific scope
   */
  static async getBrokerValues(params: {
    broker_id?: string;
    organization_id?: string;
    project_id?: string;
    task_id?: string;
    ai_runs_id?: string;
    ai_tasks_id?: string;
    user_id?: string;
    is_global?: boolean;
  }): Promise<BrokerValue[]> {
    let query = fromDeprecatedTable(
      "broker_values",
      "features/brokers/services/core-broker-crud.ts:getBrokerValues",
    ).select("*");

    // Apply filters
    if (params.broker_id) query = query.eq("broker_id", params.broker_id);
    if (params.organization_id)
      query = query.eq("organization_id", params.organization_id);
    if (params.project_id) query = query.eq("project_id", params.project_id);
    if (params.task_id) query = query.eq("task_id", params.task_id);
    if (params.ai_runs_id) query = query.eq("ai_runs_id", params.ai_runs_id);
    if (params.ai_tasks_id) query = query.eq("ai_tasks_id", params.ai_tasks_id);
    if (params.user_id) query = query.eq("user_id", params.user_id);
    if (params.is_global !== undefined)
      query = query.eq("is_global", params.is_global);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single broker value by ID
   */
  static async getBrokerValueById(id: string): Promise<BrokerValue | null> {
    const { data, error } = await fromDeprecatedTable(
      "broker_values",
      "features/brokers/services/core-broker-crud.ts:getBrokerValueById",
    )
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Upsert a broker value (create or update)
   */
  static async upsertBrokerValue(
    input: CreateBrokerValueInput,
  ): Promise<string> {
    const { data, error } = await supabase.rpc("upsert_broker_value", {
      p_broker_id: input.broker_id,
      p_value: input.value,
      p_is_global: input.is_global || false,
      p_user_id: input.user_id || null,
      p_organization_id: input.organization_id || null,
      p_project_id: input.project_id || null,
      p_task_id: input.task_id || null,
      p_ai_runs_id: input.ai_runs_id || null,
      p_ai_tasks_id: input.ai_tasks_id || null,
      p_created_by: input.created_by || null,
    });

    if (error) throw error;
    return data; // Returns the UUID of the created/updated broker_value
  }

  /**
   * Bulk upsert multiple broker values at once
   */
  static async bulkUpsertBrokerValues(
    brokerValues: BulkBrokerValueInput[],
    scope: Partial<BrokerContext> & { created_by?: string },
  ): Promise<BulkUpsertBrokerResult[]> {
    const { data, error } = await supabase.rpc("bulk_upsert_broker_values", {
      p_broker_value_pairs: brokerValues,
      p_is_global: false,
      p_user_id: scope.user_id || null,
      p_organization_id: scope.organization_id || null,
      p_project_id: scope.project_id || null,
      p_task_id: scope.task_id || null,
      p_ai_runs_id: scope.ai_runs_id || null,
      p_ai_tasks_id: scope.ai_tasks_id || null,
      p_created_by: scope.created_by || null,
    });

    if (error) throw error;
    return (data ?? []) as unknown as BulkUpsertBrokerResult[];
  }

  /**
   * Delete a broker value
   */
  static async deleteBrokerValue(id: string): Promise<void> {
    const { error } = await fromDeprecatedTable(
      "broker_values",
      "features/brokers/services/core-broker-crud.ts:deleteBrokerValue",
    )
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  // ==========================================
  // BROKER RESOLUTION FUNCTIONS
  // ==========================================

  /**
   * Get resolved broker values for a given context
   * This traverses the hierarchy and returns the most specific value for each broker
   */
  static async getBrokerValuesForContext(
    brokerIds: string[],
    context: BrokerContext,
  ): Promise<ResolvedBrokerValue[]> {
    const { data, error } = await supabase.rpc(
      "get_broker_values_for_context",
      {
        p_broker_ids: brokerIds,
        p_user_id: context.user_id || null,
        p_organization_id: context.organization_id || null,
        p_project_id: context.project_id || null,
        p_task_id: context.task_id || null,
        p_ai_runs_id: context.ai_runs_id || null,
        p_ai_tasks_id: context.ai_tasks_id || null,
      },
    );

    if (error) throw error;
    return (data ?? []) as unknown as ResolvedBrokerValue[];
  }

  /**
   * Get complete broker data including metadata and resolved values
   */
  static async getCompleteBrokerDataForContext(
    brokerIds: string[],
    context: BrokerContext,
  ): Promise<CompleteBrokerData[]> {
    const { data, error } = await supabase.rpc(
      "get_complete_broker_data_for_context",
      {
        p_broker_ids: brokerIds,
        p_user_id: context.user_id || null,
        p_organization_id: context.organization_id || null,
        p_project_id: context.project_id || null,
        p_task_id: context.task_id || null,
        p_ai_runs_id: context.ai_runs_id || null,
        p_ai_tasks_id: context.ai_tasks_id || null,
      },
    );

    if (error) throw error;
    return (data ?? []) as unknown as CompleteBrokerData[];
  }

  /**
   * Get broker IDs that don't have values in the current context
   * (these will need to be prompted to the user)
   */
  static async getMissingBrokerIds(
    brokerIds: string[],
    context: BrokerContext,
  ): Promise<string[]> {
    const { data, error } = await supabase.rpc("get_missing_broker_ids", {
      p_broker_ids: brokerIds,
      p_user_id: context.user_id || null,
      p_organization_id: context.organization_id || null,
      p_project_id: context.project_id || null,
      p_task_id: context.task_id || null,
      p_ai_runs_id: context.ai_runs_id || null,
      p_ai_tasks_id: context.ai_tasks_id || null,
    });

    if (error) throw error;
    return data || [];
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Build a context object from individual IDs
   * Useful for creating context from URL params or state
   */
  static buildContext(params: {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    taskId?: string;
    aiRunsId?: string;
    aiTasksId?: string;
  }): BrokerContext {
    return {
      user_id: params.userId,
      organization_id: params.organizationId,
      project_id: params.projectId,
      task_id: params.taskId,
      ai_runs_id: params.aiRunsId,
      ai_tasks_id: params.aiTasksId,
    };
  }

  /**
   * Convert resolved broker values to a simple key-value object
   * Useful for passing to AI agents or templates
   */
  static brokerValuesToObject(
    brokers: ResolvedBrokerValue[],
  ): Record<string, any> {
    return brokers.reduce(
      (acc, broker) => {
        acc[broker.broker_id] = broker.value;
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  /**
   * Convert complete broker data to a key-value object with names as keys
   */
  static completeBrokerDataToObject(
    brokers: CompleteBrokerData[],
  ): Record<string, any> {
    return brokers.reduce(
      (acc, broker) => {
        acc[broker.broker_name] = broker.value;
        return acc;
      },
      {} as Record<string, any>,
    );
  }
}
