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
import { Plus, Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

  const submittableCount = columns.filter((c) => c.agentId).length;

  return (
    <WindowPanel
      id={id}
      title="Shared context (all columns)"
      width={460}
      height={520}
      onClose={onClose}
    >
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-border text-[11px] text-muted-foreground bg-muted/20">
          {submittableCount === 0
            ? "Add at least one column with an agent selected — context broadcasts to every column at once."
            : `Edits apply to all ${submittableCount} configured column${
                submittableCount === 1 ? "" : "s"
              }.`}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {previewKeys.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border border-dashed border-border rounded-md text-center">
              No shared context yet.
            </div>
          ) : (
            previewKeys.map((key) => {
              const entry = previewEntries[key];
              const text = typeof entry.value === "string"
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

        <div className="shrink-0 border-t border-border bg-card/40 p-3">
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
              className="h-7"
            >
              <Plus className="w-3 h-3" />
              Add
            </Button>
          </div>
          {error && (
            <div className="mt-1 text-[10px] text-destructive">{error}</div>
          )}
        </div>
      </div>
    </WindowPanel>
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
