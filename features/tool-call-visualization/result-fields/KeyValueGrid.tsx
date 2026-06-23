"use client";

/**
 * KeyValueGrid — renders a plain object as a stacked definition list. Each key
 * sits above its value; values recurse through {@link ResultValue} (nested
 * objects, tables, media, urls, etc.). Identifier keys (`id`, `*_id`, `uuid`)
 * render the full UUID with an always-visible copy button.
 *
 * Every key is reachable: nothing is dropped, only deferred behind a toggle.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { humanizeKey, looksLikeUuid } from "./shape";
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

  return (
    <div className={cn("min-w-0", className)}>
      <dl className="flex flex-col gap-1">
        {shown.map(([key, val]) => (
          <div key={key} className="min-w-0">
            <dt
              className="text-[11px] font-medium leading-none text-muted-foreground"
              title={key}
            >
              {humanizeKey(key)}
            </dt>
            <dd className="mt-0.5 min-w-0">
              {renderFieldValue(key, val, density, depth)}
            </dd>
          </div>
        ))}
      </dl>
      {remaining > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(true);
          }}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          +{remaining} more {remaining === 1 ? "field" : "fields"}
        </button>
      )}
    </div>
  );
};
