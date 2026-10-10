"use client";

/**
 * ProjectWorkspace — the reimagined project home at /projects/[projectId].
 *
 * Mirrors OrgWorkspace, but the container is a project. Sections:
 *   - Hero: name, org + role badges, members, scope chips, stats, actions
 *   - Tasks: ProjectTaskList (grouped Open/Done, nested subtasks, quick-add)
 *   - Associated resources: the canonical association grid (AssociationCardGrid
 *     under a PrimaryEntityProvider) — attach/detach writes platform.associations
 *     edges, which convey project-member access to each attached item
 *   - Scopes & Knowledge: EntityScopeTagger + knowledge-graph deep link
 *   - Advanced: ProjectReferencesPanel (every table FK-ing the project)
 *
 * Resolves the project by UUID (param) or slug. Handles org-less projects.
 */

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2,
  Settings,
  Pencil,
  Network,
  Users,
  ListTodo,
  Boxes,
  ChevronRight,
  FolderKanban,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import {
  useProjectMembers,
  useProjectRead,
  useProjectUserRole,
  useUserProjects,
} from "@/features/projects/hooks";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { ProjectReferencesPanel } from "@/features/projects/components/ProjectReferencesPanel";
import { ProjectDetails } from "@/features/projects/components/ProjectDetails";
import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import type { Project } from "@/features/projects/types";
import { useOrganizationLabel } from "@/features/organizations/hooks/useOrganizationLabel";
import { AssignedScopesDisplay } from "@/features/scopes/components/entity-context/AssignedScopesDisplay";
import {
  InlineProjectName,
  InlineProjectDescription,
  ProjectMetaRow,
} from "@/features/projects/components/ProjectInlineEditors";
import {
  buildProjectsContextData,
  createProjectsExtraSections,
  PROJECTS_CONTEXT_MENU_PROPS,
} from "@/features/projects/agent-context/buildProjectsContextData";
import { buildProjectWriteHandlers } from "@/features/projects/agent-context/projectWriteHandlers";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ProjectContextPicker } from "@/features/projects/components/ProjectContextSection";
import { AssociationCardGrid } from "@ai-matrx/associations/react";
import { PrimaryEntityProvider } from "@ai-matrx/associations/react";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { curatedTokens } from "@/features/scopes/registry/entityRegistry";
import { ProjectTaskList } from "./ProjectTaskList";
import { ProjectCopyForAiButton } from "./ProjectCopyForAiButton";
import { ReadFailure } from "@ai-matrx/design-system";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

// Tasks + projects have their own surfaces; don't double-count them as "resources".
const EXCLUDE_FROM_RESOURCES = new Set(["task", "project"]);

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
// The hero is a read-only identity/overview region → NonEditableContextMenu
// (the description editor below mounts its own editable Pro "…" menu).
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * The /projects/[projectId] route: resolves the project by UUID or slug, owns
 * the loading / failed-read / no-access states, then renders the ONE project
 * workspace (`ProjectRecordWorkspace`) with the route's chrome.
 */
export function ProjectWorkspace() {
  const params = useParams();
  const projectParam = params.projectId as string;

  // Both reads live in Redux (`useStoreRead`): a remount of the route renders
  // the stored project and reads nothing.
  const isUuid = isUuidShape(projectParam);
  // Slug fallback (slugs aren't globally unique; take first match).
  const slugRead = useStoreRead<string | null>(
    isUuid ? null : `projects.slug:${projectParam}`,
    async () => {
      const { data, error: slugError } = await projectsDb(supabase)
        .from("projects")
        .select("id")
        .is("deleted_at", null)
        .eq("slug", projectParam)
        .limit(1)
        .maybeSingle();
      if (slugError) throw slugError;
      return (data as { id?: string } | null)?.id ?? null;
    },
  );
  const projectId = isUuid ? projectParam : (slugRead.data ?? undefined);
  const projectRead = useProjectRead(projectId);
  const project = projectRead.data ?? null;
  // A failed project read is its own state (RC-B12 r13) — `getProject` used
  // to answer null for a fault, which showed the access gate.
  const projectReadError = slugRead.error ?? (projectRead.hasData ? null : projectRead.error);
  const resolving =
    projectReadError == null &&
    ((!isUuid && !slugRead.hasData) || (projectId != null && !projectRead.hasData));
  const retryProjectRead = () =>
    void (slugRead.error ? slugRead.refresh() : projectRead.refresh());

  if (resolving) {
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/projects" ariaLabel="Back" />}
        />
        <CenterState>
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </CenterState>
      </>
    );
  }

  if (projectReadError != null) {
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/projects" ariaLabel="Back" />}
        />
        <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
          <ReadFailure
            error={projectReadError}
            what="this project"
            onRetry={retryProjectRead}
            size="default"
          />
        </div>
      </>
    );
  }

  if (!project) {
    // `getProject` returns null for every failure (denied, trashed, missing,
    // wrong org, fault) — the canonical gate resolves which one it was.
    return (
      <>
        <RouteHeader
          left={<ChevronLeftTapButton href="/projects" ariaLabel="Back" />}
        />
        <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
          <AccessGate
            token="project"
            id={projectParam}
            fallbackHref="/projects"
            fallbackLabel="All projects"
          />
        </div>
      </>
    );
  }

  return (
    <ProjectRecordWorkspace
      key={project.id}
      initialProject={project}
      chrome="page"
    />
  );
}

/**
 * ProjectRecordWorkspace — THE workspace for ONE resolved project: the hero
 * (inline name / status / priority / dates / context / description), the task
 * list, the associated-resources grid, scopes and references — AND the
 * project's agent surface (`matrx-user/projects`, read + write). The project
 * route and a project on the Board both render this, so every control and
 * every agent write is identical in both places.
 *
 * `chrome="page"` adds the route's shell header (back, sibling switcher,
 * modes, actions) and the under-the-glass padding; `chrome="embedded"` is the
 * same workspace for a host that brings its own frame (a board tile).
 */
export function ProjectRecordWorkspace({
  initialProject,
  chrome,
}: {
  initialProject: Project;
  chrome: "page" | "embedded";
}) {
  const router = useRouter();
  // Inline edits (name/description/status/priority/dates/org) patch this copy
  // so the workspace IS the edit surface — no trip to a separate page.
  // The copy is the store's (`projects.project:<id>`), so an edit made here is
  // what a remount, a wake or another view of this project shows.
  const projectRead = useProjectRead(initialProject.id);
  const project = projectRead.data ?? initialProject;
  const applyPatch = (patch: Partial<Project>) =>
    projectRead.setData((prev) => ({ ...(prev ?? initialProject), ...patch }));
  // Label enrichment only: the organization chip is absent without it.
  const org = useOrganizationLabel(project.organizationId);
  const [taskCounts, setTaskCounts] = React.useState<{
    open: number;
    done: number;
  }>({
    open: 0,
    done: 0,
  });

  const { members, error: membersError } = useProjectMembers(project.id);
  const { role, canManageSettings } = useProjectUserRole(project.id);
  const { projects: siblingProjects } = useUserProjects();

  // Canonical association reads — the project's attached resources are its
  // incoming platform.associations edges (the spine conveys project-member
  // access down to each attached item). Tasks keep their own FK-based section.
  const { status: linksStatus, countFor } = useContainerLinks({
    containerType: "project",
    containerId: project.id,
    orgId: project.organizationId ?? null,
  });
  const countsLoading = linksStatus === "loading" || linksStatus === "idle";

  const resourceTokens = curatedTokens().filter(
    (t) => !EXCLUDE_FROM_RESOURCES.has(t),
  );

  // Sum ONLY the tokens the grid shows — a raw all-edges total would count
  // task→project edges the grid excludes and disagree with the visible cards.
  const totalResources = resourceTokens.reduce(
    (sum, t) => sum + countFor(t),
    0,
  );

  const kgHref = org
    ? `/knowledge/graph?org=${encodeURIComponent(org.slug)}`
    : "/knowledge/graph";

  // ── Surface agent context (matrx-user/projects) ───────────────────────────
  // Plain values / functions — React Compiler memoizes the build for free.
  // Resource counts, excluding tasks/projects (they have their own values) and
  // still-loading nulls — same discipline as the on-page `totalResources` stat.
  const resourceCounts: Record<string, number> = {};
  if (!countsLoading) {
    for (const token of resourceTokens) {
      const c = countFor(token);
      if (c > 0) resourceCounts[token as string] = c;
    }
  }

  const contextData = buildProjectsContextData({
    project,
    org: org ? { name: org.name } : null,
    memberCount: members.length,
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      displayName: m.user?.displayName ?? null,
      email: m.user?.email ?? null,
    })),
    taskCounts,
    viewerRole: role,
    resourceCounts: countsLoading ? undefined : resourceCounts,
    totalResourceCount: countsLoading ? undefined : totalResources,
    projectCount: siblingProjects.length,
  });

  // Reads the live DOM selection at click time (a Pro field or the hero text)
  // and folds it into the surface scope — never a stale render snapshot.
  const getApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection()?.toString() ?? "",
      selectionRange: null,
      contextData,
    });

  // Write half of the surface (the targets the manifest declares). Built at
  // apply time, not at mount, so the handlers always see the CURRENT project
  // and permission — and they go through `updateProject` + the same
  // `applyPatch` the hero's inline editors use, never a parallel write path.
  const getWriteHandlers = () =>
    buildProjectWriteHandlers({
      project,
      canEdit: canManageSettings,
      onPatch: applyPatch,
    });

  const projectsExtraSections = createProjectsExtraSections({
    onManageSettings: () => router.push(`/projects/${project.id}/settings`),
    onOpenKnowledgeGraph: () => router.push(kgHref),
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName={PROJECTS_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable={false}
      getWriteHandlers={getWriteHandlers}
    >
      {chrome === "page" ? (
      <EntityModeHeader
        backHref="/projects"
        entityLabel={project.name}
        entityOptions={siblingProjects.map((p) => ({
          label: p.name,
          href: `/projects/${p.id}`,
          active: p.id === project.id,
        }))}
        modes={[
          { name: "Workspace", href: `/projects/${project.id}`, icon: Eye },
          ...(role
            ? [
                {
                  name: "Settings",
                  href: `/projects/${project.id}/settings`,
                  icon: Settings,
                },
              ]
            : []),
        ]}
        actions={[
          {
            label: "Knowledge graph",
            icon: Network,
            href: kgHref,
          },
        ]}
        right={
          <>
            <ReferenceCopyButton
              referenceType="project"
              id={project.id}
              label={project.name}
              toastLabel={project.name}
              size="md"
              className="h-8 w-8"
            />
            <ProjectCopyForAiButton
              projectId={project.id}
              projectName={project.name}
              location="Projects — project workspace"
              size="icon"
            />
          </>
        }
      />
      ) : null}
      <div
        className={
          chrome === "page"
            ? "h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]"
            : "h-full overflow-y-auto bg-textured"
        }
      >
        <div
          className={
            chrome === "page"
              ? "max-w-6xl mx-auto p-4 md:p-6 space-y-5"
              : "mx-auto max-w-6xl space-y-4 p-3"
          }
        >
          {/* Hero */}
          <Card className="p-5 md:p-6 relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" />
            <div className="flex items-start gap-4">
              <span className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <FolderKanban className="h-6 w-6" />
              </span>
              {/* Presentational surface region — right-click the project's
                identity/overview the user reads to run an agent on it. The
                description editor below mounts its own editable Pro menu. */}
              <NonEditableContextMenu
                {...PROJECTS_CONTEXT_MENU_PROPS}
                getApplicationScope={getApplicationScope}
                contextData={contextData}
                extraSections={projectsExtraSections}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <InlineProjectName
                      project={project}
                      canEdit={canManageSettings}
                      onPatch={applyPatch}
                    />
                    {role && (
                      <Badge variant="outline" className="text-xs capitalize">
                        You: {role}
                      </Badge>
                    )}
                  </div>

                  {/* Editable meta: status / priority / dates */}
                  <div className="mt-3">
                    <ProjectMetaRow
                      project={project}
                      canEdit={canManageSettings}
                      onPatch={applyPatch}
                      showOrg={false}
                    />
                  </div>

                  {/* Context: org + scope types/scopes (persists to project) */}
                  <div className="mt-3 max-w-xl">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">
                      Scopes
                    </p>
                    <ProjectContextPicker
                      project={project}
                      canEdit={canManageSettings}
                      onPatch={applyPatch}
                    />
                  </div>

                  {/* Description (always available to edit in place). The editable
                  ProTextarea inside gets the surface "…" agent menu via
                  surfaceName + getApplicationScope. */}
                  <div className="mt-3">
                    <InlineProjectDescription
                      project={project}
                      canEdit={canManageSettings}
                      onPatch={applyPatch}
                      surfaceName={PROJECTS_CONTEXT_MENU_PROPS.surfaceName}
                      getApplicationScope={getApplicationScope}
                    />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-5 flex-wrap mt-4">
                    <Stat
                      icon={<ListTodo className="h-4 w-4" />}
                      value={taskCounts.open}
                      label="open"
                    />
                    <Stat
                      icon={<ListTodo className="h-4 w-4" />}
                      value={taskCounts.done}
                      label="done"
                    />
                    <Stat
                      icon={<Boxes className="h-4 w-4" />}
                      value={countsLoading ? "…" : totalResources}
                      label="resources"
                    />
                    <Stat
                      icon={<Users className="h-4 w-4" />}
                      value={membersError ? "–" : members.length}
                      label={members.length === 1 ? "member" : "members"}
                    />
                  </div>
                </div>
              </NonEditableContextMenu>
            </div>
          </Card>

          {/* Tasks */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ListTodo className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-lg font-semibold">Tasks</h2>
            </div>
            <ProjectTaskList
              projectId={project.id}
              organizationId={project.organizationId}
              onCountsChange={setTaskCounts}
            />
          </Card>

          {/* Associated resources — the canonical association grid. Attaching
              here writes a platform.associations edge, so project members get
              conveyed access to each attached item (the access spine). */}
          <PrimaryEntityProvider
            value={{
              type: "project",
              id: project.id,
              orgId: project.organizationId ?? null,
              label: project.name,
            }}
          >
            <div className="space-y-5">
              {/* Wraps on a phone: the title keeps its words whole and the
                  explainer drops to its own line (it used to squeeze the
                  heading into "Associate / d / resources" at 390px). */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Boxes className="h-5 w-5 shrink-0 text-muted-foreground" />
                <h2 className="whitespace-nowrap text-lg font-semibold">Associated resources</h2>
                <span className="basis-full text-xs text-muted-foreground sm:basis-auto">
                  Attach files, documents, data stores and more — project
                  members get access automatically
                </span>
              </div>
              <AssociationCardGrid tokens={resourceTokens} />
            </div>
          </PrimaryEntityProvider>

          {/* Scopes & Knowledge — read-only Scope Type: Scope display */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold">Scopes</h2>
              <div className="flex items-center gap-1">
                {role && (
                  <Button
                    asChild
                    variant="quiet"
                  >
                    <Link href={`/projects/${project.id}/settings#scopes`}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit scopes
                    </Link>
                  </Button>
                )}
                <Button
                  asChild
                  variant="quiet"
                >
                  <Link href={kgHref}>
                    Knowledge graph
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
            <AssignedScopesDisplay
              entityType="project"
              entityId={project.id}
              organizationId={project.organizationId}
            />
          </Card>

          {/* The organization's own fields on this project (lane 7 W5). */}
          <EntityCustomFields entityToken="project" recordId={project.id} organizationId={project.organizationId} />

          {/* Details & all FK references (a useful audit summary, collapsible) */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
              Details &amp; references
            </summary>
            <div className="mt-3 space-y-4">
              <ProjectDetails project={project} />
              <ProjectReferencesPanel projectId={project.id} />
            </div>
          </details>
        </div>

      </div>
    </SurfaceRuntimeProvider>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center bg-textured p-4">
      {children}
    </div>
  );
}
