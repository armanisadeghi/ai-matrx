"use client";

/**
 * `news_opportunity_report` (NEWS-ENGINE-SPEC §6.14) — the report job's ONE
 * channel-neutral render: today's read, the funnel (copied from the committed
 * run summary), the markdown the report job wrote, disclosures and monitor
 * notes. The ONE report renderer.
 *
 * The body is the report's own `rendered_markdown`, through the one markdown
 * pipeline (`MarkdownStream`) — never re-derived here. The structured parts
 * around it (read counts, funnel, gated-out counts) come from the same value.
 */

import { RichContent } from "@/components/rich-content/RichContent";

import {
  cleanReportMarkdown,
  funnelOpenTarget,
  hasContentFields,
  isRecord,
  markdownHasSection,
  num,
  records,
  str,
  strings,
  type FunnelTarget,
} from "../run-document";
import { KindCard, Pill, formatWhen } from "./shared";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

function sectionCount(value: unknown): number {
  // A section entry with only a marker is a placeholder, not a story.
  return records(value).filter(hasContentFields).length;
}

export function NewsOpportunityReportView({
  value,
  watchedCount = null,
  onOpen,
}: {
  value: Record<string, unknown>;
  /** The run's ONE watch-list count (the digest's, `watchListCount`); the report's own when absent. */
  watchedCount?: number | null;
  /** Opens what a funnel count counts. Without it the counts are plain text. */
  onOpen?: (target: FunnelTarget) => void;
}) {
  const read = isRecord(value.todays_read) ? value.todays_read : {};
  const sections = isRecord(value.sections) ? value.sections : {};
  const gated = isRecord(sections.gated_out) ? sections.gated_out : {};
  const pitch = num(read.pitch_ready) || sectionCount(sections.pitch_ready);
  const big = num(read.big_stories) || sectionCount(sections.big_stories);
  const watched = watchedCount ?? (num(read.watched) || sectionCount(sections.watch));
  const funnel = records(value.funnel);
  const markdown = cleanReportMarkdown(str(value.rendered_markdown), formatWhen);
  // The report's markdown carries its own Disclosures / Monitor notes; never print them twice.
  const disclosures = markdownHasSection(markdown, "Disclosures") ? [] : strings(value.disclosures);
  const monitorNotes = markdownHasSection(markdown, "Monitor notes") ? [] : strings(value.monitor_notes);
  const gatedEntries = Object.entries(gated)
    .map(([k, v]) => [k, strings(v).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <KindCard
      testId="news-opportunity-report"
      title={`Today's read — ${pitch} pitch-ready · ${big} big stor${big === 1 ? "y" : "ies"} · ${watched} watched`}
      subtitle="Written by the report job from this run's triage, angles and freshness verdicts."
    >
      {funnel.length ? (
        <div className="flex flex-wrap items-center gap-1 text-xs" aria-label="Funnel">
          {funnel.map((step, i) => (
            <span key={`${str(step.stage)}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 ? <span className="text-muted-foreground">→</span> : null}
              {onOpen ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded hover:underline"
                  data-funnel-stage={str(step.stage)}
                  title={`Open the ${humanizeIdentifier(str(step.stage)).toLowerCase()} list`}
                  onClick={() => onOpen(funnelOpenTarget(str(step.stage)))}
                >
                  <span className="font-medium text-primary">{num(step.count)}</span>
                  <span className="text-muted-foreground">{humanizeIdentifier(str(step.stage)).toLowerCase()}</span>
                </button>
              ) : (
                <>
                  <span className="font-medium text-foreground">{num(step.count)}</span>
                  <span className="text-muted-foreground">{humanizeIdentifier(str(step.stage)).toLowerCase()}</span>
                </>
              )}
            </span>
          ))}
        </div>
      ) : null}
      {markdown.trim() ? (
        <div className="text-sm">
          <RichContent level="full"
            imagePolicy="ai"
            source={markdown}
            isStreaming={false}
            hideCopyButton
            allowFullScreenEditor={false}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">The report job returned no written report.</p>
      )}
      {gatedEntries.length ? (
        <div className="flex flex-wrap gap-1.5">
          {gatedEntries.map(([k, n]) => (
            <Pill key={k}>
              {n} {humanizeIdentifier(k).toLowerCase()}
            </Pill>
          ))}
        </div>
      ) : null}
      {disclosures.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Disclosures</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {disclosures.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {monitorNotes.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Monitor notes</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {monitorNotes.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {strings(value.brief_applied).length ? (
        <p className="text-xs text-muted-foreground">
          Brief applied: {strings(value.brief_applied).join("; ")}
        </p>
      ) : null}
      {str(value.brief_edit_offer) ? (
        <p className="text-xs text-foreground">Suggested brief change: {str(value.brief_edit_offer)}</p>
      ) : null}
    </KindCard>
  );
}
