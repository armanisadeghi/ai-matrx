"use client";

/**
 * Canonical shared-request composer for locked-axis Agent Battle modes.
 *
 * The backing conversation is a cache-only execution instance. Submit All
 * copies its complete request draft into each result column before launch.
 */

import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import type { SmartAgentInputSurfaceValueAnchors } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectMountedBattleSetId } from "./activeBattleColumns";

interface SharedBattleInputProps {
  conversationId: string | null | undefined;
  surfaceKey: string;
  description?: string;
  showHeading?: boolean;
  surfaceValueAnchors?: SmartAgentInputSurfaceValueAnchors;
}

export function SharedBattleInput({
  conversationId,
  surfaceKey,
  description = "Use Submit All in the toolbar to run every column.",
  showHeading = true,
  surfaceValueAnchors,
}: SharedBattleInputProps) {
  // The unsent draft belongs to THIS battle: a saved battle keeps its own key,
  // an unsaved one the mode's "new" key. One surface key for every battle let
  // a saved battle's request reappear in the next new battle as "your draft".
  const setId = useAppSelector(selectMountedBattleSetId);
  const draftAlias = `${surfaceKey}:${setId ?? "new"}`;
  return (
    <div className="space-y-1.5">
      {showHeading && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold text-foreground">
            Shared request
          </span>
          <span className="text-[10px] text-muted-foreground">
            {description}
          </span>
        </div>
      )}
      <SmartAgentInput
        conversationId={conversationId}
        surfaceKey={surfaceKey}
        draftAlias={draftAlias}
        sendButtonVariant="blue"
        showSendButton={false}
        showSubmitOnEnterToggle={false}
        disableSend
        variablesPanelStyle="inline"
        surfaceValueAnchors={surfaceValueAnchors}
      />
    </div>
  );
}
