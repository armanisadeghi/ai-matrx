"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { shallowEqual } from "react-redux";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { setDebugSession } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import {
  selectConversationRequestCount,
  selectConversationRequestIds,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Check,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  AlertTriangle,
  CircleDot,
  FileText,
  Wrench,
  Database,
  Radio,
  Heart,
  Square,
  Layers,
  Activity,
  BarChart3,
  Brain,
  Info,
  ShieldAlert,
  BookmarkPlus,
  RefreshCw,
  FilePlus2,
  ListChecks,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import type {
  ActiveRequest,
  TimelineEntry,
  ClientMetrics,
  ToolLifecycleEntry,
  RawStreamEvent,
} from "@/features/agents/types/request.types";
import type {
  Phase,
  RenderBlockPayload,
  CompletionPayload,
} from "@/types/python-generated/stream-events";
import type { InstanceStatus } from "@/features/agents/types/instance.types";

const DEBUG_PANEL_SHELL =
  "flex flex-col flex-1 min-h-0 h-full w-full bg-background text-foreground";

/** Scrollable tab body — parent must be a bounded flex column. */
function DebugTabScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <ScrollArea className="flex-1 min-h-0">{children}</ScrollArea>
    </div>
  );
}

// =============================================================================
// Utilities
// =============================================================================

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };
  return { copied, copy };
}

function CopyBtn({
  text,
  id,
  className,
}: {
  text: string;
  id: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy(text, id);
      }}
      className={cn(
        "p-0.5 text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
    >
      {copied === id ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

/** Timeline toolbar: same pill pattern as kind filters (colored) / auto-scroll ON.
 * LeadingIcon distinguishes projection-only vs timeline+raw pairs (merged export). */
function TimelineCopyChip({
  id,
  text,
  label,
  tooltip,
  toneClass,
  LeadingIcon,
}: {
  id: string;
  text: string;
  /** Short label shown on pill */
  label: string;
  tooltip: string;
  toneClass: string;
  /** Default Copy; use FileText = projection, Layers / Radio = fuller payload */
  LeadingIcon?: LucideIcon;
}) {
  const { copied, copy } = useCopy();
  const done = copied === id;
  const Leading = LeadingIcon ?? Copy;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        copy(text, id);
      }}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 h-5 rounded border transition-colors shrink-0 cursor-pointer",
        done ? "bg-green-500/20 text-green-400 border-green-500/30" : toneClass,
      )}
    >
      {done ? (
        <Check className="h-2.5 w-2.5 shrink-0" />
      ) : (
        <Leading className="h-2.5 w-2.5 shrink-0 opacity-90" />
      )}
      <span>{label}</span>
    </button>
  );
}

function JsonView({
  data,
  label,
  id,
  defaultExpanded = true,
}: {
  data: unknown;
  label?: string;
  id: string;
  /** False for very large blobs (e.g. full request dump) so the panel stays scannable. */
  defaultExpanded?: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const json = JSON.stringify(data, null, 2);
  if (data === null || data === undefined) return null;
  const isSimple =
    typeof data === "string" ||
    typeof data === "number" ||
    typeof data === "boolean";

  if (isSimple) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px]">
        {label && <span className="text-muted-foreground">{label}:</span>}
        <code className="text-foreground/80 bg-muted/50 px-1 rounded max-w-[300px] truncate inline-block">
          {String(data)}
        </code>
        <CopyBtn text={String(data)} id={id} />
      </span>
    );
  }

  return (
    <div className="text-[10px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        {open ? (
          <ChevronDown className="h-2.5 w-2.5" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" />
        )}
        {label && <span>{label}</span>}
        {!open && (
          <span className="text-muted-foreground/60 ml-1">
            {json.length > 100 ? `${json.length} chars` : json.slice(0, 60)}
          </span>
        )}
      </button>
      {open && (
        <div className="relative mt-0.5 ml-2">
          <CopyBtn text={json} id={id} className="absolute top-0 right-0" />
          <pre className="bg-muted/30 border border-border/50 rounded p-1 text-[9px] overflow-x-auto whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto font-mono">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Event type styling
// =============================================================================

const EVENT_COLORS: Record<string, string> = {
  chunk: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  reasoning_chunk: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  phase: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  init: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  info: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  data: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  completion: "bg-green-500/20 text-green-400 border-green-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
  tool_event: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  broker: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  heartbeat: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  end: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  render_block: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  record_reserved: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  record_update: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  resource_changed: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30",
  structured_output: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  context_analysis: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  chunk: <FileText className="h-2.5 w-2.5" />,
  reasoning_chunk: <Brain className="h-2.5 w-2.5" />,
  phase: <Activity className="h-2.5 w-2.5" />,
  init: <Zap className="h-2.5 w-2.5" />,
  warning: <ShieldAlert className="h-2.5 w-2.5" />,
  info: <Info className="h-2.5 w-2.5" />,
  data: <Database className="h-2.5 w-2.5" />,
  completion: <BarChart3 className="h-2.5 w-2.5" />,
  error: <AlertTriangle className="h-2.5 w-2.5" />,
  tool_event: <Wrench className="h-2.5 w-2.5" />,
  broker: <Radio className="h-2.5 w-2.5" />,
  heartbeat: <Heart className="h-2.5 w-2.5" />,
  end: <Square className="h-2.5 w-2.5" />,
  render_block: <Layers className="h-2.5 w-2.5" />,
  record_reserved: <BookmarkPlus className="h-2.5 w-2.5" />,
  record_update: <RefreshCw className="h-2.5 w-2.5" />,
  resource_changed: <FilePlus2 className="h-2.5 w-2.5" />,
  structured_output: <ListChecks className="h-2.5 w-2.5" />,
  context_analysis: <ScanSearch className="h-2.5 w-2.5" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-400",
  connecting: "bg-yellow-500/20 text-yellow-400",
  streaming: "bg-blue-500/20 text-blue-400",
  "awaiting-tools": "bg-orange-500/20 text-orange-400",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  timeout: "bg-red-500/20 text-red-400",
};

const INSTANCE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  ready: "bg-cyan-500/20 text-cyan-400",
  running: "bg-yellow-500/20 text-yellow-400",
  streaming: "bg-blue-500/20 text-blue-400",
  paused: "bg-orange-500/20 text-orange-400",
  complete: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
};

// =============================================================================
// Sub-components
// =============================================================================

function StatusBar({
  request,
  instanceStatus,
}: {
  request: ActiveRequest;
  instanceStatus?: InstanceStatus;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-2 py-1.5 border-b border-border/50 bg-muted/20">
      <span className="text-[10px] text-muted-foreground font-mono">REQ</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 font-mono",
          STATUS_COLORS[request.status] ?? "",
        )}
      >
        {request.status}
      </Badge>
      {instanceStatus && (
        <>
          <span className="text-[10px] text-muted-foreground font-mono">
            INST
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 font-mono",
              INSTANCE_STATUS_COLORS[instanceStatus] ?? "",
            )}
          >
            {instanceStatus}
          </Badge>
        </>
      )}
      {request.currentPhase && (
        <>
          <span className="text-[10px] text-muted-foreground">|</span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 bg-yellow-500/10 text-yellow-400"
          >
            {request.currentPhase}
          </Badge>
        </>
      )}
      {request.error && (
        <>
          <span className="text-[10px] text-muted-foreground">|</span>
          <Badge
            variant="destructive"
            className="text-[10px] px-1.5 py-0 h-5 max-w-[60ch] truncate"
            title={[
              `error_type: ${request.error.error_type}`,
              request.error.code ? `code: ${request.error.code}` : null,
              `message: ${request.error.message}`,
              request.error.user_message
                ? `user_message: ${request.error.user_message}`
                : null,
            ]
              .filter(Boolean)
              .join("\n")}
          >
            {`ERR [${request.error.error_type}${
              request.error.code ? `:${request.error.code}` : ""
            }]: ${request.error.message}`.slice(0, 80)}
          </Badge>
        </>
      )}
      {request.conversationId && (
        <span className="text-[10px] text-muted-foreground font-mono ml-auto flex items-center gap-0.5">
          conv: {request.conversationId.slice(0, 8)}...
          <CopyBtn text={request.conversationId} id="conv-id" />
        </span>
      )}
    </div>
  );
}

function MetricsBar({ metrics }: { metrics: ClientMetrics }) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-2 py-1 border-b border-border/50 bg-muted/10 text-[10px]">
      <span className="flex items-center gap-0.5 text-muted-foreground">
        <Clock className="h-3 w-3" /> TTFT:
      </span>
      <span className="font-mono text-foreground/80">
        {metrics.ttftMs !== null ? `${metrics.ttftMs.toFixed(0)}ms` : "—"}
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span className="text-muted-foreground">Stream:</span>
      <span className="font-mono text-foreground/80">
        {metrics.streamDurationMs !== null
          ? `${(metrics.streamDurationMs / 1000).toFixed(2)}s`
          : "—"}
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span className="text-muted-foreground">Total:</span>
      <span className="font-mono text-foreground/80">
        {metrics.totalClientDurationMs !== null
          ? `${(metrics.totalClientDurationMs / 1000).toFixed(2)}s`
          : "—"}
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span className="text-muted-foreground">Events:</span>
      <span className="font-mono text-foreground/80">
        {metrics.totalEvents}
      </span>
      <span className="text-[9px] text-muted-foreground/60">
        (chunk:{metrics.chunkEvents}
        {metrics.reasoningChunkEvents > 0 &&
          ` reason:${metrics.reasoningChunkEvents}`}{" "}
        phase:{metrics.phaseEvents}
        {metrics.initEvents > 0 && ` init:${metrics.initEvents}`}
        {metrics.completionEvents > 0 && ` comp:${metrics.completionEvents}`}
        {metrics.warningEvents > 0 && ` warn:${metrics.warningEvents}`}
        {metrics.infoEvents > 0 && ` info:${metrics.infoEvents}`} tool:
        {metrics.toolEvents} data:{metrics.dataEvents} block:
        {metrics.renderBlockEvents}
        {metrics.recordReservedEvents > 0 &&
          ` reserved:${metrics.recordReservedEvents}`}
        {metrics.recordUpdateEvents > 0 &&
          ` updated:${metrics.recordUpdateEvents}`}
        {metrics.resourceChangedEvents > 0 &&
          ` fs:${metrics.resourceChangedEvents}`}{" "}
        other:{metrics.otherEvents})
      </span>
    </div>
  );
}

function getTimelineColor(kind: TimelineEntry["kind"]): string {
  const map: Record<string, string> = {
    text_start: EVENT_COLORS.chunk,
    text_end: EVENT_COLORS.chunk,
    reasoning_start: EVENT_COLORS.reasoning_chunk,
    reasoning_end: EVENT_COLORS.reasoning_chunk,
    phase: EVENT_COLORS.phase,
    init: EVENT_COLORS.init,
    warning: EVENT_COLORS.warning,
    info: EVENT_COLORS.info,
    tool_event: EVENT_COLORS.tool_event,
    render_block: EVENT_COLORS.render_block,
    data: EVENT_COLORS.data,
    completion: EVENT_COLORS.completion,
    error: EVENT_COLORS.error,
    end: EVENT_COLORS.end,
    broker: EVENT_COLORS.broker,
    heartbeat: EVENT_COLORS.heartbeat,
    record_reserved: EVENT_COLORS.record_reserved,
    record_update: EVENT_COLORS.record_update,
    resource_changed: EVENT_COLORS.resource_changed,
    structured_output: EVENT_COLORS.structured_output,
    unknown: "bg-red-600/30 text-red-300 border-red-500/50 font-semibold",
  };
  return map[kind] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

function getTimelineIcon(kind: TimelineEntry["kind"]): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    text_start: EVENT_ICONS.chunk,
    text_end: EVENT_ICONS.chunk,
    reasoning_start: EVENT_ICONS.reasoning_chunk,
    reasoning_end: EVENT_ICONS.reasoning_chunk,
    phase: EVENT_ICONS.phase,
    init: EVENT_ICONS.init,
    warning: EVENT_ICONS.warning,
    info: EVENT_ICONS.info,
    tool_event: EVENT_ICONS.tool_event,
    render_block: EVENT_ICONS.render_block,
    data: EVENT_ICONS.data,
    completion: EVENT_ICONS.completion,
    error: EVENT_ICONS.error,
    end: EVENT_ICONS.end,
    broker: EVENT_ICONS.broker,
    heartbeat: EVENT_ICONS.heartbeat,
    record_reserved: EVENT_ICONS.record_reserved,
    record_update: EVENT_ICONS.record_update,
    resource_changed: EVENT_ICONS.resource_changed,
    structured_output: EVENT_ICONS.structured_output,
    unknown: <AlertTriangle className="h-2.5 w-2.5" />,
  };
  return map[kind] ?? <CircleDot className="h-2.5 w-2.5" />;
}

function timelineSummary(
  entry: TimelineEntry,
  renderBlocks: Record<
    string,
    import("@/types/python-generated/stream-events").RenderBlockPayload
  >,
  renderBlockOrder: string[],
  reasoningChunks?: string[],
): string {
  // Backend-mirrored variants: read fields off `entry.data` (snake_case as
  // emitted by the Python backend, see types/python-generated/stream-events.ts).
  // Client-derived variants (text_start/end, reasoning_start/end, unknown)
  // keep their custom shape — they are coalesced from chunk events on the
  // client and have no backend equivalent.
  switch (entry.kind) {
    case "text_start":
      return `text streaming started (block idx ${entry.blockStartIndex})`;
    case "text_end": {
      const blockSlice = renderBlockOrder
        .slice(entry.blockStartIndex, entry.blockEndIndex)
        .map((id) => renderBlocks[id]?.content ?? "")
        .join("");
      const preview =
        blockSlice.length > 80 ? blockSlice.slice(0, 80) + "..." : blockSlice;
      return `${entry.blockCount} blocks: "${preview}"`;
    }
    case "reasoning_start":
      return `reasoning started (chunk idx ${entry.chunkStartIndex})`;
    case "reasoning_end": {
      const rSlice = (reasoningChunks ?? [])
        .slice(entry.chunkStartIndex, entry.chunkEndIndex)
        .join("");
      const rPreview =
        rSlice.length > 80 ? rSlice.slice(0, 80) + "..." : rSlice;
      return `${entry.chunkCount} reasoning chunks: "${rPreview}"`;
    }
    case "phase":
      return `Phase → ${entry.data.phase}`;
    case "init":
      return `Init: ${entry.data.operation} (${entry.data.operation_id.slice(0, 8)}…)`;
    case "warning": {
      const w = entry.data;
      const recoverableTag = w.recoverable === false ? " UNRECOVERABLE" : "";
      const level = w.level ?? "medium";
      const messages: string[] = [];
      messages.push(w.system_message);
      if (w.user_message) messages.push(`(user: ${w.user_message})`);
      return `[${w.code}] ${level}${recoverableTag}: ${messages.join(" ")}`;
    }
    case "info": {
      const i = entry.data;
      const messages: string[] = [];
      messages.push(i.system_message);
      if (i.user_message) messages.push(`(user: ${i.user_message})`);
      const base = `[${i.code}] ${messages.join(" ")}`;
      if (i.metadata && Object.keys(i.metadata).length > 0) {
        return `${base} · ${JSON.stringify(i.metadata).slice(0, 60)}`;
      }
      return base;
    }
    case "tool_event":
      return `${entry.data.event} — ${entry.data.tool_name} (${entry.data.call_id.slice(0, 8)})`;
    case "render_block":
      return `${entry.data.type} [${entry.data.status}] ${entry.data.blockId.slice(0, 8)}`;
    case "data":
      return JSON.stringify(entry.data).slice(0, 80);
    case "completion":
      return `Completion: ${entry.data.operation} → ${entry.data.status} (${entry.data.operation_id.slice(0, 8)}…)`;
    case "error": {
      // The backend has no `is_fatal` field — error events ARE fatal by
      // definition (the stream is killed). We surface BOTH `message`
      // (technical) and `user_message` (human-friendly) so debug never
      // hides what the backend actually said.
      const e = entry.data;
      const codePart = e.code ? ` [${e.code}]` : "";
      const sys = e.message;
      const usr = e.user_message ? ` · user: ${e.user_message}` : "";
      return `ERR [${e.error_type}]${codePart}: ${sys.slice(0, 80)}${usr.slice(0, 80)}`;
    }
    case "end":
      return entry.data.reason ?? "stream ended";
    case "broker":
      return `broker: ${entry.data.broker_id}`;
    case "heartbeat":
      return entry.data.timestamp != null
        ? `heartbeat @ ${entry.data.timestamp}`
        : "heartbeat";
    case "record_reserved": {
      const r = entry.data;
      const short = `${r.record_id.slice(0, 8)}…`;
      if (r.table === "cx_message") {
        const role = r.metadata?.role ?? "?";
        const pos = r.metadata?.position ?? "?";
        return `cx_message reserved [${role} #${pos}]: ${short}`;
      }
      if (r.table === "cx_request") {
        const iter = r.metadata?.iteration ?? "?";
        return `cx_request reserved [iter ${iter}]: ${short}`;
      }
      if (r.table === "cx_tool_call") {
        const tool = r.metadata?.tool_name ?? "?";
        const iter = r.metadata?.iteration ?? "?";
        return `cx_tool_call reserved [${tool}, iter ${iter}]: ${short}`;
      }
      return `${r.table} reserved: ${short} [${r.db_project}]`;
    }
    case "record_update":
      return `${entry.data.table} → ${entry.data.status}: ${entry.data.record_id.slice(0, 8)}…`;
    case "resource_changed": {
      const r = entry.data;
      const short =
        r.resource_id.length > 48
          ? `…${r.resource_id.slice(-44)}`
          : r.resource_id;
      const tag = r.sandbox_id
        ? `sandbox ${r.sandbox_id.slice(0, 6)}…`
        : "global";
      return `${r.kind} ${r.action} [${tag}]: ${short}`;
    }
    case "structured_output": {
      const so = entry.data;
      const status = so.success ? "✓" : `✗ ${so.reason ?? "failed"}`;
      const schema = so.schema_name ? ` [${so.schema_name}]` : "";
      const count =
        so.match_count != null ? ` · ${so.match_count} match(es)` : "";
      return `${status}${schema}${count}`;
    }
    case "unknown":
      return `UNRECOGNIZED (${entry.originalEvent}): ${JSON.stringify(entry.rawData).slice(0, 100)}`;
    default:
      return "";
  }
}

function TimelineRow({
  entry,
  baseTime,
  renderBlocks,
  renderBlockOrder,
  reasoningChunks,
  forceExpanded = false,
  rawEvent,
}: {
  entry: TimelineEntry;
  baseTime: number;
  renderBlocks: Record<
    string,
    import("@/types/python-generated/stream-events").RenderBlockPayload
  >;
  renderBlockOrder: string[];
  reasoningChunks?: string[];
  forceExpanded?: boolean;
  /** Matching raw stream event (by timestamp) — included in copy payload. */
  rawEvent?: RawStreamEvent;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded || localExpanded;
  const relativeMs = entry.timestamp - baseTime;
  const colorClass = getTimelineColor(entry.kind);
  const icon = getTimelineIcon(entry.kind);
  // Copy payload includes the full raw event (with every server field) alongside
  // the timeline projection, so consumers never lose information.
  const copyPayload = rawEvent ? { timeline: entry, raw: rawEvent } : entry;
  const json = JSON.stringify(copyPayload, null, 2);
  const summary = timelineSummary(
    entry,
    renderBlocks,
    renderBlockOrder,
    reasoningChunks,
  );

  return (
    <div
      className={cn(
        "border-b border-border/20 hover:bg-muted/20 transition-colors",
        expanded && "bg-muted/10",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setLocalExpanded(!localExpanded)}
        onKeyDown={(e) =>
          e.key === "Enter" || e.key === " "
            ? setLocalExpanded(!localExpanded)
            : undefined
        }
        className="w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer"
      >
        <span className="text-[10px] font-mono text-muted-foreground/60 w-7 shrink-0 text-right">
          {entry.seq}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/80 w-16 shrink-0 text-right">
          {relativeMs.toFixed(0)}ms
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0 border",
            colorClass,
          )}
        >
          {icon}
          {entry.kind}
        </Badge>
        {entry.kind === "tool_event" && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 shrink-0 border",
              colorClass,
            )}
          >
            {entry.data.event}
          </Badge>
        )}
        <span className="flex-1 text-[10px] text-muted-foreground/60 truncate font-mono">
          {summary}
        </span>
        <CopyBtn text={json} id={`tl-${entry.seq}`} />
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </div>
      {expanded && (
        <div className="px-1.5 pb-1 ml-[90px]">
          {entry.kind === "text_end" && (
            <div className="mb-1">
              <pre className="text-[9px] font-mono bg-muted/30 border border-border/50 rounded p-1 whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                {renderBlockOrder
                  .slice(entry.blockStartIndex, entry.blockEndIndex)
                  .map((id) => renderBlocks[id]?.content ?? "")
                  .join("")}
              </pre>
              <CopyBtn
                text={renderBlockOrder
                  .slice(entry.blockStartIndex, entry.blockEndIndex)
                  .map((id) => renderBlocks[id]?.content ?? "")
                  .join("")}
                id={`tl-text-${entry.seq}`}
              />
            </div>
          )}
          <JsonView data={entry} id={`tl-data-${entry.seq}`} />
        </div>
      )}
    </div>
  );
}

function ToolLifecycleRow({ tool }: { tool: ToolLifecycleEntry }) {
  const statusColor: Record<string, string> = {
    started: "bg-yellow-500/20 text-yellow-400",
    progress: "bg-blue-500/20 text-blue-400",
    step: "bg-cyan-500/20 text-cyan-400",
    result_preview: "bg-purple-500/20 text-purple-400",
    completed: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="border-b border-border/20 px-1.5 py-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1 py-0 h-4",
            statusColor[tool.status] ?? "",
          )}
        >
          {tool.status}
        </Badge>
        <span className="text-[10px] font-medium text-foreground/80">
          {tool.toolName}
        </span>
        <span className="text-[8px] font-mono text-muted-foreground/60">
          {tool.callId.slice(0, 12)}
        </span>
        {tool.isDelegated && (
          <Badge
            variant="outline"
            className="text-[8px] px-0.5 py-0 h-3 bg-orange-500/10 text-orange-400"
          >
            delegated
          </Badge>
        )}
        <CopyBtn
          text={JSON.stringify(tool, null, 2)}
          id={`tool-${tool.callId}`}
          className="ml-auto"
        />
      </div>
      {tool.latestMessage && (
        <p className="text-[9px] text-muted-foreground ml-2 mt-0.5">
          {tool.latestMessage}
        </p>
      )}
      {tool.arguments && Object.keys(tool.arguments).length > 0 && (
        <JsonView
          data={tool.arguments}
          label="args"
          id={`tool-args-${tool.callId}`}
        />
      )}
      {tool.result !== null && (
        <JsonView
          data={tool.result}
          label="result"
          id={`tool-result-${tool.callId}`}
        />
      )}
      {tool.resultPreview && (
        <div className="text-[9px] text-muted-foreground ml-2">
          Preview: {tool.resultPreview}
        </div>
      )}
      {tool.errorMessage && (
        <div className="text-[9px] text-red-400 ml-2">
          {tool.errorType}: {tool.errorMessage}
        </div>
      )}
    </div>
  );
}

function ContentBlockRow({ block }: { block: RenderBlockPayload }) {
  const statusColor: Record<string, string> = {
    streaming: "bg-blue-500/20 text-blue-400",
    complete: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="border-b border-border/20 px-1.5 py-0.5">
      <div className="flex items-center gap-1">
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1 py-0 h-4",
            statusColor[block.status] ?? "",
          )}
        >
          {block.status}
        </Badge>
        <span className="text-[10px] font-medium text-foreground/80">
          {block.type}
        </span>
        <span className="text-[8px] font-mono text-muted-foreground/60">
          #{block.blockIndex} {block.blockId.slice(0, 12)}
        </span>
        <CopyBtn
          text={JSON.stringify(block, null, 2)}
          id={`block-${block.blockId}`}
          className="ml-auto"
        />
      </div>
      {block.content && (
        <pre className="text-[9px] text-muted-foreground ml-2 mt-0.5 whitespace-pre-wrap break-all max-h-[100px] overflow-y-auto font-mono">
          {block.content}
        </pre>
      )}
      {block.data && (
        <JsonView
          data={block.data}
          label="data"
          id={`block-data-${block.blockId}`}
        />
      )}
      {block.metadata && (
        <JsonView
          data={block.metadata}
          label="meta"
          id={`block-meta-${block.blockId}`}
        />
      )}
    </div>
  );
}

function PhaseHistoryRow({ phase, idx }: { phase: Phase; idx: number }) {
  return (
    <div className="border-b border-border/20 px-1.5 py-0.5 flex items-center gap-1">
      <span className="text-[9px] font-mono text-muted-foreground/60 w-4 text-right">
        {idx + 1}
      </span>
      <Badge
        variant="outline"
        className="text-[9px] px-1 py-0 h-4 bg-yellow-500/10 text-yellow-400"
      >
        {phase}
      </Badge>
      <CopyBtn text={phase} id={`phase-${idx}`} className="ml-auto" />
    </div>
  );
}

// =============================================================================
// Filter Bar
// =============================================================================

const ALL_TIMELINE_KINDS: TimelineEntry["kind"][] = [
  "text_start",
  "text_end",
  "reasoning_start",
  "reasoning_end",
  "phase",
  "init",
  "warning",
  "info",
  "tool_event",
  "render_block",
  "data",
  "completion",
  "error",
  "end",
  "broker",
  "heartbeat",
  "record_reserved",
  "record_update",
  "resource_changed",
  "unknown",
];

function TimelineFilterBar({
  activeFilters,
  onToggle,
  counts,
}: {
  activeFilters: Set<string>;
  onToggle: (kind: string) => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap px-2 py-1 border-b border-border/50 shrink-0">
      <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
      {ALL_TIMELINE_KINDS.map((kind) => {
        const active = activeFilters.has(kind);
        const count = counts[kind] ?? 0;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onToggle(kind)}
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0 h-5 rounded border transition-colors",
              active
                ? getTimelineColor(kind)
                : "bg-muted/20 text-muted-foreground/40 border-transparent hover:border-border/50",
            )}
          >
            {getTimelineIcon(kind)}
            {kind.replace("_", " ")}
            {count > 0 && <span className="font-mono ml-0.5">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Tab Content Components
// =============================================================================

function TimelineTab({ request }: { request: ActiveRequest }) {
  const [filters, setFilters] = useState<Set<string>>(
    new Set(ALL_TIMELINE_KINDS),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [allExpanded, setAllExpanded] = useState(false);
  const prevLengthRef = useRef(0);

  const counts: Record<string, number> = {};
  for (const entry of request.timeline) {
    counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  }

  // Map raw events by timestamp so a TimelineRow can attach the full raw
  // payload (which preserves every field the server emitted) to its copy
  // action. Collisions are rare — the raw event carries an `idx` disambiguator.
  const rawByTimestamp = useMemo(() => {
    const map = new Map<number, RawStreamEvent>();
    for (const raw of request.rawEvents) {
      map.set(raw.timestamp, raw);
    }
    return map;
  }, [request.rawEvents]);

  const filtered = request.timeline.filter((e) => filters.has(e.kind));
  const baseTime =
    request.timeline.length > 0 ? request.timeline[0].timestamp : 0;

  const timelineWithRawPairs = (entries: TimelineEntry[]) =>
    entries.map((entry) => {
      const raw = rawByTimestamp.get(entry.timestamp);
      return raw ? { timeline: entry, raw } : entry;
    });

  const toggleFilter = (kind: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  useEffect(() => {
    if (
      autoScroll &&
      filtered.length > prevLengthRef.current &&
      scrollRef.current
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLengthRef.current = filtered.length;
  }, [filtered.length, autoScroll]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <TimelineFilterBar
        activeFilters={filters}
        onToggle={toggleFilter}
        counts={counts}
      />
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 border-b border-border/30 text-[10px] text-muted-foreground flex-wrap">
        <span>
          {filtered.length} of {request.timeline.length} entries
        </span>
        {request.isTextStreaming && (
          <Badge
            variant="outline"
            className="text-[9px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-400 animate-pulse"
          >
            STREAMING TEXT
          </Badge>
        )}
        <button
          type="button"
          onClick={() => setAllExpanded(!allExpanded)}
          className={cn(
            "ml-auto px-1.5 py-0 h-5 rounded text-[10px] border",
            allExpanded
              ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
              : "bg-muted/20 text-muted-foreground border-transparent hover:border-border/50",
          )}
        >
          {allExpanded ? "collapse all" : "expand all"}
        </button>
        <button
          type="button"
          onClick={() => setAutoScroll(!autoScroll)}
          className={cn(
            "px-1.5 py-0 h-5 rounded text-[10px] border",
            autoScroll
              ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
              : "bg-muted/20 text-muted-foreground border-transparent",
          )}
        >
          auto-scroll {autoScroll ? "ON" : "OFF"}
        </button>
        <div className="flex items-center gap-1 shrink-0 flex-wrap border-l border-border/40 pl-1.5 ml-1">
          <TimelineCopyChip
            id="full-timeline-proj"
            label="all · tl"
            tooltip="Copy full timeline (projection only — TimelineEntry[])"
            LeadingIcon={FileText}
            toneClass="bg-sky-500/20 text-sky-400 border-sky-500/30"
            text={JSON.stringify(request.timeline, null, 2)}
          />
          <TimelineCopyChip
            id="full-timeline-paired"
            label="all · +raw"
            tooltip="Copy full timeline with paired raw stream rows per timestamp (where available)"
            LeadingIcon={Layers}
            toneClass="bg-sky-500/20 text-sky-400 border-sky-500/30"
            text={JSON.stringify(
              timelineWithRawPairs(request.timeline),
              null,
              2,
            )}
          />
          <span
            aria-hidden
            className="w-px h-4 shrink-0 bg-border/45 self-center"
          />
          <TimelineCopyChip
            id="filtered-timeline-proj"
            label="view · tl"
            tooltip="Copy filtered/visible timeline projection only (TimelineEntry[])"
            LeadingIcon={FileText}
            toneClass="bg-violet-500/20 text-violet-400 border-violet-500/30"
            text={JSON.stringify(filtered, null, 2)}
          />
          <TimelineCopyChip
            id="filtered-timeline-paired"
            label="view · +raw"
            tooltip="Copy filtered timeline rows paired with matching raw stream events"
            LeadingIcon={Layers}
            toneClass="bg-violet-500/20 text-violet-400 border-violet-500/30"
            text={JSON.stringify(timelineWithRawPairs(filtered), null, 2)}
          />
          <span
            aria-hidden
            className="w-px h-4 shrink-0 bg-border/45 self-center"
          />
          <TimelineCopyChip
            id="all-raw-events"
            label="raw · dump"
            tooltip="Copy full rawEvents array (unedited stream capture)"
            LeadingIcon={Radio}
            toneClass="bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
            text={JSON.stringify(request.rawEvents, null, 2)}
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-2"
      >
        {filtered.map((entry, idx) => (
          <TimelineRow
            key={`${entry.seq}-${idx}`}
            entry={entry}
            baseTime={baseTime}
            renderBlocks={request.renderBlocks}
            renderBlockOrder={request.renderBlockOrder}
            reasoningChunks={request.reasoningChunks}
            forceExpanded={allExpanded}
            rawEvent={rawByTimestamp.get(entry.timestamp)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-[11px] text-muted-foreground/60 text-center py-4">
            {request.timeline.length === 0
              ? "No events yet — waiting for stream..."
              : "No entries match current filters"}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolsTab({ request }: { request: ActiveRequest }) {
  const tools = Object.values(request.toolLifecycle);
  return (
    <DebugTabScroll>
      {tools.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
          No tool events
        </div>
      )}
      {tools.map((tool) => (
        <ToolLifecycleRow key={tool.callId} tool={tool} />
      ))}
      {request.pendingToolCalls.length > 0 && (
        <div className="px-1.5 py-1 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground font-medium">
            Pending Tool Calls ({request.pendingToolCalls.length})
          </span>
          {request.pendingToolCalls.map((tc) => (
            <div
              key={tc.callId}
              className="flex items-center gap-1 ml-2 text-[9px]"
            >
              <Badge
                variant="outline"
                className={cn(
                  "text-[8px] px-0.5 py-0 h-3",
                  tc.resolved
                    ? "bg-green-500/10 text-green-400"
                    : "bg-orange-500/10 text-orange-400",
                )}
              >
                {tc.resolved ? "resolved" : "pending"}
              </Badge>
              <span className="font-mono text-muted-foreground/60">
                {tc.callId.slice(0, 12)}
              </span>
              <span className="text-foreground/80">{tc.toolName}</span>
              <CopyBtn
                text={JSON.stringify(tc, null, 2)}
                id={`ptc-${tc.callId}`}
              />
            </div>
          ))}
        </div>
      )}
    </DebugTabScroll>
  );
}

function StatusTab({ request }: { request: ActiveRequest }) {
  return (
    <DebugTabScroll>
      <div className="px-1.5 py-1 border-b border-border/30">
        <span className="text-[9px] text-muted-foreground font-medium">
          Current Phase
        </span>
        {request.currentPhase ? (
          <div className="ml-2">
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4 bg-yellow-500/10 text-yellow-400"
            >
              {request.currentPhase}
            </Badge>
          </div>
        ) : (
          <div className="text-[9px] text-muted-foreground/50 ml-2">
            No phase updates received
          </div>
        )}
      </div>
      <div className="px-1.5 py-0.5">
        <span className="text-[9px] text-muted-foreground font-medium">
          History ({request.phaseHistory.length})
        </span>
      </div>
      {request.phaseHistory.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
          No phase updates
        </div>
      )}
      {request.phaseHistory.map((phase, idx) => (
        <PhaseHistoryRow key={idx} phase={phase} idx={idx} />
      ))}
    </DebugTabScroll>
  );
}

function BlocksTab({ request }: { request: ActiveRequest }) {
  const blocks = request.renderBlockOrder
    .map((id) => request.renderBlocks[id])
    .filter(Boolean) as RenderBlockPayload[];
  return (
    <DebugTabScroll>
      {blocks.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
          No content blocks
        </div>
      )}
      {blocks.map((block) => (
        <ContentBlockRow key={block.blockId} block={block} />
      ))}
    </DebugTabScroll>
  );
}

function TextTab({ request }: { request: ActiveRequest }) {
  const text = request.renderBlockOrder
    .map((id) => request.renderBlocks[id]?.content ?? "")
    .join("\n");
  const reasoning =
    request.reasoningChunks.length > 0
      ? request.reasoningChunks.join("")
      : request.accumulatedReasoning;
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex shrink-0 items-center gap-1 px-1.5 py-0.5 border-b border-border/30 text-[9px] text-muted-foreground">
        <span>{request.chunkCount} chunks</span>
        <span className="text-muted-foreground/40">|</span>
        <span>{new TextEncoder().encode(text).length} bytes</span>
        {request.reasoningChunks.length > 0 && (
          <>
            <span className="text-muted-foreground/40">|</span>
            <span className="text-violet-400">
              {request.reasoningChunks.length} reasoning chunks
            </span>
          </>
        )}
        <CopyBtn text={text} id="full-text" className="ml-auto" />
      </div>
      {reasoning && (
        <div className="border-b border-border/30">
          <div className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-violet-400/80 bg-violet-500/5">
            <Brain className="h-2.5 w-2.5" />
            <span>Reasoning ({request.reasoningChunks.length} chunks)</span>
            <CopyBtn text={reasoning} id="full-reasoning" className="ml-auto" />
          </div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-all p-1.5 text-violet-400/70 max-h-40 overflow-y-auto">
            {reasoning}
          </pre>
        </div>
      )}
      <ScrollArea className="flex-1 min-h-0">
        <pre className="text-[10px] font-mono whitespace-pre-wrap break-all p-1.5 text-foreground/80">
          {text || (
            <span className="text-muted-foreground/40 italic">
              No text yet...
            </span>
          )}
        </pre>
      </ScrollArea>
    </div>
  );
}

function DataTab({ request }: { request: ActiveRequest }) {
  return (
    <DebugTabScroll>
      <div className="px-1.5 py-0.5 border-b border-border/30 text-[9px] text-muted-foreground">
        {request.dataPayloads.length} data payloads
        <CopyBtn
          text={JSON.stringify(request.dataPayloads, null, 2)}
          id="all-data"
          className="ml-1"
        />
      </div>
      {request.dataPayloads.length === 0 && (
        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
          No data events
        </div>
      )}
      {request.dataPayloads.map((payload, idx) => (
        <div key={idx} className="border-b border-border/20 px-1.5 py-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono text-muted-foreground/60">
              {idx + 1}
            </span>
            <CopyBtn
              text={JSON.stringify(payload, null, 2)}
              id={`data-${idx}`}
            />
          </div>
          <JsonView data={payload} id={`data-body-${idx}`} />
        </div>
      ))}
    </DebugTabScroll>
  );
}

function CompletionTab({ request }: { request: ActiveRequest }) {
  return (
    <DebugTabScroll>
      {request.completion ? (
        <div className="p-1.5">
          <JsonView
            data={request.completion}
            label="Completion"
            id="completion"
          />
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground/60 text-center py-4">
          No completion event received
        </div>
      )}
      {request.clientMetrics && (
        <div className="p-1.5 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground font-medium">
            Client Metrics
          </span>
          <JsonView data={request.clientMetrics} id="client-metrics" />
        </div>
      )}
      {request.warnings.length > 0 && (
        <div className="p-1.5 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground font-medium">
            Warnings ({request.warnings.length})
          </span>
          <JsonView data={request.warnings} id="warnings" />
        </div>
      )}
      {request.infoEvents.length > 0 && (
        <div className="p-1.5 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground font-medium">
            Info Events ({request.infoEvents.length})
          </span>
          <JsonView data={request.infoEvents} id="info-events" />
        </div>
      )}
      {Object.keys(request.reservations).length > 0 && (
        <div className="p-1.5 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground font-medium">
            Record Reservations ({Object.keys(request.reservations).length})
          </span>
          <JsonView data={request.reservations} id="reservations" />
        </div>
      )}
      {Object.keys(request.completedOperations).length > 0 && (
        <div className="p-1.5 border-t border-border/30">
          <div className="text-[10px] text-sky-400 font-medium flex items-center gap-1">
            <Zap className="h-2.5 w-2.5" /> Completed Operations (
            {Object.keys(request.completedOperations).length})
          </div>
          <JsonView data={request.completedOperations} id="completed-ops" />
        </div>
      )}
    </DebugTabScroll>
  );
}

function StateSnapshotTab({
  request,
  instanceStatus,
}: {
  request: ActiveRequest;
  instanceStatus?: InstanceStatus;
}) {
  return (
    <DebugTabScroll>
      <div className="p-1.5 space-y-1">
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            requestId:
          </span>
          <code className="font-mono text-foreground/80">
            {request.requestId}
          </code>
          <CopyBtn text={request.requestId} id="req-id" />
        </div>
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            conversationId:
          </span>
          <code className="font-mono text-foreground/80">
            {request.conversationId}
          </code>
          <CopyBtn text={request.conversationId} id="conv-id-state" />
        </div>
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            request.status:
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] px-1 py-0 h-4",
              STATUS_COLORS[request.status] ?? "",
            )}
          >
            {request.status}
          </Badge>
        </div>
        {instanceStatus && (
          <div className="flex items-center gap-1 text-[9px]">
            <span className="text-muted-foreground font-medium w-24 shrink-0">
              instance.status:
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1 py-0 h-4",
                INSTANCE_STATUS_COLORS[instanceStatus] ?? "",
              )}
            >
              {instanceStatus}
            </Badge>
          </div>
        )}
        <div className="flex items-start gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            error:
          </span>
          {request.error ? (
            <div className="flex-1 min-w-0">
              <JsonView
                data={request.error}
                id="request-error-payload"
                defaultExpanded
              />
            </div>
          ) : (
            <code className="font-mono text-foreground/80">null</code>
          )}
        </div>
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            startedAt:
          </span>
          <code className="font-mono text-foreground/80">
            {request.startedAt}
          </code>
        </div>
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            firstChunkAt:
          </span>
          <code className="font-mono text-foreground/80">
            {request.firstChunkAt ?? "null"}
          </code>
        </div>
        <div className="flex items-center gap-1 text-[9px]">
          <span className="text-muted-foreground font-medium w-24 shrink-0">
            completedAt:
          </span>
          <code className="font-mono text-foreground/80">
            {request.completedAt ?? "null"}
          </code>
        </div>

        <div className="border-t border-border/30 pt-1 mt-1">
          <span className="text-[9px] text-muted-foreground font-medium">
            Counts
          </span>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 ml-2 text-[9px] mt-0.5">
            <span className="text-muted-foreground">chunkCount:</span>
            <span className="font-mono">{request.chunkCount}</span>
            <span className="text-muted-foreground">reasoningChunks:</span>
            <span className="font-mono">{request.reasoningChunks.length}</span>
            <span className="text-muted-foreground">phaseHistory:</span>
            <span className="font-mono">{request.phaseHistory.length}</span>
            <span className="text-muted-foreground">activeOperations:</span>
            <span className="font-mono">
              {Object.keys(request.activeOperations).length}
            </span>
            <span className="text-muted-foreground">completedOperations:</span>
            <span className="font-mono">
              {Object.keys(request.completedOperations).length}
            </span>
            <span className="text-muted-foreground">renderBlocks:</span>
            <span className="font-mono">{request.renderBlockOrder.length}</span>
            <span className="text-muted-foreground">toolLifecycle:</span>
            <span className="font-mono">
              {Object.keys(request.toolLifecycle).length}
            </span>
            <span className="text-muted-foreground">pendingToolCalls:</span>
            <span className="font-mono">{request.pendingToolCalls.length}</span>
            <span className="text-muted-foreground">dataPayloads:</span>
            <span className="font-mono">{request.dataPayloads.length}</span>
            <span className="text-muted-foreground">timeline:</span>
            <span className="font-mono">{request.timeline.length}</span>
            <span className="text-muted-foreground">warnings:</span>
            <span className="font-mono">{request.warnings.length}</span>
            <span className="text-muted-foreground">infoEvents:</span>
            <span className="font-mono">{request.infoEvents.length}</span>
            <span className="text-muted-foreground">reservations:</span>
            <span className="font-mono">
              {Object.keys(request.reservations).length}
            </span>
          </div>
        </div>

        <div className="border-t border-border/30 pt-1 mt-1">
          <span className="text-[9px] text-muted-foreground font-medium">
            Full State Dump
          </span>
          <CopyBtn
            text={JSON.stringify(request, null, 2)}
            id="full-dump"
            className="ml-1"
          />
          <JsonView
            data={request}
            label="ActiveRequest"
            id="full-state"
            defaultExpanded={false}
          />
        </div>
      </div>
    </DebugTabScroll>
  );
}

// =============================================================================
// Raw Events Tab — unprocessed, unfiltered forensic view
// =============================================================================

function RawEventsTab({ request }: { request: ActiveRequest }) {
  const rawEvents = request.rawEvents ?? [];
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [filterType, setFilterType] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const eventTypes = React.useMemo(() => {
    const types = new Set<string>();
    for (const e of rawEvents) types.add(e.eventType);
    return Array.from(types).sort();
  }, [rawEvents]);

  const filtered = filterType
    ? rawEvents.filter((e) => e.eventType === filterType)
    : rawEvents;

  const toggleExpanded = (idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (rawEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No raw events captured yet
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1 border-b border-border/30 bg-muted/10 flex-wrap">
        <span className="text-[9px] text-muted-foreground font-medium mr-1">
          {rawEvents.length} events
        </span>
        <button
          type="button"
          onClick={() => setFilterType(null)}
          className={cn(
            "px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors",
            !filterType
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
          )}
        >
          All
        </button>
        {eventTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(filterType === type ? null : type)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors",
              filterType === type
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
          >
            {type} ({rawEvents.filter((e) => e.eventType === type).length})
          </button>
        ))}
        <CopyBtn
          text={JSON.stringify(rawEvents, null, 2)}
          id="raw-all"
          className="ml-auto"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="divide-y divide-border/20">
          {filtered.map((evt) => {
            const isExpanded = expandedIdx.has(evt.idx);
            const colorClass =
              EVENT_COLORS[evt.eventType] ??
              "bg-gray-500/20 text-gray-400 border-gray-500/30";
            const icon = EVENT_ICONS[evt.eventType] ?? (
              <AlertTriangle className="h-2.5 w-2.5" />
            );

            const dataPreview = (() => {
              if (evt.data === null || evt.data === undefined) return "null";
              if (typeof evt.data === "object") {
                const d = evt.data as Record<string, unknown>;
                if (evt.eventType === "structured_output") {
                  const schema = d.schema_name
                    ? `schema: ${d.schema_name}`
                    : "";
                  const items = Array.isArray(
                    (d.data as Record<string, unknown>)?.items,
                  )
                    ? `${((d.data as Record<string, unknown>).items as unknown[]).length} item(s)`
                    : "";
                  const ok = d.success ? "✓" : "✗";
                  return [ok, schema, items].filter(Boolean).join(" · ");
                }
                if (d.event) return `event: ${d.event}`;
                if (d.text !== undefined)
                  return `text: "${String(d.text).slice(0, 40)}..."`;
                if (d.status) return `status: ${d.status}`;
                if (d.tool_name) return `tool: ${d.tool_name}`;
                const keys = Object.keys(d);
                return keys.length <= 4
                  ? keys.join(", ")
                  : `${keys.slice(0, 3).join(", ")} +${keys.length - 3}`;
              }
              return String(evt.data).slice(0, 60);
            })();

            return (
              <div
                key={evt.idx}
                className={cn(
                  "px-2 py-0.5 cursor-pointer hover:bg-muted/20 transition-colors",
                  isExpanded && "bg-muted/10",
                )}
                onClick={() => toggleExpanded(evt.idx)}
              >
                <div className="flex items-center gap-1.5 min-h-[18px]">
                  <span className="text-[9px] text-muted-foreground/60 font-mono w-4 text-right flex-shrink-0">
                    {evt.idx}
                  </span>

                  <Badge
                    variant="outline"
                    className={cn(
                      "px-1 py-0 text-[8px] leading-[14px] h-[14px] inline-flex items-center gap-0.5 font-mono border rounded-sm flex-shrink-0",
                      colorClass,
                    )}
                  >
                    {icon}
                    {evt.eventType}
                  </Badge>

                  <span className="text-[9px] text-muted-foreground/60 font-mono flex-shrink-0">
                    {evt.timestamp.toFixed(0)}ms
                  </span>

                  {!isExpanded && (
                    <span className="text-[9px] text-muted-foreground truncate">
                      {dataPreview}
                    </span>
                  )}

                  <CopyBtn
                    text={JSON.stringify(evt, null, 2)}
                    id={`raw-${evt.idx}`}
                    className="ml-auto flex-shrink-0"
                  />
                </div>

                {isExpanded && (
                  <div className="ml-5 mt-0.5 mb-1">
                    <JsonView
                      data={evt.data}
                      label="data"
                      id={`raw-data-${evt.idx}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Tab definitions
// =============================================================================

type TabId =
  | "events"
  | "raw"
  | "tools"
  | "status"
  | "blocks"
  | "text"
  | "data"
  | "completion"
  | "state";

const TAB_DEFS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "events", label: "Timeline", icon: <Zap className="h-3 w-3" /> },
  { id: "raw", label: "Raw", icon: <Radio className="h-3 w-3" /> },
  { id: "text", label: "Text", icon: <FileText className="h-3 w-3" /> },
  { id: "tools", label: "Tools", icon: <Wrench className="h-3 w-3" /> },
  { id: "status", label: "Status", icon: <Activity className="h-3 w-3" /> },
  { id: "blocks", label: "Blocks", icon: <Layers className="h-3 w-3" /> },
  { id: "data", label: "Data", icon: <Database className="h-3 w-3" /> },
  { id: "completion", label: "Stats", icon: <BarChart3 className="h-3 w-3" /> },
  { id: "state", label: "State", icon: <CircleDot className="h-3 w-3" /> },
];

// =============================================================================
// Single-Instance Debug View
// =============================================================================

function InstanceDebugView({
  conversationId,
  hideChrome,
  requestIdOverride,
}: {
  conversationId: string;
  hideChrome: boolean;
  requestIdOverride?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("events");

  const instanceStatus = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.status,
  );

  const requestIds = useAppSelector(
    selectConversationRequestIds(conversationId),
  );

  const [selectedRequestIdx, setSelectedRequestIdx] = useState<number>(-1);
  const effectiveIdx =
    selectedRequestIdx === -1 ? requestIds.length - 1 : selectedRequestIdx;
  const derivedRequestId = requestIds[effectiveIdx];
  const selectedRequestId = requestIdOverride ?? derivedRequestId;

  const request = useAppSelector((state) =>
    selectedRequestId
      ? state.activeRequests.byRequestId[selectedRequestId]
      : undefined,
  );

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[11px] text-muted-foreground/60 p-4 gap-1">
        <span>
          No active request for this instance. Run the agent to begin debugging.
        </span>
        {requestIds.length === 0 && (
          <span className="text-[10px]">(0 requests found)</span>
        )}
      </div>
    );
  }

  if (hideChrome) {
    return <TimelineTab request={request} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="shrink-0">
        <StatusBar request={request} instanceStatus={instanceStatus} />
        {request.clientMetrics && (
          <MetricsBar metrics={request.clientMetrics} />
        )}
      </div>

      {requestIds.length > 1 && (
        <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 border-b border-border/30 text-[10px]">
          <span className="text-muted-foreground font-medium">Request:</span>
          {requestIds.map((id, idx) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedRequestIdx(idx)}
              className={cn(
                "px-2 py-0.5 h-5 rounded border text-[10px] font-mono",
                idx === effectiveIdx
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "bg-muted/20 text-muted-foreground border-transparent hover:border-border/50",
              )}
            >
              #{idx + 1}
            </button>
          ))}
          <span className="text-muted-foreground/60 text-[9px] ml-auto">
            {requestIds.length} total
          </span>
        </div>
      )}

      <div className="flex shrink-0 border-b border-border/50 bg-muted/10 overflow-x-auto scrollbar-none">
        {TAB_DEFS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 text-[11px] whitespace-nowrap border-b-2 transition-colors cursor-pointer",
              activeTab === tab.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {activeTab === "events" && <TimelineTab request={request} />}
        {activeTab === "raw" && <RawEventsTab request={request} />}
        {activeTab === "text" && <TextTab request={request} />}
        {activeTab === "tools" && <ToolsTab request={request} />}
        {activeTab === "status" && <StatusTab request={request} />}
        {activeTab === "blocks" && <BlocksTab request={request} />}
        {activeTab === "data" && <DataTab request={request} />}
        {activeTab === "completion" && <CompletionTab request={request} />}
        {activeTab === "state" && (
          <StateSnapshotTab request={request} instanceStatus={instanceStatus} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export interface StreamDebugPanelProps {
  conversationId: string;
  className?: string;
  /**
   * When true, hides the StatusBar, MetricsBar, request selector, and internal tab bar.
   * Used when the parent (e.g., FullScreenOverlay) provides its own chrome.
   * In hideChrome mode, only the "events" (Timeline) tab content is rendered.
   */
  hideChrome?: boolean;
  /**
   * Override which requestId to display, bypassing the internal selector.
   * Used by the overlay to synchronize request selection across tabs.
   */
  requestIdOverride?: string;
}

export function StreamDebugPanel({
  conversationId,
  className,
  hideChrome = false,
  requestIdOverride,
}: StreamDebugPanelProps) {
  const dispatch = useAppDispatch();

  // Activate debug-session mode on first render so all future destroyInstance
  // calls become no-ops and history is preserved for the rest of the session.
  const debugSessionActive = useAppSelector(
    (state) => state.conversations.debugSessionActive,
  );
  useEffect(() => {
    if (!debugSessionActive) {
      dispatch(setDebugSession(true));
    }
  }, [dispatch, debugSessionActive]);

  // All instances in Redux — so we can show tabs for each one
  const allInstanceIds = useAppSelector(
    (state) => state.conversations.allConversationIds,
    shallowEqual,
  );

  // When hideChrome, just render the focused instance's timeline
  if (hideChrome) {
    return (
      <div className={cn(DEBUG_PANEL_SHELL, className)}>
        <InstanceDebugView
          conversationId={conversationId}
          hideChrome
          requestIdOverride={requestIdOverride}
        />
      </div>
    );
  }

  // If there's only one instance (or none), skip the instance tab layer
  if (allInstanceIds.length <= 1) {
    return (
      <div className={cn(DEBUG_PANEL_SHELL, className)}>
        <InstanceDebugView
          conversationId={conversationId}
          hideChrome={false}
          requestIdOverride={requestIdOverride}
        />
      </div>
    );
  }

  return (
    <MultiInstanceDebugPanel
      activeInstanceId={conversationId}
      allInstanceIds={allInstanceIds}
      className={className}
      requestIdOverride={requestIdOverride}
    />
  );
}

// =============================================================================
// Multi-instance wrapper — one top-level tab per instance
// =============================================================================

function MultiInstanceDebugPanel({
  activeInstanceId,
  allInstanceIds,
  className,
  requestIdOverride,
}: {
  activeInstanceId: string;
  allInstanceIds: string[];
  className?: string;
  requestIdOverride?: string;
}) {
  const [selectedInstanceId, setSelectedInstanceId] =
    useState(activeInstanceId);

  // Keep selected tab valid if the list grows
  const effectiveInstanceId = allInstanceIds.includes(selectedInstanceId)
    ? selectedInstanceId
    : (allInstanceIds[allInstanceIds.length - 1] ?? activeInstanceId);

  return (
    <div className={cn(DEBUG_PANEL_SHELL, className)}>
      {/* Instance selector strip */}
      <div className="flex items-center gap-0 border-b border-border bg-muted/20 overflow-x-auto scrollbar-none shrink-0">
        <span className="text-[9px] text-muted-foreground font-medium px-2 py-1.5 whitespace-nowrap border-r border-border/50 shrink-0">
          INSTANCE
        </span>
        {allInstanceIds.map((id, idx) => (
          <InstanceTab
            key={id}
            conversationId={id}
            idx={idx}
            isActive={id === effectiveInstanceId}
            onSelect={() => setSelectedInstanceId(id)}
          />
        ))}
      </div>

      {/* Per-instance debug view */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <InstanceDebugView
          conversationId={effectiveInstanceId}
          hideChrome={false}
          requestIdOverride={
            effectiveInstanceId === activeInstanceId
              ? requestIdOverride
              : undefined
          }
        />
      </div>
    </div>
  );
}

function InstanceTab({
  conversationId,
  idx,
  isActive,
  onSelect,
}: {
  conversationId: string;
  idx: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const status = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.status,
  );
  const requestCount = useAppSelector(
    selectConversationRequestCount(conversationId),
  );

  const statusDot = status
    ? (INSTANCE_STATUS_COLORS[status] ?? "bg-gray-500/20 text-gray-400")
    : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] whitespace-nowrap border-b-2 border-r border-border/30 transition-colors cursor-pointer font-mono",
        isActive
          ? "border-b-primary text-primary bg-primary/5"
          : "border-b-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20",
      )}
    >
      <span className="text-muted-foreground/60">#{idx + 1}</span>
      <span className="max-w-[80px] truncate">
        {conversationId.slice(0, 8)}
      </span>
      {status && (
        <Badge
          variant="outline"
          className={cn("text-[8px] px-1 py-0 h-3.5 border-0", statusDot)}
        >
          {status}
        </Badge>
      )}
      {requestCount > 0 && (
        <span className="text-[9px] text-muted-foreground/60">
          {requestCount}req
        </span>
      )}
    </button>
  );
}

export default StreamDebugPanel;
