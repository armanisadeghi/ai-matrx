"use client";

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
} from "lucide-react";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { downloadFile } from "@ai-matrx/kit/download";
import { Button } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import {
  analyzeHtmlForPreview,
  extractTitleFromHTML,
} from "@/features/html-pages/utils/html-preview-utils";
import CodeBlock from "@ai-matrx/rich-content/code-block/CodeBlock";
import { HtmlAppFrame } from "@/features/html-pages/components/HtmlAppFrame";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useHtmlPreviewChrome } from "@/features/html-pages/components/HtmlPreviewChrome";
import {
  htmlPageCanvasContent,
  readPageHeight,
} from "@/features/html-pages/components/html-page-frame";

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
 * Dedupe: conversion forwards `messageId` (when present) and the html-pages API
 * also dedupes by identical content, so re-renders/reloads never insert
 * duplicate pages — on any surface. Canonical `<artifact>` rewrite/materialization
 * is owned by the artifact system (see /Users/armanisadeghi/code/common-docs/systems/publish/artifacts/VISION.md).
 */

type Phase = "idle" | "converting" | "preview" | "error";

/**
 * THE sandbox for a published html page. The page is served from the html
 * site (`NEXT_PUBLIC_HTML_SITE_URL`, mymatrx.com) — a different site from the
 * app — so `allow-same-origin` hands the page ITS OWN origin, never ours, and
 * its scripts cannot read aimatrx.com cookies or storage. The pair
 * allow-scripts + allow-same-origin is only safe while that holds, so
 * `pageSandbox` drops `allow-same-origin` if the page URL ever resolves to the
 * app's own origin (a misconfigured env), leaving an opaque origin.
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

export function pageSandbox(
  url: string | null,
  base: string,
  appOrigin: string | null = typeof window === "undefined"
    ? null
    : window.location.origin,
): string {
  if (!url || !appOrigin) return base;
  let origin: string;
  try {
    origin = new URL(url, appOrigin).origin;
  } catch {
    return base;
  }
  if (origin !== appOrigin) return base;
  return base
    .split(" ")
    .filter((flag) => flag !== "allow-same-origin")
    .join(" ");
}

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
}) => {
  const user = useAppSelector(selectUser);
  const { open: openCanvas } = useCanvas();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showError, setShowError] = useState(false);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const chrome = useHtmlPreviewChrome();
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });

  // Tracks the exact code we last converted so re-renders don't re-publish, but
  // genuinely edited / re-streamed content does.
  const convertedForRef = useRef<string | null>(null);

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
  const shouldConvert = isComplete && analysis.previewable && !!userId;
  const publishHtml = analysis.html;

  useEffect(() => {
    if (!shouldConvert || !userId) return undefined;
    if (convertedForRef.current === code) return undefined;

    convertedForRef.current = code;
    let cancelled = false;
    let settled = false;
    setShowCode(false);
    setShowError(false);
    setErrorMessage(null);
    setPhase("converting");

    (async () => {
      try {
        const title = extractTitleFromHTML(code) || "HTML Preview";
        const result = await HTMLPageService.createPage(
          publishHtml,
          title,
          "Generated from chat",
          userId,
          {},
          { sourceMessageId: messageId, sourceConversationId: conversationId },
        );
        settled = true;
        if (cancelled) return;
        setUrl(result.url);
        setPhase("preview");
      } catch (err) {
        settled = true;
        if (cancelled) return;
        console.error("[HtmlInlinePreview] conversion failed:", err);
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to render HTML preview",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      // A run cancelled by a dependency change BEFORE its answer arrived must be
      // allowed to start again: leaving the ref set made the next pass skip it,
      // and the pane spun on "Rendering webpage" forever with its result discarded.
      if (!settled) convertedForRef.current = null;
    };
  }, [shouldConvert, code, publishHtml, userId, messageId, conversationId]);

  const title = extractTitleFromHTML(code) || chrome?.title || "Web page";

  // The page reports its own content height (html site frame script); only a
  // message from THIS frame's window and the page's origin is believed.
  useEffect(() => {
    if (!url) return undefined;
    const onMessage = (event: MessageEvent) => {
      const height = readPageHeight(event, url, frameRef.current?.contentWindow);
      if (height !== null) setPageHeight(height);
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
    openCanvas(htmlPageCanvasContent({ code, title, messageId }));
  };

  const fileName = `${title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "page"}.html`;

  const header = (
    <div
      className="flex min-w-0 items-center gap-1.5 border-b border-border bg-muted/40 py-0.5 pl-3 pr-1"
      data-html-preview-header=""
    >
      <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {title}
      </span>
      <div className="flex shrink-0 items-center">
        {chrome?.actions}
        <Button
          variant="quiet"
          icon={showCode ? <Eye /> : <Code2 />}
          onClick={() => setShowCode((v) => !v)}
          aria-pressed={showCode}
          title={showCode ? "Show page" : "Show code"}
          aria-label={showCode ? "Show page" : "Show code"}
        />
        <Button
          variant="quiet"
          icon={<Copy />}
          onClick={() => void copyText(code, "Copied HTML")}
          title="Copy HTML"
          aria-label="Copy HTML"
        />
        <Button
          variant="quiet"
          icon={<Download />}
          onClick={() => downloadFile(fileName, code, "text/html")}
          title="Download .html"
          aria-label="Download .html"
        />
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

  if (fill) {
    if (isComplete && analysis.previewable && user?.id && phase === "preview") {
      return (
        <HtmlAppFrame
          src={url ?? undefined}
          title={title}
          className={className}
          sandbox={pageSandbox(url, APP_SANDBOX)}
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
        <iframe
          src={url ?? undefined}
          title={title}
          className="w-full rounded-lg bg-black"
          style={{ aspectRatio: String(aspectRatio) }}
          sandbox={pageSandbox(url, PAGE_SANDBOX)}
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
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {header}
      {showCode ? (
        <div className="p-2">{renderCodeBlock()}</div>
      ) : (
        <iframe
          ref={frameRef}
          src={url ?? undefined}
          title={title}
          data-native-title=""
          data-html-inline-frame=""
          className="block w-full bg-white"
          style={{
            height: pageHeight ?? PAGE_INITIAL_HEIGHT,
            maxHeight: PAGE_MAX_HEIGHT,
          }}
          sandbox={pageSandbox(url, PAGE_SANDBOX)}
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
