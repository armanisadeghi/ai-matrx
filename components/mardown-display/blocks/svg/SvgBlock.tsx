"use client";

/**
 * SvgBlock — the in-chat render block for ```svg fences.
 *
 * Agents (Claude is remarkable at this) hand-author clean, declarative SVG
 * illustrations. We render them SANDBOXED (no script execution, no parent-origin
 * access — agent/forked/shared SVG is treated as hostile) and RESPONSIVELY: the
 * frame takes the SVG's own aspect ratio (from its viewBox), capped so a tall
 * illustration never runs off the page.
 *
 * Streaming: SVG can't render until the markup is well-formed, so we show a
 * skeleton while the fence is still open and the finished illustration on close.
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Expand, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import SandboxedHtml from "@/components/mardown-display/blocks/common/SandboxedHtml";
import { cn } from "@/lib/utils";

export interface SvgBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

/** Aspect ratio (w/h) + a human title pulled from the SVG itself. */
function readSvgMeta(svg: string): { aspect: number; title: string | null } {
  let aspect = 16 / 9;
  const viewBox = /viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(svg);
  if (viewBox) {
    const w = parseFloat(viewBox[1]);
    const h = parseFloat(viewBox[2]);
    if (w > 0 && h > 0) aspect = w / h;
  } else {
    const w = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(svg);
    const h = /\bheight\s*=\s*["']?([\d.]+)/i.exec(svg);
    if (w && h && +w[1] > 0 && +h[1] > 0) aspect = +w[1] / +h[1];
  }
  const titleEl = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(svg);
  const ariaLabel = /<svg[^>]*\saria-label\s*=\s*["']([^"']+)["']/i.exec(svg);
  const title = (titleEl?.[1] ?? ariaLabel?.[1] ?? "").trim() || null;
  return { aspect, title };
}

/** Wrap the raw SVG in a minimal, transparent, fill-the-frame document. */
function toSrcDoc(svg: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`;
}

export const SvgBlock: React.FC<SvgBlockProps> = ({ content = "", isStreamActive = false, className }) => {
  const svg = content.trim();
  const { aspect, title } = useMemo(() => readSvgMeta(svg), [svg]);
  const srcDoc = useMemo(() => toSrcDoc(svg), [svg]);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the SVG");
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(title ?? "illustration").replace(/[^\w-]+/g, "-").toLowerCase()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download the SVG");
    }
  };

  const hasSvg = /<svg[\s>]/i.test(svg);

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{title ?? "Illustration"}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">SVG</span>
          {isStreamActive && (
            <span className="shrink-0 animate-pulse text-xs text-muted-foreground">drawing…</span>
          )}
        </div>
        {!isStreamActive && hasSvg && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn label={copied ? "Copied" : "Copy SVG source"} onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn label="Download SVG" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="View fullscreen" onClick={() => setFullscreen(true)}>
              <Expand className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}
      </div>

      <div className="p-3">
        {isStreamActive || !hasSvg ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="mx-auto w-full" style={{ aspectRatio: `${aspect}`, maxHeight: "70vh" }}>
            <SandboxedHtml html={srcDoc} title={title ?? "SVG illustration"} height="100%" className="rounded-md" />
          </div>
        )}
      </div>

      {fullscreen && <SvgFullscreen srcDoc={srcDoc} title={title} onClose={() => setFullscreen(false)} />}
    </div>
  );
};

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
    >
      {children}
    </button>
  );
}

function SvgFullscreen({ srcDoc, title, onClose }: { srcDoc: string; title: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-background/98 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Illustration (fullscreen)"}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2 pt-safe">
        <span className="truncate text-sm font-medium text-foreground">{title ?? "Illustration"}</span>
        <button
          type="button"
          aria-label="Exit fullscreen"
          title="Exit fullscreen (Esc)"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <SandboxedHtml html={srcDoc} title={title ?? "SVG illustration"} height="100%" />
      </div>
    </div>,
    document.body,
  );
}

export default SvgBlock;
