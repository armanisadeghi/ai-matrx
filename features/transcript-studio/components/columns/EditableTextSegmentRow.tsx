"use client";

/**
 * Generic edit/delete affordance for text-only segment rows (raw + cleaned).
 *
 * Display mode renders the children (caller controls layout). On hover we
 * reveal a small toolbar with Edit + Delete. Clicking Edit swaps the
 * children for a textarea + Save/Cancel; clicking Delete opens a
 * ConfirmDialog and forwards to the supplied `onDelete`.
 *
 * Visual contract: the row root carries `group` so children can use
 * `group-hover` to fade in their own decorations alongside the toolbar.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2, GitCompareArrows } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";

interface EditableTextSegmentRowProps {
  text: string;
  /** Render the read-only display. Caller owns layout (timecode, speaker, etc). */
  children: ReactNode;
  /** Called with the new text when the user saves. Caller dispatches the thunk. */
  onSave: (text: string) => void;
  /** Called when the user confirms delete. Caller dispatches the thunk. */
  onDelete: () => void;
  /** Used in the confirm-delete dialog title. */
  itemKind: string;
  className?: string;
}

export function EditableTextSegmentRow({
  text,
  children,
  onSave,
  onDelete,
  itemKind,
  className,
}: EditableTextSegmentRowProps) {
  const [editing, setEditing] = useState(false);
  const openDiff = useOpenDiffViewerWindow();
  const [draft, setDraft] = useState(text);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      // Auto-grow to content height.
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [editing]);

  const commit = () => {
    const next = draft;
    setEditing(false);
    if (next === text) return;
    onSave(next);
  };

  const cancel = () => {
    setDraft(text);
    setEditing(false);
  };

  return (
    <div className={cn("group relative", className)}>
      {editing ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            rows={3}
          />
          <div className="flex items-center justify-end gap-1.5">
            {draft !== text && (
              <button
                type="button"
                onClick={() =>
                  openDiff({
                    original: text,
                    modified: draft,
                    originalLabel: "Saved",
                    modifiedLabel: "Edit",
                    title: "Segment — compare",
                    engine: "light",
                    defaultView: "highlight",
                  })
                }
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                title="Compare your edit with the saved text"
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                Compare
              </button>
            )}
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              className="inline-flex h-7 items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {children}
          <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              aria-label={`Edit ${itemKind}`}
              title="Edit"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-background/80 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmOpen(true);
              }}
              aria-label={`Delete ${itemKind}`}
              title="Delete"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-background/80 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${itemKind}?`}
        description={`This permanently removes the ${itemKind} from the session. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}
