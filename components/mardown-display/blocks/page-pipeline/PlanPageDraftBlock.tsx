"use client";

/**
 * PlanPageDraftBlock — THE renderer for the `plan_page_draft` kind. There is
 * no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * If you need part of a draft somewhere, import the PART exported below —
 * `PlanDraftHeadline`, `PlanDraftSections`, `PlanDraftSearchListing`. The
 * `plan_page_review` component composes exactly these to show its `revised`
 * draft; that composition is the ONLY sanctioned way to render another shape's
 * fields, and it is why there is no second draft renderer anywhere.
 *
 * WHO READS THIS: the person whose website it is — a subject-matter expert who
 * does not code. So it renders as THE PAGE, in reading order, not as a record
 * of fields: headline, opening, each section as it will appear, then the ask.
 * The writer's own `intent` for each section is kept but demoted, because it
 * is the one line that tells a non-technical owner WHY a section exists and
 * what to say if they want it changed.
 *
 * Streaming-first by construction: every field is optional at render time
 * because mid-stream it genuinely is. Sections appear one at a time as they
 * parse (`sections` is a child-kind array) — a partially arrived draft is a
 * normal, readable state, never a spinner and never raw JSON.
 *
 * 🚨 `body` is PLAIN PROSE and is rendered as TEXT. It is never HTML, and the
 * builder — not this component — turns it into markup.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/plan-page-draft.ts`.
 */

import type { ReactNode } from "react";
import { FileText, Loader2, Search, Target } from "lucide-react";

import type {
  PlanDraftSectionData,
  PlanPageDraftData,
} from "@/features/content-ir/kinds/plan-page-draft";
import { readPlanPageDraftValue } from "@/features/content-ir/kinds/plan-page-draft";
import { cn } from "@/lib/utils";

export interface PlanPageDraftBlockProps {
  serverData?: unknown;
  className?: string;
}

/**
 * The bridge already produced this shape; this re-read is the same defensive
 * boundary every kind block keeps, so a stale/foreign `serverData` renders
 * nothing rather than throwing inside the stream.
 */
export function readPlanPageDraftData(
  serverData: unknown,
): PlanPageDraftData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<PlanPageDraftData>;
  if (!Array.isArray(candidate.sections) && candidate.h1 === undefined) {
    return null;
  }
  return {
    h1: typeof candidate.h1 === "string" ? candidate.h1 : null,
    intro: typeof candidate.intro === "string" ? candidate.intro : "",
    sections: Array.isArray(candidate.sections) ? candidate.sections : [],
    callToAction:
      typeof candidate.callToAction === "string" ? candidate.callToAction : "",
    metaTitle: typeof candidate.metaTitle === "string" ? candidate.metaTitle : "",
    metaDescription:
      typeof candidate.metaDescription === "string"
        ? candidate.metaDescription
        : "",
    isComplete: candidate.isComplete === true,
  };
}

/** Project a nested draft value (a review's `revised`) with the ONE reader. */
export { readPlanPageDraftValue };

// ---------------------------------------------------------------------------
// PARTS — importable on their own so a surface can render one piece without
// re-implementing it. This is the ONLY sanctioned way to render part of a
// shape.
// ---------------------------------------------------------------------------

function SectionShell({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
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
      {children}
    </div>
  );
}

/** The page's headline and opening — what a reader sees first. */
export function PlanDraftHeadline({
  h1,
  intro,
}: {
  h1: string | null;
  intro: string;
}) {
  if (!h1 && !intro) return null;
  return (
    <div className="animate-in fade-in rounded-lg border border-primary/30 bg-primary/5 p-3">
      {h1 ? (
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {h1}
        </h3>
      ) : null}
      {intro ? (
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">{intro}</p>
      ) : null}
    </div>
  );
}

function DraftSection({ section }: { section: PlanDraftSectionData }) {
  return (
    <div className="animate-in fade-in border-l-2 border-border pl-3">
      <h4
        className={cn(
          "font-semibold leading-snug text-foreground",
          section.level === 3 ? "text-xs" : "text-sm",
        )}
      >
        {section.heading}
      </h4>
      {section.intent ? (
        <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">
          Why this section is here: {section.intent}
        </p>
      ) : null}
      {section.body ? (
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {section.body}
        </p>
      ) : null}
      {section.bullets.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {section.bullets.map((bullet, index) => (
            <li
              key={`${index}-${bullet.slice(0, 24)}`}
              className="text-sm leading-relaxed text-foreground"
            >
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Every section, in page order. */
export function PlanDraftSections({
  sections,
  emptyHint,
}: {
  sections: PlanDraftSectionData[];
  emptyHint?: string;
}) {
  return (
    <SectionShell
      icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
      title="The page"
    >
      {sections.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {emptyHint ?? "Waiting for the first section…"}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {sections.map((section, index) => (
            <DraftSection
              key={`${index}-${section.heading.slice(0, 24)}`}
              section={section}
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

/** What the page asks the reader to do next. */
export function PlanDraftCallToAction({ text }: { text: string }) {
  if (!text) return null;
  return (
    <SectionShell
      icon={<Target className="h-3.5 w-3.5 text-muted-foreground" />}
      title="What the page asks for"
    >
      <p className="mt-1 text-sm leading-relaxed text-foreground">{text}</p>
    </SectionShell>
  );
}

/** How the page will look in a search result. */
export function PlanDraftSearchListing({
  metaTitle,
  metaDescription,
}: {
  metaTitle: string;
  metaDescription: string;
}) {
  if (!metaTitle && !metaDescription) return null;
  return (
    <SectionShell
      icon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
      title="How it looks in search"
    >
      <div className="mt-1.5 rounded-md bg-muted/50 p-2">
        {metaTitle ? (
          <p className="text-sm font-medium leading-snug text-primary">
            {metaTitle}
          </p>
        ) : null}
        {metaDescription ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {metaDescription}
          </p>
        ) : null}
      </div>
    </SectionShell>
  );
}

/**
 * Every part in reading order — the whole draft body. Exported so the review
 * component shows its revised draft through THIS composition rather than a
 * hand-built twin.
 */
export function PlanDraftBody({
  data,
  emptyHint,
}: {
  data: PlanPageDraftData;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-2">
      <PlanDraftHeadline h1={data.h1} intro={data.intro} />
      <PlanDraftSections sections={data.sections} emptyHint={emptyHint} />
      <PlanDraftCallToAction text={data.callToAction} />
      <PlanDraftSearchListing
        metaTitle={data.metaTitle}
        metaDescription={data.metaDescription}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The parent — composes the parts. Nothing here that a part could own.
// ---------------------------------------------------------------------------

export default function PlanPageDraftBlock({
  serverData,
  className,
}: PlanPageDraftBlockProps) {
  const data = readPlanPageDraftData(serverData);
  if (!data) return null;

  return (
    <div className={cn("my-2 space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Page draft
        </span>
        {data.sections.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {data.sections.length}{" "}
            {data.sections.length === 1 ? "section" : "sections"}
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Writing
          </span>
        )}
      </div>
      <PlanDraftBody data={data} />
    </div>
  );
}
