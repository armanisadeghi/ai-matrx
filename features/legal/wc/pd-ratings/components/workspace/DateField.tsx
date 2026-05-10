"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateFieldProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  fromYear?: number;
  toYear?: number;
  className?: string;
  id?: string;
}

const DISPLAY_FORMAT = "MM/dd/yyyy";

// Ordered list of formats to attempt when parsing user input. The user can
// type any of these — most-specific first, then progressively looser. We also
// accept compact digit-only forms (MMDDYY, MMDDYYYY) handled separately below.
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
  "yyyy/MM/dd",
];

/**
 * Accepts a wide range of US-style date inputs and returns a Date if it can
 * confidently parse one. Examples that all parse to 2026-01-04:
 *   01/04/2026, 1/4/2026, 1/4/26, 01-04-26, 1-4-26,
 *   01042026, 010426, 1.4.26, 2026-01-04
 */
function smartParseDate(raw: string): Date | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. Try the explicit format list first.
  for (const fmt of PARSE_FORMATS) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }

  // 2. Digit-only fallbacks. We strip any non-digit and check length.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 8) {
    // MMDDYYYY
    const parsed = parse(digits, "MMddyyyy", new Date());
    if (isValid(parsed)) return parsed;
  }
  if (digits.length === 6) {
    // MMDDYY
    const parsed = parse(digits, "MMddyy", new Date());
    if (isValid(parsed)) return parsed;
  }

  return undefined;
}

export function DateField({
  value,
  onChange,
  placeholder = "mm/dd/yyyy",
  disabled,
  fromYear = 1900,
  toYear,
  className,
  id,
}: DateFieldProps) {
  const today = React.useMemo(() => new Date(), []);
  const upperYear = toYear ?? today.getFullYear() + 5;
  const startMonth = React.useMemo(() => new Date(fromYear, 0, 1), [fromYear]);
  const endMonth = React.useMemo(
    () => new Date(upperYear, 11, 31),
    [upperYear],
  );

  const [text, setText] = React.useState<string>(() =>
    value ? format(value, DISPLAY_FORMAT) : "",
  );
  const [open, setOpen] = React.useState(false);
  const valueRef = React.useRef(value);
  valueRef.current = value;

  React.useEffect(() => {
    setText(value ? format(value, DISPLAY_FORMAT) : "");
  }, [value]);

  const commitText = React.useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        if (valueRef.current !== undefined) onChange(undefined);
        return;
      }
      const parsed = smartParseDate(trimmed);
      if (
        parsed &&
        parsed.getFullYear() >= fromYear &&
        parsed.getFullYear() <= upperYear
      ) {
        onChange(parsed);
        // Normalize the visible text to the canonical display format so the
        // user sees the field "snap" into shape after blur.
        setText(format(parsed, DISPLAY_FORMAT));
      } else {
        setText(
          valueRef.current ? format(valueRef.current, DISPLAY_FORMAT) : "",
        );
      }
    },
    [fromYear, onChange, upperYear],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitText(text);
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setText(value ? format(value, DISPLAY_FORMAT) : "");
      e.currentTarget.blur();
    }
  };

  const clear = () => {
    setText("");
    onChange(undefined);
  };

  return (
    <div
      className={cn(
        "relative flex items-center w-full",
        "rounded-lg border border-border bg-background",
        "transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commitText(text)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-11 flex-1 min-w-0 bg-transparent text-base font-medium tabular-nums text-foreground",
          "placeholder:text-muted-foreground/60",
          "pl-3 pr-2",
          "outline-none",
          "disabled:cursor-not-allowed",
        )}
      />
      {text && !disabled && (
        <button
          type="button"
          onClick={clear}
          tabIndex={-1}
          aria-label="Clear date"
          className="mr-0.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            className={cn(
              "mr-1 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0",
              "disabled:cursor-not-allowed",
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            captionLayout="dropdown"
            startMonth={startMonth}
            endMonth={endMonth}
            defaultMonth={
              value ?? new Date(today.getFullYear(), today.getMonth(), 1)
            }
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
