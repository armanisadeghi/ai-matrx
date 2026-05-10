"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { type DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─────────────────────────────────────────────────────────────────────────────
// Local primitives — a card and a section header
// ─────────────────────────────────────────────────────────────────────────────

function DemoCard({
  title,
  source,
  notes,
  children,
}: {
  title: string;
  source: string;
  notes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 pt-3 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
          {source}
        </p>
        {notes && (
          <p className="mt-1.5 text-xs text-muted-foreground">{notes}</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
    </div>
  );
}

function SectionHeader({
  title,
  blurb,
}: {
  title: string;
  blurb: React.ReactNode;
}) {
  return (
    <div className="space-y-1 pt-2">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="max-w-3xl text-sm text-muted-foreground">{blurb}</p>
    </div>
  );
}

function ValueLine({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="mt-auto border-t border-border/60 pt-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}:</span>{" "}
      <span className="font-mono text-foreground/70">{value || "—"}</span>
    </div>
  );
}

function fmt(date: Date | undefined) {
  return date ? format(date, "MM/dd/yyyy") : "";
}

function fmtRange(range: DateRange | undefined) {
  if (!range?.from) return "";
  if (!range.to) return fmt(range.from);
  return `${fmt(range.from)} → ${fmt(range.to)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart parser — accepts every reasonable date shape and normalizes to
// MM/dd/yyyy, our single standardized display format.
// ─────────────────────────────────────────────────────────────────────────────

const DISPLAY_FORMAT = "MM/dd/yyyy";

const PARSE_FORMATS = [
  "MM/dd/yyyy",
  "M/d/yyyy",
  "MM/dd/yy",
  "M/d/yy",
  "MM-dd-yyyy",
  "M-d-yyyy",
  "MM-dd-yy",
  "M-d-yy",
  "MM.dd.yyyy",
  "M.d.yyyy",
  "MM.dd.yy",
  "M.d.yy",
  "MM dd yyyy",
  "M d yyyy",
  "MM dd yy",
  "M d yy",
  "yyyy-MM-dd",
];

function smartParseDate(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  for (const f of PARSE_FORMATS) {
    const d = parse(trimmed, f, new Date());
    if (isValid(d)) return d;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    const d = parse(digits, "MMddyyyy", new Date());
    if (isValid(d)) return d;
  }
  if (digits.length === 6) {
    const d = parse(digits, "MMddyy", new Date());
    if (isValid(d)) return d;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Single date — smart input + popover with dropdown caption
// ─────────────────────────────────────────────────────────────────────────────

function CanonicalSingle() {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [text, setText] = React.useState("");

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      setDate(undefined);
      return;
    }
    const parsed = smartParseDate(raw);
    if (parsed) {
      setDate(parsed);
      setText(format(parsed, DISPLAY_FORMAT));
    } else if (date) {
      setText(format(date, DISPLAY_FORMAT));
    }
  };

  return (
    <>
      <div className="relative flex w-full items-center rounded-lg border border-border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <input
          value={text}
          placeholder="mm/dd/yyyy"
          inputMode="numeric"
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(e.currentTarget.value);
              e.currentTarget.blur();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base font-medium tabular-nums outline-none sm:text-sm"
        />
        {text && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setText("");
              setDate(undefined);
            }}
            className="mr-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open date picker"
              className="mr-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              captionLayout="dropdown"
              startMonth={new Date(1900, 0, 1)}
              endMonth={new Date(2100, 11, 31)}
              onSelect={(d) => {
                setDate(d);
                if (d) setText(format(d, DISPLAY_FORMAT));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <ValueLine label="value" value={fmt(date)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Date range — two smart inputs + shared 2-month popover with
// `resetOnSelect` so a fresh click always starts a new range.
// ─────────────────────────────────────────────────────────────────────────────

function CanonicalRange() {
  const [open, setOpen] = React.useState(false);
  const [range, setRange] = React.useState<DateRange | undefined>(undefined);
  const [startText, setStartText] = React.useState("");
  const [endText, setEndText] = React.useState("");

  const commitStart = (raw: string) => {
    if (raw.trim() === "") {
      setRange((r) => (r ? { ...r, from: undefined } : undefined));
      return;
    }
    const parsed = smartParseDate(raw);
    if (parsed) {
      setRange((r) => {
        const to = r?.to && parsed > r.to ? undefined : r?.to;
        return { from: parsed, to };
      });
      setStartText(format(parsed, DISPLAY_FORMAT));
    } else if (range?.from) {
      setStartText(format(range.from, DISPLAY_FORMAT));
    }
  };

  const commitEnd = (raw: string) => {
    if (raw.trim() === "") {
      setRange((r) => (r ? { ...r, to: undefined } : undefined));
      return;
    }
    const parsed = smartParseDate(raw);
    if (parsed) {
      setRange((r) => {
        if (r?.from && parsed < r.from) {
          return { from: parsed, to: r.from };
        }
        return { from: r?.from, to: parsed };
      });
      setEndText(format(parsed, DISPLAY_FORMAT));
    } else if (range?.to) {
      setEndText(format(range.to, DISPLAY_FORMAT));
    }
  };

  return (
    <>
      <div className="relative flex w-full items-center rounded-lg border border-border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <input
          value={startText}
          placeholder="mm/dd/yyyy"
          inputMode="numeric"
          aria-label="Start date"
          onChange={(e) => setStartText(e.target.value)}
          onBlur={(e) => commitStart(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitStart(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
          className="h-10 w-0 min-w-0 flex-1 bg-transparent pr-2 pl-3 text-base font-medium tabular-nums outline-none sm:text-sm"
        />
        <span className="select-none px-1 text-sm text-muted-foreground">
          —
        </span>
        <input
          value={endText}
          placeholder="mm/dd/yyyy"
          inputMode="numeric"
          aria-label="End date"
          onChange={(e) => setEndText(e.target.value)}
          onBlur={(e) => commitEnd(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEnd(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
          className="h-10 w-0 min-w-0 flex-1 bg-transparent pr-2 pl-1 text-base font-medium tabular-nums outline-none sm:text-sm"
        />
        {(startText || endText) && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setStartText("");
              setEndText("");
              setRange(undefined);
            }}
            className="mr-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open date range picker"
              className="mr-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              defaultMonth={range?.from}
              selected={range}
              numberOfMonths={2}
              required={false}
              // resetOnSelect: when a complete range is already set, clicking
              // a fresh date STARTS A NEW RANGE from that click instead of
              // extending or shrinking the current one. Without this, RDP v9
              // makes you click on the existing `from`/`to` to break the
              // range first, which feels like a double-click requirement.
              // See node_modules/react-day-picker/dist/esm/selection/useRange.js
              resetOnSelect
              onSelect={(next) => {
                setRange(next);
                setStartText(
                  next?.from ? format(next.from, DISPLAY_FORMAT) : "",
                );
                setEndText(next?.to ? format(next.to, DISPLAY_FORMAT) : "");
                if (next?.from && next?.to) setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <ValueLine label="range" value={fmtRange(range)} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Date + time — smart-input date picker, plus a time field that no longer
// shows seconds and is sized to fit hour + minute + AM/PM without clipping.
// ─────────────────────────────────────────────────────────────────────────────

function CanonicalDateTime() {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const [text, setText] = React.useState("");
  const [time, setTime] = React.useState("09:00");

  const commit = (raw: string) => {
    if (raw.trim() === "") {
      setDate(undefined);
      return;
    }
    const parsed = smartParseDate(raw);
    if (parsed) {
      setDate(parsed);
      setText(format(parsed, DISPLAY_FORMAT));
    } else if (date) {
      setText(format(date, DISPLAY_FORMAT));
    }
  };

  return (
    <>
      <div className="flex w-full gap-2">
        <div className="relative flex flex-1 items-center rounded-lg border border-border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <input
            value={text}
            placeholder="mm/dd/yyyy"
            inputMode="numeric"
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(e.currentTarget.value);
                e.currentTarget.blur();
              }
            }}
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base font-medium tabular-nums outline-none sm:text-sm"
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Open date picker"
                className="mr-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                defaultMonth={date}
                captionLayout="dropdown"
                startMonth={new Date(1900, 0, 1)}
                endMonth={new Date(2100, 11, 31)}
                onSelect={(d) => {
                  setDate(d);
                  if (d) setText(format(d, DISPLAY_FORMAT));
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          // No `step={1}` — we don't need seconds, which is what was causing
          // the AM/PM portion to get clipped at this width. Default step is
          // 60 (minutes), giving HH:MM (+ AM/PM where the browser shows it).
          className="h-10 w-32 rounded-lg border border-border bg-background px-3 text-base font-medium tabular-nums outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm [&::-webkit-calendar-picker-indicator]:hidden"
        />
      </div>
      <ValueLine
        label="value"
        value={date ? `${fmt(date)} ${time}` : time ? time : ""}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main demo
// ─────────────────────────────────────────────────────────────────────────────

export default function DatePickersDemo() {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Canonical date pickers"
        blurb={
          <>
            Single date, date range, and date + time — all three sit on the same{" "}
            <code className="font-mono text-xs">
              components/ui/calendar.tsx
            </code>{" "}
            (RDP v9, latest shadcn). The calendar now uses a Radix Select
            instead of the native browser dropdown so the year list scrolls
            inside a 288px popover instead of taking over the screen, and the
            range picker resets cleanly on every click. Display format is{" "}
            <code className="font-mono text-xs">MM/DD/YYYY</code> everywhere and
            inputs accept any reasonable shape (
            <code className="font-mono text-xs">010426</code>,{" "}
            <code className="font-mono text-xs">1-4-26</code>,{" "}
            <code className="font-mono text-xs">2026-01-04</code>, etc.) and
            normalize on blur.
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DemoCard
          title="Date"
          source="smart input + popover (single)"
          notes="Type any reasonable shape and tab away; the calendar icon opens a 1-month popover with month/year dropdowns. Year dropdown is capped at max-h-72 and scrolls."
        >
          <CanonicalSingle />
        </DemoCard>

        <DemoCard
          title="Date range"
          source="smart input pair + popover (range, resetOnSelect)"
          notes="Two inputs that parse independently, plus a 2-month range calendar. Clicking a third date starts a fresh range from that click — no double-click, no shrinking, no extending."
        >
          <CanonicalRange />
        </DemoCard>

        <DemoCard
          title="Date + time"
          source="smart input + time field"
          notes="Time uses step=60 (HH:MM, no seconds) and a w-32 field — wide enough for the AM/PM that some browsers append. No more clipping."
        >
          <CanonicalDateTime />
        </DemoCard>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Rollout</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            <code className="font-mono">components/ui/calendar.tsx</code> is the
            only file that owns dropdown behavior — fixes here cascade to every
            picker.
          </li>
          <li>
            Three components above will be promoted to{" "}
            <code className="font-mono">components/ui/date-picker.tsx</code>,{" "}
            <code className="font-mono">date-range-picker.tsx</code>, and{" "}
            <code className="font-mono">date-time-picker.tsx</code> and replace
            every existing wrapper (
            <code className="font-mono">DatePicker</code>,{" "}
            <code className="font-mono">MatrxDatePicker</code>,{" "}
            <code className="font-mono">MatrxDateRangePicker</code>,{" "}
            <code className="font-mono">MatrxDatePickerWithPresets</code>,{" "}
            <code className="font-mono">DateField</code>).
          </li>
          <li>
            Single display format: <code className="font-mono">MM/DD/YYYY</code>
            . The smart parser still accepts every reasonable input shape on
            entry and normalizes on blur.
          </li>
        </ul>
      </div>
    </div>
  );
}
