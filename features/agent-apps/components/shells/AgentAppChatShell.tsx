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

import { useState } from "react";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
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

  // Wrap AgentRunner in a block-level centered container.
  //
  // AgentRunner internals are `relative h-full max-w-[800px]` with
  // children positioned absolutely — it has no intrinsic width. In a
  // `flex justify-center` parent it collapses to 0 width (a flex item
  // with no explicit width and absolute-only children). The fix is a
  // plain block container with `mx-auto` — block elements claim full
  // width up to `max-w-`, then center themselves horizontally.
  //
  // `showTitle` defaults to FALSE because the run-page header already
  // shows the app name. Embeds with no outer chrome opt in via
  // shell_config.hideTitle === false.
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full max-w-[800px] mx-auto">
        <AgentRunner
          conversationId={agentAppCtx.conversationId}
          surfaceKey={agentAppCtx.surfaceKey}
          compact={config.compact}
          showTitle={config.hideTitle === false}
        />
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
