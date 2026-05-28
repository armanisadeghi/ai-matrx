"use client";

import React, { useMemo, useState } from "react";
import { FolderKanban, X, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllProjects } from "@/features/agent-context/redux/projectsSlice";

import { useSkillProjects } from "../hooks/useSkillProjects";

interface SkillProjectAssociationsProps {
  skillId: string;
  /** When false the chips render but the picker is hidden — useful for the
   * read-only detail view. */
  editable?: boolean;
}

/** Multi-project membership for a single skill. Reads project metadata from
 * the agent-context projects slice (canonical source) and writes through the
 * `useSkillProjects` hook, which posts to `skl_skill_projects` via the
 * Python backend. */
export function SkillProjectAssociations({
  skillId,
  editable = true,
}: SkillProjectAssociationsProps) {
  const { projectIds, associate, disassociate } = useSkillProjects(skillId);
  const allProjects = useAppSelector(selectAllProjects);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const projectsById = useMemo(() => {
    const map: Record<string, (typeof allProjects)[number]> = {};
    for (const p of allProjects) map[p.id] = p;
    return map;
  }, [allProjects]);

  const associated = projectIds
    .map((id) => projectsById[id])
    .filter(Boolean);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selected = new Set(projectIds);
    return allProjects
      .filter((p) => !selected.has(p.id))
      .filter((p) => {
        if (!q) return true;
        const name = (p.name ?? "").toLowerCase();
        return name.includes(q);
      })
      .slice(0, 50);
  }, [allProjects, projectIds, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" />
        Projects
        <span className="text-muted-foreground/70 tabular-nums">
          ({associated.length})
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {associated.length === 0 ? (
          <span className="text-xs text-muted-foreground/80">
            Not assigned to any project.
          </span>
        ) : (
          associated.map((p) => (
            <Badge
              key={p.id}
              variant="secondary"
              className="gap-1 pr-1 font-normal"
            >
              <span className="truncate max-w-[180px]">{p.name}</span>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => disassociate(p.id)}
                  className={cn(
                    "inline-flex items-center justify-center h-4 w-4 rounded",
                    "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}

        {editable && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs",
                  "border border-dashed border-border text-muted-foreground",
                  "hover:bg-accent hover:text-foreground transition-colors",
                )}
              >
                <Plus className="h-3 w-3" />
                Add project
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-8 mb-2"
              />
              <div className="max-h-56 overflow-y-auto scrollbar-thin">
                {available.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {search ? "No matches." : "All projects associated."}
                  </div>
                ) : (
                  available.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={async () => {
                        await associate(p.id);
                        setSearch("");
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full text-left text-sm px-2 py-1.5 rounded",
                        "hover:bg-accent transition-colors",
                      )}
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
