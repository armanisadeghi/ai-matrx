/**
 * DateCellEditor — how a `date` / `datetime` cell of the `/data` grid edits.
 *
 * 🚨 WHY THIS IS NOT A NATIVE `<input type="date">` ANY MORE (2026-09-23).
 * The native control draws its own calendar button INSIDE the input, at the
 * input's right edge, and the only way to open the calendar is that button. A
 * grid cell is exactly as wide as its column, so in any column narrower than
 * the browser's segmented "09/22/2026, 06:00 AM" text the button was pushed
 * past the cell's clip and the calendar became unreachable — for a narrow
 * column, gone completely.
 *
 * The world champion here is Airtable (Notion and Linear do the same): editing
 * a date cell OPENS the calendar at once, in a layer anchored to the cell and
 * drawn outside the table, so no column width or scroll position can clip it.
 * The cell itself keeps a plain text field, so the keyboard path survives:
 * start typing to replace ("9/30/2026", "Oct 3 2026 4pm" — read by the one reader, `fromText`), Enter saves and moves
 * down, Tab saves and moves right, Escape discards. Picking a day saves a
 * `date` column immediately; a `datetime` column keeps the calendar open for
 * the time, and Done / Enter / clicking away saves it.
 *
 * Stored shapes: `yyyy-MM-dd` for a date, and an ABSOLUTE INSTANT (`…Z`) for a
 * date and time, read in the viewer's zone — the record grids' own shape, through
 * the one conversion in `date-cell-words.ts` (grids review 3: the Sheet used to
 * write the zone-less `yyyy-MM-ddTHH:mm`, so one column held two formats).
 * An unchanged cell hands back the ORIGINAL value untouched, so opening and
 * closing the editor never rewrites a value it did not change.
 */
"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { format as formatDate } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";

import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  dateFromStored,
  readDateCellWords,
  storedFromDate,
  type DateCellKind,
} from "../date-cell-words";

import type { GridMove } from "@ai-matrx/design-system/data-table/grid-selection";

export type { DateCellKind };

type Props = {
  kind: DateCellKind;
  /** The stored value when the edit began. */
  value: unknown;
  /** Character that started the edit — typing replaces the value. */
  seed?: string | null;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onCommit: (value: unknown, move?: GridMove) => void;
  onCancel: () => void;
  /**
   * The words in the field whenever a person changes them (TABLE-EDIT-DEFECTS T28): the cell holds
   * them as its draft, so an edit the grid ends without a commit (a press on another cell unmounts
   * this editor before its calendar hears the outside press) still saves what was typed.
   */
  onDraft?: (words: string) => void;
};

const DATE_TEXT = "MMM d, yyyy";
const DATETIME_TEXT = "MMM d, yyyy h:mm a";

/** Reads a STORED value. Date-only strings are local calendar days, never UTC. */
export function fromStored(value: unknown, kind: DateCellKind): Date | null {
  return dateFromStored(value, kind);
}

/** What the store keeps for a moment: a day, or an absolute instant (`date-cell-words.ts`). */
export function toStored(date: Date, kind: DateCellKind): string {
  return storedFromDate(date, kind);
}

/** How a date reads to a person — the words the cell's own text field shows. */
export function toText(date: Date | null, kind: DateCellKind): string {
  if (!date) return "";
  return formatDate(date, kind === "date" ? DATE_TEXT : DATETIME_TEXT);
}

/**
 * Reads what a person TYPED. `undefined` = could not read it.
 *
 * 🚨 THE ONE READER (`date-cell-words.ts` over `@ai-matrx/records` `readTypedDate`), the same
 * reading the record-store grids use — never a list of patterns tried until one "works". It reads
 * the person's locale order, a month word, a time after the day (2:30 PM, 1200PM, 14:30), a time
 * alone over a date & time cell that already has its day (`current`), and refuses a two-digit or
 * missing year with the way to write it (`whyUnread`).
 */
export function fromText(text: string, kind: DateCellKind, current?: unknown): Date | null | undefined {
  const read = readDateCellWords(text, kind, current);
  if (!read.ok) return undefined;
  return read.stored === null ? null : dateFromStored(read.stored, kind);
}

/** Why the typed text is not a date — the reader's own sentence, or `null` when it reads. */
export function whyUnread(text: string, kind: DateCellKind, current?: unknown): string | null {
  const read = readDateCellWords(text, kind, current);
  return read.ok ? null : read.why;
}

function swallow(e: SyntheticEvent) {
  // The layer is portalled, but React events still bubble through the portal
  // to the grid's <td> and its container — which would select the cell, pull
  // focus back to the grid, or treat the keystroke as navigation.
  e.stopPropagation();
}

export const DateCellEditor = forwardRef<HTMLInputElement, Props>(
  function DateCellEditor(
    {
      kind,
      value,
      seed = null,
      disabled,
      className,
      style,
      onCommit,
      onCancel,
      onDraft,
    },
    ref,
  ) {
    const initialDate = fromStored(value, kind);
    const initialText = toText(initialDate, kind);
    const [text, setText] = useState<string>(seed ?? initialText);
    const [touched, setTouched] = useState<boolean>(seed !== null);
    const [unreadable, setUnreadable] = useState(false);

    // KEYS TYPED BEFORE THIS FIELD TOOK FOCUS JOIN IT (grids review 3). The grid grows the edit's
    // seed with every key that reached it while the calendar was mounting; this field used to read
    // the seed once, so `1200PM` typed fast kept only its first key. What has not been seen yet is
    // appended — or, for an edit opened without typing, replaces the value, as typing would.
    const seenSeed = useRef<string | null>(seed);
    useEffect(() => {
      const held = seenSeed.current;
      seenSeed.current = seed;
      if (!seed || seed === held) return;
      if (held && seed.startsWith(held)) {
        const more = seed.slice(held.length);
        setText((t) => t + more);
      } else {
        setText(seed);
      }
      setTouched(true);
      setUnreadable(false);
    }, [seed]);

    const parsed = fromText(text, kind, value);
    const current = parsed === undefined ? null : parsed;
    const [month, setMonth] = useState<Date>(() => current ?? new Date());
    const anchorRef = useRef<HTMLDivElement>(null);

    const setFromDate = (next: Date | null) => {
      const words = toText(next, kind);
      setText(words);
      onDraft?.(words);
      setTouched(true);
      setUnreadable(false);
      if (next) setMonth(next);
    };

    const commit = (move?: GridMove, explicit?: Date | null) => {
      if (explicit !== undefined) {
        onCommit(explicit === null ? null : toStored(explicit, kind), move);
        return;
      }
      // Opened and closed without a change: hand back what was stored, byte for
      // byte, so the write is skipped.
      if (!touched || text === initialText) {
        onCommit(value, move);
        return;
      }
      const read = readDateCellWords(text, kind, value);
      if (!read.ok) {
        // Never guess and never drop what they typed — say so, keep the editor.
        setUnreadable(true);
        return;
      }
      onCommit(read.stored, move);
    };

    const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit("down");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        commit(e.shiftKey ? "prevCell" : "nextCell");
      }
    };

    const pickDay = (day: Date | undefined) => {
      if (!day) return;
      if (kind === "date") {
        commit(undefined, day);
        return;
      }
      // Keep the time already chosen; a first pick on an empty cell starts at 9 AM.
      const next = new Date(day);
      if (current)
        next.setHours(current.getHours(), current.getMinutes(), 0, 0);
      else next.setHours(9, 0, 0, 0);
      setFromDate(next);
    };

    const setTime = (hhmm: string) => {
      const m = /^(\d{2}):(\d{2})/.exec(hhmm);
      if (!m) return;
      const next = new Date(current ?? new Date());
      next.setHours(Number(m[1]), Number(m[2]), 0, 0);
      setFromDate(next);
    };

    return (
      <Popover
        open
        onOpenChange={(open) => {
          // Clicking anywhere outside the cell and its calendar is "I'm done".
          if (!open) commit();
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={anchorRef}
            className="flex w-full min-w-0 items-center gap-1.5"
          >
            <CalendarDays
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={ref}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-label={kind === "date" ? "Date" : "Date and time"}
              aria-invalid={unreadable || undefined}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                onDraft?.(e.target.value);
                setTouched(true);
                setUnreadable(false);
                const read = fromText(e.target.value, kind, value);
                if (read) setMonth(read);
              }}
              onKeyDown={handleKey}
              onClick={(e) => e.stopPropagation()}
              disabled={disabled}
              className={cn(
                "min-w-0 flex-1",
                unreadable && "text-destructive",
                className,
              )}
              style={style}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          sizing="content"
          align="start"
          className="p-0"
          // Focus stays in the cell's text field so typing still works.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // The cell's own text field sits outside this layer; moving between it
          // and the calendar is still the same edit, not a dismissal.
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node))
              e.preventDefault();
          }}
          onClick={swallow}
          onPointerDown={swallow}
          onDoubleClick={swallow}
          onKeyDown={(e) => {
            swallow(e);
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        >
          {unreadable && (
            <p className="w-0 min-w-full border-b border-border px-3 py-2 text-xs text-destructive">
              {whyUnread(text, kind, value) ?? "That is not a date this cell can read."} Or pick one below.
            </p>
          )}
          <div className="flex justify-center">
            <Calendar
              className="bg-transparent"
              mode="single"
              selected={current ?? undefined}
              onSelect={pickDay}
              month={month}
              onMonthChange={setMonth}
              captionLayout="dropdown"
              startMonth={new Date(1900, 0)}
              endMonth={new Date(2100, 11)}
              showTodayButton={false}
            />
          </div>
          {kind === "datetime" && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <Clock
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="time"
                aria-label="Time"
                value={current ? formatDate(current, "HH:mm") : ""}
                onChange={(e) => setTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit("down");
                  }
                }}
                className="flex-1"
              />
            </div>
          )}
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => {
                const now = new Date();
                if (kind === "date") commit(undefined, now);
                else {
                  now.setSeconds(0, 0);
                  setFromDate(now);
                }
              }}
            >
              {kind === "date" ? "Today" : "Now"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              disabled={!current && initialDate === null}
              onClick={() => commit(undefined, null)}
            >
              Clear
            </Button>
            {kind === "datetime" && (
              <Button
                type="button"
                size="sm"
                className="ml-auto h-7"
                onClick={() => commit()}
              >
                Done
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
