"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CornerDownLeft,
  ChevronDown,
  Loader2,
  Database,
  List,
  Layers,
} from "lucide-react";
import {
  ResponseModeButtons,
  BackToStartButton,
} from "@/features/public-chat/components/AgentSelector";

const GuidedVariableInputs = dynamic(
  () =>
    import("@/features/public-chat/components/GuidedVariableInputs").then(
      (m) => ({ default: m.GuidedVariableInputs }),
    ),
  { ssr: false },
);

const PublicVariableInputs = dynamic(
  () =>
    import("@/features/public-chat/components/PublicVariableInputs").then(
      (m) => ({ default: m.PublicVariableInputs }),
    ),
  { ssr: false },
);
import {
  TapTargetButtonTransparent,
  TapTargetButtonSolid,
} from "@/components/icons/TapTargetButton";
import {
  PlusTapButton,
  ArrowUpTapButton,
  MicTapButton,
  MicOffTapButton,
} from "@/components/icons/tap-buttons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { chatConversationsActions } from "./_legacy-stubs";
import { sendMessage } from "./_legacy-stubs";
import {
  selectCurrentInput,
  selectResources,
  selectVariableDefaults,
  selectIsExecuting,
  selectExpandedVariable,
  selectShowVariables,
  selectUIState,
  selectShowDebugInfo,
} from "./_legacy-stubs";
import {
  selectAvailableModels,
  selectModelOptions,
  fetchAvailableModels,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectActiveChatAgent } from "./_legacy-stubs";
import { selectIsDebugMode } from "@/lib/redux/slices/adminDebugSlice";
import { ResourceChips } from "@/features/prompts/components/resource-display/ResourceChips";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { useFileUpload } from "@/features/files";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { ModelSettingsDialog } from "@/features/prompts/components/configuration/ModelSettingsDialog";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { toast } from "sonner";
import type { Resource } from "@/features/prompts/types/resources";
import type {
  PromptSettings,
  PromptVariable,
} from "@/features/prompts/types/core";

// ============================================================================
// PROPS
// ============================================================================

export interface ConversationInputProps {
  sessionId: string;

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
    resources: Resource[],
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
  sessionId,
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
  const pendingVoiceSubmitRef = useRef(false);
  const [submitOnEnter, setSubmitOnEnter] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const openDebugWindow = () =>
    dispatch(
      openOverlay({ overlayId: "chatDebugWindow", data: { sessionId } }),
    );

  // ── Redux state ────────────────────────────────────────────────────────────
  const content = useAppSelector((state) =>
    selectCurrentInput(state, sessionId),
  );
  const resources = useAppSelector((state) =>
    selectResources(state, sessionId),
  );
  const variableDefaults = useAppSelector((state) =>
    selectVariableDefaults(state, sessionId),
  );
  const isExecuting = useAppSelector((state) =>
    selectIsExecuting(state, sessionId),
  );
  const expandedVariable = useAppSelector((state) =>
    selectExpandedVariable(state, sessionId),
  );
  const showVarsInState = useAppSelector((state) =>
    selectShowVariables(state, sessionId),
  );
  const uiState = useAppSelector((state) => selectUIState(state, sessionId));

  const session = useAppSelector(
    // TEMPORARY STUB — cx refactor removed chatConversations slice.
    (state) =>
      (
        state as unknown as {
          chatConversations?: {
            sessions?: Record<
              string,
              { agentId?: string; conversationId?: string | null }
            >;
          };
        }
      ).chatConversations?.sessions?.[sessionId],
  );
  const agentId = session?.agentId ?? "";
  const conversationId = session?.conversationId ?? null;

  // ── Agent (for footer ResponseModeButtons) ────────────────────────────────
  const selectedAgent = useAppSelector(selectActiveChatAgent);

  // ── Admin / debug ──────────────────────────────────────────────────────────
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isGlobalDebugMode = useAppSelector(selectIsDebugMode);
  const showDebugInfo = useAppSelector((s) =>
    selectShowDebugInfo(s, sessionId),
  );

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

  // Flat values map from variableDefaults — for variable input components
  const variableValues = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        variableDefaults.map((v) => [v.name, String(v.defaultValue ?? "")]),
      ),
    [variableDefaults],
  );

  const handleVariableChange = useCallback(
    (name: string, value: string) => {
      dispatch(
        chatConversationsActions.updateVariable({
          sessionId,
          variableName: name,
          value,
        }),
      );
    },
    [dispatch, sessionId],
  );

  // ── Model registry ─────────────────────────────────────────────────────────
  const modelOptions = useAppSelector(selectModelOptions);
  const availableModels = useAppSelector(selectAvailableModels);

  // Ensure models are loaded when model picker or settings are shown
  useEffect(() => {
    if ((showModelPicker || showSettings) && availableModels.length === 0) {
      dispatch(fetchAvailableModels());
    }
  }, [showModelPicker, showSettings, availableModels.length, dispatch]);

  const currentModelId = uiState?.modelOverride || null;
  const currentModelName = currentModelId
    ? (modelOptions.find((m) => m.value === currentModelId)?.label ??
      currentModelId)
    : null;

  // ── Resource picker state ──────────────────────────────────────────────────
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);

  // ── File upload ────────────────────────────────────────────────────────────
  const { upload, uploading: isUploading } = useFileUpload();

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const filesArray = Array.from(files);
      const folderPath = uploadPath
        ? `${uploadBucket}/${uploadPath}`
        : uploadBucket;
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
          // Store the cld_files UUID as `id` and the share URL as `url`.
          // When the resource is submitted to the AI, the payload builder
          // prefers `file_id` over the URL.
          const resource: Resource = {
            type: file.type.startsWith("image/") ? "image_link" : "file",
            data: {
              id: normalized.fileId,
              url: normalized.url,
              filename: file.name,
              mime_type: file.type,
              size: file.size,
            },
          } as unknown as Resource;
          dispatch(
            chatConversationsActions.addResource({ sessionId, resource }),
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Upload failed";
          toast.error(`Couldn't upload ${file.name}: ${reason}`);
        }
      }
    },
    [dispatch, sessionId, upload, uploadBucket, uploadPath],
  );

  const handleResourceSelected = useCallback(
    (resource: { type: string; data: unknown }) => {
      dispatch(
        chatConversationsActions.addResource({
          sessionId,
          resource: resource as Resource,
        }),
      );
      setIsResourcePickerOpen(false);
    },
    [dispatch, sessionId],
  );

  // ── Clipboard paste ────────────────────────────────────────────────────────
  useClipboardPaste({
    textareaRef,
    onPasteImage: async (file) => {
      await handleFilesSelected([file]);
    },
  });

  // ── Voice / transcribe ─────────────────────────────────────────────────────
  const { isRecording, isTranscribing, startRecording, stopRecording } =
    useRecordAndTranscribe({
      onTranscriptionComplete: (result) => {
        if (!result.success || !result.text) return;
        const newContent = content ? `${content} ${result.text}` : result.text;
        dispatch(
          chatConversationsActions.setCurrentInput({
            sessionId,
            input: newContent,
          }),
        );
        if (pendingVoiceSubmitRef.current) {
          pendingVoiceSubmitRef.current = false;
          handleSubmit(newContent);
        }
      },
      onError: (err) =>
        toast.error("Transcription failed", { description: err }),
    });

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
      if (!finalContent || isExecuting) return;

      // Welcome screen override — intercepts submit before sendMessage
      if (onSubmitOverride) {
        const shouldClear = await onSubmitOverride(
          finalContent,
          resources as unknown as Resource[],
        );
        if (shouldClear) {
          dispatch(
            chatConversationsActions.setCurrentInput({ sessionId, input: "" }),
          );
          dispatch(chatConversationsActions.clearResources(sessionId));
        }
        onSend?.();
        return;
      }

      if (!agentId) return;

      // Build variables from variableDefaults
      const variables: Record<string, string> = {};
      variableDefaults.forEach((v) => {
        if (v.defaultValue !== undefined && v.defaultValue !== null) {
          variables[v.name] = String(v.defaultValue);
        }
      });

      // Convert Resource[] to ConversationResource[] for the API
      const conversationResources =
        resources.length > 0
          ? resources.map((r) => ({
              type: r.type,
              data: r.data as Record<string, unknown>,
            }))
          : undefined;

      dispatch(
        sendMessage({
          sessionId,
          content: finalContent,
          resources: conversationResources,
          variables: Object.keys(variables).length > 0 ? variables : undefined,
        }),
      );

      dispatch(
        chatConversationsActions.setCurrentInput({ sessionId, input: "" }),
      );
      dispatch(chatConversationsActions.clearResources(sessionId));
      onSend?.();
    },
    [
      content,
      isExecuting,
      agentId,
      sessionId,
      variableDefaults,
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

  const handleVoiceMicToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // ── Model override ─────────────────────────────────────────────────────────
  const handleModelSelect = useCallback(
    (modelId: string) => {
      dispatch(
        chatConversationsActions.updateUIState({
          sessionId,
          updates: { modelOverride: modelId },
        }),
      );
      setIsModelPickerOpen(false);
    },
    [dispatch, sessionId],
  );

  // ── Settings dialog ────────────────────────────────────────────────────────
  // Build PromptSettings from current uiState for the dialog
  const settingsForDialog: PromptSettings = {
    model_id: uiState?.modelOverride ?? undefined,
    ...((uiState?.modelSettings as Record<string, unknown>) ?? {}),
  };

  const handleSettingsChange = useCallback(
    (newSettings: PromptSettings) => {
      const { model_id, ...restSettings } = newSettings;
      if (model_id) {
        dispatch(
          chatConversationsActions.updateUIState({
            sessionId,
            updates: { modelOverride: model_id },
          }),
        );
      }
      // Store full model settings (temperature, max_tokens, etc.)
      dispatch(
        chatConversationsActions.updateUIState({
          sessionId,
          updates: { modelSettings: restSettings },
        }),
      );
    },
    [dispatch, sessionId],
  );

  const hasVariables = variableDefaults.length > 0;
  const hasContent = content.trim().length > 0;
  const isDisabled = isExecuting || (!agentId && !onSubmitOverride);

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
          variableDefaults={variableDefaults as unknown as PromptVariable[]}
          values={variableValues}
          onChange={handleVariableChange}
          disabled={isExecuting}
          submitOnEnter
          onSubmit={onSubmitOverride}
          seamless
        />
      )}
      {hasVariables && !useGuidedVars && (
        <div className="max-h-[30vh] md:max-h-[45vh] overflow-y-auto overscroll-contain rounded-xl mb-1">
          <PublicVariableInputs
            variableDefaults={variableDefaults as unknown as PromptVariable[]}
            values={variableValues}
            onChange={handleVariableChange}
            disabled={isExecuting}
            minimal
            onSubmit={onSubmitOverride}
            submitOnEnter
          />
        </div>
      )}

      {/* ── Bordered input box ────────────────────────────────────────── */}
      <div className={inputBoxClass}>
        {/* Admin global debug toolbar */}
        {isAdmin && isGlobalDebugMode && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-950/20 border-b border-red-800/40 rounded-t-2xl">
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">
              Debug
            </span>
            <button
              onClick={openDebugWindow}
              className="flex items-center gap-1 px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-medium rounded transition-colors"
              title="Open debug modal"
            >
              <Database className="w-2.5 h-2.5" />
              <span>Session State</span>
            </button>
            <span className="text-[9px] text-red-400/70 font-mono truncate">
              {sessionId.slice(0, 8)}…
            </span>
          </div>
        )}

        {/* Resource chips */}
        {resources.length > 0 && (
          <div className="px-3">
            <ResourceChips
              resources={resources as unknown as Resource[]}
              onRemove={(resource) => {
                const r = resource as unknown as { id: string };
                dispatch(
                  chatConversationsActions.removeResource({
                    sessionId,
                    resourceId: r.id ?? "",
                  }),
                );
              }}
              onPreview={(resource) => {
                setPreviewResource(resource);
                setPreviewSheetOpen(true);
              }}
            />
          </div>
        )}

        {/* Transcribing loader */}
        {isTranscribing && <TranscriptionLoader />}

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
                  showDebugActive={showDebugInfo}
                />
              </PopoverContent>
            </Popover>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) =>
              dispatch(
                chatConversationsActions.setCurrentInput({
                  sessionId,
                  input: e.target.value,
                }),
              )
            }
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Recording..." : placeholder}
            disabled={isDisabled || isRecording}
            className={[
              "flex-1 resize-none bg-transparent text-foreground placeholder:text-muted-foreground",
              "focus:outline-none overflow-y-auto leading-[18px]",
              singleLine
                ? "py-[7px] min-h-[34px] max-h-[34px]"
                : "py-[9px] min-h-[36px] max-h-[200px]",
              compact ? "text-xs" : "text-sm",
            ].join(" ")}
            style={{ fontSize: "16px" }}
            rows={1}
          />

          {showVoice &&
            (isTranscribing && !isRecording ? (
              <TapTargetButtonTransparent
                ariaLabel="Transcribing..."
                icon={
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                }
              />
            ) : isRecording ? (
              <MicOffTapButton
                variant="transparent"
                onClick={handleVoiceMicToggle}
                className="text-red-500"
              />
            ) : (
              <MicTapButton
                variant="transparent"
                onClick={handleVoiceMicToggle}
              />
            ))}

          {isExecuting ? (
            <TapTargetButtonSolid
              ariaLabel="Sending..."
              bgColor={
                sendButtonVariant === "gray" ? "bg-muted" : "bg-blue-600"
              }
              hoverBgColor={
                sendButtonVariant === "gray"
                  ? "hover:bg-muted/80"
                  : "hover:bg-blue-700"
              }
              iconColor={
                sendButtonVariant === "gray" ? "text-foreground" : "text-white"
              }
              icon={<Loader2 className="w-4 h-4 animate-spin" />}
            />
          ) : (
            <ArrowUpTapButton
              variant="solid"
              onClick={() => handleSubmit()}
              disabled={!hasContent || isDisabled || isUploading}
              ariaLabel="Send message"
              bgColor={
                sendButtonVariant === "gray" ? "bg-muted" : "bg-blue-600"
              }
              hoverBgColor={
                sendButtonVariant === "gray"
                  ? "hover:bg-muted/80"
                  : "hover:bg-blue-700"
              }
              iconColor={
                sendButtonVariant === "gray" ? "text-foreground" : "text-white"
              }
            />
          )}
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
            modelId={uiState?.modelOverride ?? ""}
            models={availableModels}
            settings={settingsForDialog}
            onSettingsChange={handleSettingsChange}
          />
        )}
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
              selectedAgentId={selectedAgent.promptId}
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
