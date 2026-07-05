"use client";

/**
 * useAgentMemories — hoisted state for the Agent Memory window.
 *
 * Owns the list + selection + CRUD lifecycle so the sidebar, body, and
 * footer slots (siblings of each other under WindowPanel) can all read it
 * from the composition root, per the window-panels composition-root pattern.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import {
  createAgentMemory,
  listAgentMemories,
  softDeleteAgentMemory,
  updateAgentMemory,
} from "../service/agent-memory.service";
import type {
  AgentMemoryRow,
  AgentMemoryScope,
  CreateAgentMemoryInput,
} from "../types";

export const ALL_MEMORIES_ID = "__all__" as const;
export const NEW_MEMORY_ID = "__new__" as const;

export type MemorySelection =
  typeof ALL_MEMORIES_ID | typeof NEW_MEMORY_ID | string;

export function useAgentMemories() {
  const userId = useAppSelector(selectUserId);

  const [memories, setMemories] = useState<AgentMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] =
    useState<MemorySelection>(ALL_MEMORIES_ID);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchedRef = useRef(false);

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

  const createMemory = useCallback(
    async (input: CreateAgentMemoryInput) => {
      if (!userId) {
        toast.error("You must be signed in to save a memory");
        return null;
      }
      setSaving(true);
      try {
        const row = await createAgentMemory(userId, input);
        setMemories((prev) => [row, ...prev]);
        setSelectedId(row.id);
        toast.success("Memory saved");
        return row;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save memory",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  const saveMemory = useCallback(
    async (
      id: string,
      changes: { title: string; content: string; importance: number },
    ) => {
      const existing = memories.find((m) => m.id === id);
      if (!existing) return null;
      setSaving(true);
      try {
        const metadata = {
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          title: changes.title,
        };
        const row = await updateAgentMemory({
          id,
          content: changes.content,
          importance: changes.importance,
          metadata,
        });
        setMemories((prev) => prev.map((m) => (m.id === id ? row : m)));
        toast.success("Memory updated");
        return row;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to update memory",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [memories],
  );

  const deleteMemory = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await softDeleteAgentMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setSelectedId((current) => (current === id ? ALL_MEMORIES_ID : current));
      toast.success("Memory deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete memory",
      );
    } finally {
      setDeletingId(null);
    }
  }, []);

  const selectedMemory =
    typeof selectedId === "string" &&
    selectedId !== ALL_MEMORIES_ID &&
    selectedId !== NEW_MEMORY_ID
      ? (memories.find((m) => m.id === selectedId) ?? null)
      : null;

  return {
    memories,
    loading,
    error,
    refresh,
    selectedId,
    setSelectedId,
    selectedMemory,
    saving,
    deletingId,
    createMemory,
    saveMemory,
    deleteMemory,
  };
}

export type UseAgentMemoriesReturn = ReturnType<typeof useAgentMemories>;
export type { AgentMemoryScope };
