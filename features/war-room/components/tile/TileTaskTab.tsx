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
//   • Subtask experience (Feature 4): an enhanced `SubtaskRail` (rapid entry
//     with Enter-chaining, click-to-open, "⋯ → Open in window") replaces
//     reliance on the editor's buried list. Clicking a subtask opens the
//     `SubtaskDetailPane` (the same real editor bound to the subtask) beside
//     the parent on wide tiles / over it on narrow ones; "Open in window"
//     pops a floating, draggable `SubtaskWindow`. Several can be open at once.
//
// This component renders both as the dedicated "task" tab (full height) and
// inside the combined "All" view (a bounded box), so the layout is driven by
// the tile's @container size — never by a prop.

import { useEffect, useState } from "react";
import { ListChecks, ListTree, Loader2, Plus, X } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import {
  selectTileById,
  selectTileFlavor,
} from "@/features/war-room/redux/selectors";
import { createTileTask } from "@/features/war-room/redux/thunks";
import { updateTaskFieldThunk } from "@/features/tasks/redux/thunks";
import { cn } from "@/lib/utils";
import { SubtaskRail } from "./SubtaskRail";
import { SubtaskDetailPane } from "./SubtaskDetailPane";
import { SubtaskWindow } from "./SubtaskWindow";
import { TileProjectTaskList } from "./TileProjectTaskList";

export function TileTaskTab({ tileId }: { tileId: string }) {
  const flavor = useAppSelector((s) => selectTileFlavor(tileId)(s));

  // A project tile's Task tab is the PROJECT's task list (browse + create +
  // open), not the single-anchor task editor that thread/task tiles use.
  if (flavor === "project") {
    return <TileProjectTaskList tileId={tileId} />;
  }

  return <TileTaskTabAnchored tileId={tileId} />;
}

function TileTaskTabAnchored({ tileId }: { tileId: string }) {
  const tile = useAppSelector((s) => selectTileById(tileId)(s));
  const taskId = tile?.task_id ?? null;
  const task = useAppSelector((s) =>
    taskId ? selectTaskById(s, taskId) : undefined,
  );

  // ── No task yet → fast inline creation (Feature 3) ───────────────────────
  if (!taskId) {
    return <TileTaskCreate tileId={tileId} />;
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
    <TileTaskBody taskId={taskId} projectId={task.project_id ?? null} />
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Feature 3 — fast task creation
 * ──────────────────────────────────────────────────────────────────────── */

function TileTaskCreate({ tileId }: { tileId: string }) {
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
      <div className="grid h-full place-items-center px-4">
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
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-3 py-2">
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
      <div className="grid flex-1 place-items-center px-4">
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
}: {
  taskId: string;
  projectId: string | null;
}) {
  // The subtask selected for the in-tile detail pane (null → editor only).
  const [openSubtaskId, setOpenSubtaskId] = useState<string | null>(null);
  // Whether the rail is showing (toggle). It also auto-opens when a subtask
  // pane closes so the user lands back in the list.
  const [railOpen, setRailOpen] = useState(false);
  // Track which add-input should auto-focus (set true when opened by click).
  const [railAutoFocus, setRailAutoFocus] = useState(false);
  // Floating subtask windows — multiple may coexist.
  const [windowIds, setWindowIds] = useState<string[]>([]);

  const openWindow = (subtaskId: string) => {
    setWindowIds((ids) => (ids.includes(subtaskId) ? ids : [...ids, subtaskId]));
    // Opening a window supersedes the in-tile pane for that subtask.
    setOpenSubtaskId((cur) => (cur === subtaskId ? null : cur));
  };
  const closeWindow = (subtaskId: string) =>
    setWindowIds((ids) => ids.filter((id) => id !== subtaskId));

  const openPane = (subtaskId: string) => setOpenSubtaskId(subtaskId);
  const closePane = () => setOpenSubtaskId(null);

  const showRail = railOpen || openSubtaskId !== null;

  return (
    <div className="flex h-full min-h-0 flex-col @container/task">
      <div className="flex min-h-0 flex-1 @[34rem]/task:flex-row">
        {/* Main editor column. On narrow tiles it yields to the detail pane;
            on wide tiles editor + rail/pane sit side-by-side. */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            // Narrow: when a subtask pane is open it takes over, hide editor.
            openSubtaskId !== null && "hidden @[34rem]/task:block",
          )}
        >
          <TaskEditor taskId={taskId} embedded key={taskId} />
        </div>

        {/* Right rail / detail pane. Beside the editor on wide tiles; on narrow
            tiles it stacks below. The detail pane (editor hidden) gets the full
            stacked area; the rail is height-capped so the parent task editor
            stays dominant. Width is capped on wide so the editor keeps room. */}
        {showRail && (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col border-t border-border/60",
              "@[34rem]/task:w-72 @[34rem]/task:shrink-0 @[34rem]/task:border-l @[34rem]/task:border-t-0",
              openSubtaskId !== null
                ? // Detail pane: full stacked area on narrow (editor hidden).
                  "flex-1 @[34rem]/task:flex-none"
                : // Rail: bounded on narrow so the editor keeps most of the box.
                  "max-h-[55%] shrink-0 @[34rem]/task:max-h-none @[34rem]/task:flex-none",
            )}
          >
            {openSubtaskId !== null ? (
              <SubtaskDetailPane
                subtaskId={openSubtaskId}
                onClose={closePane}
                onOpenInWindow={() => openWindow(openSubtaskId)}
              />
            ) : (
              <SubtaskRail
                taskId={taskId}
                projectId={projectId}
                onOpenPane={openPane}
                onOpenWindow={openWindow}
                autoFocus={railAutoFocus}
              />
            )}
          </div>
        )}
      </div>

      {/* Persistent toggle — always one tap to the rapid subtask surface. */}
      <button
        type="button"
        onClick={() => {
          // Toggling closed also closes any open detail pane.
          if (showRail) {
            setRailOpen(false);
            setOpenSubtaskId(null);
            setRailAutoFocus(false);
          } else {
            setRailOpen(true);
            setRailAutoFocus(true);
          }
        }}
        className={cn(
          "flex shrink-0 items-center gap-1.5 border-t border-border/60 bg-card/50 px-3 py-1.5 text-[11px] font-medium transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          showRail ? "text-primary" : "text-muted-foreground",
        )}
        aria-pressed={showRail}
        title={showRail ? "Hide subtasks" : "Add / open subtasks"}
      >
        <ListTree className="size-3.5" />
        <span>Subtasks</span>
        {!showRail && <Plus className="size-3 opacity-70" />}
      </button>

      {/* Floating, draggable subtask windows — independent of tile bounds. */}
      {windowIds.map((sid) => (
        <SubtaskWindow
          key={sid}
          subtaskId={sid}
          onClose={() => closeWindow(sid)}
        />
      ))}
    </div>
  );
}
