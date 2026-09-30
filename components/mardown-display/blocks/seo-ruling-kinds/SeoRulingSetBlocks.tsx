"use client";

/**
 * The seven COLLECTION kinds of the keyword Ruling Session — what the proposer
 * and rule-writer agents are told, one list each.
 *
 * One frame for all seven: a compact header (what the list is, how many, copy
 * controls — plain Copy, Copy-for-AI, JSON) over a divided list whose every row
 * is the item kind's own component, delegated through `SeoRulingKindNested`.
 * An empty list is a SENTENCE saying what that absence means to the agent (the
 * blind check sends several of them empty on purpose), never a blank card.
 * Long lists show the first rows and say how many more there are.
 */

import React from "react";
import {
  BookOpenCheck,
  CheckCheck,
  KeyRound,
  ListChecks,
  PencilLine,
  Tags,
  ListFilter,
  type LucideIcon,
} from "lucide-react";

import { KIND_KEY } from "@ai-matrx/content-ir";
import { cn } from "@/lib/utils";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import {
  LeftoverFields,
  RawRegion,
  isRecord,
  readKindValue,
  type ResultKindBlockProps,
} from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import { SEO_RULING_ITEM_ROWS } from "./SeoRulingItemBlocks";
import { SeoRulingKindNested } from "./SeoRulingKindNested";
import {
  type SeoRulingCollectionKind,
  type SeoRulingItemKind,
} from "./seo-ruling-shared";

/** How many rows show before "Show all". Enough to read, few enough to scan. */
export const SEO_RULING_VISIBLE_ROWS = 25;

interface CollectionSpec {
  /** The one list field the collection kind carries. */
  field: string;
  item: SeoRulingItemKind;
  title: string;
  /** What this list IS to the agent, in one line. */
  subtitle: string;
  /** Counted noun, singular and plural. */
  noun: [string, string];
  icon: LucideIcon;
  /** What an EMPTY list means — said, never implied by a blank. */
  empty: string;
}

export const SEO_RULING_COLLECTIONS: Record<
  SeoRulingCollectionKind,
  CollectionSpec
> = {
  seo_ruling_keyword_set: {
    field: "keywords",
    item: "seo_ruling_keyword",
    title: "Keywords to rule",
    subtitle: "The searches the proposer is asked to stamp a value on.",
    noun: ["keyword", "keywords"],
    icon: KeyRound,
    empty: "No keywords were sent, so there is nothing to propose a value for.",
  },
  seo_ruling_example_set: {
    field: "examples",
    item: "seo_ruling_example",
    title: "Your rulings",
    subtitle: "What the person already decided, with the reason they gave.",
    noun: ["ruling", "rulings"],
    icon: BookOpenCheck,
    empty:
      "No rulings were sent — on the blind check the proposer works without your examples.",
  },
  seo_ruling_dimension_catalog: {
    field: "dimensions",
    item: "seo_ruling_dimension",
    title: "Allowed values",
    subtitle:
      "The dimension being ruled and the only values an agent may choose.",
    noun: ["dimension", "dimensions"],
    icon: Tags,
    empty:
      "No dimension was sent, so no value is allowed — the agent cannot answer.",
  },
  seo_ruling_matcher_hit_set: {
    field: "hits",
    item: "seo_ruling_matcher_hit",
    title: "Already explained by your rules",
    subtitle: "Keywords the site's own rules decided, and the rule that did.",
    noun: ["keyword", "keywords"],
    icon: ListFilter,
    empty:
      "No rule hits were sent — either no rule matched, or this is the blind check.",
  },
  seo_ruling_correction_set: {
    field: "corrections",
    item: "seo_ruling_correction",
    title: "Corrections",
    subtitle:
      "Proposals the person ruled wrong, and the value they chose instead.",
    noun: ["correction", "corrections"],
    icon: PencilLine,
    empty:
      "No corrections — every reviewed proposal was ruled right or left unreviewed.",
  },
  seo_ruling_confirmation_set: {
    field: "confirmations",
    item: "seo_ruling_confirmation",
    title: "Confirmed right",
    subtitle: "Proposals the person ruled right.",
    noun: ["confirmation", "confirmations"],
    icon: CheckCheck,
    empty: "No confirmations — no proposal was ruled right in this round.",
  },
  seo_ruling_matcher_set: {
    field: "matchers",
    item: "seo_ruling_matcher",
    title: "Rules in play",
    subtitle: "The site rules behind the proposals being taught from.",
    noun: ["rule", "rules"],
    icon: ListChecks,
    empty:
      "No site rules were in play — every proposal came from the system, not a rule.",
  },
};

/**
 * ONE component for all seven collections, parameterised by the kind — never a
 * component minted inside a factory closure: the React Compiler hoists inner
 * callbacks out of the render and a closed-over factory variable is then
 * undefined at runtime (found in the browser, 2026-09-30).
 */
export const SeoRulingSetBlock: React.FC<
  ResultKindBlockProps & { kind: SeoRulingCollectionKind }
> = ({ kind, content, metadata, className }) => {
  const spec = SEO_RULING_COLLECTIONS[kind];
  const [showAll, setShowAll] = React.useState(false);
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value))
    return <RawRegion content={content} className={className} />;

  const raw = value[spec.field];
  const items = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const skipped = Array.isArray(raw) ? raw.length - items.length : 0;
  const visible = showAll ? items : items.slice(0, SEO_RULING_VISIBLE_ROWS);
  const hidden = items.length - visible.length;
  const { line } = SEO_RULING_ITEM_ROWS[spec.item];
  const noun = items.length === 1 ? spec.noun[0] : spec.noun[1];

  return (
    <div className={cn("my-2 min-w-0 space-y-2", className)}>
      <KindHeaderBar
        icon={spec.icon}
        title={spec.title}
        subtitle={spec.subtitle}
        streaming={streaming}
        stats={[{ label: noun, value: items.length }]}
        copy={{
          label: spec.title,
          hide: ["export"],
          human: () => items.map((item) => line(item)).join("\n"),
          json: () => value,
          agent: () => ({
            kind,
            location: "Keyword Ruling Session",
            description: spec.subtitle,
            data: value,
          }),
        }}
      />

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
          {streaming ? "Still arriving…" : spec.empty}
        </p>
      ) : (
        <div className="min-w-0 divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {visible.map((item, index) => (
            <SeoRulingKindNested key={index} kind={spec.item} value={item} />
          ))}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full px-2.5 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-muted/60"
            >
              Show all {items.length} {noun} ({hidden} more)
            </button>
          ) : null}
        </div>
      )}

      {skipped > 0 ? (
        <p className="text-xs text-warning">
          {skipped} {skipped === 1 ? "entry" : "entries"} in “{spec.field}”{" "}
          {skipped === 1 ? "is" : "are"} not a record and cannot be shown as a{" "}
          {spec.noun[0]} — copy the JSON to see {skipped === 1 ? "it" : "them"}.
        </p>
      ) : null}

      {/* HIDE NOTHING: a key the kind did not declare still arrives. */}
      <LeftoverFields value={value} omit={[spec.field, KIND_KEY]} />
    </div>
  );
};

export function SeoRulingKeywordSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_keyword_set" {...props} />;
}
export function SeoRulingExampleSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_example_set" {...props} />;
}
export function SeoRulingDimensionCatalogBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_dimension_catalog" {...props} />;
}
export function SeoRulingMatcherHitSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_matcher_hit_set" {...props} />;
}
export function SeoRulingCorrectionSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_correction_set" {...props} />;
}
export function SeoRulingConfirmationSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_confirmation_set" {...props} />;
}
export function SeoRulingMatcherSetBlock(props: ResultKindBlockProps) {
  return <SeoRulingSetBlock kind="seo_ruling_matcher_set" {...props} />;
}
