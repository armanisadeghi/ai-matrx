"use client";

/**
 * AgentExecutionTestModal
 *
 * Test harness for non-UI display modes (direct, inline, background).
 * These modes don't have their own rendering surface yet, so this modal
 * provides a controlled environment to execute and observe the results.
 *
 * Three modes:
 *   - Direct: Executes and streams response in real-time via Redux selectors
 *   - Inline: Simulates text editor selection, executes, shows replace/insert actions
 *   - Background: Executes silently, tracks task completion in a list
 *
 * All modes use the agent execution system (useAgentLauncher) —
 * proving programmatic execution works identically to UI-driven execution.
 */

import { useState, useEffect, useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { useWidgetHandle } from "@/features/agents/hooks/useWidgetHandle";
import {
  selectLatestAccumulatedText,
  selectLatestRequestStatus,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  Replace,
  ArrowUpFromLine,
  ArrowDownFromLine,
  X,
} from "lucide-react";
import type { VariablesPanelStyle } from "@/features/agents/types/instance.types";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";

interface AgentExecutionTestModalProps {
  surfaceKey: string;
  isOpen: boolean;
  onClose: () => void;
  testType: "direct" | "inline" | "background";
  agentId: string;
  sourceInstanceId: string;
  autoRun: boolean;
  allowChat: boolean;
  showVariables: boolean;
  applyVariables: boolean;
  apiEndpointMode: ApiEndpointMode;
  variablesPanelStyle?: VariablesPanelStyle;
  variables: Record<string, unknown>;
  userInput: string;
}

// =============================================================================
// Direct Test Mode
// =============================================================================

function DirectTestMode({
  agentId,
  surfaceKey,
  variables,
  userInput,
  apiEndpointMode,
}: {
  agentId: string;
  surfaceKey: string;
  variables: Record<string, unknown>;
  userInput: string;
  apiEndpointMode: ApiEndpointMode;
}) {
  const { launchAgent, close } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const responseText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );
  const status = useAppSelector(
    conversationId
      ? selectLatestRequestStatus(conversationId)
      : () => undefined,
  );

  const handleExecute = useCallback(async () => {
    if (conversationId) close(conversationId);
    try {
      const result = await launchAgent(agentId, {
        surfaceKey,
        sourceFeature: "agent-builder",
        apiEndpointMode,
        config: {
          displayMode: "direct",
          autoRun: true,
          defaultVariables: variables,
        },
        runtime: {
          userInput: userInput || "Hello, please respond briefly.",
        },
      });
      setConversationId(result.conversationId);
    } catch (err) {
      console.error("Direct execution failed:", err);
    }
  }, [
    agentId,
    variables,
    userInput,
    apiEndpointMode,
    launchAgent,
    close,
    conversationId,
  ]);

  const handleCopy = useCallback(() => {
    if (responseText) {
      navigator.clipboard.writeText(responseText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [responseText]);

  useEffect(() => {
    return () => {
      if (conversationId) close(conversationId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStreaming =
    status === "streaming" || status === "pending" || status === "connecting";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleExecute} disabled={isStreaming}>
          {isStreaming ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1.5" />
          )}
          {isStreaming ? "Streaming..." : "Execute"}
        </Button>
        {status && (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        )}
      </div>

      <ScrollArea className="h-64 rounded-md border border-border bg-muted/20 p-3">
        {responseText ? (
          <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
            {responseText}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isStreaming
              ? "Waiting for response..."
              : "Press Execute to run the agent in direct mode."}
          </p>
        )}
      </ScrollArea>

      {responseText && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-1.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Inline Test Mode
// =============================================================================

function InlineTestMode({
  agentId,
  surfaceKey,
  variables,
  userInput,
  apiEndpointMode,
}: {
  agentId: string;
  surfaceKey: string;
  variables: Record<string, unknown>;
  userInput: string;
  apiEndpointMode: ApiEndpointMode;
}) {
  const { launchAgent, close } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState(
    "The quick brown fox jumps over the lazy dog.\n\nThis is sample text that simulates a document editor.\nSelect a portion of text and run the inline test to see how the agent processes it.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.",
  );
  const [selectionRange] = useState({ start: 4, end: 19 });
  const selectedText = editorText.substring(
    selectionRange.start,
    selectionRange.end,
  );

  const responseText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );
  const status = useAppSelector(
    conversationId
      ? selectLatestRequestStatus(conversationId)
      : () => undefined,
  );

  const isStreaming =
    status === "streaming" || status === "pending" || status === "connecting";
  const isComplete = status === "complete";

  const handleExecute = useCallback(async () => {
    if (conversationId) close(conversationId);
    try {
      const result = await launchAgent(agentId, {
        surfaceKey,
        sourceFeature: "agent-builder",
        apiEndpointMode,
        config: {
          displayMode: "inline",
          autoRun: true,
          defaultVariables: { ...variables, selection: selectedText },
        },
        runtime: {
          userInput: userInput || `Process this text: "${selectedText}"`,
        },
      });
      setConversationId(result.conversationId);
    } catch (err) {
      console.error("Inline execution failed:", err);
    }
  }, [
    agentId,
    variables,
    userInput,
    selectedText,
    apiEndpointMode,
    launchAgent,
    close,
    conversationId,
  ]);

  const handleReplace = useCallback(() => {
    if (!responseText) return;
    const before = editorText.substring(0, selectionRange.start);
    const after = editorText.substring(selectionRange.end);
    setEditorText(before + responseText.trim() + after);
    if (conversationId) close(conversationId);
    setConversationId(null);
  }, [responseText, editorText, selectionRange, conversationId, close]);

  const handleInsertBefore = useCallback(() => {
    if (!responseText) return;
    const before = editorText.substring(0, selectionRange.start);
    const after = editorText.substring(selectionRange.start);
    setEditorText(before + responseText.trim() + "\n" + after);
    if (conversationId) close(conversationId);
    setConversationId(null);
  }, [responseText, editorText, selectionRange, conversationId, close]);

  const handleInsertAfter = useCallback(() => {
    if (!responseText) return;
    const before = editorText.substring(0, selectionRange.end);
    const after = editorText.substring(selectionRange.end);
    setEditorText(before + "\n" + responseText.trim() + after);
    if (conversationId) close(conversationId);
    setConversationId(null);
  }, [responseText, editorText, selectionRange, conversationId, close]);

  const handleCancel = useCallback(() => {
    if (conversationId) close(conversationId);
    setConversationId(null);
  }, [conversationId, close]);

  useEffect(() => {
    return () => {
      if (conversationId) close(conversationId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Simulated editor with selection: &ldquo;{selectedText}&rdquo;
      </div>

      <Textarea
        value={editorText}
        onChange={(e) => setEditorText(e.target.value)}
        rows={6}
        className="text-xs font-mono"
        style={{ fontSize: "16px" }}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleExecute} disabled={isStreaming}>
          {isStreaming ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
          )}
          {isStreaming ? "Processing..." : "Run Inline"}
        </Button>
        {status && (
          <Badge variant="outline" className="text-[10px]">
            {status}
          </Badge>
        )}
      </div>

      {/* Inline overlay actions */}
      {isComplete && responseText && (
        <>
          <Separator />
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground mb-2">
              Agent response:
            </p>
            <pre className="text-xs whitespace-pre-wrap font-mono text-foreground mb-3">
              {responseText}
            </pre>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" onClick={handleReplace}>
                <Replace className="w-3.5 h-3.5 mr-1.5" />
                Replace
              </Button>
              <Button variant="outline" size="sm" onClick={handleInsertBefore}>
                <ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" />
                Insert Before
              </Button>
              <Button variant="outline" size="sm" onClick={handleInsertAfter}>
                <ArrowDownFromLine className="w-3.5 h-3.5 mr-1.5" />
                Insert After
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Background Test Mode
// =============================================================================

interface BackgroundTask {
  conversationId: string;
  startedAt: string;
  status: "running" | "complete" | "error";
  preview?: string;
}

function BackgroundTestMode({
  agentId,
  surfaceKey,
  variables,
  userInput,
  apiEndpointMode,
}: {
  agentId: string;
  surfaceKey: string;
  variables: Record<string, unknown>;
  userInput: string;
  apiEndpointMode: ApiEndpointMode;
}) {
  const { launchAgent, close } = useAgentLauncher();
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  const widgetHandleId = useWidgetHandle({
    onComplete: (launchResult) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.conversationId === launchResult.conversationId
            ? {
                ...t,
                status: "complete" as const,
                preview: launchResult.responseText?.substring(0, 200),
              }
            : t,
        ),
      );
    },
  });

  const handleExecute = useCallback(async () => {
    try {
      const result = await launchAgent(agentId, {
        surfaceKey,
        sourceFeature: "agent-builder",
        apiEndpointMode,
        config: {
          displayMode: "background",
          autoRun: true,
          defaultVariables: variables,
        },
        runtime: {
          userInput: userInput || "Respond briefly with one sentence.",
          widgetHandleId,
        },
      });

      setTasks((prev) => [
        {
          conversationId: result.conversationId,
          startedAt: new Date().toLocaleTimeString(),
          status: "running",
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Background execution failed:", err);
    }
  }, [
    agentId,
    variables,
    userInput,
    apiEndpointMode,
    launchAgent,
    surfaceKey,
    widgetHandleId,
  ]);

  useEffect(() => {
    return () => {
      tasks.forEach((t) => {
        if (t.status === "running") close(t.conversationId);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleExecute}>
          <Play className="w-3.5 h-3.5 mr-1.5" />
          Run Background Task
        </Button>
        <span className="text-xs text-muted-foreground">
          {tasks.length} task(s)
        </span>
      </div>

      {tasks.length > 0 && (
        <ScrollArea className="h-48 rounded-md border border-border">
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <div
                key={task.conversationId}
                className="group flex items-start gap-2 px-3 py-2"
              >
                <Badge
                  variant={task.status === "complete" ? "default" : "secondary"}
                  className="text-[10px] shrink-0 mt-0.5"
                >
                  {task.status === "running" && (
                    <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                  )}
                  {task.status === "complete" && (
                    <Check className="w-2.5 h-2.5 mr-1" />
                  )}
                  {task.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground font-mono">
                    <span className="shrink-0">
                      {task.startedAt} — {task.conversationId.substring(0, 8)}
                    </span>
                    {/* THE DOOR LAW: each background task IS a conversation, and
                        its id was truncated into unreachable text — the run you
                        just launched was the one thing you could not open.

                        Sibling controls, not a link on the id: `tasks` is local
                        `useState`, so a same-tab navigation unmounts the modal
                        and the whole record of what was launched goes with it.
                        The row carries `group` so these actually appear. */}
                    <EntityDoorControls
                      token="conversation"
                      id={task.conversationId}
                      name={task.conversationId.substring(0, 8)}
                      className="shrink-0"
                    />
                  </div>
                  {task.preview && (
                    <p className="text-xs text-foreground mt-0.5 line-clamp-2">
                      {task.preview}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// =============================================================================
// Main Modal
// =============================================================================

/**
 * The agent this modal is testing, as a door. Split out so the name selector
 * runs in its own component rather than re-rendering the whole modal shell.
 */
function AgentUnderTest({ agentId }: { agentId: string }) {
  const agentName = useAppSelector((state) => selectAgentName(state, agentId));
  return (
    <>
      <span className="min-w-0 truncate font-medium">
        {agentName || `${agentId.slice(0, 8)}…`}
      </span>
      {/* Sibling controls for the same reason as the task rows: the launched-run
          list is local state, so a same-tab jump to the agent would erase it.
          `alwaysShowActions` because a dialog header offers nothing to hover. */}
      <EntityDoorControls
        token="agent"
        id={agentId}
        name={agentName}
        alwaysShowActions
        className="shrink-0"
      />
    </>
  );
}

const MODE_TITLES: Record<string, string> = {
  direct: "Direct Stream Test",
  inline: "Inline Overlay Test",
  background: "Background Execution Test",
};

export function AgentExecutionTestModal({
  surfaceKey,
  isOpen,
  onClose,
  testType,
  agentId,
  variables,
  userInput,
  apiEndpointMode,
}: AgentExecutionTestModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          {/* The modal exists to run ONE agent and never said which. The id was
              in props the whole time — naming the record and refusing to link it
              is the corollary; not naming it at all is worse. */}
          <DialogTitle className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="shrink-0">
              {MODE_TITLES[testType] ?? "Test Execution"}
            </span>
            <span className="shrink-0 text-muted-foreground">—</span>
            <AgentUnderTest agentId={agentId} />
          </DialogTitle>
        </DialogHeader>

        {testType === "direct" && (
          <DirectTestMode
            agentId={agentId}
            surfaceKey={surfaceKey}
            variables={variables}
            userInput={userInput}
            apiEndpointMode={apiEndpointMode}
          />
        )}
        {testType === "inline" && (
          <InlineTestMode
            agentId={agentId}
            surfaceKey={surfaceKey}
            variables={variables}
            userInput={userInput}
            apiEndpointMode={apiEndpointMode}
          />
        )}
        {testType === "background" && (
          <BackgroundTestMode
            agentId={agentId}
            surfaceKey={surfaceKey}
            variables={variables}
            userInput={userInput}
            apiEndpointMode={apiEndpointMode}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
