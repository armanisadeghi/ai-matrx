"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Code2,
  Eye,
  Loader2,
  Maximize2,
  AlertTriangle,
  Globe,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import {
  analyzeHtmlForPreview,
  extractTitleFromHTML,
} from "@/features/html-pages/utils/html-preview-utils";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";

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
 *  - A complete HTML document → card preview (header + iframe), height-bounded.
 *  - A single media embed (one YouTube/Vimeo/etc. iframe, or a lone <video>),
 *    even as a fragment → SEAMLESS preview: snug to the embed's aspect ratio,
 *    no card chrome, so a video just sits in the content.
 * Everything else stays a code block.
 *
 * Dedupe: conversion forwards `messageId` (when present) and the html-pages API
 * also dedupes by identical content, so re-renders/reloads never insert
 * duplicate pages — on any surface. Canonical `<artifact>` rewrite/materialization
 * is owned by the artifact system (see ARTIFACT_VISION_AND_DESIGN.md).
 */

type Phase = "idle" | "converting" | "preview" | "error";

interface HtmlInlinePreviewProps {
  code: string;
  language?: string;
  /** True once this block has fully streamed in and is finalized. */
  isComplete: boolean;
  className?: string;
  messageId?: string;
  conversationId?: string;
  onCodeChange?: (newCode: string) => void;
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
}) => {
  const user = useAppSelector(selectUser);
  const { open: openCanvas } = useCanvas();

  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [showError, setShowError] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  const shouldConvert = isComplete && analysis.previewable && !!user?.id;

  useEffect(() => {
    if (!shouldConvert) return;
    if (convertedForRef.current === code) return;

    convertedForRef.current = code;
    let cancelled = false;
    setShowCode(false);
    setShowError(false);
    setErrorMessage(null);
    setPhase("converting");

    (async () => {
      try {
        const title = extractTitleFromHTML(code) || "HTML Preview";
        const result = await HTMLPageService.createPage(
          analysis.html,
          title,
          "Generated from chat",
          user!.id,
          {},
          { sourceMessageId: messageId, sourceConversationId: conversationId },
        );
        if (cancelled) return;
        setUrl(result.url);
        setPhase("preview");
      } catch (err) {
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
    };
  }, [shouldConvert, code, analysis.html, user, messageId, conversationId]);

  const title = extractTitleFromHTML(code) || "HTML Preview";

  const handleOpenCanvas = useCallback(() => {
    if (!url) return;
    openCanvas({
      type: "iframe",
      data: url,
      metadata: { title, sourceMessageId: messageId },
    });
  }, [url, openCanvas, title, messageId]);

  const renderCodeBlock = useCallback(
    () => (
      <CodeBlock
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

  // 1. Not ready / not previewable → plain code block.
  if (!isComplete || !analysis.previewable || !user?.id) {
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
            <div className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {errorMessage}
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
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
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

  // 3b. Success — full document → card preview (header + bounded iframe).
  //
  // The page is a cross-origin published URL, so we can't measure its real
  // content height to fit it exactly. Instead of an arbitrary hard cut, we cap
  // the inline height (a generous ~full-page default, taller when expanded) and
  // fade the bottom edge so the truncation reads as intentional. The fade hosts
  // the two escape hatches — Expand (more inline height) and Canvas (full view).
  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            icon={showCode ? Eye : Code2}
            label={showCode ? "Preview" : "Code"}
            active={showCode}
            onClick={() => setShowCode((v) => !v)}
          />
          <ToolbarButton
            icon={Maximize2}
            label="Open in canvas"
            onClick={handleOpenCanvas}
          />
        </div>
      </div>
      {showCode ? (
        <div className="p-2">{renderCodeBlock()}</div>
      ) : (
        <div className="relative">
          <iframe
            src={url ?? undefined}
            title={title}
            className="block w-full bg-white"
            // Generous default (~a full page), grows to fill available space
            // when expanded. The canvas gives the true full-height view.
            style={{
              height: expanded ? "min(85vh, 1400px)" : "min(70vh, 720px)",
            }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            loading="lazy"
          />
          {/* Intentional bottom fade + escape-hatch actions. pointer-events
              are disabled on the gradient so the iframe stays interactive,
              and re-enabled on the button row. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center bg-gradient-to-t from-card via-card/80 to-transparent">
            <div className="pointer-events-auto mb-3 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-1.5 py-1 shadow-sm backdrop-blur-sm">
              <ToolbarButton
                icon={expanded ? ChevronUp : ChevronDown}
                label={expanded ? "Collapse" : "Expand"}
                onClick={() => setExpanded((v) => !v)}
              />
              <span className="h-4 w-px bg-border" />
              <ToolbarButton
                icon={Maximize2}
                label="Open in canvas"
                onClick={handleOpenCanvas}
              />
            </div>
          </div>
        </div>
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
