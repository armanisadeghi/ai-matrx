"use client";

/**
 * The ONE read-only renderer for a formatted field value.
 *
 * Rich formats (email, link, phone, color, tags, rating, markdown) render as
 * real affordances — a mailto link, a swatch, chips, stars. Everything else
 * renders as text.
 *
 * THE FALLBACK LAW is enforced here: when `formatFieldValue` reports a
 * mismatch, the stored value is shown in amber with a tooltip explaining why,
 * instead of a blank cell or an error. A user who types "n/a" into a Currency
 * column sees `n/a` in amber, not nothing.
 */
import type { ReactNode } from "react";
import { ExternalLink, Mail, MapPin, Phone, Star } from "lucide-react";

import { InlineMarkdownWithLinks } from "@/components/mardown-display/blocks/links/InlineMarkdownWithLinks";
import { cn } from "@/utils/cn";

import {
  validateCellValue,
  type ValidationRules,
} from "@/features/data-tables/validation";

import { choiceColorClass, isChoiceFormat } from "./choices";
import { formatFieldValue } from "./format";
import { getFieldFormat } from "./registry";
import type { FieldChoice, FieldFormatConfig } from "./types";

const MISMATCH_CLASS =
  "text-amber-600 dark:text-amber-400 decoration-amber-400/60 underline decoration-dotted underline-offset-2";

export type FormattedFieldValueProps = {
  value: unknown;
  format: FieldFormatConfig | null | undefined;
  /** Storage type — drives fallback rendering when the format doesn't fit. */
  dataType?: string;
  /**
   * The column's validation rules, when it declares any. A STORED value that
   * violates one is never rewritten and never hidden — it renders in the SAME
   * amber THE FALLBACK LAW already uses for a format mismatch, with the rule's
   * reason as its tooltip. That is the whole point of declaring a rule over
   * existing data: it is how a user FINDS the values that do not fit.
   *
   * There is exactly one amber in this file and this shares it — a second
   * treatment would say "wrong" twice in two voices.
   */
  validationRules?: ValidationRules | null;
  /** Suppress links/chips and render plain text (e.g. inside a dense grid). */
  plain?: boolean;
  className?: string;
  emptyLabel?: string;
};

export function FormattedFieldValue({
  value,
  format,
  dataType,
  validationRules,
  plain = false,
  className,
  emptyLabel = "—",
}: FormattedFieldValueProps) {
  const result = formatFieldValue(value, format, dataType);

  if (result.empty) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  if (!result.ok) {
    // A choice column's mismatch is the FEATURE, not a failure: declaring the
    // options is how a user finds the stray values already in their data. Say
    // so plainly instead of the generic type-mismatch reason.
    const reason = isChoiceFormat(format?.id)
      ? "Not one of this column's options — still saved, and safe to fix or add as an option."
      : result.reason;
    return (
      <span className={cn(MISMATCH_CLASS, className)} title={reason}>
        {result.text}
      </span>
    );
  }

  // The format fits. Does the COLUMN'S RULE? A value that predates the rule is
  // legal and stays exactly as it is — it just stops looking like everything
  // else, so the user can see it and decide. `unique` is skipped here on
  // purpose: a renderer holds one value, not the column.
  if (validationRules) {
    const verdict = validateCellValue({
      rules: validationRules,
      dataType: dataType ?? "string",
      format,
      value,
    });
    if (!verdict.ok) {
      return (
        <span
          className={cn(MISMATCH_CLASS, className)}
          title={`${verdict.reason} — this value was saved before the rule, and is kept.`}
        >
          {result.text}
        </span>
      );
    }
  }

  const def = format ? getFieldFormat(format.id) : null;
  if (!plain && def?.rich) {
    const rich = renderRich(def.id, result.text, value, format, className);
    if (rich !== undefined) return rich;
  }

  // A caller that asks for `truncate` needs a BOX: `text-overflow: ellipsis`
  // does nothing on an inline span, so a long plain value in a grid cell was
  // cut mid-word with no "…" to say there is more. Only then — an inline span
  // stays inline for every caller that flows the value inside a sentence.
  const wantsTruncate = /(^|\s)truncate(\s|$)/.test(className ?? "");
  return (
    <span
      className={cn(
        wantsTruncate && "inline-block max-w-full align-bottom",
        def?.numericAlign && "tabular-nums",
        className,
      )}
      title={wantsTruncate ? result.text : undefined}
    >
      {result.text}
    </span>
  );
}

/**
 * Match a rendered value back to its declared option so the chip can carry the
 * option's color and help text. Case-insensitive, mirroring the registry.
 */
function matchChoice(
  choices: FieldChoice[] | undefined,
  value: string,
): FieldChoice | undefined {
  if (!choices || choices.length === 0) return undefined;
  const exact = choices.find((c) => c.value === value);
  if (exact) return exact;
  const lowered = value.toLowerCase();
  return choices.find((c) => c.value.toLowerCase() === lowered);
}

function renderRich(
  id: string,
  text: string,
  raw: unknown,
  config: FieldFormatConfig | null | undefined,
  className?: string,
): ReactNode | undefined {
  const linkClass = cn(
    "inline-flex items-center gap-1 text-primary hover:underline min-w-0",
    className,
  );

  switch (id) {
    case "email":
      return (
        <a
          href={`mailto:${text}`}
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "url":
      return (
        <a
          href={text.includes("://") ? text : `https://${text}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "address":
      return (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          title="Open in maps"
          onClick={(e) => e.stopPropagation()}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "progress": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      const pct = config?.options?.percentScale === "fraction" ? n * 100 : n;
      const clamped = Math.max(0, Math.min(100, pct));
      return (
        <span
          className={cn("inline-flex w-full min-w-0 items-center gap-2", className)}
          title={text}
        >
          <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamped)}
            className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn(
                "block h-full rounded-full",
                pct >= 100 ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${clamped}%` }}
            />
          </span>
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {text}
          </span>
        </span>
      );
    }
    case "phone":
      return (
        <a
          href={`tel:${text.replace(/[^\d+]/g, "")}`}
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{text}</span>
        </a>
      );
    case "color":
      return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
          <span
            className="h-4 w-4 shrink-0 rounded border border-border"
            style={{ backgroundColor: text }}
          />
          <code className="font-mono text-xs">{text}</code>
        </span>
      );
    case "markdown":
      return (
        // Same rule as the plain branch: `truncate` needs a box to end in "…".
        <span
          className={cn(
            "min-w-0",
            /(^|\s)truncate(\s|$)/.test(className ?? "") &&
              "inline-block max-w-full align-bottom",
            className,
          )}
        >
          <InlineMarkdownWithLinks text={text} />
        </span>
      );
    case "tags": {
      const items = Array.isArray(raw)
        ? raw.map((i) => String(i))
        : text.split(",").map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return undefined;
      return (
        <span className={cn("flex flex-wrap items-center gap-1", className)}>
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs"
            >
              {item}
            </span>
          ))}
        </span>
      );
    }
    case "choice":
    case "person":
    case "multi_choice": {
      const declared = config?.options?.choices;
      const values =
        id === "multi_choice"
          ? Array.isArray(raw)
            ? raw.map((i) => String(i).trim()).filter(Boolean)
            : text.split(",").map((s) => s.trim()).filter(Boolean)
          : [text];
      if (values.length === 0) return undefined;
      return (
        <span className={cn("flex flex-wrap items-center gap-1", className)}>
          {values.map((item, i) => {
            const choice = matchChoice(declared, item);
            return (
              <span
                key={`${item}-${i}`}
                title={choice?.help ?? undefined}
                className={cn(
                  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs",
                  choiceColorClass(choice?.color),
                )}
              >
                {choice?.label ?? item}
              </span>
            );
          })}
        </span>
      );
    }
    case "rating": {
      const max = config?.options?.ratingMax ?? 5;
      const score = Number(raw);
      if (!Number.isFinite(score)) return undefined;
      return (
        <span
          className={cn("inline-flex items-center gap-0.5", className)}
          title={text}
        >
          {Array.from({ length: max }, (_, i) => (
            <Star
              key={i}
              className={cn(
                "h-3.5 w-3.5",
                i < Math.round(score)
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40",
              )}
            />
          ))}
        </span>
      );
    }
    default:
      return undefined;
  }
}

export default FormattedFieldValue;
