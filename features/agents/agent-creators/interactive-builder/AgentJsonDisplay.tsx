/**
 * Agent-shaped progressive JSON display.
 *
 * Sibling of the legacy PromptJsonDisplay but built around the agx_agent
 * row shape: `variable_definitions`, `context_slots`, `messages[].content`
 * as a text-part array, `agent_type`, `model_id`, etc.
 *
 * Uses `parsePartialAgentJson` so the card renders as soon as ANY field
 * is valid, not only once the whole block lands.
 */

"use client";

import React, {
  Component,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  Code2,
  Database,
  Eye,
  FileJson,
  Loader2,
  MessageSquare,
  Puzzle,
  Settings,
  Gem,
  Variable,
} from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { cn } from "@/styles/themes/utils";
import {
  extractAgentJsonBlock,
  findAgentJsonBlockSpan,
  flattenContent,
  parsePartialAgentJson,
  splitAroundAgentJsonBlock,
  type PartialAgentData,
} from "../utils/agent-progressive-json-parser";

export interface AgentJsonDisplayProps {
  /** Raw streamed text — may contain pre/post markdown around the json block. */
  content: string;
  isStreamActive?: boolean;
  /**
   * Optional fully-extracted object (from the execution system's streaming
   * JSON tracker). When provided, we prefer it over the raw-text parse
   * because it already dedupes + resolves the JSON independent of fences.
   */
  extracted?: Record<string, unknown> | null;
  className?: string;
}

// =============================================================================
// Error boundary — crash-proof so a bad partial parse doesn't nuke the UI
// =============================================================================

class AgentJsonErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AgentJsonDisplay] render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              Display error
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {this.state.error?.message ?? "Failed to render agent JSON"}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// =============================================================================
// Top-level: markdown before + agent card + markdown after
// =============================================================================

export function AgentStreamingResponse({
  content,
  isStreamActive,
  extracted,
}: {
  content: string;
  isStreamActive: boolean;
  extracted?: Record<string, unknown> | null;
}) {
  // Locate the JSON block — fenced (```json / plain ```) or raw ({…}).
  // The agent-generator currently emits raw JSON with no fences, then a
  // `---` divider and a markdown explanation. We must work for both shapes.
  const span = findAgentJsonBlockSpan(content);

  // No JSON in sight AND no parsed object from the streaming tracker —
  // we're either in the pre-JSON prose phase or just have prose. Render
  // the raw markdown so the user sees something instead of a void.
  if (!span && !extracted) {
    return (
      <MarkdownStream
        content={content}
        isStreamActive={isStreamActive}
        hideCopyButton
      />
    );
  }

  const { before, after } = splitAroundAgentJsonBlock(content);
  // Once the JSON has opened, the post-JSON markdown can only be safely
  // shown after the object closes — otherwise a brace-balanced prefix
  // could mis-split mid-stream and flash garbage. splitAroundAgentJsonBlock
  // already returns an empty `after` while the body is open.

  return (
    <div className="space-y-3">
      {before && (
        <MarkdownStream
          content={before}
          isStreamActive={false}
          hideCopyButton
        />
      )}
      <AgentJsonDisplay
        content={content}
        isStreamActive={isStreamActive}
        extracted={extracted}
      />
      {after && (
        <MarkdownStream content={after} isStreamActive={false} hideCopyButton />
      )}
    </div>
  );
}

// =============================================================================
// The card itself
// =============================================================================

export function AgentJsonDisplay(props: AgentJsonDisplayProps) {
  return (
    <AgentJsonErrorBoundary>
      <AgentJsonDisplayInner {...props} />
    </AgentJsonErrorBoundary>
  );
}

function AgentJsonDisplayInner({
  content,
  isStreamActive = false,
  extracted,
  className,
}: AgentJsonDisplayProps) {
  const [view, setView] = useState<"pretty" | "json">("pretty");

  const agentData = useMemo<PartialAgentData>(() => {
    // Prefer the execution system's already-parsed object when available.
    // It's the cleaner source — no regex surgery required.
    if (extracted && typeof extracted === "object") {
      return normalizeFromExtracted(extracted);
    }
    return parsePartialAgentJson(content);
  }, [content, extracted]);

  const jsonBlock = useMemo(() => extractAgentJsonBlock(content), [content]);

  const hasAnyField =
    !!agentData.name ||
    !!agentData.description ||
    !!agentData.messages?.length ||
    !!agentData.variable_definitions?.length ||
    !!agentData.context_slots?.length ||
    !!(agentData.settings && Object.keys(agentData.settings).length > 0);

  if (!hasAnyField && !jsonBlock) {
    // Nothing to show yet — let the caller render a spinner.
    return isStreamActive ? (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Loader2 className="h-7 w-7 animate-spin text-purple-600 dark:text-purple-400 mb-2" />
        <p className="text-xs text-muted-foreground">
          Generating agent configuration…
        </p>
      </div>
    ) : null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Agent Configuration
          </span>
          {!agentData.isComplete && isStreamActive && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </Badge>
          )}
          {agentData.isComplete && (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700"
            >
              Complete
            </Badge>
          )}
        </div>

        {agentData.isComplete && jsonBlock && (
          <div className="flex items-center gap-1 border rounded-lg p-0.5 bg-background">
            <Button
              variant={view === "pretty" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("pretty")}
              className="h-7 px-3 text-xs"
            >
              <Eye className="h-3 w-3 mr-1.5" />
              Pretty
            </Button>
            <Button
              variant={view === "json" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("json")}
              className="h-7 px-3 text-xs"
            >
              <Code2 className="h-3 w-3 mr-1.5" />
              JSON
            </Button>
          </div>
        )}
      </div>

      {isStreamActive || view === "pretty" ? (
        <PrettyView data={agentData} isStreamActive={isStreamActive} />
      ) : (
        <JsonView jsonContent={jsonBlock ?? ""} />
      )}
    </div>
  );
}

// =============================================================================
// Pretty view
// =============================================================================

function PrettyView({
  data,
  isStreamActive,
}: {
  data: PartialAgentData;
  isStreamActive: boolean;
}) {
  return (
    <div className="space-y-2">
      {/* Header: name + description */}
      {(data.name || data.description) && (
        <div className="border-l-2 border-purple-400 dark:border-purple-600 pl-3 py-1.5">
          {data.name && (
            <div className="flex items-center gap-2">
              <Gem className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {data.name}
              </h3>
              {data.agent_type && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {data.agent_type}
                </Badge>
              )}
              {data.category && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                >
                  {data.category}
                </Badge>
              )}
            </div>
          )}
          {data.description && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {data.description}
            </p>
          )}
          {data.tags && data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {data.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {data.messages && data.messages.length > 0 && (
        <div className="space-y-1.5">
          {data.messages.map((m, idx) => (
            <MessageCard
              key={idx}
              role={m.role}
              content={m.content}
              isStreamActive={
                isStreamActive && idx === data.messages!.length - 1
              }
            />
          ))}
        </div>
      )}

      {/* Variables */}
      {data.variable_definitions && data.variable_definitions.length > 0 && (
        <section className="border-t pt-2">
          <SectionHeader
            icon={Variable}
            label={`Variables (${data.variable_definitions.length})`}
          />
          <VariablesTable vars={data.variable_definitions} />
        </section>
      )}

      {/* Context slots */}
      {data.context_slots && data.context_slots.length > 0 && (
        <section className="border-t pt-2">
          <SectionHeader
            icon={Puzzle}
            label={`Context Slots (${data.context_slots.length})`}
          />
          <ContextSlotsTable slots={data.context_slots} />
        </section>
      )}

      {/* Tools */}
      {((data.tools && data.tools.length > 0) ||
        (data.custom_tools && data.custom_tools.length > 0)) && (
        <section className="border-t pt-2">
          <SectionHeader icon={Brain} label="Tools" />
          <div className="flex flex-wrap gap-1">
            {(data.tools ?? []).map((t, idx) => (
              <Badge
                key={`tool-${idx}`}
                variant="outline"
                className="text-[10px]"
              >
                {renderToolBadge(t)}
              </Badge>
            ))}
            {(data.custom_tools ?? []).map((t, idx) => (
              <Badge
                key={`custom-tool-${idx}`}
                variant="outline"
                className="text-[10px] bg-purple-50 dark:bg-purple-900/20"
              >
                custom: {renderToolBadge(t)}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Settings */}
      {data.settings && Object.keys(data.settings).length > 0 && (
        <section className="border-t pt-2">
          <SectionHeader icon={Settings} label="Settings" />
          <SettingsGrid settings={data.settings} modelId={data.model_id} />
        </section>
      )}

      {/* Model id alone (when settings haven't landed) */}
      {!data.settings && data.model_id && (
        <section className="border-t pt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
            <span className="text-muted-foreground">Model:</span>
            <code className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
              {data.model_id}
            </code>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
      <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
        {label}
      </h4>
    </div>
  );
}

function MessageCard({
  role,
  content,
  isStreamActive,
}: {
  role: string;
  content: string;
  isStreamActive: boolean;
}) {
  const palette: Record<string, { color: string; bg: string; border: string }> =
    {
      system: {
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-50 dark:bg-blue-950/20",
        border: "border-blue-200 dark:border-blue-800",
      },
      user: {
        color: "text-green-600 dark:text-green-400",
        bg: "bg-green-50 dark:bg-green-950/20",
        border: "border-green-200 dark:border-green-800",
      },
      assistant: {
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-50 dark:bg-purple-950/20",
        border: "border-purple-200 dark:border-purple-800",
      },
    };
  const c = palette[role] ?? palette.system;
  return (
    <div className={cn("border rounded-md overflow-hidden", c.border)}>
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 border-b",
          c.bg,
          c.border,
        )}
      >
        <MessageSquare className={cn("h-3 w-3", c.color)} />
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            c.color,
          )}
        >
          {role}
        </span>
      </div>
      <div className="px-2 py-1.5 bg-background">
        <div className="prose prose-xs dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <MarkdownStream
            content={content}
            isStreamActive={isStreamActive}
            hideCopyButton
          />
        </div>
      </div>
    </div>
  );
}

function VariablesTable({
  vars,
}: {
  vars: NonNullable<PartialAgentData["variable_definitions"]>;
}) {
  return (
    <div className="border rounded-md overflow-hidden bg-background/40">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="px-2 py-1 text-left font-semibold">Name</th>
            <th className="px-2 py-1 text-left font-semibold">Default</th>
            <th className="px-2 py-1 text-left font-semibold">Help</th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v, idx) => (
            <tr key={idx} className="border-b last:border-b-0">
              <td className="px-2 py-1.5">
                <code className="font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                  {v.name}
                </code>
                {v.required && (
                  <span className="ml-1 text-[9px] uppercase text-destructive">
                    req
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {renderValuePreview(v.defaultValue)}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {v.helpText
                  ? v.helpText.length > 60
                    ? v.helpText.slice(0, 60) + "…"
                    : v.helpText
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContextSlotsTable({
  slots,
}: {
  slots: NonNullable<PartialAgentData["context_slots"]>;
}) {
  return (
    <div className="border rounded-md overflow-hidden bg-background/40">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="px-2 py-1 text-left font-semibold">Key</th>
            <th className="px-2 py-1 text-left font-semibold">Type</th>
            <th className="px-2 py-1 text-left font-semibold">
              Label / Description
            </th>
          </tr>
        </thead>
        <tbody>
          {slots.map((s, idx) => (
            <tr key={idx} className="border-b last:border-b-0">
              <td className="px-2 py-1.5">
                <code className="font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                  {s.key}
                </code>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {s.type ?? "text"}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {s.label || s.description || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsGrid({
  settings,
  modelId,
}: {
  settings: Record<string, unknown>;
  modelId?: string;
}) {
  const entries = Object.entries({
    ...(modelId ? { model_id: modelId } : {}),
    ...settings,
  }).filter(([key, v]) => {
    // Hide empty arrays/objects that make the grid noisy.
    if (Array.isArray(v) && v.length === 0) return false;
    if (v && typeof v === "object" && Object.keys(v).length === 0) return false;
    return true;
  });
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 p-2 border rounded-md bg-muted/30 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col min-w-0">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {key.replace(/_/g, " ")}
          </span>
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
            {renderValuePreview(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function JsonView({ jsonContent }: { jsonContent: string }) {
  return (
    <pre className="p-3 bg-gray-900 dark:bg-black text-gray-100 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed border">
      <code>{jsonContent || "// Waiting for JSON…"}</code>
    </pre>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function renderValuePreview(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 50 ? v.slice(0, 50) + "…" : v;
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 40 ? s.slice(0, 40) + "…" : s;
    } catch {
      return "{…}";
    }
  }
  return String(v);
}

function renderToolBadge(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    const r = t as { name?: unknown; type?: unknown };
    if (typeof r.name === "string") return r.name;
    if (typeof r.type === "string") return r.type;
  }
  return "tool";
}

/** When we already have the parsed object from the JSON tracker, route it
 *  through the same normalizer the raw-text path uses so both paths render
 *  identically. */
function normalizeFromExtracted(
  raw: Record<string, unknown>,
): PartialAgentData {
  const normalized = parsePartialAgentJson(
    "```json\n" + safeStringify(raw) + "\n```",
  );
  if (normalized.isComplete) return normalized;
  // Fallback: manually flatten from the raw object.
  const messages = Array.isArray(raw.messages)
    ? (raw.messages as unknown[])
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const r = m as { role?: unknown; content?: unknown };
          if (typeof r.role !== "string") return null;
          return { role: r.role, content: flattenContent(r.content) };
        })
        .filter(Boolean as unknown as <T>(v: T) => v is NonNullable<T>)
    : undefined;
  return {
    ...normalized,
    messages: messages as PartialAgentData["messages"],
    isComplete: true,
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "{}";
  }
}
