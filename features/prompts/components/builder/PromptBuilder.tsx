"use client";

import React, { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  createUserPrompt,
  updateUserPrompt,
} from "@/lib/redux/thunks/promptCrudThunks";
import { PromptMessage } from "@/features/prompts/types/core";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  useModelControls,
  getModelDefaults,
} from "@/features/prompts/hooks/useModelControls";
import { useAppSelector, useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { usePromptRunner } from "@/features/prompts/hooks/usePromptRunner";
import {
  AiModelsPreferences,
  PromptsPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";
import { updateDebugData } from "@/lib/redux/preferences/adminDebugSlice";
import { submitChatFastAPI as createAndSubmitTask } from "@/lib/redux/socket-io/thunks/submitChatFastAPI";
import {
  selectPrimaryResponseTextByTaskId,
  selectPrimaryResponseEndedByTaskId,
  selectPrimaryResponseDataByTaskId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { toast } from "sonner";
import {
  PromptMessageRole,
  PromptSettings,
} from "@/features/prompts/types/core";
import {
  PromptVariable,
  VariableCustomComponent,
} from "@/features/prompts/types/core";
import type { Resource } from "../../types/resources";
import { useResourceMessageFormatter } from "@/features/prompts/hooks/useResourceMessageFormatter";
import { useIsMobile } from "@/hooks/use-mobile";
import { selectPromptsPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { PromptBuilderDesktop } from "./PromptBuilderDesktop";
import { PromptBuilderMobile } from "./PromptBuilderMobile";
import {
  SharedPromptWarningModal,
  SharedPromptBanner,
} from "./SharedPromptWarningModal";
import type { PromptAccessInfo } from "@/features/prompts/types/shared";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";
import { ModelChangeConflictModal } from "./ModelChangeConflictModal";
import type { ModelChangeConflictData } from "./ModelChangeConflictModal";
import { useModelChangeConflict } from "@/features/prompts/hooks/useModelChangeConflict";
import { PromptBuilderErrorBoundary } from "./PromptBuilderErrorBoundary";
import { usePromptAutoSave } from "../../hooks/usePromptAutoSave";
import type { Json } from "@/types/database.types";
import {
  normalizePromptMessagesFromDb,
  normalizePromptSettingsFromDb,
  normalizePromptVariablesFromDb,
} from "../../utils/normalize-prompt-db-json";

interface PromptBuilderProps {
  models: any[];
  initialData?: {
    id?: string;
    name?: string;
    version?: number;
    updatedAt?: string | null;
    messages?: Json | null;
    variableDefaults?: Json | null;
    settings?: Json | null;
    tags?: string[];
    category?: string;
    isFavorite?: boolean;
    isArchived?: boolean;
    modelId?: string;
    outputFormat?: string;
    outputSchema?: Json | null;
    description?: string;
  };
  availableTools?: any[];
  accessInfo?: PromptAccessInfo;
  /** Optional custom save handler. When provided, bypasses Redux prompt CRUD and calls this instead. */
  onCustomSave?: (data: {
    id?: string;
    name: string;
    messages: PromptMessage[];
    variableDefaults: PromptVariable[];
    settings: Record<string, unknown>;
  }) => Promise<void>;
  /** Label override for the back/breadcrumb context (e.g. "Prompt Builtins") */
  contextLabel?: string;
  /** Optional href for a back link rendered in the layout header */
  backHref?: string;
  /** Optional label for the back link (defaults to contextLabel) */
  backLabel?: string;
}

export function PromptBuilder(props: PromptBuilderProps) {
  return (
    <PromptBuilderErrorBoundary promptId={props.initialData?.id}>
      <PromptBuilderInner {...props} />
    </PromptBuilderErrorBoundary>
  );
}

function PromptBuilderInner({
  models,
  initialData,
  availableTools,
  accessInfo,
  onCustomSave,
  contextLabel,
  backHref,
  backLabel,
}: PromptBuilderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const basePath = usePromptsBasePath();
  const modelPreferences = useAppSelector(
    (state: RootState) => state.userPreferences.aiModels as AiModelsPreferences,
  );
  const { formatMessageWithResources } = useResourceMessageFormatter();
  const promptsPreferences: PromptsPreferences = useAppSelector(
    selectPromptsPreferences,
  );

  // Mobile detection and tab state
  const isMobile = useIsMobile();
  const [mobileActiveTab, setMobileActiveTab] = useState<"edit" | "test">(
    "edit",
  );

  // Shared prompt state
  const [showSharedWarningModal, setShowSharedWarningModal] = useState(false);
  const [hasAcknowledgedSharedPrompt, setHasAcknowledgedSharedPrompt] =
    useState(false);
  const [isCreatingCopy, setIsCreatingCopy] = useState(false);

  // Determine if this is a shared prompt (not owner, has permission)
  const isSharedPrompt =
    accessInfo && !accessInfo.isOwner && accessInfo.permissionLevel !== null;
  const canEditOriginal = accessInfo?.canEdit ?? true; // Default to true for owned prompts

  if (!models || models.length === 0) {
    return (
      <div className="p-8 text-center text-destructive">
        Error: No models available
      </div>
    );
  }

  // Determine if we're in edit mode based on whether we have an existing prompt ID
  const isEditMode = !!initialData?.id;

  // Get initial model ID from settings.model_id (single source of truth)
  const getInitialModelId = () => {
    if (
      initialData?.settings &&
      typeof initialData.settings === "object" &&
      "model_id" in initialData.settings
    ) {
      return initialData.settings.model_id as string;
    }
    // Default for new prompts
    return modelPreferences?.defaultModel || models[0]?.id;
  };

  const initialModelId = getInitialModelId();
  const initialModel = models.find((m) => m.id === initialModelId) || models[0];

  // Get initial modelConfig from settings (single source of truth).
  // - Existing prompt (has id): load exactly what was saved, nothing added.
  // - Brand new prompt (no id): seed with model defaults so the user has a starting point.
  const getInitialModelConfig = () => {
    if (initialData?.id) {
      // Existing prompt — use only what was saved, never inject defaults
      if (initialData.settings && typeof initialData.settings === "object") {
        const { model_id, output_format, ...config } =
          initialData.settings as Record<string, any>;
        // Migrate legacy output_format from DB -> response_format dict
        if (
          output_format &&
          typeof output_format === "string" &&
          output_format !== "text"
        ) {
          if (!config.response_format) {
            config.response_format = { type: output_format };
          }
        }
        return config;
      }
      return {};
    }

    // New prompt — seed with model defaults as a starting point
    return getModelDefaults(initialModel);
  };

  // Extract system message and user/assistant messages from initialData
  const getInitialMessages = () => {
    const all = normalizePromptMessagesFromDb(initialData?.messages ?? null);
    if (all.length === 0) return [];
    return all.filter((m) => m.role !== "system");
  };

  const getInitialDeveloperMessage = () => {
    const all = normalizePromptMessagesFromDb(initialData?.messages ?? null);
    const systemMessage = all.find((m) => m.role === "system");
    return systemMessage?.content ?? "";
  };

  // Core state - model state holds the model ID (UUID)
  const [promptName, setPromptName] = useState(initialData?.name || "");
  const [promptDescription, setPromptDescription] = useState(
    initialData?.description ?? "",
  );
  const [model, setModel] = useState(initialModelId);
  const [modelConfig, setModelConfig] = useState<PromptSettings>(
    getInitialModelConfig(),
  );

  const [developerMessage, setDeveloperMessage] = useState(
    getInitialDeveloperMessage(),
  );
  const [messages, setMessages] =
    useState<PromptMessage[]>(getInitialMessages());

  // Get model controls to check capabilities
  const { normalizedControls } = useModelControls(models, model);

  // Check if the current model supports tools
  const modelSupportsTools = normalizedControls?.tools?.default ?? false;

  // Model change conflict resolution
  const { buildConflictData } = useModelChangeConflict(models);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingConflictData, setPendingConflictData] =
    useState<ModelChangeConflictData | null>(null);

  // Check attachment capabilities from actual prompt settings (not just model defaults)
  const supportsImageUrls = modelConfig?.image_urls ?? false;
  const supportsFileUrls = modelConfig?.file_urls ?? false;
  const supportsYoutubeVideos = modelConfig?.youtube_videos ?? false;

  // Update debug data when model controls or config changes
  useEffect(() => {
    dispatch(
      updateDebugData({
        "Model Controls": normalizedControls,
        "Current Settings": modelConfig,
        "Selected Model ID": model,
        "Unmapped Controls": normalizedControls?.unmappedControls,
      }),
    );
  }, [normalizedControls, modelConfig, model, dispatch]);

  // Variables state - single source of truth
  const getInitialVariableDefaults = () =>
    normalizePromptVariablesFromDb(initialData?.variableDefaults ?? null);

  const [variableDefaults, setVariableDefaults] = useState<PromptVariable[]>(
    getInitialVariableDefaults(),
  );
  const [expandedVariable, setExpandedVariable] = useState<string | null>(null);

  // Tools state - available tools list
  const [isAddingTool, setIsAddingTool] = useState(false);

  // Warn once on mount if any saved tools are no longer available
  useEffect(() => {
    if (!availableTools || availableTools.length === 0) return;
    const savedTools: string[] = modelConfig.tools || [];
    if (savedTools.length === 0) return;
    const availableNames = new Set(availableTools.map((t) => t.name as string));
    const missing = savedTools.filter((name) => !availableNames.has(name));
    if (missing.length > 0) {
      toast.warning(
        `${missing.length} tool${missing.length > 1 ? "s" : ""} no longer exist`,
        {
          description: `The following saved tool${missing.length > 1 ? "s" : ""} could not be found and will cause errors: ${missing.join(", ")}. Open configurations to review.`,
          duration: 8000,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-screen editor state
  type MessageItem =
    | { type: "system"; index: -1 }
    | { type: "message"; index: number };
  const [isFullScreenEditorOpen, setIsFullScreenEditorOpen] = useState(false);
  const [
    fullScreenEditorInitialSelection,
    setFullScreenEditorInitialSelection,
  ] = useState<MessageItem | null>(null);

  // Settings modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Prompt runner via Redux
  const { openPrompt } = usePromptRunner();

  const [chatInput, setChatInput] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [conversationMessages, setConversationMessages] = useState<
    Array<{
      role: string;
      content: string;
      taskId?: string;
      audioUrl?: string;
      audioMimeType?: string;
      metadata?: {
        timeToFirstToken?: number;
        totalTime?: number;
        tokens?: number;
      };
    }>
  >([]);
  // Track the actual API conversation history (separate from template and display)
  const [apiConversationHistory, setApiConversationHistory] = useState<
    PromptMessage[]
  >([]);

  // Session state initialized from Redux preferences (users can toggle during session)
  const [submitOnEnter, setSubmitOnEnter] = useState(
    promptsPreferences?.submitOnEnter ?? false,
  );
  const [autoClearResponsesInEditMode, setAutoClearResponsesInEditMode] =
    useState(promptsPreferences?.autoClearResponsesInEditMode ?? false);

  // UI preference from Redux (read-only)
  const showSettingsOnMainPage =
    promptsPreferences?.showSettingsOnMainPage ?? true;

  const [isTestingPrompt, setIsTestingPrompt] = useState(false);
  const [lastMessageStats, setLastMessageStats] = useState<{
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
  } | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [messageStartTime, setMessageStartTime] = useState<number | null>(null);
  const timeToFirstTokenRef = useRef<number | undefined>(undefined);

  // Get streaming response from socket
  const streamingText = useAppSelector((state) =>
    currentTaskId
      ? selectPrimaryResponseTextByTaskId(currentTaskId)(state)
      : "",
  );
  const isResponseEnded = useAppSelector((state) =>
    currentTaskId
      ? selectPrimaryResponseEndedByTaskId(currentTaskId)(state)
      : false,
  );

  // UI state — new prompts start dirty (pre-populated defaults are unsaved)
  const [isDirty, setIsDirty] = useState(!initialData?.id);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingSystemMessage, setIsEditingSystemMessage] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [variablePopoverOpen, setVariablePopoverOpen] = useState<number | null>(
    null,
  );
  const [
    systemMessageVariablePopoverOpen,
    setSystemMessageVariablePopoverOpen,
  ] = useState(false);
  const [cursorPositions, setCursorPositions] = useState<
    Record<number, number>
  >({});

  // Auto-save to localStorage for crash recovery
  usePromptAutoSave({
    promptId: initialData?.id,
    promptName,
    developerMessage,
    messages,
    variableDefaults,
    modelConfig,
    model,
    isDirty,
  });

  // Refs for textarea elements (including system message at index -1)
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  // Check for autoRun query parameter and open prompt runner modal
  useEffect(() => {
    const autoRun = searchParams.get("autoRun");
    if (autoRun === "true" && initialData?.id) {
      // Open the modal after a short delay to ensure the page has loaded
      const timer = setTimeout(() => {
        openPrompt({
          promptId: initialData.id,
          executionConfig: {
            auto_run: false,
            allow_chat: true,
            show_variables: true,
            apply_variables: true,
            track_in_runs: true,
            use_pre_execution_input: false,
          },
        });

        // Clean up the URL by removing the query parameter
        const newUrl = pathname;
        router.replace(newUrl);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [searchParams, initialData?.id, pathname, router]);

  // Handler to add a new variable
  const handleAddVariable = (
    name: string,
    defaultValue: string,
    customComponent?: VariableCustomComponent,
    required?: boolean,
    helpText?: string,
  ) => {
    if (!name) return;

    // Don't add duplicates
    if (variableDefaults.some((v) => v.name === name)) {
      return;
    }

    setVariableDefaults((prev) => [
      ...prev,
      { name, defaultValue, customComponent, required, helpText },
    ]);
    setIsDirty(true);
  };

  // Handler to update a variable's custom component and default value
  const handleUpdateVariable = (
    oldName: string,
    newName: string,
    defaultValue: string,
    customComponent?: VariableCustomComponent,
    required?: boolean,
    helpText?: string,
  ) => {
    setVariableDefaults((prev) =>
      prev.map((v) =>
        v.name === oldName
          ? { name: newName, defaultValue, customComponent, required, helpText }
          : v,
      ),
    );
    setIsDirty(true);
  };

  // Handler to remove a variable
  const handleRemoveVariable = (variableName: string) => {
    setVariableDefaults((prev) => prev.filter((v) => v.name !== variableName));
    setIsDirty(true);
  };

  // Handler to update a variable's default value
  const handleUpdateVariableValue = (variableName: string, value: string) => {
    setVariableDefaults((prev) =>
      prev.map((v) =>
        v.name === variableName ? { ...v, defaultValue: value } : v,
      ),
    );
    setIsDirty(true);
  };

  // Handler to add a tool - updates modelConfig directly
  const handleAddTool = (tool: string) => {
    const currentTools = modelConfig.tools || [];
    if (!currentTools.includes(tool)) {
      setModelConfig((prev) => ({
        ...prev,
        tools: [...currentTools, tool],
      }));
      setIsDirty(true);
    }
    setIsAddingTool(false);
  };

  // Handler to remove a tool - updates modelConfig directly
  const handleRemoveTool = (tool: string) => {
    const currentTools = modelConfig.tools || [];
    setModelConfig((prev) => ({
      ...prev,
      tools: currentTools.filter((t) => t !== tool),
    }));
    setIsDirty(true);
  };

  // Clear tools when switching to a model that doesn't support them
  useEffect(() => {
    const currentTools = modelConfig.tools || [];
    if (!modelSupportsTools && currentTools.length > 0) {
      setModelConfig((prev) => ({
        ...prev,
        tools: [],
      }));
      setIsDirty(true);
    }
  }, [modelSupportsTools, modelConfig.tools]);

  // Keyboard shortcut for full-screen editor (Ctrl/Cmd + Shift + E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "e"
      ) {
        e.preventDefault();
        setIsFullScreenEditorOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Message handlers
  const addMessage = () => {
    // Determine next role - alternate between user and assistant
    const lastRole =
      messages.length > 0 ? messages[messages.length - 1].role : "user";
    const nextRole: PromptMessageRole =
      lastRole === "user" ? "assistant" : "user";
    setMessages([...messages, { role: nextRole, content: "" }]);
    setIsDirty(true);
  };

  const updateMessage = (index: number, content: string) => {
    const updated = [...messages];
    updated[index] = { ...updated[index], content };
    setMessages(updated);
    setIsDirty(true);
  };

  const clearMessage = (index: number) => {
    const updated = [...messages];
    updated[index] = { ...updated[index], content: "" };
    setMessages(updated);
    setIsDirty(true);
  };

  const deleteMessage = (index: number) => {
    setMessages(messages.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const insertVariableIntoMessage = (
    messageIndex: number,
    variable: string,
  ) => {
    const textarea = textareaRefs.current[messageIndex];

    // Use the stored cursor position (captured when the "+ Variable" button was clicked)
    // This is important because the popover interaction may affect the textarea's selectionStart
    const currentContent = messages[messageIndex].content;
    const cursorPos = cursorPositions[messageIndex] ?? currentContent.length;

    const beforeCursor = currentContent.substring(0, cursorPos);
    const afterCursor = currentContent.substring(cursorPos);
    const newContent = beforeCursor + `{{${variable}}}` + afterCursor;

    const updated = [...messages];
    updated[messageIndex] = { ...updated[messageIndex], content: newContent };
    setMessages(updated);
    setIsDirty(true);

    // Update cursor position to after the inserted variable
    const newCursorPos = cursorPos + variable.length + 4; // +4 for the {{ and }}
    setCursorPositions({ ...cursorPositions, [messageIndex]: newCursorPos });

    // Focus the textarea and set cursor position (preventScroll to avoid auto-scroll)
    if (textarea) {
      setTimeout(() => {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        // Auto-resize textarea
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      }, 0);
    }
  };

  const insertVariableIntoSystemMessage = (variable: string) => {
    const textarea = textareaRefs.current[-1]; // System message uses index -1

    // Use the stored cursor position (captured when the "+ Variable" button was clicked)
    const currentContent = developerMessage;
    const cursorPos = cursorPositions[-1] ?? currentContent.length;

    const beforeCursor = currentContent.substring(0, cursorPos);
    const afterCursor = currentContent.substring(cursorPos);
    const newContent = beforeCursor + `{{${variable}}}` + afterCursor;

    setDeveloperMessage(newContent);
    setIsDirty(true);

    // Update cursor position to after the inserted variable
    const newCursorPos = cursorPos + variable.length + 4; // +4 for the {{ and }}
    setCursorPositions({ ...cursorPositions, [-1]: newCursorPos });

    // Focus the textarea and set cursor position (preventScroll to avoid auto-scroll)
    if (textarea) {
      setTimeout(() => {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        // Auto-resize textarea
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      }, 0);
    }
  };

  const handleSave = async () => {
    // For shared prompts that haven't been acknowledged, show the warning modal
    if (isSharedPrompt && !hasAcknowledgedSharedPrompt) {
      setShowSharedWarningModal(true);
      return;
    }

    setIsSaving(true);
    try {
      const allMessages: PromptMessage[] = [
        { role: "system", content: developerMessage },
        ...messages,
      ];

      // Create a flat settings object that includes model_id and all model config
      const settings: Record<string, unknown> = {
        model_id: model,
        ...modelConfig,
      };

      // Migrate output_format -> response_format (proper dict format)
      if (settings.output_format !== undefined) {
        const fmt = settings.output_format;
        delete settings.output_format;
        if (typeof fmt === "string" && fmt !== "text" && fmt !== "") {
          settings.response_format = { type: fmt };
        }
      }

      // What gets saved to the database:
      // - name: string
      // - messages: array of message objects
      // - variableDefaults: array of { name, defaultValue } objects
      // - settings: flat JSONB with model_id and all config
      const promptData = {
        name: promptName,
        messages: allMessages,
        variableDefaults, // Already in the correct format: array of { name, defaultValue }
        settings,
      };

      // Use custom save handler if provided (e.g. for builtin editing)
      if (onCustomSave) {
        await onCustomSave({
          id: initialData?.id,
          ...promptData,
        });
        setIsDirty(false);
        return;
      }

      if (isEditMode && initialData?.id) {
        // Update existing prompt - no routing needed, stay on current edit page
        await dispatch(
          updateUserPrompt({ id: initialData.id, data: promptData as any }),
        ).unwrap();
        setIsDirty(false);
      } else {
        // Create new prompt and immediately route to its edit page
        // This prevents duplicate creation if user clicks save again before routing
        const result = await dispatch(
          createUserPrompt(promptData as any),
        ).unwrap();
        setIsDirty(false);

        // Route to the newly created prompt's edit page
        if (result?.id) {
          router.push(`${basePath}/edit/${result.id}`);
        }
      }
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Failed to save prompt", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle "Edit Original" from the shared prompt warning modal
  const handleEditOriginal = () => {
    setHasAcknowledgedSharedPrompt(true);
    setShowSharedWarningModal(false);
    // The next save will proceed normally
  };

  // Handle "Save as My Copy" from the shared prompt warning modal
  const handleSaveAsCopy = async () => {
    if (!initialData?.id) return;

    setIsCreatingCopy(true);
    try {
      const response = await fetch(`/api/prompts/${initialData.id}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            `Failed to duplicate prompt (${response.status})`,
        );
      }

      const data = (await response.json()) as { prompt?: { id: string } };

      if (data?.prompt?.id) {
        toast.success("Copy created successfully!", {
          description: "Redirecting to your copy...",
        });
        setShowSharedWarningModal(false);
        router.push(`${basePath}/edit/${data.prompt.id}`);
      }
    } catch (error) {
      console.error("Error creating copy:", error);
      toast.error("Failed to create copy");
    } finally {
      setIsCreatingCopy(false);
    }
  };

  // Helper function to replace variables in content
  const replaceVariables = (content: string): string => {
    let result = content;
    variableDefaults.forEach(({ name, defaultValue }) => {
      const regex = new RegExp(`\\{\\{${name}\\}\\}`, "g");
      result = result.replace(regex, defaultValue);
    });
    return result;
  };

  // NOTE: We intentionally do NOT update state during streaming to avoid re-rendering
  // on every chunk. The right panel will use selectors to get the streaming text directly.
  // We only update state when the stream completes (see next useEffect).

  // Handle response completion - this is the ONLY place we update conversation state
  useEffect(() => {
    if (
      currentTaskId &&
      isResponseEnded &&
      isTestingPrompt &&
      messageStartTime
    ) {
      // Calculate final stats
      const totalTime = Math.round(performance.now() - messageStartTime);
      const tokenCount = Math.round(streamingText.length / 4);

      const finalStats = {
        timeToFirstToken: timeToFirstTokenRef.current,
        totalTime: totalTime,
        tokens: tokenCount,
      };

      setLastMessageStats(finalStats);

      // Read data events directly from store at completion time — not subscribed to avoid
      // triggering re-renders on every data update during streaming.
      const responseDataSnapshot = currentTaskId
        ? selectPrimaryResponseDataByTaskId(currentTaskId)(store.getState())
        : [];
      const audioData = (
        responseDataSnapshot as Array<Record<string, unknown>>
      ).find((d) => d?.type === "audio_output");
      const audioUrl = audioData ? (audioData.url as string) : undefined;
      const audioMimeType = audioData
        ? (audioData.mime_type as string)
        : undefined;

      // Add the completed assistant message with content, metadata, and taskId
      setConversationMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: streamingText,
          taskId: currentTaskId,
          audioUrl,
          audioMimeType,
          metadata: finalStats,
        },
      ]);

      // Add the assistant's response to the API conversation history
      setApiConversationHistory((prev) => [
        ...prev,
        { role: "assistant", content: streamingText },
      ]);

      // IMPORTANT: Reset state so the next submission works properly
      setCurrentTaskId(null);
      setIsTestingPrompt(false);
      setMessageStartTime(null);
      timeToFirstTokenRef.current = undefined;
    }
  }, [
    isResponseEnded,
    currentTaskId,
    isTestingPrompt,
    messageStartTime,
    streamingText,
    store,
  ]);

  // Test chat handler
  const handleSendTestMessage = async () => {
    if (isTestingPrompt) return;

    // If autoClearResponsesInEditMode is enabled, clear the conversation first
    if (autoClearResponsesInEditMode) {
      setConversationMessages([]);
      setApiConversationHistory([]);
      setLastMessageStats(null);
    }

    // Determine if this is the first message in the conversation
    // When autoClearResponsesInEditMode is enabled, always treat as first message
    // since we just cleared the history (state update is async, so length check would be stale)
    const isFirstMessage =
      autoClearResponsesInEditMode || apiConversationHistory.length === 0;

    let userMessageContent: string;
    let displayUserMessage: string;

    if (isFirstMessage) {
      // First message: Use the template prompt
      const lastPromptMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;
      const isLastMessageUser = lastPromptMessage?.role === "user";

      // If last message is not a user message, we need chat input
      if (!isLastMessageUser && !chatInput.trim()) return;

      if (isLastMessageUser) {
        // Combine the last user message with chatInput (if any)
        const lastMessageContent = lastPromptMessage.content;
        const additionalInput = chatInput.trim();

        userMessageContent = additionalInput
          ? `${lastMessageContent}\n${additionalInput}`
          : lastMessageContent;
      } else {
        // Normal behavior: add chatInput as a new user message
        userMessageContent = chatInput;
      }

      displayUserMessage = userMessageContent;
    } else {
      // Subsequent messages: Just use the chat input
      if (!chatInput.trim()) return;

      userMessageContent = chatInput;
      displayUserMessage = chatInput;
    }

    // Format message with resources before sending
    const { formattedMessage, settingsAttachments, metadata } =
      await formatMessageWithResources(userMessageContent, resources);

    // Use formatted message for API
    userMessageContent = formattedMessage;

    // Also update display message to include resources for UI rendering
    displayUserMessage = formattedMessage;

    // Always clear input after sending (this is different from autoClearResponsesInEditMode)
    setChatInput("");
    setResources([]); // Clear resources after sending

    // Replace variables in the display message before showing it
    const displayMessageWithReplacedVariables =
      replaceVariables(displayUserMessage);

    // Add user message to conversation display
    setConversationMessages((prev) => [
      ...prev,
      { role: "user", content: displayMessageWithReplacedVariables },
    ]);

    setIsTestingPrompt(true);
    setLastMessageStats(null); // Clear previous stats
    setMessageStartTime(performance.now()); // Start timing
    timeToFirstTokenRef.current = undefined; // Reset time to first token

    try {
      // Create user message with metadata (files and resource references)
      const userMessage: PromptMessage = {
        role: "user",
        content: userMessageContent,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };

      let messagesToSend: PromptMessage[];

      if (isFirstMessage) {
        // First message: Use template messages, replacing the last user message if needed
        const lastPromptMessage =
          messages.length > 0 ? messages[messages.length - 1] : null;
        const isLastMessageUser = lastPromptMessage?.role === "user";

        if (isLastMessageUser) {
          // Replace the last template message with our combined content
          const messagesWithoutLast = messages.slice(0, -1);
          messagesToSend = [...messagesWithoutLast, userMessage];
        } else {
          // Append the new user message
          messagesToSend = [...messages, userMessage];
        }
      } else {
        // Subsequent messages: Use conversation history + new user message
        messagesToSend = [...apiConversationHistory, userMessage];
      }

      // Add system message and replace variables
      const allMessages = [
        { role: "system", content: developerMessage },
        ...messagesToSend,
      ];
      const messagesWithVariablesReplaced = allMessages.map((msg) => ({
        ...msg,
        content: replaceVariables(msg.content),
      }));

      // Add the new user message with metadata to the API conversation history
      // When autoClearResponsesInEditMode is enabled, start fresh (don't use prev, it's stale)
      if (autoClearResponsesInEditMode) {
        setApiConversationHistory([userMessage]);
      } else {
        setApiConversationHistory((prev) => [...prev, userMessage]);
      }

      // Build chat_config for direct_chat task
      const chatConfig: Record<string, any> = {
        model_id: model,
        messages: messagesWithVariablesReplaced,
        stream: true,
        ...modelConfig,
      };

      // Migrate any legacy output_format -> response_format (dict format)
      if (chatConfig.output_format !== undefined) {
        const fmt = chatConfig.output_format;
        delete chatConfig.output_format;
        if (typeof fmt === "string" && fmt !== "text" && fmt !== "") {
          chatConfig.response_format = { type: fmt };
        }
      }

      // NOTE: We do NOT add an empty assistant placeholder here.
      // The right panel will display the streaming text using the taskId.
      // We only add the final message when streaming completes.

      // Pre-generate taskId and set it BEFORE dispatch so the streaming UI
      // mounts immediately and shows chunks as they arrive.
      const taskId = uuidv4();
      setCurrentTaskId(taskId);

      // Submit the task using FastAPI
      await dispatch(
        createAndSubmitTask({
          service: "chat_service",
          taskName: "direct_chat",
          taskData: {
            chat_config: chatConfig,
          },
          customTaskId: taskId,
        }),
      ).unwrap();
    } catch (error) {
      console.error("Error testing prompt:", error);
      setConversationMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to get response from AI" },
      ]);
      // Reset state on error
      setIsTestingPrompt(false);
      setCurrentTaskId(null);
      setMessageStartTime(null);
      timeToFirstTokenRef.current = undefined;
    }
  };

  // Handle settings modal updates
  const handleSettingsUpdate = (
    id: string,
    data: {
      name: string;
      description?: string;
      variableDefaults: PromptVariable[];
      messages?: PromptMessage[];
      settings?: Record<string, any>;
      tags?: string[];
      category?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      modelId?: string;
      outputFormat?: string;
      outputSchema?: unknown;
    },
  ) => {
    dispatch(updateUserPrompt({ id, data }));
  };

  const handleLocalStateUpdate = (
    updates: {
      name?: string;
      description?: string;
      variableDefaults?: PromptVariable[];
      messages?: PromptMessage[];
      settings?: Record<string, any>;
      tags?: string[];
      category?: string;
      isFavorite?: boolean;
      isArchived?: boolean;
      modelId?: string;
      outputFormat?: string;
      outputSchema?: unknown;
    },
    isFromSave: boolean = false,
  ) => {
    if (updates.name !== undefined) {
      setPromptName(updates.name);
    }
    if (updates.description !== undefined) {
      setPromptDescription(updates.description);
    }
    if (updates.variableDefaults !== undefined) {
      setVariableDefaults(updates.variableDefaults);
    }

    if (updates.messages !== undefined && updates.messages.length > 0) {
      if (updates.messages[0].role === "system") {
        setDeveloperMessage(updates.messages[0].content);
        setMessages(updates.messages.slice(1));
      } else {
        setMessages(updates.messages);
      }
    }

    if (updates.settings !== undefined) {
      const { model_id, ...config } = updates.settings;
      if (model_id !== undefined) {
        setModel(model_id);
      }
      if (Object.keys(config).length > 0) {
        setModelConfig(config as PromptSettings);
      }
    }

    if (!isFromSave) {
      setIsDirty(true);
    }
  };

  // Handle conflict modal confirmation
  const handleConflictConfirm = (resolvedSettings: PromptSettings) => {
    if (!pendingConflictData) return;
    setModel(pendingConflictData.newModelId);
    setModelConfig(resolvedSettings);
    setConflictModalOpen(false);
    setPendingConflictData(null);
    setIsDirty(true);
  };

  // Handle conflict modal cancel — undo the model selection (revert to old model)
  const handleConflictCancel = () => {
    setConflictModalOpen(false);
    setPendingConflictData(null);
    // model state is unchanged — never was switched
  };

  // Build full prompt object for the experimental full prompt optimizer
  const fullPromptObject = {
    id: initialData?.id,
    name: promptName,
    description: promptDescription,
    messages: [
      { role: "system" as PromptMessageRole, content: developerMessage },
      ...messages,
    ],
    variableDefaults,
    settings: {
      model_id: model,
      ...modelConfig,
    },
  };

  // Handler for accepting optimized full prompt from the experimental optimizer
  const handleAcceptFullPrompt = (optimizedObject: any) => {
    try {
      // Update name if provided
      if (optimizedObject.name && typeof optimizedObject.name === "string") {
        setPromptName(optimizedObject.name);
      }

      // Update messages if provided
      if (
        Array.isArray(optimizedObject.messages) &&
        optimizedObject.messages.length > 0
      ) {
        // Extract system message (first message)
        const systemMsg = optimizedObject.messages.find(
          (m: any) => m.role === "system",
        );
        if (systemMsg) {
          setDeveloperMessage(systemMsg.content);
        }

        // Extract other messages (excluding system)
        const otherMessages = optimizedObject.messages.filter(
          (m: any) => m.role !== "system",
        );
        setMessages(otherMessages);
      }

      // Update variables if provided
      if (Array.isArray(optimizedObject.variableDefaults)) {
        setVariableDefaults(optimizedObject.variableDefaults);
      }

      // Update settings if provided
      if (
        optimizedObject.settings &&
        typeof optimizedObject.settings === "object"
      ) {
        const { model_id, ...config } = optimizedObject.settings;

        // Update model if provided and valid
        if (model_id) {
          const newModel = models.find((m: any) => m.id === model_id);
          if (newModel) {
            setModel(model_id);
            setModelConfig(config as PromptSettings);
          } else {
            // Model not found, just update config
            setModelConfig(config as PromptSettings);
          }
        } else {
          // No model change, just update config
          if (Object.keys(config).length > 0) {
            setModelConfig(config as PromptSettings);
          }
        }
      }

      setIsDirty(true);
    } catch (error) {
      console.error("Error applying optimized prompt:", error);
    }
  };

  // Handler for saving optimized prompt as a copy
  const handleAcceptFullPromptAsCopy = async (optimizedObject: any) => {
    try {
      // Prepare the name with " (Copy)" suffix
      const newName = optimizedObject.name
        ? `${optimizedObject.name} (Copy)`
        : `${promptName} (Copy)`;

      // Extract messages
      const allMessages = Array.isArray(optimizedObject.messages)
        ? optimizedObject.messages
        : [{ role: "system", content: developerMessage }, ...messages];

      // Extract settings
      const newSettings =
        optimizedObject.settings && typeof optimizedObject.settings === "object"
          ? optimizedObject.settings
          : { model_id: model, ...modelConfig };

      // Extract variables
      const newVariables = Array.isArray(optimizedObject.variableDefaults)
        ? optimizedObject.variableDefaults
        : variableDefaults;

      // Create new prompt data
      const promptData = {
        name: newName,
        messages: allMessages,
        variableDefaults: newVariables,
        settings: newSettings,
      };

      // Create the new prompt
      const result = await dispatch(
        createUserPrompt(promptData as any),
      ).unwrap();

      if (result?.id) {
        toast.success("Copy created successfully", {
          description: "Routing to the new prompt...",
        });
        router.push(`${basePath}/edit/${result.id}`);
      } else {
        throw new Error("Failed to create prompt copy");
      }
    } catch (error) {
      console.error("Error creating prompt copy:", error);
      toast.error("Failed to create copy", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const settingsModalInitialData = initialData
    ? {
        id: initialData.id,
        name: initialData.name,
        messages: normalizePromptMessagesFromDb(initialData.messages),
        variableDefaults: normalizePromptVariablesFromDb(
          initialData.variableDefaults,
        ),
        settings: normalizePromptSettingsFromDb(initialData.settings) as Record<
          string,
          any
        >,
        tags: initialData.tags,
        category: initialData.category,
        isFavorite: initialData.isFavorite,
        isArchived: initialData.isArchived,
        modelId: initialData.modelId,
        outputFormat: initialData.outputFormat,
        outputSchema: initialData.outputSchema,
      }
    : undefined;

  // Build shared props object
  const sharedProps = {
    // Header
    promptId: initialData?.id,
    promptVersion: initialData?.version,
    promptUpdatedAt: initialData?.updatedAt,
    promptName,
    onPromptNameChange: (value: string) => {
      setPromptName(value);
      setIsDirty(true);
    },
    isDirty,
    isSaving,
    onSave: handleSave,
    developerMessage,
    onDeveloperMessageChange: (value: string) => {
      setDeveloperMessage(value);
      setIsDirty(true);
    },
    fullPromptObject,
    handleAcceptFullPrompt,
    handleAcceptFullPromptAsCopy,

    // Modals
    isFullScreenEditorOpen,
    setIsFullScreenEditorOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    setIsDirty,

    // Model
    models,
    model,
    onModelChange: (value: string) => {
      if (value === model) return;
      const conflictData = buildConflictData(model, value, modelConfig);
      if (conflictData && conflictData.conflicts.length > 0) {
        // Conflicts found — show modal, do NOT change model yet
        setPendingConflictData(conflictData);
        setConflictModalOpen(true);
      } else {
        // No conflicts — switch model immediately, keep all current settings
        setModel(value);
        setIsDirty(true);
      }
    },
    modelConfig,
    setModelConfig,
    onOpenSettingsConflictModal: () => {
      if (pendingConflictData) {
        setConflictModalOpen(true);
      }
    },
    hasPendingConflict: !!pendingConflictData,

    // Variables
    variableDefaults,
    onAddVariable: handleAddVariable,
    onUpdateVariable: handleUpdateVariable,
    onRemoveVariable: handleRemoveVariable,
    onVariableValueChange: handleUpdateVariableValue,
    expandedVariable,
    onExpandedVariableChange: setExpandedVariable,

    // Tools
    availableTools,
    isAddingTool,
    onIsAddingToolChange: setIsAddingTool,
    onAddTool: handleAddTool,
    onRemoveTool: handleRemoveTool,
    modelSupportsTools,

    // Settings
    showSettingsOnMainPage,

    // Developer message
    onDeveloperMessageClear: () => setDeveloperMessage(""),
    systemMessageVariablePopoverOpen,
    onSystemMessageVariablePopoverOpenChange:
      setSystemMessageVariablePopoverOpen,
    onInsertVariableIntoSystemMessage: insertVariableIntoSystemMessage,
    isEditingSystemMessage,
    onIsEditingSystemMessageChange: setIsEditingSystemMessage,

    // Messages
    messages,
    editingMessageIndex,
    onEditingMessageIndexChange: setEditingMessageIndex,
    variablePopoverOpen,
    onVariablePopoverOpenChange: setVariablePopoverOpen,
    onMessageRoleChange: (index: number, role: any) => {
      const updated = [...messages];
      updated[index] = { ...updated[index], role };
      setMessages(updated);
      setIsDirty(true);
    },
    onMessageContentChange: updateMessage,
    onClearMessage: clearMessage,
    onDeleteMessage: deleteMessage,
    onInsertVariable: insertVariableIntoMessage,
    onAddMessage: addMessage,

    // Refs
    textareaRefs,
    cursorPositions,
    onCursorPositionChange: setCursorPositions,

    // Full screen editor
    onOpenFullScreenEditor: (messageIndex: number) => {
      if (messageIndex === -1) {
        setFullScreenEditorInitialSelection({ type: "system", index: -1 });
      } else {
        setFullScreenEditorInitialSelection({
          type: "message",
          index: messageIndex,
        });
      }
      setIsFullScreenEditorOpen(true);
    },
    fullScreenEditorInitialSelection,
    setFullScreenEditorInitialSelection,
    updateMessage,

    // Conversation
    conversationMessages,
    onClearConversation: () => {
      setConversationMessages([]);
      setApiConversationHistory([]);
      setLastMessageStats(null);
    },
    chatInput,
    onChatInputChange: setChatInput,
    resources,
    onResourcesChange: setResources,
    onSendMessage: handleSendTestMessage,
    isTestingPrompt,
    submitOnEnter,
    onSubmitOnEnterChange: setSubmitOnEnter,
    autoClearResponsesInEditMode,
    onAutoClearResponsesInEditModeChange: setAutoClearResponsesInEditMode,
    isStreamingMessage: isTestingPrompt,
    currentTaskId,
    messageStartTime,
    timeToFirstTokenRef,
    lastMessageStats,
    attachmentCapabilities: {
      supportsImageUrls,
      supportsFileUrls,
      supportsYoutubeVideos,
    },
    onConversationMessageContentChange: (
      messageIndex: number,
      newContent: string,
    ) => {
      setConversationMessages((prevMessages) => {
        const updatedMessages = [...prevMessages];
        if (messageIndex >= 0 && messageIndex < updatedMessages.length) {
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: newContent,
          };
        }
        return updatedMessages;
      });
    },

    // Settings modal
    initialData: settingsModalInitialData,
    promptDescription,
    handleSettingsUpdate,
    handleLocalStateUpdate,

    // Shared prompt info
    accessInfo,
    isSharedPrompt,
    canEditOriginal,

    // Back navigation
    backHref,
    backLabel: backLabel ?? contextLabel,
    contextLabel,
  };

  const conflictModal = (
    <ModelChangeConflictModal
      isOpen={conflictModalOpen}
      onClose={handleConflictCancel}
      conflictData={pendingConflictData}
      onConfirm={handleConflictConfirm}
    />
  );

  // Render appropriate component based on device type
  if (isMobile) {
    return (
      <>
        <PromptBuilderMobile
          {...sharedProps}
          mobileActiveTab={mobileActiveTab}
          onMobileTabChange={setMobileActiveTab}
        />
        <SharedPromptWarningModal
          isOpen={showSharedWarningModal}
          onClose={() => setShowSharedWarningModal(false)}
          ownerEmail={accessInfo?.ownerEmail ?? null}
          permissionLevel={accessInfo?.permissionLevel ?? null}
          onEditOriginal={handleEditOriginal}
          onCreateCopy={handleSaveAsCopy}
          isCreatingCopy={isCreatingCopy}
        />
        {conflictModal}
      </>
    );
  }

  return (
    <>
      <PromptBuilderDesktop {...sharedProps} />
      <SharedPromptWarningModal
        isOpen={showSharedWarningModal}
        onClose={() => setShowSharedWarningModal(false)}
        ownerEmail={accessInfo?.ownerEmail ?? null}
        permissionLevel={accessInfo?.permissionLevel ?? null}
        onEditOriginal={handleEditOriginal}
        onCreateCopy={handleSaveAsCopy}
        isCreatingCopy={isCreatingCopy}
      />
      {conflictModal}
    </>
  );
}
