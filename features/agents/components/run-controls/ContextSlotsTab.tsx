"use client";

/**
 * ContextSlotsTab — Agent Builder / Context tab
 *
 * Engineer-facing surface for setting the `context` dict that accompanies
 * every submission. Two sections:
 *
 *   1. **Declared slots** — whatever `contextSlots` the agent defines.
 *      Always rendered, even when empty, with the slot's type/label/description.
 *      Values round-trip through localStorage (see useBuilderContextSeed)
 *      so the engineer doesn't have to re-enter them after reload, reset,
 *      or auto-clear split.
 *
 *   2. **Ad-hoc keys** — free-form additions for testing what happens when
 *      the agent is called with context keys outside its declared slots
 *      (useful for probing ctx_get's unknown-key behavior).
 *
 * All edits dispatch `setContextEntry` AND persist to localStorage so the
 * value survives the instance being destroyed (e.g. on reset).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, RefreshCw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import type {
  ContextObjectType,
  ContextSlot,
} from "@/features/agents/types/agent-api-types";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import { selectAgentContextSlots } from "@/features/agents/redux/agent-definition/selectors";
import {
  setContextEntry,
  removeContextEntry,
  clearInstanceContext,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  writeBuilderContextEntry,
  deleteBuilderContextEntry,
  clearBuilderContext,
} from "@/features/agents/hooks/useBuilderContextSeed";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// =============================================================================
// Selectors
// =============================================================================

const EMPTY_SLOTS: ContextSlot[] = [];

function makeSelectAgentIdForConversation(conversationId: string) {
  return (state: RootState): string | null =>
    state.conversations.byConversationId[conversationId]?.agentId ?? null;
}

/** Instance context map for this conversation, or undefined if none. */
function makeSelectInstanceContextMap(conversationId: string) {
  return (state: RootState): Record<string, InstanceContextEntry> | undefined =>
    state.instanceContext.byConversationId[conversationId];
}
const EMPTY_MAP: Record<string, InstanceContextEntry> = {};

// =============================================================================
// Per-type rendering metadata
// =============================================================================

const TYPE_OPTIONS: ContextObjectType[] = [
  "text",
  "json",
  "file_url",
  "db_ref",
  "user",
  "org",
  "workspace",
  "project",
  "task",
  "variable",
];

export const TYPE_COLORS: Record<ContextObjectType, string> = {
  text: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  json: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  file_url: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  db_ref: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  user: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  org: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  workspace: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  project: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  task: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  variable: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

// =============================================================================
// Value ↔ string conversion per type
// =============================================================================

/**
 * Convert the stored value into the string the textarea/input should show.
 * JSON values are pretty-printed; strings are shown as-is.
 */
function valueToEditorString(value: unknown, type: ContextObjectType): string {
  if (value === undefined || value === null) return "";
  if (type === "json") {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Parse the editor string back into a stored value. JSON tries to parse;
 * on parse error it falls through to keeping the raw string (so partial
 * edits aren't destructive). Other types store the raw string.
 */
function editorStringToValue(
  text: string,
  type: ContextObjectType,
): { value: unknown; jsonError?: string } {
  if (type === "json") {
    if (text.trim() === "") return { value: "" };
    try {
      return { value: JSON.parse(text) };
    } catch (err) {
      return {
        value: text,
        jsonError: err instanceof Error ? err.message : "Invalid JSON",
      };
    }
  }
  return { value: text };
}

// =============================================================================
// Component
// =============================================================================

interface ContextSlotsTabProps {
  conversationId: string;
}

export function ContextSlotsTab({ conversationId }: ContextSlotsTabProps) {
  const dispatch = useAppDispatch();
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const agentId = useAppSelector(
    useMemo(
      () => makeSelectAgentIdForConversation(conversationId),
      [conversationId],
    ),
  );

  const declaredSlots =
    useAppSelector((state) =>
      agentId ? selectAgentContextSlots(state, agentId) : undefined,
    ) ?? EMPTY_SLOTS;

  const contextEntries =
    useAppSelector(
      useMemo(
        () => makeSelectInstanceContextMap(conversationId),
        [conversationId],
      ),
    ) ?? EMPTY_MAP;

  // Split existing entries into declared vs ad-hoc based on whether the key
  // matches any declared slot key. We don't trust `slotMatched` alone —
  // declared slots should always render even when the user hasn't set a
  // value yet.
  const declaredKeys = useMemo(
    () => new Set(declaredSlots.map((s) => s.key)),
    [declaredSlots],
  );

  const adHocEntries = useMemo(
    () =>
      Object.values(contextEntries).filter(
        (entry) => !declaredKeys.has(entry.key),
      ),
    [contextEntries, declaredKeys],
  );

  const writeEntry = useCallback(
    (
      key: string,
      value: unknown,
      type: ContextObjectType,
      label: string,
      slotMatched: boolean,
    ) => {
      dispatch(
        setContextEntry({
          conversationId,
          key,
          value,
          type,
          label,
          slotMatched,
        }),
      );
      if (agentId) {
        writeBuilderContextEntry(agentId, key, {
          value,
          type,
          label,
          slotMatched,
        });
      }
    },
    [conversationId, agentId, dispatch],
  );

  const removeEntry = useCallback(
    (key: string) => {
      dispatch(removeContextEntry({ conversationId, key }));
      if (agentId) deleteBuilderContextEntry(agentId, key);
    },
    [conversationId, agentId, dispatch],
  );

  const handleClearAll = useCallback(() => {
    setClearAllOpen(true);
  }, []);

  const confirmClearAll = useCallback(() => {
    dispatch(clearInstanceContext(conversationId));
    if (agentId) clearBuilderContext(agentId);
    setClearAllOpen(false);
  }, [conversationId, agentId, dispatch]);

  const hasAnyValues =
    Object.keys(contextEntries).length > 0 || adHocEntries.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2 space-y-4">
        {/* Declared slots section */}
        <section>
          <SectionHeader
            title="Declared slots"
            count={declaredSlots.length}
            description="Defined on the agent. Values are saved per agent across sessions."
          />
          {declaredSlots.length === 0 ? (
            <div className="mt-2 px-3 py-2 text-[11px] text-muted-foreground border border-dashed border-border rounded-md">
              This agent defines no context slots. Use the Ad-hoc section below
              to test with arbitrary keys.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {declaredSlots.map((slot) => (
                <DeclaredSlotRow
                  key={slot.key}
                  slot={slot}
                  entry={contextEntries[slot.key]}
                  onWrite={writeEntry}
                  onClear={() => removeEntry(slot.key)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Ad-hoc section */}
        <section>
          <SectionHeader
            title="Ad-hoc context"
            count={adHocEntries.length}
            description="Extra keys sent to the server that aren't declared on the agent."
            rightSlot={
              hasAnyValues ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove every value for this agent"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear all
                </button>
              ) : null
            }
          />
          <div className="mt-2 space-y-2">
            {adHocEntries.map((entry) => (
              <AdHocEntryRow
                key={entry.key}
                entry={entry}
                onWrite={writeEntry}
                onDelete={() => removeEntry(entry.key)}
              />
            ))}
            <AddAdHocRow
              existingKeys={new Set(Object.keys(contextEntries))}
              onAdd={(key, type) =>
                writeEntry(
                  key,
                  type === "json" ? {} : "",
                  type,
                  key,
                  /* slotMatched */ false,
                )
              }
            />
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={clearAllOpen}
        onOpenChange={(open) => {
          if (!open) setClearAllOpen(false);
        }}
        title="Clear all context"
        description="Clear every context value for this agent? This removes them from the current instance AND from saved storage."
        confirmLabel="Clear all"
        variant="destructive"
        onConfirm={confirmClearAll}
      />
    </div>
  );
}

// =============================================================================
// Shared primitives
// =============================================================================

function SectionHeader({
  title,
  count,
  description,
  rightSlot,
}: {
  title: string;
  count: number;
  description: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            ({count})
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
          {description}
        </p>
      </div>
      {rightSlot}
    </div>
  );
}

function TypeBadge({ type }: { type: ContextObjectType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0 text-[9px] font-mono font-medium rounded border",
        TYPE_COLORS[type],
      )}
    >
      {type}
    </span>
  );
}

// =============================================================================
// Declared slot row
// =============================================================================

function DeclaredSlotRow({
  slot,
  entry,
  onWrite,
  onClear,
}: {
  slot: ContextSlot;
  entry: InstanceContextEntry | undefined;
  onWrite: (
    key: string,
    value: unknown,
    type: ContextObjectType,
    label: string,
    slotMatched: boolean,
  ) => void;
  onClear: () => void;
}) {
  const type = slot.type;
  const label = slot.label ?? slot.key;
  const initialString = valueToEditorString(entry?.value, type);

  return (
    <ValueEditorCard
      keyText={slot.key}
      labelText={label}
      type={type}
      typeEditable={false}
      description={slot.description}
      initialString={initialString}
      onCommit={(text) => {
        const { value } = editorStringToValue(text, type);
        onWrite(slot.key, value, type, label, /* slotMatched */ true);
      }}
      rightAction={
        entry !== undefined ? (
          <button
            type="button"
            onClick={onClear}
            title="Clear value"
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
      isEmpty={entry === undefined}
    />
  );
}

// =============================================================================
// Ad-hoc entry row
// =============================================================================

function AdHocEntryRow({
  entry,
  onWrite,
  onDelete,
}: {
  entry: InstanceContextEntry;
  onWrite: (
    key: string,
    value: unknown,
    type: ContextObjectType,
    label: string,
    slotMatched: boolean,
  ) => void;
  onDelete: () => void;
}) {
  const [type, setType] = useState<ContextObjectType>(entry.type);
  const initialString = valueToEditorString(entry.value, type);

  const handleTypeChange = (next: ContextObjectType) => {
    setType(next);
    // Re-commit the existing value under the new type so payload stays in sync.
    const { value } = editorStringToValue(
      valueToEditorString(entry.value, entry.type),
      next,
    );
    onWrite(entry.key, value, next, entry.label, /* slotMatched */ false);
  };

  return (
    <ValueEditorCard
      keyText={entry.key}
      labelText={entry.label}
      type={type}
      typeEditable
      onTypeChange={handleTypeChange}
      initialString={initialString}
      onCommit={(text) => {
        const { value } = editorStringToValue(text, type);
        onWrite(entry.key, value, type, entry.label, false);
      }}
      rightAction={
        <button
          type="button"
          onClick={onDelete}
          title="Remove key"
          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      }
      isEmpty={false}
    />
  );
}

// =============================================================================
// Value editor card — shared by declared + ad-hoc rows
// =============================================================================

interface ValueEditorCardProps {
  keyText: string;
  labelText: string;
  type: ContextObjectType;
  typeEditable: boolean;
  onTypeChange?: (type: ContextObjectType) => void;
  description?: string;
  initialString: string;
  onCommit: (text: string) => void;
  rightAction: React.ReactNode;
  isEmpty: boolean;
}

function ValueEditorCard({
  keyText,
  labelText,
  type,
  typeEditable,
  onTypeChange,
  description,
  initialString,
  onCommit,
  rightAction,
  isEmpty,
}: ValueEditorCardProps) {
  const [draft, setDraft] = useState(initialString);
  const [dirty, setDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Reset draft when the committed string changes AND the user isn't in the
  // middle of an edit. This lets external updates (seed-on-mount, autoclear
  // split, etc.) flow in without clobbering a live edit.
  const latestCommittedRef = useRef(initialString);
  useEffect(() => {
    latestCommittedRef.current = initialString;
    if (!dirty) {
      setDraft(initialString);
    }
    // We intentionally DON'T depend on `dirty` — only on the committed value.
    // When commit finishes, `dirty` flips to false but `initialString` is
    // about to update on the next render cycle anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialString]);

  const commit = useCallback(() => {
    if (!dirty) return;
    onCommit(draft);
    setDirty(false);
    if (type === "json") {
      const { jsonError: err } = editorStringToValue(draft, "json");
      setJsonError(err ?? null);
    } else {
      setJsonError(null);
    }
  }, [dirty, draft, onCommit, type]);

  const revert = useCallback(() => {
    setDraft(latestCommittedRef.current);
    setDirty(false);
    setJsonError(null);
  }, [latestCommittedRef]);

  const isFileUrl = type === "file_url";

  return (
    <div className="border border-border rounded-md bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-mono text-[11px] text-foreground truncate">
            {keyText}
          </span>
          {labelText !== keyText && (
            <span className="text-[10px] text-muted-foreground truncate">
              — {labelText}
            </span>
          )}
        </div>
        {typeEditable && onTypeChange ? (
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value as ContextObjectType)}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-primary"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : (
          <TypeBadge type={type} />
        )}
        {rightAction}
      </div>

      {/* Description (declared slots only) */}
      {description && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground/80 border-b border-border/50">
          {description}
        </div>
      )}

      {/* Editor */}
      <div className="p-1.5">
        {isFileUrl ? (
          <input
            type="url"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            onBlur={commit}
            placeholder="https://…"
            className="w-full text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary"
          />
        ) : (
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            onBlur={commit}
            placeholder={
              isEmpty
                ? type === "json"
                  ? '{\n  "example": true\n}'
                  : "Enter value…"
                : ""
            }
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            spellCheck={false}
            className={cn(
              "w-full text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground resize-y focus:outline-none focus:border-primary",
              jsonError && "border-destructive focus:border-destructive",
            )}
          />
        )}

        {/* Footer: status + actions */}
        <div className="mt-1 flex items-center justify-between gap-2 min-h-[16px]">
          <div className="text-[10px] flex-1 min-w-0">
            {jsonError ? (
              <span className="text-destructive truncate" title={jsonError}>
                JSON error: {jsonError}
              </span>
            ) : isEmpty ? (
              <span className="text-muted-foreground/60">not set</span>
            ) : dirty ? (
              <span className="text-amber-500">unsaved — blur to commit</span>
            ) : (
              <span className="text-muted-foreground/60">saved</span>
            )}
          </div>
          {dirty && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={revert}
                className="p-0.5 text-muted-foreground hover:text-foreground"
                title="Discard changes"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={commit}
                className="p-0.5 text-primary hover:text-primary/80"
                title="Commit now"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Add ad-hoc row
// =============================================================================

function AddAdHocRow({
  existingKeys,
  onAdd,
}: {
  existingKeys: Set<string>;
  onAdd: (key: string, type: ContextObjectType) => void;
}) {
  const [keyDraft, setKeyDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState<ContextObjectType>("text");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      setError("Enter a key");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      setError("Use letters/numbers/underscore, starting with a letter");
      return;
    }
    if (existingKeys.has(trimmed)) {
      setError("Key already exists");
      return;
    }
    onAdd(trimmed, typeDraft);
    setKeyDraft("");
    setTypeDraft("text");
    setError(null);
  };

  return (
    <div className="border border-dashed border-border rounded-md px-2 py-1.5 bg-card/20">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={keyDraft}
          onChange={(e) => {
            setKeyDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="new_context_key"
          className="flex-1 min-w-0 text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary"
        />
        <select
          value={typeDraft}
          onChange={(e) => setTypeDraft(e.target.value as ContextObjectType)}
          className="text-[10px] font-mono bg-background border border-border rounded px-1 py-1 text-foreground focus:outline-none focus:border-primary"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      {error && (
        <div className="mt-1 text-[10px] text-destructive">{error}</div>
      )}
    </div>
  );
}
