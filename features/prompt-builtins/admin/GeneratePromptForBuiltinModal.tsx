"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
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
  Atom,
  Check,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import MarkdownStream from "@/components/MarkdownStream";
import { extractJsonFromText } from "@/features/prompts/utils/json-extraction";
import { VoiceInputButton } from "@/components/official/VoiceInputButton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Json } from "@/types/database.types";

interface GeneratePromptForBuiltinModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcutId?: string;
  shortcutData?: {
    label: string;
    available_scopes?: string[];
  };
  onSuccess: (builtinId: string) => void;
}

const PROMPT_GENERATOR_PROMPT_ID = "fbdb6b57-8b4e-44fe-8354-6286251f638a";

function jsonToGeneratorMessageList(
  raw: Json | null,
): Array<{ role: string; content: string }> {
  if (raw === null || !Array.isArray(raw)) {
    throw new Error("Invalid prompt messages");
  }
  const out: Array<{ role: string; content: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid message in prompt template");
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.role !== "string" || typeof rec.content !== "string") {
      throw new Error("Invalid message shape in prompt template");
    }
    out.push({ role: rec.role, content: rec.content });
  }
  return out;
}

function jsonToSettingsObject(raw: Json | null): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid prompt settings");
  }
  return raw as Record<string, unknown>;
}

export function GeneratePromptForBuiltinModal({
  isOpen,
  onClose,
  shortcutId,
  shortcutData,
  onSuccess,
}: GeneratePromptForBuiltinModalProps) {
  const dispatch = useAppDispatch();
  const supabase = createClient();

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

  // Initialize with shortcut context if provided
  useEffect(() => {
    if (isOpen && shortcutData) {
      let context = `**Shortcut Details:**\n`;
      context += `- Name: ${shortcutData.label}\n`;

      if (
        shortcutData.available_scopes &&
        shortcutData.available_scopes.length > 0
      ) {
        context += `\n**Available Scopes (for variable mapping):**\n`;
        shortcutData.available_scopes.forEach((scope) => {
          context += `- ${scope}\n`;
        });
        context += `\nNote: You can create variables that will be mapped to these scope keys.\n`;
      }

      setAdditionalContext(context);
      setPromptName(`${shortcutData.label} Prompt`);
    }
  }, [isOpen, shortcutData]);

  // Extract JSON from streaming response when it ends
  useEffect(() => {
    if (isResponseEnded && streamingText && isGenerating) {
      setIsGenerating(false);

      const result = extractJsonFromText(streamingText);

      if (result.success && result.data) {
        setExtractedJson(result.data);
        setExtractionError(null);

        toast.success("Prompt generated successfully", {
          description: 'Review and click "Create Builtin" to save',
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
      // Fetch prompt template
      const { data: prompt, error: promptError } = await graveyardDb(supabase)
        .from("prompts")
        .select("*")
        .eq("id", PROMPT_GENERATOR_PROMPT_ID)
        .single();

      if (promptError || !prompt) {
        throw new Error("Prompt generator template not found");
      }

      // Build the full prompt_purpose value
      let fullPurpose = `**Primary Purpose:**\n${promptPurpose}`;

      if (additionalContext.trim()) {
        fullPurpose += `\n\n**Additional Context & Requirements:**\n${additionalContext}`;
      }

      // Replace variables in messages (JSONB columns are `Json` at the type level)
      const messageList = jsonToGeneratorMessageList(prompt.messages);
      const messages = messageList.map((msg) => {
        let { content } = msg;
        content = content.replace(/{{prompt_purpose}}/g, fullPurpose);
        return {
          role: msg.role,
          content,
        };
      });

      const settings = jsonToSettingsObject(prompt.settings);
      const modelId = settings.model_id;
      if (typeof modelId !== "string" || !modelId) {
        throw new Error("No model specified in prompt");
      }

      const chatConfig = {
        model_id: modelId,
        messages,
        stream: true,
        ...settings,
      };

      // Submit task — set taskId BEFORE dispatch so streaming UI mounts immediately
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

  const handleCreateBuiltin = async () => {
    if (!extractedJson) {
      toast.error("No generated prompt to save");
      return;
    }

    if (!promptName.trim()) {
      toast.error("Please enter a name for your builtin");
      return;
    }

    setIsSaving(true);

    try {
      // Create builtin via API
      const response = await fetch(
        "/api/admin/prompt-builtins/create-from-ai",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: promptName.trim(),
            description: extractedJson.description || null,
            messages: extractedJson.messages || [],
            variable_defaults:
              extractedJson.variableDefaults || extractedJson.variables || [],
            tools: extractedJson.tools || null,
            settings: extractedJson.settings || {},
            shortcut_id: shortcutId || null,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.details || errorData.error || "Failed to create builtin",
        );
      }

      const result = await response.json();

      toast.success(
        shortcutId ? "Builtin created and linked!" : "Builtin created!",
        { description: result.message },
      );

      onSuccess(result.builtin_id);
      handleClose();
    } catch (error) {
      console.error("Error creating builtin:", error);
      toast.error("Failed to create builtin", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 8000,
      });
    } finally {
      setIsSaving(false);
    }
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-7xl h-[95dvh] flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
            Generate Prompt Builtin
            {shortcutData ? ` for "${shortcutData.label}"` : ""}
          </DialogTitle>
        </DialogHeader>

        {/* Context Info Banner */}
        {shortcutData?.available_scopes &&
          shortcutData.available_scopes.length > 0 && (
            <Card className="mx-4 sm:mx-6 mt-3 p-3 bg-primary/5 border-primary/20">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-semibold">Available Scopes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {shortcutData.available_scopes.map((scope) => (
                      <Badge key={scope} variant="default" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Create variables that you'll map to these scope keys after
                    generation
                  </p>
                </div>
              </div>
            </Card>
          )}

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
                    Additional Context
                    <span className="text-xs text-gray-500 ml-1">
                      (Optional)
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
                  placeholder="Additional requirements and constraints..."
                  className="min-h-[120px] sm:min-h-[180px] text-base font-mono"
                  style={{ fontSize: "14px" }}
                  disabled={isGenerating || hasGeneratedPrompt}
                />
              </div>

              {hasGeneratedPrompt && (
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    Builtin Name
                    <span className="text-xs text-red-500">*</span>
                  </Label>
                  <Input
                    value={promptName}
                    onChange={(e) => setPromptName(e.target.value)}
                    placeholder="Enter a name for your builtin"
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
                  <Atom className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Ready to generate
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md">
                    Describe the prompt purpose and click "Generate" to create a
                    new prompt builtin
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
                Ready to create
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
                  <Atom className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleCreateBuiltin}
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
                      <Check className="h-4 w-4 mr-2" />
                      Create Builtin
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
                    <Atom className="h-4 w-4 mr-2" />
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
