"use client";

/**
 * ContextPreviewPanel — "what the agent receives", for real.
 *
 * Two views:
 *   • Resolved (default) — the SERVER's answer, fetched from
 *     `POST /ai/context/preview`, which runs the exact same resolution code
 *     the agent-run path runs: the injected system-prompt context block
 *     (byte-identical), the resolved variables by injection tier, and the
 *     agent's variable/slot binding fill when an agent is active.
 *   • Attached — the client-side entries published for this conversation's
 *     turns (working doc, scratchpad, slots, ad-hoc) + the baseline note.
 *
 * Rendered inside the non-blocking `contextPreviewPanel` overlay
 * (SidePanelSurface → MatrxDynamicPanelHost). Never a blocking Sheet.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Braces, FileCode2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  useContextPreview,
  type ContextPreviewResponse,
} from "./useContextPreview";
import { AttachedContextSection } from "./AttachedContextSection";

type View = "resolved" | "attached";

export interface ContextPreviewPanelProps {
  conversationId?: string;
  agentId?: string;
}

/** Narrow an unknown resolved-variable entry to its displayable fields. */
function varFields(v: unknown): {
  value: string;
  source: string | null;
  description: string | null;
} {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const raw = "value" in o ? o.value : v;
    const value =
      typeof raw === "string"
        ? raw
        : raw == null
          ? ""
          : JSON.stringify(raw);
    return {
      value,
      source: typeof o.source === "string" ? o.source : null,
      description:
        typeof o.description === "string" ? o.description : null,
    };
  }
  return { value: v == null ? "" : String(v), source: null, description: null };
}

function VariableGroup({
  title,
  hint,
  vars,
}: {
  title: string;
  hint: string;
  vars: Record<string, unknown> | null | undefined;
}) {
  const keys = Object.keys(vars ?? {});
  if (keys.length === 0) return null;
  return (
    <section className="px-4 pt-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground/60">{hint}</span>
      </div>
      <ul className="mt-1.5 divide-y divide-border/60 rounded-md border border-border/60">
        {keys.sort().map((key) => {
          const f = varFields((vars as Record<string, unknown>)[key]);
          return (
            <li key={key} className="px-2.5 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
                  {key}
                </span>
                {f.source && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {f.source}
                  </span>
                )}
              </div>
              {f.description && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {f.description}
                </div>
              )}
              <div className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin-auto">
                {f.value || <span className="italic opacity-70">(empty)</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ResolvedView({
  conversationId,
  agentId,
}: {
  conversationId?: string;
  agentId?: string;
}) {
  const preview = useContextPreview({ conversationId, agentId, enabled: true });
  const { status, data, error, refresh } = preview;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Status strip — always visible so "when was this computed" is explicit. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {status === "ready" && data
            ? `Resolved by the server — the same code path a real run uses.`
            : status === "loading"
              ? "Asking the server to resolve your context…"
              : status === "error"
                ? "The server could not resolve the preview."
                : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={refresh}
          disabled={status === "loading"}
        >
          <RefreshCw
            className={cn("h-3 w-3", status === "loading" && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin-auto">
        {status === "loading" && !data && (
          <div className="space-y-2.5 px-4 py-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {status === "error" && (
          <div className="mx-4 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Preview unavailable
            </div>
            <div className="mt-1 break-words text-xs text-destructive/90">
              {error}
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              This is the real resolution endpoint — if it fails here, agent
              runs still work, but the preview cannot show server truth.
            </div>
          </div>
        )}

        {data && <ResolvedBody data={data} agentId={agentId} />}
      </div>
    </div>
  );
}

function ResolvedBody({
  data,
  agentId,
}: {
  data: ContextPreviewResponse;
  agentId?: string;
}) {
  const scopeLabels = useMemo(() => {
    const raw = data.scope_labels;
    if (!raw || typeof raw !== "object") return [] as string[];
    return Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string",
    );
  }, [data.scope_labels]);

  const block = data.injected_block ?? null;

  return (
    <>
      {/* The injected block — the headline: exact bytes into the system prompt. */}
      <section className="px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            <FileCode2 className="h-3 w-3" />
            Injected context block
          </h3>
          {typeof data.block_byte_length === "number" &&
            data.block_byte_length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {data.block_byte_length.toLocaleString()} bytes
                {data.block_producer ? ` · ${data.block_producer}` : ""}
              </span>
            )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Placed into the system prompt exactly as shown — byte-for-byte what a
          run would inject right now.
        </p>
        {block ? (
          <pre className="mt-1.5 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/90 scrollbar-thin-auto">
            {block}
          </pre>
        ) : (
          <div className="mt-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2 text-xs italic text-muted-foreground">
            No context block would be injected — no organization or scopes are
            active.
          </div>
        )}
        {scopeLabels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {scopeLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </section>

      <VariableGroup
        title="Injected directly"
        hint="merged into the prompt every turn"
        vars={data.variables?.direct as Record<string, unknown> | undefined}
      />
      <VariableGroup
        title="Tool-accessible"
        hint="the agent can fetch these on demand"
        vars={
          data.variables?.tool_accessible as Record<string, unknown> | undefined
        }
      />
      <VariableGroup
        title="Searchable"
        hint="reachable via search, never auto-sent"
        vars={data.variables?.searchable as Record<string, unknown> | undefined}
      />

      {agentId && data.bindings && (
        <section className="px-4 pt-3">
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            <Braces className="h-3 w-3" />
            Agent variable &amp; slot fill
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            How this agent&apos;s declared variables and context slots resolve
            from your scopes.
          </p>
          <VariableGroup
            title="Variables"
            hint="scope-filled agent variables"
            vars={
              data.bindings.variables as Record<string, unknown> | undefined
            }
          />
          <VariableGroup
            title="Context slots"
            hint="scope-filled context slots"
            vars={data.bindings.context as Record<string, unknown> | undefined}
          />
        </section>
      )}
    </>
  );
}

export function ContextPreviewPanel({
  conversationId,
  agentId,
}: ContextPreviewPanelProps) {
  const [view, setView] = useState<View>("resolved");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
        {(
          [
            ["resolved", "Resolved"],
            ["attached", "Attached this turn"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              view === id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "resolved" ? (
        <ResolvedView conversationId={conversationId} agentId={agentId} />
      ) : conversationId ? (
        <AttachedContextSection conversationId={conversationId} />
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Attachments appear once a conversation exists.
        </div>
      )}
    </div>
  );
}
