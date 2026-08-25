"use client";

/**
 * WHY THIS SCORE — the receipt, in the two shapes a reader needs it.
 *
 *  - `WhyScoreHint`  — the ONLY form allowed inside a table cell: a small (i)
 *    that opens a thin hover popover. P26: "a novel of text never belongs in a
 *    cell — long explanations live behind an (i) hover".
 *  - `WhyScoreBody`  — the same receipt at full size, for the floating
 *    Why-this-score panel and any side panel that wants it.
 *
 * Both render through `ReasonChainDetail`, the ONE chain renderer, with the
 * link context that gives every step its editor door (reason-links.ts). There
 * is no second explanation of a score anywhere in this app — extend these.
 */

import { Info } from "lucide-react";
import Link from "next/link";
import { useOpenGscWhyScoreWindow } from "@/features/overlays/openers/gscWhyScoreWindow";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/styles/themes/utils";
import { humanizeSlug } from "../lib";
import { levelEditorLink, type ReasonLinkContext } from "../reason-links";
import type { ValueReason, ValueSource } from "../types";
import { ReasonChainDetail } from "./ReasonChain";
import { KeywordLocationLine } from "../locations/KeywordLocationLine";

export interface WhyScoreSubject {
  /** Present = the (i) can also OPEN the receipt as a floating panel. */
  keywordId?: string | null;
  keyword: string | null;
  valueBand: string | null;
  valueScore: number | null;
  valueSource: ValueSource | string | null;
  reasons: ValueReason[];
}

function asSource(value: string | null | undefined): ValueSource {
  return value === "override" || value === "computed" || value === "unvalued"
    ? value
    : "unvalued";
}

/** Level · score line — the verdict the steps below have to justify. */
function Verdict({
  subject,
  context,
}: {
  subject: WhyScoreSubject;
  context: ReasonLinkContext;
}) {
  const level = levelEditorLink(context);
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-xs font-medium text-foreground">
        {subject.valueBand ? humanizeSlug(subject.valueBand) : "Unvalued"}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {subject.valueScore === null || subject.valueScore === undefined
          ? "no score"
          : `score ${Math.round(Number(subject.valueScore)).toLocaleString()}`}
      </span>
      <Link
        href={level.href}
        className="text-[11px] text-primary hover:underline"
      >
        {level.label}
      </Link>
    </div>
  );
}

/** The full receipt. Used by the floating panel and any detail pane. */
export function WhyScoreBody({
  subject,
  context,
  className,
}: {
  subject: WhyScoreSubject;
  context: ReasonLinkContext;
  className?: string;
}) {
  const linkContext: ReasonLinkContext = {
    ...context,
    keyword: context.keyword ?? subject.keyword,
  };
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {subject.keyword ? (
        // No truncation: a keyword the reader cannot read in full is not an
        // explanation of anything.
        <p className="break-words text-xs font-medium text-foreground">
          {subject.keyword}
        </p>
      ) : null}
      <Verdict subject={subject} context={linkContext} />
      {/*
        C10 — WHICH location this keyword belongs to, and HOW that was decided.
        It sits with the other reasons because for a multi-location business
        "which branch" is part of what a local keyword MEANS (P16), not a
        separate report. `isLocal` comes from the receipt's own geo evidence, so
        "local but unplaced" is only ever said when the chain proves the search
        names a place; anything less and the line stays silent rather than
        guessing.
      */}
      {subject.keywordId ? (
        <KeywordLocationLine
          siteId={context.siteId}
          brandId={context.brandId ?? null}
          keywordId={subject.keywordId}
          isLocal={
            subject.reasons.some((reason) => reason.kind === "geo") ? true : null
          }
        />
      ) : null}
      <ReasonChainDetail
        reasons={subject.reasons}
        source={asSource(subject.valueSource)}
        linkContext={linkContext}
      />
    </div>
  );
}

/**
 * The in-table form: a small (i), a thin popover. Never a paragraph in a cell.
 * Renders nothing when there is no receipt to show — an (i) that opens empty
 * is worse than no (i).
 */
export function WhyScoreHint({
  subject,
  context,
}: {
  subject: WhyScoreSubject;
  context: ReasonLinkContext;
}) {
  const openPanel = useOpenGscWhyScoreWindow();
  if (!subject.reasons || subject.reasons.length === 0) return null;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="Why this score"
          title="Why this score — click to keep it open in a panel"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          // Hover reads it; CLICK keeps it — as a floating panel that survives
          // the pointer leaving, which is also the only way a touch device
          // reaches this content at all.
          onClick={(event) => {
            event.stopPropagation();
            if (!subject.keywordId) return;
            openPanel({
              siteId: context.siteId,
              brandId: context.brandId ?? null,
              keywordId: subject.keywordId,
              keyword: subject.keyword,
            });
          }}
        >
          <Info className="h-3 w-3" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        // A receipt can run to a dozen steps — it scrolls inside the popover
        // rather than running off the bottom of the window.
        className="max-h-[60vh] w-[22rem] max-w-[90vw] overflow-y-auto overscroll-contain p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <WhyScoreBody subject={subject} context={context} />
      </HoverCardContent>
    </HoverCard>
  );
}
