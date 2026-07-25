import { toast } from "@/lib/toast";
import { Settings, Network } from "lucide-react";
import type { PlacementMode } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { createProjectsScope } from "@/features/surfaces/manifests/projects.manifest";
import type { Project } from "@/features/projects/types";

/**
 * Placement visibility for the projects surface menu.
 *
 * The project workspace is a mix of editable inputs (the in-place name /
 * description editors) and read-only facts the user reads (the hero, meta,
 * stats). The editor-only `content-block` placement (insert a template at the
 * cursor) makes sense on the editable fields but not on the presentational
 * hero; the per-region `isEditable` flag already gates the text-mutating items,
 * so we leave every placement visible here and let each mount pass `isEditable`.
 * Modeled as `placementMode` (the modern API) so org/user tools stay visible.
 */
export const PROJECTS_CONTEXT_MENU_PLACEMENT_MODE: PlacementMode = {
  "ai-action": "show",
  "bound-agent": "show",
  "content-block": "show",
  "organization-tool": "show",
  "user-tool": "show",
  "quick-action": "show",
};

/**
 * Shared menu props for `matrx-user/projects` (editable + presentational).
 *
 * `sourceFeature` is trace-attribution only; `surfaceName` is what drives
 * surface-binding resolution. `"projects"` is the surface's own attribution
 * literal in the `SourceFeature` union (`features/agents/`).
 *
 * `isEditable` is intentionally NOT baked in here — each mount passes its own
 * (`true` on the editable region, `false` on the presentational one).
 */
export const PROJECTS_CONTEXT_MENU_PROPS = {
  sourceFeature: "projects" as const,
  surfaceName: "matrx-user/projects" as const,
  placementMode: PROJECTS_CONTEXT_MENU_PLACEMENT_MODE,
};

/** Live, denormalized facts the workspace already holds about the active org. */
export interface ProjectsContextOrgInfo {
  /** Display name of the active organization, when the project has one. */
  name?: string | null;
  /** True when the org row is the user's personal space (not a real org). */
  isPersonal?: boolean;
}

/** Open / done task counts the workspace tracks for the active project. */
export interface ProjectsContextTaskCounts {
  open: number;
  done: number;
}

/** One project member as the host passes it (camelCase; mapped to the scope shape). */
export interface ProjectsContextMember {
  userId: string;
  role: string;
  displayName?: string | null;
  email?: string | null;
}

export interface BuildProjectsContextDataArgs {
  /** Active project, or null when none is resolved (e.g. while loading). */
  project: Project | null;
  /**
   * Denormalized org facts the surface already resolved (name + personal flag).
   * `Project.organizationId` is the id; the name lives here so we never refetch.
   */
  org?: ProjectsContextOrgInfo | null;
  /** Number of members on the active project, when known. */
  memberCount?: number;
  /** The active project's members, when loaded (empty while loading). */
  members?: ProjectsContextMember[];
  /** Open / done task counts for the active project, when known. */
  taskCounts?: ProjectsContextTaskCounts;
  /** The viewer's role on the project (`owner` | `admin` | `member`), if any. */
  viewerRole?: string | null;
  /**
   * Per-kind counts of catalogue resources attached to the project (tasks and
   * projects already excluded by the host). Omit while the inventory loads.
   */
  resourceCounts?: Record<string, number>;
  /** Sum of `resourceCounts`. Omit while the inventory loads. */
  totalResourceCount?: number;
  /** Number of projects visible to the user in the current context, when known. */
  projectCount?: number;
  /** Browser text selection scoped to the surface. Empty when none. */
  selectionText?: string;
}

/**
 * Canonical `contextData` for `matrx-user/projects`.
 *
 * PURE map of the active project's live workspace state → `createProjectsScope`,
 * using the EXACT SurfaceValue names the manifest declares. Emits the baselines
 * with real values where the surface has them (`content` = the project
 * description — the primary body the user reads/edits; `selection` = the
 * browser selection; `context` = a small surface blob with status / priority /
 * counts / role) plus every custom value the manifest declares that the
 * workspace can source: the full project identity + composite, people
 * (members / member_count / viewer_role), activity (task counts / resource
 * counts), and org context.
 *
 * `selected_project_ids` is intentionally omitted — multi-select only exists on
 * list-level mounts; the single-project workspace doesn't own it and must not
 * lie about it. `project_count` IS emitted when the host knows the user's
 * visible project list (the workspace loads sibling projects for its switcher).
 *
 * Demo + production share this one shape.
 */
export function buildProjectsContextData(
  args: BuildProjectsContextDataArgs,
): Record<string, unknown> {
  const {
    project,
    org = null,
    memberCount,
    members,
    taskCounts,
    viewerRole,
    resourceCounts,
    totalResourceCount,
    projectCount,
    selectionText = "",
  } = args;

  const projectOpen = project != null;
  const hasSelection = selectionText.length > 0;
  const description = project?.description ?? "";

  // `is_personal_project` follows the project's own flag first; fall back to
  // the resolved org's personal flag when the project flag is unset.
  const isPersonal = projectOpen
    ? (project.isPersonal ?? org?.isPersonal ?? false)
    : undefined;

  const surround: Record<string, unknown> = {
    project_open: projectOpen,
    project_status: project?.status ?? undefined,
    project_priority: project?.priority ?? undefined,
    is_personal_project: isPersonal,
    organization_name: org?.name ?? undefined,
    member_count: memberCount,
    open_task_count: taskCounts?.open,
    done_task_count: taskCounts?.done,
    viewer_role: viewerRole ?? undefined,
    start_date: project?.startDate ?? undefined,
    target_date: project?.targetDate ?? undefined,
  };

  const mappedMembers = members?.map((m) => ({
    user_id: m.userId,
    role: m.role,
    display_name: m.displayName || undefined,
    email: m.email || undefined,
  }));

  // Composite active-project object (completeness law: the natural group value
  // alongside its constituent fields).
  const activeProject = projectOpen
    ? {
        id: project.id,
        name: project.name || undefined,
        slug: project.slug || undefined,
        description: description || undefined,
        status: project.status || undefined,
        priority: project.priority || undefined,
        start_date: project.startDate || undefined,
        target_date: project.targetDate || undefined,
        is_personal: isPersonal,
        organization_id: project.organizationId || undefined,
        organization_name: org?.name || undefined,
        created_at: project.createdAt || undefined,
      }
    : undefined;

  return createProjectsScope({
    // ── Baselines (`content` = the project description — the primary body the
    //    user reads/edits on the workspace) ────────────────────────────────
    selection: hasSelection ? selectionText : undefined,
    content: projectOpen ? description || undefined : undefined,
    context: surround,

    // ── Active project identity ──────────────────────────────────────────
    active_project_id: projectOpen ? project.id : undefined,
    active_project_name: projectOpen ? project.name || undefined : undefined,
    active_project_slug: projectOpen ? project.slug || undefined : undefined,
    active_project_description: projectOpen ? description || undefined : undefined,
    active_project_status: projectOpen ? project.status || undefined : undefined,
    active_project_priority: project?.priority || undefined,
    active_project_start_date: project?.startDate || undefined,
    active_project_target_date: project?.targetDate || undefined,
    active_project_created_at: projectOpen
      ? project.createdAt || undefined
      : undefined,
    is_personal_project: isPersonal,
    active_project: activeProject,

    // ── People ───────────────────────────────────────────────────────────
    member_count: memberCount,
    members: mappedMembers,
    viewer_role: viewerRole || undefined,

    // ── Activity & resources ─────────────────────────────────────────────
    open_task_count: taskCounts?.open,
    done_task_count: taskCounts?.done,
    resource_counts: resourceCounts,
    total_resource_count: totalResourceCount,

    // ── Active organization context ──────────────────────────────────────
    active_organization_id: project?.organizationId || undefined,
    active_organization_name: org?.name || undefined,

    // ── List context ─────────────────────────────────────────────────────
    project_count: projectCount,
  }) as Record<string, unknown>;
}

/**
 * Project-specific menu items injected via `extraSections` (target wiring).
 * The core menu renders these; the projects wrapper only describes them. Real
 * navigation handlers are passed in by the host so the section acts on the live
 * project (open settings / open knowledge graph) rather than reimplement those
 * flows. Every item is read-only navigation — no destructive action lives here
 * (delete stays on the Manage page's Danger Zone).
 */
export function createProjectsExtraSections(handlers?: {
  onManageSettings?: () => void;
  onOpenKnowledgeGraph?: () => void;
}): ContextMenuExtraSection[] {
  return [
    {
      id: "project-ops",
      label: "Project",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "manage-settings",
          label: "Manage settings",
          icon: Settings,
          onSelect: () =>
            handlers?.onManageSettings
              ? handlers.onManageSettings()
              : toast.info("Open project settings"),
        },
        {
          kind: "item",
          id: "open-knowledge-graph",
          label: "Open knowledge graph",
          icon: Network,
          onSelect: () =>
            handlers?.onOpenKnowledgeGraph
              ? handlers.onOpenKnowledgeGraph()
              : toast.info("Open knowledge graph"),
        },
      ],
    },
  ];
}
