"use client";

/**
 * TileProjectTab — project-flavored tile first tab.
 *
 * Root: editable project fields + task list (create, toggle, drill in).
 * Drill: same TaskEditor stack as task threads (task → subtask → …).
 */

import Link from "next/link";
import { ExternalLink, FolderKanban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectUserRole } from "@/features/projects/hooks";
import {
  InlineProjectDescription,
  InlineProjectName,
  ProjectMetaRow,
} from "@/features/projects/components/ProjectInlineEditors";
import { useTileProject } from "@/features/war-room/hooks/useTileProject";
import { useTaskDrillStack } from "@/features/war-room/hooks/useTaskDrillStack";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import { TileProjectTaskList } from "./TileProjectTaskList";
import { TileEmbeddedTaskView } from "./TileEmbeddedTaskView";
import { cn } from "@/lib/utils";

export function TileProjectTab({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const { projectId, project, loading, isProjectTile, applyPatch } =
    useTileProject(tileId);
  const drill = useTaskDrillStack();
  const { canManageSettings } = useProjectUserRole(projectId ?? undefined);

  if (!isProjectTile) return null;

  if (!projectId) {
    return (
      <div
        className={cn(
          "grid h-full place-items-center text-center",
          !compact && "px-6",
        )}
      >
        <div className="flex max-w-[18rem] flex-col items-center gap-2">
          <span className="grid size-10 place-items-center rounded-full bg-muted/60">
            <FolderKanban className="size-5 text-muted-foreground" />
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            No project linked
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Link this tile to a project to manage it and its tasks here.
          </p>
        </div>
      </div>
    );
  }

  if (drill.isDrilled && drill.currentTaskId) {
    return (
      <TileEmbeddedTaskView
        taskId={drill.currentTaskId}
        projectId={projectId}
        compact={compact}
        drillStack={drill.stack}
        rootSegment={{
          label: project?.name?.trim() || "Project",
        }}
        onBack={drill.pop}
        onPopToRoot={drill.reset}
        onPopTo={drill.popTo}
        onDrillTask={drill.push}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TileProjectOverview
        projectId={projectId}
        project={project}
        loading={loading}
        compact={compact}
        canEdit={canManageSettings}
        onPatch={applyPatch}
      />
      <div className="min-h-0 flex-1 border-t border-border/60">
        <TileProjectTaskList
          tileId={tileId}
          compact={compact}
          hideProjectHeader
          onOpenTask={drill.push}
        />
      </div>
    </div>
  );
}

function TileProjectOverview({
  projectId,
  project,
  loading,
  compact,
  canEdit,
  onPatch,
}: {
  projectId: string;
  project: ReturnType<typeof useTileProject>["project"];
  loading: boolean;
  compact?: boolean;
  canEdit: boolean;
  onPatch: (patch: Partial<NonNullable<typeof project>>) => void;
}) {
  if (!project) {
    return (
      <div className="grid shrink-0 place-items-center py-6">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "shrink-0 overflow-y-auto border-b border-border/60 bg-card/40",
        compact ? "max-h-[42%] px-0 py-2" : "max-h-[45%] px-3 py-3",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-primary/70 text-primary">
          <FolderKanban className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {loading ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <InlineProjectName
                project={project}
                canEdit={canEdit}
                onPatch={onPatch}
                size={compact ? "inline" : "inline"}
              />
            )}
          </div>

          <ProjectMetaRow
            project={project}
            canEdit={canEdit}
            onPatch={onPatch}
            showOrg={!compact}
          />

          <InlineProjectDescription
            project={project}
            canEdit={canEdit}
            onPatch={onPatch}
          />
        </div>
      </div>

      <div
        className={cn(
          "mt-2 flex flex-wrap items-center gap-1.5",
          compact ? "pl-0" : "pl-9",
        )}
      >
        <ProjectCopyForAiButton
          projectId={projectId}
          projectName={project.name}
          location="War Room — project tile"
          size="sm"
          className="h-7 border border-border/60 px-2 hover:bg-accent"
        />
        <Button
          asChild
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
        >
          <Link href={`/projects/${projectId}`}>
            <ExternalLink className="size-3" />
            Full workspace
          </Link>
        </Button>
      </div>
    </div>
  );
}
