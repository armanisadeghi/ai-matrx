"use client";

import { usePageSandbox } from "@/features/html-pages/utils/use-page-sandbox";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Maximize2,
  AlertTriangle,
  Globe,
  MoreHorizontal,
  Printer,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { printPublishedPage } from "@/features/canvas/output/printPage";
import { copyHtmlSource, downloadHtmlSource } from "@/features/html-pages/output/htmlSourceOutput";
import { Button } from "@ai-matrx/design-system/controls";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import {
  onHtmlVersionPublished,
  resolveHtmlCanvasPage,
} from "@/features/html-pages/services/canvasVersionPage";
import {
  analyzeHtmlForPreview,
  extractTitleFromHTML,
} from "@/features/html-pages/utils/html-preview-utils";
import CodeBlock from "@ai-matrx/rich-content/code-block/CodeBlock";
import { HtmlAppFrame } from "@/features/html-pages/components/HtmlAppFrame";
import { HtmlAttachToChat } from "@/features/html-pages/components/HtmlAttachToChat";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useHtmlPreviewChrome } from "@/features/html-pages/components/HtmlPreviewChrome";
import {
  cardFrameUrl,
  htmlPageCanvasContent,
  readPageError,
  readPageHeight,
  type PageRuntimeError,
} from "@/features/html-pages/components/html-page-frame";
import {
  WIDE_FIGURE_ATTRIBUTE,
  WIDE_FIGURE_CLASS,
} from "@ai-matrx/chat/agents/components/shared/assistant-message-layout";

/**
 * HtmlInlinePreview — auto-renders previewable HTML as a live, inline webpage
 * once the block has finished streaming.
 *
 * State machine:
 *  1. Streaming / incomplete / non-previewable → plain code block.
 *  2. Complete + converting                     → loader.
 *  3. Success                                    → live preview (iframe).
 *  4. Error                                      → silent code block + opt-in detail.
 *
 * What auto-previews (see analyzeHtmlForPreview):
 *  - A complete HTML document → card preview: ONE header (the page's <title>,
 *    Code, Copy, Download, Open in canvas) over a frame sized to the page's
 *    own content height (reported by the html site's frame script — see
 *    html-page-frame.ts), capped at PAGE_MAX_HEIGHT with scroll inside beyond.
 *  - A single media embed (one YouTube/Vimeo/etc. iframe, or a lone <video>),
 *    even as a fragment → SEAMLESS preview: snug to the embed's aspect ratio,
 *    no card chrome, so a video just sits in the content.
 * Everything else stays a code block.
 *
 * MOUNT NEVER WRITES (rendered-output standard, ruling 1). A page's truth is its
 * `canvas_items` version chain; each version is published once, when it is
 * saved (materializer / user save / agent `edit_artifact`), to its own page.
 * With `artifactId` this component only READS: the chat card serves its own
 * version, the canvas tab (`fill`) the chain's latest, and a card whose chain has
 * moved on shows a "newer version" marker. Without `artifactId` (a fence not yet
 * materialized, a note) nothing is published until the person asks.
 */

type Phase = "idle" | "converting" | "preview" | "unpublished" | "error";

/** Published pages keep their existing capabilities only once the app origin
 * is known and their absolute HTTP(S) URL is separate. Drafts stay opaque.
 * usePageSandbox starts hydration with the same opaque flags as the server,
 * then restores a separate publisher's flags. Redirect custody is separate.
 */
const PAGE_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation";
/**
 * The canvas runs generated pages as APPS: dialogs (alert/confirm), links and
 * popups that open as normal tabs, downloads and pointer lock (games). Never
 * allow-top-navigation — an app may not navigate the app shell away.
 */
const APP_SANDBOX = `${PAGE_SANDBOX} allow-modals allow-popups-to-escape-sandbox allow-downloads allow-pointer-lock`;
/** Frame height before the page reports its own. */
const PAGE_INITIAL_HEIGHT = 480;
/** Past this the page scrolls inside its frame; the canvas shows it whole. */
const PAGE_MAX_HEIGHT = "min(85dvh, 1200px)";
const PAGE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";

export { pageSandbox } from "@/features/html-pages/utils/page-sandbox";

interface HtmlInlinePreviewProps {
  code: string;
  language?: string;
  /** True once this block has fully streamed in and is finalized. */
  isComplete: boolean;
  className?: string;
  messageId?: string;
  conversationId?: string;
  onCodeChange?: (newCode: string) => void;
  /**
   * The canvas presentation: the page runs edge-to-edge filling its parent
   * (height included) as an app — no card, no fade, no Expand / Open in
   * canvas / Code controls (the canvas tab header owns the source toggle).
   */
  fill?: boolean;
  /** The canvas_items version this block shows (from `<artifact id=…>`). */
  artifactId?: string;
}

const ToolbarButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ icon: Icon, label, onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
      "text-muted-foreground hover:text-foreground hover:bg-accent",
      active && "bg-accent text-foreground",
    )}
  >
    <Icon className="h-3.5 w-3.5" />
    <span>{label}</span>
  </button>
);

const HtmlInlinePreview: React.FC<HtmlInlinePreviewProps> = ({
  code,
  language = "html",
  isComplete,
  className,
  messageId,
  conversationId,
  onCodeChange,
  fill = false,
  artifactId,
}) => {
  const user = useAppSelector(selectUser);
  const { open: openCanvas } = useCanvas();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const appSandbox = usePageSandbox(url, APP_SANDBOX);
  const publishedSandbox = usePageSandbox(url, PAGE_SANDBOX);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showError, setShowError] = useState(false);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const [newerVersion, setNewerVersion] = useState<number | null>(null);
  // The HTML of the version this surface SHOWS (canvas = latest). Copy and
  // Download hand over exactly this, never the message's older text.
  const [shownHtml, setShownHtml] = useState<string | null>(null);
  // The page's own runtime errors (frame script → validated postMessage).
  const [pageErrors, setPageErrors] = useState<PageRuntimeError[]>([]);
  const [showPageErrors, setShowPageErrors] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const chrome = useHtmlPreviewChrome();

  const analysis =
    language === "html"
      ? analyzeHtmlForPreview(code)
      : {
          previewable: false,
          isDocument: false,
          isMediaEmbed: false,
          html: code,
        };

  const userId = user?.id;
  const canShow = isComplete && analysis.previewable && !!userId;
  const publishHtml = analysis.html;

  // READ the published page of this version (card) or the chain's latest
  // (canvas). Re-reads when a version is published; never writes.
  useEffect(() => {
    if (!canShow || !artifactId) return undefined;
    let cancelled = false;
    const read = async () => {
      try {
        const resolved = await resolveHtmlCanvasPage(
          artifactId,
          fill ? "latest" : "self",
        );
        if (cancelled) return;
        const pageUrl = resolved?.shown.url ?? null;
        setNewerVersion(
          !fill && resolved && resolved.latest.version > resolved.shown.version
            ? resolved.latest.version
            : null,
        );
        setShownHtml(resolved?.shown.html ?? null);
        setUrl(pageUrl);
        setPhase(pageUrl ? "preview" : "unpublished");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Could not read this page",
        );
        setPhase("error");
      }
    };
    void read();
    const stop = onHtmlVersionPublished(() => void read());
    return () => {
      cancelled = true;
      stop();
    };
  }, [canShow, artifactId, fill]);

  // No artifact row yet (a fence still to be materialized, or a note): nothing
  // publishes on mount — the person opts in.
  useEffect(() => {
    if (!canShow || artifactId) return;
    setPhase((current) => (current === "preview" ? current : "unpublished"));
  }, [canShow, artifactId]);

  const publishOnRequest = async () => {
    if (!userId) return;
    setShowError(false);
    setErrorMessage(null);
    setPhase("converting");
    try {
      const result = await HTMLPageService.createPage(
        publishHtml,
        extractTitleFromHTML(code) || "HTML Preview",
        "Generated from chat",
        userId,
        {},
        { sourceMessageId: messageId, sourceConversationId: conversationId },
      );
      setUrl(result.url);
      setPhase("preview");
    } catch (err) {
      console.error("[HtmlInlinePreview] publish failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to render HTML preview",
      );
      setPhase("error");
    }
  };

  const title = extractTitleFromHTML(code) || chrome?.title || "Web page";

  // The page reports its own content height (html site frame script); only a
  // message from THIS frame's window and the page's origin is believed.
  useEffect(() => {
    setPageErrors([]);
    if (!url) return undefined;
    const onMessage = (event: MessageEvent) => {
      const height = readPageHeight(event, url, frameRef.current?.contentWindow);
      if (height !== null) setPageHeight(height);
      const pageError = readPageError(event, url, frameRef.current?.contentWindow);
      if (pageError) setPageErrors((prev) => (prev.length >= 5 ? prev : [...prev, pageError]));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [url]);

  // ONE canvas path for every html page (html-page-frame.ts): the holder's
  // opener when a block holds this page, else the same `html` canvas content.
  const handleOpenCanvas = () => {
    if (chrome?.openInCanvas) {
      chrome.openInCanvas();
      return;
    }
    openCanvas(
      htmlPageCanvasContent({ code, title, messageId, canvasItemId: artifactId }),
    );
  };

  const printPage = () => {
    if (url) printPublishedPage({ canvasItemId: artifactId, version: fill ? "latest" : "self", pageUrl: url });
  };

  const header = (
    <div
      className="@container flex min-w-0 items-center gap-1.5 border-b border-border bg-muted/40 py-0.5 pl-3 pr-1"
      data-html-preview-header=""
    >
      <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {title}
      </span>
      {pageErrors.length > 0 ? (
        <Button
          variant="quiet"
          icon={<AlertTriangle />}
          onClick={() => setShowPageErrors((v) => !v)}
          aria-pressed={showPageErrors}
          title={pageErrors[0].message}
          data-html-page-errors={pageErrors.length}
        >
          {pageErrors.length === 1 ? "Page error" : `${pageErrors.length} page errors`}
        </Button>
      ) : null}
      <div className="flex shrink-0 items-center">
        {/* The version controls sit on the row when the card has room, behind "More" on a phone. */}
        <span className="hidden @min-[32rem]:contents" data-html-header-version-actions="">
          {newerVersion !== null ? (
            <Button
              variant="quiet"
              onClick={handleOpenCanvas}
              title={`A newer version (v${newerVersion}) exists — open it`}
              data-html-newer-version={newerVersion}
            >
              {`v${newerVersion} available`}
            </Button>
          ) : null}
          {chrome?.actions}
        </span>
        <HtmlAttachToChat
          conversationId={conversationId}
          canvasItemId={artifactId}
          pageUrl={url}
          title={title}
          frame={() => frameRef.current}
        />
        <Button
          variant="quiet"
          icon={showCode ? <Eye /> : <Code2 />}
          onClick={() => setShowCode((v) => !v)}
          aria-pressed={showCode}
          title={showCode ? "Show page" : "Show code"}
          aria-label={showCode ? "Show page" : "Show code"}
        />
        {/* Copy / Download / Print sit on the row when the card has room, and
            behind "More" when it does not (a phone) — never clipped off the end. */}
        <span className="hidden @min-[32rem]:contents" data-html-header-wide-actions="">
          <Button
            variant="quiet"
            icon={<Copy />}
            onClick={() => void copyHtmlSource(shownHtml ?? code)}
            title="Copy HTML"
            aria-label="Copy HTML"
          />
          <Button
            variant="quiet"
            icon={<Download />}
            onClick={() => downloadHtmlSource(title, shownHtml ?? code)}
            title="Download .html"
            aria-label="Download .html"
          />
          {url ? (
            <Button
              variant="quiet"
              icon={<Printer />}
              onClick={printPage}
              title="Print page"
              aria-label="Print page"
            />
          ) : null}
        </span>
        <span className="contents @min-[32rem]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="quiet"
                icon={<MoreHorizontal />}
                title="More actions"
                aria-label="More actions"
                data-html-header-more=""
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {newerVersion !== null ? (
                <DropdownMenuItem onSelect={handleOpenCanvas}>
                  <Maximize2 /> {`Open v${newerVersion} (newer)`}
                </DropdownMenuItem>
              ) : null}
              {chrome?.menuItems?.map((item) => (
                <DropdownMenuItem key={item.key} onSelect={item.onSelect} disabled={item.disabled}>
                  {item.icon} {item.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => void copyHtmlSource(shownHtml ?? code)}>
                <Copy /> Copy HTML
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => downloadHtmlSource(title, shownHtml ?? code)}>
                <Download /> Download .html
              </DropdownMenuItem>
              {url ? (
                <DropdownMenuItem onSelect={printPage}>
                  <Printer /> Print page
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
        <span className="contents @min-[32rem]:hidden">{chrome?.menuAnchors}</span>
        <Button
          variant="quiet"
          icon={<Maximize2 />}
          onClick={handleOpenCanvas}
          aria-pressed={chrome?.canvasOpen}
          title="Open in canvas"
          aria-label="Open in canvas"
        />
      </div>
    </div>
  );

  const renderCodeBlock = useCallback(
    () => (
      <CodeBlock showSource
        code={code}
        language={language}
        fontSize={16}
        className="my-3"
        onCodeChange={onCodeChange}
        isStreamActive={!isComplete}
      />
    ),
    [code, language, onCodeChange, isComplete],
  );

  const unpublishedNotice = (
    <div className="mt-1 flex items-center gap-2" data-html-unpublished="">
      <span className="text-xs text-muted-foreground">Not shown as a page yet</span>
      <Button variant="quiet" icon={<Globe />} onClick={() => void publishOnRequest()}>
        Show as page
      </Button>
    </div>
  );

  if (fill) {
    if (isComplete && analysis.previewable && user?.id && phase === "preview") {
      return (
        <HtmlAppFrame
          key={appSandbox}
          src={url ?? undefined}
          title={title}
          className={className}
          sandbox={appSandbox}
          allow={PAGE_ALLOW}
        />
      );
    }
    if (
      isComplete &&
      analysis.previewable &&
      user?.id &&
      (phase === "converting" || phase === "idle")
    ) {
      return (
        <div
          role="status"
          className={cn("flex h-full items-center justify-center", className)}
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="sr-only">Rendering webpage</span>
        </div>
      );
    }
    return (
      <div className={cn("h-full overflow-auto px-3", className)}>
        {renderCodeBlock()}
        {phase === "unpublished" ? unpublishedNotice : null}
        {phase === "error" && errorMessage ? (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
            {errorMessage}
            <ErrorAlchemyMenu error={errorMessage} />
          </div>
        ) : null}
      </div>
    );
  }

  // 1. Not ready / not previewable → plain code block (under the holder's
  // header when a block holds this page, so its actions never vanish).
  if (!isComplete || !analysis.previewable || !user?.id) {
    if (chrome && isComplete) {
      return (
        <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
          {header}
          <div className="p-2">{renderCodeBlock()}</div>
        </div>
      );
    }
    return renderCodeBlock();
  }

  // 2a. Not published (no version row yet, or a version saved before publishing
  // existed) → the code, plus the person's own opt-in. Mount never writes.
  if (phase === "unpublished") {
    return (
      <div className={cn("my-3", className)}>
        {renderCodeBlock()}
        {unpublishedNotice}
      </div>
    );
  }

  // 2. Converting → loader.
  if (phase === "converting" || phase === "idle") {
    return (
      <div
        className={cn(
          "my-3 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-6",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            Rendering webpage…
          </span>
          <span className="text-xs text-muted-foreground">
            {analysis.isMediaEmbed
              ? "Preparing media embed"
              : "Converting HTML into a live preview"}
          </span>
        </div>
      </div>
    );
  }

  // 4. Error → code block (silent), with an opt-in reveal of the failure.
  if (phase === "error") {
    return (
      <div className={cn("my-3", className)}>
        {renderCodeBlock()}
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowError((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <AlertTriangle className="h-3 w-3" />
            <span>{showError ? "Hide details" : "Preview unavailable"}</span>
          </button>
          {showError && errorMessage && (
            <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-ink">
              {errorMessage}
              <ErrorAlchemyMenu error={errorMessage} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3a. Success — SEAMLESS media embed (snug to the embed; no card chrome).
  if (analysis.isMediaEmbed) {
    const aspectRatio = analysis.embed?.aspectRatio ?? 16 / 9;
    const maxWidth = analysis.embed?.width
      ? `${analysis.embed.width}px`
      : "100%";

    if (showCode) {
      return (
        <div className={cn("group relative my-3", className)}>
          {renderCodeBlock()}
          <SeamlessToolbar
            showCode
            onToggleCode={() => setShowCode(false)}
            onOpenCanvas={handleOpenCanvas}
          />
        </div>
      );
    }

    return (
      <div
        className={cn("group relative my-3 mx-auto", className)}
        style={{ maxWidth }}
      >
        <iframe key={publishedSandbox}
          src={url ?? undefined}
          title={title}
          className="w-full rounded-lg bg-black"
          style={{ aspectRatio: String(aspectRatio) }}
          sandbox={publishedSandbox}
          allow={PAGE_ALLOW}
          allowFullScreen
          loading="lazy"
        />
        <SeamlessToolbar
          onToggleCode={() => setShowCode(true)}
          onOpenCanvas={handleOpenCanvas}
        />
      </div>
    );
  }

  // 3b. Success — full document → ONE header over a frame sized to the page.
  return (
    <div
      data-html-figure=""
      {...{ [WIDE_FIGURE_ATTRIBUTE]: "" }}
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-card",
        WIDE_FIGURE_CLASS,
        className,
      )}
    >
      {header}
      {showPageErrors && pageErrors.length > 0 ? (
        <ul
          className="border-b border-border bg-destructive/5 px-3 py-1.5 text-xs text-destructive-ink"
          data-html-page-error-list=""
        >
          {pageErrors.map((e, i) => (
            <li key={i} className="truncate" title={e.message}>
              {e.line ? `Line ${e.line}: ` : ""}
              {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      {showCode ? (
        <div className="p-2">{renderCodeBlock()}</div>
      ) : (
        <iframe key={publishedSandbox}
          ref={frameRef}
          src={cardFrameUrl(url)}
          title={title}
          data-native-title=""
          data-html-inline-frame=""
          className="block w-full bg-white"
          style={{
            height: pageHeight ?? PAGE_INITIAL_HEIGHT,
            maxHeight: PAGE_MAX_HEIGHT,
          }}
          sandbox={publishedSandbox}
          allow={PAGE_ALLOW}
          allowFullScreen
          loading="lazy"
        />
      )}
    </div>
  );
};

/** Floating hover toolbar for the seamless (chrome-less) media preview. */
const SeamlessToolbar: React.FC<{
  showCode?: boolean;
  onToggleCode: () => void;
  onOpenCanvas: () => void;
}> = ({ showCode, onToggleCode, onOpenCanvas }) => (
  <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-md bg-background/80 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
    <ToolbarButton
      icon={showCode ? Eye : Code2}
      label={showCode ? "Preview" : "Code"}
      active={showCode}
      onClick={onToggleCode}
    />
    <ToolbarButton icon={Maximize2} label="Canvas" onClick={onOpenCanvas} />
  </div>
);

export default HtmlInlinePreview;
