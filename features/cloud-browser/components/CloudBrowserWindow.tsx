"use client";

/**
 * CloudBrowserWindow — the standalone/overlay Cloud Browser surface.
 *
 * This is now a THIN frame: a `WindowPanel` around the chrome-free
 * `CloudBrowserBody`. The body is the single source of the Cloud Browser UI;
 * the canvas pane renders that same body bare (its own frame is the chrome).
 * Kept so the existing overlay opener (`useOpenCloudBrowserWindow`) keeps
 * working — the canvas is the PRIMARY host per the 2026-08 steering.
 */

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { CloudBrowserBody } from "./CloudBrowserBody";

export interface CloudBrowserWindowProps {
  onClose: () => void;
  overlayId?: OverlayId;
  initialProfileId?: string;
  /** The chat this browser belongs to, when the opener knows one. Without it a
   *  takeover has nothing to steer and transfers immediately. */
  conversationId?: string;
}

export function CloudBrowserWindow({
  onClose,
  initialProfileId,
  conversationId,
}: CloudBrowserWindowProps) {
  // The body owns ALL Cloud Browser state (one `useCloudBrowser` per surface —
  // never a second instance for the title, which would open a second session).
  // The active profile is named by the body's ProfileSelector.
  return (
    <WindowPanel
      id="cloud-browser-window"
      title="Cloud Browser"
      onClose={onClose}
      width={860}
      height={640}
      minWidth={420}
      minHeight={360}
    >
      <CloudBrowserBody
        initialProfileId={initialProfileId}
        conversationId={conversationId}
      />
    </WindowPanel>
  );
}

export default CloudBrowserWindow;
