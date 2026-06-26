"use client";

// features/war-room/components/thread/QuickAddThread.tsx
//
// The reusable "spin up a new thread without leaving this one" primitive.
// One inline composer shared by every New-thread affordance in the room (the
// Grid cell + the Stage rail), so the create flow lives in exactly one place.
//
// Three anchor modes (segmented picker):
//   • canvas  — freeform resource hub (Canvas tab).
//   • task    — anchored to an existing or newly created task (Task tab).
//   • project — anchored to a project (Project tab).
//
// "Create" stays put for rapid adds; "Create & open" stages the new thread.

import { useRef, useState } from "react";
import {
  Plus,
  Loader2,
  ArrowRight,
  LayoutGrid,
  ListChecks,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addNoteToThread,
  attachExistingTaskToThread,
  createThread,
} from "@/features/war-room/redux/thunks";
import { update as updateNote } from "@/features/notes/service/notesApi";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";
import type { ThreadPickerOption } from "@/features/war-room/types";
import { cn } from "@/lib/utils";
import { WarRoomProjectPicker } from "../shared/WarRoomProjectPicker";
import { WarRoomTaskPicker } from "../shared/WarRoomTaskPicker";

/** How the collapsed trigger reads — matches the two NewThread shells. */
export type QuickAddVariant = "card" | "rail";

const FLAVOR_OPTIONS: {
  value: ThreadPickerOption;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { value: "canvas", label: "Canvas", icon: LayoutGrid },
  { value: "task", label: "Task", icon: ListChecks },
  { value: "project", label: "Project", icon: FolderKanban },
];

export function QuickAddThread({
  sessionId,
  nextPosition,
  variant = "card",
  /** Promote a freshly-created thread to the Stage ("Create and Open"). */
  onOpen,
}: {
  sessionId: string;
  nextPosition: number;
  variant?: QuickAddVariant;
  onOpen?: (threadId: string) => void;
}) {
  const dispatch = useAppDispatch();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const [flavor, setFlavor] = useState<ThreadPickerOption>("canvas");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);

  function open() {
    setEditing(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function resetFields() {
    setName("");
    setDescription("");
  }

  function resetAnchors() {
    setProjectId(null);
    setProjectName(null);
    setTaskId(null);
    setTaskName(null);
  }

  function collapse() {
    setEditing(false);
    resetFields();
    resetAnchors();
    setFlavor("canvas");
  }

  function onFlavorChange(next: ThreadPickerOption) {
    setFlavor(next);
    resetAnchors();
  }

  async function create(mode: "stay" | "open") {
    if (busy) return;
    if (flavor === "project" && !projectId) {
      toast.error("Choose a project for this thread first");
      return;
    }
    if (flavor === "task" && !taskId) {
      toast.error("Choose a task for this thread first");
      return;
    }
    await doCreate(mode);
  }

  async function doCreate(mode: "stay" | "open") {
    if (busy) return;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    setBusy(true);
    try {
      const thread = await dispatch(
        createThread({
          roomId: sessionId,
          position: nextPosition,
          title:
            trimmedName ||
            (flavor === "project"
              ? (projectName ?? undefined)
              : flavor === "task"
                ? (taskName ?? undefined)
                : undefined),
          projectId: flavor === "project" ? projectId : undefined,
          taskId: flavor === "task" ? taskId : undefined,
          anchorType:
            flavor === "project"
              ? "project"
              : flavor === "task"
                ? "task"
                : "canvas",
          activeTab: "task",
        }),
      );
      if (!thread?.id) return;

      if (flavor === "task" && taskId) {
        await dispatch(attachExistingTaskToThread(thread.id, taskId));
      }

      await finishCreate(mode, thread.id, trimmedDescription);
    } finally {
      setBusy(false);
    }
  }

  async function finishCreate(
    mode: "stay" | "open",
    threadId: string,
    trimmedDescription: string,
  ) {
    if (trimmedDescription) {
      const noteId = await dispatch(addNoteToThread(threadId, sessionId));
      if (noteId) {
        await updateNote(noteId, { content: trimmedDescription }).catch(
          () => {},
        );
      }
    }

    if (mode === "open") {
      onOpen?.(threadId);
      collapse();
    } else {
      resetFields();
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void create(e.shiftKey || e.metaKey || e.ctrlKey ? "open" : "stay");
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      descRef.current?.focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      collapse();
    }
  }

  function onDescKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      createRef.current?.focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      collapse();
    }
  }

  const namePlaceholder =
    flavor === "project"
      ? "Name (optional — defaults to project)…"
      : flavor === "task"
        ? "Name (optional — defaults to task)…"
        : "Name this thread…";

  // ── Collapsed trigger ──────────────────────────────────────────────
  if (!editing) {
    if (variant === "rail") {
      return (
        <button
          type="button"
          onClick={open}
          className={cn(
            "group/new flex items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-transparent px-3 py-2 text-left transition-all",
            "hover:border-primary/50 hover:bg-primary/[0.03]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
        >
          <span className="grid place-items-center size-5 shrink-0 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:text-primary">
            <Plus className="size-3.5" />
          </span>
          <span className="text-[13px] font-medium text-muted-foreground group-hover/new:text-primary">
            New thread
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          "group/new flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-card/40 text-muted-foreground transition-all min-h-0",
          "hover:border-primary/50 hover:text-primary hover:bg-primary/[0.03]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        <span className="grid place-items-center size-10 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:text-primary">
          <Plus className="size-5" />
        </span>
        <span className="text-xs font-medium">New thread</span>
      </button>
    );
  }

  // ── Inline composer (shared by both variants) ──────────────────────
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm",
        variant === "card" && "h-full min-h-0 justify-center",
      )}
    >
      <div
        role="group"
        aria-label="Thread type"
        className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5"
      >
        {FLAVOR_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = flavor === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onFlavorChange(opt.value)}
              disabled={busy}
              aria-pressed={active}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <ProInput
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onNameKeyDown}
        disabled={busy}
        placeholder={namePlaceholder}
        aria-label="New thread name"
        showCopyButton={false}
        wrapperClassName="w-full"
        className="rounded-lg border-border bg-background font-medium shadow-none"
      />

      {flavor === "task" ? (
        <WarRoomTaskPicker
          value={taskId}
          onSelect={(id, title) => {
            setTaskId(id);
            setTaskName(title);
          }}
        />
      ) : null}

      {flavor === "project" ? (
        <WarRoomProjectPicker
          value={projectId}
          onSelect={(id, displayName) => {
            setProjectId(id);
            setProjectName(displayName);
          }}
        />
      ) : null}

      <ProTextarea
        ref={descRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onDescKeyDown}
        onSubmit={() => void create("stay")}
        submitOnCmdEnter
        showCopyButton={false}
        disabled={busy}
        autoGrow
        minHeight={64}
        maxHeight={160}
        placeholder="Description"
        aria-label="New thread description"
        wrapperClassName="w-full"
        className="text-sm"
      />

      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={collapse}
          disabled={busy}
          className={cn(
            "inline-flex items-center rounded-lg border border-border bg-transparent px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-all",
            "hover:border-border hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:opacity-60 disabled:pointer-events-none",
          )}
        >
          Cancel
        </button>
        <button
          ref={createRef}
          type="button"
          onClick={() => void create("stay")}
          disabled={busy}
          title="Create — stay here for the next thread"
          className={cn(
            "inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground transition-all",
            "hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            "disabled:opacity-60 disabled:pointer-events-none",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Create
        </button>
        <button
          type="button"
          onClick={() => void create("open")}
          disabled={busy}
          title="Create and open this thread on the Stage"
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground transition-all",
            "hover:border-primary/40 hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:opacity-60 disabled:pointer-events-none",
          )}
        >
          <ArrowRight className="size-3.5" />
          Create &amp; open
        </button>
      </div>
    </div>
  );
}
