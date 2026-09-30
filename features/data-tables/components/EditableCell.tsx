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

import { readTypedTime, type RecordsError } from "@ai-matrx/records";
import { FieldControl, RefusalNotice } from "@ai-matrx/records-ui";

import { Checkbox } from "@/components/ui/checkbox";
import { Input, Popover, PopoverAnchor, PopoverContent } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

import { parseFieldInput } from "@ai-matrx/design-system/field-formats";
import { getFieldFormat } from "@ai-matrx/design-system/field-formats";
import { looksLikeRecordId } from "@/lib/field-formats/relation";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

import { ChoiceInput } from "./ChoiceInput";
import { RatingInput } from "./RatingInput";
import { AttachmentInput } from "./AttachmentInput";
import { DateCellEditor } from "./DateCellEditor";
import { isDirectClickEditor, type GridMove } from "@ai-matrx/design-system/data-table/grid-selection";
import { isRecordStoreTable, readChoiceNudge, upsertCell, upsertCellAddingChoice } from "../service";
import { decideTypedChoice } from "../choice-option-nudge";
import { readCellWord } from "../cell-word";
import { storeFieldForRelationColumn } from "../relation-cell";
import { ChoiceNudgeAsk, type PendingChoiceAsk } from "./ChoiceNudgeAsk";
import { validateCellValue, type ValidationRules } from "../validation";
import { columnRuleRefusal, type ColumnRuleRefusal } from "../validation-refusal";
import { FieldRuleRefusal } from "./FieldRuleRefusal";
import { isServiceFailure, type FieldDataType } from "../types";

type Props = {
  tableId: string;
  rowId: string;
  /** The column's id (the store Field's id on a record-store table). A Relation cell's picker reads it. */
  fieldId?: string;
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
  /**
   * The cell's save also added words to its column's choices (the person answered Add to the
   * enum nudge). The parent re-reads the columns so the new choice is offered everywhere.
   */
  onChoicesAdded?: () => void;

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
  /**
   * Enter or Tab reached the grid before this editor had focus (BREAKER-2 B2-10): commit what is
   * held and move on. The editor commits once per `n`.
   */
  commitRequest?: { n: number; move: GridMove } | null;
};

export function EditableCell({
  tableId,
  rowId,
  fieldId,
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
  onChoicesAdded,
  selected = false,
  editing = false,
  seed = null,
  onSelect,
  onBeginEdit,
  onEndEdit,
  onRecordEdit,
  commitRequest = null,
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
  /** The enum nudge's question, while the person answers it (nothing is saved until they do). */
  const [choiceAsk, setChoiceAsk] = useState<PendingChoiceAsk | null>(null);
  /**
   * A SAVE THE STORE NEVER RECEIVED (BREAKER-3 B3-24, BREAKER-2 B2-32). Offline mid-edit, the typed text
   * vanished under "We could not reach your data … open this again" and nothing retried. Now the value
   * is kept on the cell's notice, saved the moment the browser is back online, with Try now and Discard.
   */
  const [unsent, setUnsent] = useState<{ value: unknown; add?: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Sync draft with prop when value changes from upstream (e.g. realtime).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus on entering edit mode.
  //
  // 🚨 A CELL OPENED BY TYPING NEVER SELECTS WHAT WAS TYPED (Arman, 2026-09-28: "if I type 1200PM,
  // I get 2:00PM because the one isn't recorded"). An editor that mounts already holding the typed
  // key (the date editor does) had it selected-all here, so the SECOND keystroke replaced the
  // first. A typed-into cell puts the caret after what was typed; opening with Enter or a
  // double-click still selects the stored value, so typing replaces it.
  useEffect(() => {
    const control = inputRef.current;
    if (!editing || !control) return;
    control.focus();
    if (seed === null || seed === "") {
      if ("select" in control) control.select();
      return;
    }
    try {
      const end = control.value.length;
      control.setSelectionRange(end, end);
    } catch {
      // An email/number input has no text selection; its caret is already after the text.
    }
  }, [editing, seed]);

  // Entering edit mode seeds the draft: from the typed character when the user
  // just started typing (the spreadsheet reflex of "type to replace"), and from
  // the stored value otherwise.
  const wasEditing = useRef(false);
  const seedIsTheSearch = (() => {
    const kind = format ? getFieldFormat(format.id)?.editor : undefined;
    return kind === "select" || kind === "multiselect";
  })();
  useEffect(() => {
    // Opening the editor again is the person answering the refusal; the notice goes.
    if (editing && !wasEditing.current) {
      // A CHOICE takes the typed letters as its list's search (ChoiceInput `initialQuery`), never
      // as the value — the draft stays what is stored, so closing the list changes nothing.
      setDraft(seedIsTheSearch ? value : (seed ?? value));
      setRefusal(null);
      setRuleRefusal(null);
    }
    wasEditing.current = editing;
  }, [editing, seed, value, seedIsTheSearch]);

  // KEYS TYPED BEFORE THIS EDITOR TOOK FOCUS JOIN IT (BREAKER-2 B2-10): the grid grows the seed with
  // every key that reached it while the editor was mounting; what this editor has not seen yet is
  // appended, so "Alpha0" at 30 ms a key is saved whole.
  const seenSeed = useRef<string | null>(null);
  const openedWithoutTyping = useRef(false);
  useEffect(() => {
    if (!editing) {
      seenSeed.current = null;
      return;
    }
    if (seedIsTheSearch) return;
    const held = seenSeed.current;
    if (held === null) {
      // The edit's first run: what it opened with. An edit opened by a double-click or Enter holds the
      // stored value selected, so the first keys that reach it through the grid replace it, as typing
      // into the selection would.
      seenSeed.current = seed ?? "";
      openedWithoutTyping.current = seed === null || seed === "";
      return;
    }
    if (seed && seed.length > held.length && seed.startsWith(held)) {
      const more = seed.slice(held.length);
      if (openedWithoutTyping.current) {
        openedWithoutTyping.current = false;
        setDraft(more);
      } else {
        setDraft((d: unknown) => `${d === null || d === undefined ? "" : String(d)}${more}`);
      }
    }
    seenSeed.current = seed;
  }, [editing, seed, seedIsTheSearch]);

  /**
   * A CHOICE EDIT ENDED BY A CLICK ELSEWHERE STILL COMMITS (BREAKER-2 B2-04; Arman's core feature).
   * The choice list commits on pick (one choice) or on close (several) — but a click on another cell
   * ends the edit by unmounting the list, and it never closed: "Neck, Ankle" was silently saved as
   * "Neck". When the grid ends a choice edit that neither committed nor cancelled, the draft is
   * committed here, through the same path — so a word that is none of the choices ASKS, exactly as
   * one choice does.
   */
  /** This cell's saves, one after another (B2-10/B2-11). */
  const saveLane = useRef<Promise<void>>(Promise.resolve());
  const latestDraft = useRef<unknown>(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });
  const settled = useRef(false);
  useEffect(() => {
    if (editing) settled.current = false;
  }, [editing]);

  const cancelEdit = useCallback(() => {
    settled.current = true;
    setDraft(value);
    setRefusal(null);
    setRuleRefusal(null);
    setChoiceAsk(null);
    onEndEdit?.();
  }, [onEndEdit, value]);

  /**
   * `explicit` exists for editors that pick a value and finish in the SAME
   * tick — a dropdown calls onChange then closes, and React has not yet
   * re-rendered, so reading `draft` from this closure would save the value the
   * user just replaced. Typed inputs commit on blur a tick later and pass
   * nothing.
   */
  const commitEdit = useCallback(async (opts?: { value?: unknown; move?: GridMove; add?: string[]; answered?: boolean }) => {
    settled.current = true;

    let source = opts && "value" in opts ? opts.value : draft;

    // TYPED WORDS ARE READ ONCE, HERE, BY THE ONE READER (`@ai-matrx/records`) — the same reading
    // the record-store grids use. A time (`1200PM`, `9:30a`, `0930`) and a number (`-150`,
    // `(300)`) sit in a plain text box while they are typed; nothing the reader would have to
    // guess is written — the editor stays open holding the words, with the way to write them.
    if (typeof source === "string" && source.trim() !== "") {
      const kind = typedReaderKind(format, dataType);
      // A NUMBER IS READ BY THE ONE READER OF A WORD (cell-word.ts; BREAKER-2 B2-13): "7.5" in a Whole
      // number column was kept as 7 without a word, and "12abc" as 12.
      const numberRead = kind === "number" ? readCellWord(source, { display_name: fieldDisplayName, data_type: dataType, metadata: format ? { format } : null }) : null;
      const read = kind === "time" ? readTypedTime(source) : null;
      if ((read && !read.ok) || (numberRead && !numberRead.ok)) {
        setRuleRefusal(
          columnRuleRefusal({
            fieldDisplayName,
            reason: numberRead && !numberRead.ok ? numberRead.why : `${fieldDisplayName} holds a time of day, and ${read && !read.ok ? read.why : ""}`,
          }),
        );
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      if (read && read.ok) source = read.value;
      if (numberRead && numberRead.ok) source = numberRead.value;
    }

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

    // THE ENUM NUDGE (lane CHOICE-COLUMN-EDIT): a word that is none of the column's choices is
    // asked about BEFORE anything is saved — Add (it becomes a choice everywhere and the cell takes
    // it, in one save), Keep as typed (only where the column takes other values), Cancel. The
    // organization's knob custom/choice_nudge may answer for the person (always_add / never_add).
    let add = opts?.add;
    if (!opts?.answered && !add) {
      // The knob is read only when there is something to ask about: every other commit stays a
      // single save with no extra round trip.
      const offList = decideTypedChoice(format, normalized, "ask");
      const decision = offList.kind === "none" ? offList : decideTypedChoice(format, normalized, await readChoiceNudge(tableId));
      if (decision.kind === "ask" || decision.kind === "not_a_choice") {
        setChoiceAsk({
          words: decision.words,
          canKeep: decision.kind === "ask" && decision.canKeep,
          canAdd: decision.kind === "ask",
          value: source,
          ...(opts?.move ? { move: opts.move } : {}),
        });
        return;
      }
      if (decision.kind === "add") add = decision.words;
    }
    setChoiceAsk(null);

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

    // THE EDIT ENDS NOW, AND ITS SAVE RUNS IN ITS OWN LANE (BREAKER-2 B2-10/B2-11). The edit used to
    // stay open, greyed, until the store answered — so keys typed meanwhile went nowhere, and the late
    // "done" ended whichever edit was open by then and moved the person from wherever they were (a
    // Title on another row was overwritten). The grid moves on at once, keyed to THIS cell; this
    // cell's saves are serialised, so a second edit of it waits for the first and never lands
    // anywhere else.
    onEndEdit?.(opts?.move);
    const prior = value;
    const previous = saveLane.current;
    let release: () => void = () => {};
    saveLane.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    setSaving(true);
    const result =
      add && add.length > 0 && format
        ? await upsertCellAddingChoice({ tableId, rowId, fieldName, value: normalized, add, format })
        : await upsertCell({
            tableId,
            rowId,
            fieldName,
            value: normalized,
          });
    setSaving(false);
    release();

    if (isServiceFailure(result) && result.refusal?.code === "unreachable") {
      // NOT A REFUSAL: the store never heard it. Keep it, say so, and send it again when we can.
      setUnsent({ value: normalized, ...(add && add.length > 0 ? { add } : {}) });
      setDraft(value);
      return;
    }
    setUnsent(null);
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
      return;
    }
    setRefusal(null);
    setRuleRefusal(null);

    // Prior value FIRST — this is the whole basis of undo.
    onRecordEdit?.(prior, normalized);
    const storedAt = (result.data as { updated_at?: unknown } | null)?.updated_at;
    onSaved?.(normalized, typeof storedAt === "string" ? storedAt : undefined);
    if (add && add.length > 0) onChoicesAdded?.();
  }, [
    onChoicesAdded,
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
    tableId,
    value,
  ]);

  // THE UNSENT VALUE GOES AGAIN WHEN THE BROWSER IS BACK ONLINE (and on Try now).
  const sendUnsent = useCallback(() => {
    if (!unsent) return;
    void commitEdit({ value: unsent.value, answered: true, ...(unsent.add ? { add: unsent.add } : {}) });
  }, [unsent, commitEdit]);
  useEffect(() => {
    if (!unsent || typeof window === "undefined") return;
    window.addEventListener("online", sendUnsent);
    return () => window.removeEventListener("online", sendUnsent);
  }, [unsent, sendUnsent]);

  // Enter or Tab that reached the grid before this editor had focus: commit what is held.
  const answeredCommit = useRef<number | null>(null);
  useEffect(() => {
    if (!editing || !commitRequest || answeredCommit.current === commitRequest.n) return;
    answeredCommit.current = commitRequest.n;
    void commitEdit({ value: latestDraft.current, move: commitRequest.move });
  }, [editing, commitRequest, commitEdit]);

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

  /** The person's answer to the enum nudge. */
  const answerChoiceAsk = (answer: "add" | "keep" | "cancel") => {
    const pending = choiceAsk;
    setChoiceAsk(null);
    if (!pending || answer === "cancel") {
      cancelEdit();
      return;
    }
    void commitEdit({
      value: pending.value,
      ...(pending.move ? { move: pending.move } : {}),
      ...(answer === "add" ? { add: pending.words } : { answered: true }),
    });
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

  const endedWithoutSettling = useRef(false);
  const wasEditingChoice = useRef(false);
  useEffect(() => {
    const kind = format ? getFieldFormat(format.id)?.editor : undefined;
    const isChoice = kind === "select" || kind === "multiselect";
    if (wasEditingChoice.current && !editing && isChoice && !settled.current && !endedWithoutSettling.current) {
      endedWithoutSettling.current = true;
      const held = latestDraft.current;
      if (!valuesEqual(held, value)) void commitEdit({ value: held });
    }
    if (editing) endedWithoutSettling.current = false;
    wasEditingChoice.current = editing && isChoice;
  }, [editing, format, value, commitEdit]);

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
        ) : readEditorKind === "checkbox" && (value === true || value === false || value === null || value === undefined) ? (
          // A TWO-STATE VALUE LOOKS THE SAME FROM EVERY SEAT (lane PROOF-DEFECTS, D2). Only
          // whether it can be changed differs: a viewer, a formula or a saving cell draws the
          // same box, disabled and saying why — never the words "True" / "False" the plain
          // display path printed for a viewer while the owner saw a tick box.
          <Checkbox
            checked={value === true}
            disabled
            onClick={(e) => e.stopPropagation()}
            aria-label={fieldDisplayName}
            title={
              value === true || value === false
                ? `${fieldDisplayName}: ${value ? "yes" : "no"}${saving ? "" : " (you cannot change this here)"}`
                : `${fieldDisplayName}: nobody has answered this yet`
            }
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
          choiceAsk={choiceAsk}
          unsent={unsent ? { words: unsentWords(unsent.value) } : null}
          onSendUnsent={sendUnsent}
          onDiscardUnsent={() => setUnsent(null)}
          columnName={fieldDisplayName}
          onAnswer={answerChoiceAsk}
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

  // A RELATION CELL EDITS THROUGH THE GRID'S OWN PICKER (BREAKER-3 B3-01): records-ui's one
  // RelationPicker, reached through `FieldControl` — the target table's records, searchable, with
  // "New …" — never a choice list that offers to keep typed words. One pick saves (a single
  // reference); several are saved when the cell is left, like a several-choice cell.
  const relationField =
    format?.id === "relation" && fieldId && isRecordStoreTable(tableId)
      ? storeFieldForRelationColumn({ id: fieldId, field_name: fieldName, display_name: fieldDisplayName, format })
      : null;
  if (relationField) {
    return (
      <div onClick={(e) => e.stopPropagation()} className="py-0.5" data-sheet-relation-editor="">
        <FieldControl
          field={relationField}
          value={draft}
          autoOpen
          onChange={(next) => {
            setDraft(next);
            if (!relationField.multi) void commitEdit({ value: next, answered: true });
          }}
        />
      </div>
    );
  }

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
        disabled={false}
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
          offersNewWords
          onChange={(next) => setDraft(next)}
          onDone={(final) => void commitEdit({ value: final })}
          className="min-w-[10rem]"
          initialQuery={seed}
        />
      </div>
    );
  }

  if (editorKind === "textarea") {
    return (
      <CellTextEditor
        inputRef={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(next) => setDraft(next)}
        onKeyDown={handleKey}
        onCommit={() => void commitEdit()}
        disabled={false}
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
        disabled={false}
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
        // A TEXT BOX, never `type="number"`: the browser drops a lone "-" or "$" typed into a
        // number control, so "-150" became 150. `commitEdit` reads the words (readTypedNumber).
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={false}
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
        // A TEXT BOX, never `type="number"`: the browser drops a lone "-" or "$" typed into a
        // number control, so "-150" became 150. `commitEdit` reads the words (readTypedNumber).
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft === null || draft === undefined ? "" : String(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={false}
        className={cn(editorClass, "h-auto")}
        style={editorStyle}
      />
    );
  }

  if (editorKind === "time") {
    // 🚨 A TEXT BOX, NEVER THE BROWSER'S TIME CONTROL (Arman, 2026-09-28: "if I type 1200PM, I get
    // 2:00PM because the one isn't recorded"). The native control could not hold a half-typed
    // "1", fell back to its placeholder, and took the rest of the keys segment by segment. The box
    // holds exactly what was typed; `commitEdit` reads it once (`readTypedTime`: 1200PM, 12pm,
    // 9:30a, 0930, 14:30) and refuses a guess (a bare "9") with the way to write it. Stored as
    // 24-hour "HH:MM[:SS]", as before.
    return (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        autoComplete="off"
        placeholder="2:30 PM"
        value={typeof draft === "string" ? draft : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commitEdit()}
        onClick={(e) => e.stopPropagation()}
        disabled={false}
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
        disabled={false}
        className={editorClass}
        style={editorStyle}
        onCommit={(next, move) => void commitEdit({ value: next, move })}
        onCancel={cancelEdit}
      />
    );
  }

  // string / json / array — multi-line capable
  return (
    <CellTextEditor
      inputRef={inputRef as React.RefObject<HTMLTextAreaElement>}
      value={
        draft === null || draft === undefined
          ? ""
          : typeof draft === "object"
            ? JSON.stringify(draft, null, 2)
            : String(draft)
      }
      onChange={(next) => setDraft(next)}
      onKeyDown={handleKey}
      onCommit={() => void commitEdit()}
      disabled={false}
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
        choiceAsk={choiceAsk}
        unsent={unsent ? { words: unsentWords(unsent.value) } : null}
        onSendUnsent={sendUnsent}
        onDiscardUnsent={() => setUnsent(null)}
        columnName={fieldDisplayName}
        onAnswer={answerChoiceAsk}
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
  choiceAsk = null,
  unsent = null,
  onSendUnsent,
  onDiscardUnsent,
  columnName,
  onAnswer,
  onDismiss,
  onDiscard,
}: {
  refusal: RecordsError | null;
  ruleRefusal: ColumnRuleRefusal | null;
  choiceAsk?: PendingChoiceAsk | null;
  unsent?: { words: string } | null;
  onSendUnsent?: () => void;
  onDiscardUnsent?: () => void;
  columnName?: string;
  onAnswer?: (answer: "add" | "keep" | "cancel") => void;
  onDismiss: () => void;
  onDiscard?: () => void;
}) {
  const open = refusal !== null || ruleRefusal !== null || choiceAsk !== null || unsent !== null;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (choiceAsk) onAnswer?.("cancel");
          else onDismiss();
        }
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
          {...(ruleRefusal || choiceAsk ? { onOpenAutoFocus: (e: Event) => e.preventDefault() } : {})}
          // FOCUS GOING BACK INTO THE CELL'S OWN EDITOR IS NOT "FOCUS LEFT" (DATA-V2-BASICS-2 F37).
          // The choice picker hands focus to its trigger as its list closes, and the column-rule
          // notice puts the caret back in the input — both inside the editor this notice is about,
          // outside the notice. Read as a dismissal, the question answered Cancel for the person
          // (every "Add …" after the first of a page load did nothing). A click elsewhere and
          // Escape still close it.
          onFocusOutside={(e: Event) => {
            const to = e.target instanceof Element ? e.target : null;
            if (to?.closest("[data-matrx-cell-editor]")) e.preventDefault();
          }}
          // The person is answering the refusal by editing the cell again, so a
          // press inside the notice must never reach the grid underneath it.
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {unsent && !choiceAsk && !ruleRefusal ? (
            <div data-matrx-cell-unsent="" className="max-w-[20rem] space-y-1.5 text-left text-sm">
              <p>
                Not saved yet: the connection dropped. {unsent.words ? <>&ldquo;{unsent.words}&rdquo; is kept here and</> : <>It is kept here and</>} is
                saved as soon as you are back online.
              </p>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="rounded border bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90" onClick={() => onSendUnsent?.()}>
                  Try now
                </button>
                <button type="button" className="rounded border px-2 py-0.5 text-xs hover:bg-muted" onClick={() => onDiscardUnsent?.()}>
                  Discard
                </button>
              </div>
            </div>
          ) : choiceAsk ? (
            <ChoiceNudgeAsk ask={choiceAsk} columnName={columnName ?? ""} onAnswer={(a) => onAnswer?.(a)} />
          ) : ruleRefusal ? (
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

/** The words of a value that was not saved, as the person typed them (a list reads as its words). */
function unsentWords(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((v) => (v === null || v === undefined ? "" : String(v))).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

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
/**
 * Which ONE reader reads this column's typed words on commit: a time of day, a plain number, or
 * none (the column's format parses its own words — currency, percent — and text is the words).
 */
export function typedReaderKind(
  format: FieldFormatConfig | null | undefined,
  dataType: FieldDataType | string,
): "time" | "number" | null {
  if (format) {
    if (format.id === "time") return "time";
    return format.id === "number" || format.id === "decimal" || format.id === "integer" ? "number" : null;
  }
  return dataType === "number" || dataType === "integer" ? "number" : null;
}

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


/**
 * A text cell edits through ProTextarea — the platform's one text field, so a
 * cell gets the same "…" menu as every field (the one registry tree: Clean up,
 * Help with this, copy/save/share…) (RC-B6 round 2). Blur still commits the
 * edit — except when focus moved to the field's own controls or its menu,
 * which is the person using the field, not leaving it.
 */
function CellTextEditor({
  inputRef,
  value,
  onChange,
  onKeyDown,
  onCommit,
  disabled,
  rows,
  className,
  style,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCommit: () => void;
  disabled: boolean;
  rows: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapRef} data-cell-text-editor="" onClick={(e) => e.stopPropagation()}>
      <ProTextarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          const next = e.relatedTarget as Element | null;
          if (
            next &&
            (wrapRef.current?.contains(next) ||
              next.closest("[data-radix-popper-content-wrapper]"))
          ) {
            return;
          }
          onCommit();
        }}
        disabled={disabled}
        rows={rows}
        autoGrow={false}
        showCopyButton={false}
        enableVoice={false}
        className={className}
        style={style}
      />
    </div>
  );
}
