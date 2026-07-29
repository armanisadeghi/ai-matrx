"use client";

import { Badge } from "@/components/ui/badge";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import {
  evaluateHeadingStructure,
  headingInputsFromRaw,
} from "@/features/marketing/seo/audit/headings";
import { AuditIssueList } from "@/features/marketing/seo/audit/AuditIssueList";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { DesiredOutlineEditor } from "@/features/marketing/components/pages/desired/DesiredOutlineEditor";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";
import { cn } from "@/lib/utils";

function rawHeadingInputs(snapshot: PageSnapshot | null) {
  // Evaluate the RAW headings JSON (keeps empty-text entries the display
  // parser drops) — identical to the scraper's `audit_metrics.headings`.
  return snapshot && isJsonRecord(snapshot.headings)
    ? headingInputsFromRaw(snapshot.headings.all)
    : [];
}

/**
 * CURRENT lane only — the observed heading structure. The outline PLAN moved
 * to `HeadingsPlan` (Plan lane) in the Current|Plan|Studio split.
 */
export function HeadingsOutline({
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const rawHeadings = rawHeadingInputs(snapshot);
  const evaluation = evaluateHeadingStructure(rawHeadings);
  if (rawHeadings.length === 0) {
    return (
      <div className="grid gap-2 p-3">
        <AuditIssueList issues={evaluation.issues} compact />
      </div>
    );
  }
  // Mark outline rows involved in a skipped-level transition so the warning
  // is visible in place, not just in the issue list.
  const skipsAfter = new Set<number>();
  for (let i = 1; i < rawHeadings.length; i += 1) {
    if (rawHeadings[i].level > rawHeadings[i - 1].level + 1) skipsAfter.add(i);
  }
  return (
    <div className="grid gap-2.5 p-3">
      <AuditIssueList
        issues={evaluation.issues}
        successText={`Clean outline — ${evaluation.total} headings, exactly one H1, no skipped levels.`}
        compact
      />
      <ol className="grid max-h-80 gap-1 overflow-y-auto">
        {rawHeadings.map((heading, index) => (
          <li
            key={`${heading.level}:${index}`}
            className="flex min-w-0 items-baseline gap-2 text-xs"
            style={{ paddingLeft: `${(heading.level - 1) * 14}px` }}
          >
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] uppercase",
                heading.level === 1
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
              )}
            >
              h{heading.level}
            </span>
            <span
              className={cn(
                "truncate",
                !heading.text.trim()
                  ? "italic text-muted-foreground"
                  : heading.level === 1
                    ? "font-medium text-foreground"
                    : "text-foreground/90",
              )}
            >
              {heading.text.trim() || "(empty heading)"}
            </span>
            {skipsAfter.has(index) ? (
              <Badge variant="warning" className="shrink-0 text-[9px]">
                skipped level
              </Badge>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The PLAN half of the headings card: the outline this page SHOULD have
 * (`desired_values.headings`), seedable from the observed structure when a
 * snapshot exists. Works without one — planning never waits for a crawl.
 */
export function HeadingsPlan({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot | null;
}) {
  const rawHeadings = rawHeadingInputs(snapshot);
  const desired = useDesiredValueSlice(page, "headings");
  const draft = desired.draft ?? {};
  return (
    <DesiredSection
      hint="The heading structure this page SHOULD have."
      dirty={desired.dirty}
      saving={desired.saving}
      onSave={() => void desired.save()}
      onReset={desired.reset}
      className="border-t-0"
    >
      <DesiredOutlineEditor
        value={draft.outline ?? []}
        onChange={(outline) => desired.setDraft({ ...draft, outline })}
        seedFrom={rawHeadings.map((h) => ({ level: h.level, text: h.text }))}
      />
    </DesiredSection>
  );
}
