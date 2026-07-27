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

export function HeadingsOutline({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  // Evaluate the RAW headings JSON (keeps empty-text entries the display
  // parser drops) — identical to the scraper's `audit_metrics.headings`.
  const rawHeadings = isJsonRecord(snapshot.headings)
    ? headingInputsFromRaw(snapshot.headings.all)
    : [];
  const evaluation = evaluateHeadingStructure(rawHeadings);
  const desired = useDesiredValueSlice(page, "headings");
  const draft = desired.draft ?? {};
  // The header-structure PLAN — the outline this page SHOULD have, planned
  // right beside the observed reality (seedable from it).
  const desiredSection = (
    <DesiredSection
      hint="The heading structure this page SHOULD have."
      dirty={desired.dirty}
      saving={desired.saving}
      onSave={() => void desired.save()}
      onReset={desired.reset}
      className="-mx-3 -mb-3"
    >
      <DesiredOutlineEditor
        value={draft.outline ?? []}
        onChange={(outline) => desired.setDraft({ ...draft, outline })}
        seedFrom={rawHeadings.map((h) => ({ level: h.level, text: h.text }))}
      />
    </DesiredSection>
  );
  if (rawHeadings.length === 0) {
    return (
      <div className="grid gap-2 p-3">
        <AuditIssueList issues={evaluation.issues} compact />
        {desiredSection}
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
      {desiredSection}
    </div>
  );
}
