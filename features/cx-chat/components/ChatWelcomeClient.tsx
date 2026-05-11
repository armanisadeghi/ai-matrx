"use client";

// ChatWelcomeClient — Welcome screen for the chat route.
//
// conversationId is passed as a prop from ChatInstanceManager — never from URL.
//
// Flow:
//  1. SmartAgentInput dispatches executeInstance(conversationId) on send.
//  2. selectLatestConversationId detects the new conversationId from streaming.
//  3. router.replace navigates to /c/{id} — instance stays alive, streaming continues.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/slices/userSlice";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectLatestConversationId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { setInputPlaceholder } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

const AgentPickerSheet = dynamic(
  () =>
    import("@/features/cx-chat/components/agent/AgentPickerSheet").then(
      (m) => ({ default: m.AgentPickerSheet }),
    ),
  { ssr: false },
);

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatWelcomeClientProps {
  agentId: string;
  agentName: string;
  agentDescription?: string;
  conversationId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatWelcomeClient({
  agentId,
  agentName,
  agentDescription,
  conversationId,
}: ChatWelcomeClientProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Welcome-screen placeholder lives in Redux now (no more prop chain).
  useEffect(() => {
    if (!conversationId) return;
    dispatch(
      setInputPlaceholder({
        conversationId,
        value: "What do you want to know?",
      }),
    );
  }, [conversationId, dispatch]);

  // Prefer the live Redux record; fall back to server-resolved props.
  const liveAgent = useAppSelector((state) => selectAgentById(state, agentId));
  const displayName = liveAgent?.name ?? agentName;
  const displayDescription = liveAgent?.description ?? agentDescription;

  const latestConversationId = useAppSelector(
    selectLatestConversationId(conversationId),
  );
  const hasNavigated = useRef(false);
  useEffect(() => {
    if (!latestConversationId || hasNavigated.current) return;
    hasNavigated.current = true;
    router.replace(`/ssr/chat/c/${latestConversationId}?agent=${agentId}`);
  }, [latestConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentSelect = useCallback(
    (picked: { promptId: string }) => {
      router.push(`/ssr/chat/a/${picked.promptId}`);
    },
    [router],
  );

  return (
    <>
      <AgentPickerSheet
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedAgent={
          liveAgent
            ? { promptId: liveAgent.id, name: liveAgent.name }
            : { promptId: agentId, name: agentName }
        }
        onSelect={handleAgentSelect}
      />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="min-h-full flex flex-col items-center justify-center px-3 md:px-8">
          <div className="w-full max-w-3xl">
            <div className="text-center mb-6 md:mb-8">
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
                {displayName || "What can I help with?"}
              </h1>
              {displayDescription ? (
                <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                  {displayDescription}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  AI with Matrx superpowers
                </p>
              )}
            </div>

            <SmartAgentInput
              conversationId={conversationId}
              surfaceKey={`cx-chat:${agentId}`}
              sendButtonVariant="blue"
              showSubmitOnEnterToggle
              enablePasteImages={isAuthenticated}
            />
          </div>
        </div>
      </div>
    </>
  );
}
