"use client";

// ChatConversationClient
//
// Renders the active conversation UI. conversationId is passed as a prop from
// ChatInstanceManager — this component never reads ?instance= from the URL.
//
// Layout: messages (AgentConversationDisplay) + input (SmartAgentInput),
// both capped at max-w-[800px] to match the original ConversationShell width.

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "../../../host/navigation";
import { AgentPickerSheet } from "../../../next/lazy/AgentPickerSheet";
import { useAppSelector } from "../../../store/hooks";
import { selectIsAdmin, selectIsAuthenticated } from "../../../host/identity";
import { useDebugContext } from "../../../host/prefs-react";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  selectActiveServerHealth,
} from "../../../host/server/api-config";
import {
  selectLatestConversationId,
  selectLatestRequestStatus,
  selectIsExecuting,
} from "../../../agents/redux/execution-system/selectors/aggregate.selectors";
import { selectTurnCount } from "../../_legacy-stubs";
import { ArrowDown } from "lucide-react";
import { AgentConversationDisplay } from "../../../agents/components/messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "../../../agents/components/inputs/smart-input/SmartAgentInput";
import { useComposerMode } from "../../../agents/components/inputs/smart-input/composer/useComposerMode";
import { ProposedDirectivesZone } from "@ai-matrx/chat/host/ui-slots";
import { ServerOperationBanner } from "../../../agents/runtime-reconnect/ServerOperationBanner";
import { pushAppHref } from "@ai-matrx/chat/host/ui-slots";
import { replaceAddressWithoutNavigating } from "@ai-matrx/chat/ui/addressWithoutNavigating";
import { Button } from "@ai-matrx/design-system/controls";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatConversationClientProps {
  conversationId: string;
  agentId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatConversationClient({
  conversationId,
  agentId,
}: ChatConversationClientProps) {
  const router = useRouter();
  const { mode: composerMode } = useComposerMode();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isAdmin = useAppSelector(selectIsAdmin);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // ── Debug context ──────────────────────────────────────────────────────────
  const { publish: publishDebug, isActive: isDebugActive } =
    useDebugContext("Chat");
  const activeServer = useAppSelector(selectActiveServer);
  const resolvedUrl = useAppSelector(selectResolvedBaseUrl);
  const serverHealth = useAppSelector(selectActiveServerHealth);

  const latestConversationId = useAppSelector(
    selectLatestConversationId(conversationId),
  );
  const requestStatus = useAppSelector(
    selectLatestRequestStatus(conversationId),
  );
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const turnCount = useAppSelector(selectTurnCount(conversationId));

  useEffect(() => {
    publishDebug({
      Route: "demos/chat",
      "Instance ID": conversationId,
      "Conversation ID": latestConversationId ?? conversationId,
      "Agent ID": agentId,
      "Request Status": requestStatus ?? "—",
      "Is Executing": isExecuting,
      "Turn Count": turnCount,
      "Is Authenticated": isAuthenticated,
      "Is Admin": isAdmin,
      "Active Server": activeServer,
      "Backend URL": resolvedUrl ?? "not configured",
      "Server Health": serverHealth.status,
      "Server Latency":
        serverHealth.latencyMs != null ? `${serverHealth.latencyMs}ms` : "—",
    });
  }, [
    isDebugActive,
    conversationId,
    latestConversationId,
    requestStatus,
    isExecuting,
    turnCount,
    agentId,
    isAuthenticated,
    isAdmin,
    activeServer,
    resolvedUrl,
    serverHealth.status,
    serverHealth.latencyMs,
  ]);

  // ── URL sync — when backend returns a new conversationId ──────────────────
  const lastSyncedConvId = useRef<string | null>(conversationId ?? null);
  useEffect(() => {
    if (
      latestConversationId &&
      latestConversationId !== lastSyncedConvId.current
    ) {
      lastSyncedConvId.current = latestConversationId;

      // PATHNAME write, so it cannot go through `commitUrlParams` (that only
      // rewrites the query of the current path): a brand-new conversation gets
      // stamped into `/demos/chat/c/<id>` in place, with no Next navigation —
      // the stream is mid-flight and a soft nav would remount the room.
      // It therefore fires `matrx:url-state` itself, exactly as
      // `commitUrlParams` would, so every url-state-backed control on the page
      // (and the shell's NavActiveSync) re-reads instead of going stale.
      const newUrl = `/demos/chat/c/${latestConversationId}?agent=${agentId}`;
      replaceAddressWithoutNavigating(newUrl);
      window.dispatchEvent(new Event("matrx:url-state"));

      window.dispatchEvent(
        new CustomEvent("chat:conversationCreated", {
          detail: { id: latestConversationId, title: "New Chat" },
        }),
      );
    }
  }, [latestConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar notification on turn complete ──────────────────────────────────
  useEffect(() => {
    if (requestStatus === "complete" && latestConversationId && turnCount > 0) {
      window.dispatchEvent(
        new CustomEvent("chat:conversationUpdated", {
          detail: { id: latestConversationId },
        }),
      );
    }
  }, [requestStatus, latestConversationId, turnCount]);

  const handleNewChat = useCallback(() => {
    pushAppHref(router, `/demos/chat/a/${agentId}`);
  }, [router, agentId]);

  return (
    <>
      <AgentPickerSheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedAgent={null}
        onSelect={(agent) => pushAppHref(router, `/demos/chat/a/${agent.promptId}`)}
      />

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Messages — scrollable with fade and scroll-to-bottom */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overscroll-contain"
          >
            <div className="max-w-[800px] mx-auto w-full">
              <AgentConversationDisplay conversationId={conversationId} />
            </div>
          </div>
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-3"
            style={{
              background:
                "linear-gradient(to bottom, transparent, var(--background))",
            }}
          />
          {showScrollDown && (
            <div className="absolute bottom-4 left-0 right-0 z-10 pointer-events-none flex justify-center">
              <div className="w-full max-w-[800px] flex justify-end px-4">
                <Button variant="quiet" icon={<ArrowDown />} onClick={scrollToBottom} title="Scroll to bottom" aria-label="Scroll to bottom" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 p-2 pb-safe">
          <div className="max-w-[800px] mx-auto">
            {/* Same reconnect / Continue face as every agent surface — a turn
                whose resume could not continue is never a silent stall. */}
            <ServerOperationBanner conversationId={conversationId} />
            <ProposedDirectivesZone conversationId={conversationId} />
            <SmartAgentInput
              conversationId={conversationId}
              surfaceKey={`cx-chat:${agentId}`}
              composer={{ size: "page", mode: composerMode }}
              enablePasteImages={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </>
  );
}
