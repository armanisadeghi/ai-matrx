"use client";

import React, { useState } from "react";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import {
  EMPTY_SELECTION,
  type HierarchySelection,
} from "@/features/agent-context/components/hierarchy-selection/types";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { FolderKanban } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";

function CompactProjectItem({
  project,
}: {
  project: { id: string; name: string };
}) {
  return (
    <EntityRef
      token="project"
      id={project.id}
      name={project.name}
      fill
      className="flex w-full rounded-md border p-2 text-sm transition-colors hover:bg-muted/50"
      labelClassName="font-medium"
    />
  );
}

export function ProjectsWorkspace() {
  const [selection, setSelection] =
    useState<HierarchySelection>(EMPTY_SELECTION);
  const { flatProjects } = useNavTree();

  const activeProjects = selection.organizationId
    ? flatProjects.filter((p) => p.org_id === selection.organizationId)
    : [];

  return (
    <div className="flex flex-col min-h-0 h-full bg-card">
      <div className="px-2 py-2 border-b shrink-0 bg-muted/10">
        <HierarchyCascade
          levels={["organization"]}
          value={selection}
          onChange={setSelection}
          layout="vertical"
        />
      </div>

      <div className="px-2 py-2 border-b shrink-0 bg-muted/5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Projects ({activeProjects.length})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {selection.organizationId ? (
          activeProjects.length > 0 ? (
            activeProjects.map((project) => (
              <CompactProjectItem key={project.id} project={project} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground px-4">
              <FolderKanban className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">No projects found</p>
              <p className="text-xs mt-1">
                Create one using the dropdown above.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground px-4">
            <FolderKanban className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Select an organization to view projects</p>
          </div>
        )}
      </div>
    </div>
  );
}
