import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { shallowEqual } from "react-redux";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  selectLatestAccumulatedText,
  selectStreamPhase,
  selectIsExecuting,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectConversationMessages,
  EMPTY_CONVERSATION_MESSAGES,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { selectPromptsPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
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
import {
  agentForPromptKey,
  type CodeEditorPromptKey,
} from "@/features/code-editor/agent-code-editor/agents";

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
  /** Explicit editing job (mandate key). Overrides `promptKey`. */
  mandateKey?: string;
  promptKey?: CodeEditorPromptKey;
  onCodeChange: (newCode: string) => void;
  selection?: string;
  context?: string;
}

/**
 * Hook for AI Code Editor logic — agent-execution system version.
 *
 * Rewired from the legacy prompt-execution slice onto the agent execution system:
 *  - startPromptInstance → launchMandate (displayMode: "direct"); the job is a
 *    MANDATE KEY resolved inside the launch funnel — never an agent id
 *  - selectStreamingTextForInstance → selectLatestAccumulatedText
 *  - selectIsResponseEndedForInstance → selectStreamPhase === "complete"
 *  - selectMessages → selectConversationMessages (MessageRecord[])
 *  - selectMergedVariables → selectResolvedVariables
 *  - updateVariable → setUserVariableValues
 *  - removeInstance → destroyInstanceIfAllowed
 *  - completeExecutionThunk → dropped (agent stream handles completion natively)
 *  - cachedPrompt path → dropped (variable defaults live on the agent record)
 *
 * NOTE: This hook does NOT manage currentInput state.
 * Input handling is done directly in the component via SmartAgentInput,
 * keyed on conversationId.
 */
export function useAICodeEditor({
  open,
  onOpenChange,
  currentCode,
  language: rawLanguage,
  mandateKey,
  promptKey = "generic-code-editor",
  onCodeChange,
  selection,
  context,
}: UseAICodeEditorProps) {
  const dispatch = useAppDispatch();
  const { launchMandate } = useAgentLauncher();

  // Get user preferences
  const promptsPreferences = useAppSelector(selectPromptsPreferences);
  const submitOnEnterPreference = promptsPreferences.submitOnEnter;

  // Normalize the language for consistent syntax highlighting
  const language = normalizeLanguage(rawLanguage);

  // Use the explicit mandate key if provided, otherwise derive from promptKey
  const defaultMandateKey =
    mandateKey || agentForPromptKey(promptKey).mandateKey;

  // State for job selection (the picker swaps mandate keys)
  const [selectedMandateKey, setSelectedMandateKey] =
    useState(defaultMandateKey);

  // State for submit on enter (defaults to user preference)
  const [submitOnEnter, setSubmitOnEnter] = useState(
    promptsPreferences.submitOnEnter,
  );

  // conversationId replaces the old runId — client-generated UUID, honored end-to-end
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Track whether we launched for this open session
  const hasLaunchedRef = useRef(false);

  // ─── Agent execution selectors (all keyed on conversationId) ────────────────

  const streamingTextSelector = useMemo(
    () =>
      conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
    [conversationId],
  );
  const streamingText = useAppSelector(streamingTextSelector);

  // Live output is read straight off the conversation's newest request row
  // (no `MarkdownStream requestId=`), so this viewer retains the row for its
  // own mount lifetime — otherwise an owner reap mid-stream blanks it for good.
  // Doctrine: /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
  useRetainLatestRequestForViewer(conversationId, "useAICodeEditor");

  const streamPhase = useAppSelector((state) =>
    conversationId ? selectStreamPhase(conversationId)(state) : "idle",
  );

  const isExecuting = useAppSelector((state) =>
    conversationId ? selectIsExecuting(conversationId)(state) : false,
  );

  // Resolved variables (replaces selectMergedVariables)
  const resolvedVariablesSelector = useMemo(
    () =>
      conversationId
        ? selectResolvedVariables(conversationId)
        : () => ({}) as Record<string, unknown>,
    [conversationId],
  );
  const variables = useAppSelector(resolvedVariablesSelector, shallowEqual);

  // Conversation history (replaces selectMessages)
  const messagesSelector = useMemo(
    () =>
      conversationId
        ? selectConversationMessages(conversationId)
        : () => EMPTY_CONVERSATION_MESSAGES,
    [conversationId],
  );
  const messages = useAppSelector(messagesSelector);

  // Derived from streamPhase: "complete" replaces selectIsResponseEndedForInstance
  const isResponseEnded = streamPhase === "complete" || streamPhase === "error";

  // isLoadingPrompt — true while we're launching (before conversationId lands)
  const [isLaunching, setIsLaunching] = useState(false);
  const isLoadingPrompt = isLaunching;

  // ─── Local editor state ──────────────────────────────────────────────────────

  const [state, setState] = useState<EditorState>("input");
  const [parsedEdits, setParsedEdits] = useState<ReturnType<
    typeof parseCodeEdits
  > | null>(null);
  const [modifiedCode, setModifiedCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [rawAIResponse, setRawAIResponse] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // ─── Launch agent when modal opens ──────────────────────────────────────────

  useEffect(() => {
    if (!open || hasLaunchedRef.current) return;
    if (!selectedMandateKey) return;

    hasLaunchedRef.current = true;
    setIsLaunching(true);

    // Build special variables to seed the agent at launch time
    const codeContext: CodeEditorContext = {
      currentCode,
      selection,
      context,
      language,
    };
    const initialVariables: Record<string, string> = {
      current_code: currentCode,
      content: currentCode,
      ...(selection ? { selection } : {}),
      ...(context ? { context } : {}),
    };

    // The mandate resolves INSIDE the launch funnel (agent + config_overrides).
    // An unresolvable mandate rejects loudly — the error state below is the
    // only "fallback".
    launchMandate(selectedMandateKey, {
      sourceFeature: "code-editor",
      surfaceKey: `code-editor:${selectedMandateKey}`,
      config: {
        displayMode: "direct",
        autoRun: false,
        allowChat: true,
        showPreExecutionGate: false,
        showVariablePanel: false,
      },
      runtime: {
        variables: initialVariables,
        applicationScope: {
          context: {
            current_code: currentCode,
            content: currentCode,
            ...(selection ? { selection } : {}),
            ...(context ? { context } : {}),
            language,
          },
          userValues: initialVariables,
        },
      },
      onConversationCreated: (cid) => {
        setConversationId(cid);
        setIsLaunching(false);
      },
    }).catch((err) => {
      console.error("[useAICodeEditor] Error launching agent:", err);
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to initialize agent",
      );
      setIsLaunching(false);
      hasLaunchedRef.current = false;
    });
  }, [
    open,
    selectedMandateKey,
    currentCode,
    selection,
    context,
    language,
    launchMandate,
  ]);

  // ─── Update special variables when code context changes ─────────────────────
  // Mirrors what the old hook did with updateVariable + buildSpecialVariables.
  // We push updates into the instance's userValues so the agent sees current code.

  useEffect(() => {
    if (!conversationId) return;
    if (!isExecuting && state !== "processing") {
      // Only refresh variables when idle so we don't disturb an in-flight request
      const updates: Record<string, unknown> = {
        current_code: currentCode,
        content: currentCode,
        language,
      };
      if (selection) updates.selection = selection;
      if (context) updates.context = context;

      dispatch(
        setUserVariableValues({
          conversationId,
          values: updates,
        }),
      );
    }
  }, [
    conversationId,
    currentCode,
    selection,
    context,
    language,
    isExecuting,
    state,
    dispatch,
  ]);

  // ─── Watch for stream completion → parse code edits ─────────────────────────

  useEffect(() => {
    if (
      conversationId &&
      isResponseEnded &&
      streamingText &&
      state === "processing"
    ) {
      setRawAIResponse(streamingText);
    }
  }, [conversationId, isResponseEnded, streamingText, state]);

  // ─── Parse response when streaming completes ─────────────────────────────────

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
        errorMsg += `This usually means the AI is trying to edit code that doesn't exist or has changed.\n`; // access-errors: ok — describes SEARCH patterns that failed to match the local editor buffer, not a record read
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

  // ─── Watch for execution start → set processing state ───────────────────────

  useEffect(() => {
    if (isExecuting) {
      if (state !== "processing") {
        setState("processing");
      }
    }
  }, [isExecuting, state]);

  // ─── Cleanup on modal close ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      if (conversationId) {
        dispatch(destroyInstanceIfAllowed(conversationId));
      }
      setConversationId(null);
      hasLaunchedRef.current = false;
      setState("input");
      setParsedEdits(null);
      setModifiedCode("");
      setErrorMessage("");
      setRawAIResponse("");
      setIsCopied(false);
      setSelectedMandateKey(defaultMandateKey);
      setSubmitOnEnter(submitOnEnterPreference);
    }
  }, [
    open,
    defaultMandateKey,
    submitOnEnterPreference,
    conversationId,
    dispatch,
  ]);

  // ─── Update selected job when default changes ────────────────────────────────

  useEffect(() => {
    if (open) {
      setSelectedMandateKey(defaultMandateKey);
    }
  }, [open, defaultMandateKey]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleVariableValueChange = useCallback(
    (variableName: string, value: string) => {
      if (!conversationId) return;
      dispatch(
        setUserVariableValues({
          conversationId,
          values: { [variableName]: value },
        }),
      );
    },
    [conversationId, dispatch],
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

  // displayVariables: no longer driven by cachedPrompt.variableDefaults.
  // The agent's variable definitions live on the instance after launch.
  // We return an empty array — the SmartAgentInput handles variable display
  // natively for agent instances. If callers need variable display outside
  // SmartAgentInput, extend this by reading selectInstanceVariableDefinitions.
  const displayVariables = useMemo(() => [], []);

  return {
    // State
    state,
    setState,
    // instance is gone — status is now streamPhase
    instance: null,
    // cachedPrompt is gone — agent definitions live in agentDefinition slice
    cachedPrompt: null,
    variables,
    parsedEdits,
    modifiedCode,
    errorMessage,
    rawAIResponse,
    isCopied,
    selectedMandateKey,
    setSelectedMandateKey,
    submitOnEnter,
    isExecuting,
    isLoadingPrompt,
    diffStats,
    displayVariables,
    language,
    streamingText,
    messages,

    // conversationId replaces runId (SmartAgentInput keyed to conversationId)
    conversationId,
    // Keep runId as alias for any consumer that still uses it
    runId: conversationId,

    // Handlers
    handleVariableValueChange,
    handleSubmitOnEnterChange,
    handleCopyResponse,
    handleApplyChanges,
  };
}
