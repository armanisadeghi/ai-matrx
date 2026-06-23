import { toast } from "sonner";
import { Settings, Network } from "lucide-react";
import type { PlacementMode } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";
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
 * surface-binding resolution. The `SourceFeature` union (in `features/agents/`)
 * has no dedicated `"projects"` member yet — the closest valid one is
 * `"project-create"` (the "Use AI" tab of the create-project panel). We reuse
 * it so traces stay in the project domain; adding a dedicated `"projects"`
 * member is a tracked follow-up (out of this surface's file scope). This
 * mirrors the Tasks precedent, which reuses `"task-create"`.
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
  /** Open / done task counts for the active project, when known. */
  taskCounts?: ProjectsContextTaskCounts;
  /** The viewer's role on the project (`owner` | `admin` | `member`), if any. */
  viewerRole?: string | null;
  /** Browser text selection scoped to the surface. Empty when none. */
  selectionText?: string;
}

/**
 * Canonical `contextData` for `matrx-user/projects`.
 *
 * PURE map of the active project's live workspace state → `createProjectsScope`,
 * using the EXACT SurfaceValue names the manifest declares. Emits the
 * auto-injected baselines with real values where the surface has them
 * (`content` = the project description — the primary body the user reads/edits;
 * `selection` = the browser selection; `context` = a small surface blob with
 * status / priority / counts / role) plus every custom value the manifest
 * declares that the workspace can source from the single active project + org.
 *
 * List-level values (`selected_project_ids`, `project_count`) are intentionally
 * omitted — the single-project workspace doesn't own the project list and must
 * not lie about it (same discipline as the Tasks single-task editor omitting
 * list values). They belong to a future list-surface mount (e.g. ProjectsHub).
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
    taskCounts,
    viewerRole,
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

  const scope = createProjectsScope({
    // ── Baselines + selection (the projects manifest declares `selection` +
    //    `context`) ────────────────────────────────────────────────────────
    selection: hasSelection ? selectionText : undefined,
    context: surround,

    // ── Active project identity ──────────────────────────────────────────
    active_project_id: projectOpen ? project.id : undefined,
    active_project_name: projectOpen ? project.name || undefined : undefined,
    active_project_description: projectOpen ? description || undefined : undefined,
    is_personal_project: isPersonal,

    // ── Active organization context ──────────────────────────────────────
    active_organization_id: project?.organizationId || undefined,
    active_organization_name: org?.name || undefined,
  }) as Record<string, unknown>;

  // `content` is a platform baseline (always bindable + auto-floored by
  // `withBaselineScope` at launch), so the manifest's typed `createProjectsScope`
  // helper doesn't list it. We still emit the REAL value — the project
  // description, the primary body the user reads/edits — so any agent binding
  // to `content` gets it instead of the empty floor. Set only when a project is
  // open and has a description; otherwise the launch-time floor provides "".
  if (projectOpen && description) {
    scope.content = description;
  }

  return scope;
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
