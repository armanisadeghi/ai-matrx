"use client";

/**
 * AgentAppChatShell — Tier-0/1 default shell.
 *
 * Mounts the universal AgentRunner with history sidebar, Smart Input
 * (variables + resources + textarea), and the message-display column —
 * exactly the same composition `/agents/[id]/run` uses. With zero config
 * an app on this shell is functionally identical to the agent runner.
 *
 * Tier-1 settings (shell_config) flow into the per-instance UI state so
 * AgentRunner's existing selectors honour them automatically.
 *
 * Tier-2 slot overrides for chat are sparse today — most users that want
 * heavy customisation pick `form_to_result` or `fully_custom`. When
 * overrides ARE present we still hand off to AgentRunner; the override
 * surface for chat will land alongside AgentRunner's own slot hooks in a
 * follow-up. Until then, the override is recorded but no-op'd, which is
 * better than silently dropping it.
 */

import { useMemo, useState } from "react";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import { useAppDispatch } from "@/lib/redux/hooks";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";
import { SlotRenderer } from "./SlotRenderer";
import type { UseAgentAppReturn } from "@/features/agent-apps/hooks/useAgentApp";
import { Button } from "@/components/ui/button";

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

  // Pass shell_config straight through to the hook. The hook forwards
  // these into the launcher's `config` so they're set at instance
  // creation time — no post-create dispatches needed.
  const agentAppCtx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
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
            fallback={ChatDefaultPreGate}
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

  // AgentRunner shows the app's identity in the CENTER hero
  // (AgentEmptyMessageDisplay). We never draw an additional title bar —
  // duplicating the app name above the centered hero is the bug the
  // user has called out multiple times.
  //
  // History sidebar honours `historyView`:
  //   - "hidden" → no sidebar
  //   - "app"    → conversations powered by this app's agent
  //   - "all"    → every conversation accessible to the user
  return (
    <ChatShellLayout
      historyView={config.historyView}
      agentId={app.agent_id}
      appId={app.id}
      surfaceKey={agentAppCtx.surfaceKey}
      activeConversationId={agentAppCtx.conversationId}
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
  surfaceKey: string;
  activeConversationId: string | null;
  children: React.ReactNode;
}

function ChatShellLayout({
  historyView,
  agentId,
  appId,
  surfaceKey,
  activeConversationId,
  children,
}: ChatShellLayoutProps) {
  const dispatch = useAppDispatch();
  const agentIds = useMemo(
    () => (historyView === "all" ? [] : [agentId]),
    [historyView, agentId],
  );

  if (!historyView || historyView === "hidden") {
    return (
      <div className="h-full w-full overflow-hidden">
        <div className="h-full max-w-[800px] mx-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex overflow-hidden">
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
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full max-w-[800px] mx-auto">{children}</div>
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
