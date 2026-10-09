"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, {
  useState,
  useEffect,
  useCallback,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useShortcutTrigger } from "@ai-matrx/chat/agents/hooks/useShortcutTrigger";
import { destroyInstanceIfAllowed } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectLatestAccumulatedText,
  selectLatestRequestId,
  selectIsStreaming,
  selectStreamPhase,
  type StreamPhase,
} from "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectJsonExtractionRevision,
} from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useRetainRequestForViewer } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import {
  extractAgentConfig,
  extractAgentName,
} from "../utils/agent-config-extractor";
import {
  createAgentFromBuilder,
  useAgentBuilder,
  type AgentOwner,
} from "../services/agentBuilderService";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { useMandate } from "@ai-matrx/chat/mandates/useMandate";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { resolvePreferredAuthoringModel } from "@/features/ai-models/preferredAuthoringModel";
import { getSystemShortcut } from "@ai-matrx/chat/agents/constants/system-shortcuts";
import { ensureShortcutLoaded } from "@ai-matrx/chat/agents/redux/agent-shortcuts/thunks";
import { useDebugContext } from "@/hooks/useDebugContext";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { extractErrorMessage } from "@/utils/errors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { useFactoryDoor } from "@/features/agents/factory/door";
import { startAgentBuild } from "@/features/agents/factory/service";
import { KEPT_OUTCOMES, type FactoryBuildState } from "@/features/agents/factory/types";
import { BuildProgress } from "@/features/agents/factory/components/BuildProgress";

const GENERATOR_SHORTCUT = getSystemShortcut("agent-generator-01");

// Toasts default to bottom-right (Sonner default), which collides with this
// component's action buttons. Pin every toast in this component to top-center.
const TOAST_POSITION = "top-center" as const;
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system/controls";
import {
  Hammer,
  Check,
  Loader2,
  Copy,
  AlertTriangle,
  Rocket,
  Bug,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { AgentStreamingResponse } from "./AgentJsonDisplay";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { ExamplesField, emptyExamples } from "@/features/agents/factory/components/ExamplesField";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@ai-matrx/kit/text";

// =============================================================================
// Error Boundary — crash-proof fallback to raw MarkdownStream
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackContent: string;
  isStreamActive: boolean;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GeneratorErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[AgentGenerator] Render error caught by boundary:",
      error,
      info,
    );
    this.props.onError?.(error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex-none p-2 bg-red-100 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <span className="type-secondary text-red-700 dark:text-red-300">
              <strong>Display Error:</strong>{" "}
              {asClause(this.state.error?.message ?? "Unknown rendering error")}. Showing
              raw response below.
            </span>
            <ErrorAlchemyMenu error={this.state.error?.message} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <RichContent level="full" imagePolicy="ai"
              source={this.props.fallbackContent}
              isStreaming={this.props.isStreamActive}
              hideCopyButton={false}
            />
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * MANDATE MODE — the Mandate workspace's "+ Agent" door.
 *
 * The SAME generator, launched through the `mandates.holder_draft` Mandate
 * instead of the free-form generator: the job's contract rides as the
 * mandate's offered `variables`, the person's own guidance rides `userInput`
 * (THE USER-INPUT LAW — nothing structured ever travels there), and the
 * created agent is handed BACK through `onCreated` instead of navigating to
 * the builder, so the caller can set it as the Holder and open the editor.
 * `owner` decides whose agent it is — the rung's rule, never the page's.
 */
export interface AgentGeneratorMandateMode {
  /** The Mandate this agent is drafted to hold (AF-D door #5: the factory proves it on its runs). */
  mandateKey: string;
  /** Its display name — the factory build's name. */
  label: string;
  /** The offered values of `mandates.holder_draft_brief`, keyed by name. */
  variables: Record<string, unknown>;
  owner: AgentOwner;
  /** What the person sees in place of the free-form description. */
  summary: ReactNode;
  onCreated: (agentId: string) => void;
}

interface AgentGeneratorProps {
  onComplete?: () => void;
  mandate?: AgentGeneratorMandateMode;
}

const HOLDER_DRAFT_MANDATE_KEY = MANDATE_KEYS.mandates__holder_draft;
/** Words a factory build's derived name never ends on. */
const TRAILING_JOINERS = new Set(["a", "an", "the", "for", "of", "to", "and", "or", "in", "on", "with", "from", "by"]);
// Disclosure (the Agents menu): in mandate mode this component RUNS a fixed
// job, so it registers it; the free-form generator runs a chosen builder and
// registers nothing. Renders no UI either way.
const HOLDER_DRAFT_DISCLOSURE = [
  { mandateKey: HOLDER_DRAFT_MANDATE_KEY, does: "drafts an agent to hold this job" },
] as const;
const NO_DISCLOSURE: readonly never[] = [];
const HOLDER_DRAFT_JSON_EXTRACTION = {
  enabled: true,
  fuzzyOnFinalize: true,
  maxResults: 5,
} as const;

export function AgentGenerator({ onComplete, mandate }: AgentGeneratorProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const dispatch = useAppDispatch();
  const trigger = useShortcutTrigger();
  const { launchMandate } = useAgentLauncher();
  const openMandateWindow = useOpenMandateWindow();
  const { createAgent } = useAgentBuilder(onComplete);
  const mandateMode = mandate !== undefined;
  // AF-D doors #5 (mandate "+ Agent") and #6 (/agents/new/generate): each door's knob
  // (`agent_factory.door_mandate_holder_draft` / `door_generate`) decides. `pipeline` =
  // an Agent Factory build on the server, shown by BuildProgress; `legacy` = today's
  // generator below, unchanged.
  const pipelineMode = useFactoryDoor(mandateMode ? "mandate_holder_draft" : "generate") === "pipeline";
  useDeclaredSurfaceMandates(mandateMode && !pipelineMode ? HOLDER_DRAFT_DISCLOSURE : NO_DISCLOSURE);
  const {
    publish,
    publishKey,
    isActive: isDebugActive,
  } = useDebugContext("AgentGenerator");

  // Pre-launch form inputs (legitimately local — no instance exists yet).
  // These map 1:1 onto the shortcut's input surface:
  //   selection  → scope.selection  (routed to the agent's prompt variable
  //                by the shortcut's scope → variable mapping)
  //   userInput  → runtime.userInput (free-form "additional context")
  const [selection, setSelection] = useState("");
  const [userInput, setUserInput] = useState("");

  // Post-extraction user-editable field
  const [agentName, setAgentName] = useState("");

  // Transient UI states
  const [isSaving, setIsSaving] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Pipeline path: the person's example inputs (proof needs 3, R34) and the build it started.
  const [examples, setExamples] = useState<string[]>(emptyExamples);
  const [buildId, setBuildId] = useState<string | null>(null);
  const [buildOver, setBuildOver] = useState(false);
  const [startingBuild, setStartingBuild] = useState(false);

  // ── Generator-shortcut readiness ─────────────────────────────────────────
  // The generator is pinned to a specific shortcut. Warm it on mount so the
  // user never has to wait after clicking Generate, and surface any
  // load-failure as a real error state instead of letting the launch fail
  // at click time.
  const generatorShortcut = useAppSelector(
    (state) => state.agentShortcut.shortcuts[GENERATOR_SHORTCUT.id] ?? null,
  );
  const [shortcutLoadError, setShortcutLoadError] = useState<string | null>(
    null,
  );
  // In mandate mode the door is the Mandate's own resolution: `error` set
  // means the job has no Holder yet (or the caller may not run it), and the
  // banner below says so with the remedy — never a dead Generate button.
  // An organization's agent is drafted FOR that organization: the job resolves
  // and runs in the organization the owner names, never the active workspace
  // (access follows the object; the page already knows the org).
  const ownerOrganizationId =
    mandate?.owner.kind === "organization" ? mandate.owner.organizationId : null;
  const holderDraft = useMandate(mandateMode && !pipelineMode ? HOLDER_DRAFT_MANDATE_KEY : "", {
    organizationId: ownerOrganizationId,
  });
  // The pipeline path runs no generator shortcut and no drafting job — nothing to load.
  const shortcutReady = pipelineMode
    ? true
    : mandateMode
      ? holderDraft.mandate !== null
      : generatorShortcut !== null;
  // 🚨 `organizationPending` MEANS WAIT, NOT REPAIR (the F4 class `useMandate`
  // documents against). The hook sets `error` AND `organizationPending`
  // together on a cold navigation, so reading `error` alone told the person
  // the drafting job needed a Holder assigned — and handed them the
  // administrator's door — while the truth was that their workspace had not
  // finished hydrating. That state is the LOADING state here.
  const holderDraftWaiting = mandateMode && !pipelineMode && holderDraft.organizationPending;
  const generatorLoadError = pipelineMode
    ? null
    : mandateMode
    ? holderDraftWaiting
      ? null
      : holderDraft.error
    : shortcutLoadError;

  useEffect(() => {
    if (mandateMode || shortcutReady) return undefined;
    let cancelled = false;
    setShortcutLoadError(null);
    dispatch(ensureShortcutLoaded(GENERATOR_SHORTCUT.id))
      .unwrap()
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load generator";
        setShortcutLoadError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [mandateMode, shortcutReady, dispatch]);

  // ── Redux selectors (all keyed by conversationId or requestId) ──────────

  const streamingText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );

  const requestId = useAppSelector(
    conversationId ? selectLatestRequestId(conversationId) : () => undefined,
  );

  const streamPhase: StreamPhase = useAppSelector(
    conversationId
      ? selectStreamPhase(conversationId)
      : () => "idle" as StreamPhase,
  );

  const isStreaming = useAppSelector(
    conversationId ? selectIsStreaming(conversationId) : () => false,
  );

  const extractedSnapshot = useAppSelector(
    requestId ? selectFirstExtractedObject(requestId) : () => null,
  );

  const jsonExtractionComplete = useAppSelector(
    requestId ? selectJsonExtractionComplete(requestId) : () => false,
  );

  const jsonExtractionRevision = useAppSelector(
    requestId ? selectJsonExtractionRevision(requestId) : () => 0,
  );

  // This surface renders the live run from selectors rather than through
  // `MarkdownStream requestId=` (the raw stream only appears in the error
  // boundary), so it must retain the row itself or a reap mid-stream blanks
  // the builder. Doctrine: /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/LIVE-RUN-RETENTION.md.
  useRetainRequestForViewer(requestId, "AgentGenerator");

  // ── Derived state ─────────────────────────────────────────────────────────

  const isActive =
    streamPhase !== "idle" &&
    streamPhase !== "complete" &&
    streamPhase !== "error";
  const hasExtractedJson =
    extractedSnapshot !== null && extractedSnapshot.type === "object";
  const extractedValue = hasExtractedJson
    ? (extractedSnapshot.value as Record<string, unknown>)
    : null;
  const extractionFailed =
    jsonExtractionComplete && !hasExtractedJson && !!streamingText;
  const buildRunning = buildId !== null && !buildOver;
  const canGenerate =
    (mandateMode || selection.trim().length > 0) &&
    shortcutReady &&
    !generatorLoadError &&
    !(pipelineMode && (startingBuild || buildRunning));

  // ── Auto-populate agent name from extraction ─────────────────────────────

  useEffect(() => {
    if (!hasExtractedJson || !jsonExtractionComplete) return;
    const suggestedName = extractAgentName(extractedValue);
    if (suggestedName && !agentName) {
      setAgentName(suggestedName);
    }
  }, [hasExtractedJson, jsonExtractionComplete, extractedValue, agentName]);

  // ── Toast on completion ──────────────────────────────────────────────────

  useEffect(() => {
    if (!jsonExtractionComplete || !conversationId) return;
    if (hasExtractedJson) {
      toast.success("Agent generated successfully", {
        description: 'Review the result and click "Create Agent" to save it',
        position: TOAST_POSITION,
      });
    } else if (streamingText) {
      captureError({
        source: "agent-json-result",
        message: "Agent generator completed without usable structured JSON",
        requestId,
        conversationId,
        userMessage:
          "Could not extract JSON — The raw response is still available below.",
        raw: {
          ...(mandateMode
            ? { mandateKey: HOLDER_DRAFT_MANDATE_KEY }
            : { shortcutId: GENERATOR_SHORTCUT.id }),
          sourceFeature: "agent-generator",
          answerTextLength: streamingText.length,
          extractionRevision: jsonExtractionRevision,
          extractionComplete: jsonExtractionComplete,
        },
      });
      toast.error("Could not extract JSON", {
        description: "The raw response is still available below.",
        duration: 5000,
        position: TOAST_POSITION,
      });
    }
    // Only fire once when extraction completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonExtractionComplete]);

  // ── Debug context (admin only, gated by isDebugActive) ───────────────────

  useEffect(() => {
    if (!isDebugActive) return;
    publish({
      "Shortcut ID": GENERATOR_SHORTCUT.id,
      "Shortcut Label": GENERATOR_SHORTCUT.label,
      "Conversation ID": conversationId,
      "Request ID": requestId,
      "Stream Phase": streamPhase,
      "Is Streaming": isStreaming,
      "JSON Extraction Complete": jsonExtractionComplete,
      "JSON Extraction Revision": jsonExtractionRevision,
      "Has Extracted JSON": hasExtractedJson,
      "Extracted Value": extractedValue,
      "Agent Name": agentName,
      "Selection (first 100)": selection.slice(0, 100),
      "User Input (first 100)": userInput.slice(0, 100),
    });
  }, [
    isDebugActive,
    conversationId,
    requestId,
    streamPhase,
    isStreaming,
    jsonExtractionComplete,
    jsonExtractionRevision,
    hasExtractedJson,
    extractedValue,
    agentName,
    selection,
    userInput,
    publish,
  ]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!mandateMode && !selection.trim()) {
      toast.error("Please describe the purpose of your agent", {
        position: TOAST_POSITION,
      });
      return;
    }

    if (pipelineMode) {
      await startFactoryBuild();
      return;
    }

    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setAgentName("");
    // Clear any prior conversationId so the streaming UI resets immediately
    // — the onConversationCreated callback below sets the new one as soon
    // as the instance lands in Redux, before the stream starts.
    setConversationId(null);

    try {
      // The shortcut owns the agent, display mode, and the scope → variable
      // routing. All we supply is the live scope data.
      //
      // CRITICAL: use onConversationCreated to mount the streaming UI the
      // moment the instance exists. Awaiting trigger() alone means the UI
      // sits frozen for the full 30-60s stream — conversationId wouldn't
      // land until after `pollForCompletion` resolves.
      //
      // jsonExtraction still comes from the caller — it's in
      // GENERATOR_SHORTCUT.temporaryConfigs (will move onto the shortcut
      // row in a future migration).
      // The person's preferred model for building agents
      // (`agents.model_prefs.agent_authoring_default_model`, org → user →
      // device) rides as the run's explicit model; null = the builder's own.
      const authoringChoice = await resolvePreferredAuthoringModel();
      // The class chosen with the model rides beside it as `offering_id`.
      const authoringOverrides = authoringChoice
        ? {
            model: authoringChoice.modelId,
            ...(authoringChoice.offeringId
              ? { offering_id: authoringChoice.offeringId }
              : {}),
          }
        : null;
      if (mandate) {
        // THE MANDATE DOOR: the job's contract is the brief's offered values;
        // the person's guidance — and only that — is user_input.
        await launchMandate(HOLDER_DRAFT_MANDATE_KEY, {
          surfaceKey: `mandate:${HOLDER_DRAFT_MANDATE_KEY}`,
          runtime: {
            variables: mandate.variables,
            userInput: userInput.trim() || undefined,
            surfaceName: null,
          },
          jsonExtraction: HOLDER_DRAFT_JSON_EXTRACTION,
          sourceFeature: "agent-generator",
          ...(ownerOrganizationId ? { organizationId: ownerOrganizationId } : {}),
          // 🚨 PRESSING GENERATE IS THE RUN (2026-09-26). This panel renders
          // the result itself (`direct`) and has no second "send" control, so
          // the launch must run now. Without `autoRun: true` the thunk seeded
          // a conversation, found the job's binding silent on auto-run, and
          // returned waiting for a user action this screen never offers —
          // Generate did nothing, with no request and no error. (The old
          // shortcut path carried autoRun on its shortcut row.)
          config: {
            autoRun: true,
            displayMode: "direct",
            ...(authoringOverrides ? { llmOverrides: authoringOverrides } : {}),
          },
          onConversationCreated: (id) => setConversationId(id),
        });
        return;
      }
      await trigger(GENERATOR_SHORTCUT.id, {
        scope: { selection },
        runtime: { userInput: userInput || undefined },
        jsonExtraction: GENERATOR_SHORTCUT.temporaryConfigs?.jsonExtraction,
        sourceFeature: "agent-generator",
        ...(authoringOverrides ? { config: { llmOverrides: authoringOverrides } } : {}),
        onConversationCreated: (id) => setConversationId(id),
      });
    } catch (err) {
      console.error("Agent generation failed:", err);
      toast.error("Failed to generate agent", {
        description: extractErrorMessage(err, "Unknown error"),
        position: TOAST_POSITION,
      });
    }
  }, [
    mandateMode,
    mandate,
    selection,
    userInput,
    conversationId,
    trigger,
    launchMandate,
    dispatch,
    pipelineMode,
    startFactoryBuild,
  ]);

  // ── Pipeline path (AF-D doors #5 / #6): the server builds and proves the agent ──
  async function startFactoryBuild() {
    const purpose = [selection.trim(), userInput.trim()].filter(Boolean).join("\n\n");
    const words = (mandate ? mandate.mandateKey : selection)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, 6);
    // A name never ends on a joining word ("… For A").
    while (words.length > 1 && TRAILING_JOINERS.has(words[words.length - 1])) words.pop();
    const name = words.join("_") || "new_agent";
    const examplesGiven = examples.map((e) => e.trim()).filter(Boolean);
    const spec: Record<string, unknown> = mandate
      ? {
          name: `${name}_holder`,
          display_name: mandate.label,
          ...(userInput.trim() ? { purpose: userInput.trim() } : {}),
        }
      : {
          name,
          display_name: humanizeIdentifier(name) || name,
          purpose,
          ...(examplesGiven.length > 0 ? { sample_inputs: JSON.stringify(examplesGiven) } : {}),
        };
    setStartingBuild(true);
    try {
      // The organization the agent is born in: the owner's (an org rung), else the active
      // one — with none selected the person is asked to pick (never picked for them).
      const organizationId = ownerOrganizationId ?? (await ensureOrgId(null));
      const id = await startAgentBuild({
        spec,
        mandateKey: mandate?.mandateKey ?? null,
        door: mandate ? "mandate_holder_draft" : "generate",
        builtin: mandate?.owner.kind === "system",
        organizationId,
      });
      setBuildOver(false);
      setBuildId(id);
    } catch (err) {
      toast.error("The build did not start", {
        description: extractErrorMessage(err, "Unknown error"),
        position: TOAST_POSITION,
      });
    } finally {
      setStartingBuild(false);
    }
  }

  // A kept agent goes where today's door puts it: the mandate's holder controls (door #5).
  // Door #6: BuildProgress forwards to the builder with the Side Chat open (R58).
  const placeKeptAgent = (agentId: string) => {
    if (mandate) mandate.onCreated(agentId);
  };
  const onBuildFinished = (state: FactoryBuildState) => {
    setBuildOver(true);
    if (state.agent_id && state.outcome && KEPT_OUTCOMES.has(state.outcome)) placeKeptAgent(state.agent_id);
  };

  const handleCreateAgent = useCallback(async () => {
    if (!extractedValue) {
      toast.error("No generated agent to save", { position: TOAST_POSITION });
      return;
    }
    if (!agentName.trim()) {
      toast.error("Please enter a name for your agent", {
        position: TOAST_POSITION,
      });
      return;
    }

    const config = extractAgentConfig(extractedValue);
    if (!config) {
      toast.error("Could not parse agent configuration from generated JSON", {
        position: TOAST_POSITION,
      });
      return;
    }

    setIsSaving(true);
    try {
      if (mandate) {
        // Whose agent it is follows the rung (`owner`); the id goes BACK to the
        // caller, which sets it as the Holder and opens the editor.
        const result = await createAgentFromBuilder(
          { ...config, name: agentName.trim() },
          mandate.owner,
        );
        if (result.success && result.agentId) mandate.onCreated(result.agentId);
        return;
      }
      await createAgent({ ...config, name: agentName.trim() });
    } catch (err) {
      console.error("Failed to create agent:", err);
    } finally {
      setIsSaving(false);
    }
  }, [extractedValue, agentName, createAgent, mandate]);

  // THE DESTRUCTIVE/EXPENSIVE CLICK LAW: this throws away the entire agent the
  // AI just generated — system prompt, tools, config — and starts over. Name
  // the loss before doing it; never let the click silently destroy the work.
  const handleRegenerate = useCallback(async () => {
    const ok = await confirm({
      title: "Discard this generated agent?",
      description:
        "The generated agent, with its prompt, tools and settings, cannot be recovered.",
      confirmLabel: "Discard and start over",
      variant: "destructive",
    });
    if (!ok) return;
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setConversationId(null);
    setAgentName("");
  }, [conversationId, dispatch]);

  const handleCopyGenerated = useCallback(async () => {
    if (extractedValue) {
      if (!(await copyText(JSON.stringify(extractedValue, null, 2), "Copied generated JSON to clipboard"))) return;
    }
  }, [extractedValue]);

  const handleCopyRaw = useCallback(async () => {
    if (streamingText) {
      if (!(await copyText(streamingText, "Copied raw response to clipboard"))) return;
    }
  }, [streamingText]);

  const handleBoundaryError = useCallback(
    (error: Error) => {
      if (isDebugActive) {
        publishKey("Render Error", error.message);
      }
    },
    [isDebugActive, publishKey],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  const showResult =
    hasExtractedJson && jsonExtractionComplete && !isActive && !isStreaming;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-3 sm:gap-4 px-4 sm:px-6 overflow-y-auto lg:overflow-hidden min-h-0 py-3 sm:py-4">
        {/* Input Section */}
        <div className="flex flex-col min-h-0 space-y-3 sm:space-y-4 overflow-y-auto lg:overflow-visible">
          {/* Generator readiness banner — shortcut is being fetched, or a
              load failure means Generate is not wired. Separate from the
              streaming state so users know why the button is disabled. */}
          {/* 🚨 NO WORKSPACE CHOSEN IS A QUESTION, NOT A SPINNER (UX punch
              list, 2026-09-26). `useMandate` already retried once before it
              reports `organizationPending`, so by now nothing is loading —
              the person simply has no workspace selected. Spinning forever
              here was a screen that lied. One line, one button that opens
              the workspace picker; the choice re-resolves the job. */}
          {holderDraftWaiting ? (
            <div
              data-testid="generator-needs-workspace"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 type-secondary text-muted-foreground"
            >
              <span className="flex-1">Choose a workspace to generate.</span>
              <Button
                variant="outline"
                onClick={() => {
                  void ensureOrgId(null).catch((err: unknown) => {
                    toast.error(extractErrorMessage(err), {
                      position: TOAST_POSITION,
                    });
                  });
                }}
              >
                Choose workspace
              </Button>
            </div>
          ) : !shortcutReady && !generatorLoadError ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border type-secondary text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading generator configuration…
            </div>
          ) : null}
          {generatorLoadError && mandateMode ? (
            // NOTHING FAILS SILENTLY — and never a paragraph: one line, one
            // button that opens the job so it can be bound (Arman, 2026-09-24).
            <div
              data-testid="generator-unavailable"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 type-secondary text-destructive-ink"
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 font-medium">Mandate binding needed</span>
              <Button
                variant="danger"
                onClick={() =>
                  openMandateWindow({
                    initialMandateKey: HOLDER_DRAFT_MANDATE_KEY,
                  })
                }
              >
                Bind agent or workflow
              </Button>
            </div>
          ) : generatorLoadError ? (
            <div
              data-testid="generator-unavailable"
              className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 type-secondary text-destructive-ink"
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">Generator unavailable</div>
                <div className="type-meta opacity-80">
                  {generatorLoadError}
                </div>
              </div>
              <ErrorAlchemyMenu error={generatorLoadError} />
            </div>
          ) : null}

          <div className="space-y-3 sm:space-y-4">
            {mandate ? (
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium">
                  What this agent must do
                </Label>
                {mandate.summary}
              </div>
            ) : (
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                What should this agent do?
                <span className="type-secondary text-red-500">*</span>
              </Label>
              <VoiceTextarea
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder="Describe what you want your AI agent to do..."
                className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                disabled={
                  !shortcutReady ||
                  !!generatorLoadError ||
                  isActive ||
                  isStreaming ||
                  showResult ||
                  buildRunning
                }
                onTranscriptionComplete={() =>
                  toast.success("Voice input added", {
                    position: TOAST_POSITION,
                  })
                }
                onTranscriptionError={(error) =>
                  toast.error("Voice input failed", {
                    description: error,
                    position: TOAST_POSITION,
                  })
                }
              />
            </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-medium">
                {mandateMode ? "Your guidance" : "Additional Context"}
                <span className="type-secondary text-gray-500 ml-1">(Optional)</span>
              </Label>
              <VoiceTextarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={
                  mandateMode
                    ? "Tone, must-haves, what the last holder got wrong"
                    : "Requirements, tone, formats or constraints"
                }
                className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                disabled={
                  !shortcutReady ||
                  !!generatorLoadError ||
                  isActive ||
                  isStreaming ||
                  showResult ||
                  buildRunning
                }
                onTranscriptionComplete={() =>
                  toast.success("Voice input added", {
                    position: TOAST_POSITION,
                  })
                }
                onTranscriptionError={(error) =>
                  toast.error("Voice input failed", {
                    description: error,
                    position: TOAST_POSITION,
                  })
                }
              />
            </div>

            {pipelineMode && !mandateMode ? (
              <ExamplesField
                examples={examples}
                onChange={setExamples}
                disabled={startingBuild || buildRunning}
              />
            ) : null}

            {showResult && (
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                  Agent Name
                  <span className="type-secondary text-red-500">*</span>
                </Label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Enter a name for your new agent"
                  disabled={isSaving}
                />
              </div>
            )}
          </div>
        </div>

        {/* AI Response Section */}
        <div className="flex flex-col min-h-0 flex-1 lg:flex-initial">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <Label className="text-xs sm:text-sm font-medium">
              {pipelineMode ? "Build" : "Generated Agent"}
            </Label>
            {streamingText && !isActive && !isStreaming && (
              <div className="flex gap-1">
                {hasExtractedJson && (
                  <Button
                    icon={<Copy />}
                    variant="quiet"
                    onClick={handleCopyGenerated}
                    title="Copy extracted JSON"
                  >
                    <span className="hidden sm:inline">Copy JSON</span>
                  </Button>
                )}
                <Button
                  icon={<Copy />}
                  variant="quiet"
                  onClick={handleCopyRaw}
                  title="Copy raw response"
                >
                  <span className="hidden sm:inline">Copy Raw</span>
                </Button>
              </div>
            )}
          </div>
          {pipelineMode ? (
            <div className="flex-1 min-h-[300px] overflow-y-auto" data-testid="generator-build">
              {buildId ? (
                <BuildProgress
                  buildId={buildId}
                  onFinished={onBuildFinished}
                  onRebuilt={(id) => {
                    setBuildOver(false);
                    setBuildId(id);
                  }}
                  onKept={placeKeptAgent}
                  forwardWhenKept={!mandateMode}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border p-4 text-center">
                  <Hammer className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="type-body text-muted-foreground">Ready to build</p>
                </div>
              )}
            </div>
          ) : (
          <div className="flex-1 bg-textured border-2 border-purple-300 dark:border-purple-700 rounded-lg overflow-hidden min-h-[300px]">
            <GeneratorErrorBoundary
              fallbackContent={streamingText}
              isStreamActive={isActive || isStreaming}
              onError={handleBoundaryError}
            >
              {isActive || isStreaming ? (
                <div className="h-full flex flex-col">
                  <div className="flex-none flex items-center gap-2 p-2 border-b border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
                    <span className="type-secondary font-medium text-purple-700 dark:text-purple-300">
                      Generating your agent...
                    </span>
                    {isDebugActive && (
                      <span className="ml-auto type-meta font-mono text-gray-400 flex items-center gap-1">
                        <Bug className="h-3 w-3" />
                        {streamPhase} | rev:{jsonExtractionRevision}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    {streamingText ? (
                      <AgentStreamingResponse
                        content={streamingText}
                        isStreamActive={true}
                        extracted={extractedValue}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center type-secondary text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400 mb-2" />
                        Waiting for the stream to start…
                      </div>
                    )}
                  </div>
                </div>
              ) : streamingText ? (
                <div className="h-full flex flex-col overflow-hidden">
                  {extractionFailed && (
                    <div className="flex-none p-2 bg-amber-100 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="type-secondary text-amber-700 dark:text-amber-300">
                        <strong>JSON Extraction Failed:</strong> Could not
                        extract structured agent config from the response.
                        <ErrorAlchemyMenu />
                      </span>
                    </div>
                  )}
                  {showResult && (
                    <div className="flex-none p-2 bg-green-100 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      <span className="type-secondary text-green-700 dark:text-green-300">
                        Agent generated successfully!
                      </span>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-3">
                    <AgentStreamingResponse
                      content={streamingText}
                      isStreamActive={false}
                      extracted={extractedValue}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6">
                  <Hammer className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="type-body text-gray-500 dark:text-gray-400 mb-2">
                    Ready to generate
                  </p>
                  <p className="type-secondary text-gray-400 dark:text-gray-500 max-w-md">
                    {mandateMode
                      ? "Everything this job needs is already on the left. Click \u201cGenerate\u201d and the agent is drafted against it."
                      : "Describe what you want your agent to do and click \u201cGenerate\u201d to let AI create the configuration"}
                  </p>
                </div>
              )}
            </GeneratorErrorBoundary>
          </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-muted/30 pb-safe">
        <div className="type-secondary text-gray-500 dark:text-gray-400 hidden sm:block">
          {showResult && (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3 text-green-600" />
              Ready to create
            </span>
          )}
          {extractionFailed && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Check response manually
              <ErrorAlchemyMenu />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {showResult ? (
            <>
              <Button
                icon={<Hammer />}
                variant="outline"
                onClick={handleRegenerate}
                disabled={isSaving}
                className="flex-1 sm:flex-initial"
              >
                Regenerate
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateAgent}
                disabled={!agentName.trim() || isSaving}
                className="flex-1 sm:flex-initial"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Agent
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!canGenerate || isActive || isStreaming}
              className="flex-1 sm:flex-initial"
            >
              {pipelineMode ? (
                startingBuild ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    {buildId ? "Build again" : "Build agent"}
                  </>
                )
              ) : isActive || isStreaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : !shortcutReady && !generatorLoadError && !holderDraftWaiting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
