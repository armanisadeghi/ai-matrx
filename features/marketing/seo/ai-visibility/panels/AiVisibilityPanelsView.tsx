"use client";

// features/marketing/seo/ai-visibility/panels/AiVisibilityPanelsView.tsx
//
// /marketing/brands/[brandId]/sites/[siteId]/ai-visibility/panels — the saved
// prompt panels and what they say over time (WP4 build step 5).
//
// Overview answers "what did an assistant say when I asked just now". This
// answers the question that actually decides whether anything is working: "are
// we showing up, and is that getting better or worse".
//
// 🚨 EVERY RATE CAN SAY "NOT MEASURED". A panel that has not run shows exactly
// that, never 0% — a fabricated zero here reads as "assistants never mention
// you" and sends a non-technical expert rewriting their whole site.
//
// THE DOOR LAW: each question opens the saved AI answers behind it, and each
// panel's health opens its own run history.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  MessageSquareQuote,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  SectionCard,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";
import {
  buildPanelTrend,
  fetchPanelAnswers,
  formatPanelRate,
  listSitePanels,
  panelKeyMessages,
  panelPrompts,
  PANEL_TREND_DAYS,
  type AiVisibilityPanelRow,
  type PanelTrend,
} from "./service";

interface LoadedPanel {
  row: AiVisibilityPanelRow;
  trend: PanelTrend;
}

/** A panel that has never run is not a broken panel — say which it is. */
function healthTone(row: AiVisibilityPanelRow): "default" | "good" | "warning" | "bad" {
  if (!row.last_run_status) return "default";
  if (row.last_run_status === "failed") return "bad";
  if (row.last_run_status === "partial") return "warning";
  return "good";
}

function healthLabel(row: AiVisibilityPanelRow): string {
  if (!row.last_run_status) return "Not run yet";
  return {
    ok: "Healthy",
    partial: "Partly answered",
    empty: "Nothing to ask",
    failed: "Failed",
  }[row.last_run_status as string] ?? row.last_run_status;
}

function PromptRow({
  standing,
  sitePath,
}: {
  standing: PanelTrend["prompts"][number];
  sitePath: string;
}) {
  const asked = standing.enginesMentioning.length + standing.enginesAbsent.length;
  return (
    <div className="px-3 py-2" data-surface-value="panel_prompt_row">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-xs font-medium">{standing.text}</span>
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums",
            asked === 0 ? "text-muted-foreground/70" : "text-muted-foreground",
          )}
        >
          {asked === 0
            ? "not measured"
            : `${standing.enginesMentioning.length}/${asked} engines`}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {standing.verdict}
        {standing.lastMeasuredAt ? (
          <span className="ml-1">
            Last asked {formatCompactDate(standing.lastMeasuredAt)}.
          </span>
        ) : null}
      </p>
      {standing.responseIds.length > 0 ? (
        <Link
          href={`${sitePath}/ai-visibility/history`}
          className="mt-1 inline-flex text-[11px] text-primary hover:underline"
        >
          Read the {standing.responseIds.length} saved answer(s)
        </Link>
      ) : null}
    </div>
  );
}

function TrendBars({ trend }: { trend: PanelTrend }) {
  if (trend.points.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        Nothing measured in the last {PANEL_TREND_DAYS} days. This panel runs on
        its own cadence — there is nothing to switch on.
      </p>
    );
  }
  return (
    <div className="flex items-end gap-1 px-3 py-3">
      {trend.points.map((point) => (
        <span
          key={point.bucket}
          title={`Week of ${point.bucket}: named in ${formatPanelRate(point.mentionRate)} of ${point.answers} answer(s)`}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span className="flex w-full flex-col justify-end" style={{ height: 56 }}>
            <span
              className="w-full rounded-t bg-primary/70"
              style={{ height: `${point.mentionRate ?? 0}%` }}
            />
          </span>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {point.bucket.slice(5)}
          </span>
        </span>
      ))}
    </div>
  );
}

function PanelCard({
  panel,
  sitePath,
}: {
  panel: LoadedPanel;
  sitePath: string;
}) {
  const { row, trend } = panel;
  const prompts = panelPrompts(row);
  const messages = panelKeyMessages(row);
  return (
    <SectionCard title={row.name} anchor="ai_visibility_panel">
      <div className="grid grid-cols-2 border-b border-border/60 sm:grid-cols-4">
        <MetricCell
          anchor="panel_mention_rate"
          label="Named in answers"
          value={formatPanelRate(trend.mentionRate, "Not measured")}
          detail={`${trend.answers.toLocaleString()} answer(s) in ${PANEL_TREND_DAYS} days`}
          tone={trend.mentionRate === null ? "default" : "good"}
          icon={<ScanSearch className="h-3.5 w-3.5" />}
        />
        <MetricCell
          anchor="panel_citation_rate"
          label="Cited as a source"
          value={formatPanelRate(trend.citationRate, "Not measured")}
          detail="the assistant linked to you"
          icon={<MessageSquareQuote className="h-3.5 w-3.5" />}
        />
        <MetricCell
          anchor="panel_cadence"
          label="Cadence"
          value={
            row.cadence_days === 1 ? "Daily" : `Every ${row.cadence_days} days`
          }
          detail={`${prompts.length} question(s), up to ${row.max_prompts_per_run} per run`}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
        />
        <MetricCell
          anchor="panel_health"
          label="Last run"
          value={healthLabel(row)}
          detail={
            row.last_run_at
              ? `${formatCompactDate(row.last_run_at)}${
                  row.last_run_cost_usd ? ` · $${Number(row.last_run_cost_usd).toFixed(2)}` : ""
                }`
              : trend.answers > 0
                ? // A panel follows a QUESTION, not its own runs: answers
                  // collected earlier for the same question at this site count,
                  // because they are the same measurement. Say so, or the two
                  // facts read as a contradiction.
                  "the schedule will pick it up — answers below are from earlier runs of the same questions"
                : "the schedule will pick it up"
          }
          tone={healthTone(row)}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
      </div>

      {row.last_error ? (
        <div className="flex items-start gap-2 border-b border-border/60 bg-amber-500/5 px-3 py-2 text-[11px]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            <span className="font-medium">Last run reported a problem: </span>
            {row.last_error}
          </span>
        </div>
      ) : null}

      <p className="px-3 py-2 text-xs text-muted-foreground">{trend.headline}</p>
      <TrendBars trend={trend} />

      <div className="border-t border-border/60">
        <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Questions
        </p>
        <div className="flex flex-col divide-y divide-border/60">
          {trend.prompts.map((standing) => (
            <PromptRow key={standing.key} standing={standing} sitePath={sitePath} />
          ))}
        </div>
      </div>

      {messages.length > 0 ? (
        <div className="border-t border-border/60">
          <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Your key messages
          </p>
          <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {trend.messages.map((message) => (
              <div key={message.key} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium">{message.label}</span>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      message.presenceRate === null && "text-muted-foreground/70",
                    )}
                  >
                    {formatPanelRate(message.presenceRate, "—")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {message.verdict}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function AiVisibilityPanelsView({
  siteId,
  sitePath,
}: {
  siteId: string;
  sitePath: string;
}) {
  const [panels, setPanels] = useState<LoadedPanel[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await listSitePanels(siteId);
      const loaded = await Promise.all(
        rows.map(async (row) => ({
          row,
          trend: buildPanelTrend(row, await fetchPanelAnswers(row)),
        })),
      );
      setPanels(loaded);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !panels) return <LoadingSurface label="Loading your prompt panels…" />;
  if (error && !panels) {
    return (
      <InlineQueryError
        what="AI visibility panels"
        error={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Prompt panels</h1>
          <p className="text-xs text-muted-foreground">
            A saved set of buyer questions, asked across every answer engine on a
            cadence — so &ldquo;are we showing up in AI answers&rdquo; is a trend
            and not a screenshot.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      {panels && panels.length === 0 ? (
        <SectionCard title="No panels yet" anchor="ai_visibility_panels_empty">
          <div className="px-3 py-4 text-xs text-muted-foreground">
            <p>
              A panel is a handful of the questions your buyers actually ask.
              Once one exists, it runs on its own schedule and this page becomes
              a trend — every question, every engine, and whether your key
              messages are the ones coming back.
            </p>
            <p className="mt-2">
              Panels are declared through the platform&rsquo;s AI-visibility
              service (each run is priced before it spends and capped per pass).
              In the meantime, the{" "}
              <Link
                href={`${sitePath}/ai-visibility`}
                className="text-primary hover:underline"
              >
                one-off analyzer
              </Link>{" "}
              answers the same question for a single query, right now.
            </p>
          </div>
        </SectionCard>
      ) : null}

      {panels?.map((panel) => (
        <PanelCard key={panel.row.id} panel={panel} sitePath={sitePath} />
      ))}
    </main>
  );
}
