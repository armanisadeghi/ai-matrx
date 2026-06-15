"use client";

// features/war-room/components/tile/QuickAddThread.tsx
//
// The reusable "spin up a new thread without leaving this one" primitive.
// One inline composer shared by every New-thread affordance in the room (the
// Grid cell + the Stage rail), so the create flow lives in exactly one place.
//
// Flow (keyboard-first — focus is the whole point):
//   idle  → click the trigger → AUTO-FOCUSED name field.
//   name  · Enter            → Create (default): persist the thread, RESET the
//                              field, stay open + refocused for the next add.
//         · Shift/Cmd+Enter  → Create and Open: create, then stageTile(newId).
//         · Tab              → reveal + focus the description textarea.
//         · Escape           → collapse back to idle.
//   desc  (ProTextarea, multi-line) — plain Enter inserts a newline.
//         · Tab              → move focus to the Save button (Tab-then-Enter).
//         · Cmd/Ctrl+Enter   → explicit Save (Create, stay).
//   Save button · Enter/click → Create with name+description.
//
// FLAVOR (Epic Phase 5): a thread is created as one of three flavors —
//   • thread  (default) — the generic multi-tab tile.
//   • task    — task-anchored (opens on the Task tab).
//   • project — bound to an existing project (its Task tab lists the project's
//               tasks). Choosing a project that conflicts with the room's
//               project raises the ProjectConflictDialog (the invariant: a room
//               and its threads never hold conflicting projects).
//
// "Create" stays put (ready for the next quick-add); "Create and Open" jumps
// into the fresh thread via the room view's stageTile(). Threads = tiles, so
// creation reuses the createTile thunk; an entered description is persisted onto
// the tile's note by reusing addNoteToTile + the notes update API.

import { useRef, useState } from "react";
import {
  Plus,
  Loader2,
  ArrowRight,
  Check,
  CornerDownLeft,
  SquareStack,
  ListChecks,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  addNoteToTile,
  createTile,
  checkTileProjectConflict,
  convertRoomToPerThreadThunk,
  type ProjectConflictResolution,
} from "@/features/war-room/redux/thunks";
import { update as updateNote } from "@/features/notes/service/notesApi";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { TileFlavor } from "@/features/war-room/types";
import { cn } from "@/lib/utils";
import { ProjectConflictDialog } from "../shared/ProjectConflictDialog";
import { WarRoomProjectPicker } from "../shared/WarRoomProjectPicker";

/** How the collapsed trigger reads — matches the two NewTile shells. */
export type QuickAddVariant = "card" | "rail";

const FLAVOR_OPTIONS: {
  value: TileFlavor;
  label: string;
  icon: typeof SquareStack;
  hint: string;
}[] = [
  { value: "thread", label: "Thread", icon: SquareStack, hint: "A general thread" },
  { value: "task", label: "Task", icon: ListChecks, hint: "Anchored to a task" },
  {
    value: "project",
    label: "Project",
    icon: FolderKanban,
    hint: "Bound to a project",
  },
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
  onOpen?: (tileId: string) => void;
}) {
  const dispatch = useAppDispatch();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [busy, setBusy] = useState(false);

  // Flavor + project selection.
  const [flavor, setFlavor] = useState<TileFlavor>("thread");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  // Conflict prompt: open + the room's project at the time of the clash + the
  // create mode to resume once the user resolves.
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictRoomProjectId, setConflictRoomProjectId] = useState<
    string | null
  >(null);
  const pendingModeRef = useRef<"stay" | "open">("stay");

  // Other threads in the room (for the conflict dialog copy).
  const otherThreadCount = useAppSelector(
    (s) => (s.warRoom.tileIdsBySession[sessionId] ?? []).length,
  );

  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  function open() {
    setEditing(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function resetFields() {
    setName("");
    setDescription("");
    setShowDescription(false);
  }

  function collapse() {
    setEditing(false);
    resetFields();
    setFlavor("thread");
    setProjectId(null);
    setProjectName(null);
  }

  /**
   * Validate + (for project flavor) conflict-check, then create. A project
   * thread that clashes with the room's project defers to the dialog; otherwise
   * it falls straight through to doCreate.
   */
  async function create(mode: "stay" | "open") {
    if (busy) return;
    if (flavor === "project" && !projectId) {
      toast.error("Choose a project for this thread first");
      return;
    }
    if (flavor === "project" && projectId) {
      const { hasConflict, roomProjectId } = dispatch(
        checkTileProjectConflict(sessionId, projectId),
      );
      if (hasConflict) {
        setConflictRoomProjectId(roomProjectId);
        pendingModeRef.current = mode;
        setConflictOpen(true);
        return;
      }
    }
    await doCreate(mode);
  }

  /**
   * Persist the thread. `resolution` is set only when resuming from the conflict
   * dialog: 'per-thread' converts the room first; 'keep-room' joins the room's
   * project instead of the requested one.
   */
  async function doCreate(
    mode: "stay" | "open",
    resolution?: ProjectConflictResolution,
  ) {
    if (busy) return;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    setBusy(true);
    try {
      let effectiveProjectId = flavor === "project" ? projectId : null;
      if (resolution === "keep-room") {
        effectiveProjectId = conflictRoomProjectId; // join the room's project
      } else if (resolution === "per-thread") {
        const ok = await dispatch(convertRoomToPerThreadThunk(sessionId));
        if (!ok) return; // conversion failed (toast shown) — abort cleanly
        // room now has no project → the requested id is safe
      }

      const tile = await dispatch(
        createTile({
          sessionId,
          position: nextPosition,
          title:
            trimmedName ||
            (flavor === "project" ? projectName ?? undefined : undefined),
          flavor,
          projectId: effectiveProjectId,
          // task/project tiles open on the Task tab; threads keep the default.
          activeTab: flavor === "thread" ? undefined : "task",
        }),
      );
      if (!tile?.id) return; // thunk already surfaced the failure (toast)

      // Optional description → persist onto the tile's note (reuses the note
      // flow: create + link + activate, then write the description as content).
      if (trimmedDescription) {
        const noteId = await dispatch(addNoteToTile(tile.id, sessionId));
        if (noteId) {
          await updateNote(noteId, { content: trimmedDescription }).catch(
            () => {},
          );
        }
      }

      if (mode === "open") {
        onOpen?.(tile.id);
        collapse();
      } else {
        // Stay put: clear the name/description but keep the flavor + project
        // selection sticky for rapid same-type adds; re-arm the name field.
        resetFields();
        requestAnimationFrame(() => nameRef.current?.focus());
      }
    } finally {
      setBusy(false);
      setConflictOpen(false);
      setConflictRoomProjectId(null);
    }
  }

  function onResolveConflict(resolution: ProjectConflictResolution) {
    void doCreate(pendingModeRef.current, resolution);
  }

  function revealDescription() {
    setShowDescription(true);
    requestAnimationFrame(() => descRef.current?.focus());
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void create(e.shiftKey || e.metaKey || e.ctrlKey ? "open" : "stay");
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      revealDescription();
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
      saveRef.current?.focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      collapse();
    }
  }

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
          <span className="grid place-items-center size-5 shrink-0 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:bg-primary/10 group-hover/new:text-primary">
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
        <span className="grid place-items-center size-10 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:bg-primary/10 group-hover/new:text-primary">
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
      {/* Flavor selector — segmented, compact. Default 'thread' preserves the
          fast path (Enter creates a thread). */}
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
              onClick={() => setFlavor(opt.value)}
              disabled={busy}
              aria-pressed={active}
              title={opt.hint}
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

      <div className="flex items-center gap-2">
        <span className="grid place-items-center size-5 shrink-0 rounded-full bg-primary/10 text-primary">
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
        </span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onNameKeyDown}
          disabled={busy}
          placeholder={
            flavor === "project"
              ? "Name (optional — defaults to project)…"
              : "Name this thread…"
          }
          aria-label="New thread name"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/70",
            "focus-visible:outline-none disabled:opacity-60",
          )}
        />
      </div>

      {/* Project picker — only for the project flavor. Flat across orgs. */}
      {flavor === "project" ? (
        <WarRoomProjectPicker
          value={projectId}
          onSelect={(id, displayName) => {
            setProjectId(id);
            setProjectName(displayName);
          }}
        />
      ) : null}

      {showDescription ? (
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
          placeholder="Add a description (optional)"
          aria-label="New thread description"
          wrapperClassName="w-full"
          className="text-sm"
        />
      ) : null}

      {/* Action row — Create is the default (Enter); Create and Open secondary. */}
      <div className="flex items-center justify-between gap-2">
        {showDescription ? (
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground @xs:flex">
            <CornerDownLeft className="size-3" />
            Tab to Save
          </span>
        ) : (
          <button
            type="button"
            onClick={revealDescription}
            disabled={busy}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
          >
            + Description
          </button>
        )}

        <div className="flex items-center gap-1.5">
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
          <button
            ref={saveRef}
            type="button"
            onClick={() => void create("stay")}
            disabled={busy}
            title="Create (Enter) — stay here for the next thread"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground transition-all",
              "hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
              "disabled:opacity-60 disabled:pointer-events-none",
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Create
          </button>
        </div>
      </div>

      <ProjectConflictDialog
        open={conflictOpen}
        onOpenChange={(o) => {
          setConflictOpen(o);
          if (!o) setConflictRoomProjectId(null);
        }}
        requestedProjectName={projectName}
        otherThreadCount={otherThreadCount}
        busy={busy}
        onResolve={onResolveConflict}
      />
    </div>
  );
}
