"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HtmlPageRecord } from "@/features/html-pages/types";
import { useIsMobile } from "@/hooks/use-mobile";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
  CopyTapButton,
  ExternalLinkTapButton,
  LoadingTapButton,
  SaveTapButton,
  UploadTapButton,
} from "@/components/icons/tap-buttons";
import { PromoteToSiteDialog } from "@/features/html-pages/components/PromoteToSiteDialog";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Code2,
  Search as SearchIcon,
  Eye,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  getAdjacentHtmlPageIds,
  getHtmlPagesNavOrder,
  setHtmlPagesNavOrder,
} from "@/features/html-pages/utils/nav-order";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { useHtmlPagesManager } from "@/features/html-pages/hooks/useHtmlPagesManager";
import { useHtmlPageSurfaceScope } from "@/features/html-pages/hooks/useHtmlPageSurfaceScope";
import { HTML_PAGE_CONTEXT_MENU_PROPS } from "@/features/html-pages/agent-context/htmlPageContextMenuProps";
import { createHtmlPageExtraSections } from "@/features/html-pages/agent-context/htmlPageExtraSections";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import SmallCodeEditor from "@/features/code-editor/components/code-block/SmallCodeEditor";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { useMeasure } from "@uidotdev/usehooks";

type EditorTab = "meta" | "html" | "preview";

const TABS: { id: EditorTab; label: string; icon: LucideIcon }[] = [
  { id: "meta", label: "Metadata", icon: SearchIcon },
  { id: "html", label: "HTML", icon: Code2 },
  { id: "preview", label: "Preview", icon: Eye },
];

interface HtmlPageEditorProps {
  page: HtmlPageRecord;
  isSaving: boolean;
  error: string | null;
  onSave: (updates: {
    htmlContent?: string;
    metaTitle?: string;
    metaDescription?: string;
    metaFields?: {
      metaKeywords?: string;
      ogImage?: string;
      canonicalUrl?: string;
      isIndexable?: boolean;
    };
  }) => Promise<void>;
  backHref?: string;
  initialTab?: EditorTab;
  /** List query string to preserve across prev/next. */
  listReturnQuery?: string;
}

function editorPageHref(
  pageId: string,
  opts: { tab?: EditorTab; ret?: string },
): string {
  const params = new URLSearchParams();
  if (opts.tab) params.set("tab", opts.tab);
  if (opts.ret) params.set("ret", opts.ret);
  const qs = params.toString();
  return qs ? `/cms/html-pages/${pageId}?${qs}` : `/cms/html-pages/${pageId}`;
}

export default function HtmlPageEditor({
  page,
  isSaving,
  error,
  onSave,
  backHref = "/cms/html-pages",
  initialTab,
  listReturnQuery,
}: HtmlPageEditorProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const themeMode = useThemeMode();
  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab ?? "meta");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [isIndexable, setIsIndexable] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [nav, setNav] = useState(() =>
    getAdjacentHtmlPageIds(page.id, getHtmlPagesNavOrder()),
  );
  const [htmlEditorRef, { height: htmlEditorHeight }] =
    useMeasure<HTMLDivElement>();
  const metaDescriptionRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Agent-context surface scope (`matrx-user/html-page`) ─────────────
  // Sibling list for the `html_pages_structure` framing value — cheap,
  // list-level fetch, independent of the currently-loaded page's own data.
  const { pages: siblingPages } = useHtmlPagesManager();
  const buildSurfaceScope = useHtmlPageSurfaceScope({
    page,
    siblingPages,
    activeTab,
    htmlContent,
    metaTitle,
    metaDescription,
    metaKeywords,
    ogImage,
    canonicalUrl,
    isIndexable,
    isDirty: dirty,
    prevPageId: nav.prevId,
    nextPageId: nav.nextId,
    textareaRef: metaDescriptionRef,
  });

  const getApplicationScope =
    (ref: React.RefObject<HTMLTextAreaElement | null>) => () => {
      const el = ref.current;
      const start = el?.selectionStart ?? 0;
      const end = el?.selectionEnd ?? 0;
      const selectedText =
        el && start !== end
          ? el.value.slice(Math.min(start, end), Math.max(start, end))
          : "";
      return buildApplicationScopeFromMenuContext({
        selectedText,
        selectionRange: el
          ? { type: "editable", element: el, start, end }
          : null,
        contextData: buildSurfaceScope() as Record<string, unknown>,
      });
    };
  const getMetaApplicationScope = getApplicationScope(metaDescriptionRef);
  const noTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const getHtmlApplicationScope = getApplicationScope(noTextareaRef);

  const pageExtraSections = createHtmlPageExtraSections({
    dirty,
    liveUrl: page.url,
    onSave: () => void handleSave(),
    onCopyUrl: () => void handleCopyUrl(),
    onOpenLive: () => window.open(page.url, "_blank", "noopener,noreferrer"),
    onBackToList: () => requestBack(),
  });

  useEffect(() => {
    setMetaTitle(page.meta_title ?? "");
    setMetaDescription(page.meta_description ?? "");
    setMetaKeywords(page.meta_keywords ?? "");
    setOgImage(page.og_image ?? "");
    setCanonicalUrl(page.canonical_url ?? "");
    setIsIndexable(Boolean(page.is_indexable));
    setHtmlContent(page.html_content ?? "");
    setDirty(false);
    if (initialTab) setActiveTab(initialTab);

    const order = getHtmlPagesNavOrder();
    // Direct deep-link: seed order from the full user list so prev/next work.
    if (order.length === 0 || !order.includes(page.id)) {
      void HTMLPageService.getUserPages().then((list: { id: string }[]) => {
        const ids = (list ?? []).map((p) => p.id);
        if (ids.length > 0) {
          setHtmlPagesNavOrder(ids);
          setNav(getAdjacentHtmlPageIds(page.id, ids));
        }
      });
    } else {
      setNav(getAdjacentHtmlPageIds(page.id, order));
    }
  }, [page, initialTab]);

  const siblingHref = (pageId: string) =>
    editorPageHref(pageId, {
      tab: activeTab,
      ret: listReturnQuery,
    });

  const navigateTo = (href: string) => {
    if (dirty) {
      setPendingNavHref(href);
      setLeaveConfirmOpen(true);
      return;
    }
    router.push(href);
  };

  // Arrow-key prev/next when focus isn't in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowLeft" && nav.prevId) {
        e.preventDefault();
        navigateTo(siblingHref(nav.prevId));
      } else if (e.key === "ArrowRight" && nav.nextId) {
        e.preventDefault();
        navigateTo(siblingHref(nav.nextId));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav.prevId, nav.nextId, dirty, activeTab, listReturnQuery]);

  const markDirty = () => setDirty(true);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(page.url);
      toast.success("URL copied");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const handleSave = async () => {
    if (!metaTitle.trim()) {
      toast.error("Title is required");
      if (!isMobile) setActiveTab("meta");
      return;
    }
    try {
      await onSave({
        htmlContent,
        metaTitle: metaTitle.trim(),
        metaDescription,
        metaFields: {
          metaKeywords,
          ogImage,
          canonicalUrl,
          isIndexable,
        },
      });
      setDirty(false);
      toast.success("Page saved");
    } catch {
      toast.error("Failed to save page");
    }
  };

  const requestBack = () => navigateTo(backHref);

  const metaForm = (
    <EditableContextMenu
      {...HTML_PAGE_CONTEXT_MENU_PROPS}
      extraSections={pageExtraSections}
      getTextarea={() => metaDescriptionRef.current}
      getApplicationScope={getMetaApplicationScope}
      contextData={buildSurfaceScope() as Record<string, unknown>}
      onTextReplace={(text) => {
        setMetaDescription(text);
        markDirty();
      }}
      onSave={() => void handleSave()}
    >
      <div className="space-y-4 max-w-2xl">
        <div>
          <label className="text-sm font-medium block mb-1.5">
            Title <span className="text-destructive">*</span>
          </label>
          <Input
            value={metaTitle}
            onChange={(e) => {
              setMetaTitle(e.target.value);
              markDirty();
            }}
            placeholder="Page title"
            className="text-base"
            style={{ fontSize: "16px" }}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Used as the HTML &lt;title&gt; and primary SEO title (50–60 chars
            recommended).
          </p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">
            Description
          </label>
          <ProTextarea
            ref={metaDescriptionRef}
            value={metaDescription}
            onChange={(e) => {
              setMetaDescription(e.target.value);
              markDirty();
            }}
            placeholder="Meta description for search results"
            rows={3}
            className="text-base"
            style={{ fontSize: "16px" }}
            surfaceName={HTML_PAGE_CONTEXT_MENU_PROPS.surfaceName}
            getApplicationScope={getMetaApplicationScope}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {metaDescription.length}/160 characters
          </p>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Keywords</label>
          <Input
            value={metaKeywords}
            onChange={(e) => {
              setMetaKeywords(e.target.value);
              markDirty();
            }}
            placeholder="comma, separated, keywords"
            className="text-base"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">
            Open Graph image URL
          </label>
          <Input
            value={ogImage}
            onChange={(e) => {
              setOgImage(e.target.value);
              markDirty();
            }}
            placeholder="https://…"
            className="text-base font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">
            Canonical URL
          </label>
          <Input
            value={canonicalUrl}
            onChange={(e) => {
              setCanonicalUrl(e.target.value);
              markDirty();
            }}
            placeholder="https://…"
            className="text-base font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={isIndexable}
            onCheckedChange={(v) => {
              setIsIndexable(v === true);
              markDirty();
            }}
          />
          Allow search engines to index this page
        </label>
        <p className="text-[11px] text-muted-foreground -mt-2 ml-6">
          Off by default (noindex) to avoid duplicate-content issues.
        </p>

        {(page.source_message_id || page.artifact_id) && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-[11px] text-muted-foreground font-mono">
            {page.source_message_id && (
              <div>source_message_id: {page.source_message_id}</div>
            )}
            {page.source_conv_id && (
              <div>source_conv_id: {page.source_conv_id}</div>
            )}
            {page.artifact_id && <div>artifact_id: {page.artifact_id}</div>}
          </div>
        )}
      </div>
    </EditableContextMenu>
  );

  const htmlEditor = (
    <EditableContextMenu
      {...HTML_PAGE_CONTEXT_MENU_PROPS}
      extraSections={pageExtraSections}
      getApplicationScope={getHtmlApplicationScope}
      contextData={buildSurfaceScope() as Record<string, unknown>}
      onTextReplace={(text) => {
        setHtmlContent(text);
        markDirty();
      }}
      onSave={() => void handleSave()}
    >
      <div
        ref={htmlEditorRef}
        className="h-full w-full min-h-0 overflow-hidden"
      >
        <SmallCodeEditor
          key={page.id}
          language="html"
          path={`html-page://${page.id}.html`}
          initialCode={htmlContent}
          onChange={(value) => {
            setHtmlContent(value ?? "");
            markDirty();
          }}
          mode={themeMode}
          height={htmlEditorHeight ? `${htmlEditorHeight}px` : "100%"}
          defaultWordWrap="on"
          showResetButton={false}
        />
      </div>
    </EditableContextMenu>
  );

  // Full-bleed preview: the page is the only job on this tab, so give it the
  // entire remaining viewport — no side padding, no card chrome, no height cap.
  // Prefer live URL when clean so assets/relative paths match production;
  // fall back to srcDoc while editing so unsaved HTML is still visible.
  const previewPane = (
    <NonEditableContextMenu
      {...HTML_PAGE_CONTEXT_MENU_PROPS}
      extraSections={pageExtraSections}
      contextData={buildSurfaceScope() as Record<string, unknown>}
    >
      <iframe
        key={dirty ? `draft-${page.id}` : `live-${page.id}-${page.updated_at}`}
        title="Page preview"
        {...(dirty || !page.url
          ? { srcDoc: htmlContent }
          : {
              src: `${page.url}${page.url.includes("?") ? "&" : "?"}preview=1`,
            })}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        className="block w-full h-full border-0 bg-white dark:bg-zinc-950"
      />
    </NonEditableContextMenu>
  );

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0 space-x-0 space-y-0">
          <ChevronLeftTapButton
            variant="transparent"
            ariaLabel="Back to published pages"
            onClick={requestBack}
          />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate shrink min-w-0">
            {metaTitle || "Untitled page"}
          </h1>
          <span
            className="ml-2 hidden md:inline text-xs text-muted-foreground font-mono truncate min-w-0 max-w-[28rem]"
            title={page.url}
          >
            {page.url}
          </span>
          <div className="ml-auto shrink-0 flex items-center">
            {nav.total > 1 && (
              <>
                <ChevronLeftTapButton
                  variant="transparent"
                  ariaLabel="Previous page"
                  disabled={!nav.prevId}
                  onClick={() => {
                    if (nav.prevId) {
                      navigateTo(siblingHref(nav.prevId));
                    }
                  }}
                />
                <span className="text-[11px] text-muted-foreground tabular-nums px-0.5">
                  {nav.index >= 0 ? nav.index + 1 : "—"}/{nav.total}
                </span>
                <ChevronRightTapButton
                  variant="transparent"
                  ariaLabel="Next page"
                  disabled={!nav.nextId}
                  onClick={() => {
                    if (nav.nextId) {
                      navigateTo(siblingHref(nav.nextId));
                    }
                  }}
                />
              </>
            )}
            <CopyTapButton
              variant="transparent"
              ariaLabel="Copy live URL"
              onClick={() => void handleCopyUrl()}
            />
            <ExternalLinkTapButton
              variant="transparent"
              ariaLabel="View live"
              href={page.url}
              target="_blank"
            />
            <UploadTapButton
              variant="transparent"
              ariaLabel="Promote to site"
              onClick={() => setPromoteOpen(true)}
            />
            {isSaving ? (
              <LoadingTapButton ariaLabel="Saving" disabled />
            ) : (
              <SaveTapButton
                variant="transparent"
                ariaLabel="Save"
                disabled={!dirty}
                onClick={() => void handleSave()}
              />
            )}
          </div>
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden pt-12 flex flex-col">
        {error && (
          <div className="shrink-0 px-4 sm:px-6 py-2 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {!isMobile && (
          <div className="shrink-0 flex items-center gap-1 px-3 py-1 border-b border-border/60">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {isMobile ? (
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="space-y-6">
              <section className="space-y-3 px-4 pt-3">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <SearchIcon className="h-3.5 w-3.5" />
                  Metadata
                </h2>
                {metaForm}
              </section>
              <div className="border-t border-border" />
              <section className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5 px-4">
                  <Code2 className="h-3.5 w-3.5" />
                  HTML
                </h2>
                <div className="h-[60dvh] overflow-hidden">{htmlEditor}</div>
              </section>
              <div className="border-t border-border" />
              <section className="space-y-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5 px-4">
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </h2>
                <div className="h-[70dvh] overflow-hidden">{previewPane}</div>
              </section>
            </div>
          </div>
        ) : activeTab === "preview" ? (
          <div className="flex-1 min-h-0 w-full overflow-hidden">
            {previewPane}
          </div>
        ) : activeTab === "html" ? (
          <div className="flex-1 min-h-0 w-full overflow-hidden">
            {htmlEditor}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-4">
            {metaForm}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={(open) => {
          setLeaveConfirmOpen(open);
          if (!open) setPendingNavHref(null);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved edits. Leave without saving?"
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => {
          const href = pendingNavHref ?? backHref;
          setLeaveConfirmOpen(false);
          setPendingNavHref(null);
          router.push(href);
        }}
      />
      <PromoteToSiteDialog
        htmlPage={promoteOpen ? { id: page.id, meta_title: metaTitle || page.meta_title } : null}
        onOpenChange={(open) => setPromoteOpen(open)}
      />
    </>
  );
}
