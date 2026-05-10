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

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import { AgentRunner } from "@/features/agents/components/smart/AgentRunner";
import {
  setAutoRun,
  setAllowChat,
  setShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
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
  const dispatch = useAppDispatch();
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const overrides = (app.slot_overrides ?? {}) as Record<
    string,
    string | undefined
  >;
  const [gateDismissed, setGateDismissed] = useState(false);

  const agentAppCtx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? true,
  });

  // Push shell_config settings into the per-instance UI state so
  // AgentRunner's selectors see them.
  useEffect(() => {
    if (!agentAppCtx.conversationId) return;
    const cid = agentAppCtx.conversationId;
    if (config.autoRun != null) {
      dispatch(setAutoRun({ conversationId: cid, autoRun: config.autoRun }));
    }
    if (config.allowChat != null) {
      dispatch(
        setAllowChat({ conversationId: cid, allowChat: config.allowChat }),
      );
    }
    // Apps almost always want the variables panel visible up-front.
    dispatch(setShowVariablePanel({ conversationId: cid, show: true }));
  }, [
    dispatch,
    agentAppCtx.conversationId,
    config.autoRun,
    config.allowChat,
  ]);

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

  return (
    <AgentRunner
      conversationId={agentAppCtx.conversationId}
      surfaceKey={agentAppCtx.surfaceKey}
      compact={config.compact}
      showTitle={!config.hideTitle}
    />
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
