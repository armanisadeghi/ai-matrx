import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  RefreshCw,
  ArrowUp,
  CornerDownLeft,
  Mic,
  ChevronRight,
  ChevronUp,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PromptVariable } from "@/features/prompts/types/core";
import { formatText } from "@/utils/text/text-case-converter";
import { VariableInputComponent } from "./variable-inputs/VariableInputComponent";
import { PromptInputButton } from "./PromptInputButton";
import { ResourcePickerButton } from "../../resource-manager/resource-picker/ResourcePickerButton";
import { ResourceChips } from "./resource-display/ResourceChips";
import type { Resource } from "../types/resources";
import ResourcePreviewSheet from "./resource-display/ResourcePreviewSheet";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { useFileUpload } from "@/features/file-handler/hooks/useFileUpload";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { toast } from "sonner";

interface PromptInputProps {
  variableDefaults: PromptVariable[];
  onVariableValueChange: (variableName: string, value: string) => void;
  expandedVariable: string | null;
  onExpandedVariableChange: (variable: string | null) => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: () => void;
  isTestingPrompt: boolean;
  submitOnEnter: boolean;
  onSubmitOnEnterChange?: (value: boolean) => void; // Optional - if not provided, toggle will be hidden
  messages: Array<{ role: string; content: string }>;

  // Optional props for customization
  showVariables?: boolean;
  showAutoClear?: boolean; // Controls visibility of the auto-clear toggle
  autoClear?: boolean; // The current state of auto-clear (clears conversation before submit)
  onAutoClearChange?: (value: boolean) => void; // Handler to change auto-clear state
  showAttachments?: boolean;
  attachmentCapabilities?: {
    supportsImageUrls: boolean;
    supportsFileUrls: boolean;
    supportsYoutubeVideos: boolean;
  };
  placeholder?: string;
  sendButtonVariant?: "gray" | "blue" | "default";
  showShiftEnterHint?: boolean;

  // Resource management
  resources?: Resource[];
  onResourcesChange?: (
    resources: Resource[] | ((prev: Resource[]) => Resource[]),
  ) => void;
  enablePasteImages?: boolean;
  uploadBucket?: string;
  uploadPath?: string;
  compact?: boolean;
}

export function PromptInput({
  variableDefaults,
  onVariableValueChange,
  expandedVariable,
  onExpandedVariableChange,
  chatInput,
  onChatInputChange,
  onSendMessage,
  isTestingPrompt,
  submitOnEnter,
  onSubmitOnEnterChange,
  messages,
  showVariables = true,
  showAutoClear = false,
  autoClear = false,
  onAutoClearChange,
  showAttachments = false,
  attachmentCapabilities = {
    supportsImageUrls: false,
    supportsFileUrls: false,
    supportsYoutubeVideos: false,
  },
  placeholder,
  sendButtonVariant = "gray",
  showShiftEnterHint = false,
  resources = [],
  onResourcesChange,
  enablePasteImages = false,
  uploadBucket = "userContent",
  uploadPath = "prompt-attachments",
  compact = false,
}: PromptInputProps) {
  if (sendButtonVariant === "default") sendButtonVariant = "gray";

  const [previewResource, setPreviewResource] = useState<{
    resource: Resource;
    index: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceSubmitRef = useRef(false);

  // File upload hook for paste support
  const { upload } = useFileUpload();

  // Voice transcription hook
  const {
    isRecording,
    isTranscribing,
    duration,
    audioLevel,
    startRecording,
    stopRecording,
  } = useRecordAndTranscribe({
    onTranscriptionComplete: (result) => {
      if (result.success && result.text) {
        // Append transcribed text to existing input
        const newText = chatInput
          ? `${chatInput}\n${result.text}`
          : result.text;

        // Set flag to submit after state update
        pendingVoiceSubmitRef.current = true;

        // Update the input value
        onChatInputChange(newText);
      }
    },
    onError: (error) => {
      toast.error("Transcription failed", {
        description: error,
      });
    },
    autoTranscribe: true,
  });

  // Effect to handle pending voice submission after state update
  useEffect(() => {
    if (pendingVoiceSubmitRef.current && chatInput.trim()) {
      pendingVoiceSubmitRef.current = false;

      // Small delay to ensure parent component state is updated
      setTimeout(() => {
        onSendMessage();
      }, 50);
    }
  }, [chatInput, onSendMessage]);

  // Handle mic button click
  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (!isTranscribing) {
      startRecording();
    }
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  // Handle resource selection from picker
  const handleResourceSelected = useCallback(
    (resource: any) => {
      if (onResourcesChange) {
        // Use functional update to ensure we always have the latest resources array
        // This prevents race conditions when adding multiple resources rapidly
        onResourcesChange((prevResources: Resource[]) => [
          ...prevResources,
          resource,
        ]);
      }
    },
    [onResourcesChange],
  );

  // Handle resource removal
  const handleRemoveResource = useCallback(
    (index: number) => {
      if (onResourcesChange) {
        onResourcesChange((prevResources: Resource[]) =>
          prevResources.filter((_, i) => i !== index),
        );
      }
    },
    [onResourcesChange],
  );

  // Handle resource preview
  const handlePreviewResource = useCallback(
    (resource: Resource, index: number) => {
      setPreviewResource({ resource, index });
    },
    [],
  );

  // Handle pasted images
  const handlePasteImage = useCallback(
    async (file: File) => {
      try {
        const folderPath = uploadPath
          ? `${uploadBucket}/${uploadPath}`
          : uploadBucket;
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath,
            visibility: "private",
            createShareLink: true,
            shareLinkPermissionLevel: "read",
          },
        );
        if (onResourcesChange) {
          onResourcesChange((prevResources: Resource[]) => [
            ...prevResources,
            {
              type: "file",
              data: {
                fileId: normalized.fileId,
                url: normalized.url ?? "",
                filename: normalized.meta.fileName ?? file.name,
                mime_type: normalized.meta.mime ?? file.type,
                size: normalized.meta.sizeBytes ?? file.size,
              },
            },
          ]);
        }
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Upload failed";
        // eslint-disable-next-line no-console
        console.error("Failed to upload pasted image:", error);
        toast.error(`Couldn't upload pasted image: ${reason}`);
      }
    },
    [onResourcesChange, upload, uploadBucket, uploadPath],
  );

  // Setup clipboard paste
  useClipboardPaste({
    textareaRef,
    onPasteImage: handlePasteImage,
    disabled: !enablePasteImages,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const showExpandButton = chatInput.length > 80;

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = isExpanded
        ? Math.max(textarea.scrollHeight, 300)
        : Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [chatInput, isExpanded]);

  // Check if the last prompt message is a user message
  const lastPromptMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const isLastMessageUser = lastPromptMessage?.role === "user";

  // Check if all variables already have values (for visible vars mode with pre-filled values)
  const allVariablesHaveValues = variableDefaults.every(
    (v) => v.defaultValue && v.defaultValue.trim() !== "",
  );

  // Determine if the send button should be disabled
  const isSendDisabled =
    isTestingPrompt || (!isLastMessageUser && !chatInput.trim());

  // Handle Enter key on collapsed variable inputs: cycle to next, then submit or focus textarea
  const handleVariableKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const isLast = index === variableDefaults.length - 1;

      if (!isLast) {
        // Focus the next collapsed variable input
        const container = (e.currentTarget as HTMLElement).closest(
          "[data-variable-inputs]",
        );
        const nextInput = container?.querySelector<HTMLInputElement>(
          `[data-variable-index="${index + 1}"]`,
        );
        if (nextInput) {
          nextInput.focus();
          return;
        }
      }

      // Last variable: submit if submitOnEnter, else focus textarea
      if (submitOnEnter && !isSendDisabled) {
        onSendMessage();
      } else {
        textareaRef.current?.focus();
      }
    }
  };

  // Handle keyboard events in the textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && submitOnEnter) {
      e.preventDefault();
      if (!isSendDisabled) {
        onSendMessage();
      }
    }
  };

  // Determine placeholder text
  const placeholderText =
    placeholder ||
    (showVariables
      ? "Add a message to the bottom of prompt..."
      : "Type your message...");

  // Send button classes based on variant
  const sendButtonClasses =
    sendButtonVariant === "blue"
      ? "h-7 w-7 p-0 flex-shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-600 text-white"
      : "h-7 w-7 p-0 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600";

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-border overflow-hidden">
      {/* Variable Inputs - Only shown when showVariables is true */}
      {showVariables && variableDefaults.length > 0 && (
        <div className="border-b border-border" data-variable-inputs>
          <div className="p-0">
            <div className="space-y-0">
              {variableDefaults.map((variable, index) => {
                const isExpanded = expandedVariable === variable.name;

                return (
                  <div key={variable.name}>
                    {isExpanded ? (
                      <Popover
                        open={expandedVariable === variable.name}
                        onOpenChange={(open) => {
                          if (!open) {
                            onExpandedVariableChange(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <div
                            className="w-full flex items-center gap-2 pl-1.5 pr-3 h-12 bg-background/50 border-b border-border cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors group"
                            onClick={() =>
                              onExpandedVariableChange(variable.name)
                            }
                            tabIndex={index + 1}
                          >
                            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0 cursor-pointer">
                              {formatText(variable.name)}:
                            </Label>
                            <div className="flex-1 text-sm text-gray-900 dark:text-gray-200 min-w-0">
                              {variable.defaultValue ? (
                                <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                                  {variable.defaultValue.replace(/\n/g, " ↵ ")}
                                </span>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600">
                                  {variable.helpText || "Enter value..."}
                                </span>
                              )}
                            </div>
                            <ChevronUp className="w-5 h-5 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 flex-shrink-0 transition-colors" />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[500px] max-h-[500px] p-2 border-gray-300 dark:border-gray-700 overflow-y-auto scrollbar-thin"
                          align="center"
                          side="top"
                          sideOffset={8}
                        >
                          <VariableInputComponent
                            value={variable.defaultValue || ""}
                            onChange={(value) =>
                              onVariableValueChange(variable.name, value)
                            }
                            variableName={variable.name}
                            customComponent={variable.customComponent}
                            onRequestClose={() =>
                              onExpandedVariableChange(null)
                            }
                            helpText={variable.helpText}
                            compact={compact}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="flex items-center gap-2 pl-1.5 pr-3 h-6 bg-background border-b border-border hover:bg-gray-100 hover:dark:bg-zinc-700 transition-colors focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/20 dark:focus-within:ring-blue-400/20 group">
                        <Label
                          className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0 cursor-pointer"
                          onClick={() =>
                            onExpandedVariableChange(variable.name)
                          }
                        >
                          {formatText(variable.name)}:
                        </Label>
                        <input
                          type="text"
                          value={
                            variable.defaultValue?.includes("\n")
                              ? (variable.defaultValue || "").replace(
                                  /\n/g,
                                  " ↵ ",
                                )
                              : variable.defaultValue || ""
                          }
                          onChange={(e) =>
                            onVariableValueChange(variable.name, e.target.value)
                          }
                          onKeyDown={(e) => handleVariableKeyDown(e, index)}
                          placeholder={variable.helpText || "Enter value..."}
                          className="flex-1 text-base md:text-xs bg-transparent border-none outline-none focus:outline-none text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 min-w-0"
                          data-variable-index={index}
                          tabIndex={index + 1}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onExpandedVariableChange(variable.name)
                          }
                          className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          tabIndex={-1}
                          title="Expand to full editor"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Resource Chips Display */}
      {resources.length > 0 && (
        <div className="border-b border-border py-1">
          <ResourceChips
            resources={resources}
            onRemove={handleRemoveResource}
            onPreview={handlePreviewResource}
          />
        </div>
      )}

      {/* Text Area */}
      <div
        className={`px-2 pt-1.5 relative ${isExpanded ? "fixed inset-x-4 top-16 bottom-24 z-50 bg-white dark:bg-zinc-900 rounded-lg border border-border shadow-2xl px-3 pt-3 flex flex-col" : ""}`}
      >
        {isExpanded && (
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border flex-shrink-0">
            <span className="text-xs text-muted-foreground font-medium">
              Expanded input
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Collapse"
            >
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            className={`w-full bg-transparent border-none outline-none text-base md:text-xs text-gray-900 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none overflow-y-auto scrollbar-hide ${isExpanded ? "h-full min-h-[200px]" : ""}`}
            style={
              isExpanded
                ? { minHeight: "200px" }
                : { minHeight: "40px", maxHeight: "200px" }
            }
            tabIndex={variableDefaults.length + 1}
            rows={1}
            autoFocus={
              !showVariables ||
              variableDefaults.length === 0 ||
              allVariablesHaveValues
            }
          />
          {showExpandButton && !isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="absolute top-0 right-0 p-1 rounded hover:bg-muted/80 transition-colors opacity-60 hover:opacity-100"
              title="Expand input"
            >
              <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Controls - All buttons in one row */}
      <div className="flex items-center justify-between px-2 pb-1.5">
        <div className="flex items-center gap-1">
          {/* Voice Input - Show transcription loader when processing */}
          {isTranscribing && !isRecording ? (
            <div className="px-2">
              <TranscriptionLoader
                message="Transcribing"
                duration={duration}
                size="sm"
              />
            </div>
          ) : isRecording ? (
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Recording...
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={stopRecording}
                className="h-7 px-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Mic className="h-3.5 w-3.5" />
                <span className="text-xs">
                  Stop ({Math.floor(duration / 60)}:
                  {String(duration % 60).padStart(2, "0")})
                </span>
              </Button>
            </div>
          ) : (
            <PromptInputButton
              icon={Mic}
              tooltip="Record voice message"
              onClick={handleMicClick}
              active={false}
            />
          )}

          {/* Resource Picker */}
          <ResourcePickerButton
            onResourceSelected={handleResourceSelected}
            attachmentCapabilities={attachmentCapabilities}
          />

          {/* Shift+Enter hint text (alternative to buttons) */}
          {showShiftEnterHint && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {submitOnEnter
                ? "Shift+Enter for new line"
                : "Enter for new line"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Submit on Enter toggle - Only shown if callback provided */}
          {onSubmitOnEnterChange && (
            <PromptInputButton
              icon={CornerDownLeft}
              tooltip={
                submitOnEnter
                  ? "Submit on Enter (Click to disable)"
                  : "New line on Enter (Click to enable Submit on Enter)"
              }
              onClick={() => onSubmitOnEnterChange(!submitOnEnter)}
              active={submitOnEnter}
            />
          )}

          {/* Auto-clear toggle - Conditional (clears entire conversation before each submit) */}
          {showAutoClear && onAutoClearChange && (
            <PromptInputButton
              icon={RefreshCw}
              tooltip={
                autoClear
                  ? "Auto-clear conversation enabled (Click to disable)"
                  : "Auto-clear conversation disabled (Click to enable)"
              }
              onClick={() => onAutoClearChange(!autoClear)}
              active={autoClear}
            />
          )}

          {/* Send button */}
          <Button
            onClick={onSendMessage}
            disabled={isSendDisabled}
            className={sendButtonClasses}
            tabIndex={-1}
          >
            {isTestingPrompt ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Resource Preview Sheet */}
      <ResourcePreviewSheet
        resource={previewResource?.resource || null}
        isOpen={!!previewResource}
        onClose={() => setPreviewResource(null)}
        onRemove={() => {
          if (previewResource) {
            handleRemoveResource(previewResource.index);
            setPreviewResource(null);
          }
        }}
      />
    </div>
  );
}
