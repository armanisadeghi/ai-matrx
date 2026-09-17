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
import { Globe, MonitorPlay, DatabaseZap } from "lucide-react";
import type { ScrapeEngine } from "@/features/scraper/types/scraper-api";

export interface ScrapeProvenanceProps {
  engine: ScrapeEngine | null | undefined;
  escalated: boolean | null | undefined;
  escalationReason: string | null | undefined;
  className?: string;
}

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
  className,
}: ScrapeProvenanceProps) {
  // Nothing known → say nothing. An older response must not grow a badge that
  // claims an engine the server never named.
  if (!engine && escalated !== true) return null;

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
          {escalationSentence(escalationReason)}
        </p>
      ) : null}
    </div>
  );
}
