"use client";

/**
 * A DATE IN A ROW FORM IS EDITED BY THE SHEET CELL'S OWN DATE EDITOR (BREAKER-3 B3-03).
 *
 * The "+ Row" form drew a Date column's label and nothing under it. There is ONE date control on
 * this platform's tables — `DateCellEditor`, the calendar the Sheet cell opens, with the one reader
 * for typed dates — so a form field is that editor behind a button: the button shows the date in
 * words ("Oct 3, 2026"), a click opens the same calendar and text field the cell does, and picking a
 * day (or Enter, Tab, Done, clicking away) hands the stored shape back — `yyyy-MM-dd` for a date,
 * `yyyy-MM-ddTHH:mm` for a date and time. Escape changes nothing.
 */
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { DateCellEditor, fromStored, toText, type DateCellKind } from "./DateCellEditor";

export type DateFieldInputProps = {
  id: string;
  kind: DateCellKind;
  value: unknown;
  onChange: (next: string | null) => void;
  className?: string;
};

export function DateFieldInput({ id, kind, value, onChange, className }: DateFieldInputProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring",
          className,
        )}
      >
        <DateCellEditor
          ref={inputRef}
          kind={kind}
          value={value}
          className="bg-transparent outline-none"
          // 16px keeps iOS from zooming the page when the field takes focus.
          style={{ fontSize: "16px" }}
          onCommit={(next) => {
            setEditing(false);
            if (next === value) return;
            onChange(next === null || next === undefined || next === "" ? null : String(next));
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const shown = toText(fromStored(value, kind), kind);
  return (
    <Button
      id={id}
      type="button"
      variant="outline"
      className={cn("h-9 w-full justify-start gap-2 text-left font-normal", className)}
      onClick={() => setEditing(true)}
    >
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {shown ? (
        <span className="truncate">{shown}</span>
      ) : (
        <span className="text-muted-foreground">{kind === "date" ? "Pick a date" : "Pick a date and time"}</span>
      )}
    </Button>
  );
}

export default DateFieldInput;
