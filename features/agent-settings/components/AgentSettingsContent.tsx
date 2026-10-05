"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ModelSelectorRow } from "./ModelSelectorRow";
import { LLMParamsGrid } from "./LLMParamsGrid";
import { ToolSelectorPanel } from "./ToolSelectorPanel";
import { VariableDefaultsEditor } from "./VariableDefaultsEditor";
import { ModelSwitchConflictDialog } from "./ModelSwitchConflictDialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAvailableTools,
  selectIsLoadingTools,
} from "@ai-matrx/chat/agents/redux/agent-settings/selectors";
import { fetchAvailableTools } from "@ai-matrx/chat/agents/redux/agent-settings/agentSettingsSlice";

function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

interface AgentSettingsContentProps {
  agentId: string;
  /** Variable names used in messages/system (for unused-variable warnings) */
  usedVariableNames?: Set<string>;
  /** Show the tools section */
  showTools?: boolean;
  /** Show the variables section */
  showVariables?: boolean;
  /** Show model parameter controls */
  showParams?: boolean;
}

export function AgentSettingsContent({
  agentId,
  usedVariableNames,
  showTools = true,
  showVariables = true,
  showParams = true,
}: AgentSettingsContentProps) {
  const dispatch = useAppDispatch();
  const availableTools = useAppSelector(selectAvailableTools);
  const isLoadingTools = useAppSelector(selectIsLoadingTools);

  // Fetch tools once if not already loaded
  useEffect(() => {
    if (availableTools.length === 0 && !isLoadingTools) {
      dispatch(fetchAvailableTools());
    }
  }, [dispatch, availableTools.length, isLoadingTools]);

  const [showSettingsExpanded, setShowSettingsExpanded] = useState(false);

  return (
    <>
      {/* The conflict dialog is always mounted — it self-shows when pendingSwitch is set */}
      <ModelSwitchConflictDialog agentId={agentId} />

      <div className="divide-y divide-border/40">
        {/* Model Section */}
        <CollapsibleSection label="Model" defaultOpen>
          <ModelSelectorRow
            agentId={agentId}
            onSettingsClick={() => setShowSettingsExpanded((v) => !v)}
            showSettingsBadges={!showSettingsExpanded}
          />
        </CollapsibleSection>

        {/* LLM Parameters Section */}
        {showParams && (
          <CollapsibleSection
            label="Parameters"
            defaultOpen={showSettingsExpanded}
          >
            <LLMParamsGrid agentId={agentId} />
          </CollapsibleSection>
        )}

        {/* Tools Section */}
        {showTools && (
          <CollapsibleSection label="Tools" defaultOpen={false}>
            <ToolSelectorPanel
              agentId={agentId}
              availableTools={availableTools}
            />
          </CollapsibleSection>
        )}

        {/* Variables Section */}
        {showVariables && (
          <CollapsibleSection label="Variables" defaultOpen={false}>
            <VariableDefaultsEditor
              agentId={agentId}
              usedVariableNames={usedVariableNames}
            />
          </CollapsibleSection>
        )}
      </div>
    </>
  );
}
