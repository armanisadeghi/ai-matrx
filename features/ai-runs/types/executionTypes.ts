// features/ai-runs/types/executionTypes.ts
//
// One row of `runtime.global_execution` — the platform's single record of a unit
// of work the server ran (an agent turn, a scheduled run, a utility). It
// replaced the retired `public.ai_tasks` table that the admin AI Tasks page
// used to read.
export interface ExecutionRecord {
  id: string;
  type: string | null;
  status: string;
  cost: number;
  error: string | null;
  link_kind: string | null;
  link_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  /** The person the run was made for (`context.user_id`), when recorded. */
  user_id: string | null;
}

export interface ExecutionListFilters {
  status?: string;
  limit?: number;
  offset?: number;
  order_by?: "created_at" | "updated_at";
  order_direction?: "asc" | "desc";
}

export interface UseExecutionsReturn {
  executions: ExecutionRecord[];
  isLoading: boolean;
  error: Error | null;
  total: number;
  refresh: () => Promise<void>;
}
