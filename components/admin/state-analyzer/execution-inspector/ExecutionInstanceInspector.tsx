"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { pct } from "@/components/matrx/resizable/pct";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Layers,
  Settings2,
  Variable,
  Cpu,
  FolderOpen,
  Box,
  Type,
  Wrench,
  Zap,
  Braces,
  Info,
  Webhook,
} from "lucide-react";

import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type {
  ExecutionInstance,
  InstanceUIState,
  InstanceModelOverrideState,
  ManagedResource,
  InstanceContextEntry,
  InstanceUserInputState,
} from "@/features/agents/types/instance.types";
import type { ConversationsState } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import type {
  MessagesState,
  MessagesEntry,
  MessageRecord,
} from "@/features/agents/redux/execution-system/messages/messages.slice";
import { extractFlatText } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { InstanceUIStateSlice } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type {
  InstanceVariableValuesState,
  InstanceVariableValuesEntry,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import type { InstanceModelOverridesState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import type { InstanceResourcesState } from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import type { InstanceContextState } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { InstanceUserInputSliceState } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import type { InstanceClientToolsState } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import type { ActiveRequestsState } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import type { ConversationFocusState } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import type { AgentDefinitionSliceState } from "@/features/agents/types/agent-definition.types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string) {
  return id.slice(0, 8);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString();
}

function statusClasses(status: string) {
  switch (status) {
    case "complete":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "streaming":
    case "running":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
    case "error":
    case "failed":
      return "bg-destructive/15 text-destructive border-destructive/20";
    case "draft":
      return "bg-muted text-muted-foreground border-border";
    case "pending":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function roleClasses(role: string) {
  switch (role) {
    case "assistant":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
    case "user":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "system":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

function IdWithTooltip({ id, label }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            <code className="text-[10px] text-primary font-mono cursor-default">
              {id}
            </code>
            <button
              className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(id);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          <p className="font-mono text-xs break-all">
            {label ? `${label}: ` : ""}
            {id}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none shrink-0 border",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function BoolIndicator({ value, label }: { value: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className={cn(
          "inline-block h-2.5 w-2.5 rounded-full shrink-0",
          value ? "bg-emerald-500" : "bg-muted-foreground/30",
        )}
      />
      <span className="text-xs text-foreground">{label}</span>
    </div>
  );
}

function KVRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3 items-baseline py-0.5">
      <span
        className={cn(
          "text-xs text-muted-foreground shrink-0 w-44 text-right",
          mono && "font-mono",
        )}
      >
        {label}
      </span>
      <span className="text-sm text-foreground min-w-0 break-all">
        {children}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Instance
// ---------------------------------------------------------------------------

function InstanceTab({
  instance,
  agentName,
}: {
  instance: ExecutionInstance | null;
  agentName: string;
}) {
  if (!instance) return <EmptyState text="No instance selected" />;
  return (
    <div className="space-y-4">
      <Section title="Identity">
        <div className="space-y-1">
          <KVRow label="conversationId" mono>
            <IdWithTooltip id={instance.conversationId} />
          </KVRow>
          <KVRow label="agentId" mono>
            <IdWithTooltip id={instance.agentId} label="Agent" />{" "}
            <span className="text-xs text-muted-foreground ml-1">
              ({agentName})
            </span>
          </KVRow>
          <KVRow label="agentType" mono>
            {instance.agentType}
          </KVRow>
          <KVRow label="shortcutId" mono>
            {instance.shortcutId ? (
              <IdWithTooltip id={instance.shortcutId} />
            ) : (
              <span className="text-muted-foreground italic">null</span>
            )}
          </KVRow>
        </div>
      </Section>
      <Section title="Status & Origin">
        <div className="space-y-1">
          <KVRow label="status" mono>
            <StatusBadge className={statusClasses(instance.status)}>
              {instance.status}
            </StatusBadge>
          </KVRow>
          <KVRow label="origin" mono>
            {instance.origin}
          </KVRow>
          <KVRow label="sourceApp" mono>
            {instance.sourceApp}
          </KVRow>
          <KVRow label="sourceFeature" mono>
            {instance.sourceFeature}
          </KVRow>
          <KVRow label="cacheOnly" mono>
            <BoolIndicator
              value={instance.cacheOnly}
              label={String(instance.cacheOnly)}
            />
          </KVRow>
        </div>
      </Section>
      <Section title="Timestamps">
        <div className="space-y-1">
          <KVRow label="createdAt" mono>
            {formatTimestamp(instance.createdAt)}{" "}
            <span className="text-muted-foreground text-xs ml-1">
              ({relativeTime(instance.createdAt)})
            </span>
          </KVRow>
          <KVRow label="updatedAt" mono>
            {formatTimestamp(instance.updatedAt)}{" "}
            <span className="text-muted-foreground text-xs ml-1">
              ({relativeTime(instance.updatedAt)})
            </span>
          </KVRow>
        </div>
      </Section>
      <Section title="Raw Data" defaultOpen={false}>
        <div className="text-sm">
          <JsonTreeViewer data={instance} />
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Agent Definition
// ---------------------------------------------------------------------------

function AgentTab({
  agentData,
}: {
  agentData: AgentDefinitionRecord | undefined;
}) {
  if (!agentData) return <EmptyState text="No agent definition found" />;

  return (
    <div className="space-y-4">
      <Section title="Overview">
        <div className="space-y-1">
          <KVRow label="name">{agentData.name || "—"}</KVRow>
          <KVRow label="id" mono>
            {agentData.id ? <IdWithTooltip id={agentData.id} /> : "—"}
          </KVRow>
          <KVRow label="agentType">{agentData.agentType || "—"}</KVRow>
          <KVRow label="category">{agentData.category || "—"}</KVRow>
          {agentData.description && (
            <KVRow label="description">
              <span className="text-sm">{agentData.description}</span>
            </KVRow>
          )}
          {agentData.modelId && (
            <KVRow label="modelId" mono>
              <IdWithTooltip id={agentData.modelId} />
            </KVRow>
          )}
        </div>
      </Section>
      {agentData.tags && agentData.tags.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {agentData.tags.map((t) => (
              <StatusBadge
                key={t}
                className="bg-muted text-foreground border-border"
              >
                {t}
              </StatusBadge>
            ))}
          </div>
        </Section>
      )}
      <Section title="Flags">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4">
          <BoolIndicator value={agentData.isActive} label="isActive" />
          <BoolIndicator value={agentData.isPublic} label="isPublic" />
          <BoolIndicator value={agentData.isArchived} label="isArchived" />
          <BoolIndicator value={agentData.isFavorite} label="isFavorite" />
          <BoolIndicator value={agentData.isVersion} label="isVersion" />
        </div>
      </Section>
      {agentData.messages && (
        <Section title="Messages" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={agentData.messages} />
          </div>
        </Section>
      )}
      {agentData.variableDefinitions && (
        <Section title="Variable Definitions" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={agentData.variableDefinitions} />
          </div>
        </Section>
      )}
      {agentData.settings && (
        <Section title="Settings" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={agentData.settings} />
          </div>
        </Section>
      )}
      {agentData.tools && agentData.tools.length > 0 && (
        <Section title="Tools" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={agentData.tools} />
          </div>
        </Section>
      )}
      {agentData.contextSlots && agentData.contextSlots.length > 0 && (
        <Section title="Context Slots" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={agentData.contextSlots} />
          </div>
        </Section>
      )}
      <Section title="Full Definition" defaultOpen={false}>
        <div className="text-sm">
          <JsonTreeViewer data={agentData} />
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: History
// ---------------------------------------------------------------------------

function HistoryTab({ data }: { data: MessagesEntry | undefined }) {
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  if (!data) return <EmptyState text="No conversation history" />;

  const orderedRecords: MessageRecord[] = [];
  for (const id of data.orderedIds) {
    const rec = data.byId[id];
    if (rec) orderedRecords.push(rec);
  }

  return (
    <div className="space-y-3">
      <Section title="Conversation Metadata">
        <div className="space-y-1">
          <KVRow label="Conversation Title">
            {data.title || (
              <span className="text-muted-foreground italic">null</span>
            )}
          </KVRow>
          <KVRow label="Conversation Description">
            {data.description || (
              <span className="text-muted-foreground italic">null</span>
            )}
          </KVRow>
          {data.keywords && data.keywords.length > 0 && (
            <KVRow label="Conversation Keywords">
              <div className="flex flex-wrap gap-1">
                {data.keywords.map((k) => (
                  <StatusBadge
                    key={k}
                    className="bg-muted text-foreground border-border"
                  >
                    {k}
                  </StatusBadge>
                ))}
              </div>
            </KVRow>
          )}
          <KVRow label="Conversation ID" mono>
            <IdWithTooltip id={data.conversationId} />
          </KVRow>
          <KVRow label="API Endpoint Mode">
            <StatusBadge className={statusClasses(data.apiEndpointMode)}>
              {data.apiEndpointMode}
            </StatusBadge>
          </KVRow>
        </div>
      </Section>

      <Section title={`Messages (${orderedRecords.length})`}>
        {orderedRecords.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No messages yet</p>
        )}
        <div className="space-y-1.5">
          {orderedRecords.map((record) => {
            const isExpanded = expandedMessage === record.id;
            const preview = extractFlatText(record);
            return (
              <div
                key={record.id}
                className="border border-border rounded-md p-2.5 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() =>
                  setExpandedMessage(isExpanded ? null : record.id)
                }
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge className={roleClasses(record.role)}>
                    {record.role}
                  </StatusBadge>
                  <StatusBadge className={statusClasses(record.status)}>
                    {record.status}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(record.createdAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    pos {record.position}
                  </span>
                  {record._streamRequestId && (
                    <span className="text-xs text-muted-foreground font-mono">
                      req {shortId(record._streamRequestId)}
                    </span>
                  )}
                </div>
                {!isExpanded && preview && (
                  <p className="text-sm text-foreground mt-1.5 line-clamp-2">
                    {preview.slice(0, 300)}
                  </p>
                )}
                {isExpanded && (
                  <div className="mt-2 space-y-3">
                    <div className="space-y-1">
                      <KVRow label="id" mono>
                        <IdWithTooltip id={record.id} />
                      </KVRow>
                      {record._streamRequestId && (
                        <KVRow label="_streamRequestId" mono>
                          <IdWithTooltip id={record._streamRequestId} />
                        </KVRow>
                      )}
                      <KVRow label="createdAt">
                        {formatTimestamp(record.createdAt)}
                      </KVRow>
                      <KVRow label="isVisibleToUser">
                        <BoolIndicator
                          value={record.isVisibleToUser}
                          label={String(record.isVisibleToUser)}
                        />
                      </KVRow>
                      <KVRow label="isVisibleToModel">
                        <BoolIndicator
                          value={record.isVisibleToModel}
                          label={String(record.isVisibleToModel)}
                        />
                      </KVRow>
                    </div>
                    {preview && (
                      <Section title="Flat Text">
                        <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-md p-3 max-h-80 overflow-y-auto">
                          {preview}
                        </pre>
                      </Section>
                    )}
                    <Section title="Content Blocks" defaultOpen={false}>
                      <div className="text-sm">
                        <JsonTreeViewer data={record.content} />
                      </div>
                    </Section>
                    {record.metadata != null ? (
                      <Section title="Metadata" defaultOpen={false}>
                        <div className="text-sm">
                          <JsonTreeViewer data={record.metadata} />
                        </div>
                      </Section>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: UI State
// ---------------------------------------------------------------------------

function UIStateTab({ data }: { data: InstanceUIState | undefined }) {
  if (!data) return <EmptyState text="No UI state" />;

  const boolKeys: Array<keyof InstanceUIState> = [];
  const otherKeys: Array<[string, unknown]> = [];
  const nestedKeys: Array<[string, Record<string, unknown>]> = [];

  for (const [key, val] of Object.entries(data)) {
    if (key === "conversationId") continue;
    if (typeof val === "boolean") {
      boolKeys.push(key as keyof InstanceUIState);
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      nestedKeys.push([key, val as Record<string, unknown>]);
    } else {
      otherKeys.push([key, val]);
    }
  }

  return (
    <div className="space-y-4">
      {boolKeys.length > 0 && (
        <Section title="Flags">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4">
            {boolKeys.map((k) => (
              <BoolIndicator key={k} value={data[k] as boolean} label={k} />
            ))}
          </div>
        </Section>
      )}
      {otherKeys.length > 0 && (
        <Section title="Properties">
          <div className="space-y-1">
            {otherKeys.map(([k, v]) => (
              <KVRow key={k} label={k} mono>
                {v === null ? (
                  <span className="text-muted-foreground italic">null</span>
                ) : (
                  <JsonTreeViewer data={v} />
                )}
              </KVRow>
            ))}
          </div>
        </Section>
      )}
      {nestedKeys.map(([k, v]) => (
        <Section
          key={k}
          title={k}
          defaultOpen={k === "builderAdvancedSettings"}
        >
          <div className="text-sm">
            <JsonTreeViewer data={v} />
          </div>
        </Section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Variables
// ---------------------------------------------------------------------------

function VariablesTab({
  data,
}: {
  data: InstanceVariableValuesEntry | undefined;
}) {
  if (!data) return <EmptyState text="No variable data" />;

  const hasContent =
    (data.definitions && data.definitions.length > 0) ||
    (data.userValues && Object.keys(data.userValues).length > 0) ||
    (data.scopeValues && Object.keys(data.scopeValues).length > 0);
  if (!hasContent) return <EmptyState text="No variable data configured" />;

  return (
    <div className="space-y-4">
      {data.definitions && data.definitions.length > 0 && (
        <Section title="Definitions">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-1 pr-4 text-xs font-semibold text-muted-foreground">
                  Name
                </th>
                <th className="pb-1 pr-4 text-xs font-semibold text-muted-foreground">
                  Default
                </th>
                <th className="pb-1 text-xs font-semibold text-muted-foreground">
                  Help
                </th>
              </tr>
            </thead>
            <tbody>
              {data.definitions.map((d) => (
                <tr key={d.name} className="border-b border-border/50">
                  <td className="py-1.5 pr-4 font-mono text-primary font-medium">
                    {d.name}
                  </td>
                  <td className="py-1.5 pr-4 text-foreground">
                    <JsonTreeViewer data={d.defaultValue} />
                  </td>
                  <td className="py-1.5 text-muted-foreground">
                    {d.helpText || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {data.userValues && Object.keys(data.userValues).length > 0 && (
        <Section title="User Values">
          <div className="space-y-1">
            {Object.entries(data.userValues).map(([k, v]) => (
              <KVRow key={k} label={k} mono>
                <JsonTreeViewer data={v} />
              </KVRow>
            ))}
          </div>
        </Section>
      )}
      {data.scopeValues && Object.keys(data.scopeValues).length > 0 && (
        <Section title="Scope Values">
          <div className="space-y-1">
            {Object.entries(data.scopeValues).map(([k, v]) => (
              <KVRow key={k} label={k} mono>
                <JsonTreeViewer data={v} />
              </KVRow>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Model Overrides
// ---------------------------------------------------------------------------

function ModelTab({ data }: { data: InstanceModelOverrideState | undefined }) {
  if (!data) return <EmptyState text="No model overrides" />;

  const hasContent =
    (data.baseSettings && Object.keys(data.baseSettings).length > 0) ||
    (data.overrides && Object.keys(data.overrides).length > 0) ||
    (data.removals && data.removals.length > 0);
  if (!hasContent) {
    return (
      <div className="space-y-4">
        <EmptyState text="No model overrides configured" />
        <Section title="Raw Data" defaultOpen={false}>
          <div className="text-sm">
            <JsonTreeViewer data={data} />
          </div>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.baseSettings && Object.keys(data.baseSettings).length > 0 && (
        <Section title="Base Settings">
          <div className="space-y-1">
            {Object.entries(data.baseSettings).map(([k, v]) => (
              <KVRow key={k} label={k} mono>
                <JsonTreeViewer data={v} />
              </KVRow>
            ))}
          </div>
        </Section>
      )}
      {data.overrides && Object.keys(data.overrides).length > 0 && (
        <Section title="Overrides">
          <div className="space-y-1">
            {Object.entries(data.overrides).map(([k, v]) => (
              <KVRow key={k} label={k} mono>
                <JsonTreeViewer data={v} />
              </KVRow>
            ))}
          </div>
        </Section>
      )}
      {data.removals && data.removals.length > 0 && (
        <Section title="Removals">
          <div className="flex flex-wrap gap-1.5">
            {data.removals.map((r) => (
              <StatusBadge
                key={r}
                className="bg-destructive/15 text-destructive border-destructive/20"
              >
                {r}
              </StatusBadge>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Resources
// ---------------------------------------------------------------------------

function ResourcesTab({
  data,
}: {
  data: Record<string, ManagedResource> | undefined;
}) {
  if (!data || Object.keys(data).length === 0)
    return <EmptyState text="No resources" />;
  return (
    <div className="space-y-1.5">
      {Object.entries(data).map(([id, r]) => (
        <div key={id} className="border border-border rounded-md p-2.5">
          <div className="flex items-center gap-2">
            <IdWithTooltip id={r.resourceId} label="resourceId" />
            <StatusBadge className={statusClasses(r.status)}>
              {r.status}
            </StatusBadge>
            <span className="text-xs text-muted-foreground">{r.blockType}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              #{r.sortOrder}
            </span>
          </div>
          {r.errorMessage && (
            <p className="text-sm text-destructive mt-1">{r.errorMessage}</p>
          )}
          <Section title="Full Data" defaultOpen={false}>
            <div className="text-sm">
              <JsonTreeViewer data={r} />
            </div>
          </Section>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Context
// ---------------------------------------------------------------------------

function ContextTab({
  data,
}: {
  data: Record<string, InstanceContextEntry> | undefined;
}) {
  if (!data || Object.keys(data).length === 0)
    return <EmptyState text="No context entries" />;
  return (
    <div className="space-y-1.5">
      {Object.entries(data).map(([k, e]) => (
        <div key={k} className="border border-border rounded-md p-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-primary font-medium">
              {e.key}
            </span>
            <span className="text-xs text-muted-foreground">{e.label}</span>
            <StatusBadge className="bg-muted text-muted-foreground border-border">
              {e.type}
            </StatusBadge>
            {e.slotMatched && (
              <StatusBadge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                matched
              </StatusBadge>
            )}
          </div>
          <div className="mt-1.5 text-sm">
            <JsonTreeViewer data={e.value} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: User Input
// ---------------------------------------------------------------------------

function UserInputTab({ data }: { data: InstanceUserInputState | undefined }) {
  if (!data) return <EmptyState text="No user input" />;

  return (
    <div className="space-y-4">
      <Section title="Text">
        <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono bg-muted/50 rounded-md p-3 max-h-60 overflow-y-auto">
          {data.text || "(empty)"}
        </pre>
      </Section>
      {data.messageParts && data.messageParts.length > 0 && (
        <Section title="Message Parts">
          <div className="text-sm">
            <JsonTreeViewer data={data.messageParts} />
          </div>
        </Section>
      )}
      <Section title="Full Data" defaultOpen={false}>
        <div className="text-sm">
          <JsonTreeViewer data={data} />
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Client Tools
// ---------------------------------------------------------------------------

function ToolsTab({ data }: { data: string[] | undefined }) {
  if (!data || data.length === 0) return <EmptyState text="No client tools" />;
  return (
    <div className="flex flex-wrap gap-2">
      {data.map((tool) => (
        <span
          key={tool}
          className="font-mono text-sm bg-muted text-foreground rounded-md px-2.5 py-1 border border-border"
        >
          {tool}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Active Requests
// ---------------------------------------------------------------------------

function RequestsTab({ requests }: { requests: ActiveRequest[] }) {
  const [expandedReq, setExpandedReq] = useState<string | null>(null);
  if (requests.length === 0) return <EmptyState text="No active requests" />;
  return (
    <div className="space-y-1.5">
      {requests.map((req) => {
        const isExpanded = expandedReq === req.requestId;
        const phaseName = req.currentPhase ?? null;

        return (
          <div
            key={req.requestId}
            className="border border-border rounded-md p-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
            onClick={() => setExpandedReq(isExpanded ? null : req.requestId)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <IdWithTooltip id={req.requestId} label="requestId" />
              <StatusBadge className={statusClasses(req.status)}>
                {req.status}
              </StatusBadge>
              {phaseName && (
                <span className="text-xs text-muted-foreground">
                  {phaseName}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {req.chunkCount} chunks
              </span>
              <span className="text-xs text-muted-foreground">
                {req.renderBlockOrder.length} blocks
              </span>
              {req.isTextStreaming && (
                <StatusBadge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20">
                  streaming
                </StatusBadge>
              )}
            </div>
            {req.error?.message && (
              <p className="text-sm text-destructive mt-1">
                {req.error.message}
              </p>
            )}
            {isExpanded && (
              <div className="mt-2 pt-2 border-t border-border text-sm">
                <JsonTreeViewer data={req} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail Tab: Raw JSON
// ---------------------------------------------------------------------------

function RawJsonTab({ data }: { data: Record<string, unknown> }) {
  return (
    <JsonInspector
      data={data}
      defaultView="json"
      className="h-full min-h-[24rem] rounded-none border-0 shadow-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const DETAIL_TABS = [
  { id: "instance", label: "Instance", icon: Info },
  { id: "agent", label: "Agent", icon: Webhook },
  { id: "history", label: "History", icon: MessageSquare },
  { id: "uiState", label: "UI State", icon: Layers },
  { id: "variables", label: "Variables", icon: Variable },
  { id: "model", label: "Model", icon: Cpu },
  { id: "resources", label: "Resources", icon: FolderOpen },
  { id: "context", label: "Context", icon: Box },
  { id: "userInput", label: "Input", icon: Type },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "requests", label: "Requests", icon: Zap },
  { id: "raw", label: "Raw JSON", icon: Braces },
] as const;

type TabId = (typeof DETAIL_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface ExecutionInstanceInspectorProps {
  className?: string;
  externalSelectedAgent?: string | null;
  hideSidebar?: boolean;
}

export default function ExecutionInstanceInspector({
  className,
  externalSelectedAgent,
  hideSidebar = false,
}: ExecutionInstanceInspectorProps) {
  const store = useAppStore();
  const state = store.getState() as RootState;

  const [agentFilter, setAgentFilter] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    externalSelectedAgent ?? null,
  );
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("instance");

  const effectiveAgentId = externalSelectedAgent ?? selectedAgentId;

  // Typed slice access
  const agentDefSlice = state.agentDefinition as AgentDefinitionSliceState;
  const agents = agentDefSlice.agents;
  const execSlice = state.conversations as ConversationsState;
  const instances = execSlice.byConversationId;
  const allConvIds = execSlice.allConversationIds;

  const historySlice = state.messages as MessagesState;
  const uiStateSlice = state.instanceUIState as InstanceUIStateSlice;
  const varSlice = state.instanceVariableValues as InstanceVariableValuesState;
  const modelSlice =
    state.instanceModelOverrides as InstanceModelOverridesState;
  const resourcesSlice = state.instanceResources as InstanceResourcesState;
  const contextSlice = state.instanceContext as InstanceContextState;
  const userInputSlice = state.instanceUserInput as InstanceUserInputSliceState;
  const clientToolsSlice =
    state.instanceClientTools as InstanceClientToolsState;
  const requestsSlice = state.activeRequests as ActiveRequestsState;
  const focusSlice = state.conversationFocus as ConversationFocusState;

  // Derived
  const agentInstanceCount: Record<string, number> = {};
  for (const inst of Object.values(instances)) {
    agentInstanceCount[inst.agentId] =
      (agentInstanceCount[inst.agentId] || 0) + 1;
  }

  const agentFilterLower = agentFilter.toLowerCase();
  const agentList = Object.values(agents)
    .filter((a) => {
      const name = a.name?.toLowerCase() ?? "";
      const id = a.id?.toLowerCase() ?? "";
      return name.includes(agentFilterLower) || id.includes(agentFilterLower);
    })
    .sort((a, b) => {
      const ac = agentInstanceCount[a.id] || 0;
      const bc = agentInstanceCount[b.id] || 0;
      if (ac > 0 && bc === 0) return -1;
      if (ac === 0 && bc > 0) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

  const filteredConvIds = effectiveAgentId
    ? allConvIds.filter((id) => instances[id]?.agentId === effectiveAgentId)
    : allConvIds;

  // Auto-select first agent if none selected
  useEffect(() => {
    if (externalSelectedAgent) return;
    if (selectedAgentId) return;

    const agentsWithInstances = Object.keys(agentInstanceCount).filter(
      (id) => agentInstanceCount[id] > 0,
    );
    if (agentsWithInstances.length > 0) {
      setSelectedAgentId(agentsWithInstances[0]);
      setActiveTab("agent");
    } else if (agentList.length > 0) {
      setSelectedAgentId(agentList[0].id);
      setActiveTab("agent");
    }
  }, []);

  // Auto-select first instance when agent changes
  useEffect(() => {
    if (!effectiveAgentId) {
      if (allConvIds.length > 0 && !selectedConvId) {
        setSelectedConvId(allConvIds[0]);
      }
      return;
    }
    const convIds = allConvIds.filter(
      (id) => instances[id]?.agentId === effectiveAgentId,
    );
    if (convIds.length > 0) {
      setSelectedConvId(convIds[0]);
    } else {
      setSelectedConvId(null);
    }
  }, [effectiveAgentId]);

  const selectedInstance = selectedConvId
    ? (instances[selectedConvId] ?? null)
    : null;
  const selectedAgentData = selectedInstance
    ? agents[selectedInstance.agentId]
    : effectiveAgentId
      ? agents[effectiveAgentId]
      : undefined;
  const selectedAgentName = selectedAgentData?.name || "Unknown";

  // Per-instance slice data
  const convHistory: MessagesEntry | undefined = selectedConvId
    ? historySlice.byConversationId[selectedConvId]
    : undefined;
  const uiState: InstanceUIState | undefined = selectedConvId
    ? uiStateSlice.byConversationId[selectedConvId]
    : undefined;
  const varValues: InstanceVariableValuesEntry | undefined = selectedConvId
    ? varSlice.byConversationId[selectedConvId]
    : undefined;
  const modelOverrides: InstanceModelOverrideState | undefined = selectedConvId
    ? modelSlice.byConversationId[selectedConvId]
    : undefined;
  const resources: Record<string, ManagedResource> | undefined = selectedConvId
    ? resourcesSlice.byConversationId[selectedConvId]
    : undefined;
  const context: Record<string, InstanceContextEntry> | undefined =
    selectedConvId ? contextSlice.byConversationId[selectedConvId] : undefined;
  const userInput: InstanceUserInputState | undefined = selectedConvId
    ? userInputSlice.byConversationId[selectedConvId]
    : undefined;
  const clientTools: string[] | undefined = selectedConvId
    ? clientToolsSlice.byConversationId[selectedConvId]
    : undefined;

  const reqIds: string[] = selectedConvId
    ? requestsSlice.byConversationId[selectedConvId] || []
    : [];
  const activeReqs: ActiveRequest[] = reqIds
    .map((rid) => requestsSlice.byRequestId[rid])
    .filter(Boolean);

  const focusSurfaces = focusSlice.bySurface;

  const rawData: Record<string, unknown> = selectedConvId
    ? {
        instance: instances[selectedConvId],
        agentDefinition: selectedAgentData,
        conversationHistory: convHistory,
        uiState,
        variableValues: varValues,
        modelOverrides,
        resources,
        context,
        userInput,
        clientTools,
        activeRequests: activeReqs,
        conversationFocus: focusSurfaces,
      }
    : {};

  const totalAgents = Object.keys(agents).length;
  const totalInstances = allConvIds.length;
  const totalRequests = Object.keys(requestsSlice.byRequestId || {}).length;

  function handleAgentSelect(agentId: string | null) {
    setSelectedAgentId(agentId);
    setActiveTab("agent");
  }

  function renderTabContent() {
    if (!selectedConvId && activeTab !== "agent")
      return <EmptyState text="Select an instance to inspect" />;
    switch (activeTab) {
      case "instance":
        return (
          <InstanceTab
            instance={selectedInstance}
            agentName={selectedAgentName}
          />
        );
      case "agent":
        return <AgentTab agentData={selectedAgentData} />;
      case "history":
        return <HistoryTab data={convHistory} />;
      case "uiState":
        return <UIStateTab data={uiState} />;
      case "variables":
        return <VariablesTab data={varValues} />;
      case "model":
        return <ModelTab data={modelOverrides} />;
      case "resources":
        return <ResourcesTab data={resources} />;
      case "context":
        return <ContextTab data={context} />;
      case "userInput":
        return <UserInputTab data={userInput} />;
      case "tools":
        return <ToolsTab data={clientTools} />;
      case "requests":
        return <RequestsTab requests={activeReqs} />;
      case "raw":
        return <RawJsonTab data={rawData} />;
      default:
        return null;
    }
  }

  const agentsSidebar = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter agents..."
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          <button
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2",
              effectiveAgentId === null
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-accent text-foreground",
            )}
            onClick={() => handleAgentSelect(null)}
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">All Instances</span>
            <span className="ml-auto text-xs opacity-70">{totalInstances}</span>
          </button>
          {agentList.map((agent) => {
            const count = agentInstanceCount[agent.id] || 0;
            return (
              <button
                key={agent.id}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md text-[10px] transition-colors flex items-center gap-2",
                  effectiveAgentId === agent.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : count > 0
                      ? "hover:bg-accent text-foreground"
                      : "hover:bg-accent text-muted-foreground",
                )}
                onClick={() => handleAgentSelect(agent.id)}
              >
                <span className="truncate">{agent.name}</span>
                {count > 0 && (
                  <span className="ml-auto text-[11px] bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 font-medium">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const instancesList = (
    <div
      className="flex flex-col h-full min-h-0"
      style={{ overflow: "hidden" }}
    >
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Instances
        </span>
        <span className="text-xs text-muted-foreground">
          ({filteredConvIds.length})
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1">
          {filteredConvIds.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No instances
            </p>
          )}
          {filteredConvIds.map((convId) => {
            const inst = instances[convId];
            if (!inst) return null;
            const agentName =
              agents[inst.agentId]?.name || shortId(inst.agentId);
            const isSelected = selectedConvId === convId;
            return (
              <div
                key={convId}
                role="button"
                tabIndex={0}
                className={cn(
                  "w-full text-left px-1.5 py-1.5 rounded-md transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent ring-1 ring-primary/40"
                    : "hover:bg-accent/50",
                )}
                onClick={() => setSelectedConvId(convId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    setSelectedConvId(convId);
                }}
              >
                <div className="flex items-center">
                  <IdWithTooltip id={convId} />
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground/70">
                    {agentName}
                  </span>
                  <span className="opacity-40">|</span>
                  <span>{inst.origin}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 gap-2 flex items-center">
                  <span>{inst.sourceFeature}</span>
                  {relativeTime(inst.createdAt)}
                  <StatusBadge className={statusClasses(inst.status)}>
                    {inst.status}
                  </StatusBadge>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const detailPanel = (
    <div
      className="flex flex-col h-full min-h-0"
      style={{ overflow: "hidden" }}
    >
      <div className="flex items-center border-b border-border shrink-0 overflow-x-auto scrollbar-none bg-muted/30">
        {DETAIL_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors shrink-0",
                activeTab === tab.id
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {selectedInstance && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 text-xs">
          <IdWithTooltip id={selectedInstance.conversationId} />
          <StatusBadge className={statusClasses(selectedInstance.status)}>
            {selectedInstance.status}
          </StatusBadge>
          <span className="text-foreground font-medium">
            {selectedAgentName}
          </span>
          <span className="text-muted-foreground">
            {selectedInstance.sourceFeature} / {selectedInstance.origin}
          </span>
          {selectedInstance.cacheOnly && (
            <StatusBadge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
              cache-only
            </StatusBadge>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-3">{renderTabContent()}</div>
      </ScrollArea>
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background text-foreground overflow-hidden",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {!hideSidebar && (
          <>
            <ResizablePanel
              defaultSize={pct(18)}
              minSize={pct(12)}
              maxSize={pct(30)}
              style={{ overflow: "hidden" }}
            >
              {agentsSidebar}
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}
        <ResizablePanel
          defaultSize={pct(hideSidebar ? 30 : 24)}
          minSize={pct(15)}
          maxSize={pct(40)}
          style={{ overflow: "hidden" }}
        >
          {instancesList}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={pct(hideSidebar ? 70 : 58)}
          minSize={pct(30)}
          style={{ overflow: "hidden" }}
        >
          {detailPanel}
        </ResizablePanel>
      </ResizablePanelGroup>

      <div className="flex items-center gap-3 px-3 py-1 border-t border-border bg-muted/30 shrink-0 text-xs text-muted-foreground">
        <span>{totalAgents} agents</span>
        <span className="opacity-30">|</span>
        <span>{totalInstances} instances</span>
        <span className="opacity-30">|</span>
        <span>{totalRequests} requests</span>
        {Object.keys(focusSurfaces).length > 0 && (
          <>
            <span className="opacity-30">|</span>
            <span className="truncate">
              Focus:{" "}
              {Object.entries(focusSurfaces)
                .map(([s, c]) => `${s} → ${shortId(c.display)}`)
                .join(", ")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
