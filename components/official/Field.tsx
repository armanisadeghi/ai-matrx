/**
 * Field — the canonical above-label wrapper for any form input.
 *
 * Wraps **any** input (ProTextarea, shadcn Input, Select, custom controls) with
 * a consistent, accessible label/description/error/counter layout. Composition
 * over prop bloat: instead of every input growing label/help/error props, the
 * input stays focused on its job and `Field` owns the surrounding chrome.
 *
 * ## Layout (fixed, by design)
 *
 * ```
 *  Label *required (optional)  [?] ← help icon, hover for tooltip
 *  Description text. Markdown-style hints, format rules.
 *  ┌────────────────────────────┐
 *  │  <child input>             │
 *  └────────────────────────────┘
 *  ⚠ error message     count / max ← right-aligned, color-tiered
 * ```
 *
 * The order is fixed and not configurable. This is intentional: every Field in
 * the app should look identical so users can scan forms without re-learning.
 *
 * ## Required props
 *
 * - `label` — visible text. Always required (a Field without a label is just a div).
 * - `htmlFor` — must match the child input's `id`. This wires the label to the
 *   input for screen readers and click-to-focus. Pass the same id to the input.
 *
 * ## Usage
 *
 * Simple labelled input:
 *
 * ```tsx
 * <Field label="Title" htmlFor="title" required>
 *   <ProTextarea
 *     id="title"
 *     value={title}
 *     onChange={(e) => setTitle(e.target.value)}
 *   />
 * </Field>
 * ```
 *
 * Full feature set:
 *
 * ```tsx
 * <Field
 *   label="Bio"
 *   htmlFor="bio"
 *   required
 *   help="Markdown supported. Visible on your public profile."
 *   description="Tell visitors who you are."
 *   error={errors.bio}
 *   count={bio.length}
 *   maxCount={500}
 * >
 *   <ProTextarea id="bio" value={bio} onChange={…} />
 * </Field>
 * ```
 *
 * ## When to use what
 *
 * - **Above-label form (most cases)** → `<Field>` (this component)
 * - **Dense form, label inside the input border** → `<ProTextarea floatingLabel="…" />`
 * - **No label at all (search, comments, filters)** → bare `<ProTextarea>` with `placeholder`
 *
 * ## Constraints (intentional)
 *
 * - The label, description, error, and counter render in a fixed visual order.
 * - No `labelClassName` / `descriptionClassName` / `errorClassName` props.
 *   These are styled to a single house standard. If you need a different look,
 *   you're outside the official component's scope — build a one-off, don't fork.
 * - `required` and `optional` are mutually exclusive. If both are passed,
 *   `required` wins.
 * - The character counter is always **soft** (warns and colors but doesn't
 *   block typing). For hard DB-bound limits, also pass `maxLength` to the
 *   input itself.
 *
 * @official-component
 */

"use client";

import * as React from "react";
import { HelpCircle, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface FieldProps {
  /** Visible label text. Always required. */
  label: React.ReactNode;
  /**
   * Must match the child input's `id`. Wires the label for screen readers and
   * click-to-focus. Required — there is no "no a11y" mode.
   */
  htmlFor: string;
  /** Marks the field as required. Renders a red asterisk. Wins over `optional`. */
  required?: boolean;
  /**
   * Marks the field as optional. Renders a small grey "(optional)" tag.
   * Use sparingly — it's only worth showing when most fields nearby are required.
   */
  optional?: boolean;
  /**
   * Hover-tooltip help content. Inline shadcn Tooltip — keep it short (one or
   * two sentences). For richer help with a copy-button or AI assistance, use
   * the standalone `<HelpIcon>` component instead.
   */
  help?: React.ReactNode;
  /**
   * Static helper text rendered between the label and the input. Hidden when
   * an `error` is present so the error takes the spotlight.
   */
  description?: React.ReactNode;
  /**
   * Validation error. When set, the label turns destructive and the error
   * replaces the description. Pair with `aria-invalid` on the child input.
   */
  error?: React.ReactNode;
  /**
   * Current character/word count. Pass `value.length` (or your own metric).
   * Renders bottom-right of the field.
   */
  count?: number;
  /**
   * Soft limit. Counter turns warning at >90%, destructive past 100%.
   * **Does not block typing.** For hard limits, also set `maxLength` on the input.
   */
  maxCount?: number;
  /**
   * 🚨 **THE EMPTY-LOOKS-EMPTY RULE (2026-09-15).** The child input's current
   * value. Pass it on every `required` field.
   *
   * A required field that is EMPTY must LOOK empty. On 2026-09-15 a
   * non-technical Expert could not build their Masterwork because the name
   * field's placeholder ("Headless Headhunter Resume Review Masterwork") was
   * indistinguishable from a typed value: the screen said filled, the field
   * was empty, and the primary action sat silently disabled
   * (`teach-recent-practitioner` W2). A placeholder is a suggestion, never an
   * answer, and the screen must say which one it is showing.
   *
   * When `required` is set and this value is blank, `Field` dashes the input's
   * border, fades and italicises its placeholder, and says so underneath — so
   * no placeholder, however value-shaped, can pass for a filled field.
   *
   * Leave it `undefined` on fields you do not track; the honesty chrome then
   * never renders (it cannot know). `""` means empty and IS tracked.
   */
  value?: string | null;
  /** Outer wrapper className. The only styling escape hatch — used for layout (e.g. `flex-1`). */
  className?: string;
  /** The input. Must have `id={htmlFor}` for the label to work correctly. */
  children: React.ReactNode;
}

/**
 * @see {@link FieldProps} for the full prop contract.
 */
export function Field({
  label,
  htmlFor,
  required,
  optional,
  help,
  description,
  error,
  count,
  maxCount,
  value,
  className,
  children,
}: FieldProps) {
  /**
   * Tracked AND required AND blank. `undefined` is "not tracked" — only an
   * explicitly passed value can be judged empty.
   */
  const requiredEmpty =
    Boolean(required) && value !== undefined && !String(value ?? "").trim();
  const hasCounter = typeof count === "number";
  const overLimit = hasCounter && maxCount != null && count! > maxCount;
  const nearLimit =
    hasCounter &&
    maxCount != null &&
    count! > maxCount * 0.9 &&
    !overLimit;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={htmlFor}
          className={cn(
            "text-sm font-medium text-foreground",
            error && "text-destructive",
          )}
        >
          {label}
          {required && (
            <span className="text-destructive ml-1" aria-hidden>
              *
            </span>
          )}
          {!required && optional && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              (optional)
            </span>
          )}
        </Label>
        {help && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Help"
                  className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {help}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {description && !error && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {/*
        THE EMPTY-LOOKS-EMPTY RULE. Styled on a wrapper with descendant
        selectors rather than by cloning the child, so it holds for EVERY
        input a Field can wrap — shadcn Input, ProTextarea, a bespoke control —
        without the child having to opt in or even know.
      */}
      <div
        data-slot="field-control"
        data-required-empty={requiredEmpty ? "true" : undefined}
        className={cn(
          requiredEmpty &&
            "[&_input]:border-dashed [&_textarea]:border-dashed [&_input]:border-muted-foreground/50 [&_textarea]:border-muted-foreground/50 [&_input]:placeholder:italic [&_textarea]:placeholder:italic [&_input]:placeholder:text-muted-foreground/60 [&_textarea]:placeholder:text-muted-foreground/60",
        )}
      >
        {children}
      </div>

      {(error || hasCounter || requiredEmpty) && (
        <div className="flex items-start justify-between gap-2 min-h-[1rem]">
          {error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>{error}</span>
              <ErrorAlchemyMenu error={error} />
            </p>
          ) : requiredEmpty ? (
            <p
              data-slot="field-empty-notice"
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>Empty — the grey text is an example, not your answer.</span>
            </p>
          ) : (
            <span />
          )}
          {hasCounter && (
            <span
              className={cn(
                "text-xs tabular-nums text-muted-foreground ml-auto",
                nearLimit && "text-warning",
                overLimit && "text-destructive font-medium",
              )}
            >
              {maxCount != null ? `${count} / ${maxCount}` : `${count}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

Field.displayName = "Field";
