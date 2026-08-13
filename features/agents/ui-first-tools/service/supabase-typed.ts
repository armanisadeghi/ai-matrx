/**
 * Typed Supabase client for the chat schema ui-first-tools tables.
 *
 * `agent_plan`, `agent_task`, and `user_todo` are fully reflected in
 * `database.types.ts` (chat schema) and are exported from there.
 *
 * `agent_memory` schema diverges from the old cx_agent_memory service
 * expectations (no `conversation_id`, uses `content` not `value`) —
 * tracked as a known defect; the local stub keeps TypeScript quiet
 * until the service is redesigned.
 */

import { supabase } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal Insert / Update shapes mirroring the migration. The generated
// types follow the same pattern (defaults nullable, generated columns
// optional on insert).
//
// `agent_plan` / `agent_task` / `user_todo` inserts go through the generated
// `chat` types on `db` — the services build them inline, so no hand-mirrored
// Insert shape exists here for them.

export interface CxAgentMemoryInsert {
  conversation_id: string;
  user_id: string;
  key: string;
  value: Json;
  updated_at?: string;
}

export interface AgentUserKvInsert {
  user_id: string;
  key: string;
  value: unknown;
  updated_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<Database, "chat", any>;

/**
 * Untyped access to `public.cx_agent_memory` (KV scratchpad: conversation_id +
 * key + value). Generated types currently describe semantic memory instead —
 * see agent-memory.service.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const scratchpadDb = supabase as any;
