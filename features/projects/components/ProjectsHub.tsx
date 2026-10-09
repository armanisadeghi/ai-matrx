"use client";

/**
 * ProjectsHub — the canonical /projects launcher with a dual view.
 *
 *  - Cards: large cards with a live task preview + open/done counts (default).
 *  - Table: full-width, sortable, searchable rows for fast scanning on desktop.
 *
 * Reads ?org_filter=<slug|id> / ?scope=<id> to filter (org/scope are filtered views, not
 * parents). Self-fetches ctx_projects (RLS-filtered) + one batched task query for
 * all projects' counts/preview (no per-card round-trips).
 */

import React from "react";
import Link from "next/link";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { avatarPaletteIndex } from "@ai-matrx/kit/format";
import { readAllRows } from "@ai-matrx/data/db";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import {
  FolderKanban,
  Plus,
  Building2,
  Settings,
  ArrowRight,
  Circle,
  CircleCheck,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Filter,
  X,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TapTargetButtonSolid } from "@ai-matrx/design-system/tap-target";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import {
  MetricNavigation,
  type MetricNavigationItem,
} from "@/components/navigation/MetricNavigation";
import { WORKSPACES_NAV_GROUP } from "@/features/shell/constants/nav-data";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ErrorNotice, StaleDataNotice } from "@ai-matrx/design-system";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { useOpenCreateProjectWindow } from "@/features/overlays/openers/createProjectWindow";
import {
  useListViewPrefs,
  type LegacyListViewImport,
} from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import type { Tables } from "@/types/database.types";
import type {
  ProjectWithRole,
  ProjectStatus,
  ProjectPriority,
} from "@/features/projects/types";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  toEpochMs,
} from "@/utils/datetime";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { ReadFailure } from "@ai-matrx/design-system";
import {
  buildProjectsContextData,
  buildProjectsListContextData,
  createProjectsExtraSections,
  PROJECTS_CONTEXT_MENU_PROPS,
} from "@/features/projects/agent-context/buildProjectsContextData";
import { isUuidShape } from "@ai-matrx/kit/uuid";

const PROJECT_ROW_DOM_ATTR = "data-project-row-id";

/**
 * Style prefs for this surface (synced across devices via `userPreferences`).
 * Cards-first is this hub's own default — the platform default is table.
 */
const PROJECTS_HUB_VIEW_DEFAULTS: Partial<ListViewPrefs> = { view: "cards" };

/**
 * One-time adoption of the device-local key this hub used before it moved onto
 * the synced hook. Without it, a user whose only record of "I like the table
 * here" was `localStorage` silently reverts to cards on the deploy that was
 * supposed to make the choice FOLLOW them to another device.
 */
const PROJECTS_HUB_LEGACY_VIEW: LegacyListViewImport = {
  key: "projects-view",
  map: (raw) => (raw === "table" || raw === "cards" ? { view: raw } : null),
};

type Stat = {
  open: number;
  done: number;
  preview: { id: string; title: string }[];
};
type OrgMap = Map<string, { name: string; slug: string }>;

type ProjectListRow = Pick<
  Tables<{ schema: "projects" }, "projects">,
  | "id"
  | "name"
  | "slug"
  | "description"
  | "organization_id"
  | "created_by"
  | "updated_at"
  | "status"
  | "priority"
  | "start_date"
  | "target_date"
>;

type TaskSummaryRow = Pick<
  Tables<{ schema: "projects" }, "tasks">,
  "id" | "project_id" | "status" | "parent_task_id" | "title"
>;

function projectStatus(value: string): ProjectStatus {
  if (
    value === "planning" ||
    value === "active" ||
    value === "paused" ||
    value === "completed" ||
    value === "archived"
  ) {
    return value;
  }
  return "active";
}

function workspaceDestinations(): MetricNavigationItem[] {
  const workspaces = WORKSPACES_NAV_GROUP;
  return workspaces.children
    .filter((item) => !item.action && !item.actionItem && !item.panelAction)
    .map((item) => ({
      key: item.href,
      label: item.label,
      href: item.href,
      iconName: item.iconName,
      color: item.color ?? workspaces.color,
      description: item.description,
      external: item.external,
    }));
}

const WORKSPACE_DESTINATIONS = workspaceDestinations();

const ORGANIZATION_ACCENTS = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
] as const;

// Swapped to `@ai-matrx/kit/format`'s `avatarPaletteIndex` (census H1
// 2026-09-07), passing this palette's own length (5) as the bucket count —
// the package's hash differs from this file's old one (`Math.abs` on a
// signed accumulator vs. `>>> 0` unsigned), so this is a one-time, accepted
// reshuffle of which accent color each organization gets. Pre-launch,
// nobody outside the team depends on today's assignment.
function organizationAccent(organizationId: string | null): string {
  if (!organizationId) return "bg-muted-foreground";
  return ORGANIZATION_ACCENTS[avatarPaletteIndex(organizationId, ORGANIZATION_ACCENTS.length)];
}

export function ProjectsHub({
  orgParam,
  scopeParam,
}: {
  orgParam?: string | null;
  scopeParam?: string | null;
}) {
  const { organizations } = useUserOrganizations();
  const router = useRouter();
  const openCreateProject = useOpenCreateProjectWindow();
  const { prefs, setView } = useListViewPrefs(
    "projects-hub",
    PROJECTS_HUB_VIEW_DEFAULTS,
    PROJECTS_HUB_LEGACY_VIEW,
  );
  /**
   * Narrow on read — this hub offers only Cards and Table, while
   * `ListViewPrefs["view"]` also allows `rows`. Reading `prefs.view` raw makes
   * the layout and the toggle disagree for any other value: the layout falls
   * through to cards while NEITHER button renders as selected. Same rule as
   * `/documents`; see lib/list-views/FEATURE.md.
   */
  const view: "cards" | "table" = prefs.view === "table" ? "table" : "cards";
  const [query, setQuery] = React.useState("");

  const orgMap: OrgMap = new Map();
  for (const organization of organizations) {
    orgMap.set(organization.id, {
      name: organization.name,
      slug: organization.slug,
    });
  }

  // Projects (RLS-filtered, nav-tree-independent).
  const [projects, setProjects] = React.useState<ProjectWithRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [projectsReadFailed, setProjectsReadFailed] = React.useState(false);
  const [reloadTick, setReloadTick] = React.useState(0);
  const refresh = () => setReloadTick((tick) => tick + 1);

  // Open the app-wide create-project window (Manual + Use AI). Refresh the
  // self-fetched list both on a manual create and when the AI agent creates one
  // server-side (the agent writes directly to the DB).
  const handleCreate = () => {
    console.log(
      "[Track New Project] 1, ProjectsHub.tsx — New project button → handleCreate",
    );
    openCreateProject({
      onCreated: refresh,
      onAiCreated: refresh,
    });
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProjectsReadFailed(false);
      try {
        const data = await readAllRows<ProjectListRow>(
          ({ from, to }) =>
            projectsDb(supabase)
              .from("projects")
              .select(
                "id, name, slug, description, organization_id, created_by, updated_at, status, priority, start_date, target_date",
                { count: "exact" },
              )
              .is("deleted_at", null)
              .order("updated_at", { ascending: false })
              .order("id", { ascending: true })
              .range(from, to),
          { label: "projects.projects" },
        );
        if (cancelled) return;
        setProjects(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug ?? null,
            description: r.description ?? null,
            organizationId: r.organization_id ?? null,
            createdBy: r.created_by ?? null,
            status: projectStatus(r.status),
            priority: r.priority ?? null,
            startDate: r.start_date ?? null,
            targetDate: r.target_date ?? null,
            settings: {},
            createdAt: "",
            updatedAt: r.updated_at ?? "",
            role: "member",
          })),
        );
      } catch (error) {
        if (cancelled) return;
        console.error("[ProjectsHub] load failed:", error);
        setProjectsReadFailed(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // Batched task stats for every visible project — one query, not N.
  const [stats, setStats] = React.useState<Map<string, Stat>>(new Map());
  const [statsReadFailed, setStatsReadFailed] = React.useState(false);
  const [statsLoading, setStatsLoading] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    const ids = projects.map((p) => p.id);
    // No projects: nothing to read. Stats are keyed by project id, so a stale
    // map is never shown for projects that are gone.
    if (ids.length === 0) return undefined;
    (async () => {
      setStatsReadFailed(false);
      setStatsLoading(true);
      try {
        const data = await readAllRows<TaskSummaryRow>(
          ({ from, to }) =>
            projectsDb(supabase)
              .from("tasks")
              .select("id, project_id, status, parent_task_id, title", {
                count: "exact",
              })
              .is("deleted_at", null)
              .in("project_id", ids)
              .order("id", { ascending: true })
              .range(from, to),
          { label: "projects.tasks project summaries" },
        );
        if (cancelled) return;
        const m = new Map<string, Stat>();
        for (const id of ids) m.set(id, { open: 0, done: 0, preview: [] });
        for (const row of data) {
          if (row.parent_task_id || !row.project_id) continue; // top-level only
          const s = m.get(row.project_id);
          if (!s) continue;
          if (row.status === "completed") s.done += 1;
          else {
            s.open += 1;
            if (s.preview.length < 4)
              s.preview.push({ id: row.id, title: row.title });
          }
        }
        setStats(m);
      } catch (error) {
        if (cancelled) return;
        console.error("[ProjectsHub] task summary load failed:", error);
        setStatsReadFailed(true);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // ?org_filter=slug|id → org id (NEVER ?org= — that key switches the active org)
  const [resolvedOrgFilter, setResolvedOrgFilter] = React.useState<{
    param: string;
    id: string | null;
    /** The ?org_filter= read FAILED: the list below is NOT filtered to it (RC-B12 r13). */
    error?: unknown;
  } | null>(null);
  const [orgFilterAttempt, setOrgFilterAttempt] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    if (!orgParam || isUuidShape(orgParam)) return undefined;
    getOrganizationBySlugOrId(orgParam).then(
      (o) => {
        if (!cancelled) {
          setResolvedOrgFilter({ param: orgParam, id: o?.id ?? null });
        }
      },
      (err: unknown) => {
        console.error("[ProjectsHub] organization filter read failed:", err);
        if (!cancelled) {
          setResolvedOrgFilter({ param: orgParam, id: null, error: err ?? new Error("The organization read failed") });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orgParam, orgFilterAttempt]);
  const orgFilterError =
    orgParam && resolvedOrgFilter?.param === orgParam ? resolvedOrgFilter.error : undefined;
  const orgFilterId = !orgParam
    ? null
    : isUuidShape(orgParam)
      ? orgParam
      : resolvedOrgFilter?.param === orgParam
        ? resolvedOrgFilter.id
        : null;

  // ?scope=id → project ids assigned to that scope
  const [resolvedScopeProjects, setResolvedScopeProjects] = React.useState<
    | {
        scopeId: string;
        state: "loading";
      }
    | {
        scopeId: string;
        state: "ready";
        projectIds: Set<string>;
      }
    | {
        scopeId: string;
        state: "unavailable";
        error: string;
      }
    | null
  >(null);
  const [scopeReloadTick, setScopeReloadTick] = React.useState(0);
  const retryScopeProjects = () => setScopeReloadTick((tick) => tick + 1);
  React.useEffect(() => {
    let cancelled = false;
    if (!scopeParam) {
      return undefined;
    }
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setResolvedScopeProjects({ scopeId: scopeParam, state: "loading" });
      try {
        const res = await scopesService.listEntitiesByScopes({
          scope_ids: [scopeParam],
          entity_type: "project",
        });
        if (isScopesRpcErr(res)) {
          throw new Error(res.error.message);
        }
        if (!cancelled) {
          setResolvedScopeProjects({
            scopeId: scopeParam,
            state: "ready",
            projectIds: new Set(res.data.entities.map((e) => e.entity_id)),
          });
        }
      } catch (error) {
        if (cancelled) return;
        setResolvedScopeProjects({
          scopeId: scopeParam,
          state: "unavailable",
          error:
            error instanceof Error
              ? error.message
              : "Could not load projects for this scope.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeParam, scopeReloadTick]);
  const scopeProjectIds = !scopeParam
    ? null
    : resolvedScopeProjects?.scopeId === scopeParam &&
        resolvedScopeProjects.state === "ready"
      ? resolvedScopeProjects.projectIds
      : null;
  const scopeReadState =
    scopeParam && resolvedScopeProjects?.scopeId === scopeParam
      ? resolvedScopeProjects.state
      : null;
  const scopeLoading =
    Boolean(scopeParam) &&
    (scopeReadState === "loading" || scopeReadState === null);
  const scopeReadFailed = scopeReadState === "unavailable";
  const scopeReadError =
    resolvedScopeProjects !== null &&
    resolvedScopeProjects.scopeId === scopeParam &&
    resolvedScopeProjects.state === "unavailable"
      ? resolvedScopeProjects.error
      : null;

  let filtered = projects;
  if (orgFilterId) {
    filtered = filtered.filter((p) => p.organizationId === orgFilterId);
  }
  if (scopeProjectIds) {
    filtered = filtered.filter((p) => scopeProjectIds.has(p.id));
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    filtered = filtered.filter(
      (project) =>
        project.name.toLowerCase().includes(normalizedQuery) ||
        idMatchesQuery(project, normalizedQuery),
    );
  }

  const isFiltered = Boolean(orgParam || scopeParam);
  // Strips ?org_filter= / ?scope= by navigating to the bare list — the single,
  // discoverable escape hatch out of every filtered view.
  const clearFilter = () => router.push("/projects");
  // The visible organization filter: "All organizations" (no param) or one org,
  // in the URL as ?org_filter= — it never touches the active organization.
  const handleOrgFilterChange = (id: string | null) => {
    const qs = new URLSearchParams();
    if (id) qs.set("org_filter", id);
    if (scopeParam) qs.set("scope", scopeParam);
    const tail = qs.toString();
    router.replace(tail ? `/projects?${tail}` : "/projects");
  };
  const filterOrgName = orgFilterId
    ? (orgMap.get(orgFilterId)?.name ?? "this organization")
    : null;
  const workspaceNavigationItems = WORKSPACE_DESTINATIONS.map((item) => {
    if (item.href === "/projects") {
      return {
        ...item,
        value: filtered.length,
        state:
          projectsReadFailed || scopeReadFailed
            ? "unavailable"
            : loading || scopeLoading
              ? "loading"
              : "ready",
        description: "Projects in this view",
      } satisfies MetricNavigationItem;
    }
    return item;
  });
  // ── Surface context + the ONE menu for the list pane ─────────────────
  const [menuTarget, setMenuTarget] = React.useState<ProjectWithRole | null>(
    null,
  );

  const listProjects = filtered.map((project) => ({
    ...project,
    organizationName: project.organizationId
      ? (orgMap.get(project.organizationId)?.name ?? null)
      : null,
    openTaskCount: statsReadFailed ? undefined : stats.get(project.id)?.open,
    doneTaskCount: statsReadFailed ? undefined : stats.get(project.id)?.done,
  }));

  // org-filter: server-call names the working organization in the agent context only; the list reads orgFilterId
  const activeOrganizationId = useAppSelector(selectOrganizationId);

  const buildListContextData = () =>
    buildProjectsListContextData({
      projects: listProjects,
      projectsReadAvailable: !projectsReadFailed,
      searchQuery: query,
      view,
      organizationFilterId: orgFilterId,
      organizationFilterName: filterOrgName,
      activeOrganizationId,
      activeOrganizationName: activeOrganizationId
        ? (orgMap.get(activeOrganizationId)?.name ?? null)
        : null,
      scopeFilterId: scopeParam,
      selectionText: window.getSelection?.()?.toString() ?? "",
    });

  const getListApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection?.()?.toString() ?? "",
      selectionRange: null,
      contextData: buildListContextData(),
    });

  const resolveMenuTarget = (target: HTMLElement | null) => {
    const projectId =
      target
        ?.closest?.(`[${PROJECT_ROW_DOM_ATTR}]`)
        ?.getAttribute(PROJECT_ROW_DOM_ATTR) ??
      // The canonical table's row identity (hub table rows are projects).
      target?.closest?.("tr[data-row-id]")?.getAttribute("data-row-id") ??
      null;
    const project = projectId
      ? (filtered.find((item) => item.id === projectId) ?? null)
      : null;
    setMenuTarget(project);
    if (!project) return null;

    const stat = stats.get(project.id);
    const organization = project.organizationId
      ? (orgMap.get(project.organizationId) ?? null)
      : null;
    return {
      ...buildProjectsContextData({
        project,
        org: organization
          ? { name: organization.name }
          : null,
        taskCounts:
          stat && !statsReadFailed
            ? { open: stat.open, done: stat.done }
            : undefined,
        projectCount: filtered.length,
        selectionText: window.getSelection?.()?.toString() ?? "",
      }),
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "project" as const,
        id: project.id,
        title: project.name,
        resourceType: "project" as const,
      },
    };
  };

  const menuSections = menuTarget
    ? createProjectsExtraSections({
        onManageSettings: () =>
          router.push(`/projects/${menuTarget.id}/settings`),
        onOpenKnowledgeGraph: () => {
          const organization = menuTarget.organizationId
            ? orgMap.get(menuTarget.organizationId)
            : null;
          router.push(
            organization
              ? `/knowledge/graph?org=${encodeURIComponent(organization.slug)}`
              : "/knowledge/graph",
          );
        },
      })
    : [];

  return (
    <SurfaceRuntimeProvider
      surfaceName={PROJECTS_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getListApplicationScope}
      isEditable={false}
    >
      <RouteHeader
        left={
          <span className="flex items-center gap-1.5 px-1.5 min-w-0">
            <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">
              Projects
            </span>
          </span>
        }
        right={
          <TapTargetButtonSolid
            icon={<Plus className="h-4 w-4" />}
            label="New project"
            ariaLabel="New project"
            onClick={handleCreate}
          />
        }
      />
      <NonEditableContextMenu
        sourceFeature={PROJECTS_CONTEXT_MENU_PROPS.sourceFeature}
        surfaceName={PROJECTS_CONTEXT_MENU_PROPS.surfaceName}
        placementMode={PROJECTS_CONTEXT_MENU_PROPS.placementMode}
        getApplicationScope={getListApplicationScope}
        resolveContextOnOpen={resolveMenuTarget}
        extraSections={menuSections}
        contentSource={{ type: "raw" }}
      >
        <div
          className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]"
          data-surface-value="project_list"
        >
          <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
            <MetricNavigation
              label="Workspace destinations"
              items={workspaceNavigationItems}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="text-xs text-muted-foreground tabular-nums"
                data-surface-value={
                  projectsReadFailed ? undefined : "project_count"
                }
              >
                {projectsReadFailed || scopeReadFailed
                  ? projects.length > 0
                    ? `${filtered.length} shown`
                    : "Projects unavailable"
                  : loading || scopeLoading
                    ? "Loading projects…"
                    : `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}`}
              </span>
              <EntityOrgFilter
                orgId={orgFilterId}
                onChange={handleOrgFilterChange}
                counts={EMPTY_SCOPE_COUNTS}
              />
              <div
                className="relative min-w-0 flex-1 sm:flex-none"
                data-surface-value="project_search_query"
              >
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input adornment="start"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full sm:w-44"
                />
              </div>
              <div
                className="flex items-center rounded-lg border border-border p-0.5"
                data-surface-value="project_list_view"
              >
                <button
                  type="button"
                  onClick={() => setView("cards")}
                  aria-label="Card view"
                  aria-pressed={view === "cards"}
                  className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors lg:h-7 lg:w-7 ${view === "cards" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  title="Card view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView("table")}
                  aria-label="Table view"
                  aria-pressed={view === "table"}
                  className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors lg:h-7 lg:w-7 ${view === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  title="Table view"
                >
                  <TableIcon className="h-4 w-4" />
                </button>
              </div>
              {filtered.length > 0 && (
                <ReferencesBulkCopyButton
                  referenceType="project"
                  records={filtered.map((p) => ({ id: p.id, label: p.name }))}
                  toastLabel={`${filtered.length} project${filtered.length === 1 ? "" : "s"}`}
                  className="h-11 w-11 lg:h-6 lg:w-6"
                />
              )}
            </div>

            {isFiltered && (
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                data-surface-value="project_list_filters"
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" />
                  Filtered by
                </span>
                {orgFilterError != null && (
                  <ReadFailure
                    error={orgFilterError}
                    what="the organization this list is filtered to — it is showing every project"
                    onRetry={() => setOrgFilterAttempt((n) => n + 1)}
                    className="m-0 w-full"
                  />
                )}
                {orgFilterId && (
                  <Badge
                    variant="outline"
                    className="gap-1 pl-2 pr-1 py-0.5 text-xs"
                  >
                    <Building2 className="h-3 w-3" />
                    <span>Organization: {filterOrgName}</span>
                    <button
                      type="button"
                      aria-label="Remove organization filter"
                      className="-my-2 flex h-11 w-11 items-center justify-center rounded hover:bg-accent lg:h-7 lg:w-7"
                      onClick={clearFilter}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {scopeParam && (
                  <Badge
                    variant="outline"
                    className="gap-1 pl-2 pr-1 py-0.5 text-xs"
                  >
                    <span>Scope</span>
                    <button
                      type="button"
                      aria-label="Remove scope filter"
                      className="-my-2 flex h-11 w-11 items-center justify-center rounded hover:bg-accent lg:h-7 lg:w-7"
                      onClick={clearFilter}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="quiet"
                  className="ml-auto"
                  onClick={clearFilter}
                >
                  Show all projects
                </Button>
              </div>
            )}

            {projectsReadFailed && (
              <StaleDataNotice
                hasData={projects.length > 0}
                what="projects"
                onRetry={refresh}
                retrying={loading}
              />
            )}

            {!projectsReadFailed && projects.length > 0 && statsReadFailed && (
              <StaleDataNotice
                hasData={stats.size > 0}
                what="project task summaries"
                onRetry={refresh}
                retrying={loading}
              />
            )}

            {scopeReadFailed && (
              <ErrorNotice
                size="compact"
                title="Couldn't load projects for this scope"
                message={scopeReadError ?? "The read failed."}
                operation="Read the projects for this scope"
                actions={
                  <Button variant="outline" onClick={retryScopeProjects}>
                    Try again
                  </Button>
                }
              />
            )}

            {loading || scopeLoading ? (
              <ProjectsHubSkeleton
                view={view}
                useThreeColumns={isFiltered || query.trim().length > 0}
              />
            ) : projectsReadFailed ||
              scopeReadFailed ? null : projects.length ===
              0 ? null : filtered.length === 0 ? (
              <Card className="p-6 text-center sm:p-12">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FolderKanban className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No projects found</h3>
                {(query || isFiltered) && (
                  <p className="mb-4 text-sm text-muted-foreground">
                    Nothing matches your filters.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isFiltered && (
                    <Button
                      icon={<Filter />}
                      variant="outline"
                      onClick={clearFilter}
                    >
                      Show all projects
                    </Button>
                  )}
                  <Button
                    icon={<Plus />}
                    variant="primary"
                    onClick={handleCreate}
                  >
                    New project
                  </Button>
                </div>
              </Card>
            ) : view === "table" ? (
              <ProjectsTable
                projects={filtered}
                stats={stats}
                orgMap={orgMap}
                statsReadFailed={statsReadFailed}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((p) => (
                  <ProjectHubCard
                    key={p.id}
                    project={p}
                    stat={stats.get(p.id)}
                    orgMap={orgMap}
                    statsReadFailed={statsReadFailed}
                    accent={organizationAccent(p.organizationId)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

function ProjectsHubSkeleton({
  view,
  useThreeColumns,
}: {
  view: "cards" | "table";
  useThreeColumns: boolean;
}) {
  if (view === "table") {
    return (
      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        aria-label="Loading projects"
      >
        <div className="w-full overflow-auto">
          <div className="min-w-[1020px]">
            <div className="grid grid-cols-[minmax(12rem,1fr)_15rem_6rem_6rem_9rem_10rem] gap-3 border-b border-border bg-muted/20 px-4 py-3">
              {[52, 48, 36, 36, 44, 46].map((width, index) => (
                <Skeleton
                  key={index}
                  className="h-3"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4].map((row) => (
                <div
                  key={row}
                  className="grid grid-cols-[minmax(12rem,1fr)_15rem_6rem_6rem_9rem_10rem] items-center gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="ml-auto h-4 w-6" />
                  <Skeleton className="ml-auto h-4 w-6" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="ml-auto h-7 w-24" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 lg:grid-cols-2",
        useThreeColumns && "xl:grid-cols-3",
      )}
      aria-label="Loading projects"
    >
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <Card key={card} className="overflow-hidden">
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex gap-2 border-t border-border px-5 py-3">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProjectsTable({
  projects,
  stats,
  orgMap,
  statsReadFailed,
}: {
  projects: ProjectWithRole[];
  stats: Map<string, Stat>;
  orgMap: OrgMap;
  statsReadFailed: boolean;
}) {
  const router = useRouter();

  const orgEntry = React.useCallback(
    (p: ProjectWithRole) =>
      p.organizationId ? (orgMap.get(p.organizationId) ?? null) : null,
    [orgMap],
  );

  const countCell = React.useCallback(
    (p: ProjectWithRole, which: "open" | "done") => {
      const s = stats.get(p.id);
      if (!s && statsReadFailed) {
        return <span title="Task summary unavailable">—</span>;
      }
      if (!s) {
        return (
          <Skeleton
            className="ml-auto h-4 w-6"
            aria-label={`Loading ${which === "open" ? "open" : "completed"}-task count for ${p.name}`}
          />
        );
      }
      const n = which === "open" ? s.open : s.done;
      return (
        <Link
          // `?done=1` expands the Done group on arrival — that section is
          // collapsed by default.
          href={which === "open" ? `/projects/${p.id}` : `/projects/${p.id}?done=1`}
          onClick={(e) => e.stopPropagation()}
          title={`Open ${p.name} — ${n} ${which === "open" ? "open" : "completed"} task${n === 1 ? "" : "s"}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 hover:bg-accent hover:underline lg:min-h-0 lg:min-w-0"
        >
          {n}
        </Link>
      );
    },
    [stats, statsReadFailed],
  );

  const columns = React.useMemo<MatrxColumnDef<ProjectWithRole>[]>(
    () => [
      {
        id: "name",
        header: "Project",
        accessorKey: "name",
        filter: "text",
        width: 270,
        minWidth: 200,
        cell: (p) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-ink">
              <FolderKanban className="h-4 w-4" />
            </span>
            {/* THE DOOR LAW: the whole-row click is a mouse convenience; the
                NAME is the real anchor (keyboard, screen reader,
                middle-click), plus new tab + peek. */}
            <EntityRef
              token="project"
              id={p.id}
              name={p.name}
              showIcon={false}
              className="inline-flex min-h-11 items-center font-medium text-foreground lg:min-h-0"
            />
          </div>
        ),
      },
      {
        id: "org",
        header: "Organization",
        accessorFn: (p) => orgEntry(p)?.name ?? "—",
        width: 240,
        minWidth: 200,
        cell: (p) =>
          p.organizationId ? (
            <EntityRef
              token="organization"
              id={p.organizationId}
              // NOT a fallback string: `orgMap` only holds orgs the user is a
              // member of; EntityRef degrades to a truncated id, which is
              // true and still opens.
              name={orgEntry(p)?.name ?? null}
              className="inline-flex min-h-11 items-center text-sm text-muted-foreground lg:min-h-0"
            />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />—
            </span>
          ),
      },
      {
        id: "open",
        header: "Open",
        accessorFn: (p) => stats.get(p.id)?.open ?? null,
        filter: "number",
        defaultSortDirection: "desc",
        align: "right",
        width: 92,
        minWidth: 92,
        // A COUNT IS A DOOR: /projects/[id] lists this project's tasks.
        cell: (p) => <span className="tabular-nums">{countCell(p, "open")}</span>,
      },
      {
        id: "done",
        header: "Done",
        accessorFn: (p) => stats.get(p.id)?.done ?? null,
        filter: "number",
        defaultSortDirection: "desc",
        align: "right",
        width: 92,
        minWidth: 92,
        cell: (p) => (
          <span className="tabular-nums text-muted-foreground">
            {countCell(p, "done")}
          </span>
        ),
      },
      {
        id: "updated",
        header: "Updated",
        accessorFn: (p) => p.updatedAt,
        sortValue: (p) => toEpochMs(p.updatedAt),
        filter: "date",
        defaultSortDirection: "desc",
        width: 135,
        minWidth: 130,
        cell: (p) => (
          <span
            className="whitespace-nowrap text-sm text-muted-foreground"
            title={formatAbsoluteDate(p.updatedAt)}
          >
            {formatRelativeTime(p.updatedAt, { style: "long" })}
          </span>
        ),
      },
      {
        id: "project-actions",
        header: "Actions",
        sortable: false,
        filter: false,
        width: 130,
        minWidth: 130,
        // ONE visible action. The table adds its own row Alchemy (copy) and
        // panel buttons; Manage settings lives in the row menu (entity door).
        customActions: (p) => (
          <div className="flex items-center justify-end gap-1.5">
            {/* An anchor, so Open can be cmd- or middle-clicked. */}
            <Button asChild variant="quiet">
              <Link href={`/projects/${p.id}`}>Open</Link>
            </Button>
          </div>
        ),
      },
    ],
    [countCell, orgEntry, stats],
  );

  return (
    <MatrxDataTable<ProjectWithRole>
      tableId="projects-hub"
      data={projects}
      columns={columns}
      getRowId={(p) => p.id}
      defaultSort={{ id: "updated", direction: "desc" }}
      zebra
      pageSize={0}
      fitToWidth="grow"
      rowVersion={(p) => [stats.get(p.id), statsReadFailed, orgMap]}
      detail={{ enabled: false }}
      onRowOpen={(p) => router.push(`/projects/${p.id}`)}
      window={{}}
      // The page's own search (shared with the card view and the URL-less
      // list query) is the single search box.
      toolbar={{ search: false }}
      getRowHref={(p) => `/projects/${p.id}`}
      emptyState={{ title: "No projects match these column filters." }}
      copy={{
        label: "Project",
        listLabel: "Projects",
        location: "AI Matrx — Projects (/projects)",
        rowKind: "project",
        listKind: "projects-list",
        humanRow: (p) => {
          const s = stats.get(p.id);
          return `${p.name} — ${orgEntry(p)?.name ?? "no organization"}${s ? `, ${s.open} open, ${s.done} done` : ""}`;
        },
        agentRow: (p) => ({
          id: p.id,
          name: p.name,
          organization: orgEntry(p)?.name ?? null,
          open_tasks: stats.get(p.id)?.open ?? null,
          done_tasks: stats.get(p.id)?.done ?? null,
          updated_at: p.updatedAt,
        }),
      }}
    />
  );
}

function ProjectHubCard({
  project,
  stat,
  orgMap,
  statsReadFailed,
  accent,
}: {
  project: ProjectWithRole;
  stat?: Stat;
  orgMap: OrgMap;
  statsReadFailed: boolean;
  accent: string;
}) {
  const router = useRouter();
  const preview = stat?.preview ?? [];
  const open = stat?.open ?? 0;
  const done = stat?.done ?? 0;
  const org = project.organizationId
    ? orgMap.get(project.organizationId)
    : null;
  const href = `/projects/${project.id}`;

  return (
    <Card
      data-project-row-id={project.id}
      className="group/entity-ref relative overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <span className={cn("absolute inset-x-0 top-0 h-1 opacity-80", accent)} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push(href)}
            aria-label={`Open ${project.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-ink"
          >
            <FolderKanban className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            {/* THE DOOR LAW: the title is a real anchor (was a router.push
                button — no middle-click, no keyboard link, no copy-address). */}
            <h3 className="font-semibold text-base">
              <Link
                href={href}
                className="flex min-h-11 max-w-full items-center truncate transition-colors hover:text-primary lg:min-h-0"
              >
                {project.name}
              </Link>
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-xs text-muted-foreground">
              {project.organizationId ? (
                <EntityRef
                  token="organization"
                  id={project.organizationId}
                  // Same as the table cell: never invent the name. EntityRef
                  // falls back to a truncated id, which is honest.
                  name={org?.name ?? null}
                  className="inline-flex min-h-11 items-center lg:min-h-0"
                />
              ) : (
                <>
                  <Building2 className="h-3 w-3 shrink-0" />—
                </>
              )}
            </div>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}

        <div className="rounded-lg border border-border bg-muted/20 p-2.5 flex-1">
          {!stat && statsReadFailed ? (
            <p className="px-1 py-1 text-[11px] text-muted-foreground">
              Task summary unavailable.
            </p>
          ) : !stat ? (
            <div
              className="space-y-2 px-1 py-1.5"
              aria-label={`Loading tasks for ${project.name}`}
            >
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ) : preview.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-1 px-1">
              {done > 0 ? "All tasks done." : "No tasks yet."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {preview.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-0.5"
                >
                  <Circle className="h-3 w-3 shrink-0 opacity-50" />
                  {/* Named tasks with ids in hand — each one opens. */}
                  <EntityRef
                    token="task"
                    id={t.id}
                    name={t.title}
                    showIcon={false}
                    className="inline-flex min-h-11 items-center lg:min-h-0"
                  />
                </li>
              ))}
              {open > preview.length && (
                <li className="text-[11px] text-muted-foreground/70 px-1 pt-0.5">
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center hover:text-foreground hover:underline lg:min-h-0"
                  >
                    +{open - preview.length} more
                  </Link>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* A COUNT IS A DOOR: /projects/[id] lists this project's tasks
            grouped Open / Done (ProjectTaskList). */}
        {stat || !statsReadFailed ? (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link
              href={href}
              title={`Open ${project.name} — ${open} open task${open === 1 ? "" : "s"}`}
              className="flex min-h-11 items-center gap-1 rounded px-1 -mx-1 hover:bg-accent hover:text-foreground transition-colors lg:min-h-0"
            >
              <Circle className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground tabular-nums">
                {open}
              </span>{" "}
              open
            </Link>
            <Link
              // `?done=1` — the Done group is collapsed by default, so a bare
              // link would hide the very tasks this count names.
              href={`${href}?done=1`}
              title={`Open ${project.name} — ${done} completed task${done === 1 ? "" : "s"}`}
              className="flex min-h-11 items-center gap-1 rounded px-1 -mx-1 hover:bg-accent hover:text-foreground transition-colors lg:min-h-0"
            >
              <CircleCheck className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground tabular-nums">
                {done}
              </span>{" "}
              done
            </Link>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Counts unavailable</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-card">
        <ProjectCopyForAiButton
          projectId={project.id}
          projectName={project.name}
          location="Projects — hub cards"
          size="icon"
          className="h-11 w-11 shrink-0 lg:h-8 lg:w-8"
        />
        <Button variant="primary" asChild className="flex-1">
          <Link href={href}>
            Open
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${project.id}/settings`}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Manage
          </Link>
        </Button>
      </div>
    </Card>
  );
}
