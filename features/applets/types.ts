// ============================================================================
// APPLETS — the record the /applets editor edits (`app.definition`)
// ============================================================================
// An Applet is code files + pages + jobs (mandates by key) + data sources
// (CONTRACTS §8, common-docs/projects/applets/CONTRACTS.md). It names JOBS,
// never agents: there is no agent binding on the record.
// ============================================================================

import type { Database, Json } from "@/types/database.types";

export type AppStatus = "draft" | "published" | "archived" | "suspended";

/** The row's "Shown to" (lists only). "Published to the web" is the boolean
 *  `published_to_web`. */
export type AppShownTo = Database["platform"]["Enums"]["shown_to"];

/** The generated row, for the few readers that take it whole. */
export type AppletTableRow = Database["app"]["Tables"]["definition"]["Row"];

export interface AppletDefinition {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  tags: string[];

  preview_image_url: string | null;
  favicon_url: string | null;

  status: AppStatus;
  published_to_web: boolean;
  shown_to: AppShownTo | null;
  is_featured: boolean | null;
  is_verified: boolean | null;

  rate_limit_per_ip: number | null;
  rate_limit_window_hours: number | null;
  rate_limit_authenticated: number | null;

  version: number;

  total_executions: number | null;
  total_tokens_used: number | null;
  total_cost: number | null;
  unique_users_count: number | null;
  success_rate: number | null;
  avg_execution_time_ms: number | null;
  last_execution_at: string | null;

  metadata: Json | null;

  created_by: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;

  created_at: string;
  updated_at: string;
  published_at: string | null;

  /** The Applet record (CONTRACTS §8). */
  files: Json;
  entry: string | null;
  pages: Json;
  mandates: Json;
  sources: Json;
  parent_applet_id: string | null;
}

export type AppletRow = AppletDefinition;

// ── The record's parts, read defensively from the stored jsonb ───────────────

export interface AppletJob {
  alias: string;
  key: string;
}

export interface AppletPage {
  path: string;
  title: string;
  file: string;
  parent?: string;
}

export type AppletSource =
  | { alias: string; table_id: string; organization_id: string }
  | { alias: string; entity: string };

function objects(value: Json | undefined): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? [entry as Record<string, unknown>]
      : [],
  );
}

/** The jobs an Applet names (`mandates` column). */
export function appletJobs(app: Pick<AppletDefinition, "mandates">): AppletJob[] {
  return objects(app.mandates).flatMap(({ alias, key }) =>
    typeof alias === "string" && typeof key === "string" && key ? [{ alias, key }] : [],
  );
}

/** The pages an Applet routes (`pages` column). */
export function appletPages(app: Pick<AppletDefinition, "pages">): AppletPage[] {
  return objects(app.pages).flatMap(({ path, title, file, parent }) =>
    typeof path === "string" && typeof file === "string"
      ? [
          {
            path,
            title: typeof title === "string" ? title : path,
            file,
            ...(typeof parent === "string" && parent ? { parent } : {}),
          },
        ]
      : [],
  );
}

/** The data sources an Applet reads (`sources` column). */
export function appletSources(app: Pick<AppletDefinition, "sources">): AppletSource[] {
  return objects(app.sources).flatMap((s): AppletSource[] => {
    if (typeof s.alias !== "string") return [];
    if (typeof s.entity === "string") return [{ alias: s.alias, entity: s.entity }];
    if (typeof s.table_id === "string" && typeof s.organization_id === "string") {
      return [{ alias: s.alias, table_id: s.table_id, organization_id: s.organization_id }];
    }
    return [];
  });
}

/** The code files an Applet carries (`files` column, name → source). */
export function appletFiles(app: Pick<AppletDefinition, "files">): Record<string, string> {
  const out: Record<string, string> = {};
  const files = app.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) return out;
  for (const [name, source] of Object.entries(files)) {
    if (typeof source === "string") out[name] = source;
  }
  return out;
}

// ── Admin edit ───────────────────────────────────────────────────────────────

export interface UpdateAppletInput {
  slug?: string;
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  preview_image_url?: string;
  status?: AppStatus;
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
}

/**
 * The column subset a card/grid needs — enough for a listing, not the full
 * record (no files).
 */
export type AppletSummary = Pick<
  AppletDefinition,
  | "id"
  | "slug"
  | "name"
  | "tagline"
  | "description"
  | "category"
  | "tags"
  | "preview_image_url"
  | "favicon_url"
  | "status"
  | "published_to_web"
  | "is_featured"
  | "total_executions"
  | "last_execution_at"
  | "created_at"
  | "updated_at"
>;
