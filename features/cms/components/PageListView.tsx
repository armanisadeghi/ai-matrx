"use client";

import React, { useState, useMemo } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { MoreHorizontalTapButton } from "@ai-matrx/tap-target/buttons";
import type {
  ClientComponent,
  ClientPageSummary,
  ClientSite,
} from "@/features/cms/types";
import {
  classifyContentVolume,
  type ContentVolume,
} from "@/features/cms/utils/contentVolume";
import { Button } from "@/components/ui/button";
import { SurfaceRoleAgentButton } from "@/features/surfaces/components/chrome/SurfaceRoleAgentButton";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { itemMenuConfigToExtraSections } from "@/components/official/item/itemMenuToV3";
import { buildDefaultTableRowMenuDescriptor, createTableRowMenuDescriptor } from "@/features/context-menu-v3/table-row-context-registry";
import { buildCmsPageMenu } from "@/features/cms/actions/buildCmsPageMenu";
import {
  CmsPageAiActionDialog,
  type CmsPageAiIntent,
} from "@/features/cms/components/CmsPageAiActionDialog";
import {
  activeSiteDomain,
  clientPageUrl,
  sitePreviewToken,
} from "@/features/cms/utils/pageUrls";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  Loader2,
  AlertCircle,
  FileText,
  Home,
  Navigation,
  Globe,
  FileCode,
  BookOpen,
  Users,
  Mail,
  Briefcase,
} from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface PageListViewProps {
  site: ClientSite;
  pages: ClientPageSummary[];
  components: readonly ClientComponent[];
  isLoading: boolean;
  error: string | null;
  onOpenPage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onPublishPage: (pageId: string) => void | Promise<void>;
  onRefresh: () => void;
  /**
   * Row the user is pointing at, so the `matrx-user/cms-site` surface can emit
   * an honest `selected_page_id` when an agent is launched from the list.
   */
  onFocusPage?: (pageId: string) => void;
}

// Content-volume indicator (features/cms/utils/contentVolume.ts): the stage
// word is a conservative guess; the char count beside it is the measurement.
const VOLUME_DOT: Record<ContentVolume["stage"], string> = {
  empty: "bg-red-500/80",
  stub: "bg-amber-500/80",
  light: "bg-sky-500/80",
  full: "bg-emerald-500/80",
};
const VOLUME_TEXT: Record<ContentVolume["stage"], string> = {
  empty: "text-red-600 dark:text-red-400",
  stub: "text-amber-600 dark:text-amber-400",
  light: "text-sky-600 dark:text-sky-400",
  full: "text-emerald-600 dark:text-emerald-400",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  root: Home,
  general: FileText,
  services: Briefcase,
  education: BookOpen,
  team: Users,
  contact: Mail,
};

const PAGE_TYPE_COLORS: Record<string, string> = {
  home: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  standard: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  service: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  blog: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  listing: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
};

export default function PageListView({
  site,
  pages,
  components,
  isLoading,
  error,
  onOpenPage,
  onDeletePage,
  onPublishPage,
  onRefresh,
  onFocusPage,
}: PageListViewProps) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientPageSummary | null>(
    null,
  );
  const [aiTarget, setAiTarget] = useState<{
    page: ClientPageSummary;
    intent: CmsPageAiIntent;
  } | null>(null);
  const [publishTarget, setPublishTarget] = useState<ClientPageSummary | null>(
    null,
  );
  const [isPublishing, setIsPublishing] = useState(false);

  // ── Derive categories from data ──────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(pages.map((p) => p.category).filter(Boolean));
    return Array.from(cats).sort() as string[];
  }, [pages]);

  const columns: MatrxColumnDef<ClientPageSummary>[] = [
    {
      id: "title",
      header: "Page",
      accessorKey: "title",
      width: 300,
      cell: (page) => {
        const CatIcon = (CATEGORY_ICONS[page.category ?? ""] ??
          FileCode) as React.FC<{ className?: string }>;
        const volume = classifyContentVolume(page.content_stats);
        return (
          <>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center flex-shrink-0">
                <CatIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">
                    {page.title}
                  </span>
                  {page.is_home_page && (
                    <Home className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  )}
                  {page.show_in_nav && (
                    <Navigation className="h-3 w-3 text-blue-500 flex-shrink-0" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  /{page.slug}
                  {volume && (
                    // Compact content cue beside the slug on narrow screens.
                    <span
                      className={`sm:hidden inline-block h-2 w-2 rounded-full ${VOLUME_DOT[volume.stage]}`}
                      title={`${volume.label} · ${volume.htmlDisplay} chars — ${volume.detail}`}
                    />
                  )}
                </span>
              </div>
            </div>
          </>
        );
      },
    },
    {
      id: "category",
      header: "Category",
      accessorKey: "category",
      width: 180,
      cell: (page) => {
        const typeColor =
          PAGE_TYPE_COLORS[page.page_type ?? ""] ?? PAGE_TYPE_COLORS.standard;
        return (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] capitalize">
                {page.category ?? "general"}
              </Badge>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeColor}`}
              >
                {page.page_type ?? "standard"}
              </span>
            </div>
          </>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (page) =>
        `${page.is_published ? "Published" : "Unpublished"}${page.has_draft ? " Draft" : ""}`,
      width: 160,
      cell: (page) => {
        return (
          <>
            <div className="flex items-center gap-1.5">
              {page.is_published ? (
                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Unpublished
                </Badge>
              )}
              {page.has_draft && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400"
                >
                  Draft
                </Badge>
              )}
            </div>
          </>
        );
      },
    },
    {
      id: "content",
      header: "Content",
      accessorFn: (page) =>
        classifyContentVolume(page.content_stats)?.htmlDisplay ?? "",
      width: 160,
      cell: (page) => {
        const volume = classifyContentVolume(page.content_stats);
        return (
          <>
            {volume ? (
              <span
                className="inline-flex items-center gap-1.5"
                title={volume.detail}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${VOLUME_DOT[volume.stage]}`}
                />
                <span
                  className={`text-[11px] font-medium ${VOLUME_TEXT[volume.stage]}`}
                >
                  {volume.label}
                </span>
                {volume.stage !== "empty" && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {volume.htmlDisplay}
                    {volume.source === "draft" ? " (draft)" : ""}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">—</span>
            )}
          </>
        );
      },
    },
    {
      id: "updated_at",
      header: "Updated",
      accessorKey: "updated_at",
      width: 140,
      cell: (page) => {
        return (
          <>
            <span className="text-xs text-muted-foreground">
              {new Date(page.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </>
        );
      },
    },
    {
      id: "sort_order",
      accessorKey: "sort_order",
      header: "Order",
      hidden: true,
    },
  ];

  const categoryRows = categoryFilter
    ? pages.filter((page) => page.category === categoryFilter)
    : pages;

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading pages…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error && pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Failed to load pages</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Retry
          </Button>
          <ErrorAlchemyMenu />
        </div>
      </div>
    );
  }

  const pageMenu = (page: ClientPageSummary) => buildCmsPageMenu({
    page,
    editorHref: cmsPageEditorHref(site.id, page.id),
    previewHref: clientPageUrl({ siteSlug: site.slug, slug: page.slug, route: page.route, category: page.category, preview: true, previewToken: sitePreviewToken(site) }),
    liveHref: page.is_published ? clientPageUrl({ siteSlug: site.slug, slug: page.slug, route: page.route, category: page.category, domain: activeSiteDomain(site) }) : null,
    planHref: site.web_site_id && page.plan_node_id ? `${marketingRoutes.contentPlanSite(site.web_site_id)}?node=${encodeURIComponent(page.plan_node_id)}` : null,
    measureHref: page.web_page_id ? cmsPageEditorHref(site.id, page.id, "measure") : null,
    onAi: () => setAiTarget({ page, intent: "build-edit" }),
    onReview: () => setAiTarget({ page, intent: "review" }),
    onPublish: () => setPublishTarget(page),
    onDelete: () => setDeleteTarget(page),
  });

  return (
    <div data-matrx-table-page className="py-4 space-y-4">
      <MatrxDataTable<ClientPageSummary>
        tableId={`cms/site/${site.id}/pages`}
        data={categoryRows}
        columns={columns}
        getRowId={(page) => page.id}
        defaultSort={{ id: "sort_order", direction: "asc" }}
        rowCopyPlacement="menu"
        contextMenu={{
          resolveRowContext: (page, controls) => {
            const base = buildDefaultTableRowMenuDescriptor(page, controls);
            return createTableRowMenuDescriptor({
              context: {
                ...base.context,
                ...(page.web_page_id ? { __entity: { type: "web_page" as const, id: page.web_page_id, title: page.title, resourceType: "web_page" as const } } : {}),
              },
              extraSections: [...base.extraSections, ...itemMenuConfigToExtraSections(pageMenu(page))],
            });
          },
        }}
        detail={{ enabled: false }}
        onRowOpen={(page) => onOpenPage(page.id)}
        isLoading={isLoading && pages.length === 0}
        isFetching={isLoading && pages.length > 0}
        toolbar={{
          title: "Pages",
          searchPlaceholder: "Search pages…",
          refresh: { onRefresh },
          facets: [
            {
              type: "button-group",
              id: "category",
              value: categoryFilter ?? "",
              defaultValue: "",
              options: [
                { value: "", label: "All" },
                ...categories.map((category) => ({
                  value: category,
                  label: category,
                })),
              ],
              onChange: (value) => setCategoryFilter(value || null),
            },
          ],
          actions: (
            <SurfaceRoleAgentButton
              surfaceName="matrx-user/cms-site"
              roleName="site_editor"
              label="Site editor AI"
            />
          ),
        }}
        rowWrapper={(page, row) =>
          React.isValidElement<React.HTMLAttributes<HTMLTableRowElement>>(row)
            ? React.cloneElement(row, {
                onMouseEnter: () => onFocusPage?.(page.id),
                onFocus: () => onFocusPage?.(page.id),
              })
            : row
        }
        rowActions={(page) => {
          return (
            <ItemMenu
              align="end"
              contentMinWidth="15rem"
              config={() => pageMenu(page)}
            >
              <MoreHorizontalTapButton
                variant="transparent"
                ariaLabel={`Actions for ${page.title}`}
              />
            </ItemMenu>
          );
        }}
        emptyState={{
          title:
            pages.length === 0 ? "No pages yet" : "No pages match your filters",
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete page"
        description={
          <>
            Permanently delete <b>{deleteTarget?.title}</b>? This cannot be
            undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            onDeletePage(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!publishTarget}
        onOpenChange={(open) => {
          if (!open && !isPublishing) setPublishTarget(null);
        }}
        title="Publish pending draft"
        description={
          <>
            Publish the saved draft for <b>{publishTarget?.title}</b> to the
            live website?
          </>
        }
        confirmLabel="Publish"
        busy={isPublishing}
        onConfirm={async () => {
          if (!publishTarget) return;
          setIsPublishing(true);
          try {
            await onPublishPage(publishTarget.id);
            setPublishTarget(null);
          } finally {
            setIsPublishing(false);
          }
        }}
      />
      {aiTarget ? (
        <CmsPageAiActionDialog
          open
          onOpenChange={(next) => {
            if (!next) setAiTarget(null);
          }}
          intent={aiTarget.intent}
          site={site}
          pages={pages}
          components={components}
          page={aiTarget.page}
          editorHref={cmsPageEditorHref(site.id, aiTarget.page.id)}
          keywordHref={cmsPageEditorHref(site.id, aiTarget.page.id, "seo")}
          planHref={`${cmsPageEditorHref(site.id, aiTarget.page.id)}?tab=plan`}
          onPageChanged={onRefresh}
        />
      ) : null}
    </div>
  );
}
