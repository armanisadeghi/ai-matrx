"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, SearchCheck } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GovernedActionDialog } from "@/features/access-gate/components/GovernedActionDialog";
import { isGovernedActionDenial } from "@/features/access-gate/lib/governedActionError";
import {
  buildSiteMenu,
  siteRowCopy,
} from "@/features/marketing/components/sites/site-actions";
import {
  renderSiteListMobileCard,
  SITE_LIST_COLUMNS,
} from "@/features/marketing/components/sites/site-list-presentation";
import { SiteEditorDialog } from "@/features/marketing/components/sites/SiteEditorDialog";
import type { SiteEditorHandleRef } from "@/features/marketing/components/sites/SiteEditorDialog";
import { useDeleteSite, useSiteCount } from "@/features/marketing/data/hooks";
import {
  siteListService,
  toSiteTableQueryState,
} from "@/features/marketing/data/site-list-service";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { marketingListQuery } from "@/features/marketing/lib/scopes/marketing-hub-scope";
import {
  resolveSiteForWrite,
  SITE_EDITOR_DRAFT_TARGET,
  validateSiteEditorDraftWrite,
  type SiteDraftPatch,
} from "@/features/marketing/lib/site-write-targets";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { GscPortfolioClassBar } from "@/features/marketing/search-console/components/ambassador/GscPortfolioClassBar";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import type {
  EntityListConfig,
  EntityListController,
} from "@/lib/entity-list/config";
import {
  EntityListPage,
  type EntityListSurface,
} from "@/lib/entity-list/components/EntityListPage";
import { toast } from "@/lib/toast";
import { RefreshCwTapButton } from "@ai-matrx/tap-target/buttons";

// Quick view opens one-at-a-time on user action, so the WindowPanel machinery
// stays behind this lazy edge (lazyOverlay pattern — code-splitting skill).
const SitePeekWindow = dynamic(
  () => import("@/features/marketing/components/sites/SitePeekWindow"),
  { ssr: false },
);

function sitesListCopy(rows: SiteListRow[], total: number, managed?: number) {
  return webCopy({
    kind: "web-sites-list",
    label: "Managed sites",
    description:
      "The flattened all-sites list currently loaded at /marketing/sites (respects active search/filters/page).",
    surface: "Sites list",
    data: rows,
    lines: [
      ["Sites on this page", rows.length],
      ["Total matching", total],
      ["Total managed", managed ?? null],
      ...rows.map((row): [string, string] => [
        row.domain,
        `${row.name} · ${row.page_count} pages · ${
          row.gsc_clicks_28d ?? 0
        } clicks/28d · ${row.gsc_impressions_28d ?? 0} impressions/28d`,
      ]),
    ],
    attributes: { count: rows.length, total },
  });
}

export function SitesPortfolio({
  brandId,
}: {
  /** When set, the portfolio lists only this brand's websites. */
  brandId?: string | null;
} = {}) {
  const router = useRouter();
  const deleteMutation = useDeleteSite();
  // access-errors: ok — surface/list-copy total; the entity list is primary.
  const siteCount = useSiteCount();
  const [editing, setEditing] = useState<MarketingSite | null>(null);
  const [deleting, setDeleting] = useState<MarketingSite | null>(null);
  const [deniedDelete, setDeniedDelete] = useState<MarketingSite | null>(null);
  const [peeking, setPeeking] = useState<SiteListRow | null>(null);
  const listRef = useRef<EntityListController<SiteListRow> | null>(null);

  // The open site editor's live handle plus a patch waiting for an editor this
  // component just opened. Refs are required because surface-write approval
  // resolves handlers before the user answers its confirmation.
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
      listRef.current?.removeRow(deleting.id);
      listRef.current?.refresh();
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
    } catch (error) {
      if (isGovernedActionDenial(error)) {
        setDeniedDelete(deleting);
        setDeleting(null);
        return;
      }
      toast.error("Could not delete site. Please try again.");
    }
  };

  const buildWriteHandlers = (
    list: EntityListController<SiteListRow>,
  ): SurfaceWriteHandlers => ({
    [SITE_EDITOR_DRAFT_TARGET]: (value: unknown) => {
      const { site, patch } = validateSiteEditorDraftWrite(value);
      const resolved = resolveSiteForWrite(
        site,
        list.rows.map((row) => ({
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
      if (open && open.siteId !== resolved.site_id) {
        throw new Error(
          `${SITE_EDITOR_DRAFT_TARGET} refused — the site editor is already open on "${open.domain}", not "${resolved.domain}", and it may hold unsaved edits. Ask the user to close it first, or write to "${open.domain}" instead. Nothing was staged.`,
        );
      }
      if (open) {
        open.stage(patch);
        return;
      }

      const row = list.rows.find(
        (candidate) => candidate.id === resolved.site_id,
      );
      if (!row) {
        throw new Error(
          `${SITE_EDITOR_DRAFT_TARGET} refused — "${resolved.domain}" left the loaded sites list before the write could be applied. Nothing was staged.`,
        );
      }
      pendingStageRef.current = { siteId: row.id, patch };
      setEditing(row);
    },
  });

  const config: EntityListConfig<SiteListRow> = {
    surfaceKey: brandId ? `marketing-sites-${brandId}` : "marketing-sites",
    entityLabel: { singular: "site", plural: "sites" },
    sourceFeature: "marketing",
    scopes: ["orgs"],
    service: siteListService(brandId),
    columns: SITE_LIST_COLUMNS,
    prefsVersion: 1,
    prefsDefaults: {
      sort: "gsc_clicks_28d",
      direction: "desc",
      pageSize: 25,
    },
    getRowId: (row) => row.id,
    getRowName: (row) => row.name,
    door: {
      token: "web_site",
      column: "name",
      hrefFor: (row) => marketingRoutes.site(row.brand_id, row.id),
    },
    getRowEntity: (row) => ({
      type: "web_site",
      id: row.id,
      title: row.name,
      resourceType: "web_site",
    }),
    useRowActions: (list) => {
      listRef.current = list;
      return {
        actions: {
          menuFor: (site) => () =>
            buildSiteMenu({
              site,
              onOpenWorkspace: (href) => router.push(href),
              onQuickView: setPeeking,
              onEditSite: setEditing,
              onDeleteSite: setDeleting,
            }),
          onOpenRow: (row) =>
            router.push(marketingRoutes.site(row.brand_id, row.id)),
        },
      };
    },
    supportsArchived: false,
    facetSections: [],
    copy: {
      label: "Site",
      listLabel: "Sites",
      location: "/marketing/sites",
      rowKind: "web-site",
      listKind: "web-sites-list",
      rowDescription: "One managed website row from the Marketing sites list.",
      humanRow: (row) => siteRowCopy(row).human(),
      agentRow: (row) => row,
      rowAttributes: (row) => ({
        site_id: row.id,
        brand_id: row.brand_id,
        status: row.status,
      }),
      // The canonical seven-action menu owns row copy; the shell header below
      // owns list copy. Suppress duplicate controls while retaining one config.
      showRow: false,
      showToolbar: false,
    },
    mobileCards: renderSiteListMobileCard,
    emptyState: {
      title: "No managed sites",
      description: "Add a site to begin building its canonical page registry.",
    },
  };

  const surface: EntityListSurface<SiteListRow> = {
    surfaceName: "matrx-user/marketing",
    getScope: (list) => {
      const openEditor = editorRef.current?.current ?? null;
      return createMarketingScope({
        hub_view: "sites",
        list_query: marketingListQuery(
          toSiteTableQueryState(list.query, list.view),
        ),
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
        sites_total: list.total,
        ...(list.rows.length > 0
          ? {
              visible_sites: list.rows.map((row) => ({
                site_id: row.id,
                brand_id: row.brand_id,
                name: row.name,
                domain: row.domain,
                root_url: row.root_url,
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
    },
    getWriteHandlers: buildWriteHandlers,
  };

  const addSiteButton = (
    <Button
      size="sm"
      className="h-11 gap-1.5 lg:h-7"
      onClick={() => router.push("/marketing/sites/new")}
    >
      <Plus className="h-3.5 w-3.5" />
      <span className="max-sm:sr-only">Add site</span>
    </Button>
  );

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
      <main className="h-full overflow-hidden bg-textured">
        <EntityListPage
          config={config}
          defaultScope={{ kind: "orgs", organizationId: null }}
          surface={surface}
          notice={(list) => (
            <div className="space-y-2">
              <GscPortfolioClassBar
                siteIds={list.rows.map((site) => site.id)}
                totalSites={list.total}
              />
              <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-card px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <SearchCheck className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      Seed sites from connected data
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      Set up GSC or organization credentials, then bind a
                      property to a managed site.
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-11 gap-1.5 text-xs lg:h-7"
                >
                  <Link href="/marketing/connections">
                    Connections <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </section>
            </div>
          )}
          headerActions={(list) => {
            const copy = sitesListCopy(list.rows, list.total, siteCount.data);
            return (
              <>
                {list.rows.length > 0 ? (
                  <CopyButtons size="icon" {...copy} />
                ) : null}
                <RefreshCwTapButton
                  ariaLabel="Refresh sites"
                  onClick={list.refresh}
                  disabled={list.isFetching}
                  className={list.isFetching ? "animate-spin" : undefined}
                />
                {addSiteButton}
              </>
            );
          }}
          emptyAction={addSiteButton}
        />
      </main>

      {peeking ? (
        <SitePeekWindow site={peeking} onClose={() => setPeeking(null)} />
      ) : null}
      <SiteEditorDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            pendingStageRef.current = null;
            setEditing(null);
          }
        }}
        site={editing}
        onRegister={registerEditor}
        onSaved={() => listRef.current?.refresh()}
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
      {deniedDelete ? (
        <GovernedActionDialog
          open
          onOpenChange={(next) => !next && setDeniedDelete(null)}
          resourceType="web_site"
          resourceId={deniedDelete.id}
          itemName={deniedDelete.name}
          href={marketingRoutes.site(deniedDelete.brand_id, deniedDelete.id)}
        />
      ) : null}
    </>
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
