"use client";

/**
 * MemoryStateInspector
 *
 * Admin-only view of the raw `cx_observational_memory` row for a conversation.
 * Shows the actual `active_observations` text (what's being injected on every
 * turn), plus the buffered observation/reflection state, generation counter,
 * token counts, and metadata.
 *
 * We query Supabase directly with the RLS'd client — non-admin users will
 * see an empty result even if they somehow reach this component, and admins
 * will see the full row.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Check,
  ChevronRight,
  Copy,
  Database,
  FileText,
  Info,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Hammer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import type { Tables } from "@/types/database.types";
import { formatDateTime, formatRelativeTime, formatTokens } from "./format";

type MemoryRow = Tables<{ schema: "chat" }, "observational_memory">;

interface BufferedObservationCycle {
  cycle_id?: string;
  created_at?: string;
  message_ids?: unknown;
  current_task?: string | null;
  observations?: string | null;
  thread_title?: string | null;
  message_count?: number;
  message_range?: unknown;
  message_tokens?: number;
  observation_tokens?: number;
  suggested_continuation?: string | null;
}

function isCycleArray(value: unknown): value is BufferedObservationCycle[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry !== null && typeof entry === "object")
  );
}

interface MemoryStateInspectorProps {
  conversationId: string;
  /** Auto-fetch on mount. */
  autoFetch?: boolean;
  className?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; row: MemoryRow | null }
  | { status: "error"; error: string };

export function MemoryStateInspector({
  conversationId,
  autoFetch = true,
  className,
}: MemoryStateInspectorProps) {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  const fetchRow = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const { data, error } = await supabase
        .schema("chat").from("observational_memory")
        .select("*")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setState({ status: "error", error: error.message });
        return;
      }
      setState({ status: "success", row: (data as MemoryRow) ?? null });
    } catch (e) {
      setState({
        status: "error",
        error: extractErrorMessage(e),
      });
    }
  }, [conversationId]);

  useEffect(() => {
    if (!autoFetch) return;
    void fetchRow();
  }, [autoFetch, fetchRow]);

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 h-full rounded-md border border-border bg-card/60",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Database className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Memory State · cx_observational_memory
        </span>
        <button
          type="button"
          onClick={fetchRow}
          disabled={state.status === "loading"}
          className="flex items-center gap-1 h-6 px-1.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {state.status === "loading" ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {state.status === "idle" && (
          <EmptyHint>Click refresh to fetch the memory row.</EmptyHint>
        )}

        {state.status === "loading" && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Querying cx_observational_memory…
          </div>
        )}

        {state.status === "error" && (
          <div className="text-xs bg-destructive/5 border border-destructive/20 text-destructive rounded p-2">
            {state.error}
          </div>
        )}

        {state.status === "success" && !state.row && (
          <EmptyHint>
            No memory row exists for this conversation yet. A row is created on
            the first memory-enabled turn.
          </EmptyHint>
        )}

        {state.status === "success" && state.row && (
          <div className="flex flex-col gap-2">
            <MemoryRowDetails row={state.row} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
      <Info className="w-8 h-8 opacity-20" />
      <div className="text-xs text-center max-w-sm">{children}</div>
    </div>
  );
}

function MemoryRowDetails({ row }: { row: MemoryRow }) {
  return (
    <>
      <BufferedObservationsView value={row.buffered_observations} />

      <TextPayload
        title="Active observations"
        subtitle="Consolidated text injected into every turn's system prompt"
        icon={<FileText className="w-3.5 h-3.5 text-emerald-500" />}
        text={row.active_observations}
        maxHeightClass="max-h-80"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile
          label="Generation"
          value={String(row.generation_count)}
          tone="emerald"
        />
        <StatTile
          label="Observation tokens"
          value={formatTokens(row.observation_token_count)}
        />
        <StatTile
          label="Pending tokens"
          value={formatTokens(row.pending_message_tokens)}
        />
        <StatTile
          label="Reflected lines"
          value={formatTokens(row.reflected_observation_line_count)}
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <KeyValue label="Scope" value={row.scope} mono />
        <KeyValue
          label="Last observed"
          value={
            row.last_observed_at
              ? `${formatRelativeTime(row.last_observed_at)} · ${formatDateTime(
                  row.last_observed_at,
                )}`
              : "—"
          }
        />
        <KeyValue
          label="Buffering observation"
          value={row.is_buffering_observation ? "yes" : "no"}
          tone={row.is_buffering_observation ? "emerald" : undefined}
        />
        <KeyValue
          label="Buffering reflection"
          value={row.is_buffering_reflection ? "yes" : "no"}
          tone={row.is_buffering_reflection ? "emerald" : undefined}
        />
        <KeyValue
          label="Updated"
          value={`${formatRelativeTime(row.updated_at)} · ${formatDateTime(row.updated_at)}`}
        />
        <KeyValue
          label="Created"
          value={`${formatRelativeTime(row.created_at)} · ${formatDateTime(row.created_at)}`}
        />
      </div>

      {row.current_task && (
        <TextPayload
          title="Current task"
          subtitle="Latest distilled task the user is working on"
          text={row.current_task}
        />
      )}

      {row.suggested_response && (
        <TextPayload
          title="Suggested response"
          subtitle="Observer's proposed next-turn nudge"
          text={row.suggested_response}
        />
      )}

      {row.buffered_reflection && (
        <TextPayload
          title="Buffered reflection"
          subtitle="Pending Reflector compression queued for the next run"
          text={row.buffered_reflection}
        />
      )}

      <ObservedMessageIds value={row.observed_message_ids} />

      <KeyValueBlock
        title="Config"
        subtitle="Per-conversation memory config overrides"
        value={row.config}
      />

      <KeyValueBlock
        title="Metadata"
        subtitle="Free-form metadata on the memory row"
        value={row.metadata}
      />
    </>
  );
}

function BufferedObservationsView({ value }: { value: unknown }) {
  const cycles = useMemo<BufferedObservationCycle[]>(() => {
    if (!isCycleArray(value)) return [];
    return [...value].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [value]);

  if (cycles.length === 0) {
    return (
      <div className="rounded border border-border/60 bg-background/50 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/5 border-b border-border/60">
          <Layers className="w-3.5 h-3.5 text-amber-500" />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-foreground">
              Buffered observation cycles
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Latest async observer chunks awaiting promotion
            </div>
          </div>
        </div>
        <div className="p-3 text-[11px] text-muted-foreground italic">
          No buffered cycles. Anything observed has already been promoted into
          active observations.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-amber-500/30 bg-background/50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border-b border-amber-500/20">
        <Layers className="w-3.5 h-3.5 text-amber-500" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-foreground">
            Buffered observation cycles
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Newest first · awaiting promotion into active observations
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-2 flex flex-col gap-2">
        {cycles.map((cycle, idx) => (
          <BufferedObservationCard
            key={cycle.cycle_id ?? `cycle-${idx}`}
            cycle={cycle}
            defaultOpen={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}

function BufferedObservationCard({
  cycle,
  defaultOpen,
}: {
  cycle: BufferedObservationCycle;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const text = cycle.observations ?? "";
  const hasText = text.length > 0;

  const handleCopy = useCallback(() => {
    if (!hasText) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text, hasText]);

  const messageIds = Array.isArray(cycle.message_ids)
    ? cycle.message_ids.filter((v): v is string => typeof v === "string")
    : [];

  return (
    <div className="rounded border border-border/60 bg-background overflow-hidden">
      <div className="flex items-start gap-1.5 px-2 py-1.5 bg-muted/20 hover:bg-muted/30 transition-colors">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 min-w-0 flex items-start gap-1.5 text-left"
          aria-expanded={open}
        >
          <ChevronRight
            className={cn(
              "w-3 h-3 mt-0.5 text-muted-foreground transition-transform shrink-0",
              open && "rotate-90",
            )}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Hammer className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-[11px] font-medium text-foreground">
                {cycle.thread_title || "Cycle"}
              </span>
              {cycle.cycle_id && (
                <span
                  className="font-mono text-[10px] text-muted-foreground/70"
                  title={cycle.cycle_id}
                >
                  {cycle.cycle_id.slice(0, 8)}
                </span>
              )}
              {cycle.created_at && (
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(cycle.created_at)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/80 mt-0.5">
              {cycle.message_count != null && (
                <span>
                  <span className="text-foreground/70 font-mono">
                    {cycle.message_count}
                  </span>{" "}
                  msg
                </span>
              )}
              {messageIds.length > 0 &&
                cycle.message_count !== messageIds.length && (
                  <span>
                    <span className="text-foreground/70 font-mono">
                      {messageIds.length}
                    </span>{" "}
                    ids
                  </span>
                )}
              {cycle.observation_tokens != null && (
                <span>
                  obs{" "}
                  <span className="text-emerald-500 font-mono">
                    {formatTokens(cycle.observation_tokens)}
                  </span>
                  t
                </span>
              )}
              {cycle.message_tokens != null && (
                <span>
                  in{" "}
                  <span className="text-foreground/70 font-mono">
                    {formatTokens(cycle.message_tokens)}
                  </span>
                  t
                </span>
              )}
              {hasText && (
                <span>
                  <span className="text-foreground/70 font-mono">
                    {text.length.toLocaleString()}
                  </span>{" "}
                  chars
                </span>
              )}
            </div>
          </div>
        </button>
        {hasText && (
          <button
            type="button"
            onClick={handleCopy}
            className="w-5 h-5 mt-0.5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            title="Copy observations"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-border/60">
          {hasText ? (
            <pre className="p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words max-h-96 overflow-y-auto leading-relaxed bg-background">
              {text}
            </pre>
          ) : (
            <div className="p-2 text-[11px] text-muted-foreground italic">
              (no observation text in this cycle)
            </div>
          )}

          {(cycle.current_task ||
            cycle.suggested_continuation ||
            messageIds.length > 0) && (
            <div className="border-t border-border/60 bg-muted/10 px-2 py-1.5 flex flex-col gap-1.5 text-[10px]">
              {cycle.current_task && (
                <CycleAside label="Task" value={cycle.current_task} />
              )}
              {cycle.suggested_continuation && (
                <CycleAside
                  label="Suggested"
                  value={cycle.suggested_continuation}
                />
              )}
              {messageIds.length > 0 && (
                <div className="flex gap-1.5 min-w-0">
                  <span className="text-muted-foreground shrink-0">
                    Messages:
                  </span>
                  <div className="flex flex-wrap gap-1 min-w-0">
                    {messageIds.map((id) => (
                      <code
                        key={id}
                        className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground"
                        title={id}
                      >
                        {id.startsWith("om-") ? id : id.slice(0, 8)}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CycleAside({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground/90 break-words">{value}</span>
    </div>
  );
}

function ObservedMessageIds({ value }: { value: unknown }) {
  const ids = useMemo<string[]>(() => {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string");
  }, [value]);
  const [open, setOpen] = useState(false);

  if (ids.length === 0) return null;

  return (
    <div className="rounded border border-border/60 bg-background/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
      >
        <ChevronRight
          className={cn(
            "w-3 h-3 text-muted-foreground transition-transform shrink-0",
            open && "rotate-90",
          )}
        />
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-foreground">
            Observed messages
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Message IDs already fed into memory
          </div>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {ids.length}
        </span>
      </button>
      {open && (
        <div className="p-2 max-h-48 overflow-y-auto bg-background/50">
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => (
              <code
                key={id}
                className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground hover:text-foreground"
                title={id}
              >
                {id.startsWith("om-") ? id : id.slice(0, 8)}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyValueBlock({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: unknown;
}) {
  const entries = useMemo<Array<[string, unknown]>>(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string, unknown>);
  }, [value]);

  if (entries.length === 0) return null;

  return (
    <div className="rounded border border-border/60 bg-background/50 overflow-hidden">
      <div className="px-2 py-1 bg-muted/20 border-b border-border/60">
        <div className="text-[11px] font-medium text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {subtitle}
        </div>
      </div>
      <div className="p-2 flex flex-col gap-1 text-[11px]">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-2 min-w-0">
            <span className="font-mono text-muted-foreground shrink-0">
              {key}:
            </span>
            <span className="font-mono text-foreground break-all min-w-0">
              {formatScalar(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald";
}) {
  return (
    <div className="rounded border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 truncate">
        {label}
      </div>
      <div
        className={cn(
          "text-xs font-mono font-medium truncate",
          tone === "emerald" && "text-emerald-500",
          !tone && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function KeyValue({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "emerald";
}) {
  return (
    <div className="flex gap-1.5 min-w-0">
      <span className="text-muted-foreground/80 shrink-0">{label}:</span>
      <span
        className={cn(
          "truncate",
          mono && "font-mono text-[11px]",
          tone === "emerald" && "text-emerald-500",
          !tone && "text-foreground",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function TextPayload({
  title,
  subtitle,
  icon,
  text,
  maxHeightClass = "max-h-64",
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  text: string | null | undefined;
  maxHeightClass?: string;
}) {
  const [copied, setCopied] = useState(false);
  const hasText = typeof text === "string" && text.length > 0;

  const handleCopy = useCallback(() => {
    if (!hasText) return;
    navigator.clipboard.writeText(text!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text, hasText]);

  return (
    <div className="rounded border border-border/60 bg-background/50 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/20 border-b border-border/60">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-foreground">{title}</div>
          <div className="text-[10px] text-muted-foreground truncate">
            {subtitle}
          </div>
        </div>
        {hasText && (
          <>
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {text!.length.toLocaleString()} chars
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              title="Copy"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </>
        )}
      </div>
      {hasText ? (
        <pre
          className={cn(
            "p-2 text-[11px] font-mono text-foreground whitespace-pre-wrap break-words overflow-y-auto leading-relaxed",
            maxHeightClass,
          )}
        >
          {text}
        </pre>
      ) : (
        <div className="p-2 text-[11px] text-muted-foreground italic">
          (empty)
        </div>
      )}
    </div>
  );
}
