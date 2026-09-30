"use client";

/**
 * The seven ITEM kinds of the keyword Ruling Session — one compact row each.
 *
 * Every `*Row` renders one item and is what its collection delegates to (via
 * `SeoRulingKindNested`); every `*Block` is the same row standing alone, reached
 * by the dispatch from that kind's `kind_component` row. Defensive readers: a
 * half-arrived value is a NORMAL state, so every field is read as optional and a
 * missing one says so rather than rendering blank. Contract: `seo-ruling-shared.tsx`.
 */

import React from "react";
import { ArrowRight, Check, ListFilter } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  SeoRulingConfirmation,
  SeoRulingCorrection,
  SeoRulingDimension,
  SeoRulingDimensionValue,
  SeoRulingExample,
  SeoRulingKeyword,
  SeoRulingMatcher,
  SeoRulingMatcherHit,
} from "@/features/content-ir/kinds/generated/kinds.generated";
import {
  RawRegion,
  StillArriving,
  isRecord,
  readKindValue,
  readNumber,
  readText,
  type ResultKindBlockProps,
} from "@/components/mardown-display/blocks/result-kinds/result-kind-shared";
import {
  Phrase,
  ReasonLine,
  RuleText,
  StandaloneItem,
  ValueChip,
  compactNumber,
  ruleWords,
  type Partialish,
} from "./seo-ruling-shared";

type RowProps<T> = { value: Partialish<T>; className?: string };

const ROW = "flex min-w-0 flex-col gap-0.5 px-2.5 py-1.5";
const LINE =
  "flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1";

/* ---------------------------------------------------------------- keyword */

export function keywordLine(value: Partialish<SeoRulingKeyword>): string {
  const clicks = readNumber(value.clicks) ?? 0;
  const impressions = readNumber(value.impressions) ?? 0;
  return `${readText(value.phrase) ?? "(no phrase)"} — ${clicks} clicks, ${impressions} impressions`;
}

export const SeoRulingKeywordRow: React.FC<RowProps<SeoRulingKeyword>> = ({
  value,
  className,
}) => {
  const clicks = readNumber(value.clicks);
  const impressions = readNumber(value.impressions);
  const id = readText(value.keyword_id);
  return (
    <div
      className={cn(ROW, className)}
      title={id ? `Keyword ${id}` : undefined}
    >
      <div className={LINE}>
        <Phrase text={readText(value.phrase)} />
        <span className="flex shrink-0 items-baseline gap-2.5 text-xs tabular-nums text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">
              {compactNumber(clicks ?? 0)}
            </span>{" "}
            clicks
          </span>
          <span>
            <span className="font-medium text-foreground">
              {compactNumber(impressions ?? 0)}
            </span>{" "}
            impr.
          </span>
        </span>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- example */

export function exampleLine(value: Partialish<SeoRulingExample>): string {
  const reason = readText(value.reason);
  return `${readText(value.phrase) ?? "(no phrase)"} → ${readText(value.dimension_label) ?? readText(value.dimension_slug) ?? "?"}: ${readText(value.value_label) ?? readText(value.value_slug) ?? "?"}${reason ? ` — ${reason}` : ""}`;
}

export const SeoRulingExampleRow: React.FC<RowProps<SeoRulingExample>> = ({
  value,
  className,
}) => (
  <div className={cn(ROW, className)}>
    <div className={LINE}>
      <Phrase text={readText(value.phrase)} />
      <ValueChip
        prefix={
          readText(value.dimension_label) ?? readText(value.dimension_slug)
        }
        label={readText(value.value_label)}
        slug={readText(value.value_slug)}
      />
    </div>
    <ReasonLine text={readText(value.reason)} />
  </div>
);

/* -------------------------------------------------------------- dimension */

function readDimensionValues(
  value: unknown,
): Partialish<SeoRulingDimensionValue>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function dimensionLine(value: Partialish<SeoRulingDimension>): string {
  const values = readDimensionValues(value.values)
    .map((entry) => readText(entry.label) ?? readText(entry.slug) ?? "?")
    .join(", ");
  return `${readText(value.label) ?? readText(value.slug) ?? "(no dimension)"}: ${values || "no values"}`;
}

export const SeoRulingDimensionRow: React.FC<RowProps<SeoRulingDimension>> = ({
  value,
  className,
}) => {
  const values = readDimensionValues(value.values);
  const described = values.some((entry) => readText(entry.description));
  const slug = readText(value.slug);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 px-2.5 py-2", className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-foreground">
            {readText(value.label) ?? slug ?? "(no dimension)"}
          </span>
          {slug ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {slug}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {values.length} {values.length === 1 ? "value" : "values"} allowed
          </span>
        </div>
        {readText(value.description) ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {readText(value.description)}
          </p>
        ) : null}
      </div>
      {values.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          No values were listed, so an agent has nothing it is allowed to
          choose.
        </p>
      ) : described ? (
        <dl className="grid min-w-0 grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-1">
          {values.map((entry, index) => (
            <React.Fragment key={`${readText(entry.slug) ?? index}`}>
              <dt className="min-w-0">
                <ValueChip
                  label={readText(entry.label)}
                  slug={readText(entry.slug)}
                  tone="neutral"
                />
              </dt>
              <dd className="min-w-0 break-words text-xs leading-snug text-muted-foreground">
                {readText(entry.description) ?? "—"}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-1">
          {values.map((entry, index) => (
            <ValueChip
              key={`${readText(entry.slug) ?? index}`}
              label={readText(entry.label)}
              slug={readText(entry.slug)}
              tone="neutral"
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------ matcher hit */

export function matcherHitLine(value: Partialish<SeoRulingMatcherHit>): string {
  return `${readText(value.phrase) ?? "(no phrase)"} → ${readText(value.value_slug) ?? "?"} (rule: search ${ruleWords(readText(value.matcher_kind), readText(value.pattern))})`;
}

export const SeoRulingMatcherHitRow: React.FC<
  RowProps<SeoRulingMatcherHit>
> = ({ value, className }) => (
  <div className={cn(ROW, className)}>
    <div className={LINE}>
      <Phrase text={readText(value.phrase)} />
      <ValueChip slug={readText(value.value_slug)} />
    </div>
    <div className="flex min-w-0 items-center gap-1">
      <ListFilter className="h-3 w-3 shrink-0 text-muted-foreground" />
      <RuleText
        matcherKind={readText(value.matcher_kind)}
        pattern={readText(value.pattern)}
      />
    </div>
  </div>
);

/* ------------------------------------------------------------- correction */

export function correctionLine(value: Partialish<SeoRulingCorrection>): string {
  const reason = readText(value.human_reason);
  return `${readText(value.phrase) ?? "(no phrase)"}: proposed ${readText(value.proposed_value_label) ?? readText(value.proposed_value_slug) ?? "?"}, corrected to ${readText(value.corrected_value_label) ?? readText(value.corrected_value_slug) ?? "?"}${reason ? ` — ${reason}` : ""}`;
}

export const SeoRulingCorrectionRow: React.FC<
  RowProps<SeoRulingCorrection>
> = ({ value, className }) => (
  <div className={cn(ROW, className)}>
    <div className={LINE}>
      <Phrase text={readText(value.phrase)} />
      <span className="flex shrink-0 items-center gap-1">
        <ValueChip
          label={readText(value.proposed_value_label)}
          slug={readText(value.proposed_value_slug)}
          tone="bad"
          strike
        />
        <ArrowRight
          className="h-3 w-3 shrink-0 text-muted-foreground"
          aria-label="corrected to"
        />
        <ValueChip
          label={readText(value.corrected_value_label)}
          slug={readText(value.corrected_value_slug)}
          tone="good"
        />
      </span>
    </div>
    <ReasonLine text={readText(value.human_reason)} />
  </div>
);

/* ----------------------------------------------------------- confirmation */

export function confirmationLine(
  value: Partialish<SeoRulingConfirmation>,
): string {
  return `${readText(value.phrase) ?? "(no phrase)"} → ${readText(value.value_label) ?? readText(value.value_slug) ?? "?"} (confirmed)`;
}

export const SeoRulingConfirmationRow: React.FC<
  RowProps<SeoRulingConfirmation>
> = ({ value, className }) => (
  <div className={cn(ROW, className)}>
    <div className={LINE}>
      <span className="flex min-w-0 items-center gap-1.5">
        <Check
          className="h-3.5 w-3.5 shrink-0 text-success"
          aria-label="confirmed"
        />
        <Phrase text={readText(value.phrase)} />
      </span>
      <ValueChip
        label={readText(value.value_label)}
        slug={readText(value.value_slug)}
        tone="good"
      />
    </div>
  </div>
);

/* ---------------------------------------------------------------- matcher */

export function matcherLine(value: Partialish<SeoRulingMatcher>): string {
  return `Search ${ruleWords(readText(value.matcher_kind), readText(value.pattern))} → ${readText(value.value_slug) ?? "?"}`;
}

export const SeoRulingMatcherRow: React.FC<RowProps<SeoRulingMatcher>> = ({
  value,
  className,
}) => (
  <div className={cn(ROW, className)}>
    <div className={LINE}>
      <span className="flex min-w-0 items-center gap-1">
        <ListFilter className="h-3 w-3 shrink-0 text-muted-foreground" />
        <RuleText
          matcherKind={readText(value.matcher_kind)}
          pattern={readText(value.pattern)}
        />
      </span>
      <ValueChip slug={readText(value.value_slug)} />
    </div>
  </div>
);

/* ------------------------------------------------ the standalone blocks */

/** Row component per item kind, and the one-line text each copies as. */
export const SEO_RULING_ITEM_ROWS = {
  seo_ruling_keyword: { Row: SeoRulingKeywordRow, line: keywordLine },
  seo_ruling_example: { Row: SeoRulingExampleRow, line: exampleLine },
  seo_ruling_dimension: { Row: SeoRulingDimensionRow, line: dimensionLine },
  seo_ruling_matcher_hit: { Row: SeoRulingMatcherHitRow, line: matcherHitLine },
  seo_ruling_correction: { Row: SeoRulingCorrectionRow, line: correctionLine },
  seo_ruling_confirmation: {
    Row: SeoRulingConfirmationRow,
    line: confirmationLine,
  },
  seo_ruling_matcher: { Row: SeoRulingMatcherRow, line: matcherLine },
} as const satisfies Record<
  string,
  {
    Row: React.FC<{ value: Record<string, unknown>; className?: string }>;
    line: (value: Record<string, unknown>) => string;
  }
>;

/**
 * ONE standalone frame for all seven items, parameterised by the kind — never a
 * component minted inside a factory closure (the React Compiler hoists inner
 * callbacks out of the render, and a closed-over factory variable is then
 * undefined at runtime).
 */
export const SeoRulingItemBlock: React.FC<
  ResultKindBlockProps & { kind: keyof typeof SEO_RULING_ITEM_ROWS }
> = ({ kind, content, metadata, className }) => {
  const { Row } = SEO_RULING_ITEM_ROWS[kind];
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value))
    return <RawRegion content={content} className={className} />;
  return (
    <StandaloneItem className={className}>
      {streaming ? (
        <div className="px-2.5 pt-1.5">
          <StillArriving />
        </div>
      ) : null}
      <Row value={value} />
    </StandaloneItem>
  );
};

export function SeoRulingKeywordBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_keyword" {...props} />;
}
export function SeoRulingExampleBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_example" {...props} />;
}
export function SeoRulingDimensionBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_dimension" {...props} />;
}
export function SeoRulingMatcherHitBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_matcher_hit" {...props} />;
}
export function SeoRulingCorrectionBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_correction" {...props} />;
}
export function SeoRulingConfirmationBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_confirmation" {...props} />;
}
export function SeoRulingMatcherBlock(props: ResultKindBlockProps) {
  return <SeoRulingItemBlock kind="seo_ruling_matcher" {...props} />;
}
