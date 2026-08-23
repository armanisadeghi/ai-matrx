"use client";

/**
 * PlanPageResearchBlock — THE renderer for the `plan_page_research` kind.
 * There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * Need one piece elsewhere? Import the PART — `PlanResearchBriefLines`,
 * `PlanResearchSources`.
 *
 * WHAT THE READER NEEDS: the owner is an expert in this subject and the
 * factory is not. Sources are therefore the first-class content, not a
 * bibliography footer — they are the receipts the owner checks. A source with
 * no URL renders as a plain claim rather than a dead link, because that is
 * exactly what it is on the wire (`PlanSourceSpec`'s fields are `| None`).
 *
 * 🚨 `research_report` IS A POINTER, NOT THE REPORT (see the kind module). It
 * is labelled as a reference to the grounding document, never presented as the
 * research itself.
 *
 * Streaming-first: sources arrive one at a time; the brief list lands whole
 * when it closes.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/plan-page-research.ts`.
 */

import type { ReactNode } from "react";
import { BookOpen, ExternalLink, Loader2, Microscope, Target } from "lucide-react";

import type {
  PlanPageResearchData,
  PlanResearchSourceData,
} from "@/features/content-ir/kinds/plan-page-research";
import { cn } from "@/lib/utils";

export interface PlanPageResearchBlockProps {
  serverData?: unknown;
  className?: string;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Defensive re-read — a stale/foreign serverData renders nothing. */
export function readPlanPageResearchData(
  serverData: unknown,
): PlanPageResearchData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PlanPageResearchData>;
  if (!Array.isArray(candidate.brief) && !Array.isArray(candidate.sources)) {
    return null;
  }
  return {
    brief: strings(candidate.brief),
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    primary_keyword:
      typeof candidate.primary_keyword === "string"
        ? candidate.primary_keyword
        : null,
    research_report:
      typeof candidate.research_report === "string"
        ? candidate.research_report
        : null,
    isComplete: candidate.isComplete === true,
  };
}

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

function SectionShell({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="animate-in fade-in rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** What the research told the writer to do. */
export function PlanResearchBriefLines({
  lines,
  emptyHint,
}: {
  lines: string[];
  emptyHint?: string;
}) {
  return (
    <SectionShell
      icon={<Microscope className="h-3.5 w-3.5 text-muted-foreground" />}
      title="What the writer must know"
    >
      {lines.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {emptyHint ?? "Waiting for the first finding…"}
        </p>
      ) : (
        <ol className="mt-1.5 list-decimal space-y-1 pl-5">
          {lines.map((line, index) => (
            <li
              key={`${index}-${line.slice(0, 24)}`}
              className="animate-in fade-in text-sm leading-relaxed text-foreground"
            >
              {line}
            </li>
          ))}
        </ol>
      )}
    </SectionShell>
  );
}

/**
 * The receipts. A source with a URL is a real door — it opens in a new tab so
 * the reader never loses the page they are reviewing.
 */
export function PlanResearchSources({
  sources,
}: {
  sources: PlanResearchSourceData[];
}) {
  if (sources.length === 0) return null;
  return (
    <SectionShell
      icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />}
      title="Sources"
      hint="Check these — they are what the page's claims rest on."
    >
      <ul className="mt-1.5 space-y-1.5">
        {sources.map((source, index) => (
          <li
            key={`${index}-${source.label.slice(0, 24)}`}
            className="animate-in fade-in text-sm leading-relaxed"
          >
            <div className="flex flex-wrap items-baseline gap-1.5">
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {source.label}
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                </a>
              ) : (
                <span className="font-medium text-foreground">
                  {source.label}
                </span>
              )}
              {source.source_type ? (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                  {source.source_type}
                </span>
              ) : null}
            </div>
            {source.notes ? (
              <span className="block text-xs text-muted-foreground">
                {source.notes}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// The parent
// ---------------------------------------------------------------------------

export default function PlanPageResearchBlock({
  serverData,
  className,
}: PlanPageResearchBlockProps) {
  const data = readPlanPageResearchData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Microscope className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Research for this page
        </span>
        {data.sources.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {data.sources.length}{" "}
            {data.sources.length === 1 ? "source" : "sources"}
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Researching
          </span>
        )}
      </div>

      {data.primary_keyword ? (
        <div className="animate-in fade-in flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="text-muted-foreground">Written to win: </span>
            {data.primary_keyword}
          </p>
        </div>
      ) : null}

      <PlanResearchBriefLines lines={data.brief} />
      <PlanResearchSources sources={data.sources} />

      {data.research_report ? (
        <p className="text-[11px] text-muted-foreground">
          Grounded in a separate research document — {data.research_report}
        </p>
      ) : null}
    </div>
  );
}
