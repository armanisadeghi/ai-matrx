"use client";

/**
 * ProjectsHub — the canonical /projects launcher with a dual view.
 *
 *  - Cards: large cards with a live task preview + open/done counts (default).
 *  - Table: full-width, sortable, searchable rows for fast scanning on desktop.
 *
 * Reads ?org=<slug|id> / ?scope=<id> to filter (org/scope are filtered views, not
 * parents). Self-fetches ctx_projects (RLS-filtered) + one batched task query for
 * all projects' counts/preview (no per-card round-trips).
 */

import React from "react";
import Link from "next/link";
import { idMatchesQuery } from "@/utils/search-scoring";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";
import { useRouter } from "next/navigation";
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
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  X,
  ListFilter,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
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
import type {
  ProjectWithRole,
  ProjectStatus,
  ProjectPriority,
} from "@/features/projects/types";
import {
  compareTimestamps,
  formatAbsoluteDate,
  formatRelativeTime,
  toEpochMs,
} from "@/utils/datetime";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  buildProjectsContextData,
  buildProjectsListContextData,
  createProjectsExtraSections,
  PROJECTS_CONTEXT_MENU_PROPS,
} from "@/features/projects/agent-context/buildProjectsContextData";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
type SortKey = "name" | "org" | "open" | "done" | "updated";
type OrgMap = Map<string, { name: string; slug: string; isPersonal: boolean }>;

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
      isPersonal: organization.isPersonal,
    });
  }

  // A project is "personal" iff its owning org is the user's personal org.
  // ctx_projects.is_personal no longer exists; personal-ness is org-derived.
  const isPersonalProject = (organizationId: string | null) =>
    !!organizationId && orgMap.get(organizationId)?.isPersonal === true;

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
      const { data, error } = await workspaceDb(supabase)
        .from("projects")
        .select(
          "id, name, slug, description, organization_id, created_by, updated_at, status, priority, start_date, target_date",
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[ProjectsHub] load failed:", error);
        setProjectsReadFailed(true);
      } else {
        type Row = {
          id: string;
          name: string;
          slug: string | null;
          description: string | null;
          organization_id: string | null;
          created_by: string | null;
          updated_at: string | null;
          status: ProjectStatus | null;
          priority: ProjectPriority | null;
          start_date: string | null;
          target_date: string | null;
        };
        setProjects(
          ((data as Row[]) ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug ?? null,
            description: r.description ?? null,
            organizationId: r.organization_id ?? null,
            createdBy: r.created_by ?? null,
            // Personal-ness is org-derived (see isPersonalProject); the project
            // row no longer carries is_personal. Resolved against orgMap at render.
            isPersonal: false,
            status: (r.status ?? "active") as ProjectStatus,
            priority: r.priority ?? null,
            startDate: r.start_date ?? null,
            targetDate: r.target_date ?? null,
            settings: {},
            createdAt: "",
            updatedAt: r.updated_at ?? "",
            role: "member" as const,
          })),
        );
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
  React.useEffect(() => {
    let cancelled = false;
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) {
      return undefined;
    }
    (async () => {
      setStatsReadFailed(false);
      const { data, error } = await workspaceDb(supabase)
        .from("tasks")
        .select("id, project_id, status, parent_task_id, title")
        .is("deleted_at", null)
        .in("project_id", ids);
      if (cancelled) return;
      if (error) {
        console.error("[ProjectsHub] task summary load failed:", error);
        setStatsReadFailed(true);
        return;
      }
      const m = new Map<string, Stat>();
      for (const id of ids) m.set(id, { open: 0, done: 0, preview: [] });
      for (const row of (data ?? []) as Array<{
        id: string;
        project_id: string;
        status: string;
        parent_task_id: string | null;
        title: string;
      }>) {
        if (row.parent_task_id) continue; // top-level only
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
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // ?org=slug|id → org id
  const [resolvedOrgFilter, setResolvedOrgFilter] = React.useState<{
    param: string;
    id: string | null;
  } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!orgParam || UUID_RE.test(orgParam)) return undefined;
    getOrganizationBySlugOrId(orgParam).then((o) => {
      if (!cancelled) {
        setResolvedOrgFilter({ param: orgParam, id: o?.id ?? null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orgParam]);
  const orgFilterId = !orgParam
    ? null
    : UUID_RE.test(orgParam)
      ? orgParam
      : resolvedOrgFilter?.param === orgParam
        ? resolvedOrgFilter.id
        : null;

  // ?scope=id → project ids assigned to that scope
  const [resolvedScopeProjects, setResolvedScopeProjects] = React.useState<{
    scopeId: string;
    projectIds: Set<string>;
  } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!scopeParam) return undefined;
    (async () => {
      const res = await scopesService.listEntitiesByScopes({
        scope_ids: [scopeParam],
        entity_type: "project",
      });
      if (!cancelled) {
        setResolvedScopeProjects({
          scopeId: scopeParam,
          projectIds: new Set(
            isScopesRpcErr(res)
              ? []
              : res.data.entities.map((e) => e.entity_id),
          ),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeParam]);
  const scopeProjectIds = !scopeParam
    ? null
    : resolvedScopeProjects?.scopeId === scopeParam
      ? resolvedScopeProjects.projectIds
      : new Set<string>();

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
  // Strips ?org= / ?scope= by navigating to the bare list — the single,
  // discoverable escape hatch out of every filtered view.
  const clearFilter = () => router.push("/projects");
  const filterOrgName = orgFilterId
    ? (orgMap.get(orgFilterId)?.name ?? "this organization")
    : null;
  // "Personal" is org-driven: a project is personal iff its owning org is the
  // user's personal org (organizations.is_personal). Every project now has an
  // org, so org-less is no longer the signal.
  const personal = filtered.filter((p) => isPersonalProject(p.organizationId));
  const teams = filtered.filter((p) => !isPersonalProject(p.organizationId));
  const subtitle = orgFilterId
    ? `Projects in ${orgMap.get(orgFilterId)?.name ?? "this organization"}`
    : scopeParam
      ? "Projects tagged to this scope"
      : null;

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

  const buildListContextData = () =>
    buildProjectsListContextData({
      projects: listProjects,
      searchQuery: query,
      view,
      organizationFilterId: orgFilterId,
      organizationFilterName: filterOrgName,
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
        ?.getAttribute(PROJECT_ROW_DOM_ATTR) ?? null;
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
          ? { name: organization.name, isPersonal: organization.isPersonal }
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
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                {subtitle && (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  data-surface-value="project_count"
                >
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "project" : "projects"}
                </span>
                <div
                  className="relative min-w-0 flex-1 sm:flex-none"
                  data-surface-value="project_search_query"
                >
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects…"
                    className="h-11 w-full pl-8 text-base sm:w-44 lg:h-9 lg:text-sm"
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
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-11 px-3 text-xs lg:h-7"
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

            {loading ? (
              <ProjectsHubSkeleton
                view={view}
                useThreeColumns={isFiltered || query.trim().length > 0}
              />
            ) : projectsReadFailed &&
              projects.length === 0 ? null : filtered.length === 0 ? (
              <Card className="p-6 text-center sm:p-12">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <FolderKanban className="h-7 w-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No projects found</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                  {query || isFiltered
                    ? "Nothing matches your filters."
                    : "Create a project to organize tasks, resources, and context."}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isFiltered && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-11 lg:h-8"
                      onClick={clearFilter}
                    >
                      <Filter className="h-4 w-4 mr-1.5" />
                      Show all projects
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-11 lg:h-8"
                    onClick={handleCreate}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
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
            ) : isFiltered || query ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((p) => (
                  <ProjectHubCard
                    key={p.id}
                    project={p}
                    stat={stats.get(p.id)}
                    orgMap={orgMap}
                    statsReadFailed={statsReadFailed}
                  />
                ))}
              </div>
            ) : (
              <>
                {personal.length > 0 && (
                  <Section title="Personal">
                    {personal.map((p) => (
                      <ProjectHubCard
                        key={p.id}
                        project={p}
                        stat={stats.get(p.id)}
                        orgMap={orgMap}
                        statsReadFailed={statsReadFailed}
                      />
                    ))}
                  </Section>
                )}
                {teams.length > 0 && (
                  <Section title="Team projects">
                    {teams.map((p) => (
                      <ProjectHubCard
                        key={p.id}
                        project={p}
                        stat={stats.get(p.id)}
                        orgMap={orgMap}
                        statsReadFailed={statsReadFailed}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
    </section>
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

type UpdatedFilter =
  "any" | "hour" | "today" | "week" | "month" | "quarter" | "year";

type ProjectColumnFilters = {
  name: string;
  organizationId: string;
  openMin?: number;
  openMax?: number;
  doneMin?: number;
  doneMax?: number;
  updated: UpdatedFilter;
};

const EMPTY_COLUMN_FILTERS: ProjectColumnFilters = {
  name: "",
  organizationId: "",
  updated: "any",
};

const UPDATED_FILTER_OPTIONS: ReadonlyArray<{
  value: UpdatedFilter;
  label: string;
}> = [
  { value: "any", label: "Any time" },
  { value: "hour", label: "Last hour" },
  { value: "today", label: "Last 24 hours" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "quarter", label: "Last 90 days" },
  { value: "year", label: "Last year" },
];

function hasActiveColumnFilters(filters: ProjectColumnFilters): boolean {
  return (
    filters.name.trim().length > 0 ||
    filters.organizationId.length > 0 ||
    filters.openMin !== undefined ||
    filters.openMax !== undefined ||
    filters.doneMin !== undefined ||
    filters.doneMax !== undefined ||
    filters.updated !== "any"
  );
}

function passesNumberRange(
  value: number,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function passesUpdatedFilter(
  updatedAt: string,
  filter: UpdatedFilter,
): boolean {
  if (filter === "any") return true;
  const updated = toEpochMs(updatedAt);
  if (Number.isNaN(updated)) return false;
  const age = Date.now() - updated;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  switch (filter) {
    case "hour":
      return age <= hour;
    case "today":
      return age <= day;
    case "week":
      return age <= 7 * day;
    case "month":
      return age <= 30 * day;
    case "quarter":
      return age <= 90 * day;
    case "year":
      return age <= 365 * day;
    default:
      return true;
  }
}

function ColumnFilterButton({
  active,
  label,
  children,
  align = "start",
}: {
  active: boolean;
  label: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Filter ${label}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded transition-colors lg:h-5 lg:w-5",
            active
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          <ListFilter className={cn("h-3 w-3", active && "fill-primary/20")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        className="w-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function TextColumnFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[200px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Filter: {label}
        </p>
        {value.trim().length > 0 && (
          <button
            type="button"
            className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground lg:min-h-0 lg:px-0"
            onClick={() => onChange("")}
          >
            clear
          </button>
        )}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 text-base lg:h-8 lg:text-sm"
      />
    </div>
  );
}

function NumberRangeColumnFilter({
  label,
  min,
  max,
  onChange,
}: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  onChange: (patch: { min?: number; max?: number }) => void;
}) {
  const [minText, setMinText] = React.useState(
    min !== undefined ? String(min) : "",
  );
  const [maxText, setMaxText] = React.useState(
    max !== undefined ? String(max) : "",
  );

  const commit = (raw: string, kind: "min" | "max") => {
    if (raw.trim() === "") {
      onChange({ [kind]: undefined });
      return;
    }
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isNaN(n)) onChange({ [kind]: n });
  };

  const hasFilter = min !== undefined || max !== undefined;

  return (
    <div className="flex flex-col gap-2 w-[190px]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Filter: {label}
        </p>
        {hasFilter && (
          <button
            type="button"
            className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground lg:min-h-0 lg:px-0"
            onClick={() => {
              setMinText("");
              setMaxText("");
              onChange({ min: undefined, max: undefined });
            }}
          >
            clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={minText}
          onChange={(e) => setMinText(e.target.value)}
          onBlur={(e) => commit(e.target.value, "min")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="min"
          className="h-11 w-[80px] text-base tabular-nums lg:h-7 lg:text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          value={maxText}
          onChange={(e) => setMaxText(e.target.value)}
          onBlur={(e) => commit(e.target.value, "max")}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="max"
          className="h-11 w-[80px] text-base tabular-nums lg:h-7 lg:text-xs"
        />
      </div>
    </div>
  );
}

function UpdatedColumnFilter({
  value,
  onChange,
}: {
  value: UpdatedFilter;
  onChange: (next: UpdatedFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[180px]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Filter: Updated
      </p>
      <div className="flex flex-col gap-0.5">
        {UPDATED_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-11 rounded px-2 py-1 text-left text-xs hover:bg-accent lg:min-h-0",
              value === opt.value && "bg-accent font-medium",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectsColumnHead({
  k,
  children,
  className,
  align = "left",
  filter,
  sortKey,
  sortDir,
  onSort,
}: {
  k: SortKey;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  filter: React.ReactNode;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead className={className}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end w-full",
        )}
      >
        <button
          type="button"
          onClick={() => onSort(k)}
          className={cn(
            "inline-flex min-h-11 items-center gap-1 px-2 -mx-2 hover:text-foreground transition-colors lg:min-h-0 lg:px-0 lg:mx-0",
            align === "right" && "justify-end",
          )}
        >
          {children}
          {sortKey === k ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
          )}
        </button>
        {filter}
      </div>
    </TableHead>
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
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] =
    React.useState<ProjectColumnFilters>(EMPTY_COLUMN_FILTERS);

  const orgEntry = (p: ProjectWithRole) =>
    p.organizationId ? (orgMap.get(p.organizationId) ?? null) : null;
  const orgLabel = (p: ProjectWithRole) => orgEntry(p)?.name ?? "—";

  const seenOrganizations = new Map<string, string>();
  for (const project of projects) {
    if (!project.organizationId) continue;
    const name = orgMap.get(project.organizationId)?.name ?? "—";
    seenOrganizations.set(project.organizationId, name);
  }
  const orgOptions = [...seenOrganizations.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const patchFilters = (patch: Partial<ProjectColumnFilters>) => {
    setColumnFilters((prev) => ({ ...prev, ...patch }));
  };

  const nameQuery = columnFilters.name.trim().toLowerCase();
  const filteredRows = projects.filter((project) => {
    if (nameQuery && !project.name.toLowerCase().includes(nameQuery)) {
      return false;
    }
    if (
      columnFilters.organizationId &&
      project.organizationId !== columnFilters.organizationId
    ) {
      return false;
    }
    const open = stats.get(project.id)?.open ?? 0;
    const done = stats.get(project.id)?.done ?? 0;
    if (
      !passesNumberRange(open, columnFilters.openMin, columnFilters.openMax)
    ) {
      return false;
    }
    if (
      !passesNumberRange(done, columnFilters.doneMin, columnFilters.doneMax)
    ) {
      return false;
    }
    return passesUpdatedFilter(project.updatedAt, columnFilters.updated);
  });

  const sorted = (() => {
    const arr = [...filteredRows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "org":
          return orgLabel(a).localeCompare(orgLabel(b)) * dir;
        case "open":
          return (
            ((stats.get(a.id)?.open ?? 0) - (stats.get(b.id)?.open ?? 0)) * dir
          );
        case "done":
          return (
            ((stats.get(a.id)?.done ?? 0) - (stats.get(b.id)?.done ?? 0)) * dir
          );
        case "updated":
          return compareTimestamps(a.updatedAt, b.updatedAt) * dir;
        default:
          return 0;
      }
    });
    return arr;
  })();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(
        key === "open" || key === "done" || key === "updated" ? "desc" : "asc",
      );
    }
  };

  const filtersActive = hasActiveColumnFilters(columnFilters);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {filtersActive && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            Column filters active
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 px-3 text-xs lg:h-7"
            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <ProjectsColumnHead
              k="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              filter={
                <ColumnFilterButton
                  active={columnFilters.name.trim().length > 0}
                  label="project"
                >
                  <TextColumnFilter
                    label="Project"
                    value={columnFilters.name}
                    placeholder="Contains…"
                    onChange={(name) => patchFilters({ name })}
                  />
                </ColumnFilterButton>
              }
            >
              Project
            </ProjectsColumnHead>
            <ProjectsColumnHead
              k="org"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="w-60"
              filter={
                <ColumnFilterButton
                  active={columnFilters.organizationId.length > 0}
                  label="organization"
                >
                  <div className="flex flex-col gap-2 w-[200px]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Filter: Organization
                      </p>
                      {columnFilters.organizationId.length > 0 && (
                        <button
                          type="button"
                          className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground lg:min-h-0 lg:px-0"
                          onClick={() => patchFilters({ organizationId: "" })}
                        >
                          clear
                        </button>
                      )}
                    </div>
                    <Select
                      value={columnFilters.organizationId || "__all__"}
                      onValueChange={(v) =>
                        patchFilters({
                          organizationId: v === "__all__" ? "" : v,
                        })
                      }
                    >
                      <SelectTrigger className="h-11 text-base lg:h-8 lg:text-sm">
                        <SelectValue placeholder="All organizations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">
                          All organizations
                        </SelectItem>
                        {orgOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </ColumnFilterButton>
              }
            >
              Organization
            </ProjectsColumnHead>
            <ProjectsColumnHead
              k="open"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="w-24 text-right"
              align="right"
              filter={
                <ColumnFilterButton
                  active={
                    columnFilters.openMin !== undefined ||
                    columnFilters.openMax !== undefined
                  }
                  label="open tasks"
                  align="end"
                >
                  <NumberRangeColumnFilter
                    key={`open:${columnFilters.openMin ?? "none"}:${columnFilters.openMax ?? "none"}`}
                    label="Open"
                    min={columnFilters.openMin}
                    max={columnFilters.openMax}
                    onChange={({ min, max }) =>
                      patchFilters({ openMin: min, openMax: max })
                    }
                  />
                </ColumnFilterButton>
              }
            >
              Open
            </ProjectsColumnHead>
            <ProjectsColumnHead
              k="done"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="w-24 text-right"
              align="right"
              filter={
                <ColumnFilterButton
                  active={
                    columnFilters.doneMin !== undefined ||
                    columnFilters.doneMax !== undefined
                  }
                  label="done tasks"
                  align="end"
                >
                  <NumberRangeColumnFilter
                    key={`done:${columnFilters.doneMin ?? "none"}:${columnFilters.doneMax ?? "none"}`}
                    label="Done"
                    min={columnFilters.doneMin}
                    max={columnFilters.doneMax}
                    onChange={({ min, max }) =>
                      patchFilters({ doneMin: min, doneMax: max })
                    }
                  />
                </ColumnFilterButton>
              }
            >
              Done
            </ProjectsColumnHead>
            <ProjectsColumnHead
              k="updated"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="w-36"
              filter={
                <ColumnFilterButton
                  active={columnFilters.updated !== "any"}
                  label="updated"
                >
                  <UpdatedColumnFilter
                    value={columnFilters.updated}
                    onChange={(updated) => patchFilters({ updated })}
                  />
                </ColumnFilterButton>
              }
            >
              Updated
            </ProjectsColumnHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr:nth-child(even)]:bg-muted/30">
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={6}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No projects match these column filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((p) => {
              const s = stats.get(p.id);
              return (
                <TableRow
                  key={p.id}
                  data-project-row-id={p.id}
                  className="group/entity-ref cursor-pointer"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FolderKanban className="h-4 w-4" />
                      </span>
                      {/* THE DOOR LAW: the whole-row click is a mouse
                          convenience; the NAME is the real anchor (keyboard,
                          screen reader, middle-click), plus new tab + peek. */}
                      <EntityRef
                        token="project"
                        id={p.id}
                        name={p.name}
                        showIcon={false}
                        className="inline-flex min-h-11 items-center font-medium text-foreground lg:min-h-0"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    {/* A resolvable relationship is rendered AND linked. */}
                    {p.organizationId ? (
                      <EntityRef
                        token="organization"
                        id={p.organizationId}
                        // NOT a fallback string. `orgMap` only holds orgs the
                        // user is a MEMBER of, so a project reached by a
                        // permission grant resolves to nothing here — and
                        // printing the word "Organization" would present a
                        // label we invented as if it were the org's name.
                        // EntityRef already degrades to a truncated id, which
                        // is true and still opens.
                        name={orgEntry(p)?.name ?? null}
                        className="inline-flex min-h-11 items-center text-sm text-muted-foreground lg:min-h-0"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />—
                      </span>
                    )}
                  </TableCell>
                  {/* A COUNT IS A DOOR: /projects/[id] lists this project's
                      tasks grouped Open / Done (ProjectTaskList). */}
                  <TableCell className="py-2 text-right tabular-nums">
                    {!s && statsReadFailed ? (
                      <span title="Task summary unavailable">—</span>
                    ) : (
                      <Link
                        href={`/projects/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${p.name} — ${s?.open ?? 0} open task${
                          (s?.open ?? 0) === 1 ? "" : "s"
                        }`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 hover:bg-accent hover:underline lg:min-h-0 lg:min-w-0"
                      >
                        {s?.open ?? 0}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                    {!s && statsReadFailed ? (
                      <span title="Task summary unavailable">—</span>
                    ) : (
                      <Link
                        // `?done=1` expands the Done group on arrival — that
                        // section is collapsed by default, so a bare link would
                        // land the user on a page where the tasks this number
                        // counts are still hidden.
                        href={`/projects/${p.id}?done=1`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Open ${p.name} — ${s?.done ?? 0} completed task${
                          (s?.done ?? 0) === 1 ? "" : "s"
                        }`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 hover:bg-accent hover:underline lg:min-h-0 lg:min-w-0"
                      >
                        {s?.done ?? 0}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground whitespace-nowrap">
                    <span title={formatAbsoluteDate(p.updatedAt)}>
                      {formatRelativeTime(p.updatedAt, { style: "long" })}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div
                      className="flex items-center justify-end gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ProjectCopyForAiButton
                        projectId={p.id}
                        projectName={p.name}
                        location="Projects — hub table"
                        size="icon"
                        className="h-11 w-11 lg:h-7 lg:w-7"
                      />
                      {/* An anchor, like the Settings button beside it — an
                          onClick-only Open cannot be cmd- or middle-clicked,
                          so the row's own "open in a new tab" door died at the
                          one control most likely to be used for it. */}
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-11 lg:h-8"
                      >
                        <Link href={`/projects/${p.id}`}>Open</Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-11 w-11 text-muted-foreground lg:h-8 lg:w-auto"
                      >
                        <Link
                          href={`/projects/${p.id}/settings`}
                          aria-label={`Manage ${p.name}`}
                          title={`Manage ${p.name}`}
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectHubCard({
  project,
  stat,
  orgMap,
  statsReadFailed,
}: {
  project: ProjectWithRole;
  stat?: Stat;
  orgMap: OrgMap;
  statsReadFailed: boolean;
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
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40 opacity-80" />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => router.push(href)}
            aria-label={`Open ${project.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
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
        <Button asChild size="sm" className="h-11 flex-1 lg:h-8">
          <Link href={href}>
            Open
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-11 lg:h-8">
          <Link href={`/projects/${project.id}/settings`}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Manage
          </Link>
        </Button>
      </div>
    </Card>
  );
}
