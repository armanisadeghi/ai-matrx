"use client";

/**
 * KeyValueGrid — renders a plain object as a compact, shape-aware field layout.
 *
 * Fields are partitioned by what their VALUE is, not treated uniformly:
 *
 *   inline  — short values (scalar / uuid / url / boolean / empty) render as
 *             single-line `Label  value` rows on a two-column grid. Key, Type,
 *             Label never burn two lines each again.
 *   chips   — numeric metadata (total_chars, count, duration_ms, tokens…)
 *             renders as one wrapping row of quiet badges.
 *   blocks  — anything of unknown length (text, markdown, nested objects,
 *             tables, lists, media) keeps a full-width section: small label
 *             header, value beneath, recursing through {@link ResultValue}.
 *
 * Display order is inline rows → chips → blocks so unknown-length content
 * always sits last. Identifier keys (`id`, `*_id`, `uuid`) render the full
 * UUID with an always-visible copy button.
 *
 * Every key is reachable: nothing is dropped, only deferred behind a toggle.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { detectResultShape, humanizeKey, looksLikeUuid } from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";
import { ShortId } from "./ShortId";

export interface KeyValueGridProps {
  value: Record<string, unknown>;
  density?: ResultDensity;
  depth?: number;
  className?: string;
}

/** Inline cap on the number of object entries shown before "+N more". */
const INLINE_ENTRY_CAP = 8;

const IDENTIFIER_KEY = /^(id|uuid|_id|.*_id)$/i;

function isIdentifierKey(key: string): boolean {
  return IDENTIFIER_KEY.test(key);
}

/**
 * Numeric fields whose key reads as size/count metadata — rendered as quiet
 * badge chips instead of full rows. Conservative on purpose: a miss just
 * means the field renders as a normal inline row.
 */
const META_COUNT_KEY =
  /(^|_)(count|total|totals?|chars?|characters|len|length|size|bytes|tokens?|ms|milliseconds|duration|elapsed|latency)(_ms)?$/i;

function isMetaCountField(key: string, val: unknown): val is number {
  return (
    typeof val === "number" && Number.isFinite(val) && META_COUNT_KEY.test(key)
  );
}

function formatMetaNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return n.toLocaleString();
}

/** True when a value renders on a single short line (fit for an inline row). */
function isInlineValue(key: string, val: unknown): boolean {
  if (typeof val === "string" && isIdentifierKey(key) && looksLikeUuid(val)) {
    return true;
  }
  const shape = detectResultShape(val);
  return (
    shape.kind === "empty" ||
    shape.kind === "scalar" ||
    shape.kind === "uuid" ||
    shape.kind === "url"
  );
}

function renderFieldValue(
  key: string,
  val: unknown,
  density: ResultDensity,
  depth: number,
): React.ReactNode {
  if (typeof val === "string" && isIdentifierKey(key) && looksLikeUuid(val)) {
    return <ShortId value={val} variant="full" />;
  }
  return <ResultValue value={val} density={density} depth={depth + 1} />;
}

type Entry = [string, unknown];

export const KeyValueGrid: React.FC<KeyValueGridProps> = ({
  value,
  density = "inline",
  depth = 0,
  className,
}) => {
  const [showAll, setShowAll] = React.useState(false);
  const entries = Object.entries(value);

  const cap =
    density === "inline" && !showAll ? INLINE_ENTRY_CAP : entries.length;
  const shown = entries.slice(0, cap);
  const remaining = entries.length - shown.length;

  const chips: Entry[] = [];
  const inline: Entry[] = [];
  const blocks: Entry[] = [];
  for (const entry of shown) {
    const [key, val] = entry;
    if (isMetaCountField(key, val)) chips.push(entry);
    else if (isInlineValue(key, val)) inline.push(entry);
    else blocks.push(entry);
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {inline.length > 0 && (
        <dl className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
          {inline.map(([key, val]) => (
            <React.Fragment key={key}>
              <dt
                className="truncate text-xs font-medium text-muted-foreground"
                title={key}
              >
                {humanizeKey(key)}
              </dt>
              <dd className="min-w-0 text-sm">
                {renderFieldValue(key, val, density, depth)}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              title={key}
            >
              <span className="text-muted-foreground">{humanizeKey(key)}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMetaNumber(val as number)}
              </span>
            </span>
          ))}
        </div>
      )}

      {blocks.map(([key, val]) => (
        <div key={key} className="min-w-0">
          <div
            className="text-xs font-medium leading-none text-muted-foreground"
            title={key}
          >
            {humanizeKey(key)}
          </div>
          <div className="mt-1 min-w-0">
            {renderFieldValue(key, val, density, depth)}
          </div>
        </div>
      ))}

      {remaining > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(true);
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          +{remaining} more {remaining === 1 ? "field" : "fields"}
        </button>
      )}
    </div>
  );
};
