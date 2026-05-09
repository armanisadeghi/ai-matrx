"use client";

// ChatConversationClient
//
// Renders the active conversation UI. conversationId is passed as a prop from
// ChatInstanceManager — this component never reads ?instance= from the URL.
//
// Layout: messages (AgentConversationDisplay) + input (SmartAgentInput),
// both capped at max-w-[800px] to match the original ConversationShell width.

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserContext } from "@/lib/redux/slices/userSlice";
import { useDebugContext } from "@/hooks/useDebugContext";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  selectActiveServerHealth,
} from "@/lib/redux/slices/apiConfigSlice";
import {
  selectLatestConversationId,
  selectLatestRequestStatus,
  selectIsExecuting,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectTurnCount } from "@/features/cx-chat/_legacy-stubs";
import { ArrowDown } from "lucide-react";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";

const AgentPickerSheet = dynamic(
  () =>
    import("@/features/cx-chat/components/agent/AgentPickerSheet").then(
      (m) => ({ default: m.AgentPickerSheet }),
    ),
  { ssr: false },
);

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
  const { isAuthenticated, isAdmin } = useAppSelector(selectUserContext);
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
      Route: "ssr/chat",
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

      const newUrl = `/ssr/chat/c/${latestConversationId}?agent=${agentId}`;
      window.history.replaceState(window.history.state, "", newUrl);

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
    router.push(`/ssr/chat/a/${agentId}`);
  }, [router, agentId]);

  return (
    <>
      <AgentPickerSheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedAgent={null}
        onSelect={(agent) => router.push(`/ssr/chat/a/${agent.promptId}`)}
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
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="pointer-events-auto flex items-center justify-center w-8 h-8 rounded-full
                    matrx-shell-glass shadow-lg
                    text-muted-foreground hover:text-foreground
                    transition-all duration-200 ease-out
                    animate-in fade-in slide-in-from-bottom-2"
                  title="Scroll to bottom"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 p-2 pb-safe">
          <div className="max-w-[800px] mx-auto">
            <SmartAgentInput
              conversationId={conversationId}
              surfaceKey={`cx-chat:${agentId}`}
              showSubmitOnEnterToggle
              enablePasteImages={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </>
  );
}
