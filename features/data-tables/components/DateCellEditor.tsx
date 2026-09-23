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
 * start typing to replace ("9/30", "Oct 3 2026 4pm"), Enter saves and moves
 * down, Tab saves and moves right, Escape discards. Picking a day saves a
 * `date` column immediately; a `datetime` column keeps the calendar open for
 * the time, and Done / Enter / clicking away saves it.
 *
 * Stored shapes are unchanged: `yyyy-MM-dd` for a date, and the local
 * `yyyy-MM-ddTHH:mm` the native datetime input always wrote for a datetime.
 * An unchanged cell hands back the ORIGINAL value untouched, so opening and
 * closing the editor never rewrites a value it did not change.
 */
"use client";

import {
  forwardRef,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { format as formatDate, isValid, parse } from "date-fns";
import { CalendarDays, Clock } from "lucide-react";

import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@ai-matrx/design-system";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import type { GridMove } from "../grid-selection";

export type DateCellKind = "date" | "datetime";

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
};

const DATE_TEXT = "MMM d, yyyy";
const DATETIME_TEXT = "MMM d, yyyy h:mm a";

/** Formats a person might type, most specific first. */
const DATE_INPUTS = [
  "yyyy-MM-dd",
  "M/d/yyyy",
  "M/d/yy",
  "M/d",
  "MMM d, yyyy",
  "MMM d yyyy",
  "MMMM d, yyyy",
  "MMMM d yyyy",
  "d MMM yyyy",
  "MMM d",
];
const TIME_SUFFIXES = [
  " h:mm a",
  ", h:mm a",
  " h:mma",
  " ha",
  " h a",
  ", h:mm:ss a",
  " H:mm",
  ", H:mm",
];
const DATETIME_INPUTS = [
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd HH:mm",
  ...DATE_INPUTS.flatMap((d) => TIME_SUFFIXES.map((t) => d + t)),
];

/** Reads a STORED value. Date-only strings are local calendar days, never UTC. */
export function fromStored(value: unknown, kind: DateCellKind): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const text = String(value);
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    text.slice(0, kind === "date" ? 10 : text.length),
  );
  if (dayOnly) {
    return new Date(
      Number(dayOnly[1]),
      Number(dayOnly[2]) - 1,
      Number(dayOnly[3]),
    );
  }
  const d = new Date(text);
  return isValid(d) ? d : null;
}

export function toStored(date: Date, kind: DateCellKind): string {
  return formatDate(
    date,
    kind === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm",
  );
}

function toText(date: Date | null, kind: DateCellKind): string {
  if (!date) return "";
  return formatDate(date, kind === "date" ? DATE_TEXT : DATETIME_TEXT);
}

/** Reads what a person TYPED. `undefined` = could not read it. */
export function fromText(text: string, kind: DateCellKind): Date | null | undefined {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "") return null;
  const now = new Date();
  const patterns =
    kind === "date" ? DATE_INPUTS : [...DATETIME_INPUTS, ...DATE_INPUTS];
  for (const pattern of patterns) {
    const d = parse(trimmed, pattern, now);
    if (isValid(d)) return d;
  }
  const loose = new Date(trimmed);
  return isValid(loose) ? loose : undefined;
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
    },
    ref,
  ) {
    const initialDate = fromStored(value, kind);
    const initialText = toText(initialDate, kind);
    const [text, setText] = useState<string>(seed ?? initialText);
    const [touched, setTouched] = useState<boolean>(seed !== null);
    const [unreadable, setUnreadable] = useState(false);

    const parsed = fromText(text, kind);
    const current = parsed === undefined ? null : parsed;
    const [month, setMonth] = useState<Date>(() => current ?? new Date());
    const anchorRef = useRef<HTMLDivElement>(null);

    const setFromDate = (next: Date | null) => {
      setText(toText(next, kind));
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
      const read = fromText(text, kind);
      if (read === undefined) {
        // Never guess and never drop what they typed — say so, keep the editor.
        setUnreadable(true);
        return;
      }
      onCommit(read === null ? null : toStored(read, kind), move);
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
                setTouched(true);
                setUnreadable(false);
                const read = fromText(e.target.value, kind);
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
              That is not a date this cell can read. Try &ldquo;
              {kind === "date" ? "Sep 22, 2026" : "Sep 22, 2026 9:00 AM"}
              &rdquo;, or pick one below.
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
                className="h-8 flex-1"
                style={{ fontSize: "16px" }}
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
