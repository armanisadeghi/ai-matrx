"use client";

/**
 * The keyword-classification workbench as a floating window — so a ruling is
 * never more than one click away from wherever the question arose (Insights,
 * Dig Here, the keywords page, a drill-down panel). Single instance; opening
 * for a different site retargets the existing panel. Ephemeral: the
 * workbench's state is server-backed (filters are cheap to re-pick), so
 * nothing here persists. Table state stays LOCAL (`urlState={false}`) — the
 * page underneath owns the URL.
 */

import { useMemo } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { KeywordClassificationWorkspace } from "@/features/marketing/search-console/components/classification/KeywordClassificationWorkspace";

/** Viewport-clamped initial rect — the workbench wants to be big, but an
 *  off-screen rect is a silent render failure (window-panels watchdog). */
function initialRect() {
  const width = Math.min(1100, Math.max(640, window.innerWidth - 64));
  const height = Math.min(720, Math.max(420, window.innerHeight - 48));
  return {
    x: Math.max(16, (window.innerWidth - width) / 2),
    y: Math.max(12, (window.innerHeight - height) / 2),
    width,
    height,
  };
}

export interface KeywordClassificationWindowProps {
  onClose: () => void;
  siteId: string;
  siteDomain: string;
  organizationId?: string | null;
}

export default function KeywordClassificationWindow({
  onClose,
  siteId,
  siteDomain,
  organizationId,
}: KeywordClassificationWindowProps) {
  const rect = useMemo(initialRect, []);
  return (
    <WindowPanel
      id="keyword-classification-window"
      title={`Keyword classification — ${siteDomain}`}
      onClose={onClose}
      overlayId="keywordClassificationWindow"
      initialRect={rect}
      minWidth={640}
      minHeight={420}
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-2">
        <KeywordClassificationWorkspace
          key={siteId}
          siteId={siteId}
          siteDomain={siteDomain}
          organizationId={organizationId ?? null}
          urlState={false}
        />
      </div>
    </WindowPanel>
  );
}
