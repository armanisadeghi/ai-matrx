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
import { ExternalLink, Mail, Phone, Star } from "lucide-react";

import { InlineMarkdownWithLinks } from "@/components/mardown-display/blocks/links/InlineMarkdownWithLinks";
import { cn } from "@/utils/cn";

import { formatFieldValue } from "./format";
import { getFieldFormat } from "./registry";
import type { FieldFormatConfig } from "./types";

const MISMATCH_CLASS =
  "text-amber-600 dark:text-amber-400 decoration-amber-400/60 underline decoration-dotted underline-offset-2";

export type FormattedFieldValueProps = {
  value: unknown;
  format: FieldFormatConfig | null | undefined;
  /** Storage type — drives fallback rendering when the format doesn't fit. */
  dataType?: string;
  /** Suppress links/chips and render plain text (e.g. inside a dense grid). */
  plain?: boolean;
  className?: string;
  emptyLabel?: string;
};

export function FormattedFieldValue({
  value,
  format,
  dataType,
  plain = false,
  className,
  emptyLabel = "—",
}: FormattedFieldValueProps) {
  const result = formatFieldValue(value, format, dataType);

  if (result.empty) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  if (!result.ok) {
    return (
      <span className={cn(MISMATCH_CLASS, className)} title={result.reason}>
        {result.text}
      </span>
    );
  }

  const def = format ? getFieldFormat(format.id) : null;
  if (!plain && def?.rich) {
    const rich = renderRich(def.id, result.text, value, format, className);
    if (rich !== undefined) return rich;
  }

  return (
    <span className={cn(def?.numericAlign && "tabular-nums", className)}>
      {result.text}
    </span>
  );
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
        <span className={cn("min-w-0", className)}>
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
