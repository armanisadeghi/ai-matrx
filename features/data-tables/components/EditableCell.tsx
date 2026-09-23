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
 * into a free-text buffer. So a checkbox and a rating are operable with one
 * click; a choice column selects on the first click and opens its chooser on
 * the second (or on Enter), so the cell can be copied, cut and navigated like
 * any other; text, numbers, dates and JSON still require a deliberate
 * double-click, Enter, or just typing. Select-and-copy must never become an
 * accidental edit.
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

import type { RecordsError } from "@ai-matrx/records";
import { RefusalNotice } from "@ai-matrx/records-ui";

import { Checkbox } from "@/components/ui/checkbox";
import { Input, Popover, PopoverAnchor, PopoverContent } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { parseFieldInput } from "@/lib/field-formats/format";
import { getFieldFormat } from "@/lib/field-formats/registry";
import { looksLikeRecordId } from "@/lib/field-formats/relation";
import type { FieldFormatConfig } from "@/lib/field-formats/types";

import { ChoiceInput } from "./ChoiceInput";
import { RatingInput } from "./RatingInput";
import { AttachmentInput } from "./AttachmentInput";
import { DateCellEditor } from "./DateCellEditor";
import { isDirectClickEditor, type GridMove } from "../grid-selection";
import { upsertCell } from "../service";
import { validateCellValue, type ValidationRules } from "../validation";
import { columnRuleRefusal, type ColumnRuleRefusal } from "../validation-refusal";
import { FieldRuleRefusal } from "./FieldRuleRefusal";
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
   * The column's validation rules, when it declares any. A commit that violates
   * one is REFUSED here, in the browser, whatever the dataset's validation_mode
   * says — strict mode is a database backstop, not the user's error message.
   * The cell stays in edit mode with the value the user typed, exactly as it
   * does when the server refuses a write, because throwing away what they typed
   * is the one thing worse than not saving it.
   */
  validationRules?: ValidationRules | null;
  /**
   * Every OTHER row's value for this column, when the grid holds them. Only a
   * `unique` rule reads this; omit it and `unique` is skipped rather than
   * guessed.
   */
  existingValues?: unknown[];
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
  validationRules,
  existingValues,
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
  /**
   * 🚨 THE STORE REFUSED THIS CELL AND THE SCREEN SAID NOTHING (lane FIX-15,
   * measured on production 2026-09-22, build 93970125f9).
   *
   * Typing a customer's NAME into a relation column — an id column — is refused by
   * `custom.udt_upsert_cell` with a good three-part sentence: what happened, what the
   * column actually is, and what to do instead. All the person got was a destructive
   * toast carrying one third of it, which then timed out; the rejected text stayed in
   * the cell until the page was reloaded, so the screen showed a value the store had
   * never accepted. That is "nothing fails silently" and "a screen never lies", both.
   *
   * The refusal now lands ON THE CELL, through the SAME `RefusalNotice` the unified
   * grid uses — one formatter, so the store's own words reach the person and the
   * machine identity never does — and the cell goes straight back to the value the
   * store actually holds. It stays until the person dismisses it or edits the cell
   * again; nothing about it is on a timer.
   */
  const [refusal, setRefusal] = useState<RecordsError | null>(null);
  /**
   * 🚨 THE COLUMN'S OWN REFUSAL WAS A TOAST THAT TIMED OUT (lane VALIDATION-REFUSAL,
   * 2026-09-23 — the sibling FIX-15 named and left behind).
   *
   * A value the COLUMN refuses never reaches the store, so the store never gets to
   * answer, so FIX-15's cell notice never fired: the person got a destructive toast
   * carrying one line, which vanished on a timer, while the editor sat open holding
   * the text nobody had told them what was wrong with. Now it is the SAME notice, in
   * the SAME place, with the same two facts and the two doors out — and it is the
   * notice, not a clock, that decides how long the typed text is kept.
   */
  const [ruleRefusal, setRuleRefusal] = useState<ColumnRuleRefusal | null>(null);
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
    // Opening the editor again is the person answering the refusal; the notice goes.
    if (editing && !wasEditing.current) {
      setDraft(seed ?? value);
      setRefusal(null);
      setRuleRefusal(null);
    }
    wasEditing.current = editing;
  }, [editing, seed, value]);

  const cancelEdit = useCallback(() => {
    setDraft(value);
    setRefusal(null);
    setRuleRefusal(null);
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
    // so Enter still moves down on a cell the user only looked at. Checked
    // BEFORE the rules, deliberately: re-confirming a value that was already
    // stored — one that predates the rule, say — must never be turned into a
    // refusal the user cannot escape.
    if (valuesEqual(normalized, value)) {
      onEndEdit?.(opts?.move);
      return;
    }

    // The column's own rules, refused in the browser with the reason. Same
    // treatment as a server refusal: a toast that says what is wrong, and the
    // editor stays open holding what they typed.
    if (validationRules) {
      const verdict = validateCellValue({
        rules: validationRules,
        dataType,
        format,
        value: normalized,
        existingValues,
      });
      if (!verdict.ok) {
        // THE COLUMN'S OWN REFUSAL, ON THE CELL, THROUGH THE ONE NOTICE. The editor
        // stays open holding what was typed — and it is this notice, not a timer,
        // that says for how long: Keep editing hands the text back, Discard puts the
        // stored value back. Both doors are on the notice because the person cannot
        // be left guessing which key escapes a message they did not ask for.
        setRuleRefusal(
          columnRuleRefusal({
            fieldDisplayName,
            reason: verdict.reason,
            rules: validationRules,
          }),
        );
        // A commit that came from BLUR has already taken focus out of the input. The
        // notice is about text the person can still fix, so put them back in it.
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
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
      // THE STORE'S OWN SENTENCE, ON THE CELL — never a toast that times out, and
      // never a cell left wearing text the store refused. `refusal` is the whole
      // three-part answer (`service.ts`'s `refused()`); `error` is the fallback for
      // a failure that never reached the store.
      setRefusal(
        result.refusal ?? {
          code: "internal",
          message: result.error,
        },
      );
      // BACK TO WHAT IS ACTUALLY STORED. Leaving the rejected text on screen is the
      // screen lying about what the table holds — a reader who scrolled past would
      // have believed it until the next reload.
      setDraft(value);
      onEndEdit?.();
      return;
    }
    setRefusal(null);
    setRuleRefusal(null);

    // Prior value FIRST — this is the whole basis of undo.
    onRecordEdit?.(value, normalized);
    onEndEdit?.(opts?.move);
    const storedAt = (result.data as { updated_at?: unknown } | null)?.updated_at;
    onSaved?.(normalized, typeof storedAt === "string" ? storedAt : undefined);
  }, [
    dataType,
    existingValues,
    format,
    validationRules,
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
          // A choice column: the FIRST click selects the cell, a click on the
          // already-selected cell opens the option list (the Airtable gesture).
          // Opening a menu is not a mutation, so this is safe under THE CLICK
          // LAW — but opening it on the very first click moved focus into the
          // chooser's search box, and every grid shortcut (Cmd-C included)
          // then went there instead of to the cell. Enter / Space on the
          // selected cell open it too, so the keyboard path is one keystroke.
          <button
            type="button"
            className="w-full min-w-0 text-left"
            onClick={(e) => {
              e.stopPropagation();
              if (selected) onBeginEdit?.();
              else onSelect?.();
            }}
            title={
              selected
                ? `Choose ${fieldDisplayName}`
                : `Click again to choose ${fieldDisplayName}`
            }
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
        {/* THE REFUSAL, ON THE CELL IT IS ABOUT — AND PORTALLED OUT OF THE TABLE.
            🚨 FIX-13's lesson, re-learned here the hard way: an absolutely positioned
            notice inside the cell is CLIPPED by the table's own scroll container, so
            the first build of this showed a red sliver under the cell and none of the
            sentence. A grid cell has no room for three lines, and a row that grew by
            60px would shove the whole table down, so the notice cannot live inside the
            cell either. It is anchored to the cell and drawn in a portal, which no
            column width, scroll position or row height can reach. It sits until it is
            dismissed — a refusal on a timer is a refusal nobody read. */}
        <CellRefusalPopover
          refusal={refusal}
          ruleRefusal={ruleRefusal}
          onDismiss={() => {
            setRefusal(null);
            setRuleRefusal(null);
          }}
        />
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
  const editor: ReactNode = (() => {
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

  // An attachment column edits through the ONE attachment input: chips with a
  // remove control and "Add files…" through the platform file picker; commits
  // once on Done rather than on every pick.
  if (editorKind === "attachment") {
    return (
      <AttachmentInput
        value={draft}
        onChange={(next) => setDraft(next)}
        onDone={(final) => void commitEdit({ value: final })}
        disabled={saving}
        className="py-1"
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

  if (editorKind === "time") {
    // Stored as 24-hour "HH:MM[:SS]" — exactly what this input reads/writes.
    // A blank native time input leaves its AM/PM segment unset; typing only
    // the hour and minute and tabbing away never produces a complete value,
    // so the browser silently reports "" and the whole entry is lost. Seeding
    // an empty cell's DISPLAYED value with a PM time means every untouched
    // segment (AM/PM included) already holds a valid value, so editing just
    // the hour/minute still commits a complete, PM-defaulted time. `draft`
    // itself stays null until the user actually edits, so leaving the cell
    // untouched still commits nothing.
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="time"
        step={format?.options?.timeSeconds ? 1 : 60}
        value={typeof draft === "string" && draft ? draft : "12:00"}
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

  // Dates edit through the ONE date editor: a typeable field in the cell and a
  // calendar layer drawn outside the table, open the moment editing starts.
  // The native date input hid its only calendar button past a narrow column's
  // edge — see DateCellEditor's header.
  const dateKind =
    editorKind === "date" || editorKind === "datetime"
      ? editorKind
      : dataType === "date" || dataType === "datetime"
        ? dataType
        : null;
  if (dateKind) {
    return (
      <DateCellEditor
        ref={inputRef as React.RefObject<HTMLInputElement>}
        kind={dateKind}
        value={value}
        seed={seed}
        disabled={saving}
        className={editorClass}
        style={editorStyle}
        onCommit={(next, move) => void commitEdit({ value: next, move })}
        onCancel={cancelEdit}
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
  })();

  /**
   * THE EDITOR, AND THE NOTICE ANCHORED TO IT.
   *
   * 🚨 The wrapper is not decoration. Before this lane the refusal surface existed
   * only in the READ branch, because only a STORE refusal could reach the screen
   * and a store refusal closes the editor. A COLUMN's refusal is the opposite case
   * — the editor is still open, holding the text — so the notice has to be able to
   * appear over an open editor, anchored to the same cell, drawn in a portal that
   * no column width or scroll position can clip (FIX-13's lesson, kept).
   */
  return (
    <div className="relative w-full min-w-0" data-matrx-cell-editor="">
      {editor}
      <CellRefusalPopover
        refusal={refusal}
        ruleRefusal={ruleRefusal}
        onDismiss={() => {
          setRefusal(null);
          setRuleRefusal(null);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        onDiscard={cancelEdit}
      />
    </div>
  );
}

/**
 * THE ONE REFUSAL SURFACE OF A GRID CELL — store refusal and column refusal alike.
 *
 * Portalled out of the table (FIX-13), never on a timer (FIX-15), and the same
 * `RefusalNotice` body either way, so a person cannot tell which half of the
 * system refused them and has no reason to want to.
 */
function CellRefusalPopover({
  refusal,
  ruleRefusal,
  onDismiss,
  onDiscard,
}: {
  refusal: RecordsError | null;
  ruleRefusal: ColumnRuleRefusal | null;
  onDismiss: () => void;
  onDiscard?: () => void;
}) {
  const open = refusal !== null || ruleRefusal !== null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <PopoverAnchor asChild>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0" />
      </PopoverAnchor>
      {open ? (
        <PopoverContent
          data-matrx-cell-refusal=""
          align="start"
          side="bottom"
          sizing="content"
          className="p-2"
          // A notice about text that is still in an open editor must never take the
          // focus away from that editor — the person is mid-sentence.
          {...(ruleRefusal ? { onOpenAutoFocus: (e: Event) => e.preventDefault() } : {})}
          // The person is answering the refusal by editing the cell again, so a
          // press inside the notice must never reach the grid underneath it.
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {ruleRefusal ? (
            <FieldRuleRefusal
              refusal={ruleRefusal}
              className="border-0 p-0"
              onKeepEditing={onDismiss}
              {...(onDiscard ? { onDiscard } : {})}
            />
          ) : refusal ? (
            <RefusalNotice
              error={refusal}
              className="border-0 p-0"
              actions={
                <button
                  type="button"
                  className="mt-1 rounded border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              }
            />
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * A value a relation column cannot store, refused before it is sent. It is a
 * named class rather than a bare Error so a caller can tell "the person typed
 * something this column cannot hold" from "the network died" and show the
 * sentence instead of a generic failure.
 */
export class RelationCellValueError extends Error {
  readonly kind = "relation_cell_value" as const;
  constructor(message: string) {
    super(message);
    this.name = "RelationCellValueError";
  }
}

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
  format?: FieldFormatConfig | null,
): unknown {
  if (raw === "" || raw === undefined) return null;
  if (raw === null) return null;

  // A RELATION COLUMN TAKES AN IDENTIFIER, NEVER A NAME — and this is the door
  // a paste-from-Excel and a smart import come through, which is exactly how a
  // customer's name ends up sitting in an id column. `data_type` cannot tell
  // the difference: a relation column is a `string` column, so the old switch
  // fell to `default` and stringified whatever it was handed.
  //
  // The database refuses this too (workbench.udt_relation_cells_take_ids), and
  // that refusal is the boundary. This is the half that keeps a person from
  // watching a paste half-land: it throws HERE, before the write is sent,
  // naming the column and what it expected — the same sentence, one round trip
  // earlier. It never coerces and never silently drops the value.
  if (format?.id === "relation") {
    const values = Array.isArray(raw) ? raw : [raw];
    const max = format.options?.relation_max ?? 1;
    if (max <= 1 && values.length > 1) {
      throw new RelationCellValueError(
        `This column points at one record, and it was given ${values.length}.`,
      );
    }
    for (const v of values) {
      const text = typeof v === "string" ? v.trim() : String(v ?? "");
      if (text === "") continue;
      if (!looksLikeRecordId(text)) {
        throw new RelationCellValueError(
          `This column points at a record, and it was given the text "${text.slice(0, 60)}". ` +
            `Pick the record from the list — its name is shown, but what is stored is which record it is.`,
        );
      }
    }
    return Array.isArray(raw) ? values.map((v) => String(v).trim()).filter(Boolean) : String(raw).trim();
  }

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
