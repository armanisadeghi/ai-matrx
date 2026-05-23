"use client";

/**
 * MemoryManager — view and edit the user's cross-project agent memory.
 *
 * These are the text files under `~/.matrx/memory/` that follow the user into
 * every sandbox. The agent reads and writes them during a session; the
 * orchestrator syncs them back on teardown. Edits here are Supabase-direct
 * (RLS-scoped to the user). A realtime subscription keeps the list fresh so
 * in-session agent edits surface without a manual refresh.
 *
 * See docs/sandbox/MEMORY_API.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Plus, Save, Trash2, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import { getUserId } from "@/utils/auth/getUserId";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  listMemory,
  upsertMemory,
  deleteMemory,
  type MemoryEntry,
} from "../service/memoryService";

const PATH_RE = /^[A-Za-z0-9._/-]+$/;

export default function MemoryManager() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPath, setNewPath] = useState("");
  // Track the loaded content so we can detect unsaved edits.
  const loadedContentRef = useRef("");

  const refresh = useCallback(async () => {
    try {
      const data = await listMemory();
      setEntries(data);
      return data;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load memory",
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime — the orchestrator rewrites rows on sandbox teardown; reflect
  // those edits live. RLS scopes the stream to the user's own rows; we add an
  // explicit owner filter as well.
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    const channel = supabase
      .channel(`user-memory:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_memory",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const selectEntry = useCallback(
    (entry: MemoryEntry) => {
      setCreatingNew(false);
      setSelectedPath(entry.path);
      setDraft(entry.content);
      loadedContentRef.current = entry.content;
    },
    [],
  );

  const startNew = useCallback(() => {
    setCreatingNew(true);
    setSelectedPath(null);
    setNewPath("");
    setDraft("");
    loadedContentRef.current = "";
  }, []);

  const handleSave = useCallback(async () => {
    const path = creatingNew ? newPath.trim() : selectedPath;
    if (!path) {
      toast.error("Enter a file path (e.g. preferences.md)");
      return;
    }
    if (!PATH_RE.test(path) || path.startsWith("/") || path.includes("..")) {
      toast.error(
        "Invalid path. Use letters, numbers, '.', '_', '-', '/' — no leading slash or '..'",
      );
      return;
    }
    setSaving(true);
    try {
      await upsertMemory(path, draft);
      loadedContentRef.current = draft;
      toast.success("Memory saved");
      const data = await refresh();
      const saved = data.find((e) => e.path === path);
      if (saved) selectEntry(saved);
      setCreatingNew(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [creatingNew, newPath, selectedPath, draft, refresh, selectEntry]);

  const handleDelete = useCallback(async () => {
    if (!selectedPath) return;
    const ok = await confirm({
      title: "Delete memory file?",
      description: `"${selectedPath}" will be removed from your agent memory. This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteMemory(selectedPath);
      toast.success("Memory deleted");
      setSelectedPath(null);
      setDraft("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }, [selectedPath, refresh]);

  const dirty = creatingNew
    ? draft.length > 0 || newPath.length > 0
    : selectedPath !== null && draft !== loadedContentRef.current;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Cross-project notes your agents read and write. They follow you into
          every sandbox and persist across sessions. Edits sync back when a
          sandbox shuts down.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 min-h-[320px]">
        {/* List */}
        <div className="rounded-md border border-border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground">
              Files
            </span>
            <button
              onClick={startNew}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : entries.length === 0 && !creatingNew ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No memory yet. Create a file like{" "}
                <code className="text-foreground">preferences.md</code>.
              </p>
            ) : (
              entries.map((e) => (
                <button
                  key={e.path}
                  onClick={() => selectEntry(e)}
                  className={`flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors ${
                    selectedPath === e.path
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60"
                  }`}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{e.path}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="rounded-md border border-border bg-card flex flex-col overflow-hidden">
          {creatingNew || selectedPath !== null ? (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
                {creatingNew ? (
                  <input
                    autoFocus
                    value={newPath}
                    onChange={(ev) => setNewPath(ev.target.value)}
                    placeholder="preferences.md"
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground truncate">
                    {selectedPath}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-accent/60 disabled:opacity-40 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save
                </button>
                {!creatingNew && selectedPath && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <textarea
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                placeholder="# Notes the agent should remember…"
                spellCheck={false}
                className="flex-1 resize-none bg-transparent p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-mono min-h-[260px]"
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
              Select a file to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
