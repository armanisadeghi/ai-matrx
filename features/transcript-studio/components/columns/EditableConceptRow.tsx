"use client";

/**
 * Per-row edit/delete UI for concept items. The display mode mirrors
 * `ConceptsColumn`'s original button (kind chip + label + description) and
 * preserves the click-to-scroll-jump behavior. Hover reveals an icon
 * toolbar; clicking Edit replaces the row with a small form for kind,
 * label, and description; Save / Cancel / Delete drive the parent thunks.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { CONCEPT_KINDS } from "../../types";
import type { ConceptItem, ConceptKind } from "../../types";

const KIND_OPTIONS: readonly ConceptKind[] = CONCEPT_KINDS;

interface ConceptPatch {
  kind?: ConceptKind;
  label?: string;
  description?: string | null;
}

interface EditableConceptRowProps {
  item: ConceptItem;
  /** Display-mode markup. Caller controls the visual presentation. */
  display: ReactNode;
  /** True iff the read-only display is itself clickable (jump-to-time). */
  displayClickable: boolean;
  onClickJump: () => void;
  onSave: (patch: ConceptPatch) => void;
  onDelete: () => void;
}

export function EditableConceptRow({
  item,
  display,
  displayClickable,
  onClickJump,
  onSave,
  onDelete,
}: EditableConceptRowProps) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<ConceptKind>(item.kind);
  const [label, setLabel] = useState(item.label);
  const [description, setDescription] = useState(item.description ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const labelRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setKind(item.kind);
      setLabel(item.label);
      setDescription(item.description ?? "");
    }
  }, [item, editing]);

  useEffect(() => {
    if (editing && labelRef.current) {
      labelRef.current.focus();
      labelRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const patch: ConceptPatch = {};
    if (kind !== item.kind) patch.kind = kind;
    const trimmedLabel = label.trim();
    if (trimmedLabel && trimmedLabel !== item.label) patch.label = trimmedLabel;
    const nextDesc = description.trim() || null;
    if ((item.description ?? null) !== nextDesc) patch.description = nextDesc;
    if (Object.keys(patch).length > 0) onSave(patch);
  };

  const cancel = () => {
    setKind(item.kind);
    setLabel(item.label);
    setDescription(item.description ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ConceptKind)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
          }}
          maxLength={200}
          placeholder="Label"
          className="rounded-md border border-border bg-background px-2 py-1 text-sm font-medium outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commit();
            }
          }}
          rows={2}
          placeholder="Description (optional)"
          className="resize-none rounded-md border border-border bg-background px-2 py-1 text-[11px] leading-snug text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center justify-end gap-1.5">
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
    );
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClickJump}
        disabled={!displayClickable}
        className={cn(
          "flex w-full flex-col gap-0.5 pr-12 text-left",
          displayClickable ? "cursor-pointer" : "cursor-default",
        )}
      >
        {display}
      </button>
      <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          aria-label="Edit concept"
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
          aria-label="Delete concept"
          title="Delete"
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-background/80 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete concept?"
        description={`This permanently removes "${item.label}" from the session.`}
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
