"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * Open from anywhere with `useOpenKeywordWindow({ phrase, organizationId,
 * siteId, pageId, brandId, tab })` (features/overlays/openers/keywordWindow.tsx). Site-scoped
 * tabs light up when a site binding is supplied. The window contributes zero
 * business logic — the body is `KeywordIntelPanel`
 * (features/marketing/seo/keyword/).
 */
export interface KeywordWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhrase?: string;
  initialOrganizationId?: string;
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
  initialOrganizationId,
  initialSiteId,
  initialPageId,
  initialBrandId,
  initialTab,
}: Omit<KeywordWindowProps, "isOpen">) {
  // Debounced state mirror for persistence. State (not a ref) because the
  // WindowPanel save effect keys on the collector's identity — a ref-backed
  // collector never re-stages, so a reload would restore a stale phrase/tab.
  // The debounce keeps the window shell from re-rendering per keystroke.
  const [persistedState, setPersistedState] = useState<{
    phrase: string;
    activeTab: KeywordIntelTab;
  }>({
    phrase: initialPhrase ?? "",
    activeTab: isKeywordIntelTab(initialTab) ? initialTab : "overview",
  });
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStateChange = useCallback(
    (state: { phrase: string; activeTab: KeywordIntelTab }) => {
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
      stateTimerRef.current = setTimeout(() => setPersistedState(state), 400);
    },
    [],
  );
  useEffect(
    () => () => {
      if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    },
    [],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      phrase: persistedState.phrase,
      activeTab: persistedState.activeTab,
      organizationId: initialOrganizationId ?? "",
      siteId: initialSiteId ?? "",
      pageId: initialPageId ?? "",
      brandId: initialBrandId ?? "",
    }),
    [
      persistedState,
      initialOrganizationId,
      initialSiteId,
      initialPageId,
      initialBrandId,
    ],
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
          organizationId: initialOrganizationId || undefined,
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
