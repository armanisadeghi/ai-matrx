"use client";

// features/war-room/components/tile/TileTaskTab.tsx
//
// The Task tab is the real task editor (`features/tasks/components/TaskEditor`)
// bound to the tile's task_id (embedded mode) — same name / description /
// priority / due / assignee / tags / attachments / comments the /tasks route
// uses, properly spaced. Tile-specific UX layered on top:
//
//   • Fast creation (Feature 3): no task → "Click to add a task" prompt that,
//     on click, drops straight into an AUTO-FOCUSED label input. Nothing is
//     saved until the user types — create fires on Enter or on blur-with-
//     content, then the typed label is written to the freshly-created task.
//
//   • Subtask experience (Feature 4): drill into subtasks in-place via the same
//     TaskEditor — back pops to the parent; overlay window remains the fallback
//     outside tiles.
//
// This component renders both as the dedicated "task" tab (full height) and
// inside the combined "All" view (a bounded box), so the layout is driven by
// the tile's @container size — never by a prop.

import { useState } from "react";
import { ListChecks, ListTree, Loader2, X } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import {
  selectTileFlavor,
  selectTileTaskId,
} from "@/features/war-room/redux/selectors";
import { createTileTask } from "@/features/war-room/redux/thunks";
import { updateTaskFieldThunk } from "@/features/tasks/redux/thunks";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { cn } from "@/lib/utils";
import { useTaskDrillStack } from "@/features/war-room/hooks/useTaskDrillStack";
import { TileEmbeddedTaskView } from "./TileEmbeddedTaskView";
import { TileProjectTab } from "./TileProjectTab";
import { SubtaskRail } from "./SubtaskRail";

export function TileTaskTab({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));

  // A project tile's Task tab is the PROJECT's task list (browse + create +
  // open), not the single-anchor task editor that thread/task tiles use.
  if (flavor === "project") {
    return <TileProjectTab tileId={tileId} compact={compact} />;
  }

  return <TileTaskTabAnchored tileId={tileId} compact={compact} />;
}

function TileTaskTabAnchored({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const taskId = useAppSelector((s) => selectTileTaskId(tileId)(s));
  const task = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId) : undefined,
  );

  // ── No task yet → fast inline creation (Feature 3) ───────────────────────
  if (!taskId) {
    return <TileTaskCreate tileId={tileId} compact={compact} />;
  }

  // Task linked but not yet hydrated into the slice → brief loading.
  if (!task) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TileTaskTabAnchoredBody
      taskId={taskId}
      taskTitle={task.title}
      projectId={task.project_id ?? null}
      compact={compact}
    />
  );
}

function TileTaskTabAnchoredBody({
  taskId,
  taskTitle,
  projectId,
  compact,
}: {
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  compact?: boolean;
}) {
  const drill = useTaskDrillStack();

  if (drill.isDrilled && drill.currentTaskId) {
    return (
      <TileEmbeddedTaskView
        taskId={drill.currentTaskId}
        projectId={projectId}
        compact={compact}
        drillStack={drill.stack}
        rootSegment={{ label: taskTitle.trim() || "Task" }}
        onBack={drill.pop}
        onPopToRoot={drill.reset}
        onPopTo={drill.popTo}
        onDrillTask={drill.push}
      />
    );
  }

  return (
    <TileTaskBody
      taskId={taskId}
      projectId={projectId}
      compact={compact}
      onDrillTask={drill.push}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Feature 3 — fast task creation
 * ──────────────────────────────────────────────────────────────────────── */

function TileTaskCreate({
  tileId,
  compact,
}: {
  tileId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  // `prompt` → show the affordance; `entry` → auto-focused label input.
  const [mode, setMode] = useState<"prompt" | "entry">("prompt");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const newId = await dispatch(createTileTask(tileId));
      // createTileTask defaults the title to "New task"; stamp the real label.
      if (typeof newId === "string" && newId) {
        await dispatch(
          updateTaskFieldThunk({ taskId: newId, patch: { title: trimmed } }),
        );
      }
      // Don't reset busy — the tile now has a task_id and this view unmounts.
    } catch {
      setBusy(false);
    }
  };

  if (mode === "prompt") {
    return (
      <div className={cn("grid h-full place-items-center", !compact && "px-4")}>
        <button
          type="button"
          onClick={() => setMode("entry")}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-muted-foreground transition-colors",
            "hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-muted/60">
            <ListChecks className="size-5" />
          </span>
          <span className="text-xs font-medium">Click to add a task</span>
        </button>
      </div>
    );
  }

  // Entry — auto-focused label input; no save until content (Enter / blur).
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 py-2",
          compact ? "px-0" : "px-3",
        )}
      >
        <ListChecks className="size-4 shrink-0 text-primary" />
        <input
          // Autofocus so the user types immediately — no extra clicks.
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            } else if (e.key === "Escape") {
              setTitle("");
              setMode("prompt");
            }
          }}
          onBlur={() => {
            if (title.trim()) void create();
          }}
          placeholder="Name this task, press Enter…"
          disabled={busy}
          className="h-7 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          style={{ fontSize: "16px" }}
          aria-label="New task name"
        />
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // keep input from blurring first
            onClick={() => {
              setTitle("");
              setMode("prompt");
            }}
            title="Cancel"
            aria-label="Cancel"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className={cn("grid flex-1 place-items-center", !compact && "px-4")}>
        <p className="text-xs text-muted-foreground">
          {busy ? "Creating task…" : "Press Enter to create, Esc to cancel."}
        </p>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Task body — real editor + Feature 4 subtask experience
 * ──────────────────────────────────────────────────────────────────────── */

function TileTaskBody({
  taskId,
  projectId,
  compact,
  onDrillTask,
}: {
  taskId: string;
  projectId: string | null;
  compact?: boolean;
  onDrillTask: (taskId: string) => void;
}) {
  const openTaskWindow = useOpenTaskEditorWindow();
  const [railOpen, setRailOpen] = useState(false);
  const [railAutoFocus, setRailAutoFocus] = useState(false);

  const showRail = railOpen;

  return (
    <div className="flex h-full min-h-0 flex-col @container/task">
      <div className="flex min-h-0 flex-1 @[34rem]/task:flex-row">
        <div className="min-h-0 min-w-0 flex-1">
          <TaskEditor
            taskId={taskId}
            embedded
            compact={compact}
            key={taskId}
            onOpenLinkedTask={onDrillTask}
            footerAppend={
              <Button
                type="button"
                size="sm"
                variant={showRail ? "secondary" : "ghost"}
                onClick={() => {
                  if (showRail) {
                    setRailOpen(false);
                    setRailAutoFocus(false);
                  } else {
                    setRailOpen(true);
                    setRailAutoFocus(true);
                  }
                }}
                className="h-6 w-6 shrink-0 p-0"
                aria-pressed={showRail}
                title={showRail ? "Hide subtasks" : "Add / open subtasks"}
                aria-label={showRail ? "Hide subtasks" : "Add / open subtasks"}
              >
                <ListTree className="size-3.5" />
              </Button>
            }
          />
        </div>

        {showRail && (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col border-t border-border/60",
              "max-h-[55%] shrink-0 @[34rem]/task:max-h-none @[34rem]/task:w-72 @[34rem]/task:shrink-0 @[34rem]/task:border-l @[34rem]/task:border-t-0",
            )}
          >
            <SubtaskRail
              taskId={taskId}
              projectId={projectId}
              onOpenPane={onDrillTask}
              onOpenWindow={(id) => openTaskWindow({ taskId: id })}
              autoFocus={railAutoFocus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
