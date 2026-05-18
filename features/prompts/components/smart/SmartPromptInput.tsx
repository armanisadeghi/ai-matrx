/**
 * @deprecated
 * SmartPromptInput is superseded by components/conversation/ConversationInput.
 * Use ConversationInput with chatConversationsSlice for new code.
 */
"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  CornerDownLeft,
  Mic,
  ChevronRight,
  Database,
  Crown,
  Bug,
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
import { formatText } from "@/utils/text/text-case-converter";
import { VariableInputComponent } from "../variable-inputs/VariableInputComponent";
import { PromptInputButton } from "../PromptInputButton";
import { ResourceChips } from "../resource-display/ResourceChips";
import type { Resource } from "../../types/resources";
import ResourcePreviewSheet from "../resource-display/ResourcePreviewSheet";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { fileHandler } from "@/features/files";
import type { NormalizedFile } from "@/features/files";
import {
  selectIsDebugMode,
  showResourceDebugIndicator,
  showExecutionStateDebug,
} from "@/lib/redux/slices/adminDebugSlice";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { toast } from "sonner";
import {
  selectVariableDefinitions,
  selectCurrentInput,
  selectResources,
  selectExpandedVariable,
  selectIsExecuting,
  selectIsLastMessageUser,
  selectAttachmentCapabilities,
  selectShowVariables,
  selectUserVariables,
  selectIsCreator,
  selectIsSuperAdminUser,
  selectShowCreatorDebug,
} from "@/lib/redux/prompt-execution/selectors";
import {
  setCurrentInput,
  updateVariable,
  removeResource,
  setExpandedVariable,
  setCreatorDebug,
  EMPTY_ARRAY,
  EMPTY_OBJECT,
} from "@/lib/redux/prompt-execution/slice";
import { executeMessage } from "@/lib/redux/prompt-execution/thunks/executeMessageThunk";
import { selectPromptsPreferences } from "@/lib/redux/selectors/userPreferenceSelectors";
import { SmartResourcePickerButton } from "./SmartResourcePickerButton";
import { CreatorOptionsModal } from "../builder/CreatorOptionsModal";

interface SmartPromptInputProps {
  /**
   * The runId of the execution instance
   * Component works without it but waits for it to become active
   */
  runId?: string;
  /** Optional UI customization props */
  placeholder?: string;
  sendButtonVariant?: "gray" | "blue" | "default";
  showShiftEnterHint?: boolean;
  /** Optional display control */
  showSubmitOnEnterToggle?: boolean; // Controls visibility of submit on enter toggle
  /** Upload configuration (with defaults) */
  uploadBucket?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  compact?: boolean;
}

/**
 * SmartPromptInput - Redux-driven prompt input component
 *
 * Fully self-reliant component that:
 * - Gets all data from Redux using runId
 * - Dispatches actions directly (no callbacks)
 * - Prevents re-renders with fine-grained selectors
 * - Handles undefined runId gracefully
 *
 * Parent components just pass runId and minimal UI props.
 */
export function SmartPromptInput({
  runId,
  placeholder,
  sendButtonVariant = "gray",
  showShiftEnterHint = false,
  showSubmitOnEnterToggle = true,
  uploadBucket = "userContent",
  uploadPath = "prompt-attachments",
  enablePasteImages = true,
  compact = false,
}: SmartPromptInputProps) {
  if (sendButtonVariant === "default") sendButtonVariant = "gray";

  const dispatch = useAppDispatch();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceSubmitRef = useRef(false);

  // ========== LOCAL STATE (UI-only) ==========
  const [previewResource, setPreviewResource] = useState<{
    resource: Resource;
    index: number;
  } | null>(null);
  const [submitOnEnter, setSubmitOnEnter] = useState(true); // Local state for now, could come from user prefs
  const [isCreatorModalOpen, setIsCreatorModalOpen] = useState(false);

  // ========== REDUX STATE (Conditional on runId) ==========
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const userPreferences = useAppSelector(selectPromptsPreferences);

  // Creator/Admin selectors
  // We need to handle runId being undefined
  const isCreator = useAppSelector((state) =>
    runId ? selectIsCreator(state, runId) : false,
  );
  const isAdmin = useAppSelector(selectIsSuperAdminUser);
  const showCreatorDebug = useAppSelector((state) =>
    runId ? selectShowCreatorDebug(state, runId) : false,
  );

  // Use user preference for submitOnEnter
  useEffect(() => {
    setSubmitOnEnter(userPreferences.submitOnEnter);
  }, [userPreferences.submitOnEnter]);

  // Instance-specific selectors (return stable defaults if runId undefined)
  const variableDefaults = useAppSelector((state) =>
    runId ? selectVariableDefinitions(state, runId) : EMPTY_ARRAY,
  );
  const chatInput = useAppSelector((state) =>
    runId ? selectCurrentInput(state, runId) : "",
  );
  const resources = useAppSelector((state) =>
    runId ? selectResources(state, runId) : EMPTY_ARRAY,
  );
  const expandedVariable = useAppSelector((state) =>
    runId ? selectExpandedVariable(state, runId) : null,
  );
  const isTestingPrompt = useAppSelector((state) =>
    runId ? selectIsExecuting(state, runId) : false,
  );
  const isLastMessageUser = useAppSelector((state) =>
    runId ? selectIsLastMessageUser(state, runId) : false,
  );
  const showVariablesFromRedux = useAppSelector((state) =>
    runId ? selectShowVariables(state, runId) : false,
  );
  const variableValues = useAppSelector((state) =>
    runId ? selectUserVariables(state, runId) : EMPTY_OBJECT,
  );

  // Show resource debug indicator when debug mode is on and resources exist
  // Debug component reads everything from Redux - it just needs the runId
  useEffect(() => {
    if (isDebugMode && resources.length > 0 && runId) {
      dispatch(showResourceDebugIndicator({ runId }));
    }
  }, [isDebugMode, resources.length, dispatch, runId]);

  // File upload hook for paste support
  // Upload via the universal handler. Adapter matches the legacy
  // `uploadFn(files): Promise<UploadResult[]>` signature consumed by
  // the prompt-execution `uploadAndAddFileResource` thunk.
  const uploadAdapter = useCallback(
    async (files: File[]): Promise<Array<{ fileId?: string; url: string }>> => {
      const folderPath = uploadPath
        ? `${uploadBucket}/${uploadPath}`
        : uploadBucket;
      const out: Array<{ fileId?: string; url: string }> = [];
      for (const file of files) {
        const normalized: NormalizedFile = await fileHandler.upload(
          { kind: "file", file },
          {
            folderPath,
            visibility: "private",
            createShareLink: true,
            shareLinkPermissionLevel: "read",
          },
        );
        out.push({ fileId: normalized.fileId, url: normalized.url ?? "" });
      }
      return out;
    },
    [uploadBucket, uploadPath],
  );

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
      if (result.success && result.text && runId) {
        // Append transcribed text to existing input
        const newText = chatInput
          ? `${chatInput}\n${result.text}`
          : result.text;
        // Set flag to submit after state update
        pendingVoiceSubmitRef.current = true;
        // Update the input value in Redux
        dispatch(setCurrentInput({ runId, input: newText }));
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
    if (pendingVoiceSubmitRef.current && chatInput.trim() && runId) {
      pendingVoiceSubmitRef.current = false;
      // Small delay to ensure Redux state is updated
      setTimeout(() => {
        handleSendMessage();
      }, 50);
    }
  }, [chatInput, runId]);

  // Handle mic button click
  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (!isTranscribing) {
      startRecording();
    }
  }, [isRecording, isTranscribing, startRecording, stopRecording]);

  // Handle resource removal
  const handleRemoveResource = useCallback(
    (index: number) => {
      if (runId) {
        dispatch(removeResource({ runId, index }));
      }
    },
    [runId, dispatch],
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
      if (!runId) return;

      try {
        const { uploadAndAddFileResource } =
          await import("@/lib/redux/prompt-execution/thunks/resourceThunks");
        await dispatch(
          uploadAndAddFileResource({
            runId,
            file,
            bucket: uploadBucket,
            path: uploadPath,
            uploadFn: uploadAdapter,
          }),
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Upload failed";
        console.error("Failed to upload pasted image:", error);
        toast.error(`Couldn't upload pasted image: ${reason}`);
      }
    },
    [runId, dispatch, uploadBucket, uploadPath, uploadAdapter],
  );

  // Setup clipboard paste
  useClipboardPaste({
    textareaRef,
    onPasteImage: handlePasteImage,
    disabled: !enablePasteImages || !runId,
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

  // Auto-focus textarea when runId becomes available (component becomes active)
  useEffect(() => {
    if (runId && textareaRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [runId]);

  // Check if all variables already have values (for visible vars mode with pre-filled values)
  const allVariablesHaveValues = variableDefaults.every((v) => {
    const value = variableValues[v.name];
    return value && value.trim() !== "";
  });

  // Determine if the send button should be disabled
  const isSendDisabled =
    !runId || isTestingPrompt || (!isLastMessageUser && !chatInput.trim());

  // Handle chat input change
  const handleChatInputChange = useCallback(
    (value: string) => {
      if (runId) {
        dispatch(setCurrentInput({ runId, input: value }));
      }
    },
    [runId, dispatch],
  );

  // Handle variable value change
  const handleVariableValueChange = useCallback(
    (variableName: string, value: string) => {
      if (runId) {
        dispatch(updateVariable({ runId, variableName, value }));
      }
    },
    [runId, dispatch],
  );

  // Handle expanded variable change
  const handleExpandedVariableChange = useCallback(
    (variable: string | null) => {
      if (runId) {
        dispatch(setExpandedVariable({ runId, variableName: variable }));
      }
    },
    [runId, dispatch],
  );

  // Handle send message
  const handleSendMessage = useCallback(() => {
    if (!runId || isSendDisabled) return;

    dispatch(
      executeMessage({
        runId,
        userInput: chatInput,
      }),
    );
  }, [runId, chatInput, isSendDisabled, dispatch]);

  // Handle Enter key on collapsed variable inputs: cycle to next, then submit or focus textarea
  const handleVariableKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const isLast = index === variableDefaults.length - 1;

        if (!isLast) {
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
          handleSendMessage();
        } else {
          textareaRef.current?.focus();
        }
      }
    },
    [variableDefaults.length, submitOnEnter, isSendDisabled, handleSendMessage],
  );

  // Handle keyboard events in the textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && submitOnEnter) {
      e.preventDefault();
      if (!isSendDisabled) {
        handleSendMessage();
      }
    }
  };

  // Determine placeholder text
  const placeholderText =
    placeholder ||
    (showVariablesFromRedux
      ? "Add a message to the bottom of prompt..."
      : "Type your message...");

  // Send button classes based on variant
  const sendButtonClasses =
    sendButtonVariant === "blue"
      ? "h-7 w-7 p-0 flex-shrink-0 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 dark:disabled:text-gray-600 text-white"
      : "h-7 w-7 p-0 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600";

  // If no runId, show loading state or minimal UI
  if (!runId) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-border overflow-hidden">
        <div className="px-2 pt-1.5">
          <textarea
            disabled
            placeholder="Initializing..."
            className="w-full bg-transparent border-none outline-none text-base md:text-xs text-gray-400 dark:text-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none"
            style={{ minHeight: "40px", maxHeight: "200px" }}
            rows={1}
          />
        </div>
        <div className="flex items-center justify-between px-2 pb-1.5">
          <div className="flex items-center gap-1" />
          <Button disabled className={sendButtonClasses}>
            <ArrowUp className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-zinc-900 rounded-lg border border-border overflow-hidden">
      {/* Debug Toolbar - Only shown in debug mode */}
      {isDebugMode && runId && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
            Debug:
          </span>
          <button
            onClick={() => dispatch(showExecutionStateDebug({ runId }))}
            className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
            title="See complete state and API payload"
          >
            <Database className="w-3 h-3" />
            <span>State & API</span>
          </button>
          {resources.length > 0 && (
            <button
              onClick={() => dispatch(showResourceDebugIndicator({ runId }))}
              className="flex items-center gap-1 px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
              title="Preview message with resources"
            >
              <Database className="w-3 h-3" />
              <span>Resources ({resources.length})</span>
            </button>
          )}
        </div>
      )}

      {/* Variable Inputs - Only shown when showVariables is true */}
      {showVariablesFromRedux && variableDefaults.length > 0 && (
        <div className="border-b border-border" data-variable-inputs>
          <div className="p-0">
            <div className="space-y-0">
              {variableDefaults.map((variable, index) => {
                const isExpanded = expandedVariable === variable.name;
                const value =
                  variableValues[variable.name] ?? variable.defaultValue ?? "";

                return (
                  <div key={variable.name}>
                    {isExpanded ? (
                      <Popover
                        open={expandedVariable === variable.name}
                        onOpenChange={(open) => {
                          if (!open) {
                            handleExpandedVariableChange(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <div
                            className="w-full flex items-center gap-2 pl-1.5 pr-3 h-12 bg-background/50 border-b border-border cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors group"
                            onClick={() =>
                              handleExpandedVariableChange(variable.name)
                            }
                            tabIndex={index + 1}
                          >
                            <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap flex-shrink-0 cursor-pointer">
                              {formatText(variable.name)}:
                            </Label>
                            <div className="flex-1 text-xs text-gray-900 dark:text-gray-200 min-w-0">
                              {value ? (
                                <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                                  {value.replace(/\n/g, " ↵ ")}
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
                            value={value}
                            onChange={(newValue) =>
                              handleVariableValueChange(variable.name, newValue)
                            }
                            variableName={variable.name}
                            customComponent={variable.customComponent}
                            onRequestClose={() =>
                              handleExpandedVariableChange(null)
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
                            handleExpandedVariableChange(variable.name)
                          }
                        >
                          {formatText(variable.name)}:
                        </Label>
                        <input
                          type="text"
                          value={
                            value.includes("\n")
                              ? value.replace(/\n/g, " ↵ ")
                              : value
                          }
                          onChange={(e) =>
                            handleVariableValueChange(
                              variable.name,
                              e.target.value,
                            )
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
                            handleExpandedVariableChange(variable.name)
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
            onChange={(e) => handleChatInputChange(e.target.value)}
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
              !showVariablesFromRedux ||
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
            <>
              {/* Creator/Admin Debug Controls */}
              {(isCreator || isAdmin) && (
                <PromptInputButton
                  icon={isAdmin ? Bug : Crown}
                  tooltip={isAdmin ? "Admin Debug Options" : "Creator Options"}
                  onClick={() => setIsCreatorModalOpen(true)}
                  active={showCreatorDebug}
                  className={
                    isAdmin
                      ? "text-red-500 hover:text-red-600"
                      : "text-amber-500 hover:text-amber-600"
                  }
                />
              )}

              {/* Voice Input */}
              <PromptInputButton
                icon={Mic}
                tooltip="Record voice message"
                onClick={handleMicClick}
                active={false}
              />

              {/* Resource Picker */}
              <SmartResourcePickerButton
                runId={runId}
                uploadBucket={uploadBucket}
                uploadPath={uploadPath}
              />

              {/* Shift+Enter hint text (alternative to buttons) */}
              {showShiftEnterHint && (
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  {submitOnEnter
                    ? "Shift+Enter for new line"
                    : "Enter for new line"}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Submit on Enter toggle - Only shown if showSubmitOnEnterToggle is true */}
          {showSubmitOnEnterToggle && (
            <PromptInputButton
              icon={CornerDownLeft}
              tooltip={
                submitOnEnter
                  ? "Submit on Enter (Click to disable)"
                  : "New line on Enter (Click to enable Submit on Enter)"
              }
              onClick={() => setSubmitOnEnter(!submitOnEnter)}
              active={submitOnEnter}
            />
          )}

          {/* Send button */}
          <Button
            onClick={handleSendMessage}
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
          if (previewResource && runId) {
            dispatch(removeResource({ runId, index: previewResource.index }));
            setPreviewResource(null);
          }
        }}
      />

      {/* Creator Options Modal */}
      {runId && (
        <CreatorOptionsModal
          runId={runId}
          isOpen={isCreatorModalOpen}
          onClose={() => setIsCreatorModalOpen(false)}
        />
      )}
    </div>
  );
}
