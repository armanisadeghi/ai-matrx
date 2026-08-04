"use client";

/**
 * AgentLauncherSidebarTester
 *
 * Collapsible run-panel sidebar that re-launches the current conversation's
 * agent into any display mode with full option control. Shares the settings
 * UI with `AgentWidgetInvokerTester` via `TesterSettingsPanel`.
 */

import { useState } from "react";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAgentLauncherTester } from "@/features/agents/hooks/useAgentLauncherTester";
import {
  getAllDisplayTypes,
  getDisplayMeta,
} from "@/features/agents/utils/run-ui-utils";
import { ChevronDown, TestTube2, TestTube } from "lucide-react";
import { AgentExecutionTestModal } from "./AgentExecutionTestModal";
import { TesterSettingsPanel } from "./TesterSettingsPanel";

interface AgentLauncherSidebarTesterProps {
  conversationId: string;
  surfaceKey: string;
}

export function AgentLauncherSidebarTester({
  conversationId,
  surfaceKey,
}: AgentLauncherSidebarTesterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tester = useAgentLauncherTester(
    conversationId,
    "agents-other",
    surfaceKey,
  );

  const displayTypes = getAllDisplayTypes().map((displayMode) => {
    const meta = getDisplayMeta(displayMode);
    const IconComponent = getIconComponent(meta.icon);
    return {
      name: meta.label,
      icon: IconComponent,
      color: meta.color,
      displayMode,
      note: meta.description,
      testMode: meta.testMode,
    };
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-7 px-2 text-xs"
          >
            <div className="flex items-center gap-1.5">
              <TestTube2 className="w-3.5 h-3.5" />
              <span>Test Display Modes</span>
            </div>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 py-1">
        <Separator />

        {/* Shared settings panel */}
        <div className="px-2">
          <TesterSettingsPanel
            controller={tester}
            quickTest={{
              applyVariables: tester.applyVariables,
              setApplyVariables: tester.setApplyVariables,
              applyUserInput: tester.applyUserInput,
              setApplyUserInput: tester.setApplyUserInput,
              applyAppContext: tester.applyAppContext,
              setApplyAppContext: tester.setApplyAppContext,
            }}
            idPrefix="launcher-sidebar"
          />
        </div>

        <Separator />

        {/* Display Type Buttons (vertical list — sidebar style) */}
        <div className="space-y-0 px-1">
          {displayTypes.map((display) => (
            <Button
              key={display.displayMode}
              variant="ghost"
              size="sm"
              onClick={() => tester.openWithDisplayType(display.displayMode)}
              className="w-full justify-start h-8 px-2 text-xs hover:bg-accent"
              title={display.note}
            >
              {display.icon && (
                <display.icon
                  className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${display.color}`}
                />
              )}
              <span className="flex-1 text-left font-medium">
                {display.name}
              </span>
              {display.testMode && (
                <Badge variant="outline" className="text-[8px] h-4 px-1">
                  <TestTube className="w-2.5 h-2.5" />
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </CollapsibleContent>

      {tester.instance && (
        <AgentExecutionTestModal
          surfaceKey={surfaceKey}
          isOpen={tester.testModalOpen}
          onClose={() => tester.setTestModalOpen(false)}
          testType={tester.testModalType}
          agentId={tester.instance.agentId}
          sourceInstanceId={conversationId}
          autoRun={tester.autoRun}
          allowChat={tester.allowChat}
          showVariables={tester.showVariablePanel}
          applyVariables={tester.applyVariables}
          apiEndpointMode={tester.apiEndpointMode}
          variablesPanelStyle={tester.variablesPanelStyle}
          variables={tester.applyVariables ? tester.currentVariables : {}}
          userInput={
            tester.applyUserInput && tester.currentInput
              ? tester.currentInput
              : ""
          }
        />
      )}
    </Collapsible>
  );
}
