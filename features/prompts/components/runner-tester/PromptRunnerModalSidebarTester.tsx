"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectInstance,
  selectMergedVariables,
  selectResources,
  selectCurrentInput,
} from "@/lib/redux/prompt-execution/selectors";
import { useProgrammaticPromptExecution } from "../../hooks/useProgrammaticPromptExecution";
import PromptExecutionTestModal from "./PromptExecutionTestModal";
import type { ResultDisplay } from "@/features/prompt-builtins/types/execution-modes";
import {
  getAllDisplayTypes,
  getDisplayMeta,
} from "@/features/prompt-builtins/types/execution-modes";
import {
  ChevronDown,
  Zap,
  Eye,
  Settings,
  TestTube2,
  Play,
  TestTube,
  Database,
  Minimize2,
} from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";

interface PromptRunnerModalSidebarTesterProps {
  runId?: string;
}

/**
 * Comprehensive testing component for ALL ResultDisplay types
 * Demonstrates programmatic execution by reading REAL data from current run
 * and executing prompts programmatically - proving the Redux architecture works correctly.
 *
 * KEY CONCEPT:
 * This component proves that EVERYTHING the UI can do can be replicated programmatically.
 * It uses ONLY Redux selectors and programmatic APIs - no prompt data prop drilling needed.
 */
export function PromptRunnerModalSidebarTester({
  runId,
}: PromptRunnerModalSidebarTesterProps) {
  const { executePrompt } = useProgrammaticPromptExecution();
  const [isOpen, setIsOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testModalType, setTestModalType] = useState<
    "direct" | "inline" | "background"
  >("direct");

  // Execution config toggles (user controls)
  const [autoRun, setAutoRun] = useState(true);
  const [allowChat, setAllowChat] = useState(true);
  const [showVariables, setShowVariables] = useState(false);
  const [applyVariables, setApplyVariables] = useState(true);
  const [trackInRuns, setTrackInRuns] = useState(true);
  const [usePreExecutionInput, setUsePreExecutionInput] = useState(false);

  const instance = useAppSelector((state) =>
    runId ? selectInstance(state, runId) : null,
  );
  const currentVariables = useAppSelector((state) =>
    selectMergedVariables(state, runId || ""),
  );
  const currentResources = useAppSelector((state) =>
    selectResources(state, runId || ""),
  );
  const currentInput = useAppSelector((state) =>
    selectCurrentInput(state, runId || ""),
  );

  const openWithDisplayType = async (resultDisplay: ResultDisplay) => {
    if (!instance) {
      console.warn("No active run instance - cannot test display type");
      return;
    }

    // For direct, inline, background - open test modal
    if (
      resultDisplay === "direct" ||
      resultDisplay === "inline" ||
      resultDisplay === "background"
    ) {
      setTestModalType(resultDisplay);
      setTestModalOpen(true);
      return;
    }

    try {
      await executePrompt({
        // Prompt identification (from Redux, not props!)
        promptId: instance.promptId,
        promptSource: instance.promptSource,

        // Complete execution config (from user's test settings)
        executionConfig: {
          result_display: resultDisplay,
          auto_run: autoRun,
          allow_chat: allowChat,
          show_variables: showVariables,
          apply_variables: applyVariables,
          track_in_runs: trackInRuns,
          use_pre_execution_input: usePreExecutionInput, // Use core system
        },

        // Current state from Redux (mimicking programmatic usage)
        variables: applyVariables ? currentVariables : {},
        resources: currentResources,
        initialMessage: currentInput,

        // DO NOT pass runId - creates a new independent run
        // This proves programmatic execution works identically to UI
      });
    } catch (error) {
      console.error("❌ Programmatic execution failed:", error);
    }
  };

  // Get all display types from single source of truth
  const displayTypes = getAllDisplayTypes().map((resultDisplay) => {
    const meta = getDisplayMeta(resultDisplay);
    // Get icon component from lucide-react dynamically
    const IconComponent = (props: any) => <DynamicIcon name={meta.icon} {...props} />;

    return {
      name: meta.label,
      icon: IconComponent,
      color: meta.color,
      resultDisplay,
      note: meta.description,
      testMode: meta.testMode,
    };
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="p-2 space-y-2">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-7 px-2 text-xs"
          >
            <div className="flex items-center gap-1.5">
              <TestTube2 className="w-3.5 h-3.5" />
              <span>Test Display Types</span>
            </div>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-2">
          {/* Pre-Execution Input Toggle */}
          <div className="space-y-2 pr-2 pl-4 pb-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="use-pre-execution"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Use Pre-Execution Input
              </Label>
              <Switch
                id="use-pre-execution"
                checked={usePreExecutionInput}
                onCheckedChange={setUsePreExecutionInput}
              />
            </div>
          </div>

          <Separator />

          {/* Execution Config Toggles */}
          <div className="space-y-2 pr-2 pl-4">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="auto-run"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Auto Run
              </Label>
              <Switch
                id="auto-run"
                checked={autoRun}
                onCheckedChange={setAutoRun}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="allow-chat"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                Allow Chat
              </Label>
              <Switch
                id="allow-chat"
                checked={allowChat}
                onCheckedChange={setAllowChat}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="show-variables"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Show Variables
              </Label>
              <Switch
                id="show-variables"
                checked={showVariables}
                onCheckedChange={setShowVariables}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="apply-variables"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Apply Variables
              </Label>
              <Switch
                id="apply-variables"
                checked={applyVariables}
                onCheckedChange={setApplyVariables}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="track-in-runs"
                className="flex items-center gap-1.5 text-xs cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                Track in Runs
              </Label>
              <Switch
                id="track-in-runs"
                checked={trackInRuns}
                onCheckedChange={setTrackInRuns}
              />
            </div>
          </div>

          <Separator />

          {/* Display Type Buttons */}
          <div className="space-y-1">
            <div className="space-y-0 px-1">
              {displayTypes.map((display) => (
                <Button
                  key={display.resultDisplay}
                  variant="ghost"
                  size="sm"
                  onClick={() => openWithDisplayType(display.resultDisplay)}
                  className="w-full justify-start h-8 px-2 text-xs hover:bg-accent"
                  title={display.note}
                >
                  <display.icon
                    className={`w-3.5 h-3.5 mr-2 flex-shrink-0 ${display.color}`}
                  />
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
          </div>
        </CollapsibleContent>
      </div>

      {/* Test Modal for Direct/Inline/Background */}
      {instance && (
        <PromptExecutionTestModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          testType={testModalType}
          promptId={instance.promptId}
          promptSource={instance.promptSource}
          executionConfig={{
            result_display: testModalType,
            auto_run: autoRun,
            allow_chat: allowChat,
            show_variables: showVariables,
            apply_variables: applyVariables,
            track_in_runs: trackInRuns,
            use_pre_execution_input: usePreExecutionInput,
          }}
          variables={applyVariables ? currentVariables : {}}
          resources={currentResources}
          initialMessage={currentInput}
        />
      )}
    </Collapsible>
  );
}
