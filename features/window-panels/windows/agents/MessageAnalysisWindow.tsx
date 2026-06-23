"use client";

/**
 * MessageAnalysisWindow
 *
 * Creator-only floating window that inspects the AI request that produced
 * a given assistant message. Reuses the same panels that power the Creator
 * Run Panel's Request / Session / Client tabs — the panels take an optional
 * `requestId` so they can target the specific request tied to a message
 * (via `_streamRequestId`) instead of the latest request on the conversation.
 *
 * Opened from the message action menu (`messageActionRegistry`) via
 * `openOverlay({ overlayId: "messageAnalysisWindow", data: { conversationId, requestId?, messageId? } })`.
 */

import React, { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { RequestStatsPanel } from "@/features/agents/components/run-controls/panels/RequestStatsPanel";
import { SessionStatsPanel } from "@/features/agents/components/run-controls/panels/SessionStatsPanel";
import { ClientMetricsPanel } from "@/features/agents/components/run-controls/panels/ClientMetricsPanel";
import { cn } from "@/lib/utils";

type TabId = "request" | "client" | "session";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "request", label: "Request" },
  { id: "client", label: "Client" },
  { id: "session", label: "Session" },
];

interface MessageAnalysisWindowProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  requestId?: string | null;
  messageId?: string | null;
}

export default function MessageAnalysisWindow({
  isOpen,
  onClose,
  conversationId,
  requestId,
  messageId,
}: MessageAnalysisWindowProps) {
  if (!isOpen) return null;
  return (
    <MessageAnalysisWindowInner
      onClose={onClose}
      conversationId={conversationId}
      requestId={requestId ?? null}
      messageId={messageId ?? null}
    />
  );
}

function MessageAnalysisWindowInner({
  onClose,
  conversationId,
  requestId,
  messageId,
}: {
  onClose: () => void;
  conversationId: string | null;
  requestId: string | null;
  messageId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("request");

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      conversationId,
      requestId,
      messageId,
      activeTab,
    }),
    [conversationId, requestId, messageId, activeTab],
  );

  const title = requestId
    ? `Response Analysis — ${requestId.slice(0, 8)}…`
    : "Response Analysis";

  return (
    <WindowPanel
      id="message-analysis-window"
      title={title}
      onClose={onClose}
      width={560}
      height={520}
      minWidth={400}
      minHeight={320}
      overlayId="messageAnalysisWindow"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      // The Request / Client / Session switcher is window-level chrome, not
      // content — it lives in the header's right action zone so the body holds
      // only the active panel.
      actionsRight={
        conversationId ? (
          <MessageAnalysisTabBar
            activeTab={activeTab}
            onSelectTab={setActiveTab}
          />
        ) : undefined
      }
    >
      {!conversationId ? (
        <div className="p-4 text-xs text-muted-foreground">
          No conversation selected.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "request" && (
            <RequestStatsPanel
              conversationId={conversationId}
              requestId={requestId}
            />
          )}
          {activeTab === "client" && (
            <ClientMetricsPanel
              conversationId={conversationId}
              requestId={requestId}
            />
          )}
          {activeTab === "session" && (
            <SessionStatsPanel conversationId={conversationId} />
          )}
        </div>
      )}
    </WindowPanel>
  );
}

// ─── MessageAnalysisTabBar — header-slot view switcher ────────────────────────
// Compact segmented control rendered in the WindowPanel header's actionsRight
// zone. Window-level chrome (switches which panel the body shows), not content.

function MessageAnalysisTabBar({
  activeTab,
  onSelectTab,
}: {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelectTab(tab.id)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap",
            activeTab === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
