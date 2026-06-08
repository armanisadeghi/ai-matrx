"use client";

import React, { useMemo, useState } from "react";
import { FolderOpen, Loader2, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { idMatchesQuery } from "@/utils/search-scoring";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { useResources } from "../../hooks/useResources";

type ResourceItem = ReturnType<typeof useResources>["resources"][number];

const RESOURCE_TYPES = [
  "all",
  "script",
  "reference",
  "asset",
  "template",
  "example",
] as const;
type ResourceFilter = (typeof RESOURCE_TYPES)[number];

export function ResourcesSection() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ResourceFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<ResourceItem | null>(null);
  const { resources, loading, error, remove } = useResources();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (typeFilter !== "all" && r.resourceType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.filename.toLowerCase().includes(q) ||
        (r.content ?? "").toLowerCase().includes(q) ||
        idMatchesQuery(r, q)
      );
    });
  }, [resources, search, typeFilter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search resources..."
      />
      <div className="flex items-center gap-1 px-4 pb-2 shrink-0">
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={cn(
              "text-xs h-6 px-2 rounded-md transition-colors capitalize",
              typeFilter === t
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && resources.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading resources…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
            <h3 className="text-sm font-semibold text-foreground mt-2">
              {resources.length === 0
                ? "No resources yet"
                : "No matches"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Resources are scripts, references, and assets attached to
              skills. They load only when the skill is invoked.
            </p>
          </div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className="group flex items-start gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-muted/40 transition-colors"
            >
              <FileText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {r.filename}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground capitalize">
                    {r.resourceType}
                  </span>
                  {r.mimeType && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {r.mimeType}
                    </span>
                  )}
                  {r.storagePath && (
                    <span className="text-xs text-muted-foreground truncate">
                      {r.storagePath}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(r)}
                className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-all"
                aria-label="Delete resource"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      <SectionFooter
        description="Supporting files — scripts, references, templates, examples — that skills load on invocation. Create and edit flows coming with the DetailEditor rollout."
        learnMoreLabel="Learn more about resources"
        learnMoreHref="#"
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete resource"
        description={
          deleteTarget ? (
            <>
              Delete resource <b>{deleteTarget.filename}</b>?
            </>
          ) : null
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            remove(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

export default ResourcesSection;
