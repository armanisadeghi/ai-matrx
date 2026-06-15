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
// "Create" stays put (ready for the next quick-add); "Create and Open" jumps
// into the fresh thread via the room view's stageTile(). Threads = tiles, so
// creation reuses the createTile thunk as-is; an entered description is
// persisted onto the tile's note by reusing addNoteToTile + the notes update
// API (no new thunks, no slice writes).

import { useRef, useState } from "react";
import {
  Plus,
  Loader2,
  ArrowRight,
  Check,
  CornerDownLeft,
} from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addNoteToTile,
  createTile,
} from "@/features/war-room/redux/thunks";
import { update as updateNote } from "@/features/notes/service/notesApi";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

/** How the collapsed trigger reads — matches the two NewTile shells. */
export type QuickAddVariant = "card" | "rail";

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

  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  function open() {
    setEditing(true);
    // Focus on the next frame so the input is mounted first.
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function collapse() {
    setEditing(false);
    setName("");
    setDescription("");
    setShowDescription(false);
  }

  /**
   * Create the thread. `mode === "open"` jumps into it; `mode === "stay"`
   * resets the composer and refocuses the name field for the next quick-add.
   */
  async function create(mode: "stay" | "open") {
    if (busy) return;
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    setBusy(true);
    try {
      const tile = await dispatch(
        createTile({
          sessionId,
          position: nextPosition,
          title: trimmedName || undefined,
        }),
      );
      if (!tile?.id) return; // thunk already surfaced the failure (toast)

      // Optional description → persist onto the tile's note. Reuses the
      // existing note flow (addNoteToTile creates + links + activates a note);
      // we then write the description as its content via the notes update API.
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
        // Stay put: clear the fields and re-arm for the next quick-add.
        setName("");
        setDescription("");
        setShowDescription(false);
        requestAnimationFrame(() => nameRef.current?.focus());
      }
    } finally {
      setBusy(false);
    }
  }

  function revealDescription() {
    setShowDescription(true);
    requestAnimationFrame(() => descRef.current?.focus());
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Shift/Cmd/Ctrl+Enter = Create and Open; plain Enter = Create (stay).
      void create(e.shiftKey || e.metaKey || e.ctrlKey ? "open" : "stay");
      return;
    }
    if (e.key === "Tab" && !e.shiftKey) {
      // Tab from the name field reveals + focuses the description textarea.
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
      // Tab from the description moves focus to the Save button (Tab-then-Enter
      // lands the thread). Plain Enter stays a newline (multi-line descriptions).
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
          placeholder="Name this thread…"
          aria-label="New thread name"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/70",
            "focus-visible:outline-none disabled:opacity-60",
          )}
        />
      </div>

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
    </div>
  );
}
