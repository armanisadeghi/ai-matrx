"use client";

/**
 * `news_digest` (NEWS-ENGINE-SPEC §6.11) — the per-run receipt: what surfaced,
 * the watch list with every reason, the withheld counts, source health, cost.
 * The ONE digest renderer: the run view, a chat answer and the kind registry
 * all render through this component.
 *
 * Never hidden (spec §7.5 coordinator amendment): every story that did not
 * surface is listed with its reason; overflow beyond the digest's cap is shown
 * as a count, never dropped silently.
 */

import type { ReactNode } from "react";

import { useCostDisplay } from "@/components/cost/useCostDisplay";

import {
  counts,
  humanize,
  isRecord,
  num,
  records,
  str,
  strings,
} from "../run-document";
import { FactRow, KindCard, Pill, SmartLink, formatWhen } from "./shared";

export interface NewsDigestViewProps {
  value: Record<string, unknown>;
  /** Per-story controls the host adds (surface anyway, dismiss). */
  storyActions?: (storyKey: string) => ReactNode;
}

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ok") return "good";
  if (status === "not_configured" || status === "skipped" || status === "disabled")
    return "neutral";
  if (status === "unavailable" || status === "partial") return "warn";
  return "bad";
}

export function NewsDigestView({ value, storyActions }: NewsDigestViewProps) {
  const { format: formatCost } = useCostDisplay();
  const headline = isRecord(value.headline) ? value.headline : {};
  const surfaced = records(value.surfaced);
  const watch = records(value.watch);
  const groups = records(value.watch_groups);
  const withheld = isRecord(value.withheld) ? value.withheld : {};
  const health = records(value.source_health);
  const cost = isRecord(value.cost) ? value.cost : {};
  const windowInfo = isRecord(value.window) ? value.window : {};
  const unverified = counts(headline.unverified_by_status);
  const overflow = num(value.watch_overflow);

  // Group the watch list by reason, keeping the engine's order within each.
  const byReason = new Map<string, Record<string, unknown>[]>();
  for (const entry of watch) {
    const reason = str(entry.reason) || "freshness_unverified";
    byReason.set(reason, [...(byReason.get(reason) ?? []), entry]);
  }

  return (
    <KindCard
      testId="news-digest"
      title={`Run digest — ${num(headline.surfaced)} surfaced · ${watch.length + overflow} on the watch list`}
      subtitle={
        <>
          Run {formatWhen(str(value.run_generated_at))}
          {num(windowInfo.hours)
            ? ` · ${num(windowInfo.hours)}h freshness window (cutoff ${formatWhen(str(windowInfo.cutoff))})`
            : ""}
          {str(value.mode) ? ` · alert mode ${humanize(str(value.mode)).toLowerCase()}` : ""}
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        <Pill tone="good">{num(headline.surfaced)} surfaced</Pill>
        <Pill tone="warn">{num(headline.watching_unverified)} watching, freshness unverified</Pill>
        <Pill>{num(headline.stale)} stale</Pill>
        {Object.entries(unverified).map(([k, n]) => (
          <Pill key={k}>
            {n} {humanize(k).toLowerCase()}
          </Pill>
        ))}
        <Pill tone={num(headline.withheld_safety) ? "warn" : "neutral"}>
          {num(headline.withheld_hygiene)} hygiene · {num(headline.withheld_safety)} safety withheld
        </Pill>
      </div>

      <div>
        <p className="text-xs font-medium text-foreground">Surfaced</p>
        {surfaced.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing cleared the freshness gate on a verified clock this run.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {surfaced.map((s) => (
              <li key={str(s.story_key)} className="flex flex-wrap items-center gap-x-2 text-sm">
                {str(s.canonical_url) ? (
                  <SmartLink href={str(s.canonical_url)}>{str(s.title)}</SmartLink>
                ) : (
                  <span className="text-foreground">{str(s.title)}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {num(s.outlet_count)} outlet{num(s.outlet_count) === 1 ? "" : "s"} · first public{" "}
                  {formatWhen(str(s.first_public_at))}
                </span>
                {str(s.triage_tier) ? (
                  <Pill tone="info">{humanize(str(s.triage_tier))}</Pill>
                ) : null}
                {storyActions?.(str(s.story_key))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Watch groups">
          {groups.map((g) => (
            <Pill key={str(g.group)} title={Object.entries(counts(g.reasons)).map(([k, n]) => `${humanize(k)}: ${n}`).join(" · ")}>
              {str(g.label) || humanize(str(g.group))}: {num(g.count)}
              {num(g.listed) < num(g.count) ? ` (${num(g.listed)} listed)` : ""}
            </Pill>
          ))}
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-foreground">Watch list — each with why it did not surface</p>
        {watch.length === 0 ? (
          <p className="text-xs text-muted-foreground">No stories are on the watch list.</p>
        ) : (
          <div className="mt-1 flex flex-col gap-2">
            {[...byReason.entries()].map(([reason, entries]) => (
              <div key={reason}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {str(entries[0]?.label) || humanize(reason)} · {entries.length}
                </p>
                <ul className="mt-0.5 flex flex-col gap-1">
                  {entries.map((w) => (
                    <li key={str(w.story_key)} className="text-sm">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="text-foreground">{str(w.title)}</span>
                        <span className="text-xs text-muted-foreground">
                          {num(w.outlet_count)} outlet{num(w.outlet_count) === 1 ? "" : "s"}
                          {strings(w.top_outlets).length ? ` (${strings(w.top_outlets).join(", ")})` : ""} · size{" "}
                          {str(w.story_size_band) || "unknown"} · earliest {formatWhen(str(w.earliest_evidence_at))}
                        </span>
                        {storyActions?.(str(w.story_key))}
                      </div>
                      {str(w.detail) ? (
                        <p className="text-xs text-muted-foreground">{str(w.detail)}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {overflow > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {overflow} more on the watch list beyond this digest&apos;s cap — open the run to see every one.
          </p>
        ) : null}
      </div>

      {health.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Sources this run</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {health.map((h) => (
              <li key={str(h.source_kind)} className="flex flex-wrap items-center gap-x-2 text-xs">
                <Pill tone={statusTone(str(h.status))}>{humanize(str(h.source_kind))}</Pill>
                <span className="text-muted-foreground">
                  {humanize(str(h.status))} · {num(h.items)} item{num(h.items) === 1 ? "" : "s"}
                </span>
                {str(h.error) ? <span className="text-muted-foreground">— {str(h.error)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-0.5">
        <FactRow label="Cost">
          this run {formatCost(num(cost.run_usd))} · this month {formatCost(num(cost.month_to_date_usd))} of{" "}
          {formatCost(num(cost.ceiling_usd))}
        </FactRow>
        {num(withheld.hygiene) + num(withheld.safety) > 0 && str(withheld.open_url) ? (
          <FactRow label="Withheld">
            <SmartLink href={str(withheld.open_url)}>Open the withheld list</SmartLink>
          </FactRow>
        ) : null}
        {isRecord(value.links) && str(value.links.run_view) ? (
          <FactRow label="Run">
            <SmartLink href={str(value.links.run_view)}>Open this run</SmartLink>
          </FactRow>
        ) : null}
      </div>
    </KindCard>
  );
}
