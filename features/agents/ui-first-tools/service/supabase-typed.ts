/**
 * Local typed Supabase client for the cx_agent_lists tables.
 *
 * The generated `database.types.ts` is the canonical source for the
 * `Database` type, but it isn't always in lockstep with the latest
 * migration (it gets regenerated on demand). Rather than blocking on a
 * full regeneration, we define the five new tables' row/insert/update
 * types here and cast `supabase` to a client typed against THIS local
 * `Database` schema for our service-layer reads/writes.
 *
 * If/when `database.types.ts` is regenerated to include these tables,
 * we can switch the service files to import from `@/utils/supabase/client`
 * directly and delete this file.
 */

import { supabase } from "@/utils/supabase/client";
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
  value: unknown;
  updated_at?: string;
}

export interface AgentUserKvInsert {
  user_id: string;
  key: string;
  value: unknown;
  updated_at?: string;
}

// Local Database type with just our five tables — enough to give the
// Supabase client overloads useful types for our service layer.
interface AgentListsDatabase {
  public: {
    Tables: {
      cx_agent_plan: {
        Row: CxAgentPlanRow;
        Insert: CxAgentPlanInsert;
        Update: Partial<CxAgentPlanInsert>;
        Relationships: [];
      };
      cx_agent_task: {
        Row: CxAgentTaskRow;
        Insert: CxAgentTaskInsert;
        Update: Partial<CxAgentTaskInsert>;
        Relationships: [];
      };
      cx_user_todo: {
        Row: CxUserTodoRow;
        Insert: CxUserTodoInsert;
        Update: Partial<CxUserTodoInsert>;
        Relationships: [];
      };
      cx_agent_memory: {
        Row: CxAgentMemoryRow;
        Insert: CxAgentMemoryInsert;
        Update: Partial<CxAgentMemoryInsert>;
        Relationships: [];
      };
      agent_user_kv: {
        Row: AgentUserKvRow;
        Insert: AgentUserKvInsert;
        Update: Partial<AgentUserKvInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<AgentListsDatabase, "public", any>;
