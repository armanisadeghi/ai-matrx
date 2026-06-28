/**
 * GeneratePromptForSystemModal
 *
 * Embedded prompt generator specifically for creating AI prompts for system prompts.
 * Pre-fills context with system prompt requirements and auto-links after creation.
 */

"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { getFunctionalityById } from "@/lib/services/functionality-helpers";
import { v4 as uuidv4 } from "uuid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea, CopyTextarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Star,
  Check,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  Zap,
  Link2
} from "lucide-react";
import { toast } from "sonner";
import MarkdownStream from "@/components/MarkdownStream";
import { extractJsonFromText } from "@/features/prompts/utils/json-extraction";
import {
  normalizePromptMessagesFromDb,
  normalizePromptSettingsFromDb,
} from "@/features/prompts/utils/normalize-prompt-db-json";
import { VoiceInputButton } from "@/components/official/VoiceInputButton";
import type { SystemPromptDB } from "@/types/system-prompts-db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface GeneratePromptForSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: SystemPromptDB;
  onSuccess: (promptId: string) => void;
}

const PROMPT_GENERATOR_PROMPT_ID = "fbdb6b57-8b4e-44fe-8354-6286251f638a";

// TODO: Replace with builtin prompt and an official 'button' shortcut

export function GeneratePromptForSystemModal({
  isOpen,
  onClose,
  systemPrompt,
  onSuccess,
}: GeneratePromptForSystemModalProps) {
  const dispatch = useAppDispatch();
  const supabase = createClient();

  const [functionalityConfigConfig, setFunctionalityConfig] =
    useState<any>(null);
  const [promptPurpose, setPromptPurpose] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [promptName, setPromptName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [extractedJson, setExtractedJson] = useState<any>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Watch streaming text
  const streamingText = useAppSelector((state) =>
    currentTaskId
      ? ''
      : "",
  );

  const isResponseEnded = useAppSelector((state) =>
    currentTaskId
      ? true
      : false,
  );

  // Fetch functionality config from database
  useEffect(() => {
    if (isOpen && systemPrompt?.functionality_id) {
      async function fetchFunctionality() {
        const data = await getFunctionalityById(systemPrompt.functionality_id);
        setFunctionalityConfig(data);
      }
      fetchFunctionality();
    }
  }, [isOpen, systemPrompt]);

  // Initialize with system prompt context
  useEffect(() => {
    if (isOpen && systemPrompt && functionalityConfig) {
      // Build the pre-filled context
      let context = `**System Prompt Details:**\n`;
      context += `- Name: ${systemPrompt.name}\n`;
      if (systemPrompt.description) {
        context += `- Description: ${systemPrompt.description}\n`;
      }
      context += `- Category: ${systemPrompt.category}\n`;

      if (functionalityConfigConfig) {
        context += `\n**Functionality: ${functionalityConfigConfig.label}**\n`;
        context += `${functionalityConfigConfig.description}\n\n`;

        context += `**Required Variables (MUST be included):**\n`;
        (functionalityConfigConfig.required_variables || []).forEach(
          (v: string) => {
            context += `- {{${v}}}\n`;
          },
        );

        if (
          functionalityConfigConfig.optional_variables &&
          functionalityConfigConfig.optional_variables.length > 0
        ) {
          context += `\n**Optional Variables (can be included):**\n`;
          functionalityConfigConfig.optional_variables.forEach((v: string) => {
            context += `- {{${v}}}\n`;
          });
        }

        context += `\n**Important:** The prompt MUST use exactly these variable names with double curly braces (e.g., {{${(functionalityConfigConfig.required_variables || [])[0]}}}).\n`;
      }

      context += `\n**Placement Type:** ${systemPrompt.placement_type}\n`;

      if (systemPrompt.placement_settings) {
        if (systemPrompt.placement_settings.requiresSelection) {
          context += `- Requires user text selection\n`;
        }
        if (systemPrompt.placement_settings.allowChat) {
          context += `- Supports chat mode / conversational responses\n`;
        }
        if (systemPrompt.placement_settings.allowInitialMessage) {
          context += `- Allows initial user message before execution\n`;
        }
      }

      setAdditionalContext(context);
      setPromptName(systemPrompt.name + " (AI Generated)");
    }
  }, [isOpen, systemPrompt]);

  // Extract JSON from streaming response when it ends
  useEffect(() => {
    if (isResponseEnded && streamingText && isGenerating) {
      setIsGenerating(false);

      const result = extractJsonFromText(streamingText);

      if (result.success && result.data) {
        setExtractedJson(result.data);
        setExtractionError(null);

        toast.success("Prompt generated successfully", {
          description:
            'Review and click "Create & Link" to save and connect it',
        });
      } else {
        setExtractionError(
          result.error || "Could not extract JSON from response",
        );
        toast.error("Could not extract JSON", {
          description:
            "The raw response is still available. You may need to manually extract the JSON.",
          duration: 5000,
        });
      }
    }
  }, [isResponseEnded, streamingText, isGenerating]);

  const handleGenerate = async () => {
    if (!promptPurpose.trim()) {
      toast.error("Please describe the purpose of your prompt");
      return;
    }

    setIsGenerating(true);
    setExtractedJson(null);
    setExtractionError(null);

    try {
      // 1. Fetch prompt template — prompts migrated 1:1 to agent.definition (same UUIDs)
      const { data: prompt, error: promptError } = await supabase
        .schema("agent")
        .from("definition")
        .select("id, messages, settings, variable_definitions")
        .eq("id", PROMPT_GENERATOR_PROMPT_ID)
        .single();

      if (promptError || !prompt) {
        throw new Error("Prompt generator template not found");
      }
      // Normalize field names: agent.definition uses variable_definitions instead of variable_defaults
      const promptNormalized = {
        ...prompt,
        variable_defaults: (prompt as Record<string, unknown>).variable_definitions,
      };

      // 2. Build the full prompt_purpose value
      let fullPurpose = `**Primary Purpose:**\n${promptPurpose}`;

      if (additionalContext.trim()) {
        fullPurpose += `\n\n**Additional Context & Requirements:**\n${additionalContext}`;
      }

      // 3. Replace variables in messages
      const messages = normalizePromptMessagesFromDb(promptNormalized.messages).map(
        (msg) => {
          const content = msg.content.replace(
            /{{prompt_purpose}}/g,
            fullPurpose,
          );
          return {
            role: msg.role,
            content,
          };
        },
      );

      // 4. Build chat config
      const settings = normalizePromptSettingsFromDb(promptNormalized.settings);
      const modelId = settings.model_id;
      if (!modelId || typeof modelId !== "string") {
        throw new Error("No model specified in prompt");
      }

      const chatConfig = {
        model_id: modelId,
        messages,
        stream: true,
        ...settings,
      };

      // 5. Submit task — set taskId BEFORE dispatch so streaming UI mounts immediately
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
      console.error("Generation error:", error);
      toast.error("Failed to generate prompt", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setIsGenerating(false);
      setCurrentTaskId(null);
    }
  };

  const handleCreateAndLink = async () => {
    if (!extractedJson) {
      toast.error("No generated prompt to save");
      return;
    }

    if (!promptName.trim()) {
      toast.error("Please enter a name for your prompt");
      return;
    }

    // NOTE: The prompt-authoring admin is being decommissioned. The `prompts` table
    // has been moved to the graveyard schema. Creating new user prompts here is no
    // longer supported — new prompts are agents (agent.definition, agent_type='user').
    // This "Create & Link" flow needs a full rework wired to agent.definition inserts.
    console.warn(
      "[GeneratePromptForSystemModal] handleCreateAndLink: prompt insert path is decommissioned. " +
      "The `prompts` table is in the graveyard schema. This UI needs to be updated to create " +
      "an agent.definition row instead.",
    );
    toast.error("Prompt creation temporarily unavailable", {
      description:
        "The prompt authoring system is being migrated. Please contact an admin.",
      duration: 8000,
    });
  };

  const handleClose = () => {
    setCurrentTaskId(null);
    setPromptPurpose("");
    setAdditionalContext("");
    setPromptName("");
    setIsGenerating(false);
    setIsSaving(false);
    setExtractedJson(null);
    setExtractionError(null);
    onClose();
  };

  const handleCopyGenerated = () => {
    if (extractedJson) {
      navigator.clipboard.writeText(JSON.stringify(extractedJson, null, 2));
      toast.success("Copied generated prompt to clipboard");
    }
  };

  const handleCopyRawResponse = () => {
    navigator.clipboard.writeText(streamingText);
    toast.success("Copied raw response to clipboard");
  };

  const hasGeneratedPrompt = extractedJson !== null;
  const canGenerate = promptPurpose.trim().length > 0;

  // Functionality config is already fetched and available in state (from earlier useEffect)
  const functionalityConfig = functionalityConfigConfig;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-7xl h-[95dvh] flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
            Generate AI Prompt for "{systemPrompt.name}"
          </DialogTitle>
        </DialogHeader>

        {/* System Prompt Info Banner */}
        <Card className="mx-4 sm:mx-6 mt-3 p-3 bg-primary/5 border-primary/20">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Functionality:</span>
              <span>{functionalityConfig?.name || "N/A"}</span>
            </div>
            <div>
              <span className="font-semibold">Required Variables:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {functionalityConfig?.requiredVariables.map((v) => (
                  <Badge key={v} variant="default" className="text-xs">
                    {"{{"}
                    {v}
                    {"}}"}
                  </Badge>
                )) || (
                  <span className="text-xs text-muted-foreground">
                    None specified
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-3 sm:gap-4 px-4 sm:px-6 overflow-y-auto lg:overflow-hidden min-h-0 py-3 sm:py-4">
          {/* Input Section */}
          <div className="flex flex-col min-h-0 space-y-3 sm:space-y-4 overflow-y-auto lg:overflow-visible">
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    Prompt Purpose
                    <span className="text-xs text-red-500">*</span>
                  </Label>
                  {!isGenerating && !hasGeneratedPrompt && (
                    <VoiceInputButton
                      variant="button"
                      buttonText="Voice"
                      size="sm"
                      onTranscriptionComplete={(text) => {
                        const newText = promptPurpose
                          ? `${promptPurpose}\n${text}`
                          : text;
                        setPromptPurpose(newText);
                        toast.success("Voice explanation added");
                      }}
                      onError={(error) => {
                        toast.error("Voice input failed", {
                          description: error,
                        });
                      }}
                    />
                  )}
                </div>
                <CopyTextarea
                  value={promptPurpose}
                  onChange={(e) => setPromptPurpose(e.target.value)}
                  placeholder="Describe the specific behavior and instructions for this prompt..."
                  className="min-h-[120px] sm:min-h-[180px] text-base"
                  style={{ fontSize: "16px" }}
                  disabled={isGenerating || hasGeneratedPrompt}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Be specific about how this prompt should work and what it
                  should accomplish
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs sm:text-sm font-medium">
                    System Context
                    <span className="text-xs text-gray-500 ml-1">
                      (Pre-filled, editable)
                    </span>
                  </Label>
                  {!isGenerating && !hasGeneratedPrompt && (
                    <VoiceInputButton
                      variant="button"
                      buttonText="Voice"
                      size="sm"
                      onTranscriptionComplete={(text) => {
                        const newText = additionalContext
                          ? `${additionalContext}\n${text}`
                          : text;
                        setAdditionalContext(newText);
                        toast.success("Voice context added");
                      }}
                      onError={(error) => {
                        toast.error("Voice input failed", {
                          description: error,
                        });
                      }}
                    />
                  )}
                </div>
                <CopyTextarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="System requirements and constraints..."
                  className="min-h-[120px] sm:min-h-[180px] text-base font-mono"
                  style={{ fontSize: "14px" }}
                  disabled={isGenerating || hasGeneratedPrompt}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Pre-filled with system prompt requirements. Edit if needed.
                </p>
              </div>

              {hasGeneratedPrompt && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    Prompt Name
                    <span className="text-xs text-red-500">*</span>
                  </Label>
                  <Input
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    placeholder="Enter a name for your new prompt"
                    className="text-base"
                    style={{ fontSize: "16px" }}
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>
          </div>

          {/* AI Response Section */}
          <div className="flex flex-col min-h-0 flex-1 lg:flex-initial">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <Label className="text-xs sm:text-sm font-medium">
                Generated Prompt
              </Label>
              {streamingText && !isGenerating && (
                <div className="flex gap-1">
                  {hasGeneratedPrompt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyGenerated}
                      className="h-7 px-2 text-xs"
                      title="Copy extracted JSON"
                    >
                      <Copy className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Copy JSON</span>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyRawResponse}
                    className="h-7 px-2 text-xs"
                    title="Copy raw response"
                  >
                    <Copy className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Copy Raw</span>
                  </Button>
                </div>
              )}
            </div>
            <div className="flex-1 bg-textured border-2 border-purple-300 dark:border-purple-700 rounded-lg overflow-hidden min-h-[300px]">
              {isGenerating ? (
                <div className="h-full flex flex-col">
                  <div className="flex-none flex items-center gap-2 p-2 border-b border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                      Generating your prompt...
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {streamingText ? (
                      <MarkdownStream
                        content={streamingText}
                        isStreamActive={true}
                        hideCopyButton={true}
                      />
                    ) : null}
                  </div>
                </div>
              ) : streamingText ? (
                <div className="h-full flex flex-col overflow-hidden">
                  {extractionError && (
                    <div className="flex-none p-2 bg-amber-100 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        <strong>JSON Extraction Failed:</strong>{" "}
                        {extractionError}
                      </span>
                    </div>
                  )}

                  {hasGeneratedPrompt && !extractionError && (
                    <div className="flex-none p-2 bg-green-100 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-700 dark:text-green-300">
                        Prompt generated successfully!
                      </span>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-2">
                    <MarkdownStream
                      content={streamingText}
                      isStreamActive={false}
                      hideCopyButton={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6">
                  <Star className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Ready to generate
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md">
                    Describe the prompt purpose and click "Generate" to create a
                    compatible AI prompt
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-gray-50 dark:bg-gray-900 pb-safe">
          <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
            {hasGeneratedPrompt && !isGenerating && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-600" />
                Ready to create and link
              </span>
            )}
            {extractionError && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Check response manually
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isGenerating || isSaving}
              className="flex-1 sm:flex-initial"
            >
              <X className="h-4 w-4 mr-2" />
              {hasGeneratedPrompt ? "Discard" : "Cancel"}
            </Button>

            {hasGeneratedPrompt && !isGenerating ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setExtractedJson(null);
                    setPromptName("");
                  }}
                  disabled={isSaving}
                  className="flex-1 sm:flex-initial"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleCreateAndLink}
                  disabled={!promptName.trim() || isSaving}
                  className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Create & Link
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
