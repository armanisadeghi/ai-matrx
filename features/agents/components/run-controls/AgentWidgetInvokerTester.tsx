import { AgentExecutionTestModal } from "./AgentExecutionTestModal";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import {
  getAllDisplayTypes,
  getDisplayMeta,
} from "@/features/agents/utils/run-ui-utils";
import { useAgentLauncherTester } from "@/features/agents/hooks/useAgentLauncherTester";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import { TesterSettingsPanel } from "./TesterSettingsPanel";

// =============================================================================
// Widget invoker test harness
//
// Borrows state from the active conversation and re-launches the same agent
// into each display-mode widget. Every launch gets its own unique surfaceKey
// so parallel widgets coexist without focus-registry collisions.
// =============================================================================

export function AgentWidgetInvokerTester({
  conversationId,
  sourceFeature,
  surfaceKey,
}: {
  conversationId: string;
  sourceFeature: SourceFeature;
  surfaceKey: string;
}) {
  const tester = useAgentLauncherTester(
    conversationId,
    sourceFeature,
    surfaceKey,
  );

  const displayTypes = getAllDisplayTypes().map((displayMode) => {
    const meta = getDisplayMeta(displayMode);
    const IconComponent = (props: any) => <DynamicIcon name={meta.icon} {...props} />;
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
    <div className="flex flex-col sm:flex-row h-full w-full min-w-0 overflow-y-auto sm:overflow-hidden">
      <div className="w-full sm:w-[230px] shrink-0 border-b sm:border-b-0 sm:border-r border-border sm:overflow-y-auto">
        <div className="p-2">
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
            idPrefix="widget-test"
          />
        </div>
      </div>

      {/* Right side: Display Mode grid */}
      <div className="flex-1 min-w-0 sm:overflow-y-auto">
        <div className="p-2 flex flex-wrap content-start gap-2 justify-center sm:justify-start">
          {displayTypes.map((display) => (
            <button
              key={display.displayMode}
              onClick={() => tester.openWithDisplayType(display.displayMode)}
              title={display.note}
              className="flex flex-col items-center justify-center gap-1.5 w-[84px] h-[84px] bg-muted/10 hover:bg-muted/30 border border-transparent hover:border-border rounded-xl transition-all shrink-0"
            >
              {display.icon && (
                <display.icon className={`w-7 h-7 ${display.color}`} />
              )}
              <span className="text-[10px] text-center leading-tight line-clamp-2 break-words w-full p-1">
                {display.name}
              </span>
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
