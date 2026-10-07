"use client";

/**
 * AgentInlineControls
 *
 * Thin toolbar rendered next to the model picker in the builder.
 * Contains three icon buttons: Variables, Tools, Settings.
 * Each opens its own modal.
 *
 * Usage:
 *   <AgentInlineControls agentId={agentId} availableTools={tools} />
 */

import { AgentVariablesModal } from "../../variables-management/AgentVariablesModal";
import { AgentToolsModal } from "../../tools-management/AgentToolsModal";
import { AgentSettingsModal } from "../AgentSettingsModal";
import {
  setAgentField, setAgentSettings,
} from "@/features/agents/redux/agent-builder.slice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentModelId,
  selectAgentSettings,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { useCallback } from "react";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { withOfferingPin } from "@/features/ai-models/utils/offering-pin";
import { Label } from "@/components/ui/label";
import type { DatabaseTool } from "@/utils/supabase/tools-service";

interface AgentInlineControlsProps {
  agentId: string;
  availableTools?: DatabaseTool[];
}

export function AgentInlineControls({
  agentId,
  availableTools = [],
}: AgentInlineControlsProps) {
  const dispatch = useAppDispatch();
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  // offering_id (the class pin) lives in agent settings beside temperature
  // etc. — same store and save path as AgentModelConfiguration.
  const settings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );

  const handleModelChange = useCallback(
    (newModelId: string) => {
      dispatch(
        setAgentField({ id: agentId, field: "modelId", value: newModelId }),
      );
    },
    [agentId, dispatch],
  );

  const handleOfferingPinChange = useCallback(
    (offeringId: string | undefined) => {
      // settings === null → record not hydrated; writing would clobber it.
      if (settings === null) {
        console.error(
          `[AgentInlineControls] Refused to pin offering ${String(offeringId)} — agent ${agentId} settings not hydrated yet.`,
        );
        return;
      }
      dispatch(
        setAgentSettings({
          id: agentId,
          settings: withOfferingPin(settings, offeringId),
        }),
      );
    },
    [agentId, dispatch, settings],
  );

  return (
    <div className="flex items-center">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-gray-600 dark:text-gray-400">
          Model
        </Label>
        <ModelListDropdown
          value={modelId}
          onValueChange={handleModelChange}
          inputModalities={[]}
          pinnedOfferingId={settings?.offering_id}
          onOfferingPinChange={handleOfferingPinChange}
        />
      </div>
      <AgentVariablesModal agentId={agentId} />
      <AgentToolsModal agentId={agentId} />
      <AgentSettingsModal agentId={agentId} />
    </div>
  );
}
