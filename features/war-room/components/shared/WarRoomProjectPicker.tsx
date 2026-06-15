"use client";

// features/war-room/components/shared/WarRoomProjectPicker.tsx
//
// Pick ANY of the user's projects, across orgs — a flat, org-agnostic project
// picker for the War Room project-flavor flows (create a project thread, link a
// room to a project, open a room from a project).
//
// Why not the canonical EntityTargetPicker kind="project"? That one is
// ORG-SCOPED — it resolves `orgId = props.organizationId ?? activeOrgId` and
// shows "Select an organization first" when neither is set, so it can't express
// "pick any of my projects regardless of org" (and War Room rooms often have no
// active org). This reads the full cross-org list from useUserProjects() (which
// flattens every org in the user's nav tree, personal org included) and presents
// it directly with a search box.

import { useState } from "react";
import { FolderKanban, Check, ChevronDown, Search, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useUserProjects } from "@/features/projects/hooks";
import { cn } from "@/lib/utils";

export function WarRoomProjectPicker({
  value,
  onSelect,
  placeholder = "Choose a project…",
  allowClear = true,
  className,
}: {
  value: string | null;
  onSelect: (projectId: string | null, projectName: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  className?: string;
}) {
  const { projects, loading } = useUserProjects();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = projects.find((p) => p.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q))
    : projects;

  return (
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
            className,
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
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Loading projects…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {projects.length === 0 ? "No projects yet." : "No match."}
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
        {allowClear && value ? (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => {
                onSelect(null, null);
                setOpen(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
              Clear selection
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
