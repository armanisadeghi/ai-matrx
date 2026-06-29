"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useShortcutTrigger } from "@/features/agents/hooks/useShortcutTrigger";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectLatestAccumulatedText,
  selectLatestRequestId,
  selectIsStreaming,
  selectStreamPhase,
  type StreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  selectFirstExtractedObject,
  selectJsonExtractionComplete,
  selectJsonExtractionRevision,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  extractAgentConfig,
  extractAgentName,
} from "../utils/agent-config-extractor";
import { useAgentBuilder } from "../services/agentBuilderService";
import { getSystemShortcut } from "@/features/agents/constants/system-shortcuts";
import { ensureShortcutLoaded } from "@/features/agents/redux/agent-shortcuts/thunks";
import { useDebugContext } from "@/hooks/useDebugContext";

const GENERATOR_SHORTCUT = getSystemShortcut("agent-generator-01");

// Toasts default to bottom-right (Sonner default), which collides with this
// component's action buttons. Pin every toast in this component to top-center.
const TOAST_POSITION = "top-center" as const;
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Hammer,
  Check,
  Loader2,
  Copy,
  AlertTriangle,
  Rocket,
  Bug
} from "lucide-react";
import { toast } from "sonner";
import MarkdownStream from "@/components/MarkdownStream";
import { AgentStreamingResponse } from "./AgentJsonDisplay";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";

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
            <span className="text-xs text-red-700 dark:text-red-300">
              <strong>Display Error:</strong>{" "}
              {this.state.error?.message ?? "Unknown rendering error"}. Showing
              raw response below.
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <MarkdownStream
              content={this.props.fallbackContent}
              isStreamActive={this.props.isStreamActive}
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

interface AgentGeneratorProps {
  onComplete?: () => void;
}

export function AgentGenerator({ onComplete }: AgentGeneratorProps) {
  const dispatch = useAppDispatch();
  const trigger = useShortcutTrigger();
  const { createAgent } = useAgentBuilder(onComplete);
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
  const shortcutReady = generatorShortcut !== null;

  useEffect(() => {
    if (shortcutReady) return undefined;
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
  }, [shortcutReady, dispatch]);

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
  const canGenerate =
    selection.trim().length > 0 && shortcutReady && !shortcutLoadError;

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
    if (!selection.trim()) {
      toast.error("Please describe the purpose of your agent", {
        position: TOAST_POSITION,
      });
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
      await trigger(GENERATOR_SHORTCUT.id, {
        scope: { selection },
        runtime: { userInput: userInput || undefined },
        jsonExtraction: GENERATOR_SHORTCUT.temporaryConfigs?.jsonExtraction,
        sourceFeature: "agent-generator",
        onConversationCreated: (id) => setConversationId(id),
      });
    } catch (err) {
      console.error("Agent generation failed:", err);
      toast.error("Failed to generate agent", {
        description: err instanceof Error ? err.message : "Unknown error",
        position: TOAST_POSITION,
      });
    }
  }, [selection, userInput, conversationId, trigger, dispatch]);

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
      await createAgent({ ...config, name: agentName.trim() });
    } catch (err) {
      console.error("Failed to create agent:", err);
    } finally {
      setIsSaving(false);
    }
  }, [extractedValue, agentName, createAgent]);

  const handleRegenerate = useCallback(() => {
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setConversationId(null);
    setAgentName("");
  }, [conversationId, dispatch]);

  const handleCopyGenerated = useCallback(() => {
    if (extractedValue) {
      navigator.clipboard.writeText(JSON.stringify(extractedValue, null, 2));
      toast.success("Copied generated JSON to clipboard", {
        position: TOAST_POSITION,
      });
    }
  }, [extractedValue]);

  const handleCopyRaw = useCallback(() => {
    if (streamingText) {
      navigator.clipboard.writeText(streamingText);
      toast.success("Copied raw response to clipboard", {
        position: TOAST_POSITION,
      });
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
          {!shortcutReady && !shortcutLoadError && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading generator configuration…
            </div>
          )}
          {shortcutLoadError && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">Generator unavailable</div>
                <div className="text-[11px] opacity-80">
                  {shortcutLoadError}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                What should this agent do?
                <span className="text-xs text-red-500">*</span>
              </Label>
              <VoiceTextarea
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder="Describe what you want your AI agent to do..."
                className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                disabled={
                  !shortcutReady ||
                  !!shortcutLoadError ||
                  isActive ||
                  isStreaming ||
                  showResult
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Be specific about the main purpose and goals
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-medium">
                Additional Context
                <span className="text-xs text-gray-500 ml-1">(Optional)</span>
              </Label>
              <VoiceTextarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Add any specific requirements, tone, formats, or constraints..."
                className="min-h-[120px] sm:min-h-[180px] text-sm border border-border rounded-xl"
                disabled={
                  !shortcutReady ||
                  !!shortcutLoadError ||
                  isActive ||
                  isStreaming ||
                  showResult
                }
                onTranscriptionComplete={() =>
                  toast.success("Voice context added", {
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Any additional context, requirements, or constraints
              </p>
            </div>

            {showResult && (
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                  Agent Name
                  <span className="text-xs text-red-500">*</span>
                </Label>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Enter a name for your new agent"
                  className="text-base"
                  style={{ fontSize: "16px" }}
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
              Generated Agent
            </Label>
            {streamingText && !isActive && !isStreaming && (
              <div className="flex gap-1">
                {hasExtractedJson && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyGenerated}
                    className="h-7 px-2 text-xs"
                    title="Copy extracted JSON"
                  >
                    <Copy className="h-3 w-3 sm:mr-1" />
                    <span className="hidden sm:inline">Copy JSON</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRaw}
                  className="h-7 px-2 text-xs"
                  title="Copy raw response"
                >
                  <Copy className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Copy Raw</span>
                </Button>
              </div>
            )}
          </div>
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
                    <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                      Generating your agent...
                    </span>
                    {isDebugActive && (
                      <span className="ml-auto text-[10px] font-mono text-gray-400 flex items-center gap-1">
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
                      <div className="flex flex-col items-center justify-center h-full text-center text-xs text-muted-foreground">
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
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        <strong>JSON Extraction Failed:</strong> Could not
                        extract structured agent config from the response.
                      </span>
                    </div>
                  )}
                  {showResult && (
                    <div className="flex-none p-2 bg-green-100 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-700 dark:text-green-300">
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Ready to generate
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md">
                    Describe what you want your agent to do and click
                    &ldquo;Generate&rdquo; to let AI create the configuration
                  </p>
                </div>
              )}
            </GeneratorErrorBoundary>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-0 px-4 sm:px-6 py-3 sm:py-4 border-t bg-muted/30 pb-safe">
        <div className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
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
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {showResult ? (
            <>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={isSaving}
                className="flex-1 sm:flex-initial"
              >
                <Hammer className="h-4 w-4 mr-2" />
                Regenerate
              </Button>
              <Button
                onClick={handleCreateAgent}
                disabled={!agentName.trim() || isSaving}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
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
              onClick={handleGenerate}
              disabled={!canGenerate || isActive || isStreaming}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
            >
              {isActive || isStreaming ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : !shortcutReady && !shortcutLoadError ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
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
