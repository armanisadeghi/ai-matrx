"use client";

/**
 * Link changes — what actually happened to the links you already have.
 *
 * A KPI strip of canonical `MetricCell` tiles (every tile a door), then ONE
 * `MatrxDataTable` in controlled/server-paged mode over
 * `useBacklinkChangeEvents`, with URL-owned state via `useMarketingTableState`
 * — the same structure as `BacklinkObservationTable`.
 *
 * EVERY ROW STATES THE VERDICT. The columns are not a diff dump: the middle
 * column is one sentence saying what the publisher did and one saying what it
 * means, built by `changeVerdict` in `lib/changes.ts`. The raw before/after is
 * available inside the record, for the person who wants it.
 *
 * Deep links: server assists send users here as
 * `…/backlinks?view=changes&changeKind=<kind>&changeEvent=<eventId>` —
 * `changeKind` preselects the filter, `changeEvent` highlights and scrolls to
 * that row.
 */

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Activity, ExternalLink, Link2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, rowsToCsv } from "@/components/agent-copy/export";
import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import { Button } from "@/components/ui/button";
import {
  DateCell,
  headerWithTooltip,
  urlPath,
} from "@/features/marketing/components/backlinks/lib/columns";
import {
  BACKLINK_CHANGE_KINDS,
  CHANGE_ALERT_SEVERITY_FLOOR,
  CHANGE_TONE_STATUS,
  backlinkChangeKindLabel,
  changeVerdict,
  isBacklinkChangeKind,
  parseBacklinkChangeValue,
  severityTone,
  type BacklinkChangeKind,
} from "@/features/marketing/components/backlinks/lib/changes";
import {
  InlineQueryError,
  MetricCell,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { formatGscDate } from "@/features/marketing/search-console/lib/format";
import {
  useBacklinkChangeEvents,
  useBacklinkChangeSummary,
} from "@/features/marketing/data/backlinks-hooks";
import type { BacklinkChangeEventRow } from "@/features/marketing/data/backlinks-types";
import {
  clearTableUrlParams,
  useMarketingTableState,
} from "@/features/marketing/data/query-state";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { cn } from "@/lib/utils";

/** `?changeKind=` — set by the server assist chips, and by the KPI tiles. */
const CHANGE_KIND_PARAM = "changeKind";
/** `?changeEvent=` — the exact row an assist chip is talking about. */
const CHANGE_EVENT_PARAM = "changeEvent";
/** `?attention=1` — the alert-floor lens. */
const ATTENTION_PARAM = "attention";

const SEVERITY_EXPLAINER = `How urgent this change is, 0–100. We raise an alert at ${CHANGE_ALERT_SEVERITY_FLOOR} and above — a dofollow link disappearing scores near the top, a new nofollow link near the bottom.`;

/** One line per change, for the human Copy payload. */
function humanChangeRow(row: BacklinkChangeEventRow): string {
  const verdict = changeVerdict(row);
  return humanLines([
    ["What happened", verdict.headline],
    ["What it means", verdict.detail],
    ["Linking site", row.source_domain],
    ["Linking page", row.source_url],
    ["Your page", row.target_url],
    ["Kind of change", backlinkChangeKindLabel(row.change_kind)],
    ["How urgent", row.severity],
    ["Noticed", formatGscDate(row.detected_at)],
  ]);
}

/** Agent projection — the verdict travels WITH the raw before/after. */
function projectChangeRow(row: BacklinkChangeEventRow) {
  const verdict = changeVerdict(row);
  return {
    id: row.id,
    change_kind: row.change_kind,
    headline: verdict.headline,
    detail: verdict.detail,
    severity: row.severity,
    alerted: row.alerted_at !== null,
    source_domain: row.source_domain,
    source_url: row.source_url,
    target_url: row.target_url,
    backlink_id: row.backlink_id,
    observed_at: row.observed_at,
    detected_at: row.detected_at,
    previous_value: row.previous_value,
    current_value: row.current_value,
  };
}

/** One side of the change, spelled out — the record's "show me the raw" half. */
function ValueColumn({
  title,
  value,
}: {
  title: string;
  value: BacklinkChangeEventRow["previous_value"];
}) {
  const parsed = parseBacklinkChangeValue(value);
  return (
    <div className="rounded border border-border p-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">
        {title}
      </p>
      <dl className="mt-1 space-y-1 text-xs text-foreground">
        <div>
          <dt className="text-muted-foreground">Link text</dt>
          <dd>
            {parsed.anchorTexts.length
              ? parsed.anchorTexts.map((text) => `“${text}”`).join(", ")
              : "None recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Points at</dt>
          <dd className="break-all">{parsed.targetUrl ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Counts for SEO</dt>
          <dd>
            {parsed.isDofollow === null
              ? "Not recorded"
              : parsed.isDofollow
                ? "Yes"
                : "No"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">On the page</dt>
          <dd>
            {parsed.isLive === null
              ? "Not recorded"
              : parsed.isLive
                ? "Yes"
                : "No"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Times it links</dt>
          <dd>{parsed.instanceCount ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last seen</dt>
          <dd>{parsed.lastSeenAt ? formatGscDate(parsed.lastSeenAt) : "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

/** The opened record: the verdict, both doors, then the before/after. */
function ChangeDetail({
  row,
  linkRecordHref,
}: {
  row: BacklinkChangeEventRow;
  linkRecordHref: string;
}) {
  const verdict = changeVerdict(row);
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="text-sm font-medium text-foreground">{verdict.headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{verdict.detail}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open the page that links to you
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Link
          href={linkRecordHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open the link record <Link2 className="h-3.5 w-3.5" />
        </Link>
        {row.target_url ? (
          <a
            href={row.target_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open your page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Noticed {formatGscDate(row.detected_at)} · from the check dated{" "}
        {formatGscDate(row.observed_at)} · urgency {row.severity}
        {row.alerted_at ? " · we alerted you about this" : ""}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ValueColumn title="Before" value={row.previous_value} />
        <ValueColumn title="After" value={row.current_value} />
      </div>
    </div>
  );
}

export function BacklinkChangesTable({ siteId }: { siteId: string }) {
  const { site, sitePath } = useMarketingSite();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrolledTo = useRef<string | null>(null);

  const kindParam = searchParams.get(CHANGE_KIND_PARAM);
  const deepLinkKind: BacklinkChangeKind | null = isBacklinkChangeKind(
    kindParam,
  )
    ? kindParam
    : null;
  const needsAttention = searchParams.get(ATTENTION_PARAM) === "1";
  const highlightId = searchParams.get(CHANGE_EVENT_PARAM);

  const table = useMarketingTableState({
    // Most urgent first is the only sane default for a "what broke" list; the
    // secondary detected_at order is applied server-side.
    defaultSort: { id: "severity", direction: "desc" },
    defaultPageSize: 50,
  });
  const filters = useMemo(
    () => ({ changeKind: deepLinkKind, needsAttention }),
    [deepLinkKind, needsAttention],
  );
  const changes = useBacklinkChangeEvents(siteId, table.queryState, filters);
  const summary = useBacklinkChangeSummary(siteId);
  const rows = changes.data?.rows ?? [];
  const total = changes.data?.total ?? 0;

  /**
   * A lens/kind swap is a view swap: the table's own URL state (paging, sort,
   * filters) belongs to the slice that was on screen, so it is cleared exactly
   * as the workspace tabs and insight lenses do.
   */
  const lensHref = (next: {
    kind?: BacklinkChangeKind | null;
    attention?: boolean;
  }): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "changes");
    params.delete(CHANGE_EVENT_PARAM);
    if (next.kind) params.set(CHANGE_KIND_PARAM, next.kind);
    else params.delete(CHANGE_KIND_PARAM);
    if (next.attention) params.set(ATTENTION_PARAM, "1");
    else params.delete(ATTENTION_PARAM);
    clearTableUrlParams(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  /** The Links tab searched by this exact page — its server search matches
   *  `source_url`, so it lands on the backlink this change is about. */
  const linkRecordHref = (row: BacklinkChangeEventRow) =>
    `${sitePath}/backlinks?view=links&q=${encodeURIComponent(row.source_url)}`;

  // Bring the assist-chip's row into view once, after its page has rendered.
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

  const counts = summary.data;
  const kindCount = (kind: BacklinkChangeKind) => counts?.byKind[kind] ?? 0;
  const tiles: Array<{
    label: string;
    value: number;
    detail: string;
    href: string;
    tone: "default" | "good" | "warning" | "bad";
  }> = [
    {
      label: "Needs your attention",
      value: counts?.alertable ?? 0,
      detail: "Changes serious enough that we would raise an alert",
      href: lensHref({ attention: true }),
      tone: (counts?.alertable ?? 0) > 0 ? "warning" : "default",
    },
    {
      label: "Links removed",
      value: kindCount("lost"),
      detail: "Sites that took your link off the page",
      href: lensHref({ kind: "lost" }),
      tone: kindCount("lost") > 0 ? "bad" : "default",
    },
    {
      label: "Stopped counting for SEO",
      value: kindCount("dofollow_lost"),
      detail: "Still on the page, no longer passing ranking value",
      href: lensHref({ kind: "dofollow_lost" }),
      tone: kindCount("dofollow_lost") > 0 ? "bad" : "default",
    },
    {
      label: "Linking pages gone",
      value: kindCount("source_page_dead"),
      detail: "The page that carried your link no longer works",
      href: lensHref({ kind: "source_page_dead" }),
      tone: kindCount("source_page_dead") > 0 ? "bad" : "default",
    },
    {
      label: "Wording changed",
      value: kindCount("anchor_changed"),
      detail: "The words your link is written with changed",
      href: lensHref({ kind: "anchor_changed" }),
      tone: "default",
    },
    {
      label: "New links",
      value: kindCount("appeared"),
      detail: "Links to your site we had not seen before",
      href: lensHref({ kind: "appeared" }),
      tone: kindCount("appeared") > 0 ? "good" : "default",
    },
    {
      label: "Links back",
      value: kindCount("restored"),
      detail: "Links that had disappeared and are live again",
      href: lensHref({ kind: "restored" }),
      tone: kindCount("restored") > 0 ? "good" : "default",
    },
    {
      label: "All changes",
      value: counts?.total ?? 0,
      detail: "Everything we have recorded for this site",
      href: lensHref({}),
      tone: "default",
    },
  ];

  const location = webLocation(`Backlinks — ${site.domain} — Link changes`);
  const activeLensLabel = needsAttention
    ? "Needs your attention"
    : deepLinkKind
      ? backlinkChangeKindLabel(deepLinkKind)
      : null;
  const viewData = () => ({
    site_id: siteId,
    lens: needsAttention ? "needs_attention" : (deepLinkKind ?? null),
    page: table.state.page,
    total_rows: total,
    summary: counts ?? null,
    rows: rows.map(projectChangeRow),
  });

  const columns: MatrxColumnDef<BacklinkChangeEventRow>[] = [
    {
      id: "change_kind",
      accessorKey: "change_kind",
      header: "What changed",
      filter: "select",
      filterOptions: BACKLINK_CHANGE_KINDS.map((kind) => ({
        value: kind.key,
        label: kind.label,
      })),
      cell: (row) => (
        <span className="whitespace-nowrap">
          <StatusBadge
            value={CHANGE_TONE_STATUS[changeVerdict(row).tone]}
            label={backlinkChangeKindLabel(row.change_kind)}
          />
        </span>
      ),
    },
    {
      id: "verdict",
      header: "What happened",
      sortable: false,
      filter: false,
      cellKind: "text",
      accessorFn: (row) => changeVerdict(row).headline,
      cell: (row) => {
        const verdict = changeVerdict(row);
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
      id: "source_domain",
      accessorKey: "source_domain",
      header: "Where",
      filter: false,
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-40 max-w-64">
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title={row.source_url}
            onClick={(event) => event.stopPropagation()}
            className="group block"
          >
            <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground group-hover:text-primary group-hover:underline">
              <span className="truncate">{row.source_domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </span>
          </a>
          {/* A change names a backlink, so the backlink must be reachable. */}
          <Link
            href={linkRecordHref(row)}
            onClick={(event) => event.stopPropagation()}
            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            title="Open this link's record in the Backlinks table"
          >
            <Link2 className="h-3 w-3" />
            Open the link record
          </Link>
        </div>
      ),
    },
    {
      id: "target_url",
      accessorKey: "target_url",
      header: "Your page",
      filter: false,
      cellKind: "text",
      cell: (row) =>
        row.target_url ? (
          <a
            href={row.target_url}
            target="_blank"
            rel="noopener noreferrer"
            title={row.target_url}
            onClick={(event) => event.stopPropagation()}
            className="block min-w-32 max-w-56 truncate font-mono text-[11px] text-primary hover:underline"
          >
            {urlPath(row.target_url)}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: headerWithTooltip("How urgent", SEVERITY_EXPLAINER),
      filter: "number",
      align: "right",
      cell: (row) => {
        const tone = severityTone(row.severity);
        return (
          <span
            className={cn(
              "font-medium tabular-nums",
              tone === "bad" && "text-destructive",
              tone === "warning" && "text-warning",
              tone === "default" && "text-muted-foreground",
            )}
            title={
              row.alerted_at
                ? `We alerted you about this on ${formatGscDate(row.alerted_at)}.`
                : SEVERITY_EXPLAINER
            }
          >
            {row.severity}
          </span>
        );
      },
    },
    {
      id: "detected_at",
      accessorKey: "detected_at",
      header: "Noticed",
      filter: false,
      cell: (row) => <DateCell iso={row.detected_at} />,
    },
    {
      id: "observed_at",
      accessorKey: "observed_at",
      header: "Check dated",
      filter: false,
      cell: (row) => <DateCell iso={row.observed_at} />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {summary.isError ? (
        <InlineQueryError
          what="the link-change totals"
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : (
        <div
          data-surface-value="backlink_change_summary"
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

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {activeLensLabel ? (
          <>
            <span className="text-xs text-muted-foreground">
              Showing: <b className="text-foreground">{activeLensLabel}</b>
            </span>
            <Button asChild size="sm" variant="outline" className="h-7">
              <Link href={lensHref({})}>Show every change</Link>
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButtons
            size="icon"
            label={`Link changes (${site.domain})`}
            human={() =>
              [
                `Link changes — ${site.domain}${activeLensLabel ? ` — ${activeLensLabel}` : ""}`,
                ...rows.map(humanChangeRow),
              ].join("\n\n")
            }
            json={viewData}
            agent={(): AgentPayloadInput => ({
              kind: "web-backlink-change-view",
              location,
              description: `The recorded backlink changes on screen for ${site.domain}.`,
              data: viewData(),
              attributes: {
                site_id: siteId,
                lens: activeLensLabel ?? undefined,
                visible_rows: rows.length,
                total_rows: total,
              },
            })}
          />
          <ExportMenu
            label={`backlink-changes-${site.domain}`}
            items={[
              jsonExportItem(viewData, "Changes on screen (.json)"),
              {
                id: "csv",
                label: "CSV (changes on screen)",
                build: () => ({
                  content: rowsToCsv(
                    rows.map(projectChangeRow) as unknown as Array<
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
        {changes.isError ? (
          <InlineQueryError
            what="your link changes"
            error={changes.error}
            onRetry={() => void changes.refetch()}
          />
        ) : (
          <MatrxDataTable<BacklinkChangeEventRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={changes.isLoading}
            isFetching={changes.isFetching}
            selectedId={highlightId}
            query={{
              mode: "controlled",
              totalItems: total,
              state: table.state,
              onStateChange: table.onStateChange,
            }}
            toolbar={{
              searchPlaceholder: "Search by linking site, page, or your page…",
            }}
            copy={{
              label: "Link change",
              listLabel: activeLensLabel
                ? `Link changes — ${activeLensLabel}`
                : "Link changes",
              location,
              rowKind: "web-backlink-change",
              listKind: "web-backlink-change-table",
              rowDescription:
                "One recorded change to a link pointing at this site: what the publisher did, what it means, how urgent it is, and the before/after we compared.",
              listDescription:
                "The changes currently on screen (respecting the search, sort, filters, view, and page you are on).",
              humanRow: humanChangeRow,
              agentRow: projectChangeRow,
              rowAttributes: (row) => ({
                site_id: siteId,
                id: row.id,
                change_kind: row.change_kind,
                severity: row.severity,
                source_domain: row.source_domain,
                backlink_id: row.backlink_id,
              }),
              listAttributes: (visible) => ({
                site_id: siteId,
                lens: activeLensLabel ?? undefined,
                page: table.state.page,
                visible_rows: visible.length,
                total_rows: total,
                search: table.state.search || undefined,
              }),
            }}
            detail={{
              title: (row) => changeVerdict(row).headline,
              description: (row) => changeVerdict(row).detail,
              render: (row) => (
                <ChangeDetail row={row} linkRecordHref={linkRecordHref(row)} />
              ),
            }}
            window={{
              title: (row) => changeVerdict(row).headline,
              renderView: (row) => (
                <ChangeDetail row={row} linkRecordHref={linkRecordHref(row)} />
              ),
              renderEdit: false,
              defaultTab: "view",
            }}
            pageSize={50}
            pageSizeOptions={[25, 50, 100, 250]}
            emptyState={{
              icon: <Activity className="h-8 w-8 text-muted-foreground" />,
              title: activeLensLabel
                ? `${activeLensLabel}: nothing found`
                : "Nothing has changed",
              description:
                changes.isSuccess &&
                (activeLensLabel || table.queryState.search)
                  ? "Nothing here — which for this list is good news."
                  : // NOT `backlinkEmptyHint`: that line tells the user to hit
                    // Refresh, and Refresh cannot produce a change row. We
                    // compare each night's links against the night before, so
                    // an empty list means nothing moved — never "you have not
                    // run anything yet".
                    "We check every night for links that appear, disappear, or change, and list what we find here. Nothing has moved yet.",
            }}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </div>
  );
}
