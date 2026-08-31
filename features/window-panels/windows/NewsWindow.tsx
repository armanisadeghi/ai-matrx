"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NewsFloatingWorkspace } from "@/features/news/components/NewsFloatingWorkspace";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

interface NewsWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Thin shell: floating window chrome is provided by WindowPanel
 * while news logic stays in the news feature.
 */
export default function NewsWindow({ isOpen, onClose }: NewsWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      title="News Hub"
      id="news-window-default"
      minWidth={380}
      minHeight={320}
      width={680}
      height={540}
      onClose={onClose}
      urlSyncKey="news"
      urlSyncId="default"
      overlayId="newsWindow"
    >
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. Content is only wrapped at the pane level — articles
          are external NewsAPI results with no app record/id, and per-article
          actions would need `data-*` anchors added inside
          `NewsFloatingWorkspace` (`features/news/`, out of this shard). The
          same `Article` shape also renders in
          `features/tool-call-visualization/renderers/news-api/` (Inline +
          Overlay) — recurs 2+, no shared builder yet; flagged for whoever
          touches either next. */}
      <NonEditableContextMenu sourceFeature="system" contentSource={{ type: "raw" }}>
        <NewsFloatingWorkspace />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
