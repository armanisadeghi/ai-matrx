import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { shallowEqual } from "react-redux";
import { startPromptInstance } from "@/lib/redux/prompt-execution/thunks/startInstanceThunk";
import { executeMessage } from "@/lib/redux/prompt-execution/thunks/executeMessageThunk";
import {
  updateVariable,
  removeInstance,
  selectInstance,
  selectMessages,
  selectResources,
  EMPTY_MESSAGES,
  EMPTY_OBJECT,
  EMPTY_ARRAY,
} from "@/lib/redux/prompt-execution/slice";
import {
  selectStreamingTextForInstance,
  selectIsResponseEndedForInstance,
  selectMergedVariables,
} from "@/lib/redux/prompt-execution/selectors";
import { completeExecutionThunk } from "@/lib/redux/prompt-execution/thunks/completeExecutionThunk";
import { selectPromptsPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { selectCachedPrompt } from "@/lib/redux/slices/promptCacheSlice";
import {
  parseCodeEdits,
  validateEdits,
} from "@/features/code-editor/utils/parseCodeEdits";
import { applyCodeEdits } from "@/features/code-editor/utils/applyCodeEdits";
import { getDiffStats } from "@/features/code-editor/utils/generateDiff";
import {
  buildSpecialVariables,
  filterOutSpecialVariables,
  getRequiredSpecialVariables,
  logSpecialVariablesUsage,
  type CodeEditorContext,
} from "@/features/code-editor/utils/specialVariables";
import { normalizeLanguage } from "@/features/code-editor/config/languages";
import { agentForPromptKey } from "@/features/code-editor/agent-code-editor/agents";

export type EditorState =
  | "input"
  | "processing"
  | "review"
  | "applying"
  | "complete"
  | "error";

export interface UseAICodeEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCode: string;
  language: string;
  builtinId?: string;
  promptKey?:
    | "prompt-app-ui-editor"
    | "generic-code-editor"
    | "code-editor-dynamic-context";
  onCodeChange: (newCode: string) => void;
  selection?: string;
  context?: string;
}

/**
 * Hook for AI Code Editor logic
 *
 * NOTE: This hook does NOT manage currentInput state.
 * Input handling should be done directly in the component using:
 * - selectCurrentInput selector
 * - setCurrentInput action
 *
 * The handleSubmit function accepts userInput as a parameter.
 */
export function useAICodeEditor({
  open,
  onOpenChange,
  currentCode,
  language: rawLanguage,
  builtinId,
  promptKey = "generic-code-editor",
  onCodeChange,
  selection,
  context,
}: UseAICodeEditorProps) {
  const dispatch = useAppDispatch();

  // Get user preferences
  const promptsPreferences = useAppSelector(selectPromptsPreferences);
  const submitOnEnterPreference = promptsPreferences.submitOnEnter;

  // Normalize the language for consistent syntax highlighting
  const language = normalizeLanguage(rawLanguage);

  // Use explicit builtinId if provided, otherwise use context
  const defaultBuiltinId = builtinId || agentForPromptKey(promptKey).id;

  // State for prompt selection
  const [selectedBuiltinId, setSelectedBuiltinId] = useState(defaultBuiltinId);

  // State for submit on enter (defaults to user preference)
  const [submitOnEnter, setSubmitOnEnter] = useState(
    promptsPreferences.submitOnEnter,
  );

  // Redux instance management
  const [runId, setRunId] = useState<string | null>(null);

  const instance = useAppSelector((state) =>
    runId ? selectInstance(state, runId) : null,
  );
  const streamingText = useAppSelector((state) =>
    runId ? selectStreamingTextForInstance(state, runId) : "",
  );
  const isResponseEnded = useAppSelector((state) =>
    runId ? selectIsResponseEndedForInstance(state, runId) : false,
  );
  // Use shallowEqual to prevent unnecessary re-renders from object reference changes
  const variables = useAppSelector(
    (state) => (runId ? selectMergedVariables(state, runId) : EMPTY_OBJECT),
    shallowEqual,
  );
  const cachedPrompt = useAppSelector((state) =>
    selectedBuiltinId ? selectCachedPrompt(state, selectedBuiltinId) : null,
  );

  // Messages - stable reference when not found
  const messages = useAppSelector((state) =>
    runId ? selectMessages(state, runId) : EMPTY_MESSAGES,
  );

  // NOTE: currentInput and resources are NOT managed here - they're managed by Redux
  // accessed directly via selectors. expandedVariable also managed by Redux.
  // This eliminates local state management entirely.

  const [state, setState] = useState<EditorState>("input");
  const [parsedEdits, setParsedEdits] = useState<ReturnType<
    typeof parseCodeEdits
  > | null>(null);
  const [modifiedCode, setModifiedCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [rawAIResponse, setRawAIResponse] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const isExecuting =
    instance?.status === "executing" || instance?.status === "streaming";
  const isLoadingPrompt = instance?.status === "initializing";

  // Initialize prompt instance when modal opens or builtin changes
  useEffect(() => {
    if (open && selectedBuiltinId) {
      const initInstance = async () => {
        try {
          const id = await dispatch(
            startPromptInstance({
              promptId: selectedBuiltinId,
              // TODO(prompt-to-agent-sweep): Full agent-system rewrite required.
              //
              // This hook is structurally tied to the legacy prompt-execution
              // Redux slice — `selectInstance`, `selectMessages`,
              // `selectMergedVariables`, `selectStreamingTextForInstance`,
              // `selectIsResponseEndedForInstance`, `updateVariable`,
              // `removeInstance`, `completeExecutionThunk`, `executeMessage`
              // all live on the prompt slice and have no automatic agent
              // equivalent. The unrelated swap of `startPromptInstance` →
              // `launchAgent` is a one-line change; the surrounding hook is
              // not.
              //
              // Recipe for the proper swap:
              //   1. Replace `startPromptInstance` with
              //      `useShortcutTrigger()` and trigger one of the existing
              //      shortcuts that target this agent:
              //        - generic-code-editor agent
              //          (87efa869-9c11-43cf-b3a8-5b7c775ee415) →
              //          shortcut 00836ba6-10af-4a95-8c7e-6b5a03c0b3e4
              //          ("Master Code Editor")
              //        - code-editor-dynamic-context agent
              //          (970856c5-3b9d-4034-ac9d-8d8a11fb3dba) →
              //          shortcut 2c301ba1-e870-4a3f-abe6-8148c72a7425
              //          ("Dynamic Context Code Editor")
              //        - prompt-app-ui-editor agent
              //          (c1c1f092-ba0d-4d6c-b352-b22fe6c48272) →
              //          shortcut 6231578b-a52d-47c5-a41d-831000ddfa9e
              //          ("Update Prompt App Code")
              //      Pass `config: { displayMode: "direct" }` so no overlay
              //      renders — this hook's consumer renders the chrome.
              //   2. Capture conversationId via `onConversationCreated`.
              //   3. Replace prompt-slice selectors with their agent
              //      counterparts:
              //        selectStreamingTextForInstance →
              //          `selectLatestAccumulatedText(cid)` (aggregate)
              //        selectIsResponseEndedForInstance →
              //          `selectStreamPhase(cid)` === "complete"
              //        selectMessages → `selectInstanceConversationHistory`
              //        selectMergedVariables →
              //          `selectInstanceVariableValues(cid)`
              //   4. Replace `executeMessage` (multi-turn send) with
              //      `dispatch(executeInstance({ conversationId }))`.
              //   5. Drop `completeExecutionThunk` — the agent stream
              //      machinery handles completion natively; the existing
              //      `useEffect` that watches `isResponseEnded` should
              //      simply branch on stream phase = "complete".
              //   6. Drop the cachedPrompt path entirely — variable defaults
              //      live on the agent record (queried by the launcher).
              //      Special-variable injection (`buildSpecialVariables`)
              //      moves into the `runtime.userInput` / variable seeding
              //      layer of `trigger`/`launchAgent`.
              //   7. Cleanup-on-close uses
              //      `dispatch(destroyInstanceIfAllowed(cid))` instead of
              //      `removeInstance({ runId })`.
              //
              // This is a ~150-line change inside this file plus the
              // consuming `AICodeEditor.tsx`. Until done, this hook keeps
              // `features/prompts/**` and the prompt-execution slice alive.
              promptSource: "prompt_builtins",
              variables: {},
              executionConfig: {
                auto_run: false,
                allow_chat: false,
                show_variables: true,
                apply_variables: true,
                track_in_runs: false,
                use_pre_execution_input: false,
              },
            }),
          ).unwrap();

          setRunId(id);
        } catch (err) {
          console.error("Error initializing prompt instance:", err);
          setState("error");
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to initialize",
          );
        }
      };

      initInstance();
    }
  }, [open, selectedBuiltinId, dispatch]);

  // Populate special variables when prompt is loaded
  useEffect(() => {
    if (runId && cachedPrompt) {
      const promptVariables = cachedPrompt.variableDefaults || [];
      const requiredSpecialVars = getRequiredSpecialVariables(promptVariables);

      if (requiredSpecialVars.length > 0) {
        const codeContext: CodeEditorContext = {
          currentCode,
          selection,
          context,
          language,
        };

        const specialVars = buildSpecialVariables(
          codeContext,
          requiredSpecialVars,
          language,
        );
        logSpecialVariablesUsage(cachedPrompt.name, specialVars);

        Object.entries(specialVars).forEach(([name, value]) => {
          dispatch(
            updateVariable({
              runId,
              variableName: name,
              value,
            }),
          );
        });
      }
    }
  }, [
    runId,
    cachedPrompt,
    currentCode,
    selection,
    context,
    language,
    dispatch,
  ]);

  // Reset state and cleanup when modal closes
  useEffect(() => {
    if (!open) {
      if (runId) {
        dispatch(removeInstance({ runId }));
      }

      setRunId(null);
      // Resources and expandedVariable are managed by Redux, automatically cleaned up with removeInstance
      setState("input");
      setParsedEdits(null);
      setModifiedCode("");
      setErrorMessage("");
      setRawAIResponse("");
      setIsCopied(false);
      setSelectedBuiltinId(defaultBuiltinId);
      setSubmitOnEnter(submitOnEnterPreference);
    }
  }, [open, defaultBuiltinId, submitOnEnterPreference, runId, dispatch]);

  // Update selected builtin when default changes
  useEffect(() => {
    if (open) {
      setSelectedBuiltinId(defaultBuiltinId);
    }
  }, [open, defaultBuiltinId]);

  // Complete execution when streaming ends
  useEffect(() => {
    if (
      runId &&
      instance &&
      isResponseEnded &&
      streamingText &&
      (instance.status === "streaming" || instance.status === "executing") &&
      instance.execution.messageStartTime
    ) {
      setRawAIResponse(streamingText);

      const totalTime = Date.now() - instance.execution.messageStartTime;
      const timeToFirstToken = instance.execution.timeToFirstToken;

      dispatch(
        completeExecutionThunk({
          runId,
          responseText: streamingText,
          timeToFirstToken,
          totalTime,
        }),
      );
    }
  }, [runId, instance, isResponseEnded, streamingText, dispatch]);

  // Parse response when streaming completes
  useEffect(() => {
    if (rawAIResponse && !isExecuting && state === "processing") {
      const parsed = parseCodeEdits(rawAIResponse);
      setParsedEdits(parsed);

      if (!parsed.success || parsed.edits.length === 0) {
        console.log(
          "📝 No code edits found in response - continuing conversation",
        );
        setState("input");
        return;
      }

      const validation = validateEdits(currentCode, parsed.edits);

      if (validation.warnings.length > 0) {
        console.log("⚠️ Fuzzy Matching Applied:");
        validation.warnings.forEach((w) => console.log(`  - ${w}`));
      }

      if (!validation.valid) {
        console.error("❌ Edit validation failed");
        setState("error");
        let errorMsg = `⚠️ INVALID CODE EDITS\n\n`;
        errorMsg += `The AI provided ${parsed.edits.length} edit${parsed.edits.length !== 1 ? "s" : ""}, but some SEARCH patterns don't match the current code.\n\n`;
        errorMsg += `This usually means the AI is trying to edit code that doesn't exist or has changed.\n`;
        errorMsg += `You can continue the conversation to clarify or try again.\n\n`;

        if (validation.warnings.length > 0) {
          errorMsg += `✓ ${validation.warnings.length} edit${validation.warnings.length !== 1 ? "s" : ""} will use fuzzy matching (whitespace-tolerant)\n`;
        }

        errorMsg += `✗ ${validation.errors.length} edit${validation.errors.length !== 1 ? "s" : ""} failed validation\n\n`;
        errorMsg += `${"═".repeat(70)}\n`;
        validation.errors.forEach((err) => {
          errorMsg += err;
          errorMsg += `\n`;
        });
        setErrorMessage(errorMsg);
        return;
      }

      const result = applyCodeEdits(currentCode, parsed.edits);

      if (result.warnings.length > 0) {
        console.log("✓ Applied with fuzzy matching:");
        result.warnings.forEach((w) => console.log(`  - ${w}`));
      }

      if (!result.success) {
        setState("error");
        let errorMsg = `Error Applying Edits:\n\n`;
        result.errors.forEach((err, i) => {
          errorMsg += `${i + 1}. ${err}\n`;
        });
        setErrorMessage(errorMsg);
        return;
      }

      setModifiedCode(result.code || "");
      setState("review");
    }
  }, [rawAIResponse, isExecuting, state, currentCode]);

  // Update special variables whenever they change or before execution
  // This ensures code context is always up-to-date
  useEffect(() => {
    if (runId && cachedPrompt && instance?.status === "ready") {
      const promptVariables = cachedPrompt.variableDefaults || [];
      const requiredSpecialVars = getRequiredSpecialVariables(promptVariables);

      if (requiredSpecialVars.length > 0) {
        const codeContext: CodeEditorContext = {
          currentCode,
          selection,
          context,
          language,
        };

        const specialVars = buildSpecialVariables(
          codeContext,
          requiredSpecialVars,
          language,
        );

        Object.entries(specialVars).forEach(([name, value]) => {
          const currentValue = variables[name];
          // Only update if value changed
          if (currentValue !== value) {
            dispatch(
              updateVariable({
                runId,
                variableName: name,
                value,
              }),
            );
          }
        });
      }
    }
  }, [
    runId,
    cachedPrompt,
    instance?.status,
    currentCode,
    selection,
    context,
    language,
    variables,
    dispatch,
  ]);

  // Watch for execution start and update local state
  useEffect(() => {
    if (instance?.status === "executing" || instance?.status === "streaming") {
      if (state !== "processing") {
        setState("processing");
      }
    }
  }, [instance?.status, state]);

  // Handlers for PromptInput
  const handleVariableValueChange = useCallback(
    (variableName: string, value: string) => {
      if (!runId) return;
      dispatch(
        updateVariable({
          runId,
          variableName,
          value,
        }),
      );
    },
    [runId, dispatch],
  );

  const handleSubmitOnEnterChange = useCallback((value: boolean) => {
    setSubmitOnEnter(value);
  }, []);

  const handleCopyResponse = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawAIResponse);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [rawAIResponse]);

  const handleApplyChanges = useCallback(async () => {
    setState("applying");

    // Small delay to show applying state
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Apply the code changes
    onCodeChange(modifiedCode);

    // Show success state briefly
    setState("complete");
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Close the modal
    onOpenChange(false);
  }, [modifiedCode, onCodeChange, onOpenChange]);

  const diffStats = modifiedCode
    ? getDiffStats(currentCode, modifiedCode)
    : null;

  // Memoize displayVariables to prevent re-creating array on every render
  const displayVariables = useMemo(
    () => filterOutSpecialVariables(cachedPrompt?.variableDefaults || []),
    [cachedPrompt?.variableDefaults],
  );

  return {
    // State
    state,
    setState,
    instance,
    cachedPrompt,
    variables,
    // resources and expandedVariable removed - managed by Redux
    parsedEdits,
    modifiedCode,
    errorMessage,
    rawAIResponse,
    isCopied,
    selectedBuiltinId,
    setSelectedBuiltinId,
    submitOnEnter,
    isExecuting,
    isLoadingPrompt,
    diffStats,
    displayVariables,
    language,
    streamingText,
    messages,

    // runId exposed so SmartPromptInput can use it
    runId,

    // Handlers
    handleVariableValueChange,
    handleSubmitOnEnterChange,
    handleCopyResponse,
    handleApplyChanges,

    // NOTE: handleSubmit, handleChatInputChange, resources, expandedVariable removed
    // SmartPromptInput handles all input/resource/execution management
  };
}
