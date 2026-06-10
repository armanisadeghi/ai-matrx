"use client";

/**
 * CleanupContextPanel — structured context items for the cleanup page.
 *
 * Each block is a real CONTEXT ITEM ({ id, key, label, value }) that the page
 * passes to agents as a proper context entry and persists per-session in
 * `studio_session_settings.context_items`. The `key` is derived from the
 * title (slugified, deduped) — name a block to match an agent's context slot
 * (e.g. "Client Brief" → `client_brief`) and it fills that slot directly.
 *
 * Notes integration (unchanged from the original tool):
 * - Ad-hoc blocks (noteId = null) are NEVER auto-saved to Notes. The user must
 *   explicitly choose "Save as note" — plain typing changes nothing in Notes.
 * - Note-linked blocks track isDirty and show an explicit Save button.
 * - The "Transcription Contexts" folder materializes on first use.
 *
 * Hydration contract: the parent remounts this panel per session
 * (`key={sessionId}`) and passes `initialItems`; the panel reports every
 * mutation upward via `onChange(items)`.
 */

import React, { useCallback, useState } from "react";
import { BookOpen, Loader2, Plus, Save, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NotesAPI } from "@/features/notes/service/notesApi";
import type { Note } from "@/features/notes/types";
import type { SessionContextItem } from "@/features/transcript-studio/types";
import ActionFeedbackButton from "@/components/official/ActionFeedbackButton";

export const CONTEXT_FOLDER = "Transcription Contexts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContextBlock {
  id: string;
  title: string;
  text: string;
  /** null = ad-hoc (never auto-saved) */
  noteId: string | null;
  /** display label of the linked note */
  noteLabel: string | null;
  /** true when text/title differ from the saved note version */
  isDirty: boolean;
}

export interface CleanupContextPanelProps {
  /** Persisted items for the active session (hydrates the blocks once). */
  initialItems?: SessionContextItem[] | null;
  /** Fired with the structured items on every mutation. */
  onChange: (items: SessionContextItem[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBlock(partial?: Partial<ContextBlock>): ContextBlock {
  return {
    id: crypto.randomUUID(),
    title: "",
    text: "",
    noteId: null,
    noteLabel: null,
    isDirty: false,
    ...partial,
  };
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
}

/** Blocks → structured items with stable, deduped keys. */
export function blocksToItems(blocks: ContextBlock[]): SessionContextItem[] {
  const seen = new Map<string, number>();
  return blocks
    .filter((b) => b.text.trim())
    .map((b, idx) => {
      let key = slugify(b.title) || `context_${idx + 1}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      if (count > 0) key = `${key}_${count + 1}`;
      return {
        id: b.id,
        key,
        label: b.title.trim() || `Context ${idx + 1}`,
        value: b.text,
        noteId: b.noteId,
        noteLabel: b.noteLabel,
      };
    });
}

function itemsToBlocks(items: SessionContextItem[]): ContextBlock[] {
  if (items.length === 0) return [makeBlock()];
  return items.map((i) =>
    makeBlock({
      id: i.id,
      title: i.label,
      text: i.value,
      noteId: i.noteId ?? null,
      noteLabel: i.noteLabel ?? null,
    }),
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CleanupContextPanel({
  initialItems,
  onChange,
}: CleanupContextPanelProps) {
  const [blocks, setBlocks] = useState<ContextBlock[]>(() =>
    itemsToBlocks(initialItems ?? []),
  );
  /** null = not yet fetched; array = loaded (may be empty) */
  const [contextNotes, setContextNotes] = useState<Note[] | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // ── Mutation helper: update blocks + fire onChange in one step ─────────────
  const updateAndNotify = useCallback(
    (updater: (prev: ContextBlock[]) => ContextBlock[]) => {
      setBlocks((prev) => {
        const next = updater(prev);
        onChange(blocksToItems(next));
        return next;
      });
    },
    [onChange],
  );

  // ── Field handlers ─────────────────────────────────────────────────────────

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      updateAndNotify((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, text, isDirty: b.noteId !== null } : b,
        ),
      );
    },
    [updateAndNotify],
  );

  const handleTitleChange = useCallback(
    (id: string, title: string) => {
      updateAndNotify((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, title, isDirty: b.noteId !== null } : b,
        ),
      );
    },
    [updateAndNotify],
  );

  const handleAdd = useCallback(() => {
    updateAndNotify((prev) => [...prev, makeBlock()]);
  }, [updateAndNotify]);

  const handleRemove = useCallback(
    (id: string) => {
      updateAndNotify((prev) => {
        const next = prev.filter((b) => b.id !== id);
        return next.length === 0 ? [makeBlock()] : next;
      });
    },
    [updateAndNotify],
  );

  const handleUnlink = useCallback(
    (id: string) => {
      updateAndNotify((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, noteId: null, noteLabel: null, isDirty: false }
            : b,
        ),
      );
    },
    [updateAndNotify],
  );

  // ── Notes loading (lazy — only when dropdown opens) ───────────────────────

  const loadContextNotes = useCallback(async (): Promise<Note[]> => {
    if (contextNotes !== null) return contextNotes;
    setLoadingNotes(true);
    try {
      const all = await NotesAPI.getAll();
      const filtered = all.filter((n) => n.folder_name === CONTEXT_FOLDER);
      setContextNotes(filtered);
      return filtered;
    } catch {
      toast.error("Could not load context notes");
      return [];
    } finally {
      setLoadingNotes(false);
    }
  }, [contextNotes]);

  const handleOpenDropdown = useCallback(
    async (id: string) => {
      setOpenDropdownId(id);
      await loadContextNotes();
    },
    [loadContextNotes],
  );

  // ── Load / create note into a block ────────────────────────────────────────

  const handleSelectNote = useCallback(
    async (blockId: string, value: string) => {
      setOpenDropdownId(null);

      if (value === "__new__") {
        // Save the current block text as a new note in the context folder
        const block = blocks.find((b) => b.id === blockId);
        if (!block) return;
        if (!block.text.trim() && !block.title.trim()) {
          toast.info("Add some text before saving as a note");
          return;
        }
        setSavingId(blockId);
        try {
          const note = await NotesAPI.create({
            label: block.title.trim() || "Transcription Context",
            content: block.text,
            folder_name: CONTEXT_FOLDER,
          });
          updateAndNotify((prev) =>
            prev.map((b) =>
              b.id === blockId
                ? {
                    ...b,
                    noteId: note.id,
                    noteLabel: note.label ?? "Transcription Context",
                    isDirty: false,
                  }
                : b,
            ),
          );
          setContextNotes((prev) => (prev ? [note, ...prev] : [note]));
          toast.success("Saved as note in Transcription Contexts");
        } catch {
          toast.error("Could not create note");
        } finally {
          setSavingId(null);
        }
        return;
      }

      // Load an existing note into the block
      const note = contextNotes?.find((n) => n.id === value);
      if (!note) return;
      updateAndNotify((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? {
                ...b,
                title: note.label ?? "",
                text: note.content ?? "",
                noteId: note.id,
                noteLabel: note.label ?? "Note",
                isDirty: false,
              }
            : b,
        ),
      );
    },
    [blocks, contextNotes, updateAndNotify],
  );

  // ── Save dirty note ────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block?.noteId) return;
      setSavingId(blockId);
      try {
        await NotesAPI.update(block.noteId, {
          label:
            block.title.trim() || block.noteLabel || "Transcription Context",
          content: block.text,
        });
        updateAndNotify((prev) =>
          prev.map((b) => (b.id === blockId ? { ...b, isDirty: false } : b)),
        );
        toast.success("Context note saved");
      } catch {
        toast.error("Could not save note");
      } finally {
        setSavingId(null);
      }
    },
    [blocks, updateAndNotify],
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((block, idx) => {
        const derivedKey = slugify(block.title) || `context_${idx + 1}`;
        return (
          <div
            key={block.id}
            className="flex flex-col rounded-lg border border-border overflow-hidden bg-background"
          >
            {/* ── Block header ────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-2 pt-1.5 pb-0.5">
              <input
                type="text"
                value={block.title}
                onChange={(e) => handleTitleChange(block.id, e.target.value)}
                placeholder="Title (optional)"
                className="flex-1 min-w-0 bg-transparent text-xs font-medium placeholder:text-muted-foreground/50 focus:outline-none"
              />

              {/* Derived context key — name a block to match an agent slot */}
              {block.text.trim() && (
                <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                  {derivedKey}
                </code>
              )}

              {/* Note badge — shown when linked */}
              {block.noteId && (
                <span className="shrink-0 flex items-center gap-0.5 text-[9px] text-primary/70 font-medium rounded px-1 py-0.5 bg-primary/5 border border-primary/20">
                  <BookOpen className="h-2.5 w-2.5" />
                  {block.noteLabel ?? "Note"}
                </span>
              )}

              {/* Save to note (only when linked + dirty) */}
              {block.noteId && block.isDirty && (
                <ActionFeedbackButton
                  icon={
                    savingId === block.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )
                  }
                  tooltip="Save changes back to note"
                  onClick={() => {
                    void handleSave(block.id);
                  }}
                  disabled={savingId === block.id}
                  className="h-5 w-5 text-primary/80"
                />
              )}

              {/* Unlink from note (keep text, just detach) */}
              {block.noteId && (
                <ActionFeedbackButton
                  icon={<Unlink className="h-3 w-3" />}
                  tooltip="Unlink — keep text but stop syncing to note"
                  onClick={() => handleUnlink(block.id)}
                  className="h-5 w-5 text-muted-foreground/60"
                />
              )}

              {/* Remove block (not shown when it's the only one) */}
              {blocks.length > 1 && (
                <ActionFeedbackButton
                  icon={<X className="h-3 w-3" />}
                  tooltip="Remove this context block"
                  onClick={() => handleRemove(block.id)}
                  className="h-5 w-5 text-muted-foreground/60 hover:text-destructive"
                />
              )}
            </div>

            {/* ── Textarea ────────────────────────────────────────────────── */}
            <textarea
              value={block.text}
              onChange={(e) => handleTextChange(block.id, e.target.value)}
              placeholder="Provide context for the AI…"
              className={cn(
                "min-h-[96px] w-full resize-none border-0 bg-background px-3 py-2 leading-relaxed",
                "text-base md:text-xs", // ≥16px on mobile to prevent iOS zoom
                "focus:outline-none focus:ring-0",
              )}
            />

            {/* ── Footer: notes picker ────────────────────────────────────── */}
            <div className="px-2 pb-1.5">
              {openDropdownId === block.id ? (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      void handleSelectNote(block.id, e.target.value);
                    }
                  }}
                  onBlur={() => setOpenDropdownId(null)}
                  className="w-full rounded border border-border bg-background text-xs px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="" disabled>
                    {loadingNotes
                      ? "Loading notes…"
                      : contextNotes?.length === 0
                        ? "No notes in Transcription Contexts yet"
                        : "Choose a note…"}
                  </option>
                  {contextNotes?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                  <option value="__new__">
                    {block.text.trim()
                      ? "＋ Save current text as new note"
                      : "＋ Create new note in Transcription Contexts"}
                  </option>
                </select>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenDropdown(block.id);
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  <BookOpen className="h-3 w-3" />
                  {block.noteId ? "Change note…" : "Load from notes…"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Add context block ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleAdd}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-0.5 px-0.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add context block
      </button>
    </div>
  );
}
