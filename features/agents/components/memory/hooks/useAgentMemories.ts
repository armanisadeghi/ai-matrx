"use client";

/**
 * useAgentMemories — hoisted state for the Agent Memory window.
 *
 * Owns the list + selection + draft-editor + CRUD lifecycle so the sidebar,
 * body, and footer slots (siblings of each other under WindowPanel) can all
 * read it from the composition root, per the window-panels composition-root
 * pattern. The draft (title/content/importance/scope) lives here — NOT in
 * the body — so the footer's Save/Delete buttons can act on it without prop
 * drilling through the body.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
  createAgentMemory,
  listAgentMemories,
  softDeleteAgentMemory,
  updateAgentMemory,
} from "../service/agent-memory.service";
import {
  displayTitleForMemory,
  type AgentMemoryRow,
  type AgentMemoryScope,
} from "../types";

export const ALL_MEMORIES_ID = "__all__" as const;
export const NEW_MEMORY_ID = "__new__" as const;

export type MemorySelection =
  typeof ALL_MEMORIES_ID | typeof NEW_MEMORY_ID | string;

export type MemorySortMode =
  "importance" | "updated" | "created" | "alphabetical";

export const SORT_MODE_OPTIONS: { value: MemorySortMode; label: string }[] = [
  { value: "importance", label: "Importance" },
  { value: "updated", label: "Date updated" },
  { value: "created", label: "Date created" },
  { value: "alphabetical", label: "Alphabetical" },
];

interface Draft {
  title: string;
  content: string;
  importance: number;
  scope: AgentMemoryScope;
}

const EMPTY_DRAFT: Draft = {
  title: "",
  content: "",
  importance: 0.5,
  scope: "user",
};

function draftFromMemory(memory: AgentMemoryRow): Draft {
  return {
    title: displayTitleForMemory(memory),
    content: memory.content,
    importance: memory.importance ?? 0.5,
    scope: (memory.scope as AgentMemoryScope) ?? "user",
  };
}

export function useAgentMemories() {
  const userId = useAppSelector(selectUserId);

  const [memories, setMemories] = useState<AgentMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedIdState] =
    useState<MemorySelection>(ALL_MEMORIES_ID);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [sortMode, setSortMode] = useState<MemorySortMode>("importance");

  const fetchedRef = useRef(false);

  const sortedMemories = useMemo(() => {
    const list = [...memories];
    switch (sortMode) {
      case "updated":
        list.sort((a, b) =>
          (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
        );
        break;
      case "created":
        list.sort((a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? ""),
        );
        break;
      case "alphabetical":
        list.sort((a, b) =>
          displayTitleForMemory(a).localeCompare(displayTitleForMemory(b)),
        );
        break;
      case "importance":
      default:
        list.sort((a, b) => (b.importance ?? 0.5) - (a.importance ?? 0.5));
        break;
    }
    return list;
  }, [memories, sortMode]);

  const selectedMemory =
    typeof selectedId === "string" &&
    selectedId !== ALL_MEMORIES_ID &&
    selectedId !== NEW_MEMORY_ID
      ? (memories.find((m) => m.id === selectedId) ?? null)
      : null;

  const setSelectedId = useCallback(
    (next: MemorySelection) => {
      setSelectedIdState(next);
      if (next === NEW_MEMORY_ID) {
        setDraft(EMPTY_DRAFT);
      } else {
        const memory = memories.find((m) => m.id === next);
        setDraft(memory ? draftFromMemory(memory) : EMPTY_DRAFT);
      }
    },
    [memories],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listAgentMemories();
      setMemories(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void refresh();
  }, [refresh]);

  const setDraftTitle = useCallback(
    (title: string) => setDraft((prev) => ({ ...prev, title })),
    [],
  );
  const setDraftContent = useCallback(
    (content: string) => setDraft((prev) => ({ ...prev, content })),
    [],
  );
  const setDraftImportance = useCallback(
    (importance: number) => setDraft((prev) => ({ ...prev, importance })),
    [],
  );
  const setDraftScope = useCallback(
    (scope: AgentMemoryScope) => setDraft((prev) => ({ ...prev, scope })),
    [],
  );

  const isDirty = selectedMemory
    ? draft.title !== displayTitleForMemory(selectedMemory) ||
      draft.content !== selectedMemory.content ||
      draft.importance !== (selectedMemory.importance ?? 0.5)
    : selectedId === NEW_MEMORY_ID;

  const canSave =
    draft.title.trim().length > 0 && draft.content.trim().length > 0;

  const saveDraft = useCallback(async () => {
    if (!canSave) return;

    if (selectedId === NEW_MEMORY_ID) {
      if (!userId) {
        toast.error("You must be signed in to save a memory");
        return;
      }
      setSaving(true);
      try {
        const row = await createAgentMemory(userId, {
          title: draft.title,
          content: draft.content,
          importance: draft.importance,
          scope: draft.scope,
        });
        setMemories((prev) => [row, ...prev]);
        setSelectedIdState(row.id);
        setDraft(draftFromMemory(row));
        toast.success("Memory saved");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save memory",
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedMemory) return;
    setSaving(true);
    try {
      const metadata = {
        ...((selectedMemory.metadata as Record<string, unknown> | null) ?? {}),
        title: draft.title,
      };
      const row = await updateAgentMemory({
        id: selectedMemory.id,
        content: draft.content,
        importance: draft.importance,
        metadata,
      });
      setMemories((prev) => prev.map((m) => (m.id === row.id ? row : m)));
      setDraft(draftFromMemory(row));
      toast.success("Memory updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update memory",
      );
    } finally {
      setSaving(false);
    }
  }, [canSave, selectedId, selectedMemory, draft, userId]);

  const deleteMemory = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await softDeleteAgentMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setSelectedIdState((current) => {
        if (current !== id) return current;
        setDraft(EMPTY_DRAFT);
        return ALL_MEMORIES_ID;
      });
      toast.success("Memory deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete memory",
      );
    } finally {
      setDeletingId(null);
    }
  }, []);

  return {
    memories: sortedMemories,
    totalCount: memories.length,
    sortMode,
    setSortMode,
    loading,
    error,
    refresh,
    selectedId,
    setSelectedId,
    selectedMemory,
    saving,
    deletingId,
    draft,
    setDraftTitle,
    setDraftContent,
    setDraftImportance,
    setDraftScope,
    isDirty,
    canSave,
    saveDraft,
    deleteMemory,
  };
}

export type UseAgentMemoriesReturn = ReturnType<typeof useAgentMemories>;
export type { AgentMemoryScope };
