"use client";

/**
 * AgentModelConfiguration
 *
 * Model selector row with inline controls (Settings, Variables, Tools, Skills).
 * Uses the canonical ModelListDropdown — data fetching (catalog + offerings) is
 * fully internal to the picker (useModelCatalog); super admins get an in-place
 * admin-variant toggle inside the dropdown itself. All writes go through Redux.
 */

import { useRef } from "react";
import { withOfferingPin } from "@/features/ai-models/utils/offering-pin";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentModelId,
  selectAgentModelMissing,
  selectAgentSettings,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  setAgentField, setAgentSettings,
} from "@/features/agents/redux/agent-builder.slice";
import type {
  FeLlmParams,
  LLMParams,
} from "@ai-matrx/chat/agents/types/agent-api-types";
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";
import { AgentVariablesModal } from "@/features/agents/components/variables-management/AgentVariablesModal";
import { AgentToolsModal } from "@/features/agents/components/tools-management/AgentToolsModal";
import { AgentSkillsButton } from "@/features/agents/components/skills-management/AgentSkillsButton";
import { Label } from "@/components/ui/label";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { cn } from "@/lib/utils";

interface AgentModelConfigurationProps {
  agentId: string;
}

export function AgentModelConfiguration({
  agentId,
}: AgentModelConfigurationProps) {
  const dispatch = useAppDispatch();
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  const modelMissing = useAppSelector((state) =>
    selectAgentModelMissing(state, agentId),
  );
  // Agent settings blob — offering_id (the Service pin) lives here alongside
  // temperature etc., persisted through the exact same save path (setAgentSettings
  // marks the record dirty → saveAgent/saveAgentField writes agent.definition.settings).
  const settings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );
  const pinnedOfferingId =
    (settings as FeLlmParams | null)?.offering_id ?? null;

  // The picker reports the class (offering pin) and the model in one click.
  // Both are parked for that click and committed together: the new model
  // runs on the class picked with it, or on none — never the old model's
  // class (ai.resolve_model_config refuses that pair with P0002).
  const clickRef = useRef<{
    modelId?: string;
    pin?: { offeringId: string | undefined };
  } | null>(null);

  const parkForClick = (update: {
    modelId?: string;
    pin?: { offeringId: string | undefined };
  }) => {
    if (!clickRef.current) {
      clickRef.current = {};
      queueMicrotask(() => {
        const click = clickRef.current;
        clickRef.current = null;
        if (!click) return;
        if (click.modelId) {
          dispatch(
            setAgentField({ id: agentId, field: "modelId", value: click.modelId }),
          );
        }
        const current = (settings ?? {}) as Record<string, unknown>;
        if (!click.pin && current.offering_id == null) return;
        // Same FeLlmParams → LLMParams cast used at every setAgentSettings call
        // site (see AgentSettingsCore).
        dispatch(
          setAgentSettings({
            id: agentId,
            settings: withOfferingPin(current, click.pin?.offeringId) as LLMParams,
          }),
        );
      });
    }
    Object.assign(clickRef.current, update);
  };

  const handleModelChange = (newModelId: string) => {
    if (!newModelId || newModelId === modelId) return;
    parkForClick({ modelId: newModelId });
  };

  /**
   * Pin/unpin the exact ai.offering the agent's calls route through.
   * `undefined` = "Auto (preferred)" — the key is REMOVED from settings (never
   * stored as null/undefined) so the server picks the preferred offering.
   */
  const handleOfferingPinChange = (offeringId: string | undefined) => {
    // Loud guard: settings === null means the agent record hasn't hydrated —
    // writing `{ offering_id }` over it would silently drop every real
    // setting on save (same round-trip bug AgentSettingsCore guards against).
    if (settings === null) {
      console.error(
        `[AgentModelConfiguration] Refused to pin offering ${String(
          offeringId,
        )} — agent ${agentId} settings not hydrated yet; the write would clobber existing settings.`,
      );
      return;
    }
    parkForClick({ pin: { offeringId } });
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className={cn(
          "flex items-center gap-3 min-w-0 rounded-md px-1.5 py-0.5 transition-colors",
          modelMissing && "ring-1 ring-yellow-400 dark:ring-yellow-500",
        )}
      >
        <Label
          className={cn(
            "text-xs shrink-0",
            modelMissing
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-gray-600 dark:text-gray-400",
          )}
          title={
            modelMissing ? "A model is required to run this agent" : undefined
          }
        >
          Model
        </Label>
        <ModelListDropdown
          value={modelId}
          onValueChange={handleModelChange}
          inputModalities={[]}
          outputModalities={["text"]}
          // An agent is not necessarily a conversation: a message carrying a
          // Questions part is answered by a decision holder that writes no
          // text. The `agent` purpose admits both contracts and the picker
          // labels the decision rows; `chat` would hide them entirely.
          selectionPurpose="agent"
          pinnedOfferingId={pinnedOfferingId}
          onOfferingPinChange={handleOfferingPinChange}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <AgentSettingsModal agentId={agentId} />
        <AgentVariablesModal agentId={agentId} />
        <AgentToolsModal agentId={agentId} />
        <AgentSkillsButton agentId={agentId} />
      </div>
    </div>
  );
}
