import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";

import type {
  CreateProjectWithTasksItem,
  ResolvedCreatedProject,
  ResolvedProjectTask,
} from "./types";

const POLL_DELAYS_MS = [0, 2000, 5000] as const;

export { POLL_DELAYS_MS };

interface ProjectRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  organization_id: string | null;
  start_date: string | null;
  target_date: string | null;
}

async function fetchOrgSlug(
  organizationId: string | null,
): Promise<string | null> {
  if (!organizationId) return null;
  const { data, error } = await supabase
    .schema("iam").from("organizations")
    .select("slug")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data?.slug) return null;
  return data.slug;
}

async function fetchTasksForProject(
  projectId: string,
): Promise<ResolvedProjectTask[]> {
  const { data, error } = await workspaceDb(supabase)
    .from("tasks")
    .select("id, title, description, status")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return [];

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
  }));
}

function pickBestProject(
  rows: ProjectRow[],
  item: CreateProjectWithTasksItem,
): ProjectRow | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const byName = rows.filter(
    (r) => r.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
  );
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return byName[0];

  return rows[0];
}

async function queryProjectRow(
  item: CreateProjectWithTasksItem,
): Promise<ProjectRow | null> {
  let query = workspaceDb(supabase)
    .from("projects")
    .select(
      "id, name, slug, description, organization_id, start_date, target_date, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(8);

  if (item.slug) {
    query = query.eq("slug", item.slug);
  } else {
    query = query.ilike("name", item.name);
  }

  const { data, error } = await query;
  if (error || !data?.length) return null;

  return pickBestProject(data as ProjectRow[], item);
}

export async function resolveCreatedProject(
  item: CreateProjectWithTasksItem,
): Promise<ResolvedCreatedProject | null> {
  const project = await queryProjectRow(item);
  if (!project) return null;

  const [orgSlug, tasks] = await Promise.all([
    fetchOrgSlug(project.organization_id),
    fetchTasksForProject(project.id),
  ]);

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    organizationId: project.organization_id,
    orgSlug,
    startDate: project.start_date,
    targetDate: project.target_date,
    tasks,
  };
}
