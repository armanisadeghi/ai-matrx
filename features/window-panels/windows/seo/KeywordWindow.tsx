"use client";

import { useCallback, useRef } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { KeywordIntelPanel } from "@/features/marketing/seo/keyword/KeywordIntelPanel";
import {
  isKeywordIntelTab,
  type KeywordIntelTab,
} from "@/features/marketing/seo/keyword/types";

/**
 * KeywordWindow — the canonical Keyword Intelligence window: everything the
 * platform knows about one keyword (market metrics, classification,
 * relationships, site performance, rank tracking, the stored Google SERP,
 * live research) in one floating tabbed panel.
 *
 * Open from anywhere with `useOpenKeywordWindow({ phrase, siteId, pageId,
 * brandId, tab })` (features/overlays/openers/keywordWindow.tsx). Site-scoped
 * tabs light up when a site binding is supplied. The window contributes zero
 * business logic — the body is `KeywordIntelPanel`
 * (features/marketing/seo/keyword/).
 */
export interface KeywordWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhrase?: string;
  initialSiteId?: string;
  initialPageId?: string;
  initialBrandId?: string;
  initialTab?: string;
}

export default function KeywordWindow(props: KeywordWindowProps) {
  if (!props.isOpen) return null;
  return <KeywordWindowInner {...props} />;
}

function KeywordWindowInner({
  onClose,
  initialPhrase,
  initialSiteId,
  initialPageId,
  initialBrandId,
  initialTab,
}: Omit<KeywordWindowProps, "isOpen">) {
  // Live state mirror for persistence — a ref (not state) so the window shell
  // doesn't re-render on every keystroke/tab switch inside the panel.
  const stateRef = useRef<{ phrase: string; activeTab: KeywordIntelTab }>({
    phrase: initialPhrase ?? "",
    activeTab: isKeywordIntelTab(initialTab) ? initialTab : "overview",
  });

  const handleStateChange = useCallback(
    (state: { phrase: string; activeTab: KeywordIntelTab }) => {
      stateRef.current = state;
    },
    [],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      phrase: stateRef.current.phrase,
      activeTab: stateRef.current.activeTab,
      siteId: initialSiteId ?? "",
      pageId: initialPageId ?? "",
      brandId: initialBrandId ?? "",
    }),
    [initialSiteId, initialPageId, initialBrandId],
  );

  return (
    <WindowPanel
      id="keyword-window"
      overlayId="keywordWindow"
      title="Keyword Intelligence"
      onClose={onClose}
      width={860}
      height={720}
      minWidth={480}
      minHeight={420}
      position="center"
      urlSyncKey="keyword"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col"
    >
      <KeywordIntelPanel
        initialPhrase={initialPhrase ?? ""}
        scope={{
          siteId: initialSiteId || undefined,
          pageId: initialPageId || undefined,
          brandId: initialBrandId || undefined,
        }}
        initialTab={
          isKeywordIntelTab(initialTab) ? initialTab : "overview"
        }
        onStateChange={handleStateChange}
      />
    </WindowPanel>
  );
}
