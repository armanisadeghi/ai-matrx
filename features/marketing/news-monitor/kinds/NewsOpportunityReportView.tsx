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

import MarkdownStream from "@/components/MarkdownStream";

import { humanize, isRecord, num, records, str, strings } from "../run-document";
import { KindCard, Pill } from "./shared";

function sectionCount(value: unknown): number {
  // A section entry with only a marker is a placeholder, not a story.
  return records(value).filter((e) => Object.keys(e).some((k) => k !== "__kind")).length;
}

export function NewsOpportunityReportView({ value }: { value: Record<string, unknown> }) {
  const read = isRecord(value.todays_read) ? value.todays_read : {};
  const sections = isRecord(value.sections) ? value.sections : {};
  const gated = isRecord(sections.gated_out) ? sections.gated_out : {};
  const pitch = num(read.pitch_ready) || sectionCount(sections.pitch_ready);
  const big = num(read.big_stories) || sectionCount(sections.big_stories);
  const watched = num(read.watched) || sectionCount(sections.watch);
  const funnel = records(value.funnel);
  const markdown = str(value.rendered_markdown);
  const gatedEntries = Object.entries(gated)
    .filter(([k]) => k !== "__kind")
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
              <span className="font-medium text-foreground">{num(step.count)}</span>
              <span className="text-muted-foreground">{humanize(str(step.stage)).toLowerCase()}</span>
            </span>
          ))}
        </div>
      ) : null}
      {markdown.trim() ? (
        <div className="text-sm">
          <MarkdownStream
            imagePolicy="ai"
            content={markdown}
            isStreamActive={false}
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
              {n} {humanize(k).toLowerCase()}
            </Pill>
          ))}
        </div>
      ) : null}
      {strings(value.disclosures).length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Disclosures</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {strings(value.disclosures).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {strings(value.monitor_notes).length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Monitor notes</p>
          <ul className="ml-4 list-disc text-xs text-muted-foreground">
            {strings(value.monitor_notes).map((d) => (
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
