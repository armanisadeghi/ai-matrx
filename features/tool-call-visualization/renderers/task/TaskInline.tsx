"use client";

import { useMemo } from "react";
import { SquareCheckBig, PanelRight, ExternalLink, Maximize2 } from "lucide-react";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { formatDateOnly } from "@/utils/dateOnly";
import type { ToolRendererProps } from "../../types";
import { parseSingleTask } from "./parseTask";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for the `task` tool (a real ctx_tasks row) — a polished entity
 * card. Loads the live task (`useEnsureTaskLoaded`), opens the canonical
 * `TaskEditor` in a window or the `/tasks/[id]` route via the "Open in" menu.
 */
function statusKind(status: string | null | undefined): "done" | "doing" | "open" {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "done" || s === "complete") return "done";
  if (s === "in_progress" || s === "in progress" || s === "doing") return "doing";
  return "open";
}

export function TaskInline({ entry, onOpenOverlay , expanded, onToggleExpanded }: ToolRendererProps) {
  const parsed = useMemo(() => parseSingleTask(entry), [entry]);
  const taskId = parsed.id;
  const { task } = useEnsureTaskLoaded(taskId ?? "");
  const openWindow = useOpenTaskEditorWindow();

  if (!taskId) return null;

  const title = task?.title ?? parsed.title ?? "Task";
  const status = task?.status ?? parsed.status;
  const priority = (task?.priority ?? parsed.priority)?.toLowerCase() ?? null;
  const due = task?.due_date ?? null;
  const description = task?.description ?? null;
  const kind = statusKind(status);

  const subtitleParts = [
    kind === "done" ? "Done" : kind === "doing" ? "In progress" : "To do",
  ];
  if (priority)
    subtitleParts.push(priority.charAt(0).toUpperCase() + priority.slice(1));
  if (due) subtitleParts.push(`due ${formatDateOnly(due)}`);

  const actions: EntityAction[] = [
    {
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => openWindow({ taskId }),
    },
    { label: "Open in new tab", icon: ExternalLink, href: `/tasks/${taskId}` },
  ];
  if (onOpenOverlay)
    actions.push({
      label: "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
      separatorBefore: true,
    });

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={SquareCheckBig}
      accent={kind === "done" ? "green" : "blue"}
      title={title}
      subtitle={subtitleParts.join(" · ")}
      actions={actions}
    >
      {description ? (
        <div className="line-clamp-3 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {description}
        </div>
      ) : null}
    </EntityCard>
  );
}
