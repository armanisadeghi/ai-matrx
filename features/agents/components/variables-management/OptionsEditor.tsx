"use client";

/**
 * OptionsEditor — always-visible trailing input, drag-reorderable committed rows.
 *
 *   • A separate trailing "draft" input is always shown. Typing edits the draft
 *     locally. Pressing Enter, Tab, or blur commits the draft as a new option
 *     row and resets the draft. This prevents focus churn on every keystroke.
 *   • Committed rows can be edited in place; changes emit on each keystroke.
 *   • Committed rows are draggable via @dnd-kit/sortable (trailing is excluded).
 *   • Duplicates and empties are pruned on blur; duplicate rows show a red border.
 */

import React, { useEffect, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface OptionsEditorProps {
  options: string[];
  onChange: (next: string[]) => void;
  readonly?: boolean;
  /** Text shown under the label when options aren't used by the current type. */
  unusedNote?: string;
}

type Row = { id: string; value: string };

let rowIdCounter = 0;
const genRowId = () => `opt-${++rowIdCounter}`;

function arrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function OptionsEditor({
  options,
  onChange,
  readonly,
  unusedNote,
}: OptionsEditorProps) {
  // Committed rows mirror the `options` prop with stable IDs.
  const [rows, setRows] = useState<Row[]>(() =>
    options.map((v) => ({ id: genRowId(), value: v })),
  );
  // The trailing "add new" input is a local draft — only commits on Enter/blur.
  const [draft, setDraft] = useState("");

  const lastEmittedRef = useRef<string[]>(options);

  // Sync when parent's `options` changes externally (undo/redo, type switch, etc).
  useEffect(() => {
    if (arrayEq(options, lastEmittedRef.current)) return;
    const current = rows.map((r) => r.value);
    if (arrayEq(current, options)) {
      lastEmittedRef.current = options;
      return;
    }
    const next: Row[] = [];
    const used = new Set<string>();
    for (const v of options) {
      const match = rows.find((r) => !used.has(r.id) && r.value === v);
      if (match) {
        next.push(match);
        used.add(match.id);
      } else {
        next.push({ id: genRowId(), value: v });
      }
    }
    setRows(next);
    lastEmittedRef.current = options;
  }, [options, rows]);

  // Mark duplicates for visual feedback (on committed rows only).
  const duplicateIds = new Set<string>();
  {
    const firstSeen = new Map<string, string>();
    for (const r of rows) {
      const v = r.value.trim();
      if (!v) continue;
      if (firstSeen.has(v)) duplicateIds.add(r.id);
      else firstSeen.set(v, r.id);
    }
  }

  const emit = (next: Row[]) => {
    const real = next.map((r) => r.value.trim()).filter((v) => v.length > 0);
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const v of real) {
      if (!seen.has(v)) {
        seen.add(v);
        deduped.push(v);
      }
    }
    if (!arrayEq(deduped, lastEmittedRef.current)) {
      lastEmittedRef.current = deduped;
      onChange(deduped);
    }
  };

  // All mutators below compute `next` from the current `rows`, then commit
  // with `setRows(next)` + `emit(next)` at the top level. We intentionally do
  // NOT run side effects (like emit → onChange → Redux dispatch) inside a
  // setState updater function, because React may call updaters during render
  // and may invoke them twice in StrictMode — dispatching from inside one
  // produces "Cannot update a component while rendering a different component"
  // warnings. This mirrors the pattern already used in handleDragEnd.

  const updateRow = (id: string, value: string) => {
    const next = rows.map((r) => (r.id === id ? { ...r, value } : r));
    setRows(next);
    emit(next);
  };

  const removeRow = (id: string) => {
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    emit(next);
  };

  const blurRow = (id: string) => {
    const target = rows.find((r) => r.id === id);
    // If the row was cleared, prune it.
    if (target && target.value.trim().length === 0) {
      const next = rows.filter((r) => r.id !== id);
      setRows(next);
      emit(next);
      return;
    }
    // Dedupe committed rows (keep first).
    const seen = new Set<string>();
    const next = rows.filter((r) => {
      const v = r.value.trim();
      if (!v) return true; // don't drop other empties here (handled above)
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    setRows(next);
    emit(next);
  };

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (draft !== "") setDraft("");
      return;
    }
    // Duplicate — reject silently, just clear the draft.
    if (rows.some((r) => r.value === trimmed)) {
      setDraft("");
      return;
    }
    const next = [...rows, { id: genRowId(), value: trimmed }];
    setRows(next);
    emit(next);
    setDraft("");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = rows.findIndex((r) => r.id === active.id);
    const newIdx = rows.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(rows, oldIdx, newIdx);
    setRows(next);
    emit(next);
  };

  return (
    <div className="space-y-1.5">
      {unusedNote && (
        <p className="text-[11px] text-muted-foreground italic leading-tight">
          {unusedNote}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {rows.map((row) => (
              <SortableOptionRow
                key={row.id}
                id={row.id}
                value={row.value}
                isDuplicate={duplicateIds.has(row.id)}
                readonly={readonly}
                onChange={(v) => updateRow(row.id, v)}
                onBlur={() => blurRow(row.id)}
                onRemove={() => removeRow(row.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readonly && (
        <div className="flex items-center gap-1.5 pl-6">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
            placeholder={
              rows.length === 0
                ? "Type an option and press Enter…"
                : "Add another option…"
            }
            className="h-7 text-xs"
            style={{ fontSize: "16px" }}
          />
          {/* Align width with committed rows (grip + X buttons). */}
          <span className="w-5 shrink-0" aria-hidden />
        </div>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface SortableOptionRowProps {
  id: string;
  value: string;
  isDuplicate: boolean;
  readonly?: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}

function SortableOptionRow({
  id,
  value,
  isDuplicate,
  readonly,
  onChange,
  onBlur,
  onRemove,
}: SortableOptionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 group"
    >
      {!readonly ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-5 h-7 shrink-0 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
          aria-label="Reorder option"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={readonly}
        className={cn("h-7 text-xs", isDuplicate && "border-destructive")}
        style={{ fontSize: "16px" }}
      />
      {!readonly ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center w-5 h-7 shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"
          aria-label="Remove option"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}
    </div>
  );
}
