/**
 * Typed Supabase client for the chat schema ui-first-tools tables.
 *
 * `agent_plan`, `agent_task`, and `user_todo` are fully reflected in
 * `database.types.ts` (chat schema); the services build their Insert rows
 * inline against those generated types.
 */

import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as SupabaseClient<Database, "chat", any>;
