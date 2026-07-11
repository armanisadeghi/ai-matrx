"use client";

/**
 * AgentModelConfiguration
 *
 * Model selector row with inline controls (Settings, Variables, Tools, Skills).
 * Uses the canonical ModelListDropdown — data fetching (catalog + offerings) is
 * fully internal to the picker (useModelCatalog); super admins get an in-place
 * admin-variant toggle inside the dropdown itself. All writes go through Redux.
 */

import { useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentModelId,
  selectAgentModelMissing,
  selectAgentSettings,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentField,
  setAgentSettings,
} from "@/features/agents/redux/agent-definition/slice";
import type {
  FeLlmParams,
  LLMParams,
} from "@/features/agents/types/agent-api-types";
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";
import { AgentVariablesModal } from "@/features/agents/components/variables-management/AgentVariablesModal";
import { AgentToolsModal } from "@/features/agents/components/tools-management/AgentToolsModal";
import { AgentSkillsModal } from "@/features/agents/components/skills-management/AgentSkillsModal";
import { Label } from "@/components/ui/label";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
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

  const handleModelChange = useCallback(
    (newModelId: string) => {
      dispatch(
        setAgentField({ id: agentId, field: "modelId", value: newModelId }),
      );
    },
    [agentId, dispatch],
  );

  /**
   * Pin/unpin the exact ai.offering the agent's calls route through.
   * `undefined` = "Auto (preferred)" — the key is REMOVED from settings (never
   * stored as null/undefined) so the server picks the preferred offering.
   * Same save path as every other setting (temperature, top_p, ...).
   */
  const handleOfferingPinChange = useCallback(
    (offeringId: string | undefined) => {
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
      const next: Record<string, unknown> = {
        ...(settings as Record<string, unknown>),
      };
      if (offeringId === undefined) {
        delete next.offering_id;
      } else {
        next.offering_id = offeringId;
      }
      // Same FeLlmParams → LLMParams cast used at every setAgentSettings call
      // site (see AgentSettingsCore) — the FE superset isn't structurally
      // identical to the backend contract.
      dispatch(
        setAgentSettings({ id: agentId, settings: next as LLMParams }),
      );
    },
    [agentId, dispatch, settings],
  );

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
          pinnedOfferingId={pinnedOfferingId}
          onOfferingPinChange={handleOfferingPinChange}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <AgentSettingsModal agentId={agentId} />
        <AgentVariablesModal agentId={agentId} />
        <AgentToolsModal agentId={agentId} />
        <AgentSkillsModal agentId={agentId} />
      </div>
    </div>
  );
}
