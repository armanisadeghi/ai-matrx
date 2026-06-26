"use client";

// InstanceUIStateWindow — admin inspector for the instanceUIState Redux slice.
//
// Thin COMPOSITION ROOT (mirrors NotesWindow / FeedbackWindow): it owns the
// open-tabs + view state via `useInstanceUIState` and maps the units onto
// WindowPanel's slots. The body holds ONLY content (the selected view), while
// the window-level CHROME lives in slots:
//   - sidebar      → <InstanceUIStateList>   (instance tree)
//   - actionsRight → <ViewToggle>            (Instance ⇄ Full-slice-JSON switcher)
//   - footer       → instance count + "Copy slice"
//   - body         → the active view's content only
//
// The open-instances `TabBar` is genuine CONTENT (document-style closeable
// tabs, like the notes editor's tab strip), so it stays in the body — but only
// inside the instance-detail view branch, never as a window-level header bar.

import { useCallback, useState } from "react";
import { LayoutDashboard, X, Code2, Copy, Check } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { InstanceUIStateList } from "@/features/agents/redux/execution-system/instance-ui-state/components/InstanceUIStateList";
import { InstanceUIStateCore } from "@/features/agents/redux/execution-system/instance-ui-state/components/InstanceUIStateCore";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectFullInstanceUIStateSlice,
  selectInstanceTitle,
  selectAllUIStateConversationIds,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { cn } from "@/lib/utils";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { formatJson } from "@/utils/json/json-cleaner-utility";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = string;

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return { copied, copy };
}

// ─── useInstanceUIState — hoisted shared state ────────────────────────────────
// Owns the open-tabs + active-view state so the WindowPanel root can feed both
// the body content and the header/footer slots. Mirrors `useFeedbackForm`.

type InstanceUIState = ReturnType<typeof useInstanceUIState>;

function useInstanceUIState(initialConversationId: string | null) {
  const sliceState = useAppSelector(selectFullInstanceUIStateSlice);
  const allIds = useAppSelector(selectAllUIStateConversationIds);

  const firstId = initialConversationId ?? allIds[0] ?? null;

  const [openTabIds, setOpenTabIds] = useState<TabId[]>(
    firstId ? [firstId] : [],
  );
  const [activeTabId, setActiveTabId] = useState<TabId | null>(firstId);
  const [showFullSlice, setShowFullSlice] = useState(() => !firstId);

  const openTab = useCallback((id: TabId) => {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
    setShowFullSlice(false);
  }, []);

  const closeTab = useCallback(
    (id: TabId) => {
      setOpenTabIds((prev) => {
        const next = prev.filter((t) => t !== id);
        if (activeTabId === id) {
          setActiveTabId(next.length > 0 ? next[next.length - 1] : null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const toggleFullSlice = useCallback(() => setShowFullSlice((v) => !v), []);

  const instanceCount = Object.keys(sliceState.byConversationId).length;
  const sliceJson = formatJson(sliceState, 2);

  return {
    openTabIds,
    activeTabId,
    setActiveTabId,
    showFullSlice,
    toggleFullSlice,
    openTab,
    closeTab,
    instanceCount,
    sliceJson,
  };
}

// ─── Tab bar (open-instances document tabs — body CONTENT) ────────────────────

function TabBar({
  openTabIds,
  activeTabId,
  onActivate,
  onClose,
}: {
  openTabIds: TabId[];
  activeTabId: TabId | null;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
}) {
  if (openTabIds.length === 0) return null;

  return (
    <div className="flex items-end h-8 border-b border-border bg-muted/20 px-1 shrink-0 overflow-x-auto no-scrollbar">
      {openTabIds.map((id) => (
        <TabItem
          key={id}
          tabId={id}
          isActive={id === activeTabId}
          onActivate={() => onActivate(id)}
          onClose={() => onClose(id)}
        />
      ))}
    </div>
  );
}

function TabItem({
  tabId,
  isActive,
  onActivate,
  onClose,
}: {
  tabId: TabId;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const instanceTitle = useAppSelector(selectInstanceTitle(tabId));
  const label = instanceTitle ?? tabId.slice(0, 8) + "…";

  return (
    <div
      onClick={onActivate}
      className={cn(
        "group flex items-center h-full border border-b-0 rounded-t pl-2.5 pr-1 cursor-pointer select-none transition-colors shrink-0",
        "min-w-[80px] max-w-[180px]",
        isActive
          ? "bg-background border-border text-foreground z-10 font-medium pb-px translate-y-px"
          : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/70",
      )}
    >
      <span className="text-xs truncate flex-1">{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={cn(
          "w-4 h-4 ml-1 rounded-sm flex items-center justify-center transition-colors shrink-0",
          isActive
            ? "text-muted-foreground hover:bg-muted"
            : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted/80",
        )}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Full slice JSON view ─────────────────────────────────────────────────────

function FullSliceView() {
  const sliceState = useAppSelector(selectFullInstanceUIStateSlice);
  const instanceCount = Object.keys(sliceState.byConversationId).length;

  return (
    <JsonInspector
      data={sliceState}
      defaultView="json"
      label={
        <>
          instanceUIState — full slice
          <span className="font-normal text-muted-foreground">
            {" "}
            ({instanceCount} instance{instanceCount === 1 ? "" : "s"})
          </span>
        </>
      }
      className="h-full min-h-0 rounded-none border-0 shadow-none"
    />
  );
}

// ─── Header slot: view switcher (window-level CHROME) ─────────────────────────

function ViewToggle({ state }: { state: InstanceUIState }) {
  return (
    <button
      type="button"
      onClick={state.toggleFullSlice}
      className={cn(
        "flex items-center gap-1 h-6 px-2 rounded text-xs transition-colors [&_svg]:h-3 [&_svg]:w-3",
        state.showFullSlice
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      <Code2 />
      <span>Full Slice JSON</span>
    </button>
  );
}

// ─── Footer slots ─────────────────────────────────────────────────────────────

function FooterLeft({ state }: { state: InstanceUIState }) {
  return (
    <span className="text-[11px] text-muted-foreground">
      {state.instanceCount} instance{state.instanceCount !== 1 ? "s" : ""} in
      slice
    </span>
  );
}

function FooterRight({ state }: { state: InstanceUIState }) {
  const { copied, copy } = useCopyText(state.sliceJson);
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Copy full slice JSON"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      <span>Copy slice</span>
    </button>
  );
}

// ─── Body — content only ──────────────────────────────────────────────────────
// Renders ONLY the active view. The view switcher is a header slot and the
// instance count / "Copy slice" are footer slots, not hand-rolled body chrome.
// The open-instances TabBar is content for the instance-detail view, so it
// lives inside that branch.

function InstanceUIStateBody({ state }: { state: InstanceUIState }) {
  const {
    showFullSlice,
    openTabIds,
    activeTabId,
    setActiveTabId,
    openTab,
    closeTab,
  } = state;

  if (showFullSlice) {
    return <FullSliceView />;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <TabBar
        openTabIds={openTabIds}
        activeTabId={activeTabId}
        onActivate={setActiveTabId}
        onClose={closeTab}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTabId ? (
          <InstanceUIStateCore
            conversationId={activeTabId}
            className="h-full"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center text-muted-foreground">
            <LayoutDashboard className="h-10 w-10 opacity-15" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No instance selected
              </p>
              <p className="text-xs opacity-60">
                Select an instance from the sidebar to inspect its UI state.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Window inner ─────────────────────────────────────────────────────────────

function InstanceUIStateWindowInner({
  onClose,
  initialConversationId,
}: {
  onClose: () => void;
  initialConversationId: string | null;
}) {
  const state = useInstanceUIState(initialConversationId);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      selectedConversationId: state.activeTabId ?? null,
    }),
    [state.activeTabId],
  );

  return (
    <WindowPanel
      id="instance-ui-state-window"
      title="Instance UI State"
      onClose={onClose}
      width={900}
      height={640}
      minWidth={520}
      minHeight={360}
      overlayId="instanceUIStateWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onCollectData={collectData}
      actionsRight={<ViewToggle state={state} />}
      footerLeft={<FooterLeft state={state} />}
      footerRight={<FooterRight state={state} />}
      sidebar={
        <InstanceUIStateList
          openTabIds={state.openTabIds}
          selectedConversationId={state.activeTabId}
          onSelect={state.openTab}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={150}
      defaultSidebarOpen
    >
      <InstanceUIStateBody state={state} />
    </WindowPanel>
  );
}

// ─── Window shell ─────────────────────────────────────────────────────────────

interface InstanceUIStateWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialConversationId?: string | null;
}

export default function InstanceUIStateWindow({
  isOpen,
  onClose,
  initialConversationId,
}: InstanceUIStateWindowProps) {
  if (!isOpen) return null;
  return (
    <InstanceUIStateWindowInner
      onClose={onClose}
      initialConversationId={initialConversationId ?? null}
    />
  );
}
