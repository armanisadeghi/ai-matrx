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
// 🚨 NO POOLED HEADLINE. Each panel shows the six named metrics from the
// server (`PanelMetricsSection`), each split by set, way of asking, prompted
// state, engine and wave — never "named in X% of answers, up N points".
// Each panel also carries its Design section (steps, reviews, files) and the
// page offers "Design a panel", the create form it never had.
//
// 🚨 EVERY RATE CAN SAY "NOT MEASURED". A panel that has not run shows exactly
// that, never 0% — a fabricated zero here reads as "assistants never mention
// you" and sends a non-technical expert rewriting their whole site.
//
// THE DOOR LAW: each question opens the saved AI answers behind it, and each
// panel's health opens its own run history.

import { useState } from "react";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { humanizeBackendError } from "@/utils/errors";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  SectionCard,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import type { MarketingSite } from "@/features/marketing/types";
import { cn } from "@/lib/utils";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  buildPanelTrend,
  fetchPanelAnswers,
  listSitePanels,
  panelKeyMessages,
  panelPrompts,
  type AiVisibilityPanelRow,
  type PanelTrend,
} from "./service";
import { DesignPanelForm } from "./DesignPanelForm";
import { PanelDesignSection, usePanelDesign } from "./PanelDesignSection";
import { PanelMetricsSection } from "./PanelMetricsSection";
import { panelStatusInfo } from "./format";
import { panelQueryKeys } from "./panel-api";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  brandId,
  siteId,
}: {
  standing: PanelTrend["prompts"][number];
  brandId: string | null;
  siteId: string;
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
          href={marketingRoutes.site(
            brandId,
            siteId,
            "/ai-visibility/history",
          )}
          className="mt-1 inline-flex text-[11px] text-primary hover:underline"
        >
          Read the {standing.responseIds.length} saved answer(s)
        </Link>
      ) : null}
    </div>
  );
}

/** Read a column lane A adds to the panel row, before the generated types carry it. */
function rowStatus(row: AiVisibilityPanelRow): string | null {
  const extended = row as AiVisibilityPanelRow & { status?: unknown; design_run_id?: unknown };
  const value = extended.status;
  // A hand-typed panel carries the column default "draft" but was never designed: calling it
  // "still being designed" would be false. It reads as hand-typed (null) until a design runs.
  if (value === "draft" && !extended.design_run_id) return null;
  return typeof value === "string" ? value : null;
}

function PanelCard({
  panel,
  brandId,
  siteId,
  organizationId,
}: {
  panel: LoadedPanel;
  brandId: string | null;
  siteId: string;
  organizationId: string;
}) {
  const { row, trend } = panel;
  const { format: formatCostDisplay } = useCostDisplay();
  const prompts = panelPrompts(row);
  const messages = panelKeyMessages(row);
  const design = usePanelDesign(row.id, organizationId);
  const status = panelStatusInfo(design.data?.panel_status ?? rowStatus(row));
  const blindReviewOpen = Boolean(design.data?.open_gate?.blind);
  return (
    <SectionCard
      title={row.name}
      anchor="ai_visibility_panel"
      headerExtra={
        <Badge variant={status.tone} className="whitespace-nowrap">
          {status.label}
        </Badge>
      }
    >
      <p className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{status.label}: </span>
        {status.explanation}
      </p>
      <div className="grid grid-cols-2 border-b border-border/60">
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
          anchor="panel_health"          label="Last run"
          value={healthLabel(row)}
          detail={
            row.last_run_at
              ? `${formatCompactDate(row.last_run_at)}${
                  row.last_run_cost_usd ? ` · ${formatCostDisplay(Number(row.last_run_cost_usd))}` : ""
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
          {/* 🚨 `last_error` is written by the Python scheduler, so whatever
              exception text it recorded landed in this permanently-visible
              banner (2026-08-30). Sibling surfaces already humanize the same
              kind of column; this one had not. */}
          <span title={row.last_error ?? undefined}>
            <span className="font-medium">Last run reported a problem: </span>
            {humanizeBackendError(row.last_error)}
            <ErrorAlchemyMenu />
          </span>
        </div>
      ) : null}

      <div className="border-b border-border/60">
        <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Measurements
        </p>
        <PanelMetricsSection
          panelId={row.id}
          organizationId={organizationId}
          hiddenForBlindReview={blindReviewOpen}
        />
      </div>

      <div className="border-b border-border/60">
        <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Design
        </p>
        <PanelDesignSection
          design={design}
          panelId={row.id}
          organizationId={organizationId}
        />
      </div>

      <div className="border-t border-border/60">
        <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Questions
        </p>
        <div className="flex flex-col divide-y divide-border/60">
          {trend.prompts.map((standing) => (
            <PromptRow
              key={standing.key}
              standing={standing}
              brandId={brandId}
              siteId={siteId}
            />
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
                      "text-xs font-semibold tabular-nums",
                      message.answers === 0 && "text-muted-foreground/70",
                    )}
                  >
                    {message.answers === 0
                      ? "Not measured yet"
                      : `${message.presentIn} of ${message.answers}`}
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
  site,
  brandId,
}: {
  site: MarketingSite;
  brandId: string | null;
}) {
  const siteId = site.id;
  const queryClient = useQueryClient();
  const [designing, setDesigning] = useState(false);
  const panelsQuery = useQuery({
    queryKey: ["marketing", "ai-visibility", "panels", siteId] as const,
    queryFn: async (): Promise<LoadedPanel[]> => {
      const rows = await listSitePanels(siteId);
      return Promise.all(
        rows.map(async (row) => ({
          row,
          trend: buildPanelTrend(row, await fetchPanelAnswers(row)),
        })),
      );
    },
  });
  const panels = panelsQuery.data ?? null;
  const isLoading = panelsQuery.isFetching;
  const load = () => panelsQuery.refetch();

  if (panelsQuery.isPending) return <LoadingSurface label="Loading your prompt panels…" />;
  if (panelsQuery.error && !panels) {
    return (
      <InlineQueryError
        what="AI visibility panels"
        error={panelsQuery.error}
        onRetry={() => void load()}
      />
    );
  }

  const designForm = designing ? (
    <SectionCard title="Design a panel" anchor="ai_visibility_panel_design_form">
      <DesignPanelForm
        site={site}
        brandId={brandId}
        onCancel={() => setDesigning(false)}
        onStarted={(view) => {
          // Seed the new panel's design so its section opens already polling.
          queryClient.setQueryData(panelQueryKeys.design(view.panel_id), view);
          setDesigning(false);
          void load();
        }}
      />
    </SectionCard>
  ) : null;

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
        <div className="flex shrink-0 items-center gap-1">
          {!designing ? (
            <Button size="sm" onClick={() => setDesigning(true)}>
              <ClipboardList className="h-3.5 w-3.5" /> Design a panel
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-label="Reload panels"
            onClick={() => void load()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {designForm}

      {panels && panels.length === 0 && !designing ? (
        <SectionCard title="No panels yet" anchor="ai_visibility_panels_empty">
          <div className="px-3 py-4 text-xs text-muted-foreground">
            <p>
              A panel is a set of the questions your buyers actually ask. Once
              one exists, this page shows what AI assistants say about you —
              asked with your name and without it, engine by engine, with how
              sure each number is.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => setDesigning(true)}>
                <ClipboardList className="h-3.5 w-3.5" /> Design a panel
              </Button>
              <span>
                Or ask one question right now with the{" "}
                <Link
                  href={marketingRoutes.site(brandId, siteId, "/ai-visibility")}
                  className="text-primary hover:underline"
                >
                  one-off analyzer
                </Link>
                .
              </span>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {panels?.map((panel) => (
        <PanelCard
          key={panel.row.id}
          panel={panel}
          brandId={brandId}
          siteId={siteId}
          organizationId={site.organization_id}
        />
      ))}
    </main>
  );
}
