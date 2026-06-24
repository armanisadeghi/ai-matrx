// Dashboard feature types.

/**
 * Per-user engagement counts returned by the `get_user_dashboard_metrics` RPC.
 * Every value is a count of the calling user's own rows in the current tables
 * (not the deprecated entity tables the old get_user_stats counted).
 */
export interface DashboardMetrics {
  agents: number;
  conversations: number;
  knowledge_files: number;
  published_apps: number;
  notes: number;
  tasks: number;
  transcripts: number;
  scopes: number;
  shortcuts: number;
}

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  agents: 0,
  conversations: 0,
  knowledge_files: 0,
  published_apps: 0,
  notes: 0,
  tasks: 0,
  transcripts: 0,
  scopes: 0,
  shortcuts: 0,
};
