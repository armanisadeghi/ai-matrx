"use client";

/**
 * KeywordUsageChips — shows WHERE a keyword is (and isn't) used across a set
 * of observed fields (title, description, H1, URL slug…). The page-level
 * "we see your usage" connection: the target keyword set in one card is
 * visibly checked against the content every other card renders.
 */

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { normalizeKeywordPhrase } from "./data";

export interface KeywordUsageField {
  label: string;
  text: string | null | undefined;
}

/** Loose containment: the normalized phrase appears in the normalized text
 * (URL-ish fields also match hyphen/underscore-separated forms). */
export function keywordUsedIn(
  phrase: string,
  text: string | null | undefined,
): boolean {
  const needle = normalizeKeywordPhrase(phrase);
  if (!needle || !text) return false;
  const haystack = normalizeKeywordPhrase(
    text.replaceAll("-", " ").replaceAll("_", " ").replaceAll("/", " "),
  );
  return haystack.includes(needle);
}

export function KeywordUsageChips({
  phrase,
  fields,
  className,
}: {
  phrase: string;
  fields: KeywordUsageField[];
  className?: string;
}) {
  if (!phrase.trim()) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {fields.map((field) => {
        const present = keywordUsedIn(phrase, field.text);
        const missing = field.text === null || field.text === undefined || !field.text.trim();
        return (
          <span
            key={field.label}
            title={
              missing
                ? `${field.label}: no observed content to check`
                : present
                  ? `Keyword found in ${field.label.toLowerCase()}`
                  // access-errors: ok — the keyword is absent from page text we already have in hand; a string search, not a record read.
                  : `Keyword NOT found in ${field.label.toLowerCase()}`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
              missing
                ? "border-border text-muted-foreground opacity-60"
                : present
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning",
            )}
          >
            {missing ? null : present ? (
              <Check className="h-2.5 w-2.5" />
            ) : (
              <X className="h-2.5 w-2.5" />
            )}
            {field.label}
          </span>
        );
      })}
    </div>
  );
}
