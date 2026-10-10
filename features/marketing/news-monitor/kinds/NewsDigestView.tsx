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
import Link from "next/link";

import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { cn } from "@/lib/utils";

import {
  counts,
  isRecord,
  num,
  openTargetParam,
  records,
  setAsideListOf,
  str,
  strings,
  watchListCount,
  type OpenTarget,
} from "../run-document";
import { FactRow, KindCard, Pill, SmartLink, formatWhen } from "./shared";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface NewsDigestViewProps {
  value: Record<string, unknown>;
  /**
   * The host already shows this run's source health (the run view's "Sources
   * this run"): the digest then shows one line pointing to it, never a second copy.
   */
  onShowSourceHealth?: () => void;
  /** Per-story controls the host adds (surface anyway, dismiss). */
  storyActions?: (storyKey: string) => ReactNode;
  /**
   * Opens the list behind a count. The run view passes it; anywhere else
   * (a chat answer, the kind registry) every count links to the run view
   * with `?open=`, which opens the same list there. A count is never plain
   * text with only a tooltip.
   */
  onOpen?: (target: OpenTarget) => void;
}

const PILL_TONE = {
  neutral: "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
  good: "border-success/40 bg-success/10 text-success-ink hover:border-success",
  warn: "border-warning/40 bg-warning/10 text-warning-ink hover:border-warning",
  info: "border-primary/40 bg-primary/10 text-primary-ink hover:border-primary",
} as const;

/** A count that opens its list: a button in the run view, a link anywhere else. */
function CountPill({
  children,
  target,
  tone = "neutral",
  title,
  onOpen,
  runView,
}: {
  children: ReactNode;
  target: OpenTarget;
  tone?: keyof typeof PILL_TONE;
  title?: string;
  onOpen?: (target: OpenTarget) => void;
  runView: string;
}) {
  const className = cn(
    "inline-block max-w-[18rem] truncate rounded-full border px-1.5 py-px text-left text-[11px] leading-4 underline-offset-2 hover:underline",
    PILL_TONE[tone],
  );
  const label = `${title ? `${title} — ` : ""}open this list`;
  if (onOpen) {
    return (
      <button type="button" className={className} title={label} data-open-target={openTargetParam(target)} onClick={() => onOpen(target)}>
        {children}
      </button>
    );
  }
  if (runView) {
    const href = `${runView}${runView.includes("?") ? "&" : "?"}open=${encodeURIComponent(openTargetParam(target))}`;
    return (
      <Link href={href} className={className} title={label} data-open-target={openTargetParam(target)}>
        {children}
      </Link>
    );
  }
  return (
    <Pill tone={tone} title={title}>
      {children}
    </Pill>
  );
}

/** The digest's own grouping (aidream `engine/summary.py::watch_group`). */
function watchGroupOf(reason: string): string {
  return reason === "stale" ? "stale" : reason.startsWith("unverified_") || reason === "freshness_unverified"
    ? "freshness_unverified"
    : "set_aside";
}

function statusTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "ok") return "good";
  if (status === "not_configured" || status === "skipped" || status === "disabled")
    return "neutral";
  if (status === "unavailable" || status === "partial") return "warn";
  return "bad";
}

export function NewsDigestView({ value, storyActions, onOpen, onShowSourceHealth }: NewsDigestViewProps) {
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
  const runView = isRecord(value.links) ? str(value.links.run_view) : "";

  // Group the watch list by reason, keeping the engine's order within each.
  const byReason = new Map<string, Record<string, unknown>[]>();
  for (const entry of watch) {
    const reason = str(entry.reason) || "freshness_unverified";
    byReason.set(reason, [...(byReason.get(reason) ?? []), entry]);
  }

  return (
    <KindCard
      testId="news-digest"
      title={`Run digest — ${num(headline.surfaced)} surfaced · ${watchListCount(value) ?? 0} on the watch list`}
      subtitle={
        <>
          Run {formatWhen(str(value.run_generated_at))}
          {num(windowInfo.hours)
            ? ` · ${num(windowInfo.hours)}h freshness window (cutoff ${formatWhen(str(windowInfo.cutoff))})`
            : ""}
          {str(value.mode) ? ` · alert mode ${humanizeIdentifier(str(value.mode)).toLowerCase()}` : ""}
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        <CountPill tone="good" target={{ kind: "surfaced" }} onOpen={onOpen} runView={runView}>
          {num(headline.surfaced)} surfaced
        </CountPill>
        <CountPill tone="warn" target={{ kind: "watch", group: "freshness_unverified" }} onOpen={onOpen} runView={runView}>
          {num(headline.watching_unverified)} watching, freshness unverified
        </CountPill>
        <CountPill target={{ kind: "watch", group: "stale" }} onOpen={onOpen} runView={runView}>
          {num(headline.stale)} stale
        </CountPill>
        {Object.entries(unverified).map(([k, n]) => (
          <CountPill key={k} target={{ kind: "watch", group: k }} onOpen={onOpen} runView={runView}>
            {n} {humanizeIdentifier(k).toLowerCase()}
          </CountPill>
        ))}
        <CountPill
          tone={num(headline.withheld_safety) ? "warn" : "neutral"}
          target={{ kind: "set_aside", list: "withheld" }}
          onOpen={onOpen}
          runView={runView}
        >
          {num(headline.withheld_hygiene)} hygiene · {num(headline.withheld_safety)} safety withheld
        </CountPill>
      </div>

      <div data-digest-part="surfaced" className="scroll-mt-24 rounded-md">
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
                  <Pill tone="info">{humanizeIdentifier(str(s.triage_tier))}</Pill>
                ) : null}
                {storyActions?.(str(s.story_key))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.length ? (
        <div className="flex flex-col gap-1" aria-label="Watch groups">
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const group = str(g.group);
              const target: OpenTarget =
                group === "set_aside" ? { kind: "set_aside", list: "all" } : { kind: "watch", group };
              return (
                <CountPill
                  key={group}
                  target={target}
                  onOpen={onOpen}
                  runView={runView}
                  title={str(g.label) || humanizeIdentifier(group)}
                >
                  {group === "set_aside" ? "Set aside" : str(g.label) || humanizeIdentifier(group)}: {num(g.count)}
                </CountPill>
              );
            })}
          </div>
          {groups
            .filter((g) => str(g.group) === "set_aside" && Object.keys(counts(g.reasons)).length)
            .map((g) => (
              <div key="set-aside-reasons" className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Set aside by reason:</span>
                {Object.entries(counts(g.reasons)).map(([reason, n]) => (
                  <CountPill
                    key={reason}
                    target={{ kind: "set_aside", list: setAsideListOf(reason) }}
                    onOpen={onOpen}
                    runView={runView}
                  >
                    {humanizeIdentifier(reason).toLowerCase()} {n}
                  </CountPill>
                ))}
              </div>
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
              <div key={reason} data-watch-reason={reason} data-watch-group={watchGroupOf(reason)} className="scroll-mt-24 rounded-md">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {str(entries[0]?.label) || humanizeIdentifier(reason)} · {entries.length}
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

      {health.length && onShowSourceHealth ? (
        <p className="text-xs">
          <button type="button" className="text-primary hover:underline" onClick={onShowSourceHealth}>
            Sources this run
          </button>
        </p>
      ) : health.length ? (
        <div>
          <p className="text-xs font-medium text-foreground">Sources this run</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {/* Sources that failed for the same reason (X and X News share one token) say it once. */}
            {[...Map.groupBy(health, (h) => `${str(h.status)}|${num(h.items)}|${str(h.error)}`).values()].map((group) => {
              const h = group[0];
              return (
                <li key={group.map((g) => str(g.source_kind)).join(",")} className="flex flex-wrap items-center gap-x-2 text-xs">
                  {group.map((g) => (
                    <Pill key={str(g.source_kind)} tone={statusTone(str(h.status))}>{humanizeIdentifier(str(g.source_kind))}</Pill>
                  ))}
                  <span className="text-muted-foreground">
                    {humanizeIdentifier(str(h.status))} · {num(h.items)} item{num(h.items) === 1 ? "" : "s"}
                  </span>
                  {str(h.error) ? <span className="text-muted-foreground">— {str(h.error)}<ErrorAlchemyMenu /></span> : null}
                </li>
              );
            })}
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
