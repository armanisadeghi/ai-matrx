/**
 * System Prompt Optimizer Component
 *
 * Provides AI-powered optimization of system prompts with optional guidance
 * and real-time streaming of the improved version.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { submitChatFastAPI as createAndSubmitTask } from "@/lib/redux/socket-io/thunks/submitChatFastAPI";
import {
  selectPrimaryResponseTextByTaskId,
  selectPrimaryResponseEndedByTaskId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { supabase } from "@/utils/supabase/client";
import { v4 as uuidv4 } from "uuid";
import {
  normalizePromptMessagesFromDb,
  normalizePromptSettingsFromDb,
} from "@/features/prompts/utils/normalize-prompt-db-json";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2, Copy, Zap } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePromptsBasePath } from "@/features/prompts/hooks/usePromptsBasePath";
import { createUserPrompt } from "@/lib/redux/thunks/promptCrudThunks";
import { FullPromptOptimizer } from "./FullPromptOptimizer";
import MarkdownStream from "@/components/MarkdownStream";

interface SystemPromptOptimizerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSystemMessage: string;
  onAccept: (optimizedText: string) => void;
  fullPromptObject?: any;
  onAcceptFullPrompt?: (optimizedObject: any) => void;
  onAcceptAsCopy?: (optimizedObject: any) => void;
}

const OPTIMIZER_PROMPT_ID = "6e4e6335-dc04-4946-9435-561352db5b26";

export function SystemPromptOptimizer({
  isOpen,
  onClose,
  currentSystemMessage,
  onAccept,
  fullPromptObject,
  onAcceptFullPrompt,
  onAcceptAsCopy,
}: SystemPromptOptimizerProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const basePath = usePromptsBasePath();

  const [additionalGuidance, setAdditionalGuidance] = useState("");
  const [showGuidanceInput, setShowGuidanceInput] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isFullOptimizerOpen, setIsFullOptimizerOpen] = useState(false);
  const [isSavingCopy, setIsSavingCopy] = useState(false);

  // Watch streaming text - exactly like PromptRunner
  const rawStreamingText = useAppSelector((state) =>
    currentTaskId
      ? selectPrimaryResponseTextByTaskId(currentTaskId)(state)
      : "",
  );

  // Strip a leading <reasoning>...</reasoning> block — models sometimes emit one
  // before the actual response. Only strip when it starts the output; inner
  // reasoning blocks used as content are preserved.
  const streamingText = rawStreamingText.trimStart().startsWith("<reasoning>")
    ? rawStreamingText.replace(/^\s*<reasoning>[\s\S]*?<\/reasoning>\s*/i, "")
    : rawStreamingText;

  const isResponseEnded = useAppSelector((state) =>
    currentTaskId
      ? selectPrimaryResponseEndedByTaskId(currentTaskId)(state)
      : false,
  );

  // Reset when response ends
  useEffect(() => {
    if (isResponseEnded && isOptimizing) {
      setIsOptimizing(false);
    }
  }, [isResponseEnded, isOptimizing]);

  const handleOptimize = async () => {
    if (!currentSystemMessage.trim()) {
      toast.error("No system message to optimize");
      return;
    }

    setIsOptimizing(true);

    try {
      // 1. Fetch prompt
      const { data: prompt, error: promptError } = await supabase
        .from("prompts")
        .select("*")
        .eq("id", OPTIMIZER_PROMPT_ID)
        .single();

      if (promptError || !prompt) {
        throw new Error("Optimizer prompt not found");
      }

      const templateMessages = normalizePromptMessagesFromDb(prompt.messages);
      const templateSettings = normalizePromptSettingsFromDb(prompt.settings);

      // 2. Replace variables in messages
      const messages = templateMessages.map((msg) => {
        let content = msg.content;
        content = content.replace(
          /{{current_system_message}}/g,
          currentSystemMessage,
        );
        if (additionalGuidance.trim()) {
          content = content.replace(
            /{{additional_guidance}}/g,
            additionalGuidance,
          );
        }
        return {
          role: msg.role,
          content,
        };
      });

      // 3. Build chat config
      const modelId = templateSettings.model_id;
      if (!modelId) {
        throw new Error("No model specified in prompt");
      }

      const chatConfig = {
        model_id: modelId,
        messages,
        stream: true,
        ...templateSettings,
      };

      // 4. Submit task — set taskId BEFORE dispatch so streaming UI mounts immediately
      const taskId = uuidv4();
      setCurrentTaskId(taskId);

      await dispatch(
        createAndSubmitTask({
          service: "chat_service",
          taskName: "direct_chat",
          taskData: { chat_config: chatConfig },
          customTaskId: taskId,
        }),
      ).unwrap();
    } catch (error) {
      console.error("Optimization error:", error);
      toast.error("Failed to optimize", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsOptimizing(false);
      setCurrentTaskId(null);
    }
  };

  const handleAccept = () => {
    if (streamingText.trim()) {
      onAccept(streamingText);
      handleClose();
      toast.success("System message updated", {
        description: "The optimized version has been applied",
      });
    }
  };

  const handleSaveAsCopy = async () => {
    if (!streamingText.trim()) {
      toast.error("No optimized text to save");
      return;
    }

    if (!fullPromptObject) {
      toast.error("Cannot save as copy - full prompt data not available");
      return;
    }

    setIsSavingCopy(true);

    try {
      // Prepare the name with " (v2)" suffix
      const newName = `${fullPromptObject.name || "Untitled"} (v2)`;

      // Get all messages and update the system message
      const messages = Array.isArray(fullPromptObject.messages)
        ? [...fullPromptObject.messages]
        : [];

      // Find and update system message, or add it if it doesn't exist
      const systemMessageIndex = messages.findIndex(
        (m: any) => m.role === "system",
      );
      if (systemMessageIndex !== -1) {
        messages[systemMessageIndex] = {
          ...messages[systemMessageIndex],
          content: streamingText,
        };
      } else {
        // Add system message at the beginning if it doesn't exist
        messages.unshift({ role: "system", content: streamingText });
      }

      // Create new prompt data
      const promptData = {
        name: newName,
        description: fullPromptObject.description,
        messages,
        variableDefaults:
          fullPromptObject.variableDefaults ||
          fullPromptObject.variable_defaults ||
          [],
        settings: fullPromptObject.settings || {},
      };

      // Create the new prompt
      const result = await dispatch(
        createUserPrompt(promptData as any),
      ).unwrap();

      if (result?.id) {
        toast.success("Copy created successfully", {
          description: "Opening the new prompt...",
        });
        handleClose();
        // Route to the newly created prompt's edit page
        router.push(`${basePath}/edit/${result.id}`);
      } else {
        throw new Error("Failed to create prompt copy");
      }
    } catch (error) {
      console.error("Error creating prompt copy:", error);
      toast.error("Failed to create copy", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSavingCopy(false);
    }
  };

  const handleClose = () => {
    setCurrentTaskId(null);
    setAdditionalGuidance("");
    setShowGuidanceInput(false);
    setIsOptimizing(false);
    setIsSavingCopy(false);
    onClose();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(streamingText);
    toast.success("Copied to clipboard");
  };

  const hasOptimizedText = streamingText.trim().length > 0;
  const showExperimentalButton = fullPromptObject && onAcceptFullPrompt;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-6xl h-[90dvh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Optimize System Message
                </DialogTitle>
                <DialogDescription className="mt-1">
                  AI will help improve your system message for better clarity
                  and effectiveness
                </DialogDescription>
              </div>
              {showExperimentalButton && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleClose();
                    setIsFullOptimizerOpen(true);
                  }}
                  className="h-8 text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  Full Prompt Optimizer
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
                    BETA
                  </span>
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-2 gap-4 px-6 overflow-hidden min-h-0">
            {/* Original System Message */}
            <div className="flex flex-col min-h-0">
              <Label className="text-sm font-medium mb-2">
                Current System Message
              </Label>
              <div className="flex-1 bg-gray-50 dark:bg-gray-900 border-border rounded-lg p-3 overflow-y-auto">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {currentSystemMessage || (
                    <span className="text-gray-400 italic">
                      No system message
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Optimized System Message */}
            <div className="flex flex-col min-h-0">
              <Label className="text-sm font-medium mb-2">
                Optimized Version
              </Label>
              <div className="flex-1 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-700 rounded-lg p-3 overflow-y-auto relative">
                {hasOptimizedText || isOptimizing ? (
                  <>
                    {isOptimizing && !streamingText ? (
                      <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Processing...</span>
                      </div>
                    ) : (
                      <MarkdownStream
                        content={streamingText}
                        isStreamActive={isOptimizing}
                        hideCopyButton={false}
                        className="text-sm"
                      />
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <Zap className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Click "Optimize" to see the improved version
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Optional Additional Guidance */}
          <div className="px-6 py-3 border-t space-y-2">
            {!showGuidanceInput ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGuidanceInput(true)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 h-8"
              >
                + Add additional guidance (optional)
              </Button>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Additional Guidance (Optional)
                </Label>
                <Textarea
                  value={additionalGuidance}
                  onChange={(e) => setAdditionalGuidance(e.target.value)}
                  placeholder="e.g., 'Make it more concise' or 'Focus on technical accuracy'"
                  className="text-sm h-16 resize-none"
                  disabled={isOptimizing}
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {hasOptimizedText && !isOptimizing && (
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-600" />
                  Ready to apply
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isOptimizing}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>

              {hasOptimizedText && !isOptimizing ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleOptimize}
                    disabled={isSavingCopy}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Re-optimize
                  </Button>
                  {fullPromptObject && (
                    <Button
                      variant="outline"
                      onClick={handleSaveAsCopy}
                      disabled={isSavingCopy}
                      className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                    >
                      {isSavingCopy ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Save as Copy
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={handleAccept}
                    disabled={isSavingCopy}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Accept & Replace
                  </Button>
                </>
              ) : (
                <Button
                  onClick={handleOptimize}
                  disabled={isOptimizing || !currentSystemMessage.trim()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {isOptimizing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Optimize
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Prompt Optimizer Modal */}
      {showExperimentalButton && (
        <FullPromptOptimizer
          isOpen={isFullOptimizerOpen}
          onClose={() => setIsFullOptimizerOpen(false)}
          currentPromptObject={fullPromptObject}
          onAccept={(optimizedObject) => {
            if (onAcceptFullPrompt) {
              onAcceptFullPrompt(optimizedObject);
            }
            setIsFullOptimizerOpen(false);
          }}
          onAcceptAsCopy={onAcceptAsCopy}
        />
      )}
    </>
  );
}
