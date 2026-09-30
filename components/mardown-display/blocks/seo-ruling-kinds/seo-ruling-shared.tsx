"use client";

/**
 * Shared substrate for the fourteen keyword RULING SESSION kinds
 * (`aidream/kinds/seo_ruling_session.py`): seven collections, each ONE list of
 * a registered item kind. They are what the SEO keyword Ruling Session agents
 * are TOLD (`seo.ruling_session_proposal` / `seo.ruling_session_teach`), built by
 * `features/marketing/seo/value-system/workbench/session/trial.ts`.
 *
 * THE READER'S QUESTION for every one of them: *what exactly did we tell the
 * agent?* So each item is ONE compact row — the search phrase leads, the value
 * it was given is a chip, the reason is a quiet line beneath — and a collection
 * is a divided list of those rows under one header with its count and the copy
 * controls. The same row renders an item standing alone and an item inside its
 * collection (the collection delegates through `SeoRulingKindNested`), so there
 * is ONE row per kind, never a second rendering of it.
 *
 * ROUTE CONTRACT: reached through `applyIrKindRoute`'s resolver-only path from
 * each kind's bundled `kind_component` row (aidream migration
 * `20260930030000_seo_ruling_session_kinds_get_their_components.sql`); the value
 * comes from `readKindValue` (envelope first, bare JSON floor, verbatim region
 * when nothing parsed) — the substrate the result-kind families share.
 */

import React from "react";

import { cn } from "@/lib/utils";
import { matcherKindWords } from "@/features/marketing/seo/value-system/workbench/session/trial";

/** Every slug this family owns: seven collections and their seven items. */
export const SEO_RULING_ITEM_KINDS = [
  "seo_ruling_keyword",
  "seo_ruling_example",
  "seo_ruling_dimension",
  "seo_ruling_matcher_hit",
  "seo_ruling_correction",
  "seo_ruling_confirmation",
  "seo_ruling_matcher",
] as const;
export type SeoRulingItemKind = (typeof SEO_RULING_ITEM_KINDS)[number];

export const SEO_RULING_COLLECTION_KINDS = [
  "seo_ruling_keyword_set",
  "seo_ruling_example_set",
  "seo_ruling_dimension_catalog",
  "seo_ruling_matcher_hit_set",
  "seo_ruling_correction_set",
  "seo_ruling_confirmation_set",
  "seo_ruling_matcher_set",
] as const;
export type SeoRulingCollectionKind =
  (typeof SEO_RULING_COLLECTION_KINDS)[number];

/**
 * A value that may be half-arrived. The field NAMES come from the registry's
 * generated type (a misspelt field is a type error); every value is `unknown`
 * because nothing guarantees it arrived, and the readers narrow it.
 */
export type Partialish<T> = { [K in keyof T]?: unknown };

export type ChipTone = "neutral" | "good" | "bad" | "accent";

const TONE: Record<ChipTone, string> = {
  neutral: "border-border bg-muted/60 text-foreground",
  good: "border-success/30 bg-success/10 text-success",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
  accent: "border-primary/30 bg-primary/10 text-primary",
};

/**
 * The value a keyword was given. The label leads; when only the slug arrived
 * (the rule kinds carry no label) the slug is shown as the code it is — never a
 * made-up label.
 */
export const ValueChip: React.FC<{
  label?: string | null;
  slug?: string | null;
  prefix?: string | null;
  tone?: ChipTone;
  strike?: boolean;
  className?: string;
}> = ({ label, slug, prefix, tone = "accent", strike = false, className }) => {
  const text = label ?? slug;
  if (!text) return null;
  return (
    <span
      title={slug && label ? `${label} (${slug})` : undefined}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[11px] font-medium leading-4",
        TONE[tone],
        className,
      )}
    >
      {prefix ? <span className="font-normal opacity-70">{prefix}</span> : null}
      <span
        className={cn(
          "truncate",
          !label && "font-mono",
          strike && "line-through",
        )}
      >
        {text}
      </span>
    </span>
  );
};

/** "contains the word “near”" — the plain-words form of a site rule. */
export function ruleWords(
  matcherKind: string | null,
  pattern: string | null,
): string {
  const words = matcherKindWords(matcherKind ?? "");
  return pattern ? `${words} “${pattern}”` : `${words} (no pattern)`;
}

export const RuleText: React.FC<{
  matcherKind: string | null;
  pattern: string | null;
  className?: string;
}> = ({ matcherKind, pattern, className }) => (
  <span className={cn("min-w-0 text-xs text-muted-foreground", className)}>
    <span>Search {matcherKindWords(matcherKind ?? "")} </span>
    {pattern ? (
      <span className="font-mono text-foreground">“{pattern}”</span>
    ) : (
      <span className="italic">(no pattern)</span>
    )}
  </span>
);

/** A reason somebody gave, quoted — or nothing when none was given. */
export const ReasonLine: React.FC<{
  text: string | null;
  className?: string;
}> = ({ text, className }) =>
  text ? (
    <p
      className={cn(
        "min-w-0 break-words text-xs leading-snug text-muted-foreground",
        className,
      )}
    >
      “{text}”
    </p>
  ) : null;

/** The search phrase — the headline of every row. */
export const Phrase: React.FC<{ text: string | null; className?: string }> = ({
  text,
  className,
}) => (
  <span
    className={cn(
      "min-w-0 break-words text-sm font-medium leading-snug",
      text ? "text-foreground" : "italic text-muted-foreground",
      className,
    )}
  >
    {text ?? "(no phrase)"}
  </span>
);

/** Compact number: 1,240 → "1.2K". Tabular so a column of them aligns. */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

/** The frame an item uses when it stands alone (a collection draws its own). */
export const StandaloneItem: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      "my-2 min-w-0 overflow-hidden rounded-md border border-border bg-card",
      className,
    )}
  >
    {children}
  </div>
);
