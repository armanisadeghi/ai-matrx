"use client";

// features/scraper/parts/ScrapeProvenance.tsx
//
// THE ONE place a scrape result says WHO produced it (2026-09-17).
//
// The backend now stamps every row with `engine` ("http" | "browser" |
// "cache"), `escalated`, and `escalation_reason`. Before this, a result that
// took a completely different route through the system looked identical to one
// that did not, and nobody reading the page could tell.
//
// Two rules this component exists to hold:
//   1. NEVER fabricate. Older responses carry none of these fields, so an
//      absent engine renders nothing at all rather than a guessed default.
//   2. Plain words. The escalation line is a sentence a non-technical person
//      reads, not a reason code. An unrecognized code still gets a sentence.

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Globe, MonitorPlay, DatabaseZap, ShieldAlert } from "lucide-react";
import type {
  ContentWarning,
  ScrapeEngine,
} from "@/features/scraper/types/scraper-api";

export interface ScrapeProvenanceProps {
  engine: ScrapeEngine | null | undefined;
  escalated: boolean | null | undefined;
  escalationReason: string | null | undefined;
  /**
   * The escalation reason already worded as a sentence, straight from the
   * backend (2026-09-17). Preferred over building one from `escalationReason`
   * when present — optional so every existing caller is unaffected.
   */
  escalationNote?: string | null;
  /** A row that succeeded but is suspect — shown as its own line, in words. */
  contentWarning?: ContentWarning | null;
  /** True when a configured proxy was skipped/bypassed for this row. */
  proxyBypassed?: boolean | null;
  className?: string;
}

const CONTENT_WARNING_SENTENCE: Record<ContentWarning, string> = {
  thin_content:
    "This page came back with very little readable text — it may not be the full content.",
  wrong_resource:
    "What we opened does not look like the kind of page you asked for.",
};

const ENGINE_LABEL: Record<ScrapeEngine, string> = {
  http: "Direct fetch",
  browser: "Server browser",
  cache: "From cache",
};

const ENGINE_ICON: Record<
  ScrapeEngine,
  React.ComponentType<{ className?: string }>
> = {
  http: Globe,
  browser: MonitorPlay,
  cache: DatabaseZap,
};

/**
 * The named escalation reasons, in the words the person reads. An unknown or
 * missing code falls through to the generic sentence — never to the raw code.
 */
const ESCALATION_SENTENCE: Record<string, string> = {
  cloudflare_block:
    "The normal fetch was blocked (Cloudflare), so we rendered the page in our server browser.",
  proxy_error:
    "The normal fetch could not get through, so we rendered the page in our server browser.",
  bad_status:
    "The normal fetch came back with an error, so we rendered the page in our server browser.",
  empty_content:
    "The normal fetch came back with no readable text, so we rendered the page in our server browser.",
};

const ESCALATION_FALLBACK =
  "The normal fetch did not work, so we rendered the page in our server browser.";

export function escalationSentence(reason: string | null | undefined): string {
  if (!reason) return ESCALATION_FALLBACK;
  return ESCALATION_SENTENCE[reason] ?? ESCALATION_FALLBACK;
}

export function ScrapeProvenance({
  engine,
  escalated,
  escalationReason,
  escalationNote,
  contentWarning,
  proxyBypassed,
  className,
}: ScrapeProvenanceProps) {
  // Nothing known → say nothing. An older response must not grow a badge that
  // claims an engine the server never named.
  if (!engine && escalated !== true && !contentWarning && proxyBypassed !== true)
    return null;

  const Icon = engine ? ENGINE_ICON[engine] : null;

  return (
    <div className={"flex flex-col gap-1 " + (className ?? "")}>
      {engine ? (
        <Badge
          variant="neutral"
          className="w-fit gap-1 px-1.5 py-0 text-[11px] font-normal"
        >
          {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
          {ENGINE_LABEL[engine]}
        </Badge>
      ) : null}
      {escalated === true ? (
        <p className="text-xs text-muted-foreground">
          {escalationNote?.trim() || escalationSentence(escalationReason)}
        </p>
      ) : null}
      {contentWarning ? (
        <p className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-500">
          <ShieldAlert className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
          {CONTENT_WARNING_SENTENCE[contentWarning]}
        </p>
      ) : null}
      {proxyBypassed === true ? (
        <p className="text-xs text-muted-foreground">
          A configured proxy was skipped for this page.
        </p>
      ) : null}
    </div>
  );
}
