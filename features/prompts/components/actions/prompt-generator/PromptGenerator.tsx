/**
 * Prompt Generator Component
 *
 * Provides AI-powered generation of new prompts from user specifications
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Rainbow,
  Check,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  Zap,
  BookmarkPlus,
  BookmarkCheck,
} from "lucide-react";
import { toast } from "sonner";
import MarkdownStream from "@/components/MarkdownStream";
import { extractJsonFromText } from "@/features/prompts/utils/json-extraction";
import { useRouter } from "next/navigation";
import { usePromptsBasePath } from "@/features/prompts/hooks/usePromptsBasePath";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { PromptJsonDisplay } from "./PromptJsonDisplay";
import { extractNonJsonContent } from "./progressive-json-parser";
import { PROMPT_BUILTINS } from "@/features/agents/constants/system-agent-registry";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { requireUserId } from "@/utils/auth/getUserId";

interface PromptGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PromptGenerator({ isOpen, onClose }: PromptGeneratorProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const basePath = usePromptsBasePath();

  const [promptPurpose, setPromptPurpose] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [promptName, setPromptName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [extractedJson, setExtractedJson] = useState<any>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const sessionNoteId = useRef<string | null>(null);

  // Watch streaming text
  const streamingText = useAppSelector((state) => (currentTaskId ? "" : ""));

  const isResponseEnded = useAppSelector((state) =>
    currentTaskId ? true : false,
  );

  // Extract JSON from streaming response when it ends
  useEffect(() => {
    if (isResponseEnded && streamingText && isGenerating) {
      setIsGenerating(false);

      // Use the safe extraction utility
      const result = extractJsonFromText(streamingText);

      if (result.success && result.data) {
        setExtractedJson(result.data);
        setExtractionError(null);

        // Auto-populate the prompt name if available
        const maybeName =
          typeof result.data === "object" &&
          result.data !== null &&
          "name" in result.data
            ? (result.data as { name?: unknown }).name
            : undefined;
        if (maybeName && typeof maybeName === "string") {
          setPromptName(maybeName);
        }

        toast.success("Prompt generated successfully", {
          description:
            'Review the generated prompt and click "Create Prompt" to save it',
        });
      } else {
        // Extraction failed
        setExtractionError(
          result.error || "Could not extract JSON from response",
        );
        toast.error("Could not extract JSON", {
          description:
            "The raw response is still available below. You may need to manually extract the JSON.",
          duration: 5000,
        });
      }
    }
  }, [isResponseEnded, streamingText, isGenerating]);

  const buildNoteContent = () => {
    const parts: string[] = [];
    if (promptPurpose.trim()) {
      parts.push(`## Prompt Purpose\n\n${promptPurpose.trim()}`);
    }
    if (additionalContext.trim()) {
      parts.push(`## Additional Context\n\n${additionalContext.trim()}`);
    }
    return parts.join("\n\n");
  };

  const saveToNote = async (silent = false) => {
    const content = buildNoteContent();
    if (!content) return;

    setIsSavingNote(true);
    try {
      if (sessionNoteId.current) {
        await NotesAPI.update(sessionNoteId.current, { content });
      } else {
        const label =
          promptPurpose.trim().slice(0, 60) || "AI Prompt Generator Draft";
        const note = await NotesAPI.create({
          label,
          content,
          folder_name: "Prompts",
        });
        sessionNoteId.current = note.id;
      }
      setNoteSaved(true);
      if (!silent) {
        toast.success("Saved to Notes", {
          description: "Your inputs have been saved in the Prompts folder.",
        });
      }
    } catch {
      if (!silent) {
        toast.error("Failed to save note");
      }
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleGenerate = async () => {
    if (!promptPurpose.trim()) {
      toast.error("Please describe the purpose of your prompt");
      return;
    }

    // Auto-save to notes before generating so inputs are never lost
    await saveToNote(true);

    setIsGenerating(true);
    setExtractedJson(null);
    setExtractionError(null);

    try {
      // 1. Fetch prompt template
      const { data: prompt, error: promptError } = await graveyardDb(supabase)
        .from("prompt_builtins")
        .select("*")
        .eq("id", PROMPT_BUILTINS.FULL_PROMPT_STRUCTURE_BUILDER.id)
        .single();

      if (promptError || !prompt) {
        throw new Error("Full Prompt Structure Builder not found");
      }

      const templateMessages = normalizePromptMessagesFromDb(prompt.messages);
      const templateSettings = normalizePromptSettingsFromDb(prompt.settings);

      // 2. Find the last user message index
      const lastUserIndex = templateMessages.reduce(
        (lastIdx: number, msg, idx: number) =>
          msg.role === "user" ? idx : lastIdx,
        -1,
      );

      // 3. Replace variables and append context to last user message
      const messages = templateMessages.map((msg, idx: number) => {
        let content = msg.content;

        // Directly replace prompt_purpose variable
        content = content.replace(/{{prompt_purpose}}/g, promptPurpose);

        // Append additional context only to the last user message
        if (idx === lastUserIndex && additionalContext.trim()) {
          content += `\n\n${additionalContext}`;
        }

        return {
          role: msg.role,
          content,
        };
      });

      // 4. Build chat config
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

  const handleCreatePrompt = async () => {
    if (!extractedJson) {
      toast.error("No generated prompt to save");
      return;
    }

    if (!promptName.trim()) {
      toast.error("Please enter a name for your prompt");
      return;
    }

    setIsSaving(true);

    try {
      // Get current user
      const userId = requireUserId();

      // Create new prompt using the same DB field pattern as importPrompt
      const promptId = uuidv4();
      const dbPromptData = {
        id: promptId,
        user_id: userId,
        name: promptName.trim(),
        description: extractedJson.description || null,
        messages: extractedJson.messages || [],
        variable_defaults:
          extractedJson.variableDefaults || extractedJson.variables || [],
        settings: extractedJson.settings || {},
        // created_at and updated_at are automatically set by the database
      };

      const { error: insertError } = await graveyardDb(supabase)
        .from("prompts")
        .insert([dbPromptData]);

      if (insertError) {
        throw insertError;
      }

      toast.success("Prompt created successfully!", {
        description: "Opening prompt editor with test runner...",
      });

      // Close modal and navigate to the new prompt with autoRun query param
      handleClose();
      router.push(`${basePath}/edit/${promptId}?autoRun=true`);
      router.refresh();
    } catch (error) {
      console.error("Error creating prompt:", error);
      toast.error("Failed to create prompt", {
        description: error instanceof Error ? error.message : "Unknown error",
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
    setIsSavingNote(false);
    setNoteSaved(false);
    sessionNoteId.current = null;
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
            AI Prompt Generator
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-3 sm:gap-4 px-4 sm:px-6 overflow-y-auto lg:overflow-hidden min-h-0 py-3 sm:py-4">
          {/* Input Section */}
          <div className="flex flex-col min-h-0 space-y-3 sm:space-y-4 overflow-y-auto lg:overflow-visible">
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                    Prompt Purpose
                    <span className="text-xs text-red-500">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => saveToNote(false)}
                    disabled={
                      isSavingNote ||
                      (!promptPurpose.trim() && !additionalContext.trim())
                    }
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                    title="Save inputs to Notes"
                  >
                    {isSavingNote ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : noteSaved ? (
                      <BookmarkCheck className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <BookmarkPlus className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline ml-1">
                      {noteSaved ? "Saved" : "Save to Notes"}
                    </span>
                  </Button>
                </div>
                <VoiceTextarea
                  value={promptPurpose}
                  onChange={(e) => {
                    setPromptPurpose(e.target.value);
                    setNoteSaved(false);
                  }}
                  placeholder="Describe what you want your prompt or agent to do..."
                  className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                  disabled={isGenerating || hasGeneratedPrompt}
                  onTranscriptionComplete={(text) => {
                    toast.success("Voice explanation added");
                  }}
                  onTranscriptionError={(error) => {
                    toast.error("Voice input failed", {
                      description: error,
                    });
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Be specific about the main purpose and goals of your prompt
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium">
                  Additional Context
                  <span className="text-xs text-gray-500 ml-1">(Optional)</span>
                </Label>
                <VoiceTextarea
                  value={additionalContext}
                  onChange={(e) => {
                    setAdditionalContext(e.target.value);
                    setNoteSaved(false);
                  }}
                  placeholder="Add any specific requirements, tone, formats, or constraints..."
                  className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                  disabled={isGenerating || hasGeneratedPrompt}
                  onTranscriptionComplete={(text) => {
                    toast.success("Voice context added");
                  }}
                  onTranscriptionError={(error) => {
                    toast.error("Voice input failed", {
                      description: error,
                    });
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Any additional context, requirements, or constraints
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
                    style={{ fontSize: "14px" }}
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
                  <div className="flex-1 overflow-y-auto p-3">
                    {streamingText ? (
                      <StreamingResponseDisplay
                        content={streamingText}
                        isStreamActive={true}
                      />
                    ) : null}
                  </div>
                </div>
              ) : streamingText ? (
                <div className="h-full flex flex-col overflow-hidden">
                  {/* Show extraction status banner if needed */}
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

                  {/* Simple clean display of the response */}
                  <div className="flex-1 overflow-y-auto p-3">
                    <StreamingResponseDisplay
                      content={streamingText}
                      isStreamActive={false}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6">
                  <Rainbow className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Ready to generate
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md">
                    Fill in the prompt purpose and click "Generate" to let AI
                    create your prompt configuration
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
                  <Rainbow className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleCreatePrompt}
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
                      Create
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
                    <Rainbow className="h-4 w-4 mr-2" />
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

/**
 * StreamingResponseDisplay Component
 *
 * Splits the response into markdown and JSON sections
 * Renders markdown normally and JSON with the special display
 */
function StreamingResponseDisplay({
  content,
  isStreamActive,
}: {
  content: string;
  isStreamActive: boolean;
}) {
  // Check if content contains a JSON block (tagged or untagged)
  const hasTaggedJson = content.includes("```json");
  // Also detect plain ``` blocks that contain JSON (start with '{' after optional whitespace)
  const hasPlainCodeBlock = !hasTaggedJson && /```\s*\n\s*\{/.test(content);
  const hasJsonBlock = hasTaggedJson || hasPlainCodeBlock;

  // Normalize plain ``` to ```json so the rest of the pipeline handles it uniformly
  const normalizedContent = hasPlainCodeBlock
    ? content.replace(/```(\s*\n\s*\{)/, "```json$1")
    : content;

  if (!hasJsonBlock) {
    // No JSON block, render as normal markdown
    return (
      <MarkdownStream
        content={content}
        isStreamActive={isStreamActive}
        hideCopyButton={true}
      />
    );
  }

  // Split content into before/after JSON
  const { before, after } = extractNonJsonContent(normalizedContent);

  return (
    <div className="space-y-4">
      {/* Before JSON content */}
      {before && (
        <MarkdownStream
          content={before}
          isStreamActive={false}
          hideCopyButton={true}
        />
      )}

      {/* JSON Display */}
      <PromptJsonDisplay
        content={normalizedContent}
        isStreamActive={isStreamActive}
      />

      {/* After JSON content */}
      {after && (
        <MarkdownStream
          content={after}
          isStreamActive={false}
          hideCopyButton={true}
        />
      )}
    </div>
  );
}
