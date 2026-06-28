"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { useChatContext } from "../context/DEPRECATED-ChatContext";
import { useLayoutAgent } from "../context/LayoutAgentContext";
import { sidebarEvents } from "../events/sidebarEvents";
import { selectBuiltinAgents } from "@/lib/redux/selectors/agentSelectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAgentChat } from "../hooks/DEPRECATED-useAgentChat";
import { ChatInputWithControls } from "./ChatInputWithControls";
import { MessageList } from "./MessageDisplay";
import { PublicVariableInputs } from "./PublicVariableInputs";
import { GuidedVariableInputs } from "./GuidedVariableInputs";
import {
  ResponseModeButtons,
  BackToStartButton,
  DEFAULT_AGENTS,
} from "./AgentSelector";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import { formatText } from "@/utils/text/text-case-converter";
import type { PublicResource } from "../types/content";
import type { VariableDefinition as PromptVariable } from "@/features/agents/types/agent-definition.types";
import { MessageCircle, Share2, List, Layers } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

// ============================================================================
// TYPES
// ============================================================================

interface ChatContainerProps {
  className?: string;
}

// ============================================================================
// CHAT CONTAINER
// ============================================================================

export function ChatContainer({ className = "" }: ChatContainerProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    state,
    setAgent,
    addMessage,
    setUseLocalhost,
    updateMessage,
    setDbConversationId,
  } = useChatContext();
  const { onAgentChange, isLoadingConversation, focusKey, openAgentPicker } =
    useLayoutAgent();
  const builtinAgents = useAppSelector(selectBuiltinAgents);

  // Default to guided mode; ?vars=classic → stacked rows
  const useGuidedVars = searchParams.get("vars") !== "classic";

  const [variableValues, setVariableValues] = useState<Record<string, any>>({});
  // Active variable definitions shown in the UI. Cleared after first submit.
  const [activeVariables, setActiveVariables] = useState<PromptVariable[]>([]);
  const [streamEvents, setStreamEvents] = useState<TypedStreamEvent[]>([]);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const prevAssistantCountRef = useRef(0);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const user = useSelector(selectUser);
  const isAuthenticated = !!user?.id;
  const resolvedBaseUrl = useSelector(
    selectResolvedBaseUrl as (state: unknown) => string | undefined,
  );
  const useLocalhost =
    resolvedBaseUrl === (BACKEND_URLS.localhost ?? "http://localhost:8000");

  const { sendMessage, isStreaming, isExecuting, messages, conversationId } =
    useAgentChat({
      onStreamEvent: (event) => {
        setStreamEvents((prev) => [...prev, event]);
      },
      onComplete: () => {
        setTimeout(() => setStreamEvents([]), 100);

        if (state.dbConversationId) {
          sidebarEvents.emit("conversation-updated", {
            id: state.dbConversationId,
          });
        }
      },
      onError: () => {
        // URL sync is handled by ChatLayoutShell observing dbConversationId.
        // Nothing to do here beyond what useAgentChat already handles.
      },
    });

  // Sync Redux server preference to chat context
  useEffect(() => {
    setUseLocalhost(useLocalhost);
  }, [useLocalhost, setUseLocalhost]);

  // Initialize variables from current agent on mount or agent change.
  // Only populate activeVariables for a fresh conversation (no messages).
  const hasMessages = state.messages.length > 0;

  useEffect(() => {
    const agent = state.currentAgent;
    if (!agent) {
      const defaultAgent = DEFAULT_AGENTS[0];
      setAgent({
        promptId: defaultAgent.promptId,
        name: defaultAgent.name,
        description: defaultAgent.description,
        variableDefaults: defaultAgent.variableDefaults,
      });
    }

    if (hasMessages) {
      setActiveVariables([]);
      setVariableValues({});
      return;
    }

    const varDefs = (agent || DEFAULT_AGENTS[0]).variableDefaults;
    if (varDefs && varDefs.length > 0) {
      setActiveVariables(varDefs);
      const initialValues: Record<string, string> = {};
      varDefs.forEach((variable) => {
        if (variable.defaultValue) {
          initialValues[variable.name] = variable.defaultValue;
        }
      });
      setVariableValues(initialValues);
    } else {
      setActiveVariables([]);
      setVariableValues({});
    }
  }, [state.currentAgent?.promptId, hasMessages]);

  // Focus the first available input on agent change or after load.
  // Skipped on mobile — auto-focus opens the keyboard and obscures the viewport.
  useEffect(() => {
    if (isLoadingConversation) return;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8;

    function tryFocus() {
      if (cancelled) return;
      attempts++;

      if (activeVariables.length > 0) {
        const container = document.querySelector("[data-variable-inputs]");
        const firstInput = container?.querySelector<HTMLInputElement>(
          '[data-variable-index="0"]',
        );
        if (firstInput) {
          firstInput.focus();
          return;
        }
      }
      if (textInputRef.current) {
        textInputRef.current.focus();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(tryFocus, attempts * 50);
      }
    }

    const timer = setTimeout(tryFocus, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.currentAgent?.promptId, focusKey, isLoadingConversation]);

  // Scroll to latest assistant message when a new one appears
  useEffect(() => {
    const assistantCount = messages.filter(
      (m) => m.role === "assistant",
    ).length;
    if (
      assistantCount > prevAssistantCountRef.current &&
      latestAssistantRef.current
    ) {
      latestAssistantRef.current.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    }
    prevAssistantCountRef.current = assistantCount;
  }, [messages]);

  // Agent selection — delegates to layout context
  const handleAgentSelect = (agent: (typeof DEFAULT_AGENTS)[0]) => {
    onAgentChange({
      promptId: agent.promptId,
      name: agent.name,
      description: agent.description,
      variableDefaults: agent.variableDefaults,
    });
  };

  // Response mode selection — switches agent via the unified system
  const handleModeSelect = (_modeId: string, agentId: string | null) => {
    if (!agentId) return;
    // Check hardcoded agents first, then builtins
    const match = DEFAULT_AGENTS.find((a) => a.promptId === agentId);
    if (match) {
      onAgentChange({
        promptId: agentId,
        name: match.name,
        description: match.description,
        variableDefaults: match.variableDefaults,
      });
      return;
    }
    const builtin = builtinAgents.find((a) => a.id === agentId);
    onAgentChange({
      promptId: agentId,
      name: builtin?.name || "",
      description: builtin?.description,
      variableDefaults: builtin?.variableDefaults as
        | PromptVariable[]
        | undefined,
    });
  };

  // Navigate back to the default agent (starting screen)
  const handleBackToStart = () => {
    const defaultAgent = DEFAULT_AGENTS[0];
    onAgentChange({
      promptId: defaultAgent.promptId,
      name: defaultAgent.name,
      description: defaultAgent.description,
      variableDefaults: defaultAgent.variableDefaults,
    });
  };

  const handleVariableChange = (name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (
    content: string,
    resources?: PublicResource[],
  ) => {
    setStreamEvents([]);

    // Don't set dbConversationId here — let the server return the real one
    // via the 'conversation_id' stream event in useAgentChat.
    // The conversationIdRef in context ensures the hook always sends the
    // correct ID without stale closure issues.

    let displayContent = "";

    if (activeVariables.length > 0) {
      const variableLines: string[] = [];
      activeVariables.forEach((varDef) => {
        const value = variableValues[varDef.name] || varDef.defaultValue || "";
        if (value) {
          const formattedName = formatText(varDef.name);
          variableLines.push(`${formattedName}: ${value}`);
        }
      });

      if (variableLines.length > 0) {
        displayContent = variableLines.join("\n");
        if (content.trim()) {
          displayContent += "\n\n" + content;
        }
      } else {
        displayContent = content;
      }
    } else {
      displayContent = content;
    }

    const submittedVariables = { ...variableValues };
    setActiveVariables([]);
    setVariableValues({});

    return sendMessage({
      content: displayContent,
      variables: submittedVariables,
      resources,
    });
  };

  const handleMessageContentChange = (
    messageId: string,
    newContent: string,
  ) => {
    updateMessage(messageId, { content: newContent });
  };

  const hasVariables = activeVariables.length > 0;
  const isWelcomeScreen = messages.length === 0 && !isLoadingConversation;

  // Loading state for existing conversations (driven by layout)
  if (isLoadingConversation) {
    return (
      <div
        className={`h-full flex flex-col items-center justify-center ${className}`}
      >
        <MessageCircle className="h-8 w-8 text-primary animate-pulse mb-3" />
        <p className="text-sm text-muted-foreground">Loading conversation...</p>
      </div>
    );
  }

  // ========================================================================
  // WELCOME SCREEN
  // ========================================================================
  if (isWelcomeScreen) {
    const agentName = hasVariables ? state.currentAgent?.name : null;
    const agentDescription = hasVariables
      ? state.currentAgent?.description
      : null;
    const varCount = activeVariables.length;
    const showDescription = agentDescription && varCount <= 3;

    // Build the vars=classic/guided toggle URL
    const toggleUrl = (() => {
      const params = new URLSearchParams(searchParams.toString());
      if (useGuidedVars) {
        params.set("vars", "classic");
      } else {
        params.delete("vars");
      }
      const qs = params.toString();
      return qs ? `?${qs}` : pathname;
    })();

    // Guided mode: pin input to bottom (like conversation mode)
    if (useGuidedVars && hasVariables) {
      return (
        <div className={`h-full flex flex-col ${className}`}>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col items-center justify-end min-h-full px-3 md:px-8 pb-4">
              <div className="w-full max-w-3xl text-center">
                <h1
                  className={`font-semibold text-foreground ${
                    varCount > 2
                      ? "text-xl md:text-3xl"
                      : "text-2xl md:text-3xl"
                  }`}
                >
                  {agentName || "What can I help with?"}
                </h1>
                {showDescription && (
                  <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    {agentDescription}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex-shrink-0 px-2 md:px-4 bg-transparent md:bg-background/95 md:backdrop-blur-sm"
            style={{
              paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="w-full max-w-3xl mx-auto">
              <GuidedVariableInputs
                variableDefaults={activeVariables}
                values={variableValues}
                onChange={handleVariableChange}
                disabled={isExecuting}
                textInputRef={textInputRef}
                submitOnEnter={true}
                onSubmit={handleSubmit}
                seamless
              />
              <div className="rounded-b-2xl bg-background">
                <ChatInputWithControls
                  onSubmit={handleSubmit}
                  disabled={isExecuting}
                  placeholder="Additional instructions (optional)…"
                  conversationId={conversationId}
                  onOpenAgentPicker={openAgentPicker}
                  hasVariables={hasVariables}
                  selectedAgent={state.currentAgent}
                  textInputRef={textInputRef}
                  seamless
                />
              </div>
              <div className="flex items-center justify-between mt-3 pb-2">
                <BackToStartButton
                  onBack={handleBackToStart}
                  agentName={agentName || undefined}
                />
                <button
                  type="button"
                  onClick={() => router.replace(toggleUrl)}
                  className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                  title="Switch to classic variable view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Classic mode (or no variables): centered layout
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div
            className={`min-h-full flex flex-col items-center px-3 md:px-8 ${
              varCount > 2
                ? "justify-start pt-8 md:pt-16 md:justify-center"
                : "justify-center"
            }`}
          >
            <div className="w-full max-w-3xl">
              <div
                className={`text-center ${varCount > 2 ? "mb-3 md:mb-6" : "mb-6 md:mb-8"}`}
              >
                <h1
                  className={`font-semibold text-foreground ${
                    varCount > 2
                      ? "text-xl md:text-3xl"
                      : "text-2xl md:text-3xl"
                  }`}
                >
                  {agentName || "What can I help with?"}
                </h1>
                {showDescription ? (
                  <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    {agentDescription}
                  </p>
                ) : !hasVariables ? (
                  <p className="mt-1 text-sm text-muted-foreground/70">
                    AI with Matrx superpowers
                  </p>
                ) : null}
              </div>

              {hasVariables && (
                <div className={varCount > 2 ? "mb-3 md:mb-6" : "mb-6"}>
                  <PublicVariableInputs
                    variableDefaults={activeVariables}
                    values={variableValues}
                    onChange={handleVariableChange}
                    disabled={isExecuting}
                    minimal
                    textInputRef={textInputRef}
                    submitOnEnter={true}
                    onSubmit={handleSubmit}
                  />
                </div>
              )}

              <div>
                <ChatInputWithControls
                  onSubmit={handleSubmit}
                  disabled={isExecuting}
                  placeholder={
                    hasVariables
                      ? "Additional instructions (optional)…"
                      : "What do you want to know?"
                  }
                  conversationId={conversationId}
                  onOpenAgentPicker={openAgentPicker}
                  hasVariables={hasVariables}
                  selectedAgent={state.currentAgent}
                  textInputRef={textInputRef}
                />
              </div>

              <div className="flex items-center justify-between mt-3 md:mt-6 pb-4">
                {hasVariables ? (
                  <BackToStartButton
                    onBack={handleBackToStart}
                    agentName={agentName || undefined}
                  />
                ) : (
                  <ResponseModeButtons
                    disabled={isExecuting}
                    selectedAgentId={state.currentAgent?.promptId}
                    onModeSelect={handleModeSelect}
                  />
                )}
                {hasVariables && (
                  <button
                    type="button"
                    onClick={() => router.replace(toggleUrl)}
                    className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
                    title="Switch to guided variable view"
                  >
                    <Layers className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // CONVERSATION MODE
  // ========================================================================
  const shareConversationId = state.dbConversationId;
  const conversationTitle = state.messages[0]?.content?.slice(0, 60) || "Chat";

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex-1 min-h-0 relative">
        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-background/80 to-transparent z-10 pointer-events-none" />

        <div className="h-full overflow-y-auto scrollbar-hide">
          <div className="w-full max-w-[800px] mx-auto px-3 pt-12 pb-2 md:px-3 md:pt-12 md:pb-4 relative">
            {isAuthenticated && shareConversationId && (
              <div className="absolute top-1 right-3 z-10 hidden md:block">
                <button
                  onClick={() =>
                    dispatch(
                      openOverlay({
                        overlayId: "shareModal",
                        data: {
                          resourceType: "conversation",
                          resourceId: shareConversationId!,
                          resourceName: conversationTitle,
                          isOwner: true,
                        },
                      }),
                    )
                  }
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  title="Share conversation"
                >
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <MessageList
              messages={messages}
              streamEvents={streamEvents.length > 0 ? streamEvents : undefined}
              isStreaming={isStreaming}
              onMessageContentChange={handleMessageContentChange}
              latestAssistantRef={latestAssistantRef}
            />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none md:hidden" />
      </div>

      <div
        className="flex-shrink-0 px-2 md:px-4 md:pt-2 bg-transparent md:bg-background/95 md:backdrop-blur-sm"
        style={{
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="w-full max-w-[800px] mx-auto">
          {hasVariables && useGuidedVars && (
            <GuidedVariableInputs
              variableDefaults={activeVariables}
              values={variableValues}
              onChange={handleVariableChange}
              disabled={isExecuting}
              textInputRef={textInputRef}
              submitOnEnter={true}
              onSubmit={handleSubmit}
              seamless
            />
          )}
          {hasVariables && !useGuidedVars && (
            <div className="mb-2">
              <PublicVariableInputs
                variableDefaults={activeVariables}
                values={variableValues}
                onChange={handleVariableChange}
                disabled={isExecuting}
                minimal
                textInputRef={textInputRef}
                submitOnEnter={true}
                onSubmit={handleSubmit}
              />
            </div>
          )}
          <div
            className={`bg-background ${
              hasVariables && useGuidedVars ? "rounded-b-2xl" : "rounded-2xl"
            }`}
          >
            <ChatInputWithControls
              onSubmit={handleSubmit}
              disabled={isExecuting}
              conversationId={conversationId}
              onOpenAgentPicker={openAgentPicker}
              hasVariables={hasVariables}
              selectedAgent={state.currentAgent}
              textInputRef={textInputRef}
              seamless={hasVariables && useGuidedVars}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatContainer;
