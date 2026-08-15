/**
 * build-widget-launch — the ONE extractor that turns the widget tester's
 * on-screen form into launch options.
 *
 * `AgentWidgetsPage` is a pure local-state harness: "the on-screen state is
 * exactly what ships to `launchAgent`". That promise only holds if there is a
 * single builder, so both consumers read it here:
 *
 *   - clicking a display mode → the options actually launched
 *   - Copy / Copy-for-AI      → the SAME options, so the payload is what the
 *                               user sees, never a parallel re-derivation
 *
 * Pure: no React, no side effects. JSON parse failures come back as the exact
 * `error` string the tester renders in its red banner, so the copy payload can
 * carry the blocker verbatim instead of silently omitting it.
 */

import type {
  ApiEndpointMode,
  JsonExtractionConfig,
  ManagedAgentOptions,
  ResultDisplayMode,
} from "@/features/agents/types/instance.types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";

/** Every piece of live tester state the launch options are built from. */
export interface WidgetLaunchState {
  variableValues: Record<string, unknown>;
  userInput: string;

  autoRun: boolean;
  showVariablePanel: boolean;
  variablesPanelStyle: VariablesPanelStyle;
  showPreExecutionGate: boolean;
  preExecutionMessage: string;
  showDefinitionMessages: boolean;
  showDefinitionMessageContent: boolean;
  allowChat: boolean;
  hideReasoning: boolean;
  hideToolResults: boolean;

  includeEditorContext: boolean;
  editorSelection: string;
  editorTextBefore: string;
  editorTextAfter: string;
  editorContent: string;
  editorContext: string;

  apiEndpointMode: ApiEndpointMode;
  showAutoClearToggle: boolean;
  autoClearConversation: boolean;
  jsonExtractionEnabled: boolean;
  jsonExtractionFuzzy: boolean;
  jsonExtractionMaxResults: string;
  overridesJson: string;
  applicationScopeJson: string;
}

/**
 * Launch options minus the two values assigned at click time: `surfaceKey`
 * (minted per launch) and `config.displayMode` (the mode the user clicks).
 * Everything else is fully determined by what is on screen — which is exactly
 * what makes this copyable before any mode is chosen.
 */
export type WidgetLaunchDraft = Omit<
  ManagedAgentOptions,
  "surfaceKey" | "config"
> & {
  config: Omit<NonNullable<ManagedAgentOptions["config"]>, "displayMode">;
};

export type WidgetLaunchBuild =
  { ok: true; draft: WidgetLaunchDraft } | { ok: false; error: string };

/** Build the launch draft from live state, or the blocking error verbatim. */
export function buildWidgetLaunchDraft(
  state: WidgetLaunchState,
): WidgetLaunchBuild {
  let overrides: Partial<FeLlmParams> | undefined;
  if (state.overridesJson.trim()) {
    try {
      const parsed = JSON.parse(state.overridesJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "Overrides must be a JSON object" };
      }
      overrides = parsed;
    } catch (e) {
      return {
        ok: false,
        error: `Overrides JSON: ${e instanceof Error ? e.message : "invalid"}`,
      };
    }
  }

  const scope: Record<string, unknown> = {};
  if (state.includeEditorContext) {
    if (state.editorSelection) scope.selection = state.editorSelection;
    if (state.editorTextBefore) scope.text_before = state.editorTextBefore;
    if (state.editorTextAfter) scope.text_after = state.editorTextAfter;
    if (state.editorContent) scope.content = state.editorContent;
    if (state.editorContext) scope.context = state.editorContext;
  }

  if (state.applicationScopeJson.trim()) {
    try {
      const parsed = JSON.parse(state.applicationScopeJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "Application scope must be a JSON object" };
      }
      Object.assign(scope, parsed);
    } catch (e) {
      return {
        ok: false,
        error: `Scope JSON: ${e instanceof Error ? e.message : "invalid"}`,
      };
    }
  }
  const applicationScope: ApplicationScope | undefined =
    Object.keys(scope).length > 0 ? (scope as ApplicationScope) : undefined;

  const maxResults = state.jsonExtractionMaxResults.trim()
    ? Number(state.jsonExtractionMaxResults)
    : NaN;

  const jsonExtraction: JsonExtractionConfig | undefined =
    state.jsonExtractionEnabled
      ? {
          enabled: true,
          ...(state.jsonExtractionFuzzy ? { fuzzyOnFinalize: true } : {}),
          ...(Number.isFinite(maxResults) ? { maxResults } : {}),
        }
      : undefined;

  return {
    ok: true,
    draft: {
      sourceFeature: "agents-other",
      apiEndpointMode: state.apiEndpointMode,
      autoClearConversation: state.autoClearConversation,
      showAutoClearToggle: state.showAutoClearToggle,
      ...(jsonExtraction ? { jsonExtraction } : {}),
      config: {
        autoRun: state.autoRun,
        allowChat: state.allowChat,
        showPreExecutionGate: state.showPreExecutionGate,
        variablesPanelStyle: state.variablesPanelStyle,
        showVariablePanel: state.showVariablePanel,
        showDefinitionMessages: state.showDefinitionMessages,
        showDefinitionMessageContent: state.showDefinitionMessageContent,
        hideReasoning: state.hideReasoning,
        hideToolResults: state.hideToolResults,
        defaultVariables: state.variableValues,
        ...(state.preExecutionMessage
          ? { preExecutionMessage: state.preExecutionMessage }
          : {}),
        ...(overrides ? { llmOverrides: overrides } : {}),
      },
      runtime: {
        ...(state.userInput ? { userInput: state.userInput } : {}),
        ...(state.includeEditorContext && state.editorSelection
          ? { originalText: state.editorSelection }
          : {}),
        ...(applicationScope ? { applicationScope } : {}),
      },
    },
  };
}

/** Seal a draft into the options `launchAgent` is called with. */
export function sealWidgetLaunchOptions(
  draft: WidgetLaunchDraft,
  args: { surfaceKey: string; displayMode: ResultDisplayMode },
): ManagedAgentOptions {
  return {
    ...draft,
    surfaceKey: args.surfaceKey,
    config: { ...draft.config, displayMode: args.displayMode },
  };
}
