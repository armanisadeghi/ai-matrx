"use client";

/**
 * Canonical shared-request composer for locked-axis Agent Battle modes.
 *
 * The backing conversation is a cache-only execution instance. Submit All
 * copies its complete request draft into each result column before launch.
 */

import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";

interface SharedBattleInputProps {
  conversationId: string | null | undefined;
  surfaceKey: string;
  description?: string;
}

export function SharedBattleInput({
  conversationId,
  surfaceKey,
  description = "Use Submit All in the toolbar to run every column.",
}: SharedBattleInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-foreground">
          Shared request
        </span>
        <span className="text-[10px] text-muted-foreground">{description}</span>
      </div>
      <SmartAgentInput
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        sendButtonVariant="blue"
        showSendButton={false}
        showSubmitOnEnterToggle={false}
        disableSend
        variablesPanelStyle="inline"
      />
    </div>
  );
}
