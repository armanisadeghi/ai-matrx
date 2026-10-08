"use client";

import { UntrustedCount } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import React, { useState } from "react";
import { EngagementPicker } from "@/features/scopes/components/active-context/engagement/EngagementPicker";
import {
  EMPTY_ENGAGEMENT_SELECTION,
  type EngagementSelection,
} from "@/features/scopes/components/active-context/quick-pick/engine";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { FolderKanban } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ReadFailure } from "@ai-matrx/design-system";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";

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
    useState<EngagementSelection>(EMPTY_ENGAGEMENT_SELECTION);
  const dispatch = useAppDispatch();
  // Two reads feed this window: the organization list (the picker) and the
  // project hierarchy (the rows). Either failing is said, never read as
  // "choose an organization" or "no projects".
  const { flatProjects, isLoading: projectsLoading, isError: projectsFailed, error: projectsError } = useNavTree();

  // Every project the person can reach, across all organizations. The picker is
  // an optional filter that starts at "All organizations".
  const activeProjects = selection.organizationId
    ? flatProjects.filter((p) => p.org_id === selection.organizationId)
    : flatProjects;

  return (
    <div className="flex flex-col min-h-0 h-full bg-card">
      <div className="px-2 py-2 border-b shrink-0 bg-muted/10">
        <EngagementPicker
          rungs={["organization"]}
          emptyLabel="All organizations"
          value={selection}
          onChange={setSelection}
        />
      </div>

      <div className="px-2 py-2 border-b shrink-0 bg-muted/5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Projects (
          <UntrustedCount
            value={activeProjects.length}
            read={readOf({ isLoading: projectsLoading, isError: projectsFailed, error: projectsError })}
            label="Projects"
          />
          )
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {projectsFailed && activeProjects.length === 0 ? (
          <ReadFailure
            error={projectsError ?? true}
            what="your projects"
            onRetry={() => void dispatch(invalidateAndRefetchFullContext())}
          />
        ) : projectsLoading && activeProjects.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground" role="status" aria-busy="true">
            Loading projects…
          </div>
        ) : activeProjects.length > 0 ? (
          activeProjects.map((project) => (
            <CompactProjectItem key={project.id} project={project} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground px-4">
            <FolderKanban className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No projects found</p>
          </div>
        )}
      </div>
    </div>
  );
}
