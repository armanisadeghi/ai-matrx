"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronRight, FolderSearch, Target } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { KeywordIntelPanel } from "@/features/marketing/seo/keyword/KeywordIntelPanel";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import {
  normalizeKeywordIntelTab,
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
 *
 * The WindowPanel sidebar is the keyword workspace rail. The opening phrase
 * stays pinned as the target; related keywords opened from the dossier are
 * deduplicated into drill-down entries. Selecting an entry swaps the entire
 * dossier while preserving the window's site/page/brand scope. Persistence
 * keeps the established `targetPhrase` + `history` data contract.
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
    activeTab: normalizeKeywordIntelTab(initialTab),
  });
  const [targetPhrase, setTargetPhrase] = useState(
    () => initialTargetPhrase?.trim() || initialPhrase?.trim() || "",
  );
  const [drilledKeywords, setDrilledKeywords] = useState<string[]>(() => {
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
    activeTab: normalizeKeywordIntelTab(initialTab),
    targetPhrase,
    history: drilledKeywords,
  });
  const stateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stateTimerRef.current) clearTimeout(stateTimerRef.current);
    stateTimerRef.current = setTimeout(
      () =>
        setPersistedState({
          ...panelState,
          targetPhrase,
          history: drilledKeywords,
        }),
      400,
    );
  }, [panelState, targetPhrase, drilledKeywords]);

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
    if (!key) return;
    if (!normalizeKeywordPhrase(targetPhrase)) {
      setTargetPhrase(trimmed);
      return;
    }
    if (key === normalizeKeywordPhrase(targetPhrase)) return;
    setDrilledKeywords((current) => {
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

  const selectWorkspaceKeyword = (nextPhrase: string) => {
    setPanelState({ phrase: nextPhrase, activeTab: "overview" });
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
        <KeywordWorkspaceRail
          targetPhrase={targetPhrase}
          drilledKeywords={drilledKeywords}
          currentPhrase={panelState.phrase}
          onSelect={selectWorkspaceKeyword}
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
        onPhraseChange={(phrase) => {
          recordVisitedKeyword(phrase);
          setPanelState((current) => ({ ...current, phrase }));
        }}
        onTabChange={(activeTab) =>
          setPanelState((current) => ({ ...current, activeTab }))
        }
        onRelatedKeywordNavigate={navigateToRelatedKeyword}
        onResearchStart={recordVisitedKeyword}
      />
    </WindowPanel>
  );
}

function KeywordWorkspaceRail({
  targetPhrase,
  drilledKeywords,
  currentPhrase,
  onSelect,
}: {
  targetPhrase: string;
  drilledKeywords: string[];
  currentPhrase: string;
  onSelect: (phrase: string) => void;
}) {
  const currentKey = normalizeKeywordPhrase(currentPhrase);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[clamp(0.7rem,0.67rem+0.12vw,0.78rem)] font-semibold text-foreground">
          <FolderSearch className="h-3.5 w-3.5 text-primary" />
          Keyword workspace
        </div>
        <p className="mt-0.5 text-[clamp(0.62rem,0.59rem+0.1vw,0.69rem)] leading-4 text-muted-foreground">
          Each item opens its complete dossier.
        </p>
      </div>

      <nav
        aria-label="Keyword workspace"
        className="flex min-h-0 flex-1 flex-col gap-3 px-2 py-2.5"
      >
        <div>
          <p className="px-2 pb-1 text-[clamp(0.56rem,0.53rem+0.08vw,0.62rem)] font-semibold uppercase tracking-wider text-muted-foreground">
            Pinned target
          </p>
          {targetPhrase ? (
            <WorkspaceKeywordItem
              phrase={targetPhrase}
              active={currentKey === normalizeKeywordPhrase(targetPhrase)}
              icon={<Target className="h-3.5 w-3.5" />}
              onSelect={onSelect}
            />
          ) : (
            <div className="px-2 py-1.5 text-[clamp(0.62rem,0.59rem+0.1vw,0.69rem)] leading-4 text-muted-foreground">
              Enter a keyword to pin the first dossier.
            </div>
          )}
        </div>

        <div className="min-h-0">
          <p className="flex items-center justify-between px-2 pb-1 text-[clamp(0.56rem,0.53rem+0.08vw,0.62rem)] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Drill-downs</span>
            {drilledKeywords.length > 0 ? (
              <span aria-label={`${drilledKeywords.length} drilled keywords`}>
                {drilledKeywords.length}
              </span>
            ) : null}
          </p>
          {drilledKeywords.length > 0 ? (
            <div className="grid gap-0.5">
              {drilledKeywords.map((phrase) => (
                <WorkspaceKeywordItem
                  key={normalizeKeywordPhrase(phrase)}
                  phrase={phrase}
                  active={currentKey === normalizeKeywordPhrase(phrase)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-[clamp(0.62rem,0.59rem+0.1vw,0.69rem)] leading-4 text-muted-foreground">
              Open a related keyword to add its dossier here.
            </p>
          )}
        </div>
      </nav>
    </div>
  );
}

function WorkspaceKeywordItem({
  phrase,
  active,
  icon,
  onSelect,
}: {
  phrase: string;
  active: boolean;
  icon?: ReactNode;
  onSelect: (phrase: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(phrase)}
      title={`Open the complete dossier for “${phrase}”`}
      aria-label={`Open keyword dossier for ${phrase}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full min-w-0 items-center gap-1.5 border-l-2 px-2 py-1.5 text-left transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {icon ?? <FolderSearch className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[clamp(0.68rem,0.64rem+0.12vw,0.75rem)] font-medium">
        {phrase}
      </span>
      <ChevronRight
        aria-hidden="true"
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-opacity",
          active
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-70 group-focus-visible:opacity-70",
        )}
      />
      {active ? <span className="sr-only">Active dossier</span> : null}
    </button>
  );
}
