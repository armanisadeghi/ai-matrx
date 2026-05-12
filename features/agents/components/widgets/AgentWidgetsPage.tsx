"use client";

/**
 * AgentWidgetsPage
 *
 * Pure local-state test harness for agent engineers. Pick an agent, fill in
 * plain inputs for its variable definitions, configure launch options, and
 * click a display mode to launch a widget.
 *
 * Everything is LOCAL — no Redux writes, no instance borrowing, no automatic
 * resolution. The on-screen state is exactly what ships to `launchAgent` when
 * a display mode is clicked.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { Loader2, TestTube, ChevronDown, Rocket } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentExecutionPayload,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { AgentSelectorIsland } from "@/features/agents/components/shared/AgentSelectorIsland";
import { AgentModeController } from "@/features/agents/components/shared/AgentModeController";
import { AgentSaveStatus } from "@/features/agents/components/shared/AgentSaveStatus";
import { AgentOptionsMenu } from "@/features/agents/components/shared/AgentOptionsMenu";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  getAllDisplayTypes,
  getDisplayMeta,
} from "@/features/agents/utils/run-ui-utils";
import type {
  ManagedAgentOptions,
  ResultDisplayMode,
} from "@/features/agents/types/instance.types";
import type { JsonExtractionConfig } from "@/features/agents/types/instance.types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import { ApiEndpointMode } from "@/features/agents/types/instance.types";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import {
  TesterSettingsPanel,
  type TesterSettingsController,
} from "@/features/agents/components/run-controls/TesterSettingsPanel";
import { WidgetVariableInputs } from "./WidgetVariableInputs";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SURFACE_KEY_PREFIX = "agent-widgets-page";

const DEFAULT_EDITOR_SELECTION = "The capital of France is Paris.";
const DEFAULT_EDITOR_BEFORE = "Many people confuse capital cities.";
const DEFAULT_EDITOR_AFTER = "It is known for the Eiffel Tower.";
const DEFAULT_EDITOR_CONTENT =
  "Many people confuse capital cities. The capital of France is Paris. It is known for the Eiffel Tower. Some also mix it up with other European landmarks.";
const DEFAULT_EDITOR_CONTEXT =
  "This is part of a geography quiz about European capitals and common misconceptions.";

interface AgentWidgetsPageProps {
  agentId: string;
  initialAgentName: string;
  /** Base path for the embedded mode controller. Defaults to `/agents`. */
  basePath?: string;
  /** SSR-friendly current path. Optional — passed through to the mode
   *  controller, which falls back to `usePathname()` when omitted. */
  currentPath?: string;
}

export function AgentWidgetsPage({
  agentId,
  currentPath,
  initialAgentName,
  basePath = "/agents",
}: AgentWidgetsPageProps) {
  const dispatch = useAppDispatch();
  const { launchAgent } = useAgentLauncher();
  const launchCounterRef = useRef(0);

  const executionPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId),
  );
  const variableDefinitions = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );

  useEffect(() => {
    if (!executionPayload.isReady) {
      dispatch(fetchAgentExecutionMinimal(agentId)).catch((err) =>
        console.error("Failed to load agent execution payload:", err),
      );
    }
  }, [agentId, executionPayload.isReady, dispatch]);

  // ── Variable values + user input (pure local state) ────────────────────
  const [variableValues, setVariableValues] = useState<Record<string, unknown>>(
    {},
  );
  const [userInput, setUserInput] = useState("");

  // ── Settings (local state — matches TesterSettingsController shape) ────
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

  // ── Editor context ─────────────────────────────────────────────────────
  // Default OFF — the sample values never ship unless the user opts in.
  const [includeEditorContext, setIncludeEditorContext] = useState(false);
  const [editorSelection, setEditorSelection] = useState(
    DEFAULT_EDITOR_SELECTION,
  );
  const [editorTextBefore, setEditorTextBefore] = useState(
    DEFAULT_EDITOR_BEFORE,
  );
  const [editorTextAfter, setEditorTextAfter] = useState(DEFAULT_EDITOR_AFTER);
  const [editorContent, setEditorContent] = useState(DEFAULT_EDITOR_CONTENT);
  const [editorContext, setEditorContext] = useState(DEFAULT_EDITOR_CONTEXT);

  // ── Advanced ───────────────────────────────────────────────────────────
  const [apiEndpointMode, setApiEndpointMode] =
    useState<ApiEndpointMode>("agent");
  const [showAutoClearToggle, setShowAutoClearToggle] = useState(false);
  const [autoClearConversation, setAutoClearConversation] = useState(false);
  const [jsonExtractionEnabled, setJsonExtractionEnabled] = useState(false);
  const [jsonExtractionFuzzy, setJsonExtractionFuzzy] = useState(false);
  const [jsonExtractionMaxResults, setJsonExtractionMaxResults] = useState("");
  const [overridesJson, setOverridesJson] = useState("");
  const [applicationScopeJson, setApplicationScopeJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const controller: TesterSettingsController = {
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
  };

  // Skip direct/background — they need the borrowing-conversation test modal
  // which this page doesn't provide.
  const displayTypes = getAllDisplayTypes()
    .filter((m) => m !== "direct" && m !== "background")
    .map((displayMode) => {
      const meta = getDisplayMeta(displayMode);
      const IconComponent = (props: any) => (
        <DynamicIcon name={meta.icon} {...props} />
      );
      return {
        name: meta.label,
        icon: IconComponent,
        color: meta.color,
        displayMode,
        note: meta.description,
        testMode: meta.testMode,
      };
    });

  const openWithDisplayType = async (displayMode: ResultDisplayMode) => {
    launchCounterRef.current += 1;
    const uniqueSurfaceKey = `${SURFACE_KEY_PREFIX}:${agentId}:${displayMode}:${launchCounterRef.current}:${Date.now()}`;

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

    const scope: Record<string, unknown> = {};
    if (includeEditorContext) {
      if (editorSelection) scope.selection = editorSelection;
      if (editorTextBefore) scope.text_before = editorTextBefore;
      if (editorTextAfter) scope.text_after = editorTextAfter;
      if (editorContent) scope.content = editorContent;
      if (editorContext) scope.context = editorContext;
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
      sourceFeature: "agent-tester",
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
        defaultVariables: variableValues,
        ...(preExecutionMessage ? { preExecutionMessage } : {}),
        ...(overrides ? { llmOverrides: overrides } : {}),
      },
      runtime: {
        ...(userInput ? { userInput } : {}),
        ...(includeEditorContext && editorSelection ? { originalText: editorSelection } : {}),
        ...(applicationScope ? { applicationScope } : {}),
      },
    };

    try {
      await launchAgent(agentId, options);
    } catch (error) {
      console.error("Widget launch failed:", error);
      setJsonError(
        `Launch failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  };

  // Clear variable values when the agent changes — names may differ.
  useEffect(() => {
    setVariableValues({});
  }, [agentId]);

  const isLoading = !executionPayload.isReady;

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Header — mirrors AgentRunHeader, minus the new-run button (no conversation here) */}
      <div className="hidden lg:flex items-center justify-between w-full gap-2 shrink-0 pr-12">
        <div className="flex items-center">
          <Link href={basePath} aria-label="Back to Agents">
            <ChevronLeftTapButton />
          </Link>
          <AgentSelectorIsland
            agentId={agentId}
            initialName={initialAgentName}
            basePath={basePath}
          />
        </div>
        <div>
          <AgentModeController
            agentId={agentId}
            basePath={basePath}
            currentPath={currentPath}
          />
        </div>
        <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
          <AgentSaveStatus agentId={agentId} />
          <AgentOptionsMenu agentId={agentId} basePath={basePath} />
        </div>
      </div>

      {/* Body — sidebar settings/launcher + main variable inputs */}
      <div className="flex-1 overflow-hidden flex min-w-0">
        <aside className="w-[280px] shrink-0 overflow-y-auto">
          <div className="p-2 space-y-2">
            {/* Launch dropdown — picks a display mode and fires immediately */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  className="w-full justify-between h-9 text-xs font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Rocket className="w-3.5 h-3.5 text-primary" />
                    Launch Display Mode
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[260px]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-primary">
                  Pick a Display Mode
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {displayTypes.map((display) => (
                  <DropdownMenuItem
                    key={display.displayMode}
                    onSelect={() => openWithDisplayType(display.displayMode)}
                    title={display.note}
                    className="gap-2 text-xs"
                  >
                    {display.icon && (
                      <display.icon
                        className={`w-4 h-4 shrink-0 ${display.color}`}
                      />
                    )}
                    <span className="flex-1 font-medium">{display.name}</span>
                    {display.testMode && (
                      <Badge variant="outline" className="text-[8px] h-4 px-1">
                        <TestTube className="w-2.5 h-2.5" />
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <TesterSettingsPanel
              controller={controller}
              idPrefix="widgets-page"
            />
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="p-4 max-w-3xl space-y-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading agent definition…
              </div>
            ) : (
              <>
                <section className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Variables
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {variableDefinitions?.length ?? 0} defined
                    </span>
                  </div>
                  <WidgetVariableInputs
                    definitions={variableDefinitions ?? []}
                    values={variableValues}
                    onChange={setVariableValues}
                  />
                </section>

                <section className="space-y-1.5">
                  <Label
                    htmlFor="widgets-user-input"
                    className="text-xs font-semibold text-foreground uppercase tracking-wider"
                  >
                    User Input
                  </Label>
                  <textarea
                    id="widgets-user-input"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    rows={4}
                    placeholder="Text the user would send with this launch (optional)"
                    className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
