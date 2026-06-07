"use client";

/**
 * TaskAssociatedResources — resources linked to a task by FK (task_id), grouped
 * by content role with peek/open. Same container primitive the project workspace
 * uses (useContainerInventory + OrgResourceRoleSection + ContainerResourceSheet),
 * just keyed on task_id. Collapses to nothing when the task has no FK resources.
 */

import React from "react";
import { Boxes } from "lucide-react";
import {
  CONTENT_ROLES,
  entriesByRole,
  type OrgResourceEntry,
} from "@/features/organizations/resource-catalogue";
import { useContainerInventory } from "@/features/organizations/hooks/useContainerInventory";
import { OrgResourceRoleSection } from "@/features/organizations/components/OrgResourceRoleSection";
import { ContainerResourceSheet } from "@/features/organizations/components/ContainerResourceSheet";

// Tasks/projects have their own surfaces; don't list them as task "resources".
const EXCLUDE = new Set(["task", "project"]);

export function TaskAssociatedResources({ taskId }: { taskId: string }) {
  const { counts, loading } = useContainerInventory({ column: "task_id", value: taskId });
  const [sheetEntry, setSheetEntry] = React.useState<OrgResourceEntry | null>(null);

  const total = Object.entries(counts).reduce<number>(
    (sum, [k, c]) => (EXCLUDE.has(k) ? sum : sum + (typeof c === "number" ? c : 0)),
    0,
  );

  // Hide entirely once loaded with nothing linked — keeps the editor uncluttered.
  if (!loading && total === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Boxes className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Associated resources</h3>
        <span className="text-xs text-muted-foreground">Linked to this task</span>
      </div>
      <div className="space-y-4">
        {CONTENT_ROLES.map((r) => {
          const entries = entriesByRole(r.id).filter(
            (e) => !EXCLUDE.has(e.key) && typeof counts[e.key] === "number" && (counts[e.key] as number) > 0,
          );
          if (entries.length === 0) return null;
          return (
            <OrgResourceRoleSection
              key={r.id}
              role={r.id}
              entries={entries}
              counts={counts}
              loading={loading}
              onOpen={(entry) => setSheetEntry(entry)}
            />
          );
        })}
      </div>

      <ContainerResourceSheet
        open={sheetEntry !== null}
        onOpenChange={(o) => !o && setSheetEntry(null)}
        entry={sheetEntry}
        column="task_id"
        value={taskId}
      />
    </section>
  );
}
