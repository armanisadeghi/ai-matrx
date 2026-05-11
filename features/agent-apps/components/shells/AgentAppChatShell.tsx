"use client";

/**
 * AgentAppChatShell — Tier-0/1 default shell.
 *
 * Mounts the universal AgentRunner with history sidebar + Smart Input.
 * The shell's own header bar sits ABOVE the sidebar (chevron + app name
 * + collapse + new-conversation). The bar persists when the sidebar is
 * collapsed.
 */

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import { useAppDispatch } from "@/lib/redux/hooks";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { clearFocus } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import { Button } from "@/components/ui/button";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";
import { SlotRenderer } from "./SlotRenderer";
import type { UseAgentAppReturn } from "@/features/agent-apps/hooks/useAgentApp";

interface AgentAppChatShellProps {
  app: PublicAgentApp;
}

export function AgentAppChatShell({ app }: AgentAppChatShellProps) {
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const overrides = (app.slot_overrides ?? {}) as Record<
    string,
    string | undefined
  >;
  const [gateDismissed, setGateDismissed] = useState(false);

  // Bumped when the user clicks "+ new conversation". Folded into the
  // surfaceKey so useAgentLauncher's effect deps change → cleanup runs
  // on the old conversation, then a fresh instance is created.
  const [runSeed, setRunSeed] = useState(0);
  const surfaceKey = useMemo(
    () => `agent-app:${app.id}${runSeed > 0 ? `:r${runSeed}` : ""}`,
    [app.id, runSeed],
  );

  const agentAppCtx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    surfaceKey,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? true,
    showVariablePanel: config.showVariablePanel,
    variablesPanelStyle: config.variableInputStyle,
    showPreExecutionGate: config.showPreExecutionGate,
    preExecutionMessage: config.preExecutionMessage,
    showDefinitionMessages: config.showDefinitionMessages,
    showDefinitionMessageContent: config.showDefinitionMessageContent,
    hideReasoning: config.hideReasoning,
    hideToolResults: config.hideToolResults,
    inputPlaceholder: config.inputPlaceholder,
    showFreeformInput: config.showFreeformInput,
    showAttachments: config.showAttachments,
    showMicrophone: config.showMicrophone,
    showUserMessageOptions: config.showUserMessageOptions,
    showAssistantMessageOptions: config.showAssistantMessageOptions,
    bufferStream: config.bufferStream,
  });

  if (!agentAppCtx.conversationId) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Pre-execution gate (Tier-2). Same pattern as the form-to-result shell.
  const gateOverridden = overrides["preExecutionGate"] === "custom";
  if (gateOverridden && !gateDismissed) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <SlotRenderer
            slot="preExecutionGate"
            overrides={app.slot_overrides}
            code={app.slot_code}
            allowedImports={app.allowed_imports}
            appName={app.name}
            fallback={
              ChatDefaultPreGate as unknown as React.ComponentType<
                Record<string, unknown>
              >
            }
            props={{
              ...agentAppCtx,
              app,
              onContinue: () => setGateDismissed(true),
            } as unknown as Record<string, unknown>}
          />
        </div>
      </div>
    );
  }

  return (
    <ChatShellLayout
      historyView={config.historyView}
      agentId={app.agent_id}
      appId={app.id}
      appName={app.name}
      surfaceKey={agentAppCtx.surfaceKey}
      activeConversationId={agentAppCtx.conversationId}
      onNewConversation={() => setRunSeed((s) => s + 1)}
    >
      <AgentRunner
        conversationId={agentAppCtx.conversationId}
        surfaceKey={agentAppCtx.surfaceKey}
        compact={config.compact}
        showTitle={false}
      />
    </ChatShellLayout>
  );
}

interface ChatShellLayoutProps {
  historyView?: AgentAppShellConfigCommon["historyView"];
  agentId: string;
  appId: string;
  appName: string;
  surfaceKey: string;
  activeConversationId: string | null;
  onNewConversation: () => void;
  children: React.ReactNode;
}

function ChatShellLayout({
  historyView,
  agentId,
  appId,
  appName,
  surfaceKey,
  activeConversationId,
  onNewConversation,
  children,
}: ChatShellLayoutProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const agentIds = useMemo(
    () => (historyView === "all" ? [] : [agentId]),
    [historyView, agentId],
  );

  const sidebarEnabled = historyView === "app" || historyView === "all";
  const showSidebar = sidebarEnabled && sidebarOpen;

  const handleNewConversation = useCallback(() => {
    // Drop the old instance's focus + memory. The surfaceKey bump in
    // the parent then mints a fresh instance.
    if (activeConversationId) {
      dispatch(destroyInstance(activeConversationId));
    }
    dispatch(clearFocus(surfaceKey));
    onNewConversation();
  }, [activeConversationId, surfaceKey, dispatch, onNewConversation]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header bar — back / app name / collapse / new conversation.
          Sits ABOVE the sidebar so it stays visible when the sidebar
          is collapsed. */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2 bg-card/50">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => router.back()}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0 text-sm font-medium truncate px-1">
          {appName}
        </div>
        {sidebarEnabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Collapse sidebar" : "Show sidebar"}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleNewConversation}
          title="New conversation"
          aria-label="New conversation"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Row: optional sidebar + content. */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showSidebar && (
          <aside className="hidden lg:block w-[260px] flex-shrink-0 border-r border-border bg-card overflow-y-auto">
            <ConversationHistorySidebar
              scopeId={`agent-app:${appId}:${historyView}`}
              agentIds={agentIds}
              activeConversationId={activeConversationId}
              onOpenConversation={(conv) =>
                void dispatch(
                  loadConversation({
                    conversationId: conv.conversationId,
                    surfaceKey,
                  }),
                )
              }
            />
          </aside>
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full max-w-[800px] mx-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface DefaultSlotProps extends UseAgentAppReturn {
  app: PublicAgentApp;
  onContinue?: () => void;
}

function ChatDefaultPreGate({ onContinue, app }: DefaultSlotProps) {
  return (
    <div className="max-w-md mx-auto p-6 rounded-lg border border-border bg-card">
      <h2 className="text-lg font-semibold mb-2">{app.name ?? "Welcome"}</h2>
      <Button onClick={onContinue} size="sm">
        Continue
      </Button>
    </div>
  );
}
