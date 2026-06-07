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
  Building2,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { getProject } from "@/features/projects/service";
import { useProjectMembers, useProjectUserRole } from "@/features/projects/hooks";
import { ProjectReferencesPanel } from "@/features/projects/components/ProjectReferencesPanel";
import type { Project } from "@/features/projects/types";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { UserAvatarDisplay } from "@/components/user/UserIdentity";
import { AssignedScopesDisplay } from "@/features/scopes/components/entity-context/AssignedScopesDisplay";
import {
  CONTENT_ROLES,
  entriesByRole,
  type OrgResourceEntry,
} from "@/features/organizations/resource-catalogue";
import { useContainerInventory } from "@/features/organizations/hooks/useContainerInventory";
import { OrgResourceRoleSection } from "@/features/organizations/components/OrgResourceRoleSection";
import { ContainerResourceSheet } from "@/features/organizations/components/ContainerResourceSheet";
import { ProjectTaskList } from "./ProjectTaskList";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tasks + projects have their own surfaces; don't double-count them as "resources".
const EXCLUDE_FROM_RESOURCES = new Set(["task", "project"]);

export function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const projectParam = params.projectId as string;

  const [project, setProject] = React.useState<Project | null>(null);
  const [resolving, setResolving] = React.useState(true);
  const [org, setOrg] = React.useState<{ name: string; slug: string } | null>(null);
  const [taskCounts, setTaskCounts] = React.useState<{ open: number; done: number }>({
    open: 0,
    done: 0,
  });
  const [sheetEntry, setSheetEntry] = React.useState<OrgResourceEntry | null>(null);

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
        if (!cancelled && o) setOrg({ name: o.name, slug: o.slug });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectParam]);

  const { members } = useProjectMembers(project?.id);
  const { role } = useProjectUserRole(project?.id);
  const { counts, loading: countsLoading } = useContainerInventory({
    column: "project_id",
    value: project?.id ?? null,
  });

  const totalResources = React.useMemo(
    () =>
      Object.entries(counts).reduce<number>(
        (sum, [key, c]) =>
          EXCLUDE_FROM_RESOURCES.has(key) ? sum : sum + (typeof c === "number" ? c : 0),
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
          <Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            All projects
          </Button>
        </Card>
      </CenterState>
    );
  }

  const kgHref = org ? `/knowledge-graph?org=${encodeURIComponent(org.slug)}` : "/knowledge-graph";

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
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {!project.organizationId ? (
                  <Badge variant="secondary">Personal</Badge>
                ) : (
                  <Link href={`/organizations/${org?.slug ?? project.organizationId}`}>
                    <Badge variant="outline" className="gap-1 hover:bg-accent">
                      <Building2 className="h-3 w-3" />
                      {org?.name ?? "Organization"}
                    </Badge>
                  </Link>
                )}
                {role && (
                  <Badge variant="outline" className="text-xs capitalize">
                    You: {role}
                  </Badge>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                  {project.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-5 flex-wrap mt-4">
                <Stat icon={<ListTodo className="h-4 w-4" />} value={taskCounts.open} label="open" />
                <Stat icon={<ListTodo className="h-4 w-4" />} value={taskCounts.done} label="done" />
                <Stat icon={<Boxes className="h-4 w-4" />} value={countsLoading ? "…" : totalResources} label="resources" />
                <Stat icon={<Users className="h-4 w-4" />} value={members.length} label={members.length === 1 ? "member" : "members"} />
              </div>

            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
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
              {members.length > 0 && (
                <div className="flex -space-x-2">
                  {members.slice(0, 6).map((m) => (
                    <UserAvatarDisplay
                      key={m.id}
                      user={m.user}
                      size="xs"
                      className="ring-2 ring-card"
                    />
                  ))}
                </div>
              )}
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
            <span className="text-xs text-muted-foreground">Everything linked to this project</span>
          </div>
          {CONTENT_ROLES.map((r) => {
            const entries = entriesByRole(r.id).filter((e) => !EXCLUDE_FROM_RESOURCES.has(e.key));
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
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link href={`/projects/${project.id}/settings#scopes`}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit scopes
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
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

        {/* Advanced: all FK references */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground select-none">
            Advanced: all references
          </summary>
          <div className="mt-3">
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

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
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
