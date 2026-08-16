"use client";

/**
 * Coverage — who wrote about you, how it landed, and how that compares.
 *
 * Three bands, all reading ONE set of rows so nothing on screen can disagree:
 * a KPI strip of canonical `MetricCell` tiles, a share-of-voice bar against the
 * rivals this site declared, then `MatrxDataTable` over the mentions.
 *
 * EVERY ROW STATES THE VERDICT. The lead column is a sentence — "You are in the
 * headline, positively, and it links to you" — not a set of enum chips. The
 * enums are still there for the person who wants them.
 *
 * NO DEAD ENDS. Every mention opens the article; a credited one opens the
 * outcome it produced; a story that has not been read yet says so and says why;
 * a mention on a source we may not crawl says THAT, in plain words, instead of
 * looking like a failure. Server assists deep-link here as
 * `…/backlinks?view=coverage&mention=<id>`.
 */

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, Link2, Trophy } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { Button } from "@/components/ui/button";
import { DateCell } from "@/features/marketing/components/backlinks/lib/columns";
import {
  captureExplainer,
  coverageVerdict,
  CAPTURE_STATUS_LABEL,
  MEDIUM_LABEL,
  SENTIMENT_STATUS,
} from "@/features/marketing/components/backlinks/lib/coverage";
import {
  InlineQueryError,
  MetricCell,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  useCoverageMentions,
  useCoverageRollup,
  useCoverageTrackers,
} from "@/features/marketing/data/coverage-hooks";
import { COVERAGE_WINDOW_DAYS } from "@/features/marketing/data/coverage-queries";
import type { CoverageMentionRow } from "@/features/marketing/data/coverage-types";
import {
  clearTableUrlParams,
  useMarketingTableState,
} from "@/features/marketing/data/query-state";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { cn } from "@/lib/utils";

/** `?mention=` — the exact row an assist chip is talking about. */
const MENTION_PARAM = "mention";
/** `?linked=1` — the lens for coverage that actually links to you. */
const LINKED_PARAM = "linked";
/** `?rivals=1` — include tracked competitors in the table (they always count
 *  toward share of voice; this only decides whether they are listed). */
const RIVALS_PARAM = "rivals";

function humanMentionRow(row: CoverageMentionRow): string {
  return humanLines([
    ["What happened", coverageVerdict(row).headline],
    ["What it means", coverageVerdict(row).detail],
    ["Outlet", row.domain],
    ["Headline", row.title],
    ["Written by", row.author_name],
    ["Published", row.published_at ? formatGscDate(row.published_at) : null],
    ["Kind of place", MEDIUM_LABEL[row.medium] ?? row.medium],
    ["Tone toward you", row.sentiment],
    ["How prominent", row.prominence],
    ["Links to you", row.links_to_site ? "Yes" : "No"],
    ["Priority", row.hit_score],
    ["Why that priority", row.hit_reason],
    ["Article", row.url],
  ]);
}

function projectMention(row: CoverageMentionRow) {
  const verdict = coverageVerdict(row);
  return {
    id: row.id,
    headline: verdict.headline,
    detail: verdict.detail,
    domain: row.domain,
    title: row.title,
    url: row.url,
    medium: row.medium,
    author_name: row.author_name,
    published_at: row.published_at,
    discovered_at: row.discovered_at,
    capture_status: row.capture_status,
    links_to_site: row.links_to_site,
    sentiment: row.sentiment,
    sentiment_score: row.sentiment_score,
    prominence: row.prominence,
    topics: row.topics,
    key_quote: row.key_quote,
    hit_score: row.hit_score,
    hit_reason: row.hit_reason,
    is_competitor: row.is_competitor,
    competitor_key: row.competitor_key,
    credited_outcome_id: row.outcome_event_id,
  };
}

/** The opened record: the verdict, the quote, every door. */
function MentionDetail({ row }: { row: CoverageMentionRow }) {
  const verdict = coverageVerdict(row);
  const topics = Array.isArray(row.topics) ? (row.topics as string[]) : [];
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="text-sm font-medium text-foreground">{verdict.headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{verdict.detail}</p>
      {row.key_quote ? (
        <blockquote className="mt-3 border-l-2 border-border pl-3 text-sm italic text-foreground">
          “{row.key_quote}”
        </blockquote>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Read the article <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {row.outcome_event_id ? (
          <Link
            href={`/crm/outreach-lists?view=outcomes&outcome=${row.outcome_event_id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open the win this produced <Trophy className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {topics.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          About: {topics.join(" · ")}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        {row.author_name ? `Written by ${row.author_name} · ` : ""}
        {row.published_at
          ? `published ${formatGscDate(row.published_at)} · `
          : ""}
        found {formatGscDate(row.discovered_at)} ·{" "}
        {captureExplainer(row.capture_status)}
        {row.hit_reason ? ` · ${row.hit_reason}` : ""}
      </p>
    </div>
  );
}

export function CoverageTab({ siteId }: { siteId: string }) {
  const { site } = useMarketingSite();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrolledTo = useRef<string | null>(null);

  const highlightId = searchParams.get(MENTION_PARAM);
  const linkedOnly = searchParams.get(LINKED_PARAM) === "1";
  const includeCompetitors = searchParams.get(RIVALS_PARAM) === "1";

  const trackers = useCoverageTrackers(siteId);
  const activeTracker = trackers.data?.find((tracker) => tracker.is_active);
  const brandKey = activeTracker?.brand_key ?? site.domain;

  const table = useMarketingTableState({
    // Loudest first: a coverage feed is read top-down, and "loudest" is the
    // explainable hit score, not recency.
    defaultSort: { id: "hit_score", direction: "desc" },
    defaultPageSize: 50,
  });
  const filters = useMemo(
    () => ({
      includeCompetitors,
      linkedOnly,
      windowDays: COVERAGE_WINDOW_DAYS,
    }),
    [includeCompetitors, linkedOnly],
  );
  const mentions = useCoverageMentions(siteId, table.queryState, filters);
  const rollup = useCoverageRollup(siteId, brandKey, {
    windowDays: COVERAGE_WINDOW_DAYS,
  });
  const rows = mentions.data?.rows ?? [];
  const total = mentions.data?.total ?? 0;
  const summary = rollup.data?.summary;
  const share = rollup.data?.share;

  const lensHref = (next: { linked?: boolean; rivals?: boolean }): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "coverage");
    params.delete(MENTION_PARAM);
    if (next.linked) params.set(LINKED_PARAM, "1");
    else params.delete(LINKED_PARAM);
    if (next.rivals) params.set(RIVALS_PARAM, "1");
    else params.delete(RIVALS_PARAM);
    clearTableUrlParams(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  useEffect(() => {
    if (!highlightId || rows.length === 0) return;
    if (scrolledTo.current === highlightId) return;
    const node = scrollRef.current?.querySelector(
      `[data-row-id="${CSS.escape(highlightId)}"]`,
    );
    if (!node) return;
    scrolledTo.current = highlightId;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, rows]);

  const tiles: Array<{
    label: string;
    value: string | number;
    detail: string;
    href?: string;
    tone: "default" | "good" | "warning" | "bad";
  }> = [
    {
      label: "Stories about you",
      value: summary?.brandMentions ?? 0,
      detail: `Articles naming you in the last ${COVERAGE_WINDOW_DAYS} days`,
      href: lensHref({}),
      tone: (summary?.brandMentions ?? 0) > 0 ? "good" : "default",
    },
    {
      label: "That link to you",
      value: summary?.linked ?? 0,
      detail: "Coverage that became a link, not just a mention",
      href: lensHref({ linked: true }),
      tone: (summary?.linked ?? 0) > 0 ? "good" : "default",
    },
    {
      label: "Share of voice",
      value: share ? `${share.brandSharePct}%` : "—",
      detail: "Your share of coverage across you and the rivals you track",
      href: lensHref({ rivals: true }),
      tone: "default",
    },
    {
      label: "Average priority",
      // NULL is unmeasured, and the tile says so rather than showing a 0.
      value: summary?.avgHitScore ?? "Not scored yet",
      detail: "How loudly your coverage lands, 0–100",
      tone: "default",
    },
    {
      label: "Credited to a pitch",
      value: summary?.credited ?? 0,
      detail: "Coverage attribution matched to outreach you sent",
      tone: (summary?.credited ?? 0) > 0 ? "good" : "default",
    },
    {
      label: "Still being read",
      value: summary?.awaitingCapture ?? 0,
      detail: "Found, not yet opened by our crawler — scores arrive after",
      tone: "default",
    },
    {
      label: "We may not crawl",
      value: summary?.blocked ?? 0,
      detail:
        "Sources whose terms forbid crawling — we keep the headline, never the page",
      tone: "default",
    },
    {
      label: "Read and scored",
      value: summary?.analyzed ?? 0,
      detail: "Pages our crawler opened and the analyst has read",
      tone: "default",
    },
  ];

  const location = webLocation(`Backlinks — ${site.domain} — Coverage`);
  const viewData = () => ({
    site_id: siteId,
    brand_key: brandKey,
    window_days: COVERAGE_WINDOW_DAYS,
    lens: linkedOnly ? "links_to_you" : includeCompetitors ? "with_rivals" : null,
    summary: summary ?? null,
    share_of_voice: share ?? null,
    total_rows: total,
    rows: rows.map(projectMention),
  });

  const columns: MatrxColumnDef<CoverageMentionRow>[] = [
    {
      id: "verdict",
      header: "What happened",
      sortable: false,
      filter: false,
      cellKind: "text",
      accessorFn: (row) => coverageVerdict(row).headline,
      cell: (row) => {
        const verdict = coverageVerdict(row);
        return (
          <div className="min-w-72 max-w-[34rem]">
            <p
              className={cn(
                "text-xs font-medium",
                verdict.tone === "bad" && "text-destructive",
                verdict.tone === "good" && "text-success",
                verdict.tone !== "bad" &&
                  verdict.tone !== "good" &&
                  "text-foreground",
              )}
            >
              {verdict.headline}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {verdict.detail}
            </p>
          </div>
        );
      },
    },
    {
      id: "domain",
      accessorKey: "domain",
      header: "Where",
      filter: false,
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-40 max-w-64">
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            title={row.url}
            onClick={(event) => event.stopPropagation()}
            className="group block"
          >
            <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground group-hover:text-primary group-hover:underline">
              <span className="truncate">{row.domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
          </a>
          <span className="text-[10px] text-muted-foreground">
            {MEDIUM_LABEL[row.medium] ?? row.medium}
            {row.is_competitor ? ` · about ${row.competitor_key}` : ""}
          </span>
        </div>
      ),
    },
    {
      id: "author_name",
      accessorKey: "author_name",
      header: "Written by",
      filter: false,
      cellKind: "text",
      cell: (row) =>
        row.author_name ? (
          <span className="text-xs text-foreground">{row.author_name}</span>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            title="The page did not state a byline. We never guess one — a wrong byline names a real journalist."
          >
            No byline on the page
          </span>
        ),
    },
    {
      id: "sentiment",
      accessorKey: "sentiment",
      header: "Tone toward you",
      filter: "select",
      filterOptions: [
        { value: "positive", label: "Positive" },
        { value: "neutral", label: "Neutral" },
        { value: "mixed", label: "Mixed" },
        { value: "negative", label: "Negative" },
      ],
      cell: (row) =>
        row.sentiment ? (
          <StatusBadge
            value={SENTIMENT_STATUS[row.sentiment] ?? "neutral"}
            label={row.sentiment}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Not read yet</span>
        ),
    },
    {
      id: "hit_score",
      accessorKey: "hit_score",
      header: "Priority",
      filter: "number",
      align: "right",
      cell: (row) =>
        row.hit_score === null ? (
          <span
            className="text-xs text-muted-foreground"
            title={captureExplainer(row.capture_status)}
          >
            —
          </span>
        ) : (
          <span
            className="font-medium tabular-nums text-foreground"
            title={row.hit_reason ?? undefined}
          >
            {row.hit_score}
          </span>
        ),
    },
    {
      id: "links_to_site",
      accessorKey: "links_to_site",
      header: "Links to you",
      filter: false,
      cell: (row) =>
        row.links_to_site ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <Link2 className="h-3 w-3" /> Yes
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        ),
    },
    {
      id: "capture_status",
      accessorKey: "capture_status",
      header: "We read it",
      filter: "select",
      filterOptions: [
        { value: "captured", label: "Read" },
        { value: "pending", label: "Not yet" },
        { value: "blocked", label: "Not allowed" },
        { value: "failed", label: "Could not read" },
        { value: "skipped", label: "Nothing to read" },
      ],
      cell: (row) => (
        <span
          className="whitespace-nowrap text-xs text-muted-foreground"
          title={captureExplainer(row.capture_status)}
        >
          {CAPTURE_STATUS_LABEL[row.capture_status] ?? row.capture_status}
        </span>
      ),
    },
    {
      id: "published_at",
      accessorKey: "published_at",
      header: "Published",
      filter: false,
      cell: (row) =>
        row.published_at ? (
          <DateCell iso={row.published_at} />
        ) : (
          <span className="text-xs text-muted-foreground">Not stated</span>
        ),
    },
    {
      id: "discovered_at",
      accessorKey: "discovered_at",
      header: "Found",
      filter: false,
      cell: (row) => <DateCell iso={row.discovered_at} />,
    },
  ];

  const trackerCount = trackers.data?.length ?? 0;
  // BOTH shapes of "this feed may be incomplete": a tracker whose last pass
  // FAILED (we learned nothing) and one that succeeded PARTIALLY (some searches
  // were refused, so stories may be missing). The server records the sentence
  // on `last_error` either way; showing only the failures would let a partial
  // answer read as a complete one.
  const incomplete = (trackers.data ?? []).filter(
    (tracker) => Boolean(tracker.last_error),
  );
  const anyFailed = incomplete.some(
    (tracker) => tracker.last_run_status === "failed",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {rollup.isError ? (
        <InlineQueryError
          what="your coverage totals"
          error={rollup.error}
          onRetry={() => void rollup.refetch()}
        />
      ) : (
        <div
          data-surface-value="coverage_summary"
          className="grid shrink-0 grid-cols-2 rounded-md border border-border bg-card sm:grid-cols-4 xl:grid-cols-8"
        >
          {tiles.map((tile) => (
            <MetricCell
              key={tile.label}
              variant="strip"
              label={tile.label}
              value={tile.value}
              detail={tile.detail}
              tone={tile.tone}
              href={tile.href}
            />
          ))}
        </div>
      )}

      {/* A broken tracker and a quiet week look identical unless we say so. */}
      {incomplete.length ? (
        <div
          className={cn(
            "shrink-0 rounded-md border p-2 text-xs",
            anyFailed
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-warning/40 bg-warning/5 text-warning",
          )}
        >
          {incomplete.length === 1
            ? `“${incomplete[0].name}”: ${incomplete[0].last_error}`
            : `${incomplete.length} trackers could not see everything on their last pass, so this feed may be missing stories.`}
        </div>
      ) : null}

      {share && share.entries.length > 1 ? (
        <div className="shrink-0 rounded-md border border-border bg-card p-2">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            Share of voice — you against the rivals you track (
            {COVERAGE_WINDOW_DAYS} days, {share.totalMentions} stories)
          </p>
          <div className="mt-2 space-y-1">
            {share.entries.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2">
                <span
                  className={cn(
                    "w-40 shrink-0 truncate text-xs",
                    entry.isBrand
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {entry.label}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className={cn(
                      "block h-full rounded",
                      entry.isBrand ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    style={{ width: `${Math.max(1, entry.sharePct)}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {entry.mentions} · {entry.sharePct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {trackerCount === 0 ? (
          <span className="text-xs text-muted-foreground">
            Nothing is being watched for this site yet — a coverage tracker
            declares the names to watch for, and the feed fills from the next
            pass.
          </span>
        ) : null}
        {linkedOnly || includeCompetitors ? (
          <>
            <span className="text-xs text-muted-foreground">
              Showing:{" "}
              <b className="text-foreground">
                {linkedOnly ? "coverage that links to you" : "you and your rivals"}
              </b>
            </span>
            <Button asChild size="sm" variant="outline" className="h-7">
              <Link href={lensHref({})}>Show all your coverage</Link>
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButtons
            size="icon"
            label={`Coverage (${site.domain})`}
            human={() =>
              [
                `Coverage — ${site.domain} — last ${COVERAGE_WINDOW_DAYS} days`,
                ...rows.map(humanMentionRow),
              ].join("\n\n")
            }
            json={viewData}
            agent={(): AgentPayloadInput => ({
              kind: "web-coverage-view",
              location,
              description: `The brand coverage on screen for ${site.domain}, with share of voice against tracked rivals.`,
              data: viewData(),
              attributes: {
                site_id: siteId,
                visible_rows: rows.length,
                total_rows: total,
                brand_share_pct: share?.brandSharePct,
              },
            })}
          />
          <ExportMenu
            label={`coverage-${site.domain}`}
            items={[
              jsonExportItem(viewData, "Coverage on screen (.json)"),
              {
                id: "csv",
                label: "CSV (coverage on screen)",
                build: () => ({
                  content: rowsToCsv(
                    rows.map(projectMention) as unknown as Array<
                      Record<string, unknown>
                    >,
                  ),
                  extension: "csv",
                  mime: "text/csv",
                }),
              },
            ]}
          />
        </div>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col">
        {mentions.isError ? (
          <InlineQueryError
            what="your coverage"
            error={mentions.error}
            onRetry={() => void mentions.refetch()}
          />
        ) : (
          <MatrxDataTable<CoverageMentionRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={mentions.isLoading}
            isFetching={mentions.isFetching}
            selectedId={highlightId}
            query={{
              mode: "controlled",
              totalItems: total,
              state: table.state,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search by outlet, headline, or journalist…",
            }}
            copy={{
              label: "Coverage",
              listLabel: "Coverage",
              location,
              rowKind: "web-coverage-mention",
              listKind: "web-coverage-table",
              rowDescription:
                "One article that named this brand: what it says about them, how prominently, whether it links to their site, and how we came to know that.",
              listDescription:
                "The coverage currently on screen (respecting the search, sort, filters, lens, and page you are on).",
              humanRow: humanMentionRow,
              agentRow: projectMention,
              rowAttributes: (row) => ({
                site_id: siteId,
                id: row.id,
                domain: row.domain,
                hit_score: row.hit_score,
                links_to_site: row.links_to_site,
                capture_status: row.capture_status,
                is_competitor: row.is_competitor,
              }),
              listAttributes: (visible) => ({
                site_id: siteId,
                brand_key: brandKey,
                page: table.state.page,
                visible_rows: visible.length,
                total_rows: total,
                search: table.state.search || undefined,
              }),
            }}
            detail={{
              title: (row) => coverageVerdict(row).headline,
              description: (row) => coverageVerdict(row).detail,
              render: (row) => <MentionDetail row={row} />,
            }}
            window={{
              title: (row) => coverageVerdict(row).headline,
              renderView: (row) => <MentionDetail row={row} />,
              renderEdit: false,
              defaultTab: "view",
            }}
            pageSize={50}
            pageSizeOptions={[25, 50, 100, 250]}
          />
        )}
      </div>
    </div>
  );
}
