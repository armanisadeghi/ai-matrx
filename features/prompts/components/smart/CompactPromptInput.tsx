"use client";
import React, { useState, useRef, useCallback } from "react";
import { Mic, Database, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatText } from "@/utils/text/text-case-converter";
import { VariableInputComponent } from "../variable-inputs/VariableInputComponent";
import { PromptInputButton } from "../PromptInputButton";
import { ResourceChips } from "../resource-display/ResourceChips";
import type { Resource } from "../../types/resources";
import ResourcePreviewSheet from "../resource-display/ResourcePreviewSheet";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { fileHandler } from "@/features/file-handler/handler";
import type { NormalizedFile } from "@/features/file-handler/types";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { toast } from "sonner";
import {
  selectVariableDefinitions,
  selectCurrentInput,
  selectResources,
  selectUserVariables,
} from "@/lib/redux/prompt-execution/selectors";
import {
  setCurrentInput,
  updateVariable,
  removeResource,
} from "@/lib/redux/prompt-execution/slice";
import { SmartResourcePickerButton } from "./SmartResourcePickerButton";

interface CompactPromptInputProps {
  /**
   * The runId of the execution instance
   * Component works without it but waits for it to become active
   */
  runId?: string;
  /** Optional UI customization props */
  placeholder?: string;
  /** Upload configuration (with defaults) */
  uploadBucket?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
  /** Optional callbacks */
  onCancel?: () => void;
  onSubmit?: () => void;
  /** Execute button state (passed from modal) */
  isExecuting?: boolean;
  isSendDisabled?: boolean;
}

/**
 * CompactPromptInput - Condensed Redux-driven prompt input component
 *
 * Space-efficient version of SmartPromptInput optimized for modal dialogs.
 * Features:
 * - Variables displayed directly (no popovers)
 * - Single-line input instead of textarea
 * - Minimal padding and spacing
 * - Full feature parity with SmartPromptInput
 *
 * Ideal for inline AI triggers (context menus, toolbars, etc.)
 */
export function CompactPromptInput({
  runId,
  placeholder = "Additional instructions (optional)...",
  uploadBucket = "userContent",
  uploadPath = "prompt-attachments",
  enablePasteImages = true,
  onCancel,
  onSubmit,
  isExecuting = false,
  isSendDisabled = false,
}: CompactPromptInputProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  // ========== LOCAL STATE (UI-only) ==========
  const [previewResource, setPreviewResource] = useState<{
    resource: Resource;
    index: number;
  } | null>(null);

  // ========== REDUX STATE (Conditional on runId) ==========
  // Instance-specific selectors (return stable defaults if runId undefined)
  const variableDefaults = useAppSelector((state) =>
    runId ? selectVariableDefinitions(state, runId) : [],
  );
  const chatInput = useAppSelector((state) =>
    runId ? selectCurrentInput(state, runId) : "",
  );
  const resources = useAppSelector((state) =>
    runId ? selectResources(state, runId) : [],
  );
  const variableValues = useAppSelector((state) =>
    runId ? selectUserVariables(state, runId) : {},
  );

  // File upload via the universal handler — wrapper matches the legacy
  // `uploadFn(files): Promise<UploadResult[]>` signature consumed by the
  // prompt-execution `uploadAndAddFileResource` thunk.
  const uploadAdapter = useCallback(
    async (
      files: File[],
    ): Promise<Array<{ fileId?: string; url: string }>> => {
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
        out.push({
          fileId: normalized.fileId,
          url: normalized.url ?? "",
        });
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
        // For single-line input, replace value instead of appending
        dispatch(setCurrentInput({ runId, input: result.text }));
      }
    },
    onError: (error) => {
      toast.error("Transcription failed", {
        description: error,
      });
    },
    autoTranscribe: true,
  });

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
        const { uploadAndAddFileResource } = await import(
          "@/lib/redux/prompt-execution/thunks/resourceThunks"
        );
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
        const reason =
          error instanceof Error ? error.message : "Upload failed";
        console.error("Failed to upload pasted image:", error);
        toast.error(`Couldn't upload pasted image: ${reason}`);
      }
    },
    [runId, dispatch, uploadBucket, uploadPath, uploadAdapter],
  );

  // Setup clipboard paste - cast input ref to textarea ref type (paste events work identically)
  useClipboardPaste({
    textareaRef: inputRef as unknown as React.RefObject<HTMLTextAreaElement>,
    onPasteImage: handlePasteImage,
    disabled: !enablePasteImages || !runId,
  });

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

  // If no runId, show loading state
  if (!runId) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1 border rounded-md px-2 h-9 bg-gray-50 dark:bg-zinc-900 border-gray-300 dark:border-gray-700">
          <input
            disabled
            placeholder="Initializing..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-400 dark:text-gray-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 -mx-3">
      {/* Variable Inputs - Directly visible, scrollable */}
      {variableDefaults.length > 0 && (
        <div className="space-y-0 bg-background mb-0">
          {variableDefaults.map((variable, index) => {
            const value =
              variableValues[variable.name] ?? variable.defaultValue ?? "";
            const isLast = index === variableDefaults.length - 1;
            const isFirst = index === 0;

            return (
              <div
                key={variable.name}
                className={!isLast ? "py-1 border-b-2 border-border" : ""}
              >
                <div
                  className={`px-3 ${isFirst ? "pt-2.5" : "pt-2"} ${!isLast ? "pb-2" : "pb-2.5"}`}
                >
                  <VariableInputComponent
                    value={value}
                    onChange={(newValue) =>
                      handleVariableValueChange(variable.name, newValue)
                    }
                    variableName={formatText(variable.name)}
                    customComponent={variable.customComponent}
                    helpText={variable.helpText}
                    compact={true}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input Footer Section - with subtle background */}
      <div className="bg-background border-t border-border px-1 pt-3">
        {/* Resource Chips Display */}
        {resources.length > 0 && (
          <div className="px-0 mb-2">
            <ResourceChips
              resources={resources}
              onRemove={handleRemoveResource}
              onPreview={handlePreviewResource}
            />
          </div>
        )}

        {/* Voice Input - Show transcription loader when processing */}
        {isTranscribing && !isRecording ? (
          <div className="px-1 py-0.5 mb-2">
            <TranscriptionLoader
              message="Transcribing"
              duration={duration}
              size="sm"
            />
          </div>
        ) : isRecording ? (
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-md px-2 py-1 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
              Recording... {Math.floor(duration / 60)}:
              {String(duration % 60).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Stop
            </button>
          </div>
        ) : null}

        {/* Single-Line Input with controls - Execute button inline */}
        <div className="flex items-stretch gap-1">
          <div className="flex-1 flex items-center gap-0.5 border rounded-md px-1.5 h-8 bg-white dark:bg-zinc-900 border-gray-300 dark:border-gray-700">
            <input
              ref={inputRef}
              type="text"
              value={chatInput}
              onChange={(e) => handleChatInputChange(e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-200 placeholder:text-xs placeholder:text-gray-400 dark:placeholder:text-gray-500 min-w-0"
              style={{ fontSize: "16px" }} // iOS zoom prevention
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  onSubmit &&
                  !isSendDisabled
                ) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />

            {/* Voice Input Button */}
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
          </div>

          {/* Execute Button - Inline with input, exact same height */}
          <Button
            onClick={onSubmit}
            disabled={isSendDisabled}
            className="h-8 w-8 p-0 flex-shrink-0 min-h-8"
            title="Execute (Enter)"
          >
            {isExecuting ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
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
    </div>
  );
}
