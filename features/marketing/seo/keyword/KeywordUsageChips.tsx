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
import { Chip } from "@ai-matrx/design-system/controls";

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
          <Chip
            key={field.label}
            tone={missing ? "neutral" : present ? "success" : "warning"}
            icon={missing ? undefined : present ? <Check /> : <X />}
            label={field.label}
            title={
              missing
                ? `${field.label}: no observed content to check`
                : present
                  ? `Keyword found in ${field.label.toLowerCase()}`
                  // access-errors: ok — the keyword is absent from page text we already have in hand; a string search, not a record read.
                  : `Keyword NOT found in ${field.label.toLowerCase()}`
            }
          />
        );
      })}
    </div>
  );
}
