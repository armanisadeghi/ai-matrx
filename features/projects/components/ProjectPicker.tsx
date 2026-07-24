"use client";

// features/projects/components/ProjectPicker.tsx
//
// Canonical flat project picker. It can show every project the user can access
// or every project in one organization. The entire result set is rendered in
// one searchable, scrollable popover — there is no pagination or secondary
// "load more" step.
//
// Creation uses the shared CreateProject WindowPanel. Callers can request a
// visible "New" button beside the trigger; the action remains inside the
// popover as well so compact surfaces do not lose it.

import { useState } from "react";
import {
  FolderKanban,
  Check,
  ChevronDown,
  Search,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useUserProjects } from "@/features/projects/hooks";
import { useOpenCreateProjectWindow } from "@/features/overlays/openers/createProjectWindow";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export interface ProjectPickerProps {
  value: string | null;
  onSelect: (projectId: string | null, projectName: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
  /**
   * Omit to show projects across every organization. Pass an organization id
   * to show all projects in that organization. Pass null while org context is
   * unavailable; the picker stays empty and creation asks for org selection.
   */
  organizationId?: string | null;
  /** Show a persistent New button beside the dropdown trigger. */
  showCreateButton?: boolean;
}

export function ProjectPicker({
  value,
  onSelect,
  placeholder = "Choose a project…",
  allowClear = true,
  className,
  organizationId,
  showCreateButton = false,
}: ProjectPickerProps) {
  const { projects, loading, refresh } = useUserProjects();
  const openCreateProject = useOpenCreateProjectWindow();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // A just-created project may not be in the nav-tree list yet (the refetch is
  // async). Hold its id+name so the trigger labels correctly until the list
  // catches up, at which point `projects.find` takes over and this self-heals.
  const [optimistic, setOptimistic] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const availableProjects =
    organizationId === undefined
      ? projects
      : organizationId === null
        ? []
        : projects.filter(
            (project) => project.organizationId === organizationId,
          );
  const selected =
    availableProjects.find((p) => p.id === value) ??
    (optimistic && optimistic.id === value ? optimistic : null);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? availableProjects.filter((p) => p.name.toLowerCase().includes(q))
    : availableProjects;

  const handleCreateProject = () => {
    if (organizationId === null) {
      toast.info("Select an organization before creating a project.");
      return;
    }
    setOpen(false);
    setQuery("");
    openCreateProject({
      initialOrgId: organizationId,
      orgLocked: organizationId !== undefined,
      onCreated: (e) => {
        setOptimistic({ id: e.project.id, name: e.project.name });
        onSelect(e.project.id, e.project.name);
      },
    });
  };

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex w-full items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {selected ? selected.name : placeholder}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              // 16px prevents the iOS focus-zoom on responsive web.
              style={{ fontSize: "16px" }}
              aria-label="Search projects"
            />
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Refresh projects"
              aria-label="Refresh projects"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Loading projects…
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {organizationId === null
                  ? "Select an organization first."
                  : availableProjects.length === 0
                    ? "No projects yet."
                    : "No match."}
              </p>
            ) : (
              filtered.map((p) => {
                const active = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelect(p.id, p.name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                      active && "bg-accent/60",
                    )}
                  >
                    <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {p.name}
                    </span>
                    {active ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          {!showCreateButton || (allowClear && value) ? (
            <div className="border-t border-border p-1">
              {!showCreateButton ? (
                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Plus className="size-3.5 shrink-0 text-primary" />
                  Create new project
                </button>
              ) : null}
              {allowClear && value ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null, null);
                    setOptimistic(null);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                  Clear selection
                </button>
              ) : null}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {showCreateButton ? (
        <button
          type="button"
          onClick={handleCreateProject}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label="Create a new project"
        >
          <Plus className="size-3.5 text-primary" />
          New
        </button>
      ) : null}
    </div>
  );
}
