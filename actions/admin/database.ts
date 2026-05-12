// actions/admin/database.ts
"use server";

// IMPORTANT: Next.js sanitizes thrown errors from Server Actions in production,
// replacing the message with a generic string to prevent server internals leaking.
// To pass full error details to the client, we NEVER throw — we return an envelope
// { data, error } so the error travels as plain return-value data (unsanitized).

import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: string };

function formatSupabaseError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const e = error as Record<string, unknown>;
  const parts: string[] = [];
  if (e.message) parts.push(String(e.message));
  if (e.details) parts.push(`Details: ${e.details}`);
  if (e.hint) parts.push(`Hint: ${e.hint}`);
  if (e.code) parts.push(`Error Code: ${e.code}`);
  return parts.length > 0 ? parts.join("\n\n") : JSON.stringify(error, null, 2);
}

export async function getFunctions(): Promise<ActionResult<unknown[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_database_functions");
    if (error) {
      console.error("Error fetching functions:", error);
      return { data: null, error: formatSupabaseError(error) };
    }
    revalidatePath("/administration/database");
    return { data: data ?? [], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error fetching functions:", err);
    return { data: null, error: msg };
  }
}

export async function getPermissions(): Promise<ActionResult<unknown[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_database_permissions");
    if (error) {
      console.error("Error fetching permissions:", error);
      return { data: null, error: formatSupabaseError(error) };
    }
    revalidatePath("/administration/database");
    return { data: data ?? [], error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error fetching permissions:", err);
    return { data: null, error: msg };
  }
}

export async function executeSqlQuery(query: string): Promise<ActionResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query,
    });
    if (error) {
      console.error("Error executing query:", error);
      return {
        data: null,
        error: `SQL Query Error: ${formatSupabaseError(error)}`,
      };
    }
    return { data, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error executing query:", err);
    return { data: null, error: `Failed to execute SQL query: ${msg}` };
  }
}
