"use client";

// Heavy implementation for the shared SitePeekWindow front door. Consumers
// import SitePeekWindow.tsx, which owns the one lazy-overlay boundary.
//
// 🚨 THIN PANEL HOST — the chrome, and nothing else. The Quick view's content
// is `SitePeekBody`, the one copy, which `SiteQuickViewWindow` mounts inside
// ITS own overlay-bound panel for an id-only caller. This host exists for the
// callers that already hold the row (the Sites portfolio and the Content Plan
// list), so the panel is theirs and closes inline.

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import SitePeekBody from "./SitePeekBody";
import type { SitePeekWindowProps } from "./SitePeekWindow";

export default function SitePeekWindowImpl({
  site,
  onClose,
}: SitePeekWindowProps) {
  return (
    <WindowPanel
      id={`site-peek-${site.id}`}
      onClose={onClose}
      title={site.name}
      width={460}
      height={620}
      minWidth={380}
      minHeight={400}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <SitePeekBody site={site} />
    </WindowPanel>
  );
}
