/**
 * Types for the user-facing Agent Memory manager (`chat.agent_memory`).
 *
 * Distinct from `cx_agent_memory` (the per-conversation ephemeral KV
 * scratchpad in `ui-first-tools/service/agent-memory.service.ts`) — that
 * service targets the SAME table name but stale columns (`conversation_id`,
 * `value`) that don't exist on the live schema; see `supabase-typed.ts` for
 * the known-defect note. This feature reads the REAL columns of
 * `chat.agent_memory` (semantic long-term memory, one row per fact).
 */

import type { Database, Json } from "@/types/database.types";

export type AgentMemoryRow = Database["chat"]["Tables"]["agent_memory"]["Row"];

export type AgentMemoryScope = "user" | "organization";

export interface CreateAgentMemoryInput {
  title: string;
  content: string;
  importance: number;
  scope: AgentMemoryScope;
}

export interface UpdateAgentMemoryInput {
  id: string;
  content?: string;
  importance?: number;
  /** Full, already-merged metadata object (the service never merges). */
  metadata?: Json;
}

/** `key` is a machine slug — the display title lives in `metadata.title`,
 * falling back to a humanized version of `key` for agent-created rows that
 * never set one. */
export function displayTitleForMemory(memory: AgentMemoryRow): string {
  const metadata = memory.metadata as Record<string, unknown> | null;
  const title =
    metadata && typeof metadata.title === "string" ? metadata.title : null;
  if (title) return title;
  return memory.key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `importance` is stored as a 0–1 float; displayed everywhere as a 0–10
 * integer so it reads as a single, prominent, meaningful number. */
export function importanceScore(importance: number | null): number {
  return Math.round((importance ?? 0.5) * 10);
}

export function importanceTier(
  importance: number | null,
): "high" | "medium" | "low" {
  const value = importance ?? 0.5;
  if (value >= 0.8) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}
