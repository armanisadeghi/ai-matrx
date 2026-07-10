"use client";

/**
 * AgentModelConfiguration
 *
 * Model selector row with inline controls (Settings, Variables, Tools, Skills).
 * Uses the canonical SmartModelSelect — data fetching (options + full record) is
 * fully internal to the picker (modelRegistry slice). All writes go through Redux.
 */

import { useCallback, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentModelId,
  selectAgentModelMissing,
} from "@/features/agents/redux/agent-definition/selectors";
import { setAgentField } from "@/features/agents/redux/agent-definition/slice";
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";
import { AgentVariablesModal } from "@/features/agents/components/variables-management/AgentVariablesModal";
import { AgentToolsModal } from "@/features/agents/components/tools-management/AgentToolsModal";
import { AgentSkillsModal } from "@/features/agents/components/skills-management/AgentSkillsModal";
import { Label } from "@/components/ui/label";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import type { ModelCatalogVariant } from "@/features/ai-models/hooks/useModelCatalog";
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
  // TEMP (model-picker Lab): toggle the rich data-validation picker + its
  // user/admin variant. Remove once the ui-bakeoff winner replaces SmartModelSelect.
  const [labVariant, setLabVariant] = useState<ModelCatalogVariant | null>(
    null,
  );

  const handleModelChange = useCallback(
    (newModelId: string) => {
      dispatch(
        setAgentField({ id: agentId, field: "modelId", value: newModelId }),
      );
    },
    [agentId, dispatch],
  );

  return (
    <div className="flex flex-col gap-1">
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
          {labVariant ? (
            <ModelListDropdown
              value={modelId}
              onValueChange={handleModelChange}
              variant={labVariant}
              inputModalities={[]}
              outputModalities={["text"]}
            />
          ) : (
            <SmartModelSelect
              value={modelId}
              onValueChange={handleModelChange}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 pr-2">
          <AgentSettingsModal agentId={agentId} />
          <AgentVariablesModal agentId={agentId} />
          <AgentToolsModal agentId={agentId} />
          <AgentSkillsModal agentId={agentId} />
        </div>
      </div>
      {/* TEMP: model-picker Lab switcher */}
      <div className="flex items-center gap-1 pl-1.5 text-[10px] text-muted-foreground">
        <span className="uppercase tracking-wide opacity-70">Picker lab:</span>
        {(["off", "user", "admin"] as const).map((opt) => {
          const active =
            opt === "off" ? labVariant === null : labVariant === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() =>
                setLabVariant(opt === "off" ? null : (opt as ModelCatalogVariant))
              }
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "hover:text-foreground",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
