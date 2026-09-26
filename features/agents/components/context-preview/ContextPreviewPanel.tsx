"use client";

/**
 * ContextPreviewPanel — "what the agent receives", for real.
 *
 * Resolved view — the SERVER's answer from `POST /ai/context/preview`, which
 * runs the exact resolution code the agent-run path runs (injected block,
 * tiered variables, binding fill). Attached view — the client-side entries
 * published for this conversation's turns.
 *
 * Rendered inside the non-blocking `contextPreviewPanel` overlay. Design
 * rules for this surface: content is FOREGROUND, not dimmed (muted is for
 * true hints only); primary accents mark the live/interactive bits; the
 * injected block and values AUTO-GROW (the panel scrolls — no nested scroll
 * areas); everything copyable gets a hover `InlineCopyButton`.
 *
 * Registered surface: `matrx-user/context-preview` (overlay
 * `contextPreviewPanel`) — the panel mounts `<SurfaceRuntimeProvider>` and
 * emits its full declared scope via `createContextPreviewScope`; while open,
 * its (deeper) provider wins over the page's.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Braces, FileCode2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import { useAppSelector } from "@/lib/redux/hooks";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  CONTEXT_PREVIEW_SURFACE_NAME,
  createContextPreviewScope,
  type AttachedContextEntrySummary,
} from "@/features/surfaces/manifests/context-preview.manifest";
import { selectInstanceContextEntries } from "@/features/agents/redux/execution-system/instance-context/instance-context.selectors";
import { selectInstanceClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.selectors";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryModelForConversation,
  selectMemoryScopeForConversation,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { useActiveContextLayerItems } from "@/features/agents/components/context-items/useActiveContextLayerItems";
import { docKindForContextKey } from "@/features/agents/utils/workingDocumentContext";
import {
  useContextPreview,
  type ContextPreviewResponse,
  type ContextPreviewState,
} from "./useContextPreview";
import { AttachedContextSection } from "./AttachedContextSection";
import { ContextCompareView } from "./ContextCompareView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type View = "resolved" | "compare" | "attached";

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
      typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
    return {
      value,
      source: typeof o.source === "string" ? o.source : null,
      description: typeof o.description === "string" ? o.description : null,
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
    <section className="px-4 pt-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <ul className="mt-1.5 divide-y divide-border/60 rounded-md border border-border">
        {keys.sort().map((key) => {
          const f = varFields((vars as Record<string, unknown>)[key]);
          return (
            <li key={key} className="group/var relative px-2.5 py-2">
              <div className="flex items-center gap-2 pr-7">
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">
                  {key}
                </span>
                {f.source && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {f.source}
                  </span>
                )}
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/90">
                {f.value || (
                  <span className="italic text-muted-foreground">(empty)</span>
                )}
              </div>
              <InlineCopyButton
                content={f.value}
                formatJson={false}
                size="xs"
                className="opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/var:opacity-100"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One resolution trace row, narrowed to what the panel can show honestly. */
function traceFields(t: unknown): {
  target: string;
  key: string;
  outcome: string;
  source: string | null;
  itemKey: string | null;
  winner: string | null;
  losers: { rung: string; why: string }[];
  scopeCount: number | null;
} | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const key = typeof o.target_key === "string" ? o.target_key : "";
  if (!key) return null;
  const rawLosers = Array.isArray(o.losers) ? o.losers : [];
  const losers = rawLosers.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const lo = l as Record<string, unknown>;
    const rung = typeof lo.rung === "string" ? lo.rung : "";
    if (!rung) return [];
    return [{ rung, why: typeof lo.why === "string" ? lo.why : "" }];
  });
  const scopeIds = Array.isArray(o.scope_ids) ? o.scope_ids : null;
  return {
    target: typeof o.target === "string" ? o.target : "value",
    key,
    outcome: typeof o.outcome === "string" ? o.outcome : "resolved",
    source: typeof o.source === "string" ? o.source : null,
    itemKey: typeof o.item_key === "string" ? o.item_key : null,
    winner: typeof o.winner === "string" ? o.winner : null,
    losers,
    scopeCount: scopeIds ? scopeIds.length : null,
  };
}

/** Plain English for a precedence rung, because `scope_bound` is not a word. */
const RUNG_WORDS: Record<string, string> = {
  agent_default: "the agent's saved default",
  scope_bound: "the scope it is bound to",
  client: "the value sent with this turn",
};

function rungWords(rung: string): string {
  return RUNG_WORDS[rung] ?? rung;
}

/**
 * WHY THIS VALUE — the resolution traces the server already sends and nothing
 * rendered. `bindings.traces` carries one row per resolution: where the value
 * came from, whether more than one scope offered it, and (DYN-11) which rung of
 * the precedence ladder won with every rung that lost and why. The server has
 * emitted this since scope bindings shipped; until now it arrived and was
 * dropped on the floor, so "why did it say that" had an answer nobody could see.
 *
 * Values are deliberately absent here — a trace row names the RUNG, never what
 * it held, so a provenance list can never become a second copy of a sensitive
 * cell. The value itself is one section up, where the reader's own permissions
 * already decided whether they may see it.
 */
function BindingTraces({ traces }: { traces: unknown[] | null | undefined }) {
  const rows = useMemo(
    () =>
      (traces ?? [])
        .map(traceFields)
        .filter((r): r is NonNullable<ReturnType<typeof traceFields>> => !!r),
    [traces],
  );
  if (rows.length === 0) return null;
  return (
    <section className="px-4 pt-4">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Why this value
        </h3>
        <span className="text-[10px] text-muted-foreground">
          one row per resolution — names only, never the value
        </span>
      </div>
      <ul className="mt-1.5 divide-y divide-border/60 rounded-md border border-border">
        {rows.map((r, i) => (
          <li key={`${r.target}:${r.key}:${i}`} className="px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-foreground">
                {r.key}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {r.target === "context_policy" ? "slot" : "variable"}
              </span>
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {r.outcome}
              </span>
            </div>
            <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed text-foreground/90">
              {r.winner && (
                <p>
                  Took{" "}
                  <span className="font-medium">{rungWords(r.winner)}</span>.
                </p>
              )}
              {r.losers.map((l) => (
                <p key={l.rung} className="text-muted-foreground">
                  Did not take{" "}
                  <span className="font-medium">{rungWords(l.rung)}</span>
                  {l.why ? ` — ${l.why}.` : "."}
                </p>
              ))}
              {r.source && !r.winner && (
                <p>
                  From <span className="font-medium">{r.source}</span>
                  {r.itemKey ? ` (context item ${r.itemKey})` : ""}.
                </p>
              )}
              {r.scopeCount !== null && r.scopeCount > 1 && (
                <p className="text-muted-foreground">
                  {r.scopeCount} active scopes offered a value for this name.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One plain-text bundle of everything resolved — for "Copy all for AI". */
function buildCopyAllText(data: ContextPreviewResponse): string {
  const parts: string[] = [];
  if (data.injected_block) {
    parts.push("## Injected context block\n\n" + data.injected_block);
  }
  const tier = (title: string, vars: unknown) => {
    const keys = vars && typeof vars === "object" ? Object.keys(vars) : [];
    if (keys.length === 0) return;
    const lines = keys.sort().map((k) => {
      const f = varFields((vars as Record<string, unknown>)[k]);
      return `- ${k}: ${f.value}`;
    });
    parts.push(`## ${title}\n\n${lines.join("\n")}`);
  };
  tier("Variables — injected directly", data.variables?.direct);
  tier("Variables — tool-accessible", data.variables?.tool_accessible);
  tier("Variables — searchable", data.variables?.searchable);
  if (data.bindings) {
    tier("Agent variables (scope-filled)", data.bindings.variables);
    tier("Agent context policies (scope-filled)", data.bindings.context);
  }
  return parts.join("\n\n");
}

function ResolvedView({
  preview,
  agentId,
}: {
  /** Panel-level preview state — lifted so the surface scope reads the same data. */
  preview: ContextPreviewState;
  agentId?: string;
}) {
  const { status, data, error, refresh } = preview;
  const copyAllText = useMemo(
    () => (data ? buildCopyAllText(data) : ""),
    [data],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
            status === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "error" ? "bg-destructive" : "bg-primary",
              status === "loading" && "animate-pulse",
            )}
          />
          {status === "loading" ? "Resolving…" : "Server truth"}
        </span>
        <span className="flex-1" />
        {copyAllText && (
          <span
            className="relative h-7 w-7 shrink-0"
            title="Copy everything the agent receives"
          >
            <InlineCopyButton
              content={copyAllText}
              formatJson={false}
              size="sm"
              tooltipText="Copy all for AI"
            />
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-primary hover:text-primary"
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
            <ErrorAlchemyMenu error={error} />
          </div>
        )}

        {data && <ResolvedBody data={data} agentId={agentId} />}
      </div>
    </div>
  );
}

/**
 * A scope-type label is an ARRAY when two scopes of that type are active at once
 * (a conversation on two Clients, a task on two Repositories) — resolve_full_context
 * stopped collapsing those to one name. Flatten so every active scope stays visible;
 * keeping only the plain strings would silently hide exactly the multi-scope case.
 */
function flattenScopeLabels(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw as Record<string, unknown>).flatMap((v) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : typeof v === "string"
        ? [v]
        : [],
  );
}

function ResolvedBody({
  data,
  agentId,
}: {
  data: ContextPreviewResponse;
  agentId?: string;
}) {
  const scopeLabels = useMemo(
    () => flattenScopeLabels(data.scope_labels),
    [data.scope_labels],
  );

  const block = data.injected_block ?? null;

  return (
    <>
      <section className="px-4 pt-3">
        <div className="flex items-baseline gap-2">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <FileCode2 className="h-3 w-3" />
            Injected context block
          </h3>
          {typeof data.block_byte_length === "number" &&
            data.block_byte_length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {data.block_byte_length.toLocaleString()} bytes
                {data.block_producer ? ` · ${data.block_producer}` : ""}
              </span>
            )}
        </div>
        {block ? (
          <div className="group/block relative mt-1.5">
            {/* Auto-grows to full content — the panel scrolls, never this box. */}
            <pre className="whitespace-pre-wrap break-words rounded-md border border-primary/20 bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
              {block}
            </pre>
            <InlineCopyButton
              content={block}
              formatJson={false}
              size="sm"
              className="opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/block:opacity-100"
            />
          </div>
        ) : (
          <div className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs italic text-muted-foreground">
            No block would be injected — no organization or scopes active.
          </div>
        )}
        {scopeLabels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {scopeLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </section>

      <VariableGroup
        title="Injected directly"
        hint="in the prompt every turn"
        vars={data.variables?.direct as Record<string, unknown> | undefined}
      />
      <VariableGroup
        title="Tool-accessible"
        hint="fetched on demand"
        vars={
          data.variables?.tool_accessible as Record<string, unknown> | undefined
        }
      />
      <VariableGroup
        title="Searchable"
        hint="via search only"
        vars={data.variables?.searchable as Record<string, unknown> | undefined}
      />

      {agentId && data.bindings && (
        <section className="px-4 pt-4">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Braces className="h-3 w-3" />
            Agent variable &amp; slot fill
          </h3>
          <VariableGroup
            title="Variables"
            hint="scope-filled"
            vars={
              data.bindings.variables as Record<string, unknown> | undefined
            }
          />
          <VariableGroup
            title="Context policies"
            hint="scope-filled"
            vars={data.bindings.context as Record<string, unknown> | undefined}
          />
          <BindingTraces
            traces={data.bindings.traces as unknown[] | undefined}
          />
        </section>
      )}
    </>
  );
}

/** Stringified length of any attached-entry value, mirroring the wire size. */
function entryChars(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return value.length;
  if (typeof value === "object") {
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") return content.length;
    try {
      return JSON.stringify(value).length;
    } catch {
      return String(value).length;
    }
  }
  return String(value).length;
}

export function ContextPreviewPanel({
  conversationId,
  agentId,
}: ContextPreviewPanelProps) {
  const [view, setView] = useState<View>("resolved");

  // Lifted to the panel so (a) the surface scope reads the same server truth
  // the Resolved view renders, and (b) data survives tab switches.
  const preview = useContextPreview({ conversationId, agentId, enabled: true });

  // Attached-context mirrors for the surface scope. All selectors are
  // null-safe for the no-conversation case (they return empty defaults).
  const cid = conversationId ?? "";
  const selectEntries = useMemo(() => selectInstanceContextEntries(cid), [cid]);
  const entries = useAppSelector(selectEntries);
  const clientTools = useAppSelector(selectInstanceClientTools(cid));
  const memoryOn = useAppSelector(selectIsMemoryEnabledForConversation(cid));
  const memoryModel = useAppSelector(selectMemoryModelForConversation(cid));
  const memoryScope = useAppSelector(selectMemoryScopeForConversation(cid));
  const layers = useActiveContextLayerItems(cid);

  // Fresh on every render; SurfaceRuntimeProvider holds it in a ref and only
  // calls it when the user hits Run.
  const getScope = () => {
    const data = preview.data;
    const asRecord = (v: unknown): Record<string, unknown> | undefined =>
      v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
    return createContextPreviewScope({
      active_view: view,
      preview_status: preview.status,
      preview_error: preview.error ?? undefined,
      injected_block: data?.injected_block ?? undefined,
      block_byte_length:
        typeof data?.block_byte_length === "number"
          ? data.block_byte_length
          : undefined,
      block_producer: data?.block_producer ?? undefined,
      scope_labels: data?.scope_labels
        ? flattenScopeLabels(data.scope_labels)
        : undefined,
      resolved_preview: asRecord(data),
      variables_direct: asRecord(data?.variables?.direct),
      variables_tool_accessible: asRecord(data?.variables?.tool_accessible),
      variables_searchable: asRecord(data?.variables?.searchable),
      binding_variables: asRecord(data?.bindings?.variables),
      binding_context_policies: asRecord(data?.bindings?.context),
      attached_entries: entries.map((e): AttachedContextEntrySummary => {
        const docKind = docKindForContextKey(e.key);
        return {
          key: e.key,
          label: e.label?.trim() || e.key,
          kind:
            docKind === "working"
              ? "working_document"
              : docKind === "scratch"
                ? "scratchpad"
                : e.slotMatched
                  ? "slot"
                  : "extra",
          chars: entryChars(e.value),
        };
      }),
      attached_client_tools: clientTools.length > 0 ? [...clientTools] : [],
      observational_memory: conversationId
        ? { enabled: memoryOn, model: memoryModel, scope: memoryScope }
        : undefined,
      active_context_layers: layers.items.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.typeLabel ?? "",
      })),
      conversation_id: conversationId,
      conversation_agent_id: agentId,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={CONTEXT_PREVIEW_SURFACE_NAME}
      getScope={getScope}
    >
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5">
        {(
          [
            ["resolved", "Resolved"],
            ["compare", "Old vs new"],
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
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "resolved" ? (
        <ResolvedView preview={preview} agentId={agentId} />
      ) : view === "compare" ? (
        <ContextCompareView conversationId={conversationId} agentId={agentId} />
      ) : conversationId ? (
        <AttachedContextSection conversationId={conversationId} />
      ) : (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Attachments appear once a conversation exists.
        </div>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
