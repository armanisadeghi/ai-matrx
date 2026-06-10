"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useDebugContext } from "@/hooks/useDebugContext";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CornerDownLeft,
  ChevronDown,
  Loader2,
  List,
  Layers,
} from "lucide-react";
import { ResponseModeButtons, BackToStartButton } from "./InpuControlButtons";

const GuidedVariableInputs = dynamic(
  () =>
    import("@/features/cx-chat/components/user-input/GuidedVariableInputs").then(
      (m) => ({ default: m.GuidedVariableInputs }),
    ),
  { ssr: false },
);

const StackedVariableInputs = dynamic(
  () =>
    import("@/features/cx-chat/components/user-input/StackedVariableInputs").then(
      (m) => ({ default: m.StackedVariableInputs }),
    ),
  { ssr: false },
);
import { TapTargetButtonTransparent } from "@/components/icons/TapTargetButton";
import { PlusTapButton } from "@/components/icons/tap-buttons";
import { InputActionButtons } from "./InputActionButtons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
// Instance-system state
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import {
  addResource,
  removeResource,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import { fileIdToMediaRef } from "@/features/files";
import {
  selectIsExecuting,
  selectShouldShowVariables,
  selectLatestRequestStatus,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectCurrentSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { setOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import {
  selectAvailableModels,
  selectModelOptions,
  fetchAvailableModels,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ResourceChips } from "@/features/prompts/components/resource-display/ResourceChips";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { useFileUpload, composeLegacyFolderPath } from "@/features/files";
import { ModelSettingsDialog } from "@/features/prompts/components/configuration/ModelSettingsDialog";
import { toast } from "sonner";
import type { PromptSettings } from "@/features/prompts/types/core";
import type {
  ManagedResource,
  ResourceBlockType,
} from "@/features/agents/types/instance.types";
import type { Resource } from "@/features/prompts/types/resources";

/** Map user-upload MIME to API content-block type (see ResourceBlockType). */
function uploadMimeToBlockType(mime: string): ResourceBlockType {
  return mime.startsWith("image/") ? "image" : "document";
}

/** Map ResourcePickerMenu payload types → instance ResourceBlockType. */
function pickerResourceTypeToBlockType(type: string): ResourceBlockType {
  switch (type) {
    case "image_url":
    case "image":
      return "image";
    case "youtube":
      return "youtube_video";
    case "webpage":
      return "input_webpage";
    case "notes":
    case "note":
      return "input_notes";
    case "tasks":
    case "task":
      return "input_task";
    case "tables":
    case "table":
      return "input_table";
    case "audio":
      return "audio";
    case "brokers":
      return "input_data";
    case "file_url":
    case "file":
    case "upload":
    case "storage":
    default:
      return "document";
  }
}
// ============================================================================
// PROPS
// ============================================================================

export interface ConversationInputProps {
  conversationId: string;

  // ── Feature flags (all default off unless noted) ───────────────────────────
  showVariables?: boolean;
  showVoice?: boolean; // default: true
  showResourcePicker?: boolean; // default: true
  showModelPicker?: boolean; // inline model selector for dynamic_model agents
  showSettings?: boolean; // settings icon (opens ModelSettingsDialog)
  showAgentPicker?: boolean;
  showSubmitOnEnterToggle?: boolean;
  showAutoClearToggle?: boolean;

  // ── Configuration ──────────────────────────────────────────────────────────
  variableMode?: "guided" | "classic";
  uploadBucket?: string;
  uploadPath?: string;
  sendButtonVariant?: "gray" | "blue" | "default";
  seamless?: boolean; // borderless style for embedded layouts
  placeholder?: string;
  compact?: boolean;
  showShiftEnterHint?: boolean;
  /**
   * When true, renders a single-line input with flat top corners — designed to
   * attach seamlessly below a variable inputs component. The input still grows
   * but starts as one line instead of the tall welcome-screen textarea.
   */
  singleLine?: boolean;

  /** Attachment capabilities derived from model settings — gates resource types */
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };

  // ── Callbacks ──────────────────────────────────────────────────────────────
  onSend?: () => void;
  /**
   * When provided, intercepts submit instead of dispatching sendMessage.
   * Receives the current input content and resources from Redux.
   * Return true to clear the input after submit, false to keep it.
   * Used by the welcome screen to queue the firstMessage and navigate to /c/.
   */
  onSubmitOverride?: (
    content: string,
    resources: ManagedResource[],
  ) => Promise<boolean>;

  // ── Footer row ─────────────────────────────────────────────────────────────
  /**
   * When true, renders a footer row below the input:
   *   - BackToStartButton when variables are present
   *   - ResponseModeButtons when no variables
   *   - Layout toggle (guided ↔ classic) when variables are present
   */
  showFooter?: boolean;
  /** Label shown in BackToStartButton */
  agentName?: string;
  /** Called when BackToStartButton is clicked */
  onBackToStart?: () => void;
  /** Called when a ResponseModeButton is clicked */
  onAgentModeSelect?: (modeId: string, agentId: string | null) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConversationInput({
  conversationId,
  showVariables = false,
  showVoice = true,
  showResourcePicker = true,
  showModelPicker = false,
  showSettings = false,
  showAgentPicker = false,
  showSubmitOnEnterToggle = false,
  showAutoClearToggle = false,
  variableMode = "guided",
  uploadBucket = "userContent",
  uploadPath = "prompt-attachments",
  sendButtonVariant = "blue",
  seamless = false,
  placeholder = "Ask anything",
  compact = false,
  showShiftEnterHint = false,
  singleLine = false,
  attachmentCapabilities,
  onSend,
  onSubmitOverride,
  showFooter = false,
  agentName,
  onBackToStart,
  onAgentModeSelect,
}: ConversationInputProps) {
  const dispatch = useAppDispatch();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [submitOnEnter, setSubmitOnEnter] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const openDebugWindow = () =>
    dispatch(
      openOverlay({
        overlayId: "chatDebugWindow",
        data: { sessionId: conversationId },
      }),
    );
  // ── Redux state (all from instance system) ─────────────────────────────────
  const content = useAppSelector((state) =>
    selectUserInputText(conversationId)(state),
  );
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const isExecuting = useAppSelector(selectIsExecuting(conversationId));
  const hasVariables = useAppSelector(
    selectShouldShowVariables(conversationId),
  );
  const settingsForDialogRaw = useAppSelector(
    selectCurrentSettings(conversationId),
  );
  const settingsForDialog = settingsForDialogRaw ?? {};

  // ── Admin / debug ──────────────────────────────────────────────────────────
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const { publish: publishDebug } = useDebugContext("Input");

  // Publish instance state to the floating AdminIndicator whenever it changes.
  const latestStatus = useAppSelector(
    selectLatestRequestStatus(conversationId),
  );
  useEffect(() => {
    publishDebug({
      "Instance ID": conversationId,
      "Is Executing": isExecuting,
      "Request Status": latestStatus ?? "—",
      "Has Variables": hasVariables,
      "Resource Count": resources.length,
      "Input Length": content.length,
    });
  }, [
    conversationId,
    isExecuting,
    latestStatus,
    hasVariables,
    resources.length,
    content.length,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL params (for variable layout toggle) ───────────────────────────────
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const useGuidedVars = searchParams.get("vars") !== "classic";

  const toggleUrl = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (useGuidedVars) {
      params.set("vars", "classic");
    } else {
      params.delete("vars");
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [useGuidedVars, searchParams, pathname]);

  // ── Model registry ─────────────────────────────────────────────────────────
  const modelOptions = useAppSelector(selectModelOptions);
  const availableModels = useAppSelector(selectAvailableModels);

  const currentModelId = (settingsForDialog as Record<string, unknown>)
    ?.model as string | undefined;
  const currentModelName =
    modelOptions.find((o) => o.value === currentModelId)?.label ??
    currentModelId ??
    "";

  // Ensure models are loaded when model picker or settings are shown
  useEffect(() => {
    if ((showModelPicker || showSettings) && availableModels.length === 0) {
      dispatch(fetchAvailableModels());
    }
  }, [showModelPicker, showSettings, availableModels.length, dispatch]);

  // ── Resource picker state ──────────────────────────────────────────────────
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);

  // ── File upload ────────────────────────────────────────────────────────────
  const { upload, uploading: isUploading } = useFileUpload();

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const filesArray = Array.from(files);
      const folderPath = composeLegacyFolderPath(uploadBucket, uploadPath);
      for (const file of filesArray) {
        try {
          const normalized = await upload(
            { kind: "file", file },
            {
              folderPath,
              visibility: "private",
              createShareLink: true,
              shareLinkPermissionLevel: "read",
            },
          );
          const blockType = uploadMimeToBlockType(file.type);
          // Prefer cld_files UUID — backend resolves it directly without
          // a share-link redirect, and we don't ship URL-parsed metadata.
          const source = normalized.fileId
            ? fileIdToMediaRef(normalized.fileId, file.type)
            : { url: normalized.url ?? "", mime_type: file.type };
          dispatch(
            addResource({
              conversationId,
              blockType,
              source,
            }),
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Upload failed";
          toast.error(`Couldn't upload ${file.name}: ${reason}`);
        }
      }
    },
    [dispatch, conversationId, upload, uploadBucket, uploadPath],
  );

  const handleResourceSelected = useCallback(
    (resource: { type: string; data: unknown }) => {
      // Same deal as SmartAgentResourcePickerButton: refine "document"
      // → "image"/"video"/"audio" when the underlying data has a real
      // image/video/audio MIME so the AI sees it as the right kind.
      const baseBlockType = pickerResourceTypeToBlockType(resource.type);
      const blockType = refineBlockType(baseBlockType, resource.data);
      dispatch(
        addResource({
          conversationId,
          blockType,
          source: resourceDataToSource(blockType, resource.data),
        }),
      );
      setIsResourcePickerOpen(false);
    },
    [dispatch, conversationId],
  );

  // ── Clipboard paste ────────────────────────────────────────────────────────
  useClipboardPaste({
    textareaRef,
    onPasteImage: async (file) => {
      await handleFilesSelected([file]);
    },
  });

  // ── Voice / transcribe ─────────────────────────────────────────────────────
  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      if (!text) return;
      const newContent = content ? `${content} ${text}` : text;
      dispatch(
        setUserInputText({ conversationId: conversationId, text: newContent }),
      );
    },
    [content, dispatch, conversationId],
  );

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollH = textareaRef.current.scrollHeight;
      const maxH = 200;
      textareaRef.current.style.height = `${Math.min(scrollH, maxH)}px`;
    }
  }, [content]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (overrideContent?: string) => {
      const finalContent = (overrideContent ?? content).trim();
      if (isExecuting) return;

      // Welcome screen override — intercepts submit for navigation
      if (onSubmitOverride) {
        const shouldClear = await onSubmitOverride(finalContent, resources);
        if (shouldClear) {
          dispatch(
            setUserInputText({ conversationId: conversationId, text: "" }),
          );
        }
        onSend?.();
        return;
      }

      // Set the text in Redux then fire executeInstance — it assembles everything
      // (user input, variables, resources, model overrides) from instance slices.
      if (finalContent) {
        dispatch(
          setUserInputText({
            conversationId: conversationId,
            text: finalContent,
          }),
        );
      }
      dispatch(executeInstance({ conversationId }));
      dispatch(setUserInputText({ conversationId: conversationId, text: "" }));
      onSend?.();
    },
    [
      content,
      isExecuting,
      conversationId,
      resources,
      dispatch,
      onSend,
      onSubmitOverride,
    ],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (
      !submitOnEnter &&
      e.key === "Enter" &&
      (e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Model override ─────────────────────────────────────────────────────────
  const handleModelSelect = useCallback(
    (modelId: string) => {
      dispatch(setOverrides({ conversationId, changes: { model: modelId } }));
      setIsModelPickerOpen(false);
    },
    [dispatch, conversationId],
  );

  // ── Settings dialog ────────────────────────────────────────────────────────
  // selectCurrentSettings returns merged base+overrides — the instance system
  // handles diff tracking internally (selectSettingsOverridesForApi sends only deltas).
  const handleSettingsChange = useCallback(
    (newSettings: PromptSettings) => {
      const { model_id, ...rest } = newSettings as Record<string, unknown>;
      if (model_id)
        dispatch(
          setOverrides({
            conversationId,
            changes: { model: model_id as string },
          }),
        );
      if (Object.keys(rest).length > 0)
        dispatch(setOverrides({ conversationId, changes: rest }));
    },
    [dispatch, conversationId],
  );

  const isDisabled = isExecuting;

  // The bordered input box — its shape changes based on mode:
  //   default  : rounded pill (welcome screen, big input)
  //   singleLine: flat top, joined to variables above
  //   seamless : no border (embedded layouts)
  const inputBoxClass = seamless
    ? "flex flex-col w-full bg-background"
    : singleLine
      ? "flex flex-col w-full bg-background border border-border rounded-b-2xl rounded-t-none border-t-0 py-1"
      : "flex flex-col w-full bg-background border border-border rounded-3xl py-2";

  return (
    // Outer wrapper: no border, no background — just stacks children vertically
    <div className="flex flex-col w-full">
      {/* ── Variables (above the bordered input box) ──────────────────── */}
      {hasVariables && useGuidedVars && (
        <GuidedVariableInputs
          conversationId={conversationId}
          disabled={isExecuting}
          seamless
        />
      )}
      {hasVariables && !useGuidedVars && (
        <div className="max-h-[30vh] md:max-h-[45vh] overflow-y-auto overscroll-contain rounded-xl mb-1">
          <StackedVariableInputs
            conversationId={conversationId}
            disabled={isExecuting}
            minimal
          />
        </div>
      )}

      {/* ── Bordered input box ────────────────────────────────────────── */}
      <div className={inputBoxClass}>
        {/* Resource chips */}
        {resources.length > 0 && (
          <div className="px-3">
            <ResourceChips
              resources={
                resources as unknown as Parameters<
                  typeof ResourceChips
                >[0]["resources"]
              }
              onRemove={(index) => {
                const r = resources[index];
                if (!r) return;
                dispatch(
                  removeResource({
                    conversationId,
                    resourceId: r.resourceId,
                  }),
                );
              }}
              onPreview={(resource, _index) => {
                setPreviewResource(resource);
                setPreviewSheetOpen(true);
              }}
            />
          </div>
        )}

        {/* Textarea row — + button, textarea, icons, send */}
        <div className="flex items-center">
          {showResourcePicker && (
            <Popover
              open={isResourcePickerOpen}
              onOpenChange={setIsResourcePickerOpen}
            >
              <PopoverTrigger asChild>
                {isUploading ? (
                  <TapTargetButtonTransparent
                    ariaLabel="Uploading..."
                    icon={
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    }
                  />
                ) : (
                  <PlusTapButton
                    variant="transparent"
                    ariaLabel="Add attachments"
                  />
                )}
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-56 p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <ResourcePickerMenu
                  onResourceSelected={handleResourceSelected}
                  onClose={() => setIsResourcePickerOpen(false)}
                  attachmentCapabilities={
                    attachmentCapabilities ?? {
                      supportsImageUrls: true,
                      supportsFileUrls: true,
                      supportsYoutubeVideos: true,
                      supportsAudio: true,
                    }
                  }
                  onSettingsClick={
                    showSettings ? () => setIsSettingsOpen(true) : undefined
                  }
                  onDebugClick={isAdmin ? openDebugWindow : undefined}
                  showDebugActive={isAdmin}
                />
              </PopoverContent>
            </Popover>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) =>
              dispatch(
                setUserInputText({
                  conversationId: conversationId,
                  text: e.target.value,
                }),
              )
            }
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            className={[
              "flex-1 resize-none bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/70",
              "focus:outline-none overflow-y-auto leading-[18px]",
              singleLine
                ? "py-[7px] min-h-[34px] max-h-[34px]"
                : "py-[9px] min-h-[36px] max-h-[200px]",
            ].join(" ")}
            rows={1}
          />

          <InputActionButtons
            showVoice={showVoice}
            onTranscriptionComplete={handleTranscriptionComplete}
            isExecuting={isExecuting}
            isDisabled={isDisabled}
            isUploading={isUploading}
            sendButtonVariant={sendButtonVariant}
            onSubmit={() => handleSubmit()}
            onDebugClick={isAdmin ? openDebugWindow : undefined}
          />
        </div>

        {/* Model picker */}
        {showModelPicker && (
          <div className="relative px-3">
            <button
              type="button"
              onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>{currentModelName || "Select model"}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {isModelPickerOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-60 overflow-y-auto rounded-xl border border-border bg-background shadow-lg z-50">
                {modelOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleModelSelect(opt.value)}
                    className={[
                      "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors",
                      currentModelId === opt.value
                        ? "text-primary font-medium"
                        : "text-foreground",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit hint */}
        {showShiftEnterHint && (
          <p className="text-[10px] text-muted-foreground/60 px-3">
            <kbd className="text-[9px]">⌘+Enter</kbd> to send,{" "}
            <kbd className="text-[9px]">Shift+Enter</kbd> for new line
          </p>
        )}

        {/* Submit-on-enter toggle */}
        {showSubmitOnEnterToggle && (
          <div className="flex items-center gap-2 px-3">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSubmitOnEnter(!submitOnEnter)}
            >
              <div
                className={`w-6 h-3.5 rounded-full transition-colors ${submitOnEnter ? "bg-blue-500" : "bg-muted"} relative`}
              >
                <div
                  className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${submitOnEnter ? "translate-x-[13px]" : "translate-x-0.5"}`}
                />
              </div>
              <CornerDownLeft className="w-3 h-3" />
              <span>Enter to send</span>
            </button>
          </div>
        )}

        {/* Settings dialog */}
        {showSettings && (
          <ModelSettingsDialog
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            modelId={currentModelId ?? ""}
            models={availableModels}
            settings={settingsForDialog}
            onSettingsChange={handleSettingsChange}
            showModelSelector
            onModelChange={handleModelSelect}
          />
        )}

        {/* Admin debug modal */}
      </div>

      {/* ── Footer row (outside the bordered box, below it) ───────────── */}
      {showFooter && (
        <div className="flex items-center justify-between mt-2 pb-1">
          {hasVariables ? (
            <BackToStartButton
              onBack={onBackToStart ?? (() => {})}
              agentName={agentName}
            />
          ) : (
            <ResponseModeButtons
              disabled={isExecuting}
              selectedAgentId={null}
              onModeSelect={onAgentModeSelect ?? (() => {})}
            />
          )}
          {hasVariables && (
            <button
              type="button"
              onClick={() => router.replace(toggleUrl)}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
              title={
                useGuidedVars
                  ? "Switch to classic variable view"
                  : "Switch to guided variable view"
              }
            >
              {useGuidedVars ? (
                <List className="w-4 h-4" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationInput;
