"use client";

/**
 * MermaidFullscreen — a full-viewport overlay that shows a diagram large, with
 * the renderer's pan/zoom. Rendered through a portal to document.body so it
 * escapes any chat/canvas overflow clipping. Esc or the close button exits;
 * clicking the empty margin also exits. Reused by the chat block header and any
 * other surface that wants a "view fullscreen" affordance.
 */

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { SimpleTooltip } from "@/components/matrx/Tooltip";

console.log(
  "%c[MERMAID IMPORT TEST] components/mermaid/MermaidFullscreen.tsx",
  "color: #fff; background: #7c3aed; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
);
import { cn } from "@/lib/utils";

import { MermaidRenderer } from "./MermaidRenderer";
import type { MermaidRenderOptions } from "./types";

interface MermaidFullscreenProps {
  source: string;
  options: MermaidRenderOptions;
  title?: string | null;
  onClose: () => void;
}

export function MermaidFullscreen({
  source,
  options,
  title,
  onClose,
}: MermaidFullscreenProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-background/98 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Diagram (fullscreen)"}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2 pt-safe">
        <span className="truncate text-sm font-medium text-foreground">
          {title ?? "Diagram"}
        </span>
        <SimpleTooltip text="Exit fullscreen (Esc)">
          <button
            type="button"
            aria-label="Exit fullscreen"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </SimpleTooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <MermaidRenderer
          source={source}
          options={options}
          fillHeight
          className={cn("h-full w-full")}
        />
      </div>
    </div>,
    document.body,
  );
}
