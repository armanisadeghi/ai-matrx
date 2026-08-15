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

import { useEffect, useRef, useState, type ComponentProps } from "react";
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
import type { ResultDisplayMode } from "@/features/agents/types/instance.types";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";
import {
  TesterSettingsPanel,
  type TesterSettingsController,
} from "@/features/agents/components/run-controls/TesterSettingsPanel";
import { WidgetVariableInputs } from "./WidgetVariableInputs";
import {
  buildWidgetLaunchDraft,
  sealWidgetLaunchOptions,
  type WidgetLaunchState,
} from "./build-widget-launch";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  agentWidgetTesterKpis,
  agentWidgetTesterSummary,
  buildAgentWidgetVariableRows,
} from "@/features/agents/format";
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
      const IconComponent = (
        props: Omit<ComponentProps<typeof DynamicIcon>, "name">,
      ) => <DynamicIcon name={meta.icon} {...props} />;
      return {
        name: meta.label,
        icon: IconComponent,
        color: meta.color,
        displayMode,
        note: meta.description,
        testMode: meta.testMode,
      };
    });

  /** Live tester state, in the one shape the launch builder reads. */
  const launchState: WidgetLaunchState = {
    variableValues,
    userInput,
    autoRun,
    showVariablePanel,
    variablesPanelStyle,
    showPreExecutionGate,
    preExecutionMessage,
    showDefinitionMessages,
    showDefinitionMessageContent,
    allowChat,
    hideReasoning,
    hideToolResults,
    includeEditorContext,
    editorSelection,
    editorTextBefore,
    editorTextAfter,
    editorContent,
    editorContext,
    apiEndpointMode,
    showAutoClearToggle,
    autoClearConversation,
    jsonExtractionEnabled,
    jsonExtractionFuzzy,
    jsonExtractionMaxResults,
    overridesJson,
    applicationScopeJson,
  };

  const openWithDisplayType = async (displayMode: ResultDisplayMode) => {
    launchCounterRef.current += 1;
    const uniqueSurfaceKey = `${SURFACE_KEY_PREFIX}:${agentId}:${displayMode}:${launchCounterRef.current}:${Date.now()}`;

    setJsonError(null);

    const build = buildWidgetLaunchDraft(launchState);
    if (!build.ok) {
      setJsonError(build.error);
      return;
    }

    try {
      await launchAgent(
        agentId,
        sealWidgetLaunchOptions(build.draft, {
          surfaceKey: uniqueSurfaceKey,
          displayMode,
        }),
      );
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

  // ── Copy / export ────────────────────────────────────────────────────
  //
  // LIVE state only. This page's whole point is that the form IS the payload:
  // copying the fetched agent record after the user typed a variable value
  // would hand the agent something that is not on screen. Every builder below
  // runs inside the click handler and reads current state, including the red
  // JSON error banner verbatim and the exact launch draft the Launch dropdown
  // would ship.
  const location = `AI Matrx — Agent widget tester (${basePath}/${agentId}/widgets)`;
  const definitions = variableDefinitions ?? [];
  const variableRows = () =>
    buildAgentWidgetVariableRows(definitions, variableValues);
  const kpis = () =>
    agentWidgetTesterKpis({
      definitions,
      values: variableValues,
      userInput,
      includeEditorContext,
      jsonError,
    });
  const displayModeNames = displayTypes.map((d) => d.name);

  /** What the Launch dropdown would ship right now, or the blocker. */
  const launchPreview = () => {
    const build = buildWidgetLaunchDraft(launchState);
    return build.ok
      ? {
          status: "ready" as const,
          note: "surfaceKey and config.displayMode are assigned when a display mode is clicked; everything else below is exactly what ships to launchAgent.",
          display_modes_available: displayModeNames,
          draft: build.draft,
        }
      : {
          status: "blocked" as const,
          note: "Clicking a display mode right now would not launch — this error is what the tester shows instead.",
          error: build.error,
          display_modes_available: displayModeNames,
        };
  };

  const testerView = () => ({
    agent: { id: agentId, name: initialAgentName },
    state: isLoading ? "loading agent definition" : "ready",
    kpis: kpis(),
    error_on_screen: jsonError,
    variables: variableRows(),
    user_input: userInput,
    settings: {
      auto_run: autoRun,
      allow_chat: allowChat,
      show_variable_panel: showVariablePanel,
      variables_panel_style: variablesPanelStyle,
      show_pre_execution_gate: showPreExecutionGate,
      pre_execution_message: preExecutionMessage,
      show_definition_messages: showDefinitionMessages,
      show_definition_message_content: showDefinitionMessageContent,
      hide_reasoning: hideReasoning,
      hide_tool_results: hideToolResults,
    },
    editor_context: {
      included: includeEditorContext,
      selection: editorSelection,
      text_before: editorTextBefore,
      text_after: editorTextAfter,
      content: editorContent,
      context: editorContext,
    },
    advanced: {
      api_endpoint_mode: apiEndpointMode,
      show_auto_clear_toggle: showAutoClearToggle,
      auto_clear_conversation: autoClearConversation,
      json_extraction_enabled: jsonExtractionEnabled,
      json_extraction_fuzzy: jsonExtractionFuzzy,
      json_extraction_max_results: jsonExtractionMaxResults,
      overrides_json: overridesJson,
      application_scope_json: applicationScopeJson,
    },
    launch_preview: launchPreview(),
  });

  const testerHuman = () =>
    agentWidgetTesterSummary({
      agentId,
      agentName: initialAgentName,
      kpis: kpis(),
      variables: variableRows(),
      userInput,
      jsonError,
      isLoading,
      displayModes: displayModeNames,
    });

  const testerAttributes = () => ({
    ...kpis(),
    agent_id: agentId,
    launch_status: launchPreview().status,
  });

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
          <CopyButtons
            size="icon"
            label={`Widget tester — ${initialAgentName}`}
            human={testerHuman}
            json={testerView}
            agent={() => ({
              kind: "agent-widget-tester",
              location,
              description: `The agent widget tester for ${initialAgentName} exactly as configured on screen right now: live variable values, user input, every launch setting, and the launch options a display-mode click would ship.`,
              data: testerView(),
              summary: testerHuman(),
              attributes: testerAttributes(),
              context: { agent_name: initialAgentName, base_path: basePath },
            })}
            agentVariant={{
              label: "This page (what I see)",
              hint: "Live form state + the launch draft it produces",
              position: "first",
            }}
            aiVariants={[
              {
                id: "launch-options",
                label: "Launch options only",
                hint: "Just what ships to launchAgent",
                build: () => ({
                  kind: "agent-widget-launch-options",
                  location,
                  description: `The launch options the widget tester would send for ${initialAgentName}, built by the same builder the Launch dropdown uses.`,
                  data: {
                    agent: { id: agentId, name: initialAgentName },
                    kpis: kpis(),
                    error_on_screen: jsonError,
                    launch_preview: launchPreview(),
                  },
                  attributes: testerAttributes(),
                }),
              },
              {
                id: "variables",
                label: "Variables + input",
                hint: "Definitions, live values, and the user input",
                build: () => ({
                  kind: "agent-widget-variables",
                  location,
                  description: `The variable definitions for ${initialAgentName} with the values currently typed into the tester, plus the user input box.`,
                  data: {
                    agent: { id: agentId, name: initialAgentName },
                    kpis: kpis(),
                    error_on_screen: jsonError,
                    variables: variableRows(),
                    user_input: userInput,
                  },
                  attributes: testerAttributes(),
                }),
              },
            ]}
          />
          <ExportMenu
            label={`agent-widget-tester-${initialAgentName}`}
            items={[
              jsonExportItem(testerView, "JSON (page state)"),
              jsonExportItem(launchPreview, "JSON (launch options)"),
              csvExportItem(
                () =>
                  variableRows().map((row) => ({
                    name: row.name,
                    required: row.required,
                    input_kind: row.input_kind,
                    filled: row.filled,
                    current_value:
                      row.current_value === undefined
                        ? ""
                        : JSON.stringify(row.current_value),
                    default_value:
                      row.default_value === undefined
                        ? ""
                        : JSON.stringify(row.default_value),
                    help_text: row.help_text ?? "",
                    bound_to_context_item: row.bound_to_context_item ?? "",
                  })),
                "CSV (all variables)",
              ),
            ]}
          />
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
                <section className="group/vars space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      Variables
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {definitions.length} defined
                      </span>
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/vars:opacity-100">
                        <CopyButtons
                          size="xs"
                          label="Widget tester variables"
                          human={() =>
                            variableRows().length
                              ? variableRows()
                                  .map(
                                    (row) =>
                                      `- ${row.name}${row.required ? " *" : ""}: ${
                                        row.filled
                                          ? JSON.stringify(row.current_value)
                                          : "(empty)"
                                      }`,
                                  )
                                  .join("\n")
                              : "This agent has no variable definitions."
                          }
                          json={variableRows}
                          agent={() => ({
                            kind: "agent-widget-variables",
                            location,
                            description: `The Variables section of the widget tester for ${initialAgentName} — every definition with the value currently typed in.`,
                            data: {
                              agent: { id: agentId, name: initialAgentName },
                              kpis: kpis(),
                              error_on_screen: jsonError,
                              variables: variableRows(),
                            },
                            attributes: testerAttributes(),
                          })}
                        />
                      </span>
                    </div>
                  </div>
                  <WidgetVariableInputs
                    definitions={definitions}
                    values={variableValues}
                    onChange={setVariableValues}
                  />
                </section>

                <section className="group/input space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label
                      htmlFor="widgets-user-input"
                      className="text-xs font-semibold text-foreground uppercase tracking-wider"
                    >
                      User Input
                    </Label>
                    <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/input:opacity-100">
                      <CopyButtons
                        size="xs"
                        label="Widget tester user input"
                        human={() => userInput || "(empty)"}
                        agent={() => ({
                          kind: "agent-widget-user-input",
                          location,
                          description: `The user-input text currently typed into the widget tester for ${initialAgentName} — the text that would ship as runtime.userInput.`,
                          data: {
                            agent: { id: agentId, name: initialAgentName },
                            kpis: kpis(),
                            user_input: userInput,
                          },
                          attributes: testerAttributes(),
                        })}
                      />
                    </span>
                  </div>
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
