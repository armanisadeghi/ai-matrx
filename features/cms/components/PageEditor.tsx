"use client";

import React, {
  lazy,
  Suspense,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  ClientComponent,
  ClientPage,
  ClientPageSummary,
  ClientSite,
  VersionOperation,
} from "@/features/cms/types";
import { useCmsVersions } from "@/features/cms/hooks/useCmsVersions";
import { useCmsPageSurfaceScope } from "@/features/cms/hooks/useCmsPageSurfaceScope";
import type { CmsPageEditorTab } from "@/features/cms/agent-context/buildCmsPageContextData";
import { useCmsResearchLineage } from "@/features/cms/hooks/useCmsResearchLineage";
import { useCmsPagePlanContext } from "@/features/cms/hooks/useCmsPagePlanContext";
import { ResearchLineagePanel } from "@/features/cms/components/ResearchLineagePanel";
import { PageSeoPlanSection } from "@/features/cms/components/PageSeoPlanSection";
import {
  CmsPageAiActionDialog,
  type CmsPageAiIntent,
} from "@/features/cms/components/CmsPageAiActionDialog";
import { CmsPageService } from "@/features/cms/services/cmsService";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import { CMS_PAGE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsPageContextMenuProps";
import { createCmsPageExtraSections } from "@/features/cms/agent-context/cmsPageExtraSections";
import {
  activeSiteDomain,
  clientPageUrl,
  sitePreviewToken,
} from "@/features/cms/utils/pageUrls";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { SurfaceRoleAgentButton } from "@/features/surfaces/components/chrome/SurfaceRoleAgentButton";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Save,
  Upload,
  Undo2,
  Trash2,
  Eye,
  Code2,
  Paintbrush,
  FileCode2,
  Settings2,
  Search as SearchIcon,
  History,
  Loader2,
  AlertCircle,
  Globe,
  XCircle,
  RotateCcw,
  ArrowLeft,
  Map as MapIcon,
  Gauge,
  ExternalLink,
  FilePenLine,
} from "lucide-react";
import { usePageLocation } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  countSeoCharacters,
  DESCRIPTION_LIMITS,
  TITLE_LIMITS,
} from "@/features/marketing/seo/serp/metrics";

interface PageEditorProps {
  siteId: string;
  site: ClientSite;
  pages: readonly ClientPageSummary[];
  components: readonly ClientComponent[];
  page: ClientPage | null;
  isSaving: boolean;
  error: string | null;
  onSave: (
    pageId: string,
    updates: Record<string, unknown>,
  ) => Promise<ClientPage>;
  onSaveDraft: (
    pageId: string,
    draft: Record<string, unknown>,
  ) => Promise<ClientPage>;
  onPublish: (pageId: string) => Promise<ClientPage>;
  onDiscardDraft: (pageId: string) => Promise<void>;
  /** Optional: no-op until the page has been created (see /pages/new). */
  onRollback?: (pageId: string, versionNumber: number) => Promise<void>;
  onCreate: (params: Record<string, unknown>) => Promise<ClientPage>;
  onClose: () => void;
  /**
   * Reload the page row from the DB. The Plan tab's adopt writes
   * `plan_node_id` server-side, so the editor must re-read to see it. Absent on
   * `/pages/new` (nothing to reload yet).
   */
  onRefetchPage?: () => Promise<void>;
}

/** How a `history.row_versions` operation reads to a human. */
const VERSION_OPERATION_LABEL: Record<VersionOperation, string> = {
  INSERT: "Page created",
  UPDATE: "Content changed",
  DELETE: "Page deleted",
};

type EditorTab = CmsPageEditorTab;

/**
 * The Plan tab is the page's BEFORE (docs/handoffs/cms-page-hub.md W1): the
 * plan node this page was built from, plus the adopt flow for pages that were
 * never planned. Lazy because it pulls the whole content-plan data layer —
 * `React.lazy`, NOT `next/dynamic`: this editor is already one chunk behind the
 * route, and a new `next/dynamic` edge here would be another chunk group (THE
 * FRAGMENTATION LAW).
 */
const PagePlanTab = lazy(() => import("./PagePlanTab"));

/**
 * The Measure tab is the page's AFTER (docs/handoffs/cms-page-hub.md W2): the
 * measured page this CMS page is joined to — Page Analyzer, open findings,
 * snapshots, Search Console. It mounts the canonical `PageWorkspace` from the
 * marketing route wholesale; a tab that reuses a route component is free, and
 * rebuilding a poorer copy of it is the Inventory Law violation this avoids.
 * `React.lazy` for the same reason as the Plan tab above.
 */
const CmsPageMeasure = lazy(() => import("./measure/CmsPageMeasure"));

// ── Surface write-target input validation ──────────────────────────────
// The writeback seam (`features/surfaces/runtime/surface-writeback.ts`)
// converts a throw into a safe error envelope the agent reads, so a bad
// shape is REPORTED rather than silently coerced.

function asWriteObject(
  value: unknown,
  target: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  return value as Record<string, unknown>;
}

/** Absent/null = "leave this field alone"; a string (even "") = set it. */
function optionalWriteString(
  obj: Record<string, unknown>,
  key: string,
  target: string,
): string | undefined {
  const raw = obj[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new Error(`${target}: ${key} must be a string when provided.`);
  }
  return raw;
}

/**
 * Tab governance (docs/handoffs/cms-page-hub.md item 5): the three code
 * buffers are ONE "Code" tab with an inner switcher, keeping the strip at 7
 * tabs. The URL's `?tab=` stays at the finer grain (`html`/`css`/`js` while on
 * Code) so deep links land on the exact buffer and every pre-fold link keeps
 * working.
 */
type CodeSubTab = "html" | "css" | "js";
type TopTab =
  | "code"
  | "preview"
  | "plan"
  | "seo"
  | "measure"
  | "settings"
  | "versions";

const CODE_SUB_TABS: { id: CodeSubTab; label: string; icon: React.ElementType }[] =
  [
    { id: "html", label: "HTML", icon: Code2 },
    { id: "css", label: "CSS", icon: Paintbrush },
    { id: "js", label: "JS", icon: FileCode2 },
  ];

// Preview leads (Arman, 2026-08-16): landing on a page should show the pretty
// rendered page, never a wall of code.
const TABS: { id: TopTab; label: string; icon: React.ElementType }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: Code2 },
  { id: "plan", label: "Plan", icon: MapIcon },
  { id: "seo", label: "SEO", icon: SearchIcon },
  { id: "measure", label: "Measure", icon: Gauge },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "versions", label: "History", icon: History },
];

function isCodeSubTab(value: string | null): value is CodeSubTab {
  return value === "html" || value === "css" || value === "js";
}

function isTopTab(value: string | null): value is TopTab {
  return TABS.some((tab) => tab.id === value);
}

export default function PageEditor({
  siteId,
  site,
  pages,
  components,
  page,
  isSaving,
  error,
  onSave,
  onSaveDraft,
  onPublish,
  onDiscardDraft,
  onRollback,
  onCreate,
  onClose,
  onRefetchPage,
}: PageEditorProps) {
  const isNew = !page;
  const searchParams = useSearchParams();
  const [activeTab, setActiveTabState] = useState<TopTab>(() => {
    const requestedTab = searchParams.get("tab");
    if (isCodeSubTab(requestedTab)) return "code";
    if (isTopTab(requestedTab)) return requestedTab;
    // Land on the rendered page, not the code — except a brand-new page,
    // which has nothing to preview and needs its content typed first.
    return page ? "preview" : "code";
  });
  const [codeTab, setCodeTabState] = useState<CodeSubTab>(() => {
    const requestedTab = searchParams.get("tab");
    return isCodeSubTab(requestedTab) ? requestedTab : "html";
  });
  // The tab the rest of the system reasons about (agent scope, context menus,
  // text replace): the Code tab resolves to whichever buffer is showing.
  const effectiveTab: EditorTab = activeTab === "code" ? codeTab : activeTab;
  // Tabs are URL state ("routes are free") — every switch lands in `?tab=` so
  // any tab is shareable/deep-linkable. `replaceState` keeps history clean and
  // never re-runs the server component.
  const syncTabToUrl = (value: EditorTab) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", value);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  };
  const setActiveTab = (tab: TopTab) => {
    setActiveTabState(tab);
    syncTabToUrl(tab === "code" ? codeTab : tab);
  };
  const setCodeTab = (sub: CodeSubTab) => {
    setCodeTabState(sub);
    syncTabToUrl(sub);
  };
  const versions = useCmsVersions();
  // THE DOOR LAW: when this page is joined to its measured page, the marketing
  // workspace for that page is one click away (new tab — the editor's unsaved
  // buffers must survive). Disabled query until the join exists.
  const measuredPage = usePageLocation(page?.web_page_id ?? null);
  const measuredPageHref = measuredPage.data
    ? marketingRoutes.sitePage(
        measuredPage.data.brandId,
        measuredPage.data.siteId,
        measuredPage.data.pageId,
      )
    : null;
  // Shared ref: only one Pro editor is mounted at a time (gated by
  // `activeTab` — the HTML/CSS/JS textareas or the SEO meta-description
  // textarea), so a single ref always points at whichever one is live.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [aiDialogIntent, setAiDialogIntent] = useState<CmsPageAiIntent | null>(
    null,
  );

  // ── Local editor state ───────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [cssContent, setCssContent] = useState("");
  const [jsContent, setJsContent] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [category, setCategory] = useState("general");
  const [pageType, setPageType] = useState("standard");
  const [excerpt, setExcerpt] = useState("");
  const [showInNav, setShowInNav] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [tags, setTags] = useState("");
  const [useClientHeader, setUseClientHeader] = useState(true);
  const [useClientFooter, setUseClientFooter] = useState(true);

  const researchLineage = useCmsResearchLineage({
    scope: "page",
    cmsEntityId: page?.id ?? `new:${siteId}`,
    webSiteId: site.web_site_id,
    planNodeId: page?.plan_node_id,
    webPageId: page?.web_page_id,
    researchTopicIds: page?.research_topic_ids ?? [],
    researchTagIds: page?.research_tag_ids ?? [],
    persistScratch: async (topicIds, tagIds) => {
      if (!page) throw new Error("Create the page before attaching research.");
      await CmsPageService.setResearchLineage(page.id, topicIds, tagIds);
    },
  });
  const planContext = useCmsPagePlanContext(page?.plan_node_id);

  // ── Sync from page prop ──────────────────────────────────────────────
  useEffect(() => {
    if (page) {
      setTitle(page.title);
      setSlug(page.slug);
      // For editing: prefer draft content if it exists, else use published
      setHtmlContent(page.html_content_draft ?? page.html_content ?? "");
      setCssContent(page.css_content_draft ?? page.css_content ?? "");
      setJsContent(page.js_content_draft ?? page.js_content ?? "");
      setMetaTitle(page.meta_title_draft ?? page.meta_title ?? "");
      setMetaDescription(
        page.meta_description_draft ?? page.meta_description ?? "",
      );
      setMetaKeywords(page.meta_keywords_draft ?? page.meta_keywords ?? "");
      setOgImage(page.og_image_draft ?? page.og_image ?? "");
      setCanonicalUrl(page.canonical_url_draft ?? page.canonical_url ?? "");
      setCategory(page.category ?? "general");
      setPageType(page.page_type ?? "standard");
      setExcerpt(page.excerpt ?? "");
      setShowInNav(page.show_in_nav);
      setSortOrder(page.sort_order);
      setTags((page.tags ?? []).join(", "));
      setUseClientHeader(page.use_client_header);
      setUseClientFooter(page.use_client_footer);
      // Fetch version history
      versions.fetchVersions(page.id);
    } else {
      // Reset for new page
      setTitle("");
      setSlug("");
      setHtmlContent("");
      setCssContent("");
      setJsContent("");
      setMetaTitle("");
      setMetaDescription("");
      setMetaKeywords("");
      setOgImage("");
      setCanonicalUrl("");
      setCategory("general");
      setPageType("standard");
      setExcerpt("");
      setShowInNav(false);
      setSortOrder(0);
      setTags("");
      setUseClientHeader(true);
      setUseClientFooter(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);

  // ── Auto-generate slug from title ────────────────────────────────────
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (isNew) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, ""),
      );
    }
  };

  // ── Save handlers ────────────────────────────────────────────────────
  const handleCreate = async () => {
    await onCreate({
      siteId,
      title,
      slug,
      htmlContent,
      cssContent: cssContent || undefined,
      jsContent: jsContent || undefined,
      metaTitle: metaTitle || undefined,
      metaDescription: metaDescription || undefined,
      metaKeywords: metaKeywords || undefined,
      category,
      pageType,
      excerpt: excerpt || undefined,
      showInNav,
      sortOrder,
      useClientHeader,
      useClientFooter,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    });
  };

  const handleSaveDraft = async () => {
    if (!page) return;
    await onSaveDraft(page.id, {
      htmlContent,
      cssContent,
      jsContent,
      metaTitle,
      metaDescription,
      metaKeywords,
      ogImage,
      canonicalUrl,
    });
  };

  const handleSaveLive = async () => {
    if (!page) return;
    await onSave(page.id, {
      title,
      slug,
      htmlContent,
      cssContent,
      jsContent,
      metaTitle,
      metaDescription,
      metaKeywords,
      ogImage,
      canonicalUrl,
      category,
      pageType,
      excerpt,
      showInNav,
      sortOrder,
      useClientHeader,
      useClientFooter,
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : null,
    });
  };

  const handlePublish = async () => {
    if (!page) return;
    await onPublish(page.id);
  };

  const handleDiscard = () => {
    if (!page) return;
    setDiscardConfirmOpen(true);
  };

  const confirmDiscard = async () => {
    if (!page) return;
    await onDiscardDraft(page.id);
    setDiscardConfirmOpen(false);
  };

  const handleRollback = (versionNumber: number) => {
    if (!page) return;
    setRollbackTarget(versionNumber);
  };

  const confirmRollback = async () => {
    if (!page || rollbackTarget === null || !onRollback) return;
    setIsRollingBack(true);
    try {
      await onRollback(page.id, rollbackTarget);
      // The restore is itself a versioned change — refetch so the new entry
      // (and the moved "current" marker) appear.
      await versions.fetchVersions(page.id);
    } finally {
      setIsRollingBack(false);
      setRollbackTarget(null);
    }
  };

  // ── Agent-context surface scope (`matrx-user/cms-page`) ──────────────
  // ONE builder, shared with the context menu's data path — see
  // `features/cms/hooks/useCmsPageSurfaceScope.ts`.
  const buildSurfaceScope = useCmsPageSurfaceScope({
    site,
    pages,
    components,
    page,
    activeTab: effectiveTab,
    title,
    slug,
    category,
    pageType,
    htmlContent,
    cssContent,
    jsContent,
    metaTitle,
    metaDescription,
    metaKeywords,
    ogImage,
    canonicalUrl,
    excerpt,
    showInNav,
    sortOrder,
    tags,
    editorError: error,
    versions: versions.versions,
    textareaRef,
    researchLineage: researchLineage.entries,
    researchLineageStatus: researchLineage.adapter.status,
    researchLineageError: researchLineage.adapter.error,
    planContext,
  });

  // ── Write half of the surface (manifest `writeTargets`) ──────────────
  // Every target stages into the SAME `useState` setters the user's own
  // typing drives — never a parallel write path, and never a direct save:
  // the human still clicks Save Draft / Save & Publish. Handlers validate and
  // THROW on a bad shape; the seam turns that into a safe error envelope.
  // Fresh closures per call (the `getWriteHandlers` contract).
  const getSurfaceWriteHandlers = () => ({
    page_title: (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("page_title expects a non-empty string.");
      // Same entry point as the header input, so a new page's slug is
      // re-derived exactly as it is when a human types the title.
      handleTitleChange(value.trim());
    },
    page_html_content: (value: unknown) => {
      const obj = asWriteObject(value, "page_html_content");
      const html = obj.html;
      if (typeof html !== "string")
        throw new Error("page_html_content: html must be a string.");
      const mode = obj.mode ?? "replace";
      if (mode !== "replace" && mode !== "append")
        throw new Error(
          "page_html_content: mode must be 'replace' or 'append'.",
        );
      setHtmlContent((prev) => (mode === "append" ? prev + html : html));
    },
    page_meta_tags: (value: unknown) => {
      const obj = asWriteObject(value, "page_meta_tags");
      const nextTitle = optionalWriteString(
        obj,
        "meta_title",
        "page_meta_tags",
      );
      const nextDescription = optionalWriteString(
        obj,
        "meta_description",
        "page_meta_tags",
      );
      const nextKeywords = optionalWriteString(
        obj,
        "meta_keywords",
        "page_meta_tags",
      );
      if (
        nextTitle === undefined &&
        nextDescription === undefined &&
        nextKeywords === undefined
      )
        throw new Error(
          "page_meta_tags: provide at least one of meta_title, meta_description, meta_keywords.",
        );
      if (nextTitle !== undefined) setMetaTitle(nextTitle);
      if (nextDescription !== undefined) setMetaDescription(nextDescription);
      if (nextKeywords !== undefined) setMetaKeywords(nextKeywords);
    },
    page_excerpt: (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          "page_excerpt expects a string (empty string clears it).",
        );
      setExcerpt(value);
    },
    page_tags: (value: unknown) => {
      if (
        !Array.isArray(value) ||
        !value.every((tag) => typeof tag === "string" && tag.trim())
      )
        throw new Error(
          "page_tags expects an array of non-empty strings ([] clears the tags).",
        );
      // The Settings tab's field IS a comma-separated string — stage the same
      // shape a human would have typed.
      setTags((value as string[]).map((tag) => tag.trim()).join(", "));
    },
  });

  const getApplicationScope = useCallback(() => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      el && start !== end
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData: buildSurfaceScope() as Record<string, unknown>,
    });
  }, [buildSurfaceScope]);

  const liveUrl = page?.is_published
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        domain: activeSiteDomain(site),
      })
    : undefined;
  const previewUrl = page
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        route: page.route,
        category: page.category,
        preview: true,
        previewToken: sitePreviewToken(site),
      })
    : undefined;

  // Most recent restorable version — the highest version_number that isn't the
  // page's current content. Drives the menu's one-click "Restore Previous
  // Version" through the same ConfirmDialog the Versions tab uses.
  const latestRestorableVersion = versions.versions
    .filter((v) => !v.is_current)
    .reduce<number | null>(
      (max, v) =>
        max === null || v.version_number > max ? v.version_number : max,
      null,
    );

  const pageExtraSections = createCmsPageExtraSections({
    isNew,
    hasDraft: page?.has_draft,
    isPublished: page?.is_published,
    liveUrl,
    previewUrl,
    onSaveDraft: handleSaveDraft,
    onPublish: page?.has_draft ? handlePublish : handleSaveLive,
    onDiscardDraft: handleDiscard,
    onOpenLive: () =>
      liveUrl && window.open(liveUrl, "_blank", "noopener,noreferrer"),
    onOpenPreview: () =>
      previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer"),
    onBackToPages: onClose,
    onRollback: onRollback
      ? () => {
          if (latestRestorableVersion !== null)
            setRollbackTarget(latestRestorableVersion);
        }
      : undefined,
    canRollback: !isNew && !!onRollback && latestRestorableVersion !== null,
  });

  // ── Preview HTML generation ──────────────────────────────────────────
  const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metaTitle || title}</title>
    <style>${cssContent}</style>
</head>
<body>
    ${htmlContent}
    ${jsContent ? `<script>${jsContent}</script>` : ""}
</body>
</html>`;

  return (
    // The page editor is the live `matrx-user/cms-page` runtime: it publishes
    // this page's own scope to the header Agents chrome (nested inside — and
    // therefore deeper than — the layout's `matrx-user/cms-site` provider in
    // `app/(core)/cms/[siteId]/SiteLayoutClient.tsx`) and registers the
    // handlers for the surface's declared `writeTargets`. ONE scope builder,
    // shared with the context menus' data path.
    <SurfaceRuntimeProvider
      surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
      getScope={buildSurfaceScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <div className="h-full flex flex-col">
        {/* ── Editor header ────────────────────────────────────────── */}
        <div className="flex-none border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onClose}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Page title…"
                className="min-w-0 w-full max-w-2xl flex-1 border-0 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
              />
              {page && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {page.is_published && (
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0">
                      <Globe className="h-2.5 w-2.5 mr-1" />
                      Published
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
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              {error && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              )}

              {isNew ? (
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={isSaving || !title || !slug}
                  className="gap-1.5 text-xs"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Create Page
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={() => setAiDialogIntent("build-edit")}
                  >
                    <FilePenLine className="h-3.5 w-3.5" />
                    {htmlContent.trim() ? "Edit with AI" : "Build with AI"}
                  </Button>
                  {measuredPageHref && (
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1.5 text-muted-foreground"
                    >
                      <a
                        href={measuredPageHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open page workspace"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">
                          Open page workspace
                        </span>
                      </a>
                    </Button>
                  )}
                  {page?.has_draft && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDiscard}
                      className="text-xs gap-1.5 text-muted-foreground"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Discard
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="gap-1.5 text-xs"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save Draft
                  </Button>
                  <SurfaceRoleAgentButton
                    surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                    roleName="publish_reviewer"
                    label="Review before publish"
                    size="xs"
                    className="hidden lg:inline-flex"
                  />
                  <Button
                    size="sm"
                    onClick={page?.has_draft ? handlePublish : handleSaveLive}
                    disabled={isSaving}
                    className="gap-1.5 text-xs"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {page?.has_draft ? "Publish" : "Save & Publish"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ── Tabs ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-0.5 px-4 overflow-x-auto scrollbar-none">
            {TABS.filter(
              (t) =>
                !isNew ||
                (t.id !== "versions" && t.id !== "plan" && t.id !== "measure"),
            ).map((tab) => {
              const Icon = tab.icon as React.FC<{ className?: string }>;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                                    flex items-center gap-1.5 px-3 py-2 text-xs font-medium
                                    border-b-2 transition-colors whitespace-nowrap
                                    ${
                                      isActive
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                    }
                                `}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.id === "versions" && versions.versions.length > 0 && (
                    <span className="text-[10px] bg-muted px-1 rounded">
                      {versions.versions.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────────────── */}
        {/* The Preview tab is read-only, so it mounts the NonEditable menu (no
          text mutation); every other tab is editable. Same surface identity,
          extraSections, and live contextData either way. */}
        {(() => {
          const tabPanels = (
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* Code — HTML/CSS/JS behind one tab with an inner switcher */}
              {activeTab === "code" && (
                <div className="flex h-full flex-col">
                  {/* Segmented buffer switcher — a pill group, not a second
                      underline row fighting the main tab strip for attention. */}
                  <div className="flex flex-none items-center border-b border-border/50 px-4 py-1.5">
                    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                      {CODE_SUB_TABS.map((sub) => {
                        const SubIcon = sub.icon as React.FC<{
                          className?: string;
                        }>;
                        const isSubActive = codeTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => setCodeTab(sub.id)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                              isSubActive
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <SubIcon className="h-3 w-3" />
                            {sub.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="relative flex-1 min-h-0">
                    {codeTab === "html" && (
                      <ProTextarea
                        ref={textareaRef}
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      enableTextStats
                      placeholder={"<div>\n  <h1>Your page content here…</h1>\n</div>"}
                        className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                        wrapperClassName="absolute inset-0"
                        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                        getApplicationScope={getApplicationScope}
                      />
                    )}
                    {codeTab === "css" && (
                      <ProTextarea
                        ref={textareaRef}
                      value={cssContent}
                      onChange={(e) => setCssContent(e.target.value)}
                      enableTextStats
                      placeholder={"/* Page-specific styles */\n\nh1 {\n  color: #333;\n}"}
                        className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                        wrapperClassName="absolute inset-0"
                        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                        getApplicationScope={getApplicationScope}
                      />
                    )}
                    {codeTab === "js" && (
                      <ProTextarea
                        ref={textareaRef}
                      value={jsContent}
                      onChange={(e) => setJsContent(e.target.value)}
                      enableTextStats
                      placeholder={"// Page-specific JavaScript\n\nconsole.log('Page loaded');"}
                        className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                        wrapperClassName="absolute inset-0"
                        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                        getApplicationScope={getApplicationScope}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Preview */}
              {activeTab === "preview" && (
                <div className="relative h-full bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    title="Page Preview"
                    className="absolute inset-0 w-full h-full border-0"
                    sandbox="allow-scripts"
                  />
                </div>
              )}

              {/* Plan — the page's BEFORE (plan node, brief, keyword, pipeline) */}
              {activeTab === "plan" && page && (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading the plan…</span>
                    </div>
                  }
                >
                  <PagePlanTab
                    page={page}
                    site={site}
                    onPageChanged={async () => {
                      await onRefetchPage?.();
                    }}
                  />
                </Suspense>
              )}

              {/* Measure — the page's AFTER, the measured page it is joined to */}
              {activeTab === "measure" && page && (
                <div className="h-full overflow-hidden">
                  {page.web_page_id ? (
                    <Suspense
                      fallback={
                        <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">
                            Loading the measured page…
                          </span>
                        </div>
                      }
                    >
                      <CmsPageMeasure webPageId={page.web_page_id} />
                    </Suspense>
                  ) : (
                    <div className="flex h-full items-center justify-center p-6">
                      <div className="max-w-md text-center">
                        <Gauge className="mx-auto h-5 w-5 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium text-foreground">
                          This page isn&apos;t joined to a measured page yet
                        </p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Measurement lives on the page as it exists on the web.
                          Publishing this page and letting the site&apos;s crawl
                          reach its URL makes the join, and this tab then shows
                          that page&apos;s analysis, findings, snapshots, and
                          Search Console data.
                        </p>
                        {site.web_site_id ? (
                          <a
                            href={marketingRoutes.site(
                              null,
                              site.web_site_id,
                              "/pages",
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                          >
                            See this site&apos;s measured pages
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SEO */}
              {activeTab === "seo" && (
                <div className="h-full overflow-auto">
                  <div className="p-6 max-w-2xl mx-auto space-y-5">
                    {/* THE PLAN, above the values it plans for. One SEO plan per
                        page, stored on `web.page` and edited by THE canonical
                        editor — the same one the page workspace and the content
                        plan mount. The fields below stay what this page SERVES. */}
                    <PageSeoPlanSection
                      page={page}
                      site={site}
                      onPageChanged={onRefetchPage}
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">
                          Search appearance
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Shape how this page appears in search results.
                        </p>
                      </div>
                      <SurfaceRoleAgentButton
                        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                        roleName="seo_editor"
                        label="Write SEO with AI"
                        size="xs"
                        className="shrink-0"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Meta Title
                        <span className="text-muted-foreground font-normal ml-2 text-xs">
                          ({countSeoCharacters(metaTitle || title)}/
                          {TITLE_LIMITS.maxChars} chars)
                        </span>
                      </label>
                      <ProInput
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        placeholder={title || "SEO title…"}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Meta Description
                        <span className="text-muted-foreground font-normal ml-2 text-xs">
                          ({countSeoCharacters(metaDescription)}/
                          {DESCRIPTION_LIMITS.maxChars} chars)
                        </span>
                      </label>
                      <ProTextarea
                        ref={textareaRef}
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        placeholder="Brief page description for search engines…"
                        rows={3}
                        className="text-sm"
                        surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                        getApplicationScope={getApplicationScope}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Keywords
                      </label>
                      <ProInput
                        value={metaKeywords}
                        onChange={(e) => setMetaKeywords(e.target.value)}
                        placeholder="keyword1, keyword2, keyword3"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        OG Image URL
                      </label>
                      <Input
                        value={ogImage}
                        onChange={(e) => setOgImage(e.target.value)}
                        placeholder="https://…"
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Canonical URL
                      </label>
                      <Input
                        value={canonicalUrl}
                        onChange={(e) => setCanonicalUrl(e.target.value)}
                        placeholder="https://…"
                        className="text-sm"
                      />
                    </div>

                    {/* Google preview */}
                    <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-1">
                      <p className="text-xs text-muted-foreground font-medium mb-2">
                        Search Preview
                      </p>
                      <p className="text-blue-600 dark:text-blue-400 text-base font-medium leading-tight truncate">
                        {metaTitle || title || "Page Title"}
                      </p>
                      <p className="text-emerald-700 dark:text-emerald-400 text-xs">
                        example.com/{slug || "page-slug"}
                      </p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {metaDescription ||
                          "No description set. Add a meta description to improve SEO."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings */}
              {activeTab === "settings" && (
                <div className="h-full overflow-auto">
                  <div className="p-6 max-w-2xl mx-auto space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">
                          Slug
                        </label>
                        <Input
                          value={slug}
                          onChange={(e) => setSlug(e.target.value)}
                          placeholder="page-slug"
                          className="text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">
                          Category
                        </label>
                        <Input
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          placeholder="general"
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">
                          Page Type
                        </label>
                        <select
                          value={pageType}
                          onChange={(e) => setPageType(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="standard">Standard</option>
                          <option value="home">Home</option>
                          <option value="service">Service</option>
                          <option value="blog">Blog</option>
                          <option value="listing">Listing</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground block mb-1.5">
                          Sort Order
                        </label>
                        <Input
                          type="number"
                          value={sortOrder}
                          onChange={(e) =>
                            setSortOrder(parseInt(e.target.value) || 0)
                          }
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Excerpt
                      </label>
                      <Textarea
                        value={excerpt}
                        onChange={(e) => setExcerpt(e.target.value)}
                        placeholder="Short description for listing pages…"
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground block mb-1.5">
                        Tags
                      </label>
                      <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="tag1, tag2, tag3"
                        className="text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={showInNav}
                          onCheckedChange={(v) => setShowInNav(v === true)}
                          className="shrink-0"
                        />
                        Show in navigation
                      </label>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Site shell
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Render the site&apos;s shared header/footer components
                        on this page. Turn off for landing pages that bring
                        their own chrome.
                      </p>
                      <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={useClientHeader}
                            onCheckedChange={(v) =>
                              setUseClientHeader(v === true)
                            }
                            className="shrink-0"
                          />
                          Use site header
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={useClientFooter}
                            onCheckedChange={(v) =>
                              setUseClientFooter(v === true)
                            }
                            className="shrink-0"
                          />
                          Use site footer
                        </label>
                      </div>
                    </div>
                    {page ? (
                      <ResearchLineagePanel
                        adapter={researchLineage.adapter}
                        entries={researchLineage.entries}
                        canPromoteScratch={researchLineage.canPromoteScratch}
                        promoteScratch={researchLineage.promoteScratch}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                        Create this page to attach research topics and tags.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Versions */}
              {activeTab === "versions" && page && (
                <div className="h-full overflow-auto">
                  <div className="p-6 max-w-2xl mx-auto space-y-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        Version History
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Every change is captured — edits, draft saves,
                        publishes, and rollbacks. Restoring brings back that
                        version&apos;s content as a new version; nothing is
                        erased.
                      </p>
                    </div>
                    {versions.error && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {versions.error}
                      </div>
                    )}
                    {versions.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading versions…</span>
                      </div>
                    ) : versions.versions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No history for this page yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {versions.versions.map((v) => (
                          <div
                            key={v.id}
                            className={`rounded-lg border p-3 flex items-center justify-between transition-colors ${
                              v.is_current
                                ? "border-primary/40 bg-primary/5"
                                : "border-border hover:bg-muted/20"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                v{v.version_number}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                                  {VERSION_OPERATION_LABEL[v.operation]}
                                  {v.is_current && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px]"
                                    >
                                      Current
                                    </Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(v.occurred_at).toLocaleString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    },
                                  )}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs"
                              disabled={!onRollback || v.is_current}
                              title={
                                v.is_current
                                  ? "This is the page's current content"
                                  : onRollback
                                    ? undefined
                                    : "Save the page before restoring"
                              }
                              onClick={() => handleRollback(v.version_number)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restore
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
          // Preview and Plan are read-only regions (no text buffer to mutate),
          // so they mount the NonEditable menu; every other tab is editable.
          return activeTab === "preview" ||
            activeTab === "plan" ||
            activeTab === "measure" ? (
            <NonEditableContextMenu
              {...CMS_PAGE_CONTEXT_MENU_PROPS}
              extraSections={pageExtraSections}
              contextData={buildSurfaceScope() as Record<string, unknown>}
            >
              {tabPanels}
            </NonEditableContextMenu>
          ) : (
            <EditableContextMenu
              {...CMS_PAGE_CONTEXT_MENU_PROPS}
              extraSections={pageExtraSections}
              getTextarea={() => textareaRef.current}
              getApplicationScope={getApplicationScope}
              contextData={buildSurfaceScope() as Record<string, unknown>}
              onTextReplace={(text) => {
                if (effectiveTab === "html") setHtmlContent(text);
                else if (effectiveTab === "css") setCssContent(text);
                else if (effectiveTab === "js") setJsContent(text);
                else if (effectiveTab === "seo") setMetaDescription(text);
              }}
              onSave={isNew ? undefined : () => void handleSaveDraft()}
            >
              {tabPanels}
            </EditableContextMenu>
          );
        })()}

        <ConfirmDialog
          open={discardConfirmOpen}
          onOpenChange={setDiscardConfirmOpen}
          title="Discard draft changes?"
          description="This cannot be undone. The published version is unaffected."
          confirmLabel="Discard Draft"
          variant="destructive"
          busy={isSaving}
          onConfirm={confirmDiscard}
        />

        <ConfirmDialog
          open={rollbackTarget !== null}
          onOpenChange={(open) =>
            !isRollingBack && !open && setRollbackTarget(null)
          }
          title={`Restore version ${rollbackTarget}?`}
          description="This version's content replaces the page's current content. The restore is recorded as a new version, so the current content stays in the history."
          confirmLabel="Restore"
          variant="destructive"
          busy={isRollingBack}
          onConfirm={confirmRollback}
        />
        {page && aiDialogIntent ? (
          <CmsPageAiActionDialog
            open
            onOpenChange={(next) => {
              if (!next) setAiDialogIntent(null);
            }}
            intent={aiDialogIntent}
            site={site}
            pages={pages}
            components={components}
            page={page}
            editorHref={cmsPageEditorHref(siteId, page.id)}
            keywordHref={cmsPageEditorHref(siteId, page.id, "seo")}
            planHref={cmsPageEditorHref(siteId, page.id, "plan")}
            onPageChanged={onRefetchPage}
          />
        ) : null}
      </div>
    </SurfaceRuntimeProvider>
  );
}
