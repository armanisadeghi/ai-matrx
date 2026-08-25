/**
 * EditableCell — one cell of a user data table, in all three grid states.
 *
 * SELECTION IS OWNED BY THE GRID, NOT BY THE CELL. `selected` and `editing`
 * arrive as props from `useGridSelection` because only the grid can know that
 * selecting THIS cell must deselect the previous one, and only the grid can
 * move the selection on Enter or Tab. A cell that owned its own edit flag could
 * never hand off to its neighbour, which is why arrow-key navigation was
 * impossible before this.
 *
 * 🚨 THE CLICK LAW (stated in full in `grid-selection.ts`): a single click may
 * SELECT, TOGGLE a two-state value, or OPEN a chooser — never drop the user
 * into a free-text buffer. So a checkbox, a rating and a choice column are
 * operable with one click, while text, numbers, dates and JSON still require a
 * deliberate double-click, Enter, or just typing. Select-and-copy must never
 * become an accidental edit.
 *
 * Writes go through `udt_upsert_cell` (surgical jsonb_set — cannot touch
 * another field). A declared format owns the coercion; without one the storage
 * type does, so an unformatted column behaves exactly as it always has.
 *
 * Every successful write is reported to `onRecordEdit` with the value from
 * BEFORE it, which is what makes Cmd-Z possible. Capturing the prior value here
 * rather than re-reading the cell afterwards is deliberate: a re-read races
 * with realtime and with agent writes.
 *
 * Read-only mounts (`editable={false}`) render display content and nothing else.
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

import { parseFieldInput } from "@/lib/field-formats/format";
import { getFieldFormat } from "@/lib/field-formats/registry";
import type { FieldFormatConfig } from "@/lib/field-formats/types";

import { ChoiceInput } from "./ChoiceInput";
import { RatingInput } from "./RatingInput";
import { isDirectClickEditor, type GridMove } from "../grid-selection";
import { upsertCell } from "../service";
import { isServiceFailure, type FieldDataType } from "../types";

type Props = {
  tableId: string;
  rowId: string;
  fieldName: string;
  fieldDisplayName: string;
  dataType: FieldDataType | string;
  /**
   * The column's declared display format. Decides which input the user gets
   * (email keyboard, color swatch, star picker) and how their typing is
   * coerced before it is stored. Omit for a plain storage-type editor.
   */
  format?: FieldFormatConfig | null;
  /**
   * The whole row. Only DEPENDENT choice columns read it — one whose options
   * narrow to the group another column's cell names. Everything else ignores it.
   */
  row?: Record<string, unknown> | null;
  value: unknown;
  /** What the parent already renders for the read-only state. */
  display: ReactNode;
  /** Disable edit mode entirely (e.g. viewer permission only). */
  editable?: boolean;
  /**
   * The write landed. `serverUpdatedAt` is the row's stored write time as the
   * RPC returned it — the parent records it so the realtime ECHO of this same
   * write is recognized and dropped instead of refetching the table.
   */
  onSaved?: (newValue: unknown, serverUpdatedAt?: string) => void;

  // ─── grid-owned state ────────────────────────────────────────────────────
  /** This cell is the current one. Renders the ring; nothing has changed. */
  selected?: boolean;
  /** This cell is being edited. Controlled by the grid, never by the cell. */
  editing?: boolean;
  /** Character that started the edit, so typing replaces rather than appends. */
  seed?: string | null;
  /** Single click landed — the grid makes this the current cell. */
  onSelect?: () => void;
  /** The user asked to edit (double-click, or a direct-click widget). */
  onBeginEdit?: () => void;
  /** Editing finished; `move` carries Enter/Tab's follow-on navigation. */
  onEndEdit?: (move?: GridMove) => void;
  /** A write landed. Carries the prior value so the grid can offer undo. */
  onRecordEdit?: (priorValue: unknown, nextValue: unknown) => void;
};

export function EditableCell({
  tableId,
  rowId,
  fieldName,
  fieldDisplayName,
  dataType,
  format,
  row,
  value,
  display,
  editable = true,
  onSaved,
  selected = false,
  editing = false,
  seed = null,
  onSelect,
  onBeginEdit,
  onEndEdit,
  onRecordEdit,
}: Props) {
  const [draft, setDraft] = useState<unknown>(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft with prop when value changes from upstream (e.g. realtime).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus on entering edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current) inputRef.current.select();
    }
  }, [editing]);

  // Entering edit mode seeds the draft: from the typed character when the user
  // just started typing (the spreadsheet reflex of "type to replace"), and from
  // the stored value otherwise.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing && !wasEditing.current) setDraft(seed ?? value);
    wasEditing.current = editing;
  }, [editing, seed, value]);

  const cancelEdit = useCallback(() => {
    setDraft(value);
    onEndEdit?.();
  }, [onEndEdit, value]);

  /**
   * `explicit` exists for editors that pick a value and finish in the SAME
   * tick — a dropdown calls onChange then closes, and React has not yet
   * re-rendered, so reading `draft` from this closure would save the value the
   * user just replaced. Typed inputs commit on blur a tick later and pass
   * nothing.
   */
  const commitEdit = useCallback(async (opts?: { value?: unknown; move?: GridMove }) => {
    if (saving) return;

    const source = opts && "value" in opts ? opts.value : draft;

    // A declared format owns the coercion (currency strips "$", tags split on
    // commas); without one this falls back to the storage-type normalizer.
    const normalized = format
      ? parseFieldInput(source, format, dataType)
      : normalizeCellValue(source, dataType);

    // Skip the write if nothing actually changed. Still counts as finishing,
    // so Enter still moves down on a cell the user only looked at.
    if (valuesEqual(normalized, value)) {
      onEndEdit?.(opts?.move);
      return;
    }

    setSaving(true);
    const result = await upsertCell({
      tableId,
      rowId,
      fieldName,
      value: normalized,
    });
    setSaving(false);

    if (isServiceFailure(result)) {
      toast({
        title: `Could not update ${fieldDisplayName}`,
        description: result.error,
        variant: "destructive",
      });
      // Stay in edit mode so the user can correct or cancel.
      return;
    }

    // Prior value FIRST — this is the whole basis of undo.
    onRecordEdit?.(value, normalized);
    onEndEdit?.(opts?.move);
    const storedAt = (result.data as { updated_at?: unknown } | null)?.updated_at;
    onSaved?.(normalized, typeof storedAt === "string" ? storedAt : undefined);
  }, [
    dataType,
    format,
    draft,
    fieldDisplayName,
    fieldName,
    onEndEdit,
    onRecordEdit,
    onSaved,
    rowId,
    saving,
    tableId,
    value,
  ]);

  /**
   * Keys while an editor is OPEN. The grid's own handler stands down for these,
   * so committing and moving on has to happen here — that is what makes Enter
   * and Tab feel like a spreadsheet instead of like a form.
   */
  const handleKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && dataType !== "json") {
      e.preventDefault();
      e.stopPropagation();
      void commitEdit({ move: "down" });
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      void commitEdit({ move: e.shiftKey ? "prevCell" : "nextCell" });
    }
  };

  const editorKindForRead = format ? getFieldFormat(format.id)?.editor : undefined;
  // Booleans have no format of their own, but they are the original two-state
  // value and behave as a checkbox whether or not one was ever declared.
  const readEditorKind =
    editorKindForRead ?? (dataType === "boolean" ? "checkbox" : undefined);
  const directClickable =
    editable && !saving && isDirectClickEditor(readEditorKind);

  /** Persist straight from the read view — no edit mode was ever entered. */
  const commitDirect = (next: unknown) => {
    onSelect?.();
    void commitEdit({ value: next });
  };

  if (!editing) {
    return (
      <div
        data-selected={selected || undefined}
        // NO CLICK HANDLERS HERE. The <td> owns click and double-click so the
        // WHOLE cell is the target — the content is smaller than the cell, and
        // an empty cell has almost no content to hit. See UserTableViewer.
        //
        // `min-h` keeps an empty cell the same height as a filled one, so the
        // row does not jog when a value is cleared and the empty cell still
        // presents a full-height target.
        className="relative flex min-h-[1.25rem] items-center"
      >
        {/* THE CLICK LAW in practice — closed sets and two-state values are
            operable in one click; everything else renders as plain display.
            These stop propagation so the cell's own click does not fight the
            widget's. */}
        {directClickable && readEditorKind === "checkbox" ? (
          <Checkbox
            checked={value === true}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={(checked) => commitDirect(checked === true)}
            aria-label={fieldDisplayName}
          />
        ) : directClickable && readEditorKind === "rating" ? (
          <RatingInput
            value={value}
            max={format?.options?.ratingMax ?? 5}
            onChange={() => undefined}
            onDone={(next) => commitDirect(next)}
          />
        ) : directClickable ? (
          // A choice column: one click opens the option list. Opening a menu is
          // not a mutation, so this is safe under THE CLICK LAW.
          <button
            type="button"
            className="w-full min-w-0 text-left"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
              onBeginEdit?.();
            }}
            title={`Choose ${fieldDisplayName}`}
          >
            {display}
          </button>
        ) : (
          <div className="w-full min-w-0">{display}</div>
        )}
        {saving && (
          <div className="absolute inset-y-0 right-0 flex items-center">
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  /**
   * THE EDITOR IS THE CELL, NOT A BOX INSIDE IT.
   *
   * The inputs used to arrive with their default border, ring and background,
   * so entering edit mode drew a second rounded rectangle inside the cell's own
   * ring — a component visibly sitting inside another component. Stripped to
   * nothing: transparent background, no border, no focus ring, no radius, and
   * the same padding the read view uses, so the text does not shift by a pixel
   * when the editor opens.
   *
   * The cell's selection ring is the ONLY chrome; it already says "you are
   * here", and a second border adds nothing but noise.
   *
   * `16px` font-size is deliberate and must not shrink: iOS Safari zooms the
   * viewport on focus for anything smaller, which yanks the whole grid.
   */
  const editorClass =
    "w-full border-0 bg-transparent p-0 text-sm shadow-none outline-none " +
    "ring-0 focus:border-0 focus:outline-none focus:ring-0 " +
    "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";
  const editorStyle = { fontSize: "16px" } as const;

  // ─── edit mode ────────────────────────────────────────────────────────────
  //
  // The declared format picks the input when it has an opinion (email keyboard,
  // color swatch, big box for long text); otherwise the storage type does, so
  // an unformatted column edits exactly as it always has.

  const editorKind = format ? getFieldFormat(format.id)?.editor : undefined;

  if (
    editorKind === "email" ||
    editorKind === "url" ||
    editorKind === "tel" ||
    editorKind === "color"
  ) {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={
          editorKind === "tel"
            ? "tel"
            : editorKind === "color"
              ? "text"
              : editorKind
        }
        inputMode={editorKind === "tel" ? "tel" : undefined}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  // A choice column edits through the ONE choice input — same component the row
  // modals use. It commits on pick (single) or on close (multi) rather than on
  // blur, because a dropdown's blur fires the moment the user reaches for an
  // option and would save the old value out from under them.
  if (editorKind === "select" || editorKind === "multiselect") {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <ChoiceInput
          format={format}
          row={row}
          value={draft}
          multiple={editorKind === "multiselect"}
          autoOpen
          onChange={(next) => setDraft(next)}
          onDone={(final) => void commitEdit({ value: final })}
          className="min-w-[10rem]"
        />
      </div>
    );
  }

  if (editorKind === "textarea") {
    return (
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        rows={4}
        className={cn(editorClass, "min-h-8 resize-none")}
        style={editorStyle}
      />
    );
  }

  // A rating edits as STARS. It used to open a number spinner, so the user saw
  // ★★★☆☆, double-clicked, and was asked to type "3".
  if (editorKind === "rating") {
    return (
      <RatingInput
        value={draft}
        max={format?.options?.ratingMax ?? 5}
        onChange={(next) => setDraft(next)}
        onDone={(final) => void commitEdit({ value: final })}
        className="py-1"
      />
    );
  }

  if (editorKind === "number") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        step={dataType === "integer" ? 1 : "any"}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  if (dataType === "boolean") {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={draft === true}
          onCheckedChange={(checked) => {
            setDraft(checked === true);
            // Boolean commits immediately — there's nothing to "type" further.
            setTimeout(() => void commitEdit(), 0);
          }}
        />
        {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  if (dataType === "number" || dataType === "integer") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        step={dataType === "integer" ? 1 : "any"}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  if (dataType === "date") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="date"
        value={typeof draft === "string" ? draft.slice(0, 10) : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  if (dataType === "datetime") {
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="datetime-local"
        value={
          typeof draft === "string" && draft.length >= 16
            ? draft.slice(0, 16)
            : ""
        }
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={saving}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  // string / json / array — multi-line capable
  return (
    <Textarea
      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
      value={
        draft === null || draft === undefined
          ? ""
          : typeof draft === "object"
            ? JSON.stringify(draft, null, 2)
            : String(draft)
      }
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKey}
      onBlur={() => void commitEdit()}
      onClick={(e) => e.stopPropagation()}
      disabled={saving}
      rows={dataType === "json" || dataType === "array" ? 4 : 1}
      className={cn(editorClass, "min-h-0 resize-none leading-normal")}
      style={editorStyle}
    />
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Coerce a raw editor value to what the column's `data_type` expects.
 *
 * Exported because the `matrx-user/data-tables` surface write target
 * (`cell_value`) must coerce EXACTLY the way the user's own typing does — a
 * second, parallel normalizer is how an agent write and a hand edit end up
 * storing different things for the same keystrokes.
 */
export function normalizeCellValue(
  raw: unknown,
  dataType: FieldDataType | string,
): unknown {
  if (raw === "" || raw === undefined) return null;
  if (raw === null) return null;

  switch (dataType) {
    case "number":
      return typeof raw === "number" ? raw : Number(raw);
    case "integer":
      return typeof raw === "number" ? Math.trunc(raw) : Math.trunc(Number(raw));
    case "boolean":
      return Boolean(raw);
    case "date":
    case "datetime":
      return String(raw);
    case "json":
    case "array":
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          // Let the trigger (or server) decide whether to accept the raw string.
          return raw;
        }
      }
      return raw;
    default:
      return typeof raw === "string" ? raw : String(raw);
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
