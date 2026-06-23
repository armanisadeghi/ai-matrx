"use client";

/**
 * ProjectWorkspace — the reimagined project home at /projects/[projectId].
 *
 * Mirrors OrgWorkspace, but the container is a project. Sections:
 *   - Hero: name, org/personal + role badges, members, scope chips, stats, actions
 *   - Tasks: ProjectTaskList (grouped Open/Done, nested subtasks, quick-add)
 *   - Associated resources: catalogue resources with this project_id (role-grouped
 *     tiles → ContainerResourceSheet with peek/open)
 *   - Scopes & Knowledge: EntityScopeTagger + knowledge-graph deep link
 *   - Advanced: ProjectReferencesPanel (every table FK-ing the project)
 *
 * Resolves the project by UUID (param) or slug. Handles org-less (personal) projects.
 */

import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Settings,
  Pencil,
  Network,
  Users,
  ListTodo,
  Boxes,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { getProject } from "@/features/projects/service";
import {
  useProjectMembers,
  useProjectUserRole,
} from "@/features/projects/hooks";
import { ProjectReferencesPanel } from "@/features/projects/components/ProjectReferencesPanel";
import { ProjectDetails } from "@/features/projects/components/ProjectDetails";
import type { Project } from "@/features/projects/types";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
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
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { ProjectContextPicker } from "@/features/projects/components/ProjectContextSection";
import {
  CONTENT_ROLES,
  entriesByRole,
  type OrgResourceEntry,
} from "@/features/organizations/resource-catalogue";
import { useContainerInventory } from "@/features/organizations/hooks/useContainerInventory";
import { OrgResourceRoleSection } from "@/features/organizations/components/OrgResourceRoleSection";
import { ContainerResourceSheet } from "@/features/organizations/components/ContainerResourceSheet";
import { ProjectTaskList } from "./ProjectTaskList";
import { ProjectCopyForAiButton } from "./ProjectCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tasks + projects have their own surfaces; don't double-count them as "resources".
const EXCLUDE_FROM_RESOURCES = new Set(["task", "project"]);

// Heavy agent context menu — code-split off the workspace's first paint. It only
// mounts the agent/shortcut machinery on right-click, so it never needs SSR.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

export function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const projectParam = params.projectId as string;

  const [project, setProject] = React.useState<Project | null>(null);
  const [resolving, setResolving] = React.useState(true);
  const [org, setOrg] = React.useState<{
    name: string;
    slug: string;
    isPersonal: boolean;
  } | null>(null);
  const [taskCounts, setTaskCounts] = React.useState<{
    open: number;
    done: number;
  }>({
    open: 0,
    done: 0,
  });
  const [sheetEntry, setSheetEntry] = React.useState<OrgResourceEntry | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!project?.organizationId) {
        setOrg(null);
        return;
      }
      const o = await getOrganizationBySlugOrId(project.organizationId);
      if (!cancelled && o)
        setOrg({ name: o.name, slug: o.slug, isPersonal: o.isPersonal });
    })();
    return () => {
      cancelled = true;
    };
  }, [project?.organizationId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      let resolved: Project | null = null;
      if (UUID_RE.test(projectParam)) {
        resolved = await getProject(projectParam);
      } else {
        // Slug fallback (slugs aren't globally unique; take first match).
        const { data } = await supabase
          .from("ctx_projects")
          .select("id")
          .eq("slug", projectParam)
          .limit(1)
          .maybeSingle();
        const id = (data as { id?: string } | null)?.id;
        if (id) resolved = await getProject(id);
      }
      if (cancelled) return;
      setProject(resolved);
      setResolving(false);
      if (resolved?.organizationId) {
        const o = await getOrganizationBySlugOrId(resolved.organizationId);
        if (!cancelled && o)
          setOrg({ name: o.name, slug: o.slug, isPersonal: o.isPersonal });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectParam]);

  const { members } = useProjectMembers(project?.id);
  const { role, canManageSettings } = useProjectUserRole(project?.id);

  // Inline edits (name/description/status/priority/dates/org) patch local state
  // so the workspace IS the edit surface — no trip to a separate page.
  const applyPatch = React.useCallback(
    (patch: Partial<Project>) =>
      setProject((prev) => (prev ? { ...prev, ...patch } : prev)),
    [],
  );
  const { counts, loading: countsLoading } = useContainerInventory({
    column: "project_id",
    value: project?.id ?? null,
  });

  const totalResources = React.useMemo(
    () =>
      Object.entries(counts).reduce<number>(
        (sum, [key, c]) =>
          EXCLUDE_FROM_RESOURCES.has(key)
            ? sum
            : sum + (typeof c === "number" ? c : 0),
        0,
      ),
    [counts],
  );

  if (resolving) {
    return (
      <CenterState>
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </CenterState>
    );
  }

  if (!project) {
    return (
      <CenterState>
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This project doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/projects")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            All projects
          </Button>
        </Card>
      </CenterState>
    );
  }

  const kgHref = org
    ? `/knowledge/graph?org=${encodeURIComponent(org.slug)}`
    : "/knowledge/graph";

  // ── Surface agent context (matrx-user/projects) ───────────────────────────
  // `project` is non-null past the guards above, so these are plain values /
  // functions — NOT hooks (a useCallback here would sit after an early return
  // and break rules-of-hooks). React Compiler memoizes the build for free.
  const contextData = buildProjectsContextData({
    project,
    org: org ? { name: org.name, isPersonal: org.isPersonal } : null,
    memberCount: members.length,
    taskCounts,
    viewerRole: role,
  });

  // Reads the live DOM selection at click time (a Pro field or the hero text)
  // and folds it into the surface scope — never a stale render snapshot.
  const getApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection()?.toString() ?? "",
      selectionRange: null,
      contextData,
    });

  const projectsExtraSections = createProjectsExtraSections({
    onManageSettings: () => router.push(`/projects/${project.id}/settings`),
    onOpenKnowledgeGraph: () => router.push(kgHref),
  });

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/projects")}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          All projects
        </Button>

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
            <UnifiedAgentContextMenu
              {...PROJECTS_CONTEXT_MENU_PROPS}
              isEditable={false}
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
                  Context
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
                  value={members.length}
                  label={members.length === 1 ? "member" : "members"}
                />
              </div>
              </div>
            </UnifiedAgentContextMenu>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
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
                />
                <Button asChild variant="outline" size="sm">
                  <Link href={kgHref}>
                    <Network className="h-4 w-4 mr-1.5" />
                    Graph
                  </Link>
                </Button>
                {role && (
                  <Button asChild size="sm">
                    <Link href={`/projects/${project.id}/settings`}>
                      <Settings className="h-4 w-4 mr-1.5" />
                      Manage
                    </Link>
                  </Button>
                )}
              </div>
            </div>
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

        {/* Associated resources */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Associated resources</h2>
            <span className="text-xs text-muted-foreground">
              Everything linked to this project
            </span>
          </div>
          {CONTENT_ROLES.map((r) => {
            const entries = entriesByRole(r.id).filter(
              (e) => !EXCLUDE_FROM_RESOURCES.has(e.key),
            );
            return (
              <OrgResourceRoleSection
                key={r.id}
                role={r.id}
                entries={entries}
                counts={counts}
                loading={countsLoading}
                onOpen={(entry) => setSheetEntry(entry)}
              />
            );
          })}
        </div>

        {/* Scopes & Knowledge — read-only Scope Type: Scope display */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-semibold">Scopes</h2>
            <div className="flex items-center gap-1">
              {role && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  <Link href={`/projects/${project.id}/settings#scopes`}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit scopes
                  </Link>
                </Button>
              )}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
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

      {project && (
        <ContainerResourceSheet
          open={sheetEntry !== null}
          onOpenChange={(o) => !o && setSheetEntry(null)}
          entry={sheetEntry}
          column="project_id"
          value={project.id}
        />
      )}
    </div>
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
    <div className="h-[calc(100dvh-var(--header-height))] flex items-center justify-center bg-textured p-4">
      {children}
    </div>
  );
}
