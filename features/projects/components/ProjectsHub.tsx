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
  Filter,
  X,
  ListFilter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { useOpenCreateProjectWindow } from "@/features/window-panels/windows/projects/useOpenCreateProjectWindow";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Stat = {
  open: number;
  done: number;
  preview: { id: string; title: string }[];
};
type ViewMode = "cards" | "table";
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

  // Open the app-wide create-project window (Manual + Use AI). Refresh the
  // self-fetched list both on a manual create and when the AI agent creates one
  // server-side (the agent writes directly to the DB).
  const handleCreate = React.useCallback(() => {
    console.log(
      "[Track New Project] 1, ProjectsHub.tsx — New project button → handleCreate",
    );
    openCreateProject({
      onCreated: refresh,
      onAiCreated: refresh,
    });
  }, [openCreateProject, refresh]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("ctx_projects")
        .select(
          "id, name, slug, description, organization_id, created_by, updated_at, status, priority, start_date, target_date",
        )
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
  const [scopeProjectIds, setScopeProjectIds] =
    React.useState<Set<string> | null>(null);
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
          new Set(
            (data ?? []).map((r) =>
              String((r as { entity_id: string }).entity_id),
            ),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scopeParam]);

  const filtered = React.useMemo(() => {
    let list = projects;
    if (orgFilterId)
      list = list.filter((p) => p.organizationId === orgFilterId);
    if (scopeProjectIds) list = list.filter((p) => scopeProjectIds.has(p.id));
    const q = query.trim().toLowerCase();
    if (q)
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || idMatchesQuery(p, q),
      );
    return list;
  }, [projects, orgFilterId, scopeProjectIds, query]);

  const isFiltered = Boolean(orgParam || scopeParam);
  // Strips ?org= / ?scope= by navigating to the bare list — the single,
  // discoverable escape hatch out of every filtered view.
  const clearFilter = React.useCallback(
    () => router.push("/projects"),
    [router],
  );
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
      : "Longer-running containers for your tasks, resources, and scopes";

  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured pt-3">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5 pr-14 md:pr-6">
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
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New project
            </Button>
          </div>
        </div>

        {isFiltered && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
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
                  className="rounded hover:bg-accent p-0.5"
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
                  className="rounded hover:bg-accent p-0.5"
                  onClick={clearFilter}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs ml-auto"
              onClick={clearFilter}
            >
              Show all projects
            </Button>
          </div>
        )}

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
              {query || isFiltered
                ? "Nothing matches your filters."
                : "Create a project to organize tasks, resources, and context."}
            </p>
            <div className="flex items-center justify-center gap-2">
              {isFiltered && (
                <Button size="sm" variant="outline" onClick={clearFilter}>
                  <Filter className="h-4 w-4 mr-1.5" />
                  Show all projects
                </Button>
              )}
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                New project
              </Button>
            </div>
          </Card>
        ) : view === "table" ? (
          <ProjectsTable projects={filtered} stats={stats} orgMap={orgMap} />
        ) : isFiltered || query ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectHubCard
                key={p.id}
                project={p}
                stat={stats.get(p.id)}
                orgMap={orgMap}
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
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
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

type UpdatedFilter =
  | "any"
  | "hour"
  | "today"
  | "week"
  | "month"
  | "quarter"
  | "year";

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
            "rounded p-0.5 transition-colors",
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
            className="text-xs text-muted-foreground hover:text-foreground"
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
        className="h-8 text-sm"
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

  React.useEffect(() => {
    setMinText(min !== undefined ? String(min) : "");
  }, [min]);
  React.useEffect(() => {
    setMaxText(max !== undefined ? String(max) : "");
  }, [max]);

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
            className="text-xs text-muted-foreground hover:text-foreground"
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
          className="h-7 text-xs w-[80px] tabular-nums"
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
          className="h-7 text-xs w-[80px] tabular-nums"
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
              "rounded px-2 py-1 text-left text-xs hover:bg-accent",
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
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] =
    React.useState<ProjectColumnFilters>(EMPTY_COLUMN_FILTERS);

  const orgEntry = (p: ProjectWithRole) =>
    p.organizationId ? (orgMap.get(p.organizationId) ?? null) : null;
  const orgLabel = (p: ProjectWithRole) => orgEntry(p)?.name ?? "—";

  const orgOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of projects) {
      if (!p.organizationId) continue;
      const name = orgMap.get(p.organizationId)?.name ?? "—";
      seen.set(p.organizationId, name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, orgMap]);

  const patchFilters = (patch: Partial<ProjectColumnFilters>) => {
    setColumnFilters((prev) => ({ ...prev, ...patch }));
  };

  const filtered = React.useMemo(() => {
    const nameQ = columnFilters.name.trim().toLowerCase();
    return projects.filter((p) => {
      if (nameQ && !p.name.toLowerCase().includes(nameQ)) return false;
      if (
        columnFilters.organizationId &&
        p.organizationId !== columnFilters.organizationId
      ) {
        return false;
      }
      const open = stats.get(p.id)?.open ?? 0;
      const done = stats.get(p.id)?.done ?? 0;
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
      if (!passesUpdatedFilter(p.updatedAt, columnFilters.updated)) {
        return false;
      }
      return true;
    });
  }, [projects, stats, columnFilters]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, stats, sortKey, sortDir]);

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

  const ColumnHead = ({
    k,
    children,
    className,
    align = "left",
    filter,
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
    align?: "left" | "right";
    filter: React.ReactNode;
  }) => (
    <TableHead className={className}>
      <div
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end w-full",
        )}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={cn(
            "inline-flex items-center gap-1 hover:text-foreground transition-colors",
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
            className="h-6 px-2 text-xs"
            onClick={() => setColumnFilters(EMPTY_COLUMN_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <ColumnHead
              k="name"
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
            </ColumnHead>
            <ColumnHead
              k="org"
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
                          className="text-xs text-muted-foreground hover:text-foreground"
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
                      <SelectTrigger className="h-8 text-sm">
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
            </ColumnHead>
            <ColumnHead
              k="open"
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
            </ColumnHead>
            <ColumnHead
              k="done"
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
            </ColumnHead>
            <ColumnHead
              k="updated"
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
            </ColumnHead>
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
                  className="cursor-pointer"
                  onClick={() => router.push(`/projects/${p.id}`)}
                >
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        <FolderKanban className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-foreground truncate">
                        {p.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {orgEntry(p)?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {s?.open ?? 0}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                    {s?.done ?? 0}
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/projects/${p.id}`)}
                      >
                        Open
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                      >
                        <Link href={`/projects/${p.id}/settings`}>
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
}: {
  project: ProjectWithRole;
  stat?: Stat;
  orgMap: OrgMap;
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
            <button
              onClick={() => router.push(href)}
              className="text-left block max-w-full group/title"
            >
              <h3 className="font-semibold text-base truncate group-hover/title:text-primary transition-colors">
                {project.name}
              </h3>
            </button>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              {org?.name ?? "—"}
            </div>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {project.description}
          </p>
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
                <li
                  key={t.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-0.5"
                >
                  <Circle className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="truncate">{t.title}</span>
                </li>
              ))}
              {open > preview.length && (
                <li className="text-[11px] text-muted-foreground/70 px-1 pt-0.5">
                  +{open - preview.length} more
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Circle className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">
              {open}
            </span>{" "}
            open
          </span>
          <span className="flex items-center gap-1">
            <CircleCheck className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground tabular-nums">
              {done}
            </span>{" "}
            done
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
