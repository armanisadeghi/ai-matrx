// ============================================================================
// AI TASKS - TypeScript Type Definitions
// ============================================================================
// The ai_runs half of this feature was removed (dead code reading the
// graveyarded ai_runs table — see KNOWN_DEFECTS D21). Only the ai_tasks types
// remain, consumed by useAiTasks / ai-tasks-service for the admin AI-Tasks page.
// ============================================================================

export type TaskStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';

// ----------------------------------------------------------------------------
// AI Task Types
// ----------------------------------------------------------------------------

export interface AiTask {
  id: string;
  run_id: string;
  user_id: string;
  task_id: string; // Socket.io task ID
  service: string;
  task_name: string;
  provider?: string | null;
  endpoint?: string | null;
  model?: string | null;
  model_id?: string | null;
  request_data: Record<string, any>;
  response_text?: string | null;
  response_data?: Record<string, any> | null;
  response_info?: Record<string, any> | null;
  response_errors?: Record<string, any> | null;
  tool_updates?: Record<string, any> | null;
  response_complete: boolean;
  response_metadata: Record<string, any>;
  tokens_input?: number | null;
  tokens_output?: number | null;
  tokens_total?: number | null;
  cost?: number | null;
  time_to_first_token?: number | null;
  total_time?: number | null;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface CreateAiTaskInput {
  run_id: string;
  task_id: string; // Must match socket.io task ID
  service: string;
  task_name: string;
  provider?: string | null;
  endpoint?: string | null;
  model?: string | null;
  model_id?: string | null;
  request_data: Record<string, any>;
}

export interface UpdateAiTaskInput {
  response_text?: string;
  response_data?: Record<string, any>;
  response_info?: Record<string, any>;
  response_errors?: Record<string, any>;
  tool_updates?: Record<string, any>;
  response_complete?: boolean;
  response_metadata?: Record<string, any>;
  tokens_input?: number;
  tokens_output?: number;
  tokens_total?: number;
  cost?: number;
  time_to_first_token?: number;
  total_time?: number;
  status?: TaskStatus;
}

export interface CompleteAiTaskInput {
  response_text: string;
  response_data?: Record<string, any>;
  response_metadata?: Record<string, any>;
  tokens_input?: number;
  tokens_output?: number;
  tokens_total: number;
  cost?: number;
  time_to_first_token?: number;
  total_time: number;
}

// ----------------------------------------------------------------------------
// List/Filter + Hook Return Types
// ----------------------------------------------------------------------------

export interface AiTasksListFilters {
  run_id?: string;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_direction?: 'asc' | 'desc';
}

export interface UseAiTasksReturn {
  tasks: AiTask[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  total: number;

  // Actions
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilters: (filters: Partial<AiTasksListFilters>) => void;
}
