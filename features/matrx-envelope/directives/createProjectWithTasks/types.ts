/** One item in a `create_project_with_tasks` output_directive envelope. */
export interface CreateProjectWithTasksItem {
  name: string;
  slug?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  tasks?: CreateProjectTaskItem[];
}

export interface CreateProjectTaskItem {
  name: string;
  description?: string | null;
  subtasks?: { name: string; description?: string | null }[];
}

export interface ResolvedProjectTask {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
}

export interface ResolvedCreatedProject {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  organizationId: string | null;
  orgSlug: string | null;
  startDate: string | null;
  targetDate: string | null;
  tasks: ResolvedProjectTask[];
}

export type ResolveStatus = "idle" | "polling" | "resolved" | "exhausted";
