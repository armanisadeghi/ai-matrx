"use client";

/**
 * OrgResourceRoleSection
 * ----------------------
 * Renders one content-role bucket (Utilities / Sources / Outputs / Workspaces)
 * as a labelled section with a grid of resource tiles. Tiles show a live count
 * and, on click, either open the dedicated org list page or the contribute flow
 * (decided by the parent via `onOpen`).
 */

import React from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getContentRole,
  type ContentRole,
  type OrgResourceEntry,
} from "../resource-catalogue";

interface OrgResourceRoleSectionProps {
  role: ContentRole;
  entries: OrgResourceEntry[];
  counts: Record<string, number | null>;
  loading: boolean;
  onOpen: (entry: OrgResourceEntry) => void;
  /** Quick "share yours" affordance. Omit (e.g. project/task containers, where
   *  association is FK-direct, not org sharing) to hide the per-tile + button. */
  onContribute?: (entry: OrgResourceEntry) => void;
}

export function OrgResourceRoleSection({
  role,
  entries,
  counts,
  loading,
  onOpen,
  onContribute,
}: OrgResourceRoleSectionProps) {
  const meta = getContentRole(role);
  if (entries.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${meta.accentBar}`} />
          <h3 className="text-sm font-semibold text-foreground">{meta.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          {meta.tagline}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {entries.map((entry) => {
          const Icon = entry.icon;
          const count = counts[entry.key];
          const contributable =
            entry.shareKey !== null && entry.table !== null && entry.titleColumn !== null;
          return (
            <div
              key={entry.key}
              className="group relative rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-accent/40 transition-all overflow-hidden"
            >
              {/* role accent bar */}
              <span className={`absolute inset-x-0 top-0 h-0.5 ${meta.accentBar} opacity-60`} />
              <button
                onClick={() => onOpen(entry)}
                className="w-full text-left p-3.5 flex flex-col gap-2 cursor-pointer"
                title={entry.description}
              >
                <div className="flex items-center justify-between">
                  <span className={`h-9 w-9 rounded-lg flex items-center justify-center ${meta.accentBg} ${meta.accentText}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {loading ? (
                    <span className="h-5 w-8 rounded bg-muted animate-pulse" />
                  ) : count === null ? (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      —
                    </Badge>
                  ) : (
                    <span className="text-lg font-semibold tabular-nums text-foreground">
                      {count}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground leading-tight">
                  {entry.labelPlural}
                </span>
              </button>

              {contributable && onContribute && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onContribute(entry);
                  }}
                  className="absolute bottom-2 right-2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
                  title={`Share your ${entry.labelPlural.toLowerCase()} with the team`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
