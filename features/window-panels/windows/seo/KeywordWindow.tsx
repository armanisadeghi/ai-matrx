"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { History, Target } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { KeywordIntelPanel } from "@/features/marketing/seo/keyword/KeywordIntelPanel";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import {
  isKeywordIntelTab,
  type KeywordIntelTab,
} from "@/features/marketing/seo/keyword/types";
import { cn } from "@/lib/utils";

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
  initialTargetPhrase?: string;
  initialHistory?: string[];
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
  initialTargetPhrase,
  initialHistory,
  initialOrganizationId,
  initialSiteId,
  initialPageId,
  initialBrandId,
  initialTab,
}: Omit<KeywordWindowProps, "isOpen">) {
  const [panelState, setPanelState] = useState<{
    phrase: string;
    activeTab: KeywordIntelTab;
  }>({
    phrase: initialPhrase ?? "",
    activeTab: isKeywordIntelTab(initialTab) ? initialTab : "overview",
  });
  const [targetPhrase] = useState(
    () => initialTargetPhrase?.trim() || initialPhrase?.trim() || "",
  );
  const [history, setHistory] = useState<string[]>(() => {
    const targetKey = normalizeKeywordPhrase(
      initialTargetPhrase?.trim() || initialPhrase?.trim() || "",
    );
    const seen = new Set<string>(targetKey ? [targetKey] : []);
    return (initialHistory ?? []).flatMap((entry) => {
      const phrase = entry.trim();
      const key = normalizeKeywordPhrase(phrase);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [phrase];
    });
  });

  // Debounced state mirror for persistence. State (not a ref) because the
  // WindowPanel save effect keys on the collector's identity — a ref-backed
  // collector never re-stages, so a reload would restore a stale phrase/tab.
  // The debounce avoids re-staging persistence per keystroke.
  const [persistedState, setPersistedState] = useState<{
    phrase: string;
    activeTab: KeywordIntelTab;
    targetPhrase: string;
    history: string[];
  }>({
    phrase: initialPhrase ?? "",
    activeTab: isKeywordIntelTab(initialTab) ? initialTab : "overview",
    targetPhrase,
    history,
  });
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    stateTimerRef.current = setTimeout(
      () =>
        setPersistedState({
          ...panelState,
          targetPhrase,
          history,
        }),
      400,
    );
  }, [panelState, targetPhrase, history]);

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
      targetPhrase: persistedState.targetPhrase,
      history: persistedState.history,
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

  const recordVisitedKeyword = (nextPhrase: string) => {
    const trimmed = nextPhrase.trim();
    const key = normalizeKeywordPhrase(trimmed);
    if (!key || key === normalizeKeywordPhrase(targetPhrase)) return;
    setHistory((current) => {
      if (current.some((entry) => normalizeKeywordPhrase(entry) === key)) {
        return current;
      }
      return [...current, trimmed];
    });
  };

  const navigateToRelatedKeyword = (nextPhrase: string) => {
    const trimmed = nextPhrase.trim();
    if (!trimmed) return;
    recordVisitedKeyword(trimmed);
    setPanelState({ phrase: trimmed, activeTab: "overview" });
  };

  const selectHistoryKeyword = (nextPhrase: string) => {
    setPanelState((current) => ({ ...current, phrase: nextPhrase }));
  };

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
      sidebar={
        <KeywordHistorySidebar
          targetPhrase={targetPhrase}
          history={history}
          currentPhrase={panelState.phrase}
          onSelect={selectHistoryKeyword}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      sidebarClassName="bg-muted/10"
    >
      <KeywordIntelPanel
        phrase={panelState.phrase}
        activeTab={panelState.activeTab}
        scope={{
          organizationId: initialOrganizationId || undefined,
          siteId: initialSiteId || undefined,
          pageId: initialPageId || undefined,
          brandId: initialBrandId || undefined,
        }}
        onPhraseChange={(phrase) =>
          setPanelState((current) => ({ ...current, phrase }))
        }
        onTabChange={(activeTab) =>
          setPanelState((current) => ({ ...current, activeTab }))
        }
        onRelatedKeywordNavigate={navigateToRelatedKeyword}
        onResearchStart={recordVisitedKeyword}
      />
    </WindowPanel>
  );
}

function KeywordHistorySidebar({
  targetPhrase,
  history,
  currentPhrase,
  onSelect,
}: {
  targetPhrase: string;
  history: string[];
  currentPhrase: string;
  onSelect: (phrase: string) => void;
}) {
  const currentKey = normalizeKeywordPhrase(currentPhrase);

  return (
    <div className="flex min-h-full flex-col px-2 py-3">
      <div className="px-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <History className="h-3.5 w-3.5 text-muted-foreground" />
          Research history
        </div>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          The original target stays pinned while you explore related keywords.
        </p>
      </div>

      <nav aria-label="Keyword research history" className="mt-3 grid gap-1">
        {targetPhrase ? (
          <HistoryItem
            phrase={targetPhrase}
            label="Target"
            active={currentKey === normalizeKeywordPhrase(targetPhrase)}
            icon={<Target className="h-3.5 w-3.5" />}
            onSelect={onSelect}
          />
        ) : (
          <div className="rounded-md px-2 py-2 text-[11px] text-muted-foreground">
            Open the window from a target keyword to pin it here.
          </div>
        )}

        {history.length > 0 ? (
          <>
            <p className="px-2 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Explored
            </p>
            {history.map((phrase) => (
              <HistoryItem
                key={normalizeKeywordPhrase(phrase)}
                phrase={phrase}
                active={currentKey === normalizeKeywordPhrase(phrase)}
                onSelect={onSelect}
              />
            ))}
          </>
        ) : (
          <p className="px-2 pt-3 text-[10px] leading-4 text-muted-foreground">
            Related keywords you open or research will appear here.
          </p>
        )}
      </nav>
    </div>
  );
}

function HistoryItem({
  phrase,
  label,
  active,
  icon,
  onSelect,
}: {
  phrase: string;
  label?: string;
  active: boolean;
  icon?: ReactNode;
  onSelect: (phrase: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(phrase)}
      title={`Open “${phrase}”`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full rounded-md px-2 py-2 text-left transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {phrase}
        </span>
        {label ? (
          <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-primary">
            {label}
          </span>
        ) : null}
      </span>
    </button>
  );
}
