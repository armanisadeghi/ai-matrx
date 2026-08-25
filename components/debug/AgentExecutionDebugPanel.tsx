"use client";

import React, { useState } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Database,
  Cpu,
  MessageSquare,
  Settings,
  Activity,
  Layers,
  Zap,
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";

// Execution instance
import {
  selectInstance,
  selectInstanceStatus,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";

// Conversation history
import {
  selectConversationMessages,
  selectApiEndpointMode,
  selectMessageCount,
  selectHasMessages,
  extractFlatText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";

// User input
import {
  selectUserInputText,
  selectUserInputMessageParts,
  selectHasUserInput,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";

// Model overrides
import {
  selectCurrentSettings,
  selectSettingsOverridesForApi,
  selectHasOverrides,
  selectOverriddenKeys,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";

// Variables
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
  selectScopeVariableValues,
  selectResolvedVariables,
  selectMissingRequiredVariables,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";

// Resources
import {
  selectInstanceResources,
  selectReadyResources,
  selectPendingResources,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";

// Aggregate / cross-cutting
import {
  selectIsExecuting,
  selectIsStreaming,
  selectIsAwaitingTools,
  selectIsWaitingForFirstToken,
  selectLatestAccumulatedText,
  selectLatestConversationId,
  selectLatestRequestId,
  selectLatestRequestStatus,
  selectLatestError,
  selectHasAnyContent,
  selectIsInstanceReady,
  selectAssembledRequest,
  selectPendingToolCallsForInstance,
  selectShouldShowVariables,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";

// UI State
import {
  selectInstanceUIState,
  selectDisplayMode,
  selectAutoRun,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

interface AgentExecutionDebugPanelProps {
  instanceId: string;
  onClose: () => void;
}

type SectionId =
  | "overview"
  | "instance"
  | "conversation"
  | "streaming"
  | "user-input"
  | "variables"
  | "resources"
  | "model-settings"
  | "assembled-request"
  | "ui-state";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionBlock({
  id,
  currentSection,
  onToggle,
  title,
  icon: Icon,
  children,
}: {
  id: SectionId;
  currentSection: SectionId;
  onToggle: (id: SectionId) => void;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const isExpanded = currentSection === id;
  return (
    <div className="border-b border-border">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 bg-gray-50 dark:bg-zinc-900">{children}</div>
      )}
    </div>
  );
}

function CodeBlock({
  content,
  label,
  copiedSection,
  onCopy,
}: {
  content: string;
  label: string;
  copiedSection: string | null;
  onCopy: (content: string, label: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={() => onCopy(content, label)}
        >
          {copiedSection === label ? (
            <>
              <Check className="w-3 h-3 mr-1 text-green-500" />
              <span className="text-xs">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              <span className="text-xs">Copy</span>
            </>
          )}
        </Button>
      </div>
      <pre className="text-xs bg-white dark:bg-black p-3 rounded border border-border overflow-x-auto">
        <code className="whitespace-pre-wrap break-words font-mono">
          {content}
        </code>
      </pre>
    </div>
  );
}

function StatusBadge({
  value,
  trueLabel = "Yes",
  falseLabel = "No",
}: {
  value: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) {
  return (
    <span
      className={`text-xs font-medium px-1.5 py-0.5 rounded ${value ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors =
    role === "system"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
      : role === "assistant"
        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors}`}>
      {role}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const AgentExecutionDebugPanel: React.FC<
  AgentExecutionDebugPanelProps
> = ({ instanceId, onClose }) => {
  const [expandedSection, setExpandedSection] = useState<SectionId>("overview");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const handleToggle = (id: SectionId) => {
    setExpandedSection((prev) => (prev === id ? "overview" : id));
  };

  const copyToClipboard = async (content: string, section: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // ── All Redux state ──────────────────────────────────────────────────────

  const instance = useAppSelector(selectInstance(instanceId));
  const instanceStatus = useAppSelector(selectInstanceStatus(instanceId));

  const messages = useAppSelector(selectConversationMessages(instanceId));
  const apiEndpointMode = useAppSelector(selectApiEndpointMode(instanceId));
  const messageCount = useAppSelector(selectMessageCount(instanceId));
  const hasHistory = useAppSelector(selectHasMessages(instanceId));
  // TODO: wire to activeRequests/observability — completion stats are no
  // longer stored on the messages slice.

  const userInputText = useAppSelector(selectUserInputText(instanceId));
  const userInputContentBlocks = useAppSelector(
    selectUserInputMessageParts(instanceId),
  );
  const hasUserInput = useAppSelector(selectHasUserInput(instanceId));

  const currentSettings = useAppSelector(selectCurrentSettings(instanceId));
  const settingsOverridesForApi = useAppSelector(
    selectSettingsOverridesForApi(instanceId),
  );
  const hasOverrides = useAppSelector(selectHasOverrides(instanceId));
  const overriddenKeys = useAppSelector(selectOverriddenKeys(instanceId));

  const variableDefinitions = useAppSelector(
    selectInstanceVariableDefinitions(instanceId),
  );
  const userVariableValues = useAppSelector(
    selectUserVariableValues(instanceId),
  );
  const scopeVariableValues = useAppSelector(
    selectScopeVariableValues(instanceId),
  );
  const resolvedVariables = useAppSelector(selectResolvedVariables(instanceId));
  const missingRequiredVariables = useAppSelector(
    selectMissingRequiredVariables(instanceId),
  );
  const shouldShowVariables = useAppSelector(
    selectShouldShowVariables(instanceId),
  );

  const allResources = useAppSelector(selectInstanceResources(instanceId));
  const readyResources = useAppSelector(selectReadyResources(instanceId));
  const pendingResources = useAppSelector(selectPendingResources(instanceId));

  const isExecuting = useAppSelector(selectIsExecuting(instanceId));
  const isStreaming = useAppSelector(selectIsStreaming(instanceId));
  const isAwaitingTools = useAppSelector(selectIsAwaitingTools(instanceId));
  const isWaitingForFirstToken = useAppSelector(
    selectIsWaitingForFirstToken(instanceId),
  );
  const accumulatedText = useAppSelector(
    selectLatestAccumulatedText(instanceId),
  );
  const latestConversationId = useAppSelector(
    selectLatestConversationId(instanceId),
  );
  const latestRequestId = useAppSelector(selectLatestRequestId(instanceId));
  const latestRequestStatus = useAppSelector(
    selectLatestRequestStatus(instanceId),
  );
  const latestError = useAppSelector(selectLatestError(instanceId));
  const hasAnyContent = useAppSelector(selectHasAnyContent(instanceId));
  const instanceReadyCheck = useAppSelector(selectIsInstanceReady(instanceId));
  const pendingToolCalls = useAppSelector(
    selectPendingToolCallsForInstance(instanceId),
  );

  const assembledRequest = useAppSelector(selectAssembledRequest(instanceId));

  const uiState = useAppSelector(selectInstanceUIState(instanceId));
  const displayMode = useAppSelector(selectDisplayMode(instanceId));
  const autoRun = useAppSelector(selectAutoRun(instanceId));

  if (!instance) return null;

  const codeBlockProps = { copiedSection, onCopy: copyToClipboard };

  return (
    <div
      style={{
        position: "fixed",
        right: "20px",
        top: "80px",
        bottom: "20px",
        width: "640px",
        zIndex: 9998,
      }}
    >
      <Card className="h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-violet-600 to-violet-700 text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <div>
              <h3 className="font-bold">Agent Execution State</h3>
              <p className="text-xs opacity-90 font-mono">
                {instanceId.slice(0, 24)}…
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        <ScrollArea className="flex-1">
          {/* ── Overview (always visible) ───────────────────────────────────── */}
          <div className="p-4 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-200 dark:border-violet-800">
            <h4 className="text-sm font-semibold mb-3 text-violet-900 dark:text-violet-100">
              Live State Snapshot
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Agent ID:
                </span>
                {instance.agentId ? (
                  <EntityRef
                    token="agent"
                    id={instance.agentId}
                    name={instance.agentId}
                    showIcon={false}
                    openInNewTab
                    className="font-mono font-medium"
                  />
                ) : (
                  <p className="font-mono font-medium">—</p>
                )}
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Instance Status:
                </span>
                <p className="font-medium capitalize">
                  {instanceStatus ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Conversation Mode:
                </span>
                <p className="font-medium">{apiEndpointMode}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Executing / Streaming:
                </span>
                <p className="flex gap-1 flex-wrap">
                  <StatusBadge
                    value={isExecuting}
                    trueLabel="Executing"
                    falseLabel="Idle"
                  />
                  {isStreaming && <StatusBadge value trueLabel="Streaming" />}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Messages:
                </span>
                <p className="font-medium">{messageCount} committed</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Resources:
                </span>
                <p className="font-medium">
                  {allResources.length} total ({readyResources.length} ready,{" "}
                  {pendingResources.length} pending)
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Variables:
                </span>
                <p className="font-medium">
                  {variableDefinitions.length} defs
                  {missingRequiredVariables.length > 0
                    ? `, ${missingRequiredVariables.length} missing`
                    : ""}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  User Input:
                </span>
                <p className="font-medium">
                  {hasUserInput ? `${userInputText.length} chars` : "Empty"}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Model:</span>
                <p className="font-mono font-medium text-xs truncate">
                  {currentSettings?.model ?? "Default"}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Instance Ready:
                </span>
                <p className="font-medium">
                  <StatusBadge
                    value={instanceReadyCheck.ready}
                    trueLabel="Ready"
                    falseLabel="Not Ready"
                  />
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Awaiting Tools:
                </span>
                <p>
                  <StatusBadge
                    value={isAwaitingTools}
                    trueLabel="Yes"
                    falseLabel="No"
                  />
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Latest Request Status:
                </span>
                <p className="font-medium capitalize">
                  {latestRequestStatus ?? "—"}
                </p>
              </div>
            </div>
            {latestError && (
              <div className="mt-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded p-2 space-y-1">
                <p className="text-xs text-red-800 dark:text-red-200 font-medium">
                  Error [{latestError.error_type}
                  {latestError.code ? `:${latestError.code}` : ""}]:{" "}
                  {latestError.message}
                </p>
                {latestError.user_message && (
                  <p className="text-[11px] text-red-700 dark:text-red-300">
                    {latestError.user_message}
                  </p>
                )}
              </div>
            )}
            {!instanceReadyCheck.ready &&
              instanceReadyCheck.reasons.length > 0 && (
                <div className="mt-2 space-y-1">
                  {instanceReadyCheck.reasons.map((r, i) => (
                    <p
                      key={i}
                      className="flex items-start gap-1 text-xs text-orange-700 dark:text-orange-400"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{r}</span>
                    </p>
                  ))}
                </div>
              )}
          </div>

          {/* ── Instance Details ──────────────────────────────────────────────── */}
          <SectionBlock
            id="instance"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="Execution Instance"
            icon={Layers}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">instanceId:</span>
                  <p className="font-mono break-all">{instanceId}</p>
                </div>
                <div>
                  <span className="text-gray-500">agentId:</span>
                  {instance.agentId ? (
                    <EntityRef
                      token="agent"
                      id={instance.agentId}
                      name={instance.agentId}
                      showIcon={false}
                      openInNewTab
                      wrap
                      className="font-mono"
                    />
                  ) : (
                    <p className="font-mono">—</p>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">agentType:</span>
                  <p className="font-medium">{instance.agentType ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">origin:</span>
                  <p className="font-medium">{instance.origin ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">status:</span>
                  <p className="font-medium capitalize">{instance.status}</p>
                </div>
                <div>
                  <span className="text-gray-500">shortcutId:</span>
                  {instance.shortcutId ? (
                    <EntityRef
                      token="agent_shortcut"
                      id={instance.shortcutId}
                      name={instance.shortcutId}
                      showIcon={false}
                      openInNewTab
                      wrap
                      className="font-mono text-[10px]"
                    />
                  ) : (
                    <p className="font-mono text-[10px]">none</p>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">sourceApp:</span>
                  <p className="font-medium">{instance.sourceApp ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">sourceFeature:</span>
                  <p className="font-medium">{instance.sourceFeature ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">createdAt:</span>
                  <p className="font-medium">
                    {instance.createdAt
                      ? new Date(instance.createdAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
              <CodeBlock
                content={JSON.stringify(instance, null, 2)}
                label="Full Instance (JSON)"
                {...codeBlockProps}
              />
            </div>
          </SectionBlock>

          {/* ── Conversation History ──────────────────────────────────────────── */}
          <SectionBlock
            id="conversation"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="Conversation History"
            icon={MessageSquare}
          >
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>conversationId:</strong>{" "}
                  {latestConversationId ?? instanceId ?? "Not yet set"}
                  <br />
                  <strong>Mode:</strong> {apiEndpointMode} |{" "}
                  <strong>Messages:</strong> {messageCount} |{" "}
                  <strong>Has History:</strong> {String(hasHistory)}
                </p>
              </div>

              {/* TODO: wire aggregate/completion stats to activeRequests/observability */}

              {messages.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No committed messages yet
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((record, idx) => (
                    <div
                      key={record.id}
                      className="border border-border rounded p-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <RoleBadge role={record.role} />
                        {record.createdAt && (
                          <span className="text-xs text-gray-500">
                            {new Date(record.createdAt).toLocaleString()}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          #{idx + 1}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words bg-white dark:bg-black p-2 rounded max-h-40 overflow-y-auto">
                        {extractFlatText(record) ||
                          JSON.stringify(record.content, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              <CodeBlock
                content={JSON.stringify(messages, null, 2)}
                label="All Messages (JSON)"
                {...codeBlockProps}
              />
            </div>
          </SectionBlock>

          {/* ── Streaming / Active Request ────────────────────────────────────── */}
          <SectionBlock
            id="streaming"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="Active Request / Streaming"
            icon={Activity}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Request ID:</span>
                  <p className="font-mono text-[10px] break-all">
                    {latestRequestId ?? "None"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Request Status:</span>
                  <p className="font-medium capitalize">
                    {latestRequestStatus ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Is Executing:</span>
                  <p>
                    <StatusBadge value={isExecuting} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Is Streaming:</span>
                  <p>
                    <StatusBadge value={isStreaming} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Waiting First Token:</span>
                  <p>
                    <StatusBadge value={isWaitingForFirstToken} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Awaiting Tools:</span>
                  <p>
                    <StatusBadge value={isAwaitingTools} />
                  </p>
                </div>
              </div>

              {latestError && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded p-2 space-y-1">
                  <p className="text-xs text-red-800 dark:text-red-200">
                    <strong>
                      Error [{latestError.error_type}
                      {latestError.code ? `:${latestError.code}` : ""}]:
                    </strong>{" "}
                    {latestError.message}
                  </p>
                  {latestError.user_message && (
                    <p className="text-[11px] text-red-700 dark:text-red-300">
                      {latestError.user_message}
                    </p>
                  )}
                </div>
              )}

              {pendingToolCalls && pendingToolCalls.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2">
                    Pending Tool Calls ({pendingToolCalls.length})
                  </h5>
                  <CodeBlock
                    content={JSON.stringify(pendingToolCalls, null, 2)}
                    label="Pending Tool Calls (JSON)"
                    {...codeBlockProps}
                  />
                </div>
              )}

              {accumulatedText && (
                <div>
                  <h5 className="text-xs font-semibold mb-2">
                    Accumulated Response Text
                  </h5>
                  <pre className="text-xs whitespace-pre-wrap break-words bg-white dark:bg-black p-2 rounded border border-border max-h-48 overflow-y-auto">
                    {accumulatedText}
                  </pre>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {accumulatedText.length.toLocaleString()} chars
                  </p>
                </div>
              )}
            </div>
          </SectionBlock>

          {/* ── User Input ───────────────────────────────────────────────────── */}
          <SectionBlock
            id="user-input"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="User Input"
            icon={Eye}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <span className="text-gray-500">Has Input:</span>
                  <p>
                    <StatusBadge value={hasUserInput} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Has Any Content:</span>
                  <p>
                    <StatusBadge value={hasAnyContent} />
                  </p>
                </div>
              </div>

              <CodeBlock
                content={userInputText || "(empty)"}
                label="Input Text"
                {...codeBlockProps}
              />

              {userInputContentBlocks && userInputContentBlocks.length > 0 && (
                <CodeBlock
                  content={JSON.stringify(userInputContentBlocks, null, 2)}
                  label="Content Blocks (JSON)"
                  {...codeBlockProps}
                />
              )}
            </div>
          </SectionBlock>

          {/* ── Variables ────────────────────────────────────────────────────── */}
          <SectionBlock
            id="variables"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title={`Variables (${variableDefinitions.length})`}
            icon={Cpu}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <span className="text-gray-500">Should Show Variables:</span>
                  <p>
                    <StatusBadge value={shouldShowVariables} />
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Missing Required:</span>
                  <p className="font-medium text-red-600 dark:text-red-400">
                    {missingRequiredVariables.join(", ") || "None"}
                  </p>
                </div>
              </div>

              {variableDefinitions.length > 0 && (
                <div className="space-y-2">
                  {variableDefinitions.map((def) => (
                    <div
                      key={def.name}
                      className="border border-border rounded p-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{def.name}</span>
                        {def.required && (
                          <span className="text-red-500 text-[10px]">
                            required
                          </span>
                        )}
                      </div>
                      <div className="text-gray-500 mt-1">
                        User:{" "}
                        <span className="text-foreground">
                          {JSON.stringify(userVariableValues[def.name] ?? null)}
                        </span>
                        {" | "}Scope:{" "}
                        <span className="text-foreground">
                          {JSON.stringify(
                            scopeVariableValues[def.name] ?? null,
                          )}
                        </span>
                        {" | "}Resolved:{" "}
                        <span className="font-medium text-foreground">
                          {JSON.stringify(resolvedVariables[def.name] ?? null)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <CodeBlock
                content={JSON.stringify(resolvedVariables, null, 2)}
                label="Resolved Variables (JSON)"
                {...codeBlockProps}
              />
            </div>
          </SectionBlock>

          {/* ── Resources ────────────────────────────────────────────────────── */}
          <SectionBlock
            id="resources"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title={`Resources (${allResources.length})`}
            icon={Database}
          >
            <div className="space-y-3">
              {allResources.length === 0 ? (
                <p className="text-xs text-gray-500">No resources attached</p>
              ) : (
                <div className="space-y-2">
                  {allResources.map((resource) => (
                    <div
                      key={resource.resourceId}
                      className="border border-border rounded p-2 text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {resource.blockType}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            resource.status === "ready"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : resource.status === "error"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                          }`}
                        >
                          {resource.status}
                        </span>
                      </div>
                      <p className="text-gray-500 text-[10px] font-mono break-all">
                        {resource.resourceId}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {allResources.length > 0 && (
                <CodeBlock
                  content={JSON.stringify(allResources, null, 2)}
                  label="All Resources (JSON)"
                  {...codeBlockProps}
                />
              )}
            </div>
          </SectionBlock>

          {/* ── Model Settings ───────────────────────────────────────────────── */}
          <SectionBlock
            id="model-settings"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="Model Settings"
            icon={Settings}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs mb-1">
                <span className="text-gray-500">Has Overrides:</span>
                <StatusBadge value={hasOverrides} />
                {overriddenKeys && (
                  <span className="text-gray-400">
                    ({overriddenKeys.changed.length} changed,{" "}
                    {overriddenKeys.removed.length} removed)
                  </span>
                )}
              </div>

              {overriddenKeys &&
                (overriddenKeys.changed.length > 0 ||
                  overriddenKeys.removed.length > 0) && (
                  <div className="text-xs space-y-1">
                    {overriddenKeys.changed.length > 0 && (
                      <p>
                        <strong>Changed:</strong>{" "}
                        {overriddenKeys.changed.join(", ")}
                      </p>
                    )}
                    {overriddenKeys.removed.length > 0 && (
                      <p>
                        <strong>Removed:</strong>{" "}
                        {overriddenKeys.removed.join(", ")}
                      </p>
                    )}
                  </div>
                )}

              <CodeBlock
                content={
                  currentSettings
                    ? JSON.stringify(currentSettings, null, 2)
                    : "null"
                }
                label="Current Merged Settings"
                {...codeBlockProps}
              />

              {settingsOverridesForApi && (
                <CodeBlock
                  content={JSON.stringify(settingsOverridesForApi, null, 2)}
                  label="API Overrides (sent as config_overrides)"
                  {...codeBlockProps}
                />
              )}
            </div>
          </SectionBlock>

          {/* ── Assembled Request ────────────────────────────────────────────── */}
          <SectionBlock
            id="assembled-request"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="Assembled API Request"
            icon={Zap}
          >
            <div className="space-y-3">
              <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-400 dark:border-red-600 rounded p-3">
                <p className="flex items-center gap-1 text-xs text-red-900 dark:text-red-200 font-semibold">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  EXACT ASSEMBLED REQUEST — WHAT GETS SENT TO THE API
                </p>
                <p className="text-xs text-red-800 dark:text-red-200 mt-1">
                  Built by <code>assembleRequest()</code> — same logic as{" "}
                  <code>executeInstance.thunk.ts</code>. Reflects current Redux
                  state in real time.
                </p>
              </div>

              {!assembledRequest ? (
                <p className="text-xs text-gray-500">
                  No assembled request available (instance may not exist yet)
                </p>
              ) : (
                <CodeBlock
                  content={JSON.stringify(assembledRequest, null, 2)}
                  label="Assembled Request (JSON)"
                  {...codeBlockProps}
                />
              )}
            </div>
          </SectionBlock>

          {/* ── UI State ─────────────────────────────────────────────────────── */}
          <SectionBlock
            id="ui-state"
            currentSection={expandedSection}
            onToggle={handleToggle}
            title="UI State"
            icon={Eye}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">Display Mode:</span>
                  <p className="font-medium">{displayMode ?? "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Auto Run:</span>
                  <p>
                    <StatusBadge value={autoRun} />
                  </p>
                </div>
              </div>
              <CodeBlock
                content={uiState ? JSON.stringify(uiState, null, 2) : "null"}
                label="Full UI State (JSON)"
                {...codeBlockProps}
              />
            </div>
          </SectionBlock>
        </ScrollArea>
      </Card>
    </div>
  );
};
