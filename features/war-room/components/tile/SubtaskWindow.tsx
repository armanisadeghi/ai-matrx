"use client";

/**
 * @registry-status: inline-window
 * SubtaskWindow
 *
 * A floating, draggable War Room subtask editor. Wraps the canonical
 * `TaskEditor` (the SAME real task editing surface the parent task uses)
 * bound to a subtask's id, inside an inline `WindowPanel`.
 *
 * Rendered inline by `TileTaskTab` — not registered in `windowRegistry`
 * because its lifecycle is owned by the tile subtree (the `windowIds` list in
 * `TileTaskBody`'s local React state), not the overlay slice. Each open
 * subtask gets a
 * distinct `WindowPanel` id, so multiple subtask windows coexist and each
 * participates in the runtime Window Manager (minimize-all, focus, tray,
 * pop-out) like any other window. Closing one calls `onClose`, which is the
 * required close binding for an inline-managed panel.
 */

import { ListChecks } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export function SubtaskWindow({
  subtaskId,
  onClose,
}: {
  subtaskId: string;
  onClose: () => void;
}) {
  // Stagger windows slightly per id so a burst of "Open in window" clicks
  // doesn't perfectly overlap them. Cheap, stable, hydration-safe hash.
  const offset = (hashCode(subtaskId) % 6) * 28;
  const title = useAppSelector(
    (s) => selectTaskById(s, subtaskId)?.title || "Subtask",
  );

  return (
    <WindowPanel
      id={`war-room-subtask-${subtaskId}`}
      title={title}
      titleNode={
        <span className="flex items-center gap-1.5 min-w-0">
          <ListChecks className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
      }
      onClose={onClose}
      width={460}
      height={560}
      minWidth={340}
      minHeight={320}
      initialRect={{ x: 120 + offset, y: 96 + offset }}
      bodyClassName="p-0"
    >
      <TaskEditor taskId={subtaskId} embedded />
    </WindowPanel>
  );
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
