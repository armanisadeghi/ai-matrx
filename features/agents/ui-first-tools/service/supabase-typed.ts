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
import type {
  CxAgentPlanRow,
  CxAgentTaskRow,
  CxUserTodoRow,
  CxAgentMemoryRow,
  AgentUserKvRow,
  CxPlanStatus,
  CxAgentTaskStatus,
  CxAgentTaskCreator,
} from "../tools/types";

// Minimal Insert / Update shapes mirroring the migration. The generated
// types follow the same pattern (defaults nullable, generated columns
// optional on insert).

export interface CxAgentPlanInsert {
  id?: string;
  conversation_id: string;
  user_id: string;
  title: string;
  steps?: string[];
  reasoning?: string | null;
  domains?: string[] | null;
  estimated_minutes?: number | null;
  status?: CxPlanStatus;
  project_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CxAgentTaskInsert {
  id?: string;
  conversation_id: string;
  user_id: string;
  plan_id?: string | null;
  title: string;
  status?: CxAgentTaskStatus;
  note?: string | null;
  position?: number;
  created_by?: CxAgentTaskCreator;
  created_at?: string;
  updated_at?: string;
}

export interface CxUserTodoInsert {
  id?: string;
  conversation_id: string;
  user_id: string;
  title: string;
  context?: string | null;
  due?: string | null;
  done?: boolean;
  done_at?: string | null;
  ctx_task_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

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
