"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Braces,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  MoreHorizontal,
  PanelsTopLeft,
  Pencil,
  Plus,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import { marketingListQuery } from "@/features/marketing/lib/scopes/marketing-hub-scope";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  useDeleteSite,
  useSiteCount,
  useSites,
} from "@/features/marketing/data/hooks";
import { SiteEditorDialog } from "@/features/marketing/components/sites/SiteEditorDialog";
import type { SiteEditorHandleRef } from "@/features/marketing/components/sites/SiteEditorDialog";
import {
  resolveSiteForWrite,
  SITE_EDITOR_DRAFT_TARGET,
  validateSiteEditorDraftWrite,
  type SiteDraftPatch,
} from "@/features/marketing/lib/site-write-targets";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import {
  formatMetric,
  formatPosition,
  GscMetricPeek,
  PagesPeek,
  TrendDelta,
  trendPercent,
} from "@/features/marketing/components/sites/SiteKpiPeeks";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";

// Quick view opens one-at-a-time on user action, so the WindowPanel machinery
// stays behind this lazy edge (lazyOverlay pattern — code-splitting skill).
const SitePeekWindow = dynamic(
  () => import("@/features/marketing/components/sites/SitePeekWindow"),
  { ssr: false },
);

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "error", label: "Error" },
];

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  toast.success(message);
}

export function SitesPortfolio() {
  const router = useRouter();
  const table = useMarketingTableState({
    defaultSort: { id: "gsc_clicks_28d", direction: "desc" },
  });
  const sites = useSites(table.queryState);
  const siteCount = useSiteCount();
  const deleteMutation = useDeleteSite();
  const [editing, setEditing] = useState<MarketingSite | null>(null);
  const [deleting, setDeleting] = useState<MarketingSite | null>(null);
  const [peeking, setPeeking] = useState<SiteListRow | null>(null);

  // The open site editor's live handle (null whenever no editor is open), plus
  // the patch waiting for an editor this component just asked to open. Both
  // are refs, not state: `applySurfaceWrite` resolves handlers BEFORE the user
  // answers the confirm, so an "is it open / is it saving" guard read off a
  // render closure would be stale by the time Apply is pressed.
  const editorRef = useRef<SiteEditorHandleRef | null>(null);
  const pendingStageRef = useRef<{
    siteId: string;
    patch: SiteDraftPatch;
  } | null>(null);

  const registerEditor = useCallback((handle: SiteEditorHandleRef | null) => {
    editorRef.current = handle;
    const pending = pendingStageRef.current;
    const live = handle?.current;
    if (live && pending && pending.siteId === live.siteId) {
      pendingStageRef.current = null;
      live.stage(pending.patch);
    }
  }, []);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete site", {
        description: extractErrorMessage(error),
      });
    }
  };

  const hasFilters =
    Boolean(table.state.search || table.state.anyOf) ||
    Object.values(table.state.columnFilters).some(Boolean);

  const siteRowCopy = (row: SiteListRow) =>
    webCopy({
      kind: "web-site",
      label: `Site ${row.domain}`,
      description: "One managed website row from the Marketing sites list.",
      surface: `Sites list — ${row.domain}`,
      data: row,
      lines: [
        ["Site", row.name],
        ["Domain", row.domain],
        ["Root URL", row.root_url],
        ["Status", row.status],
        ["Pages", row.page_count],
        ["Pages in Google", row.pages_in_gsc],
        ["Clicks (28d)", row.gsc_clicks_28d],
        ["Impressions (28d)", row.gsc_impressions_28d],
        ["Avg position (28d)", row.gsc_position_28d?.toFixed(1) ?? null],
        ["Health score", row.health_score],
        ["GSC data through", row.gsc_latest_date],
      ],
      attributes: { site_id: row.id, brand_id: row.brand_id, status: row.status },
    });

  const listRows = sites.data?.rows ?? [];

  // Surface scope — assembled at trigger time from already-loaded queries.
  // Brand totals and the per-brand portfolio rollup are not loaded on this
  // view, so brand_count and portfolio_summary are honestly omitted.
  const getHubScope = () => {
    // Read twin of the site_editor_draft target — what is staged RIGHT NOW,
    // including unsaved edits. Read off the ref at trigger time, not render.
    const openEditor = editorRef.current?.current ?? null;
    return createMarketingScope({
      hub_view: "sites",
      list_query: marketingListQuery(table.state),
      ...(openEditor
        ? {
            site_editor: {
              site_id: openEditor.siteId,
              domain: openEditor.domain,
              name: openEditor.draft.name,
              description: openEditor.draft.description,
            },
          }
        : {}),
      ...(typeof siteCount.data === "number"
        ? { site_count: siteCount.data }
        : {}),
      ...(typeof sites.data?.total === "number"
        ? { sites_total: sites.data.total }
        : {}),
      ...(listRows.length > 0
        ? {
            visible_sites: listRows.map((row) => ({
              site_id: row.id,
              brand_id: row.brand_id,
              name: row.name,
              domain: row.domain,
              root_url: row.root_url,
              // Declared in the manifest all along, never emitted — and it is
              // the read twin for the description half of site_editor_draft.
              description: row.description,
              status: row.status,
              visibility: row.visibility,
              initialized: Boolean(row.initialized_at),
              health_score: row.health_score,
              scored_pages: row.scored_pages,
              page_count: row.page_count,
              pages_in_gsc: row.pages_in_gsc,
              gsc_clicks_28d: row.gsc_clicks_28d,
              gsc_impressions_28d: row.gsc_impressions_28d,
              gsc_position_28d: row.gsc_position_28d,
              updated_at: row.updated_at,
            })),
          }
        : {}),
    });
  };

  /**
   * The write half of `matrx-user/marketing` — the ONLY mount of this surface
   * that registers a handler (see the manifest's writeTargets block for why
   * the brands, connections, cost and hub-map mounts register none).
   *
   * `site_editor_draft` stages authored copy into the site editor dialog and
   * stops there: the user still presses "Save site", which runs the existing
   * version-guarded `updateSiteIdentity`. Validation is the pure, unit-tested
   * `site-write-targets.ts`, and it runs to completion BEFORE anything opens
   * or changes, so a refused write leaves the page exactly as it found it.
   *
   * Handlers are rebuilt every render; the provider holds them in a ref, so
   * `listRows` here is always the freshest committed list.
   */
  const buildWriteHandlers = (): SurfaceWriteHandlers => ({
    [SITE_EDITOR_DRAFT_TARGET]: (value: unknown) => {
      const { site, patch } = validateSiteEditorDraftWrite(value);
      const resolved = resolveSiteForWrite(
        site,
        listRows.map((row) => ({
          site_id: row.id,
          name: row.name,
          domain: row.domain,
        })),
      );

      const open = editorRef.current?.current ?? null;
      if (open?.busy) {
        throw new Error(
          `${SITE_EDITOR_DRAFT_TARGET} refused — the site editor for "${open.domain}" is mid-save. Wait for it to finish, then ask again. Nothing was staged.`,
        );
      }
      // Never silently switch editors: the open one may hold unsaved edits,
      // and closing it to serve this write would destroy the user's work.
      if (open && open.siteId !== resolved.site_id) {
        throw new Error(
          `${SITE_EDITOR_DRAFT_TARGET} refused — the site editor is already open on "${open.domain}", not "${resolved.domain}", and it may hold unsaved edits. Ask the user to close it first, or write to "${open.domain}" instead. Nothing was staged.`,
        );
      }

      if (open) {
        open.stage(patch);
        return;
      }

      // No editor open. Opening one is the whole reason this target is
      // reachable at all: the dialog is modal, so a user cannot open it and
      // THEN ask an agent — the overlay covers the header Agents button and
      // the chat composer. The user names the site; nothing is chosen for them.
      const row = listRows.find((candidate) => candidate.id === resolved.site_id);
      if (!row) {
        throw new Error(
          `${SITE_EDITOR_DRAFT_TARGET} refused — "${resolved.domain}" left the loaded sites list before the write could be applied. Nothing was staged.`,
        );
      }
      pendingStageRef.current = { siteId: row.id, patch };
      setEditing(row);
    },
  });

  const sitesListCopy = webCopy({
    kind: "web-sites-list",
    label: "Managed sites",
    description:
      "The flattened all-sites list currently loaded at /marketing/sites (respects active search/filters/page).",
    surface: "Sites list",
    data: listRows,
    lines: [
      ["Sites on this page", listRows.length],
      ["Total matching", sites.data?.total ?? listRows.length],
      ["Total managed", siteCount.data ?? null],
      ...listRows.map(
        (row): [string, string] => [
          row.domain,
          `${row.name} · ${row.page_count} pages · ${
            row.gsc_clicks_28d ?? 0
          } clicks/28d · ${row.gsc_impressions_28d ?? 0} impressions/28d`,
        ],
      ),
    ],
    attributes: { count: listRows.length, total: sites.data?.total ?? null },
  });

  const buildRowMenu = (row: SiteListRow): ItemMenuConfig => {
    const copy = siteRowCopy(row);
    return {
      header: { title: row.name, description: row.domain },
      sections: [
        {
          id: "open",
          items: [
            {
              id: "workspace",
              label: "Open workspace",
              icon: PanelsTopLeft,
              onSelect: () =>
                router.push(marketingRoutes.site(row.brand_id, row.id)),
            },
            {
              id: "quick-view",
              label: "Quick view",
              icon: Eye,
              onSelect: () => setPeeking(row),
            },
            {
              id: "live-site",
              kind: "link",
              label: "Open live site",
              icon: ExternalLink,
              href: row.root_url,
              target: "_blank",
            },
          ],
        },
        {
          id: "copy",
          items: [
            {
              id: "copy-summary",
              label: "Copy summary",
              icon: Copy,
              onSelect: () =>
                void copyToClipboard(
                  copy.human(),
                  `${row.domain} copied to clipboard`,
                ),
            },
            {
              id: "copy-ai",
              label: "Copy for AI",
              icon: Braces,
              onSelect: () =>
                void copyToClipboard(
                  buildAgentPayload(copy.agent()),
                  `${row.domain} copied for AI agent`,
                ),
            },
          ],
        },
        {
          id: "manage",
          items: [
            {
              id: "edit",
              label: "Edit site",
              icon: Pencil,
              onSelect: () => setEditing(row),
            },
            {
              id: "delete",
              label: "Delete site",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => setDeleting(row),
            },
          ],
        },
      ],
    };
  };

  const columns: MatrxColumnDef<SiteListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Site",
      filter: "text",
      cellKind: "text",
      // THE DOOR LAW: the whole-row click is a mouse convenience; the name cell
      // is the real anchor (keyboard, screen reader, cmd/middle-click). Same
      // destination as `onRowOpen`, built by the one canonical route builder.
      href: (row) => marketingRoutes.site(row.brand_id, row.id),
      cell: (row) => (
        <div className="flex min-w-52 items-center gap-2.5">
          <SiteIdentityMark site={row} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.domain}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "page_count",
      accessorKey: "page_count",
      header: "Pages",
      filter: false,
      align: "right",
      cell: (row) => (
        <PagesPeek site={row}>
          <span className="block text-right">
            <span className="block text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.page_count)}
            </span>
            <span className="block text-[10px] tabular-nums text-muted-foreground">
              {formatMetric(row.pages_in_gsc)} in Google
            </span>
            {/* Say what the count leaves out. A silently smaller number is its
                own defect — these rows are real registry evidence. */}
            {row.resource_count > 0 ? (
              <span className="block text-[10px] tabular-nums text-muted-foreground">
                +{formatMetric(row.resource_count)} resources
              </span>
            ) : null}
          </span>
        </PagesPeek>
      ),
    },
    {
      id: "gsc_clicks_28d",
      accessorKey: "gsc_clicks_28d",
      header: "Clicks · 28d",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="clicks">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.gsc_clicks_28d)}
            </span>
            <TrendDelta
              percent={trendPercent(
                row.gsc_clicks_28d,
                row.gsc_clicks_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </span>
        </GscMetricPeek>
      ),
    },
    {
      id: "gsc_impressions_28d",
      accessorKey: "gsc_impressions_28d",
      header: "Impressions · 28d",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="impressions">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatMetric(row.gsc_impressions_28d)}
            </span>
            <TrendDelta
              percent={trendPercent(
                row.gsc_impressions_28d,
                row.gsc_impressions_prev_28d,
                row.gsc_prev_days,
              )}
            />
          </span>
        </GscMetricPeek>
      ),
    },
    {
      id: "gsc_position_28d",
      accessorKey: "gsc_position_28d",
      header: "Pos.",
      filter: false,
      align: "right",
      cell: (row) => (
        <GscMetricPeek site={row} metric="position">
          <span className="text-sm tabular-nums text-foreground">
            {formatPosition(row.gsc_position_28d)}
          </span>
        </GscMetricPeek>
      ),
    },
    {
      // Weighted catalogue-analysis score from web.v_site_score, written by
      // the per-page audit workers (post-crawl analysis / Analyze command).
      // Sort is server-served via the health_score branch in listSites;
      // filter deliberately absent (same rule as the KPI columns).
      id: "health_score",
      accessorKey: "health_score",
      header: "Health",
      filter: false,
      align: "right",
      cell: (row) => (
        <span className="block text-right">
          <span
            className={cn(
              "block text-sm font-medium tabular-nums",
              row.health_score === null
                ? "text-muted-foreground"
                : row.health_score >= 90
                  ? "text-success"
                  : row.health_score >= 70
                    ? "text-warning"
                    : "text-destructive",
            )}
          >
            {row.health_score === null ? "—" : row.health_score.toFixed(1)}
          </span>
          <span className="block text-[10px] tabular-nums text-muted-foreground">
            {row.scored_pages
              ? `${formatMetric(row.scored_pages)} scored`
              : "not analyzed"}
          </span>
        </span>
      ),
    },
    {
      id: "connections",
      accessorKey: "id",
      header: "Connections",
      filter: false,
      sortable: false,
      cell: (row) => <SiteConnectionChips site={row} />,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing"
      getScope={getHubScope}
      getWriteHandlers={buildWriteHandlers}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Sites
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <div className="flex items-center gap-1">
            {listRows.length > 0 ? (
              <CopyButtons size="icon" {...sitesListCopy} />
            ) : null}
            <RefreshCwTapButton
              ariaLabel="Refresh sites"
              onClick={() => void sites.refetch()}
              disabled={sites.isFetching}
              className={sites.isFetching ? "animate-spin" : undefined}
            />
          </div>
        }
      />
      <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <section className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SearchCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                Seed sites from connected data
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                Set up Google Search Console or organization credentials, then
                bind a property to a managed site.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
          >
            <Link href="/marketing/connections">
              Connections <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </section>
        {sites.isError ? (
          <QueryError
            error={sites.error}
            onRetry={() => void sites.refetch()}
          />
        ) : (
          <div className="min-h-0 flex-1">
            <MatrxDataTable<SiteListRow>
              data={sites.data?.rows ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={sites.isLoading}
              isFetching={sites.isFetching}
              query={{
                mode: "controlled",
                state: table.state,
                totalItems: sites.data?.total ?? 0,
                onStateChange: table.onStateChange,
              }}
              toolbar={{
                searchPlaceholder: "Search name, domain, or URL…",
                leading:
                  siteCount.data !== undefined ? (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {siteCount.data.toLocaleString()} managed
                      {hasFilters && sites.data
                        ? ` · ${sites.data.total.toLocaleString()} matching`
                        : ""}
                    </span>
                  ) : undefined,
                actions: (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => router.push("/marketing/sites/new")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add site
                  </Button>
                ),
              }}
              detail={{ enabled: false }}
              onRowOpen={(row) => router.push(marketingRoutes.site(row.brand_id, row.id))}
              rowActions={(row) => (
                <span onClick={(event) => event.stopPropagation()}>
                  <ItemMenu config={() => buildRowMenu(row)} align="end">
                    <button
                      type="button"
                      aria-label={`Actions for ${row.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </ItemMenu>
                </span>
              )}
              emptyState={{
                icon: <Globe2 className="h-8 w-8 text-muted-foreground" />,
                title: hasFilters
                  ? "No sites match your filters"
                  : "No managed sites",
                description: hasFilters
                  ? "Clear the current search and filters to return to the complete site portfolio."
                  : "Add a site to begin building its canonical page registry.",
                action: (
                  <Button
                    size="sm"
                    variant={hasFilters ? "outline" : "default"}
                    onClick={() => {
                      if (hasFilters) {
                        table.onStateChange({
                          ...table.state,
                          page: 1,
                          search: "",
                          anyOf: "",
                          columnFilters: {},
                        });
                      } else {
                        router.push("/marketing/sites/new");
                      }
                    }}
                  >
                    {hasFilters ? "Clear filters" : "Add your first site"}
                  </Button>
                ),
              }}
            />
          </div>
        )}
      </main>

      {peeking ? (
        <SitePeekWindow site={peeking} onClose={() => setPeeking(null)} />
      ) : null}
      <SiteEditorDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            // A dismissed editor must not leave a queued agent patch behind to
            // land on whatever the user opens next.
            pendingStageRef.current = null;
            setEditing(null);
          }
        }}
        site={editing}
        onRegister={registerEditor}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : "Delete site?"}
        description="The site moves to trash and disappears from every list. This does not delete the brand."
        variant="destructive"
        confirmLabel="Delete site"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </SurfaceRuntimeProvider>
  );
}

export function SitesPortfolioLoading() {
  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Sites
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
          <div className="h-11 shrink-0 border-b border-border bg-muted/20" />
          <div className="grid h-9 shrink-0 grid-cols-8 gap-3 border-b border-border px-3 py-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded bg-muted" />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {Array.from({ length: 7 }).map((_, row) => (
              <div
                key={row}
                className="grid h-10 grid-cols-8 gap-3 border-b border-border/60 px-3 py-2.5"
              >
                {Array.from({ length: 8 }).map((__, column) => (
                  <div
                    key={column}
                    className="animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
