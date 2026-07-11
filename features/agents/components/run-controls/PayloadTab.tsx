"use client";

/**
 * PayloadTab — read-only mirror of `assembleRequest` for the Creator Panel.
 *
 * Shows exactly what will be POSTed to the agent backend if the user
 * submits right now. Built directly on top of the same `assembleRequest`
 * function the executor uses, so what's displayed equals what's sent
 * (modulo turn-1-only fields like `conversation_id`/`is_new`/`store`/
 * `cache_bypass`, which are stamped inside the thunk at execution time).
 *
 * Sections:
 *   - Context (slot-matched / ad-hoc / declared-but-unset)
 *   - User input
 *   - Variables
 *   - Config overrides
 *   - Scope (org/project/task)
 *   - Source (source_app / source_feature)
 *   - Client tools
 *   - Admin flags (block_mode, snapshot, memory*)
 *   - Raw payload (collapsed JSON) + Copy button
 */

import { useCallback, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import { makeSelectAssembledRequest } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectAgentContextSlots } from "@/features/agents/redux/agent-definition/selectors";
import { EmptyStats, StatRow, StatSection } from "./panels/shared";
import { TYPE_COLORS } from "./ContextSlotsTab";
import { cn } from "@/lib/utils";

// =============================================================================
// Selectors
// =============================================================================

const EMPTY_SLOTS: ContextSlot[] = [];
const EMPTY_MAP: Record<string, InstanceContextEntry> = {};

function selectAgentIdForConversation(
  state: RootState,
  conversationId: string,
): string | null {
  return state.conversations.byConversationId[conversationId]?.agentId ?? null;
}

function selectInstanceContextMap(
  state: RootState,
  conversationId: string,
): Record<string, InstanceContextEntry> {
  return state.instanceContext.byConversationId[conversationId] ?? EMPTY_MAP;
}

// =============================================================================
// Display helpers
// =============================================================================

function TypeBadge({ type }: { type: ContextObjectType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-px rounded border text-[9px] font-mono uppercase tracking-wide",
        TYPE_COLORS[type],
      )}
    >
      {type}
    </span>
  );
}

function valuePreview(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ValueBlock({
  value,
  type,
}: {
  value: unknown;
  type?: ContextObjectType;
}) {
  const text = valuePreview(value);
  const isMultiline =
    type === "json" || text.length > 80 || text.includes("\n");
  if (!isMultiline) {
    return (
      <span className="font-mono text-[11px] text-foreground/90 break-all">
        {text}
      </span>
    );
  }
  return (
    <pre className="font-mono text-[11px] text-foreground/90 bg-muted/30 border border-border/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

function ContextEntryRow({
  entryKey,
  type,
  label,
  description,
  value,
  hasValue,
}: {
  entryKey: string;
  type: ContextObjectType;
  label?: string;
  description?: string;
  value: unknown;
  hasValue: boolean;
}) {
  return (
    <div className="py-1.5 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[11px] text-foreground font-semibold">
          {entryKey}
        </span>
        <TypeBadge type={type} />
        {label && (
          <span className="text-[10px] text-muted-foreground">{label}</span>
        )}
      </div>
      {description && (
        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
          {description}
        </div>
      )}
      <div className="mt-1">
        {hasValue ? (
          <ValueBlock value={value} type={type} />
        ) : (
          <span className="text-[11px] text-muted-foreground/60 italic">
            — not provided —
          </span>
        )}
      </div>
    </div>
  );
}

function MessagePartsView({ parts }: { parts: MessagePart[] }) {
  if (parts.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground/60 italic">
        — empty —
      </span>
    );
  }
  return (
    <div className="space-y-1">
      {parts.map((part, idx) => {
        const partType = (part as { type?: string }).type ?? "unknown";
        const text = (part as { text?: string }).text;
        return (
          <div
            key={idx}
            className="flex items-start gap-2 py-1 border-b border-border/30 last:border-b-0"
          >
            <span className="inline-flex items-center px-1.5 py-px rounded border text-[9px] font-mono uppercase tracking-wide bg-muted/40 border-border/40 text-muted-foreground shrink-0">
              {partType}
            </span>
            <div className="flex-1 min-w-0">
              {text ? (
                <span className="font-mono text-[11px] text-foreground/90 break-all">
                  {text.length > 200 ? `${text.slice(0, 200)}…` : text}
                </span>
              ) : (
                <pre className="font-mono text-[10px] text-foreground/70 bg-muted/20 border border-border/30 rounded px-1.5 py-1 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                  {valuePreview(part)}
                </pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main
// =============================================================================

interface PayloadTabProps {
  conversationId: string;
}

export function PayloadTab({ conversationId }: PayloadTabProps) {
  const assembledRequestSelector = useMemo(
    () => makeSelectAssembledRequest(conversationId),
    [conversationId],
  );
  const request = useAppSelector(assembledRequestSelector);

  const agentId = useAppSelector((state) =>
    selectAgentIdForConversation(state, conversationId),
  );

  const declaredSlots =
    useAppSelector((state) =>
      agentId ? selectAgentContextSlots(state, agentId) : undefined,
    ) ?? EMPTY_SLOTS;

  const contextMap = useAppSelector((state) =>
    selectInstanceContextMap(state, conversationId),
  );

  const slotsByKey = useMemo(() => {
    const map = new Map<string, ContextSlot>();
    for (const slot of declaredSlots) map.set(slot.key, slot);
    return map;
  }, [declaredSlots]);

  const declaredKeys = useMemo(
    () => new Set(declaredSlots.map((s) => s.key)),
    [declaredSlots],
  );

  const { slotMatched, adHoc, declaredUnset } = useMemo(() => {
    const entries = Object.values(contextMap);
    const matched: InstanceContextEntry[] = [];
    const ad: InstanceContextEntry[] = [];
    for (const e of entries) {
      if (declaredKeys.has(e.key)) matched.push(e);
      else ad.push(e);
    }
    const setKeys = new Set(matched.map((e) => e.key));
    const unset = declaredSlots.filter((s) => !setKeys.has(s.key));
    return { slotMatched: matched, adHoc: ad, declaredUnset: unset };
  }, [contextMap, declaredKeys, declaredSlots]);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!request) return;
    try {
      const text = JSON.stringify(request, null, 2);
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
    } catch (err) {
      console.error("Failed to copy payload:", err);
    }
  }, [request]);

  if (!request) {
    return (
      <EmptyStats text="Nothing to send yet — type a message or set context." />
    );
  }

  const userInput = request.user_input;
  const variables = request.variables;
  const configOverrides = request.config_overrides;
  const tools = request.tools;
  const toolsReplace = request.tools_replace;
  const clientEnvelope = request.client;
  // OpenAPI ClientContext.capabilities is optional; omit ≡ none declared.
  const clientCapabilities = clientEnvelope?.capabilities;
  const hasContextSection =
    slotMatched.length > 0 || adHoc.length > 0 || declaredUnset.length > 0;

  return (
    <div className="px-3 py-2 space-y-3">
      {/* ── Context ──────────────────────────────────────────────────────── */}
      {hasContextSection && (
        <StatSection title="Context (sent as `context` dict)">
          {slotMatched.length > 0 && (
            <div className="mt-1">
              <div className="text-[10px] font-semibold text-muted-foreground/80 mb-0.5">
                Slot-matched ({slotMatched.length})
              </div>
              <div>
                {slotMatched.map((entry) => {
                  const slot = slotsByKey.get(entry.key);
                  return (
                    <ContextEntryRow
                      key={entry.key}
                      entryKey={entry.key}
                      type={(slot?.type ?? entry.type) as ContextObjectType}
                      label={slot?.label ?? entry.label}
                      description={slot?.description}
                      value={entry.value}
                      hasValue
                    />
                  );
                })}
              </div>
            </div>
          )}

          {adHoc.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold text-muted-foreground/80 mb-0.5">
                Ad-hoc — no matching slot ({adHoc.length})
              </div>
              <div>
                {adHoc.map((entry) => (
                  <ContextEntryRow
                    key={entry.key}
                    entryKey={entry.key}
                    type={entry.type}
                    label={entry.label}
                    description="(no slot defined on agent)"
                    value={entry.value}
                    hasValue
                  />
                ))}
              </div>
            </div>
          )}

          {declaredUnset.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold text-muted-foreground/80 mb-0.5">
                Declared but unset ({declaredUnset.length}) — NOT sent
              </div>
              <div>
                {declaredUnset.map((slot) => (
                  <ContextEntryRow
                    key={slot.key}
                    entryKey={slot.key}
                    type={slot.type}
                    label={slot.label}
                    description={slot.description}
                    value={undefined}
                    hasValue={false}
                  />
                ))}
              </div>
            </div>
          )}

          {request.context && (
            <details className="mt-2">
              <summary className="text-[10px] font-semibold text-muted-foreground/80 cursor-pointer hover:text-foreground select-none">
                Wire payload (raw JSON)
              </summary>
              <pre className="mt-1 font-mono text-[11px] text-foreground/90 bg-muted/30 border border-border/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(request.context, null, 2)}
              </pre>
            </details>
          )}
        </StatSection>
      )}

      {!hasContextSection && (
        <StatSection title="Context (sent as `context` dict)">
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — no context entries and no declared slots —
          </div>
        </StatSection>
      )}

      {/* ── User input ───────────────────────────────────────────────────── */}
      <StatSection title="User input">
        {userInput == null ? (
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — empty (will not be sent) —
          </div>
        ) : typeof userInput === "string" ? (
          <ValueBlock value={userInput} type="text" />
        ) : (
          <MessagePartsView parts={userInput} />
        )}
      </StatSection>

      {/* ── Variables ────────────────────────────────────────────────────── */}
      <StatSection title="Variables">
        {variables && Object.keys(variables).length > 0 ? (
          <div>
            {Object.entries(variables).map(([k, v]) => (
              <div
                key={k}
                className="py-1 border-b border-border/30 last:border-b-0"
              >
                <div className="font-mono text-[11px] text-foreground font-semibold">
                  {k}
                </div>
                <div className="mt-0.5">
                  <ValueBlock value={v} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — none —
          </div>
        )}
      </StatSection>

      {/* ── Config overrides ─────────────────────────────────────────────── */}
      <StatSection title="Config overrides">
        {configOverrides && Object.keys(configOverrides).length > 0 ? (
          <pre className="font-mono text-[11px] text-foreground/90 bg-muted/30 border border-border/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(configOverrides, null, 2)}
          </pre>
        ) : (
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — defaults (no overrides) —
          </div>
        )}
      </StatSection>

      {/* ── Scope ────────────────────────────────────────────────────────── */}
      <StatSection title="Scope">
        <StatRow
          label="organization_id"
          value={request.organization_id ?? "—"}
        />
        <StatRow label="project_id" value={request.project_id ?? "—"} />
        <StatRow label="task_id" value={request.task_id ?? "—"} />
      </StatSection>

      {/* ── Source ───────────────────────────────────────────────────────── */}
      <StatSection title="Source">
        <StatRow label="source_app" value={request.source_app ?? "—"} />
        <StatRow label="source_feature" value={request.source_feature ?? "—"} />
      </StatSection>

      {/* ── Tool injection ───────────────────────────────────────────────── */}
      <StatSection title="Tools (added to agent's set)">
        {(tools && tools.length > 0) ||
        (toolsReplace && toolsReplace.length > 0) ? (
          <>
            {tools && tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tools.map((spec, i) => (
                  <span
                    key={`${spec.kind}-${"name" in spec ? spec.name : spec.agent_id}-${i}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/40 bg-muted/30 font-mono text-[10px] text-foreground/90"
                    title={JSON.stringify(spec)}
                  >
                    <span className="text-muted-foreground/70">
                      {spec.kind}
                    </span>
                    <span>{"name" in spec ? spec.name : spec.agent_id}</span>
                    {"delegate" in spec && spec.delegate ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        ↳client
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            )}
            {toolsReplace && toolsReplace.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
                  tools_replace — overrides agent's saved set (
                  {toolsReplace.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {toolsReplace.map((spec, i) => (
                    <span
                      key={`r-${spec.kind}-${"name" in spec ? spec.name : spec.agent_id}-${i}`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-foreground/90"
                      title={JSON.stringify(spec)}
                    >
                      <span className="text-muted-foreground/70">
                        {spec.kind}
                      </span>
                      <span>{"name" in spec ? spec.name : spec.agent_id}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — none —
          </div>
        )}
      </StatSection>

      {/* ── Client capability envelope ───────────────────────────────────── */}
      <StatSection title="Client capabilities">
        {clientCapabilities && clientCapabilities.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1 mb-1">
              {clientCapabilities.map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 font-mono text-[10px] text-foreground/90"
                >
                  {cap}
                </span>
              ))}
            </div>
            <details>
              <summary className="text-[10px] font-semibold text-muted-foreground/80 cursor-pointer hover:text-foreground select-none">
                Capability state (raw JSON)
              </summary>
              <pre className="mt-1 font-mono text-[11px] text-foreground/90 bg-muted/30 border border-border/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(clientEnvelope?.state, null, 2)}
              </pre>
            </details>
          </>
        ) : (
          <div className="text-[11px] text-muted-foreground/60 italic py-1">
            — no surfaces declared —
          </div>
        )}
      </StatSection>

      {/* ── Admin flags ──────────────────────────────────────────────────── */}
      {(request.block_mode ||
        request.snapshot ||
        request.memory !== undefined ||
        request.memory_model ||
        request.memory_scope) && (
        <StatSection title="Admin flags">
          {request.block_mode && <StatRow label="block_mode" value="true" />}
          {request.snapshot && <StatRow label="snapshot" value="true" />}
          {request.memory !== undefined && (
            <StatRow label="memory" value={String(request.memory)} />
          )}
          {request.memory_model && (
            <StatRow label="memory_model" value={request.memory_model} />
          )}
          {request.memory_scope && (
            <StatRow label="memory_scope" value={request.memory_scope} />
          )}
        </StatSection>
      )}

      {/* ── Footer: copy + raw JSON ──────────────────────────────────────── */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground/70">
          + turn-1 fields (conversation_id, is_new, is_version, store,
          cache_bypass) will be added on first send
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-border/40 bg-muted/30 hover:bg-muted/50 text-foreground/80 hover:text-foreground transition-colors shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy as JSON
            </>
          )}
        </button>
      </div>

      <details>
        <summary className="text-[10px] font-semibold text-muted-foreground/80 cursor-pointer hover:text-foreground select-none">
          Full wire payload (raw JSON)
        </summary>
        <pre className="mt-1 font-mono text-[11px] text-foreground/90 bg-muted/30 border border-border/40 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(request, null, 2)}
        </pre>
      </details>
    </div>
  );
}
