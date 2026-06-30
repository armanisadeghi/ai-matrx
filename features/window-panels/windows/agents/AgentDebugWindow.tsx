"use client";

import React, { useCallback, useState } from "react";
import {
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Cpu,
  MessageSquare,
  AlertCircle,
  Layers,
  Activity,
  User,
  Sliders,
  History,
  LayoutDashboard,
} from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { formatJson } from "@/utils/json/json-cleaner-utility";

// ─── Agent definition selectors ───────────────────────────────────────────────
import {
  selectAllAgentsArray,
  selectAgentById,
  selectAgentName,
  selectAgentDescription,
  selectAgentVariableDefinitions,
  selectAgentSettings,
  selectAgentMessages,
  selectAgentTags,
  selectAgentCategory,
} from "@/features/agents/redux/agent-definition/selectors";

// ─── Execution instance selectors ─────────────────────────────────────────────
import {
  selectInstance,
  selectAllConversationIds,
  selectConversationIdsByAgent,
  selectInstancesByAgent,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";

// ─── Instance variable values selectors ───────────────────────────────────────
import {
  selectInstanceVariableDefinitions,
  selectUserVariableValues,
  selectResolvedVariables,
} from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";

// ─── Instance user input selectors ────────────────────────────────────────────
import {
  selectUserInputText,
  selectUserInputMessageParts,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";

// ─── Instance UI state selectors ──────────────────────────────────────────────
import {
  selectInstanceUIState,
  selectDisplayMode,
  selectAutoRun,
  selectAllowChat,
  selectShowVariablePanel,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

// ─── Conversation history selectors ───────────────────────────────────────────
import {
  selectConversationMessages,
  selectApiEndpointMode,
  selectMessageCount,
  extractFlatText,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabKey =
  | "overview"
  | "definition"
  | "instances"
  | "variables"
  | "input"
  | "uistate"
  | "history";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "definition", label: "Definition", icon: Cpu },
  { key: "instances", label: "Instances", icon: Layers },
  { key: "variables", label: "Variables", icon: Sliders },
  { key: "input", label: "User Input", icon: User },
  { key: "uistate", label: "UI State", icon: Activity },
  { key: "history", label: "History", icon: History },
];

// ─── Copy helper ──────────────────────────────────────────────────────────────

function useCopyText(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return { copied, copy };
}

// ─── Shared: JSON pane ────────────────────────────────────────────────────────

function JsonPane({ data, label }: { data: unknown; label?: string }) {
  return (
    <JsonInspector
      data={data}
      label={label}
      defaultView="json"
      className="h-full min-h-0 rounded-none border-0 shadow-none"
    />
  );
}

// ─── Shared: KV row ───────────────────────────────────────────────────────────

function KvRow({
  label,
  value,
  mono = false,
  dim = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 py-0.5 min-w-0">
      <span className="w-44 shrink-0 text-[11px] text-muted-foreground text-right">
        {label}
      </span>
      <span
        className={cn(
          "text-xs flex-1 min-w-0 truncate",
          mono && "font-mono",
          dim && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Shared: Section header ───────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1 mt-2 first:mt-0">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </span>
    </div>
  );
}

// ─── Shared: Badge ────────────────────────────────────────────────────────────

function Badge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "success" | "warn" | "error" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
        variant === "success" && "bg-emerald-500/10 text-emerald-500",
        variant === "warn" && "bg-amber-500/10 text-amber-500",
        variant === "error" && "bg-red-500/10 text-red-500",
        variant === "info" && "bg-blue-500/10 text-blue-400",
        variant === "default" && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({
  agentId,
  conversationId,
}: {
  agentId: string;
  conversationId: string | null;
}) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  const instance = useAppSelector(
    conversationId ? selectInstance(conversationId) : () => undefined,
  );
  const messages = useAppSelector(
    conversationId ? selectConversationMessages(conversationId) : () => [],
  );
  const uiState = useAppSelector(
    conversationId ? selectInstanceUIState(conversationId) : () => undefined,
  );
  const inputText = useAppSelector(
    conversationId ? selectUserInputText(conversationId) : () => "",
  );
  const resolvedVars = useAppSelector(
    conversationId ? selectResolvedVariables(conversationId) : () => ({}),
  );

  if (!agent)
    return (
      <div className="p-4 text-xs text-muted-foreground">Agent not found</div>
    );

  const statusVariant = (s?: string) => {
    if (!s) return "default";
    if (s === "complete") return "success";
    if (s === "running" || s === "streaming") return "info";
    if (s === "error") return "error";
    return "default";
  };

  return (
    <div className="flex flex-col gap-0 overflow-y-auto h-full">
      <SectionHeader title="Agent" />
      <div className="px-3 pb-1 space-y-0.5">
        <KvRow label="name" value={agent.name} />
        <KvRow label="category" value={agent.category ?? "—"} dim />
        <KvRow label="agentId" value={agentId.slice(0, 8) + "…"} mono dim />
        <KvRow
          label="description"
          value={
            <span className="text-[11px] text-muted-foreground whitespace-normal leading-snug">
              {agent.description?.slice(0, 120) ?? "—"}
            </span>
          }
        />
        {(agent.tags?.length ?? 0) > 0 && (
          <KvRow
            label="tags"
            value={
              <div className="flex flex-wrap gap-1">
                {agent.tags?.map((t) => (
                  <Badge key={t} label={t} />
                ))}
              </div>
            }
          />
        )}
      </div>

      {conversationId && (
        <>
          <SectionHeader title="Active Instance" />
          <div className="px-3 pb-1 space-y-0.5">
            <KvRow
              label="conversationId"
              value={conversationId.slice(0, 8) + "…"}
              mono
              dim
            />
            <KvRow
              label="status"
              value={
                <Badge
                  label={instance?.status ?? "—"}
                  variant={statusVariant(instance?.status)}
                />
              }
            />
            <KvRow label="origin" value={instance?.origin ?? "—"} mono dim />
            <KvRow
              label="cacheOnly"
              value={instance?.cacheOnly ? "true" : "false"}
              mono
              dim
            />
            <KvRow label="messages" value={String(messages.length)} />
            <KvRow
              label="displayMode"
              value={uiState?.displayMode ?? "—"}
              mono
              dim
            />
            <KvRow
              label="autoRun"
              value={uiState?.autoRun ? "true" : "false"}
              mono
              dim
            />
            <KvRow
              label="userInput"
              value={
                inputText
                  ? `"${inputText.slice(0, 60)}${inputText.length > 60 ? "…" : ""}"`
                  : "(empty)"
              }
              dim
            />
          </div>

          {Object.keys(resolvedVars).length > 0 && (
            <>
              <SectionHeader title="Resolved Variables" />
              <div className="px-3 pb-1 space-y-0.5">
                {Object.entries(resolvedVars).map(([k, v]) => (
                  <KvRow key={k} label={k} value={String(v ?? "—")} mono />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!conversationId && (
        <>
          <SectionHeader title="Instance" />
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No instance selected — click an instance in the sidebar to inspect
            it.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Agent Definition ────────────────────────────────────────────────────

function DefinitionTab({ agentId }: { agentId: string }) {
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  return <JsonPane data={agent} label="agentDefinition" />;
}

// ─── Tab: Execution Instances ─────────────────────────────────────────────────

function InstancesTab({
  agentId,
  conversationId,
}: {
  agentId: string;
  conversationId: string | null;
}) {
  const allInstances = useAppSelector(selectInstancesByAgent(agentId));
  const selected = useAppSelector(
    conversationId ? selectInstance(conversationId) : () => undefined,
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          conversations
        </span>
        <Badge label={`${allInstances.length} total`} />
      </div>
      {conversationId && selected ? (
        <JsonPane data={selected} />
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {allInstances.map((inst) => (
            <div key={inst.conversationId} className="px-3 py-2 space-y-0.5">
              <KvRow
                label="conversationId"
                value={inst.conversationId.slice(0, 8) + "…"}
                mono
                dim
              />
              <KvRow label="status" value={<Badge label={inst.status} />} />
              <KvRow label="origin" value={inst.origin} mono dim />
            </div>
          ))}
          {allInstances.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">
              No instances
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Variable Values ─────────────────────────────────────────────────────

function VariablesTab({ conversationId }: { conversationId: string | null }) {
  const defs = useAppSelector(
    conversationId
      ? selectInstanceVariableDefinitions(conversationId)
      : () => [],
  );
  const userValues = useAppSelector(
    conversationId ? selectUserVariableValues(conversationId) : () => ({}),
  );
  const resolved = useAppSelector(
    conversationId ? selectResolvedVariables(conversationId) : () => ({}),
  );

  if (!conversationId)
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an instance
      </div>
    );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <SectionHeader title="Definitions" />
      <div className="px-3 pb-2 space-y-0.5">
        {(defs ?? []).map((d) => (
          <KvRow
            key={d.name}
            label={d.name}
            value={
              <span className="text-muted-foreground">
                {d.helpText ?? "—"}{" "}
                <span className="text-primary/60">
                  (default:{" "}
                  {d.defaultValue != null ? String(d.defaultValue) : "—"})
                </span>
              </span>
            }
          />
        ))}
        {(!defs || defs.length === 0) && <KvRow label="(none)" value="" dim />}
      </div>

      <SectionHeader title="User Values" />
      <div className="px-3 pb-2 space-y-0.5">
        {Object.entries(userValues).map(([k, v]) => (
          <KvRow key={k} label={k} value={String(v ?? "—")} mono />
        ))}
        {Object.keys(userValues).length === 0 && (
          <KvRow label="(empty)" value="" dim />
        )}
      </div>

      <SectionHeader title="Resolved" />
      <div className="px-3 pb-2 space-y-0.5">
        {Object.entries(resolved).map(([k, v]) => (
          <KvRow key={k} label={k} value={String(v ?? "—")} mono />
        ))}
        {Object.keys(resolved).length === 0 && (
          <KvRow label="(empty)" value="" dim />
        )}
      </div>
    </div>
  );
}

// ─── Tab: User Input ──────────────────────────────────────────────────────────

function UserInputTab({ conversationId }: { conversationId: string | null }) {
  const text = useAppSelector(
    conversationId ? selectUserInputText(conversationId) : () => "",
  );
  const blocks = useAppSelector(
    conversationId ? selectUserInputMessageParts(conversationId) : () => null,
  );

  if (!conversationId)
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an instance
      </div>
    );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      <SectionHeader title="Text" />
      <div className="px-3 pb-2">
        {text ? (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap bg-muted/10 rounded p-2">
            {text}
          </pre>
        ) : (
          <span className="text-xs text-muted-foreground">(empty)</span>
        )}
      </div>
      <SectionHeader title="Content Blocks" />
      <div className="px-3 pb-2">
        {blocks ? (
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap bg-muted/10 rounded p-2">
            {formatJson(blocks, 2)}
          </pre>
        ) : (
          <span className="text-xs text-muted-foreground">(null)</span>
        )}
      </div>
    </div>
  );
}

// ─── Tab: UI State ────────────────────────────────────────────────────────────

function UIStateTab({ conversationId }: { conversationId: string | null }) {
  const uiState = useAppSelector(
    conversationId ? selectInstanceUIState(conversationId) : () => undefined,
  );
  if (!conversationId)
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an instance
      </div>
    );
  return <JsonPane data={uiState} label="instanceUIState" />;
}

// ─── Tab: Conversation History ────────────────────────────────────────────────

function MessageCard({
  record,
  index,
}: {
  record: MessageRecord;
  index: number;
}) {
  const [open, setOpen] = useState(index === 0);
  const json = formatJson(record, 2);
  const { copied, copy } = useCopyText(json);

  const roleColor =
    record.role === "user"
      ? "text-blue-400"
      : record.role === "assistant"
        ? "text-emerald-400"
        : "text-muted-foreground";

  const preview = extractFlatText(record).slice(0, 120);

  return (
    <div className="border-b border-border/50 last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer select-none group"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className={cn("text-xs font-semibold w-16 shrink-0", roleColor)}>
          {record.role}
        </span>
        <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          {preview}
        </span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">
          #{index}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
      {open && (
        <pre className="px-4 pb-3 text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed bg-muted/10">
          {json}
        </pre>
      )}
    </div>
  );
}

function HistoryTab({ conversationId }: { conversationId: string | null }) {
  const messages = useAppSelector(
    conversationId ? selectConversationMessages(conversationId) : () => [],
  );
  const mode = useAppSelector(
    conversationId ? selectApiEndpointMode(conversationId) : () => "agent",
  );
  const messageCount = useAppSelector(
    conversationId ? selectMessageCount(conversationId) : () => 0,
  );

  if (!conversationId)
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an instance
      </div>
    );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          messages
        </span>
        <Badge label={`mode: ${mode}`} variant="info" />
        <Badge label={`${messageCount} messages`} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
            <MessageSquare className="h-6 w-6 opacity-20" />
            <span className="text-xs">No messages yet</span>
          </div>
        ) : (
          messages.map((record, i) => (
            <MessageCard key={record.id} record={record} index={i} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarAgent {
  id: string;
  name: string;
  hasInstances: boolean;
  instanceIds: string[];
}

function AgentSidebarItem({
  agent,
  selectedAgentId,
  selectedConversationId,
  onSelectAgent,
  onSelectInstance,
  defaultOpen,
}: {
  agent: SidebarAgent;
  selectedAgentId: string | null;
  selectedConversationId: string | null;
  onSelectAgent: (id: string) => void;
  onSelectInstance: (agentId: string, conversationId: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isSelected =
    selectedAgentId === agent.id && selectedConversationId === null;
  const { copied, copy } = useCopyText(agent.id);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (agent.hasInstances) setOpen((v) => !v);
          onSelectAgent(agent.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            if (agent.hasInstances) setOpen((v) => !v);
            onSelectAgent(agent.id);
          }
        }}
        className={cn(
          "flex items-center gap-1.5 w-full px-2 py-1.5 cursor-pointer select-none transition-colors group border-l-2",
          isSelected
            ? "border-primary bg-primary/8 text-foreground"
            : "border-transparent hover:bg-muted/40 text-foreground",
        )}
      >
        {agent.hasInstances ? (
          open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Cpu
          className={cn(
            "h-3 w-3 shrink-0",
            isSelected ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="text-xs flex-1 min-w-0 truncate">{agent.name}</span>
        {agent.hasInstances && (
          <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
            {agent.instanceIds.length}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy();
          }}
          className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0"
          title="Copy agent ID"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
      {open && agent.hasInstances && (
        <div className="pl-2">
          {agent.instanceIds.map((cid) => {
            const isInstanceSelected = selectedConversationId === cid;
            return (
              <InstanceSidebarRow
                key={cid}
                conversationId={cid}
                isSelected={isInstanceSelected}
                onSelect={() => onSelectInstance(agent.id, cid)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function InstanceSidebarRow({
  conversationId,
  isSelected,
  onSelect,
}: {
  conversationId: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const instance = useAppSelector(selectInstance(conversationId));
  const { copied, copy } = useCopyText(conversationId);
  const shortId = conversationId.slice(0, 8) + "…";

  const statusColor = (s?: string) => {
    if (!s) return "text-muted-foreground";
    if (s === "complete") return "text-emerald-500";
    if (s === "running" || s === "streaming") return "text-blue-400";
    if (s === "error") return "text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1.5 cursor-pointer select-none transition-colors border-l-2 group",
        isSelected
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
      )}
    >
      <MessageSquare
        className={cn(
          "h-3 w-3 shrink-0",
          isSelected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "text-[11px] font-mono flex-1 min-w-0 truncate",
          isSelected ? "text-primary" : "text-foreground",
        )}
      >
        {shortId}
      </span>
      {instance?.status && (
        <span
          className={cn("text-[10px] shrink-0", statusColor(instance.status))}
        >
          {instance.status}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        className="opacity-0 group-hover:opacity-100 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all shrink-0"
        title="Copy conversation ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

function AgentDebugSidebar({
  selectedAgentId,
  selectedConversationId,
  onSelectAgent,
  onSelectInstance,
}: {
  selectedAgentId: string | null;
  selectedConversationId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSelectInstance: (agentId: string, conversationId: string) => void;
}) {
  const allAgents = useAppSelector(selectAllAgentsArray);
  const instancesByAgent = useAppSelector(selectConversationIdsByAgent);

  const withInstances: SidebarAgent[] = [];
  const withoutInstances: SidebarAgent[] = [];

  for (const agent of allAgents) {
    const instanceIds = instancesByAgent[agent.id] ?? [];
    const entry: SidebarAgent = {
      id: agent.id,
      name: agent.name || agent.id.slice(0, 8) + "…",
      hasInstances: instanceIds.length > 0,
      instanceIds,
    };
    if (entry.hasInstances) withInstances.push(entry);
    else withoutInstances.push(entry);
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {withInstances.length > 0 && (
        <>
          <div className="px-2 pt-2 pb-1 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Active ({withInstances.length})
            </span>
          </div>
          <div className="overflow-y-auto shrink-0 max-h-[50%]">
            {withInstances.map((agent) => (
              <AgentSidebarItem
                key={agent.id}
                agent={agent}
                selectedAgentId={selectedAgentId}
                selectedConversationId={selectedConversationId}
                onSelectAgent={onSelectAgent}
                onSelectInstance={onSelectInstance}
                defaultOpen={selectedAgentId === agent.id}
              />
            ))}
          </div>
          {withoutInstances.length > 0 && (
            <div className="border-t border-border/50 shrink-0" />
          )}
        </>
      )}
      {withoutInstances.length > 0 && (
        <>
          <div className="px-2 pt-2 pb-1 shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Agents ({withoutInstances.length})
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {withoutInstances.map((agent) => (
              <AgentSidebarItem
                key={agent.id}
                agent={agent}
                selectedAgentId={selectedAgentId}
                selectedConversationId={selectedConversationId}
                onSelectAgent={onSelectAgent}
                onSelectInstance={onSelectInstance}
                defaultOpen={false}
              />
            ))}
          </div>
        </>
      )}
      {withInstances.length === 0 && withoutInstances.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
          <AlertCircle className="h-6 w-6 opacity-20" />
          <span className="text-xs">No agents loaded</span>
        </div>
      )}
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

function AgentDebugTabBar({
  activeTab,
  onActivate,
  conversationId,
}: {
  activeTab: TabKey;
  onActivate: (tab: TabKey) => void;
  conversationId: string | null;
}) {
  const instanceTabs: TabKey[] = ["variables", "input", "uistate", "history"];

  return (
    <div className="flex items-center border-b border-border shrink-0 overflow-x-auto scrollbar-none">
      {TABS.map(({ key, label, icon: Icon }) => {
        const requiresInstance = instanceTabs.includes(key);
        const disabled = requiresInstance && !conversationId;
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onActivate(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 h-8 text-xs whitespace-nowrap transition-colors shrink-0 border-b-2 -mb-px",
              isActive
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
              disabled && "opacity-30 cursor-not-allowed",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Window inner ─────────────────────────────────────────────────────────────

function AgentDebugWindowInner({
  onClose,
  initialAgentId,
  initialConversationId,
}: {
  onClose: () => void;
  initialAgentId: string | null;
  initialConversationId: string | null;
}) {
  const allAgents = useAppSelector(selectAllAgentsArray);
  const allConversationIds = useAppSelector(selectAllConversationIds);

  // Find the first agent that has instances, or just the first agent
  const firstAgentWithInstance = useAppSelector((state) => {
    for (const cid of allConversationIds) {
      const inst = selectInstance(cid)(state);
      if (inst?.agentId) return inst.agentId;
    }
    return allAgents[0]?.id ?? null;
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    initialAgentId ?? firstAgentWithInstance,
  );
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(initialConversationId ?? allConversationIds[0] ?? null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const handleSelectAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedConversationId(null);
    setActiveTab("overview");
  }, []);

  const handleSelectInstance = useCallback(
    (agentId: string, conversationId: string) => {
      setSelectedAgentId(agentId);
      setSelectedConversationId(conversationId);
      setActiveTab("overview");
    },
    [],
  );

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      initialAgentId: selectedAgentId,
      initialConversationId: selectedConversationId,
    }),
    [selectedAgentId, selectedConversationId],
  );

  const agentName = useAppSelector(
    selectedAgentId
      ? (s) => selectAgentById(s, selectedAgentId)?.name
      : () => undefined,
  );

  const title = selectedConversationId
    ? `${agentName ?? "Agent"} — ${selectedConversationId.slice(0, 8)}…`
    : (agentName ?? "Agent Debug");

  return (
    <WindowPanel
      id="agent-debug-window"
      title={title}
      onClose={onClose}
      width={1020}
      height={680}
      minWidth={640}
      minHeight={420}
      overlayId="agentDebugWindow"
      onCollectData={collectData}
      sidebar={
        <AgentDebugSidebar
          selectedAgentId={selectedAgentId}
          selectedConversationId={selectedConversationId}
          onSelectAgent={handleSelectAgent}
          onSelectInstance={handleSelectInstance}
        />
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      defaultSidebarOpen
    >
      {selectedAgentId ? (
        <div className="flex flex-col h-full min-h-0">
          <AgentDebugTabBar
            activeTab={activeTab}
            onActivate={setActiveTab}
            conversationId={selectedConversationId}
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "overview" && (
              <OverviewTab
                agentId={selectedAgentId}
                conversationId={selectedConversationId}
              />
            )}
            {activeTab === "definition" && (
              <DefinitionTab agentId={selectedAgentId} />
            )}
            {activeTab === "instances" && (
              <InstancesTab
                agentId={selectedAgentId}
                conversationId={selectedConversationId}
              />
            )}
            {activeTab === "variables" && (
              <VariablesTab conversationId={selectedConversationId} />
            )}
            {activeTab === "input" && (
              <UserInputTab conversationId={selectedConversationId} />
            )}
            {activeTab === "uistate" && (
              <UIStateTab conversationId={selectedConversationId} />
            )}
            {activeTab === "history" && (
              <HistoryTab conversationId={selectedConversationId} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <Cpu className="h-10 w-10 opacity-15" />
          <p className="text-sm font-medium text-foreground">
            No agent selected
          </p>
          <p className="text-xs opacity-60">
            Select an agent from the sidebar to inspect.
          </p>
        </div>
      )}
    </WindowPanel>
  );
}

// ─── Window shell ─────────────────────────────────────────────────────────────

interface AgentDebugWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentId?: string | null;
  initialConversationId?: string | null;
}

export default function AgentDebugWindow({
  isOpen,
  onClose,
  initialAgentId,
  initialConversationId,
}: AgentDebugWindowProps) {
  if (!isOpen) return null;
  return (
    <AgentDebugWindowInner
      onClose={onClose}
      initialAgentId={initialAgentId ?? null}
      initialConversationId={initialConversationId ?? null}
    />
  );
}
