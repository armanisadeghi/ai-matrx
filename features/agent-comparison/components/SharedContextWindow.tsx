"use client";

/**
 * SharedContextWindow
 *
 * A small floating editor that lets the user set shared context entries
 * applied to EVERY column at once. Writes fan out via
 * `broadcastContextEntry` / `broadcastRemoveContextEntry`.
 *
 * Why a custom editor (not embedding ContextSlotsTab):
 *   ContextSlotsTab is keyed to a single conversation and shows the
 *   AGENT's declared slots — those differ per column in the battle UI,
 *   so a single unified declared-slot UI doesn't make sense. The shared
 *   primitive here is the user-facing "set these keys for every run" — a
 *   simple key/value editor that broadcasts.
 *
 * Per-column declared slots remain accessible through each column's own
 * AgentConversationColumn → CreatorRunPanel → Context tab.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, Building2, Briefcase, ClipboardList, Layers } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectProjectId,
  selectProjectName,
  selectScopeSelectionsContext,
  selectTaskId,
  selectTaskName,
} from "@/lib/redux/slices/appContextSlice";
import {
  broadcastContextEntry,
  broadcastRemoveContextEntry,
} from "../redux/thunks";
import { selectBattleColumns } from "../redux/selectors";

interface SharedContextWindowProps {
  id: string;
  onClose: () => void;
}

interface DraftRow {
  key: string;
  value: string;
}

export function SharedContextWindow({ id, onClose }: SharedContextWindowProps) {
  const composer = useSharedContextComposer();
  const { previewEntries, previewKeys, handleUpdateValue, handleRemove } =
    composer;

  return (
    <WindowPanel
      id={id}
      title="Shared context (all columns)"
      width={460}
      height={520}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      // Read-only "where does this apply" status — header chrome, not body
      // content. Self-contained (reads its own selector), the NoteMetadataBar
      // pattern.
      actionsRight={<SharedContextScopeStatus />}
      // The "Add new key" composer is a window-level action bar, not body
      // content — it lives in the footer slot. Because the footer is a sibling
      // of the body, its draft/error state is hoisted into useSharedContextComposer
      // (the window root), mirroring FeedbackWindow's useFeedbackForm.
      footer={<SharedContextComposerFooter composer={composer} />}
    >
      <ActiveScopeReadout />

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {previewKeys.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground border border-dashed border-border rounded-md text-center">
            No shared context yet.
          </div>
        ) : (
          previewKeys.map((key) => {
            const entry = previewEntries[key];
            const text =
              typeof entry.value === "string"
                ? entry.value
                : JSON.stringify(entry.value);
            return (
              <SharedContextRow
                key={key}
                entryKey={key}
                initialValue={text}
                onCommit={(v) => handleUpdateValue(key, v)}
                onRemove={() => handleRemove(key)}
              />
            );
          })
        )}
      </div>
    </WindowPanel>
  );
}

// ─── useSharedContextComposer — hoisted shared state ──────────────────────────
// Owns the broadcast preview + the "Add new key" draft/error state + dispatches
// so the WindowPanel root can feed both the body (preview rows) and the footer
// slot (the composer). Mirrors FeedbackWindow's `useFeedbackForm`.

type SharedContextComposerState = ReturnType<typeof useSharedContextComposer>;

function useSharedContextComposer() {
  const dispatch = useAppDispatch();
  const columns = useAppSelector(selectBattleColumns);

  // Read entries from the FIRST submittable column as a preview of what's
  // currently broadcasted. (All columns hold the same values when the user
  // has only ever written through this window — they may diverge if a
  // user opened a column's own Context tab and edited it directly.)
  const firstColumnId = useMemo(
    () => columns.find((c) => c.agentId)?.conversationId ?? null,
    [columns],
  );

  const previewEntries = useAppSelector((state: RootState) =>
    firstColumnId
      ? state.instanceContext.byConversationId[firstColumnId] ?? {}
      : {},
  );

  const previewKeys = Object.keys(previewEntries).sort();

  const [draft, setDraft] = useState<DraftRow>({ key: "", value: "" });
  const [error, setError] = useState<string | null>(null);

  const submittableCount = columns.filter((c) => c.agentId).length;

  const handleAdd = () => {
    const trimmedKey = draft.key.trim();
    if (!trimmedKey) {
      setError("Enter a key");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedKey)) {
      setError("Letters/numbers/underscore, starting with a letter");
      return;
    }
    dispatch(
      broadcastContextEntry({
        key: trimmedKey,
        value: draft.value,
        type: "text",
        label: trimmedKey,
      }),
    );
    setDraft({ key: "", value: "" });
    setError(null);
  };

  const handleUpdateValue = (key: string, value: string) => {
    dispatch(
      broadcastContextEntry({
        key,
        value,
        type: "text",
        label: key,
      }),
    );
  };

  const handleRemove = (key: string) => {
    dispatch(broadcastRemoveContextEntry({ key }));
  };

  return {
    previewEntries,
    previewKeys,
    submittableCount,
    draft,
    setDraft,
    error,
    setError,
    handleAdd,
    handleUpdateValue,
    handleRemove,
  };
}

// ─── SharedContextComposerFooter — footer slot ────────────────────────────────
// The "Add new key" action bar. Identical behavior to the former in-body
// composer (key validation, error display, dispatch-on-add, input clearing) —
// it just lives in the WindowPanel footer slot now.

function SharedContextComposerFooter({
  composer,
}: {
  composer: SharedContextComposerState;
}) {
  const { submittableCount, draft, setDraft, error, setError, handleAdd } =
    composer;

  // The footer slot wrapper forces `select-none` and `[&_button]:h-5` on its
  // subtree (house style for icon-button footers). This composer has real text
  // inputs and a normal-height Add button, so re-assert `select-text` and the
  // button height here to keep behavior + appearance identical to the original.
  return (
    <div className="w-full py-1 select-text">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Add new key
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft.key}
          onChange={(e) => {
            setDraft({ ...draft, key: e.target.value });
            setError(null);
          }}
          placeholder="key_name"
          className="w-[140px] text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary"
        />
        <input
          type="text"
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="value"
          className="flex-1 min-w-0 text-[11px] bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary"
        />
        <Button
          size="sm"
          variant="default"
          onClick={handleAdd}
          disabled={submittableCount === 0}
          className="!h-7 shrink-0"
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>
      {error && (
        <div className="mt-1 text-[10px] text-destructive">{error}</div>
      )}
    </div>
  );
}

// ─── SharedContextScopeStatus — header status chip ───────────────────────────
// Read-only "where do edits apply" indicator. Self-contained (reads its own
// selector — the NoteMetadataBar pattern), so the header slot owns it without
// threading the count down from the root. Replaces the in-body info banner;
// the full sentence is preserved verbatim as the chip's tooltip.

function SharedContextScopeStatus() {
  const columns = useAppSelector(selectBattleColumns);
  const submittableCount = columns.filter((c) => c.agentId).length;

  const tooltip =
    submittableCount === 0
      ? "Add at least one column with an agent selected — context broadcasts to every column at once."
      : `Edits apply to all ${submittableCount} configured column${
          submittableCount === 1 ? "" : "s"
        }.`;

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        submittableCount === 0
          ? "bg-muted/40 text-muted-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      <Layers className="w-3 h-3" />
      {submittableCount === 0
        ? "No columns"
        : `${submittableCount} column${submittableCount === 1 ? "" : "s"}`}
    </span>
  );
}

function SharedContextRow({
  entryKey,
  initialValue,
  onCommit,
  onRemove,
}: {
  entryKey: string;
  initialValue: string;
  onCommit: (next: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const [dirty, setDirty] = useState(false);

  // External resync when broadcast updates the entry from elsewhere.
  // Only when the user isn't mid-edit.
  if (!dirty && draft !== initialValue) {
    setDraft(initialValue);
  }

  return (
    <div className="border border-border rounded-md bg-card/40">
      <div className="flex items-center gap-2 px-2 py-1 bg-muted/20 border-b border-border">
        <span className="font-mono text-[11px] text-foreground truncate flex-1">
          {entryKey}
        </span>
        <button
          type="button"
          onClick={onRemove}
          title="Remove from all columns"
          className="p-0.5 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (dirty) {
            onCommit(draft);
            setDirty(false);
          }
        }}
        rows={Math.min(6, Math.max(1, draft.split("\n").length))}
        spellCheck={false}
        className={cn(
          "w-full text-[11px] font-mono bg-background border-0 rounded-b-md px-2 py-1 text-foreground resize-y focus:outline-none",
        )}
      />
    </div>
  );
}

// =============================================================================
// ActiveScopeReadout — read-only display of the global app context that the
// agent execution path stamps onto every conversation record. Defaults that
// the user can verify at a glance before submitting.
// =============================================================================

function ActiveScopeReadout() {
  const orgId = useAppSelector(selectOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const projectId = useAppSelector(selectProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectTaskId);
  const taskName = useAppSelector(selectTaskName);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  const scopeEntries = Object.entries(scopeSelections ?? {}).filter(
    ([, v]) => v != null,
  );

  return (
    <div className="border-b border-border bg-muted/10 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active context
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          inherited from the page scope
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <ScopeRow
          icon={Layers}
          label="Scopes"
          value={
            scopeEntries.length === 0
              ? null
              : scopeEntries
                  .map(([k, v]) => `${k}=${(v ?? "").slice(0, 8)}`)
                  .join("  ")
          }
          emphasized
        />
        <ScopeRow icon={Building2} label="Organization" value={orgName ?? orgId} />
        <ScopeRow icon={Briefcase} label="Project" value={projectName ?? projectId} />
        <ScopeRow icon={ClipboardList} label="Task" value={taskName ?? taskId} />
      </div>
    </div>
  );
}

function ScopeRow({
  icon: Icon,
  label,
  value,
  emphasized,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon
        className={cn(
          "w-3 h-3 shrink-0",
          emphasized ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "shrink-0",
          emphasized ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}:
      </span>
      <span
        className={cn(
          "truncate min-w-0",
          value ? "text-foreground" : "text-muted-foreground/60 italic",
        )}
        title={value ?? "not set"}
      >
        {value || "not set"}
      </span>
    </div>
  );
}
