"use client";

import React, { useMemo, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Eye,
  Database,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectInstance,
  selectIsCacheOnly,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { selectInstanceResources } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.selectors";
import { selectResolvedVariables } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  selectConversationMessages,
  selectHasMessages,
  extractFlatText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectInstanceUIState,
  selectShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectAgentMessages } from "@/features/agents/redux/agent-definition/selectors";
import { makeSelectAssembledRequest } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import type { AssembledAgentStartRequest } from "@/features/agents/types/request.types";

interface PromptExecutionDebugPanelProps {
  /** Agent execution conversation id (legacy admin debug still stores this as `runId`). */
  conversationId: string;
  onClose: () => void;
}

type Section =
  | "overview"
  | "template"
  | "conversation"
  | "user-message"
  | "state"
  | "api-payload";

function formatDefinitionMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function formatUserInputPreview(
  userInput: AssembledAgentStartRequest["user_input"],
): string {
  if (userInput === undefined) return "(empty)";
  if (typeof userInput === "string") return userInput;
  try {
    return JSON.stringify(userInput, null, 2);
  } catch {
    return String(userInput);
  }
}

export const PromptExecutionDebugPanel: React.FC<
  PromptExecutionDebugPanelProps
> = ({ conversationId, onClose }) => {
  const [expandedSection, setExpandedSection] = useState<Section>("overview");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const instance = useAppSelector((state) =>
    selectInstance(conversationId)(state),
  );
  const currentInput = useAppSelector((state) =>
    selectUserInputText(conversationId)(state),
  );
  const resources = useAppSelector(selectInstanceResources(conversationId));
  const variables = useAppSelector(selectResolvedVariables(conversationId));
  const conversationMessages = useAppSelector(
    selectConversationMessages(conversationId),
  );
  const uiState = useAppSelector((state) =>
    selectInstanceUIState(conversationId)(state),
  );
  const showVariables = useAppSelector((state) =>
    selectShowVariablePanel(conversationId)(state),
  );
  const hasCommittedMessages = useAppSelector((state) =>
    selectHasMessages(conversationId)(state),
  );
  const cacheOnly = useAppSelector((state) =>
    selectIsCacheOnly(conversationId)(state),
  );
  const definitionMessages =
    useAppSelector((state) =>
      instance?.agentId
        ? selectAgentMessages(state, instance.agentId)
        : undefined,
    ) ?? [];

  const assembledRequestSelector = useMemo(
    () => makeSelectAssembledRequest(conversationId),
    [conversationId],
  );
  const assembledRequest = useAppSelector(assembledRequestSelector);

  if (!instance) {
    return null;
  }

  const isFirstTurn = !hasCommittedMessages;
  const currentMode = isFirstTurn
    ? "Turn 1: variables + definition context"
    : "Turn 2+: ongoing conversation";

  const modelId =
    (assembledRequest?.config_overrides?.model as string | undefined) ??
    instance.agentId ??
    "N/A";

  const copyToClipboard = async (content: string, section: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const SectionPanel = ({
    id,
    title,
    icon: Icon,
    children,
  }: {
    id: Section;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
  }) => {
    const isExpanded = expandedSection === id;

    return (
      <div className="border-b border-border">
        <button
          onClick={() => setExpandedSection(isExpanded ? "overview" : id)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
  };

  const CodeBlock = ({
    content,
    label,
  }: {
    content: string;
    label: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {label}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={() => copyToClipboard(content, label)}
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
      <pre className="text-xs bg-white dark:bg-black p-3 rounded border-border overflow-x-auto">
        <code className="whitespace-pre-wrap break-words font-mono">
          {content}
        </code>
      </pre>
    </div>
  );

  return (
    <div className="fixed right-5 top-20 bottom-5 w-[600px] z-[9998]">
      <Card className="h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <div>
              <h3 className="font-bold">Agent Execution State</h3>
              <p className="text-xs opacity-90">{currentMode}</p>
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
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">
              Current State
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Turn:</span>
                <p className="font-medium">
                  {isFirstTurn ? "First (no history yet)" : "Follow-up"}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Status:
                </span>
                <p className="font-medium capitalize">{instance.status}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Conversation:
                </span>
                <p className="font-medium break-all">{conversationId}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Messages:
                </span>
                <p className="font-medium">
                  {conversationMessages.length} stored
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Resources:
                </span>
                <p className="font-medium">{resources.length} attached</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Variables:
                </span>
                <p className="font-medium">
                  {Object.keys(variables).length} resolved
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Show Variables UI:
                </span>
                <p className="font-medium">{showVariables ? "Yes" : "No"}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Current Input:
                </span>
                <p className="font-medium">
                  {currentInput ? `${currentInput.length} chars` : "Empty"}
                </p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Model override:
                </span>
                <p className="font-medium text-xs">{modelId}</p>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  Persisted conversation:
                </span>
                <p className="font-medium">
                  {cacheOnly ? "No (cache only)" : "Yes"}
                </p>
              </div>
            </div>
          </div>

          <SectionPanel
            id="template"
            title="Agent Definition Messages"
            icon={Eye}
          >
            <div className="space-y-4">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Saved agent definition messages from the builder. On turn 1 the
                server resolves these with variables and scope context.
              </p>

              {definitionMessages.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No definition messages loaded
                </p>
              ) : (
                <div className="space-y-3">
                  {definitionMessages.map((msg, idx) => (
                    <div key={idx} className="border-border rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            msg.role === "system"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : msg.role === "assistant"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          }`}
                        >
                          {msg.role}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words bg-white dark:bg-black p-2 rounded">
                        {formatDefinitionMessageContent(msg.content)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              <CodeBlock
                content={JSON.stringify(definitionMessages, null, 2)}
                label="Definition Messages (JSON)"
              />
            </div>
          </SectionPanel>

          <SectionPanel
            id="conversation"
            title="Stored Messages (messages slice)"
            icon={Database}
          >
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>What this is:</strong> DB-faithful transcript rows in
                  the agent execution `messages` slice for this conversation.
                </p>
              </div>

              {conversationMessages.length === 0 ? (
                <p className="text-xs text-gray-500">No messages stored yet</p>
              ) : (
                <div className="space-y-3">
                  {conversationMessages.map((msg) => (
                    <div key={msg.id} className="border-border rounded p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            msg.role === "system"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                              : msg.role === "assistant"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          }`}
                        >
                          {msg.role}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {msg.status}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-words bg-white dark:bg-black p-2 rounded max-h-48 overflow-y-auto">
                        {extractFlatText(msg) ||
                          formatDefinitionMessageContent(msg.content)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              <CodeBlock
                content={JSON.stringify(conversationMessages, null, 2)}
                label="Stored Messages (JSON)"
              />
            </div>
          </SectionPanel>

          <SectionPanel
            id="user-message"
            title="Current Input Preview"
            icon={Eye}
          >
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  Live composer state. For the exact wire payload, open the API
                  Payload section below (`assembleRequest`).
                </p>
              </div>

              <div>
                <h5 className="text-xs font-semibold mb-2">Current Input</h5>
                <CodeBlock
                  content={currentInput || "(empty)"}
                  label="Current Input Text"
                />
              </div>

              <div>
                <h5 className="text-xs font-semibold mb-2">
                  Resources ({resources.length})
                </h5>
                {resources.length === 0 ? (
                  <p className="text-xs text-gray-500">No resources attached</p>
                ) : (
                  <div className="space-y-2">
                    {resources.map((resource) => (
                      <div
                        key={resource.resourceId}
                        className="text-xs border-border rounded p-2"
                      >
                        <div className="font-medium">{resource.blockType}</div>
                        <div className="text-gray-500 text-[10px] mt-1">
                          {JSON.stringify(resource.source).substring(0, 100)}...
                        </div>
                      </div>
                    ))}
                    <CodeBlock
                      content={JSON.stringify(resources, null, 2)}
                      label="Resources (Full JSON)"
                    />
                  </div>
                )}
              </div>
            </div>
          </SectionPanel>

          <SectionPanel
            id="state"
            title="Current State Details"
            icon={Database}
          >
            <div className="space-y-4">
              <div>
                <h5 className="text-xs font-semibold mb-2">Current Input</h5>
                <CodeBlock
                  content={currentInput || "(empty)"}
                  label="Current Input Text"
                />
              </div>

              <div>
                <h5 className="text-xs font-semibold mb-2">
                  Variables ({Object.keys(variables).length})
                </h5>
                {Object.keys(variables).length === 0 ? (
                  <p className="text-xs text-gray-500">No variables defined</p>
                ) : (
                  <CodeBlock
                    content={JSON.stringify(variables, null, 2)}
                    label="Resolved Variables"
                  />
                )}
              </div>

              <div>
                <h5 className="text-xs font-semibold mb-2">UI State</h5>
                <CodeBlock
                  content={JSON.stringify(uiState ?? {}, null, 2)}
                  label="UI State"
                />
              </div>
            </div>
          </SectionPanel>

          <SectionPanel
            id="api-payload"
            title="EXACT API Payload (assembleRequest)"
            icon={Eye}
          >
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-400 dark:border-red-600 rounded p-3">
                <p className="text-xs text-red-900 dark:text-red-200 font-semibold">
                  THIS IS THE ACTUAL REQUEST BODY
                </p>
                <p className="text-xs text-red-800 dark:text-red-200 mt-2">
                  Built with the same `assembleRequest` function used by
                  `execute-instance.thunk.ts`. Turn-1-only fields such as
                  `conversation_id`, `is_new`, and `cache_bypass` are stamped
                  inside the thunk at send time.
                </p>
              </div>

              {!assembledRequest ? (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700 rounded p-3">
                  <p className="text-xs text-red-800 dark:text-red-200">
                    Nothing to assemble yet — instance missing required state or
                    pre-execution gate is blocking the payload.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <h5 className="text-xs font-semibold mb-2">
                      User input wire field
                    </h5>
                    <CodeBlock
                      content={formatUserInputPreview(
                        assembledRequest.user_input,
                      )}
                      label="user_input"
                    />
                  </div>

                  <CodeBlock
                    content={JSON.stringify(assembledRequest, null, 2)}
                    label="Complete Assembled Request (JSON)"
                  />

                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      <strong>Variables sent:</strong>{" "}
                      {Object.keys(assembledRequest.variables ?? {}).length}
                      <br />
                      <strong>Context keys:</strong>{" "}
                      {Object.keys(assembledRequest.context ?? {}).length}
                      <br />
                      <strong>Config overrides:</strong>{" "}
                      {
                        Object.keys(assembledRequest.config_overrides ?? {})
                          .length
                      }
                      <br />
                      <strong>Model override:</strong> {modelId}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(assembledRequest, null, 2),
                          "API Payload",
                        )
                      }
                      className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded font-medium"
                    >
                      {copiedSection === "API Payload" ? "Copied" : "Copy JSON"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </SectionPanel>
        </ScrollArea>
      </Card>
    </div>
  );
};
