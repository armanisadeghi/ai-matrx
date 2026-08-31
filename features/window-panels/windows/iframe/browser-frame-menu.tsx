"use client";

// browser-frame-menu — the shared right-click section for an embedded
// third-party site (`EmbedSiteFrame`), used by BrowserFrameWindow and
// BrowserWorkbenchWindow.
//
// The iframe hosts a page we do not control and cannot read — there is no
// "content" to act on, only the frame's own URL and title. Copy URL / Open
// in new tab / Reload are the honest ceiling for a cross-origin frame; see
// features/context-menu-v3/SECTIONS.md.

import { Copy, ExternalLink, RotateCw } from "lucide-react";
import { toast } from "@/lib/toast";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";

export interface BrowserFrameMenuContext {
  url: string;
  title: string;
  /** Force the iframe to remount (the caller owns the `key`/nonce). */
  onReload: () => void;
}

export function browserFrameMenuSection(
  ctx: BrowserFrameMenuContext,
): ContextMenuExtraSection {
  return {
    id: "browser-frame",
    label: ctx.title,
    items: [
      {
        kind: "item",
        id: "reload",
        label: "Reload",
        icon: RotateCw,
        onSelect: ctx.onReload,
      },
      {
        kind: "item",
        id: "copy-url",
        label: "Copy URL",
        icon: Copy,
        onSelect: () => {
          navigator.clipboard
            .writeText(ctx.url)
            .then(() => toast.success("URL copied"))
            .catch(() => toast.error("Copy failed"));
        },
      },
      {
        kind: "item",
        id: "open-new-tab",
        label: "Open in new tab",
        icon: ExternalLink,
        onSelect: () => {
          window.open(ctx.url, "_blank", "noopener,noreferrer");
        },
      },
    ],
  };
}
