"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type {
  ClientComponent,
  ClientPage,
  ClientPageSummary,
  ClientSite,
  VersionOperation,
} from "@/features/cms/types";
import { useCmsVersions } from "@/features/cms/hooks/useCmsVersions";
import { useCmsPageSurfaceScope } from "@/features/cms/hooks/useCmsPageSurfaceScope";
import { CMS_PAGE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsPageContextMenuProps";
import { createCmsPageExtraSections } from "@/features/cms/agent-context/cmsPageExtraSections";
import { clientPageUrl } from "@/features/cms/utils/pageUrls";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ProTextarea } from "@/components/official/ProTextarea";
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
} from "lucide-react";

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
}

/** How a `history.row_versions` operation reads to a human. */
const VERSION_OPERATION_LABEL: Record<VersionOperation, string> = {
  INSERT: "Page created",
  UPDATE: "Content changed",
  DELETE: "Page deleted",
};

type EditorTab =
  "html" | "css" | "js" | "preview" | "seo" | "settings" | "versions";

const TABS: { id: EditorTab; label: string; icon: React.ElementType }[] = [
  { id: "html", label: "HTML", icon: Code2 },
  { id: "css", label: "CSS", icon: Paintbrush },
  { id: "js", label: "JS", icon: FileCode2 },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "seo", label: "SEO", icon: SearchIcon },
  { id: "settings", label: "Settings", icon: Settings2 },
  { id: "versions", label: "History", icon: History },
];

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
}: PageEditorProps) {
  const isNew = !page;
  const [activeTab, setActiveTab] = useState<EditorTab>("html");
  const versions = useCmsVersions();
  // Shared ref: only one of the HTML/CSS/JS ProTextareas is mounted at a
  // time (gated by `activeTab`), so a single ref always points at whichever
  // one is live.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

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
    activeTab,
    title,
    slug,
    category,
    pageType,
    htmlContent,
    cssContent,
    jsContent,
    metaTitle,
    metaDescription,
    textareaRef,
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
        category: page.category,
      })
    : undefined;
  const previewUrl = page
    ? clientPageUrl({
        siteSlug: site.slug,
        slug: page.slug,
        category: page.category,
        preview: true,
      })
    : undefined;

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
    <div className="h-full flex flex-col">
      {/* ── Editor header ────────────────────────────────────────── */}
      <div className="flex-none border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3 min-w-0">
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
              className="text-sm font-semibold bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground min-w-0 flex-1"
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
          {TABS.filter((t) => !isNew || !(t.id === "versions")).map((tab) => {
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
      <EditableContextMenu
        {...CMS_PAGE_CONTEXT_MENU_PROPS}
        extraSections={pageExtraSections}
        getTextarea={() => textareaRef.current}
        getApplicationScope={getApplicationScope}
        contextData={buildSurfaceScope() as Record<string, unknown>}
        onTextReplace={(text) => {
          if (activeTab === "html") setHtmlContent(text);
          else if (activeTab === "css") setCssContent(text);
          else if (activeTab === "js") setJsContent(text);
        }}
        onSave={isNew ? undefined : () => void handleSaveDraft()}
      >
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* HTML */}
          {activeTab === "html" && (
            <div className="relative h-full">
              <ProTextarea
                ref={textareaRef}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="<div>\n  <h1>Your page content here…</h1>\n</div>"
                className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                wrapperClassName="absolute inset-0"
                surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getApplicationScope}
              />
            </div>
          )}

          {/* CSS */}
          {activeTab === "css" && (
            <div className="relative h-full">
              <ProTextarea
                ref={textareaRef}
                value={cssContent}
                onChange={(e) => setCssContent(e.target.value)}
                placeholder="/* Page-specific styles */\n\nh1 {\n  color: #333;\n}"
                className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                wrapperClassName="absolute inset-0"
                surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getApplicationScope}
              />
            </div>
          )}

          {/* JS */}
          {activeTab === "js" && (
            <div className="relative h-full">
              <ProTextarea
                ref={textareaRef}
                value={jsContent}
                onChange={(e) => setJsContent(e.target.value)}
                placeholder="// Page-specific JavaScript\n\nconsole.log('Page loaded');"
                className="absolute inset-0 rounded-none border-0 resize-none font-mono text-sm leading-relaxed focus-visible:ring-0"
                wrapperClassName="absolute inset-0"
                surfaceName={CMS_PAGE_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getApplicationScope}
              />
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

          {/* SEO */}
          {activeTab === "seo" && (
            <div className="h-full overflow-auto">
              <div className="p-6 max-w-2xl mx-auto space-y-5">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Meta Title
                    <span className="text-muted-foreground font-normal ml-2 text-xs">
                      ({(metaTitle || title).length}/60 chars)
                    </span>
                  </label>
                  <Input
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
                      ({metaDescription.length}/160 chars)
                    </span>
                  </label>
                  <Textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder="Brief page description for search engines…"
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    Keywords
                  </label>
                  <Input
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
                    Every change is captured — edits, draft saves, publishes,
                    and rollbacks. Restoring brings back that version&apos;s
                    content as a new version; nothing is erased.
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
      </EditableContextMenu>

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
    </div>
  );
}
