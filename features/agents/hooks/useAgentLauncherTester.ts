import { useState, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectAppContext } from "@/features/agent-context/redux/appContextSlice";
import type {
  ApiEndpointMode,
  JsonExtractionConfig,
  ManagedAgentOptions,
  ResultDisplayMode,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";

// Defaults for the simulated editor context (matches the user-supplied sample).
const DEFAULT_EDITOR_SELECTION = "The capital of France is Paris.";
const DEFAULT_EDITOR_BEFORE = "Many people confuse capital cities.";
const DEFAULT_EDITOR_AFTER = "It is known for the Eiffel Tower.";
const DEFAULT_EDITOR_CONTENT =
  "Many people confuse capital cities. The capital of France is Paris. It is known for the Eiffel Tower. Some also mix it up with other European landmarks.";
const DEFAULT_EDITOR_CONTEXT =
  "This is part of a geography quiz about European capitals and common misconceptions.";

/**
 * Test harness state + launcher.
 *
 * `sourceFeature` is identified by the host UI (passed in as an arg), not
 * configurable from inside the tester. Every launch gets a unique surfaceKey
 * derived from `surfaceKeyPrefix` so parallel widgets never collide in the
 * focus registry.
 */
export function useAgentLauncherTester(
  conversationId: string,
  sourceFeature: SourceFeature,
  surfaceKeyPrefix: string,
) {
  const { launchAgent } = useAgentLauncher();
  const launchCounterRef = useRef(0);

  // ── Test-modal (direct/background) ────────────────────────────────────────
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testModalType, setTestModalType] = useState<"direct" | "background">(
    "direct",
  );

  // ── Main settings (visible, no heading) ───────────────────────────────────
  const [autoRun, setAutoRun] = useState(true);
  const [showVariablePanel, setShowVariablePanel] = useState(true);
  const [variablesPanelStyle, setVariablesPanelStyle] =
    useState<VariablesPanelStyle>("inline");
  const [showPreExecutionGate, setShowPreExecutionGate] = useState(false);
  const [preExecutionMessage, setPreExecutionMessage] = useState("");
  const [showDefinitionMessages, setShowDefinitionMessages] = useState(true);
  const [showDefinitionMessageContent, setShowDefinitionMessageContent] =
    useState(false);
  const [allowChat, setAllowChat] = useState(true);
  const [hideReasoning, setHideReasoning] = useState(false);
  const [hideToolResults, setHideToolResults] = useState(false);

  // ── Simulated editor context (mimics UnifiedContextMenu scope) ───────────
  // Default OFF so the sample values never ship unless the user opts in.
  const [includeEditorContext, setIncludeEditorContext] = useState(false);
  const [editorSelection, setEditorSelection] = useState<string>(
    DEFAULT_EDITOR_SELECTION,
  );
  const [editorTextBefore, setEditorTextBefore] = useState<string>(
    DEFAULT_EDITOR_BEFORE,
  );
  const [editorTextAfter, setEditorTextAfter] =
    useState<string>(DEFAULT_EDITOR_AFTER);
  const [editorContent, setEditorContent] = useState<string>(
    DEFAULT_EDITOR_CONTENT,
  );
  const [editorContext, setEditorContext] = useState<string>(
    DEFAULT_EDITOR_CONTEXT,
  );

  // ── Quick test features (local borrow toggles) ───────────────────────────
  const [applyVariables, setApplyVariables] = useState(true);
  const [applyUserInput, setApplyUserInput] = useState(true);
  const [applyAppContext, setApplyAppContext] = useState(true);

  // ── Advanced controls ────────────────────────────────────────────────────
  const [apiEndpointMode, setApiEndpointMode] =
    useState<ApiEndpointMode>("agent");
  const [showAutoClearToggle, setShowAutoClearToggle] = useState(false);
  const [autoClearConversation, setAutoClearConversation] = useState(false);
  const [jsonExtractionEnabled, setJsonExtractionEnabled] = useState(false);
  const [jsonExtractionFuzzy, setJsonExtractionFuzzy] = useState(false);
  const [jsonExtractionMaxResults, setJsonExtractionMaxResults] =
    useState<string>("");
  const [overridesJson, setOverridesJson] = useState("");
  const [applicationScopeJson, setApplicationScopeJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // ── Sourced from Redux ────────────────────────────────────────────────────
  const instance = useAppSelector(selectInstance(conversationId));
  const currentVariables = useAppSelector(
    selectResolvedVariables(conversationId),
  );
  const currentInput = useAppSelector(selectUserInputText(conversationId));
  const appContext = useAppSelector(selectAppContext);

  const openWithDisplayType = async (displayMode: ResultDisplayMode) => {
    if (!instance) {
      console.warn("No active instance — cannot test display type");
      return;
    }

    if (displayMode === "direct" || displayMode === "background") {
      setTestModalType(displayMode);
      setTestModalOpen(true);
      return;
    }

    // Unique surfaceKey per launch so N parallel widgets never collide.
    launchCounterRef.current += 1;
    const uniqueSurfaceKey = `${surfaceKeyPrefix}:${displayMode}:${launchCounterRef.current}:${Date.now()}`;

    setJsonError(null);

    let overrides: Partial<FeLlmParams> | undefined;
    if (overridesJson.trim()) {
      try {
        const parsed = JSON.parse(overridesJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setJsonError("Overrides must be a JSON object");
          return;
        }
        overrides = parsed;
      } catch (e) {
        setJsonError(
          `Overrides JSON: ${e instanceof Error ? e.message : "invalid"}`,
        );
        return;
      }
    }

    // Compose the application scope. Editor context is opt-in — the sample
    // values stay dormant unless the user enables the toggle. App context
    // and manual JSON override still apply when editor context is off.
    const scope: Record<string, unknown> = {};
    if (includeEditorContext) {
      if (editorSelection) scope.selection = editorSelection;
      if (editorTextBefore) scope.text_before = editorTextBefore;
      if (editorTextAfter) scope.text_after = editorTextAfter;
      if (editorContent) scope.content = editorContent;
      if (editorContext) scope.context = editorContext;
    }

    if (applyAppContext) {
      scope.app_context = {
        organization_id: appContext.organization_id,
        organization_name: appContext.organization_name,
        scope_selections: appContext.scope_selections,
        project_id: appContext.project_id,
        project_name: appContext.project_name,
        task_id: appContext.task_id,
        task_name: appContext.task_name,
        conversation_id: appContext.conversation_id,
      };
    }

    if (applicationScopeJson.trim()) {
      try {
        const parsed = JSON.parse(applicationScopeJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setJsonError("Application scope must be a JSON object");
          return;
        }
        Object.assign(scope, parsed);
      } catch (e) {
        setJsonError(
          `Scope JSON: ${e instanceof Error ? e.message : "invalid"}`,
        );
        return;
      }
    }

    const applicationScope: ApplicationScope | undefined =
      Object.keys(scope).length > 0 ? (scope as ApplicationScope) : undefined;

    const maxResults = jsonExtractionMaxResults.trim()
      ? Number(jsonExtractionMaxResults)
      : NaN;

    const jsonExtraction: JsonExtractionConfig | undefined =
      jsonExtractionEnabled
        ? {
            enabled: true,
            ...(jsonExtractionFuzzy ? { fuzzyOnFinalize: true } : {}),
            ...(Number.isFinite(maxResults) ? { maxResults } : {}),
          }
        : undefined;

    const options: ManagedAgentOptions = {
      surfaceKey: uniqueSurfaceKey,
      sourceFeature,
      apiEndpointMode,
      autoClearConversation,
      showAutoClearToggle,
      ...(jsonExtraction ? { jsonExtraction } : {}),
      config: {
        displayMode,
        autoRun,
        allowChat,
        showPreExecutionGate,
        variablesPanelStyle,
        showVariablePanel,
        showDefinitionMessages,
        showDefinitionMessageContent,
        hideReasoning,
        hideToolResults,
        ...(preExecutionMessage ? { preExecutionMessage } : {}),
        ...(overrides ? { llmOverrides: overrides } : {}),
        ...(applyVariables ? { defaultVariables: currentVariables } : {}),
      },
      runtime: {
        ...(includeEditorContext && editorSelection ? { originalText: editorSelection } : {}),
        ...(applicationScope ? { applicationScope } : {}),
        ...(applyUserInput && currentInput ? { userInput: currentInput } : {}),
      },
    };

    try {
      await launchAgent(instance.agentId, options);
    } catch (error) {
      console.error("Programmatic agent execution failed:", error);
    }
  };

  return {
    // Modal
    testModalOpen,
    setTestModalOpen,
    testModalType,
    // Main settings
    autoRun,
    setAutoRun,
    showVariablePanel,
    setShowVariablePanel,
    variablesPanelStyle,
    setVariablesPanelStyle,
    showPreExecutionGate,
    setShowPreExecutionGate,
    preExecutionMessage,
    setPreExecutionMessage,
    showDefinitionMessages,
    setShowDefinitionMessages,
    showDefinitionMessageContent,
    setShowDefinitionMessageContent,
    allowChat,
    setAllowChat,
    hideReasoning,
    setHideReasoning,
    hideToolResults,
    setHideToolResults,
    // Editor context
    includeEditorContext,
    setIncludeEditorContext,
    editorSelection,
    setEditorSelection,
    editorTextBefore,
    setEditorTextBefore,
    editorTextAfter,
    setEditorTextAfter,
    editorContent,
    setEditorContent,
    editorContext,
    setEditorContext,
    // Quick test features
    applyVariables,
    setApplyVariables,
    applyUserInput,
    setApplyUserInput,
    applyAppContext,
    setApplyAppContext,
    // Advanced controls
    apiEndpointMode,
    setApiEndpointMode,
    showAutoClearToggle,
    setShowAutoClearToggle,
    autoClearConversation,
    setAutoClearConversation,
    jsonExtractionEnabled,
    setJsonExtractionEnabled,
    jsonExtractionFuzzy,
    setJsonExtractionFuzzy,
    jsonExtractionMaxResults,
    setJsonExtractionMaxResults,
    overridesJson,
    setOverridesJson,
    applicationScopeJson,
    setApplicationScopeJson,
    jsonError,
    // Data
    instance,
    currentVariables,
    currentInput,
    appContext,
    // Action
    openWithDisplayType,
  };
}
