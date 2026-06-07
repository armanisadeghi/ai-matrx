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
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Loader2,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { supabase } from "@/utils/supabase/client";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal";
import type { ProjectWithRole } from "@/features/projects/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stat = { open: number; done: number; preview: { id: string; title: string }[] };
type ViewMode = "cards" | "table";
type SortKey = "name" | "org" | "open" | "done";
type OrgMap = Map<string, { name: string; slug: string; isPersonal: boolean }>;

export function ProjectsHub({
  orgParam,
  scopeParam,
}: {
  orgParam?: string | null;
  scopeParam?: string | null;
}) {
  const { organizations } = useUserOrganizations();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [view, setView] = React.useState<ViewMode>("cards");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const saved = window.localStorage.getItem("projects-view");
    if (saved === "table" || saved === "cards") setView(saved);
  }, []);
  const setViewPersist = (v: ViewMode) => {
    setView(v);
    window.localStorage.setItem("projects-view", v);
  };

  const orgMap = React.useMemo<OrgMap>(() => {
    const m: OrgMap = new Map();
    for (const o of organizations)
      m.set(o.id, { name: o.name, slug: o.slug, isPersonal: o.isPersonal });
    return m;
  }, [organizations]);

  // A project is "personal" iff its owning org is the user's personal org.
  // ctx_projects.is_personal no longer exists; personal-ness is org-derived.
  const isPersonalProject = React.useCallback(
    (organizationId: string | null) =>
      !!organizationId && orgMap.get(organizationId)?.isPersonal === true,
    [orgMap],
  );

  // Projects (RLS-filtered, nav-tree-independent).
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
        .select("id, name, slug, description, organization_id, created_by, updated_at")
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
            // Personal-ness is org-derived (see isPersonalProject); the project
            // row no longer carries is_personal. Resolved against orgMap at render.
            isPersonal: false,
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

  // Batched task stats for every visible project — one query, not N.
  const [stats, setStats] = React.useState<Map<string, Stat>>(new Map());
  React.useEffect(() => {
    let cancelled = false;
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) {
      setStats(new Map());
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("ctx_tasks")
        .select("id, project_id, status, parent_task_id, title")
        .in("project_id", ids);
      if (cancelled) return;
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
          if (s.preview.length < 4) s.preview.push({ id: row.id, title: row.title });
        }
      }
      setStats(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

  // ?org=slug|id → org id
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
    getOrganizationBySlugOrId(orgParam).then((o) => {
      if (!cancelled) setOrgFilterId(o?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [orgParam]);

  // ?scope=id → project ids assigned to that scope
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
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [projects, orgFilterId, scopeProjectIds, query]);

  const isFiltered = Boolean(orgParam || scopeParam);
  // "Personal" is org-driven: a project is personal iff its owning org is the
  // user's personal org (organizations.is_personal). Every project now has an
  // org, so org-less is no longer the signal.
  const personal = filtered.filter((p) => isPersonalProject(p.organizationId));
  const teams = filtered.filter((p) => !isPersonalProject(p.organizationId));
  const subtitle = orgFilterId
    ? `Projects in ${orgMap.get(orgFilterId)?.name ?? "this organization"}`
    : scopeParam
      ? "Projects tagged to this scope"
      : "Longer-running containers for your tasks, resources, and scopes";

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className={`${view === "table" ? "max-w-7xl" : "max-w-5xl"} mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="pl-8 h-9 w-44"
              />
            </div>
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                onClick={() => setViewPersist("cards")}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${view === "cards" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewPersist("table")}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${view === "table" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                title="Table view"
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New project
            </Button>
          </div>
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
            <h3 className="font-semibold mb-1">No projects found</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
              {query || isFiltered ? "Nothing matches your filters." : "Create a project to organize tasks, resources, and context."}
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New project
            </Button>
          </Card>
        ) : view === "table" ? (
          <ProjectsTable projects={filtered} stats={stats} orgMap={orgMap} />
        ) : isFiltered || query ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((p) => (
              <ProjectHubCard key={p.id} project={p} stat={stats.get(p.id)} orgMap={orgMap} />
            ))}
          </div>
        ) : (
          <>
            {personal.length > 0 && (
              <Section title="Personal">
                {personal.map((p) => (
                  <ProjectHubCard key={p.id} project={p} stat={stats.get(p.id)} orgMap={orgMap} />
                ))}
              </Section>
            )}
            {teams.length > 0 && (
              <Section title="Team projects">
                {teams.map((p) => (
                  <ProjectHubCard key={p.id} project={p} stat={stats.get(p.id)} orgMap={orgMap} />
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

function ProjectsTable({
  projects,
  stats,
  orgMap,
}: {
  projects: ProjectWithRole[];
  stats: Map<string, Stat>;
  orgMap: OrgMap;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const orgEntry = (p: ProjectWithRole) =>
    p.organizationId ? orgMap.get(p.organizationId) ?? null : null;
  const isPersonal = (p: ProjectWithRole) => orgEntry(p)?.isPersonal === true;
  const orgLabel = (p: ProjectWithRole) =>
    isPersonal(p) ? "Personal" : orgEntry(p)?.name ?? "Org";

  const sorted = React.useMemo(() => {
    const arr = [...projects];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "org":
          return orgLabel(a).localeCompare(orgLabel(b)) * dir;
        case "open":
          return ((stats.get(a.id)?.open ?? 0) - (stats.get(b.id)?.open ?? 0)) * dir;
        case "done":
          return ((stats.get(a.id)?.done ?? 0) - (stats.get(b.id)?.done ?? 0)) * dir;
        default:
          return 0;
      }
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, stats, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "open" || key === "done" ? "desc" : "asc");
    }
  };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {children}
        {sortKey === k ? (
          sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortHead k="name">Project</SortHead>
            <SortHead k="org" className="w-60">Organization</SortHead>
            <SortHead k="open" className="w-24 text-right">Open</SortHead>
            <SortHead k="done" className="w-24 text-right">Done</SortHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => {
            const s = stats.get(p.id);
            const rowIsPersonal = isPersonal(p);
            return (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <TableCell className="py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <FolderKanban className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-foreground truncate">{p.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  {rowIsPersonal ? (
                    <Badge variant="secondary" className="text-[10px]">Personal</Badge>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {orgEntry(p)?.name ?? "Org"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">{s?.open ?? 0}</TableCell>
                <TableCell className="py-2 text-right tabular-nums text-muted-foreground">{s?.done ?? 0}</TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/projects/${p.id}`)}>
                      Open
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="text-muted-foreground">
                      <Link href={`/projects/${p.id}/settings`}>
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectHubCard({
  project,
  stat,
  orgMap,
}: {
  project: ProjectWithRole;
  stat?: Stat;
  orgMap: OrgMap;
}) {
  const router = useRouter();
  const preview = stat?.preview ?? [];
  const open = stat?.open ?? 0;
  const done = stat?.done ?? 0;
  const org = project.organizationId ? orgMap.get(project.organizationId) : null;
  const isPersonal = org?.isPersonal === true;
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
              {isPersonal ? (
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

        <div className="rounded-lg border border-border bg-muted/20 p-2.5 flex-1">
          {!stat ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : preview.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic py-1 px-1">
              {done > 0 ? "All tasks done." : "No tasks yet."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {preview.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-0.5">
                  <Circle className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
              {open > preview.length && (
                <li className="text-[11px] text-muted-foreground/70 px-1 pt-0.5">+{open - preview.length} more</li>
              )}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Circle className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">{open}</span> open
          </span>
          <span className="flex items-center gap-1">
            <CircleCheck className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">{done}</span> done
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
