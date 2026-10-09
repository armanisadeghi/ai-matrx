"use client";

/**
 * One section of the topic panel — the shell every section below the identity
 * block wears, so the panel reads as ONE document (Linear's issue panel: a
 * quiet uppercase heading, a count when there is one, an action at the right,
 * the rows underneath).
 *
 * A count is only printed when the caller HAS it. Absent is not zero.
 */

import type { ReactNode } from "react";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ErrorNotice } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { topicalMapErrorText } from "../errors";
import type { KindPaging } from "./useTopicAssociationPages";

export interface PanelSectionProps {
  title: string;
  /** Printed beside the title. Omit when the number is not loaded. */
  count?: number;
  /** Right-aligned control (an add button, a door). Absent in read-only hosts. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function PanelSection({ title, count, action, className, children }: PanelSectionProps) {
  return (
    <section
      aria-label={title}
      className={cn("border-t border-border pt-3", className)}
      data-panel-section={title}
    >
      <header className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 font-normal tabular-nums normal-case tracking-normal">
              {count}
            </span>
          ) : null}
        </h3>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A one-line, honest empty state for a section — never a blank gap. */
export function PanelEmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/**
 * The count a paged section prints: every row when it has them all, else the
 * tree's own total for that kind (the same number the tree row shows) — and
 * nothing when neither is known, because absent is not zero. Pass a total
 * ONLY when the tree counts exactly the rows the section lists: the tree's
 * `pages` counts `covers` edges alone, while the pages section lists every
 * page edge, so the pages section passes none (2,159 vs 3,779 on All Green).
 */
export function pagedCount(loaded: number, paging: KindPaging, total: number | undefined): number | undefined {
  return paging.hasMore ? total : loaded;
}

/**
 * "Show more" under a paged section: the section reads only the rows it
 * shows, and this continues ITS kind from the last one. Loading and a failed
 * read say so in place; the rows already shown stay.
 */
export function ShowMoreRow({
  paging,
  shown,
  total,
  noun,
}: {
  paging: KindPaging;
  shown: number;
  total?: number;
  noun: string;
}) {
  if (!paging.hasMore) return null;
  if (paging.loading) {
    return <SuspenseLoader centered={false} message={`Loading more ${noun}…`} />;
  }
  return (
    <div className="mt-1 flex flex-col gap-1">
      {paging.error ? (
        <ErrorNotice
          size="inline"
          className="text-xs"
          message={`Could not load more ${noun}: ${topicalMapErrorText(paging.error)}`}
        />
      ) : null}
      <button
        type="button"
        onClick={paging.loadMore}
        className="self-start rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {paging.error ? "Try again" : `Show more ${noun}`}
        <span className="ml-1 tabular-nums">
          ({total !== undefined ? `${shown} of ${total}` : `${shown} shown`})
        </span>
      </button>
    </div>
  );
}
