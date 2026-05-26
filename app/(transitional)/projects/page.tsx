"use client";

import React, { useState, useMemo } from "react";
import { Puzzle, Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUserProjects } from "@/features/projects/hooks";
import { ProjectList } from "@/features/projects/components/ProjectList";
import { ProjectCard } from "@/features/projects/components/ProjectCard";
import { ProjectFormSheet } from "@/features/projects/components/ProjectFormSheet";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { useHierarchyReduxBridge } from "@/features/agent-context/components/hierarchy-selection/useReduxBridge";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

/**
 * Standalone Projects Hub
 * Route: /projects
 *
 * Shows personal projects (create/manage here) and org projects (navigate to org to manage).
 */
export default function ProjectsPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { projects, loading, refresh } = useUserProjects();
  // Pull org metadata from the same nav-tree source that supplied `projects`.
  // Using a parallel `useUserOrganizations()` query here caused org cards to
  // race the org list — when it was still loading, `orgSlug` was undefined and
  // the card linked to `/projects/[id]` (the personal route), routing org
  // projects through the personal lookup and triggering "Project Not Found".
  const { orgs } = useNavTree();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const { value: ctxValue, onChange: ctxOnChange } = useHierarchyReduxBridge();

  const orgSlugById = useMemo(
    () => new Map(orgs.map((o) => [o.id, o.slug])),
    [orgs],
  );

  const orgProjects = projects.filter(
    (p) => !p.isPersonal && !!p.organizationId,
  );

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-2 border-b border-border bg-card">
        <HierarchyCascade
          levels={["organization"]}
          value={ctxValue}
          onChange={ctxOnChange}
        />
      </div>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Puzzle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Projects</h1>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading..."
                : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Personal Projects — full CRUD */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Personal Projects
            </h2>
          </div>
          <ProjectList canCreate />
        </section>

        {/* Org Projects — read-only listing */}
        {(orgProjects.length > 0 || loading) && (
          <>
            <Separator />
            <section>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Puzzle className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Organization Projects
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  Manage via the organization page
                </span>
              </div>
              {orgProjects.length > 0 && (
                <div className="space-y-3">
                  {orgProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      orgSlug={
                        project.organizationId
                          ? (orgSlugById.get(project.organizationId) ??
                            undefined)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <ProjectFormSheet
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={refresh}
        organizationId={activeOrgId ?? undefined}
      />
    </div>
  );
}
