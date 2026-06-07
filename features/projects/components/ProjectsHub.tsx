"use client";

/**
 * ProjectsHub — the canonical /projects launcher.
 *
 * Mirrors the org launcher (app/(core)/organizations/page.tsx): large cards that
 * bring each project to life with a live task preview + open/done counts. Reads
 * ?org=<slug|id> / ?scope=<id> to filter (org/scope are filtered views, not
 * parents). Default view groups Personal + Team projects.
 */

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Loader2,
  Building2,
  Users,
  Settings,
  ArrowRight,
  Circle,
  CircleCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal";
import { getProjectTasks } from "@/features/tasks/services/taskService";
import type { ProjectWithRole } from "@/features/projects/types";
import type { DatabaseTask } from "@/features/tasks/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ProjectsHub({
  orgParam,
  scopeParam,
}: {
  orgParam?: string | null;
  scopeParam?: string | null;
}) {
  const { organizations } = useUserOrganizations();
  const [createOpen, setCreateOpen] = React.useState(false);

  // Self-contained, RLS-filtered project list (independent of nav-tree
  // hydration, which doesn't reliably fire on a direct /projects load).
  const [projects, setProjects] = React.useState<ProjectWithRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reloadTick, setReloadTick] = React.useState(0);
  const refresh = React.useCallback(() => setReloadTick((t) => t + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("ctx_projects")
        .select("id, name, slug, description, organization_id, is_personal, created_by, updated_at")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[ProjectsHub] load failed:", error);
        setProjects([]);
      } else {
        type Row = {
          id: string;
          name: string;
          slug: string | null;
          description: string | null;
          organization_id: string | null;
          is_personal: boolean | null;
          created_by: string | null;
        };
        setProjects(
          ((data as Row[]) ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug ?? null,
            description: r.description ?? null,
            organizationId: r.organization_id ?? null,
            createdBy: r.created_by ?? null,
            isPersonal: !!r.is_personal,
            settings: {},
            createdAt: "",
            updatedAt: "",
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

  const orgMap = React.useMemo(() => {
    const m = new Map<string, { name: string; slug: string }>();
    for (const o of organizations) m.set(o.id, { name: o.name, slug: o.slug });
    return m;
  }, [organizations]);

  // Resolve ?org=slug|id → org id.
  const [orgFilterId, setOrgFilterId] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!orgParam) {
      setOrgFilterId(null);
      return;
    }
    if (UUID_RE.test(orgParam)) {
      setOrgFilterId(orgParam);
      return;
    }
    (async () => {
      const o = await getOrganizationBySlugOrId(orgParam);
      if (!cancelled) setOrgFilterId(o?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgParam]);

  // Resolve ?scope=id → set of project ids assigned to that scope.
  const [scopeProjectIds, setScopeProjectIds] = React.useState<Set<string> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    if (!scopeParam) {
      setScopeProjectIds(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("ctx_scope_assignments")
        .select("entity_id")
        .eq("entity_type", "project")
        .eq("scope_id", scopeParam);
      if (!cancelled) {
        setScopeProjectIds(
          new Set((data ?? []).map((r) => String((r as { entity_id: string }).entity_id))),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeParam]);

  const filtered = React.useMemo(() => {
    let list = projects;
    if (orgFilterId) list = list.filter((p) => p.organizationId === orgFilterId);
    if (scopeProjectIds) list = list.filter((p) => scopeProjectIds.has(p.id));
    return list;
  }, [projects, orgFilterId, scopeProjectIds]);

  const isFiltered = Boolean(orgParam || scopeParam);
  const personal = filtered.filter((p) => p.isPersonal || !p.organizationId);
  const teams = filtered.filter((p) => !p.isPersonal && p.organizationId);
  const subtitle = orgFilterId
    ? `Projects in ${orgMap.get(orgFilterId)?.name ?? "this organization"}`
    : scopeParam
      ? "Projects tagged to this scope"
      : "Longer-running containers for your tasks, resources, and scopes";

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 pr-14 md:pr-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New project
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
              {isFiltered
                ? "No projects match this filter."
                : "Create a project to organize tasks, resources, and context."}
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New project
            </Button>
          </Card>
        ) : isFiltered ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((p) => (
              <ProjectHubCard key={p.id} project={p} orgMap={orgMap} />
            ))}
          </div>
        ) : (
          <>
            {personal.length > 0 && (
              <Section title="Personal">
                {personal.map((p) => (
                  <ProjectHubCard key={p.id} project={p} orgMap={orgMap} />
                ))}
              </Section>
            )}
            {teams.length > 0 && (
              <Section title="Team projects">
                {teams.map((p) => (
                  <ProjectHubCard key={p.id} project={p} orgMap={orgMap} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <CreateProjectModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        redirectOnSuccess={false}
        onSuccess={() => {
          setCreateOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function ProjectHubCard({
  project,
  orgMap,
}: {
  project: ProjectWithRole;
  orgMap: Map<string, { name: string; slug: string }>;
}) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState<DatabaseTask[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getProjectTasks(project.id);
      if (!cancelled) setTasks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const top = (tasks ?? []).filter((t) => !t.parent_task_id);
  const open = top.filter((t) => t.status !== "completed");
  const done = top.filter((t) => t.status === "completed");
  const preview = open.slice(0, 4);
  const org = project.organizationId ? orgMap.get(project.organizationId) : null;
  const href = `/projects/${project.id}`;

  return (
    <Card className="relative overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-sm transition-all">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 opacity-80" />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push(href)}
            className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          >
            <FolderKanban className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <button onClick={() => router.push(href)} className="text-left block max-w-full group/title">
              <h3 className="font-semibold text-base truncate group-hover/title:text-primary transition-colors">
                {project.name}
              </h3>
            </button>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {project.isPersonal || !project.organizationId ? (
                <Badge variant="secondary" className="text-[10px]">Personal</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Building2 className="h-3 w-3" />
                  {org?.name ?? "Org"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        {/* Live task preview */}
        <div className="rounded-lg border border-border bg-muted/20 p-2.5 flex-1">
          {tasks === null ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : preview.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-1 px-1">
              {done.length > 0 ? "All tasks done." : "No tasks yet."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {preview.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-0.5">
                  <Circle className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
              {open.length > preview.length && (
                <li className="text-[11px] text-muted-foreground/70 px-1 pt-0.5">
                  +{open.length - preview.length} more
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Circle className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">{open.length}</span> open
          </span>
          <span className="flex items-center gap-1">
            <CircleCheck className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">{done.length}</span> done
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">{project.memberCount ?? 1}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 py-3 border-t border-border bg-card">
        <Button size="sm" onClick={() => router.push(href)} className="flex-1">
          Open
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/projects/${project.id}/settings`}>
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Manage
          </Link>
        </Button>
      </div>
    </Card>
  );
}
