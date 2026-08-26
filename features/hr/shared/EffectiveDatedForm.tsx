// features/hr/shared/EffectiveDatedForm.tsx
//
// EFFECTIVE-DATED EDITING — THE UX CONTRACT (SPEC-EMPLOYEES §6).
//
// "This is the single most misimplemented part of any HRIS." It is specified once
// and reused by the Job tab, the Compensation tab, the reporting-line editor and
// the pay-group workweek control. Every rule below is spec, not preference:
//
//  1. THE DATE FIELD IS FIRST, not last. It is labelled **Effective**, never
//     "Date", and it is PRE-SET TO TODAY (§6.1).
//  2. A FUTURE DATE CHANGES THE FORM'S VERB. The primary button reads
//     **Schedule change**, not Save, and a persistent line states the consequence:
//     *"Takes effect 1 Oct 2026. Nothing changes until then."*
//  3. 🚨 THE CORRECTION-VS-AMENDMENT QUESTION IS ASKED IN THESE WORDS, AND ONLY
//     WHEN THE CHOSEN DATE IS IN THE PAST (§6.3; Arman's Q5 ruling, R-L1 §F):
//        "This is wrong; it was never true."             → correction
//        "It was true, and now something new is true."    → amendment
//        "It should have been true from an earlier date." → backdated_correction
//     GUESSING THE CATEGORY FROM THE DATE ALONE IS HOW AUDIT TRAILS GET DESTROYED.
//     There is no default selection, and the form cannot submit without an answer.
//     The three sentences live in `constants.ts` (`HR_CHANGE_INTENTS`) so no
//     surface can paraphrase them.
//  4. HOW FAR AHEAD a change may be scheduled is the knob
//     `hr.employees.future_dated_change_max_days` — read from `hr_knob_index`,
//     NEVER a constant in this file. A knob whose `origin` is `missing` is named
//     out loud rather than silently replaced with a number (service.ts).
//
// Dates here are plain `YYYY-MM-DD` calendar days, which is what `effective_from`
// is in the database. They are never `Date` objects across a boundary and never
// UTC-shifted — a change effective "1 Oct" is 1 Oct wherever the reader sits.

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { HR_CHANGE_INTENTS } from "../constants";
import { fetchHrKnobs } from "../service";
import { useHrContext } from "./useHrContext";

// ── The vocabulary ──────────────────────────────────────────────────────────

/** Identical to `HrChangeIntent`; named for the form that asks the question. */
export type EffectiveDatingMode =
  | "amendment"
  | "correction"
  | "backdated_correction";

export type EffectiveDatingValue = {
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** null until the user answers §6.3's question. Never defaulted, never guessed. */
  mode: EffectiveDatingMode | null;
  isFuture: boolean;
  isPast: boolean;
};

export type EffectiveDating = {
  value: EffectiveDatingValue;
  setDate: (date: string) => void;
  setMode: (mode: EffectiveDatingMode) => void;
  /** The primary button's word: "Save" today/past, "Schedule change" ahead. */
  verb: string;
  /** The persistent consequence sentence, or null when there is nothing to warn. */
  consequenceLine: string | null;
  /** True when the date is in the past, so §6.3's question must be answered. */
  needsMode: boolean;
  isValid: boolean;
};

/** The knob that caps how far ahead a change may be scheduled. */
export const HR_FUTURE_DATED_MAX_DAYS_KEY =
  "hr.employees.future_dated_change_max_days";

// ── Calendar-day helpers (local days, never UTC instants) ───────────────────

export function hrToday(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const probe = new Date(year, month - 1, date + days);
  const m = `${probe.getMonth() + 1}`.padStart(2, "0");
  const d = `${probe.getDate()}`.padStart(2, "0");
  return `${probe.getFullYear()}-${m}-${d}`;
}

/** "1 Oct 2026" — the format §6.1's sentence is written in. */
export function hrFormatDay(day: string): string {
  if (!isCalendarDay(day)) return day;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── The hook ────────────────────────────────────────────────────────────────

/**
 * Everything a form needs to obey §6, and nothing it can get wrong.
 *
 * The mode RESETS whenever the date leaves the past — an answer to "was it ever
 * true?" that survives the user changing the date to next month is an answer to a
 * question nobody asked, and it would be written to the audit trail as if it were.
 */
export function useEffectiveDating(initial?: string): EffectiveDating {
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    initial && isCalendarDay(initial) ? initial : hrToday(),
  );
  const [mode, setModeState] = useState<EffectiveDatingMode | null>(null);

  const today = hrToday();
  const valid = isCalendarDay(effectiveFrom);
  const isFuture = valid && effectiveFrom > today;
  const isPast = valid && effectiveFrom < today;

  const setDate = useCallback((date: string) => {
    setEffectiveFrom(date);
  }, []);

  const setMode = useCallback((next: EffectiveDatingMode) => {
    setModeState(next);
  }, []);

  useEffect(() => {
    if (!isPast && mode !== null) setModeState(null);
  }, [isPast, mode]);

  const intent = mode ? HR_CHANGE_INTENTS.find((i) => i.value === mode) : null;

  const consequenceLine = isFuture
    ? `Takes effect ${hrFormatDay(effectiveFrom)}. Nothing changes until then.`
    : intent
      ? intent.consequence
      : null;

  return {
    value: { effectiveFrom, mode, isFuture, isPast },
    setDate,
    setMode,
    verb: isFuture ? "Schedule change" : "Save",
    consequenceLine,
    needsMode: isPast,
    isValid: valid && (!isPast || mode !== null),
  };
}

// ── The knob ────────────────────────────────────────────────────────────────

type FutureLimit = {
  /** null while loading, or when the knob could not be read. */
  maxDaysAhead: number | null;
  /** Set when the knob is missing — named out loud, never silently replaced. */
  knobError: string | null;
  isLoading: boolean;
};

/**
 * Read `hr.employees.future_dated_change_max_days` from the knob index.
 *
 * There is no fallback number here on purpose. A silent default is exactly how a
 * knob becomes a constant, and the platform default (365) already lives in the
 * knob registry, which is the one place it belongs.
 */
export function useHrFutureDatedLimit(): FutureLimit {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const [state, setState] = useState<FutureLimit>({
    maxDaysAhead: null,
    knobError: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!organizationId) {
      setState({ maxDaysAhead: null, knobError: null, isLoading: false });
      return;
    }
    let cancelled = false;

    void (async () => {
      const result = await fetchHrKnobs({ organizationId });
      if (cancelled) return;

      if (!result.ok) {
        setState({
          maxDaysAhead: null,
          knobError: null,
          isLoading: false,
        });
        return;
      }

      const knob = result.data.keys.find(
        (k) =>
          k.full_key === HR_FUTURE_DATED_MAX_DAYS_KEY ||
          `${k.feature}.${k.key}` === HR_FUTURE_DATED_MAX_DAYS_KEY,
      );

      if (!knob || knob.origin === "missing") {
        setState({
          maxDaysAhead: null,
          knobError: `The setting ${HR_FUTURE_DATED_MAX_DAYS_KEY} has no value for this employer, so how far ahead a change may be scheduled is unknown. Ask whoever runs HR here to set it.`,
          isLoading: false,
        });
        return;
      }

      const raw = knob.effective_value;
      const parsed =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : Number.NaN;

      setState({
        maxDaysAhead: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null,
        knobError: Number.isFinite(parsed)
          ? null
          : `The setting ${HR_FUTURE_DATED_MAX_DAYS_KEY} is not a number of days, so this form cannot tell you how far ahead you may schedule.`,
        isLoading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}

// ── The date field ──────────────────────────────────────────────────────────

/**
 * THE FIRST FIELD ON THE FORM. Renders the date, then — only when the date is in
 * the past — §6.3's question in its exact words, then the consequence line.
 */
export function EffectiveDateField({
  value,
  onChange,
  onModeChange,
  maxDaysAhead,
  label = "Effective",
  consequenceLine,
  disabled,
  className,
}: {
  value: EffectiveDatingValue;
  onChange: (date: string) => void;
  /** Required in practice whenever a past date is reachable. */
  onModeChange?: (mode: EffectiveDatingMode) => void;
  /** From `useHrFutureDatedLimit()`. null → no ceiling is applied. */
  maxDaysAhead?: number | null;
  label?: string;
  consequenceLine?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const dateId = useId();
  const max =
    typeof maxDaysAhead === "number" && maxDaysAhead > 0
      ? addDays(hrToday(), maxDaysAhead)
      : undefined;
  const beyondCeiling = Boolean(max && value.effectiveFrom > max);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1.5">
        <Label htmlFor={dateId} className="text-xs font-medium">
          {label}
        </Label>
        <Input
          id={dateId}
          type="date"
          value={value.effectiveFrom}
          max={max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full max-w-[16rem] sm:h-9"
        />
        {beyondCeiling && max ? (
          <p className="text-xs text-destructive">
            This employer allows changes to be scheduled up to{" "}
            {hrFormatDay(max)}. Pick that day or earlier.
          </p>
        ) : null}
      </div>

      {value.isPast ? (
        <fieldset className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <legend className="px-1 text-xs font-medium text-foreground">
            That date has passed. Which of these is true?
          </legend>
          <RadioGroup
            value={value.mode ?? ""}
            onValueChange={(next) => onModeChange?.(next as EffectiveDatingMode)}
            disabled={disabled}
            className="gap-2"
          >
            {HR_CHANGE_INTENTS.map((intent) => (
              <label
                key={intent.value}
                htmlFor={`${dateId}-${intent.value}`}
                className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent/50 sm:min-h-9"
              >
                <RadioGroupItem
                  id={`${dateId}-${intent.value}`}
                  value={intent.value}
                  className="mt-0.5 shrink-0"
                />
                <span className="min-w-0 space-y-0.5">
                  {/* Verbatim from HR_CHANGE_INTENTS — never paraphrased. */}
                  <span className="block text-sm text-foreground">
                    {intent.prompt}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {intent.consequence}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      ) : null}

      {consequenceLine ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{consequenceLine}</span>
        </p>
      ) : null}
    </div>
  );
}

// ── The form ────────────────────────────────────────────────────────────────

/**
 * The whole §6 contract in one wrapper: date first, the page's own fields next,
 * the consequence line persistent, and a primary button whose WORD comes from the
 * date. Callers own `onSubmit` and read `dating.value` for the payload.
 */
export function EffectiveDatedForm({
  dating,
  onSubmit,
  submitting = false,
  children,
  disabled = false,
  label,
  cancel,
  className,
}: {
  dating: EffectiveDating;
  onSubmit: () => void | Promise<void>;
  submitting?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  /** Override the date field's label. Defaults to "Effective" — almost never changed. */
  label?: string;
  /** A cancel/secondary control rendered beside the primary button. */
  cancel?: ReactNode;
  className?: string;
}) {
  const { maxDaysAhead, knobError } = useHrFutureDatedLimit();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || disabled || !dating.isValid) return;
    void onSubmit();
  };

  const blocked = submitting || disabled || !dating.isValid;

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {/* FIRST. Always. */}
      <EffectiveDateField
        value={dating.value}
        onChange={dating.setDate}
        onModeChange={dating.setMode}
        maxDaysAhead={maxDaysAhead}
        label={label}
        consequenceLine={dating.consequenceLine}
        disabled={submitting || disabled}
      />

      {knobError ? (
        <p className="text-xs text-destructive">{knobError}</p>
      ) : null}

      {children}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={blocked} className="min-h-11 sm:min-h-9">
          {dating.verb}
        </Button>
        {cancel}
        {dating.needsMode && dating.value.mode === null ? (
          <span className="text-xs text-muted-foreground">
            Pick one of the three above first.
          </span>
        ) : null}
      </div>
    </form>
  );
}
