// lib/organizations/accountOrganizationChoices.ts
//
// The account's two organization facts the load ladder reads, and their ONE
// write door each (active-organization plan, 2026-10-07):
//
//   users.user_preferences.last_active_organization_id — where the person last
//     worked; written by `users.set_last_active_organization` on every switch.
//   users.user_preferences.startup_organization_id     — the "Start-up
//     organization" setting; written by `users.set_startup_organization`.
//
// 🚨 ONLY THE LADDER READS THESE (`resolveActiveOrgContext`). They choose what
// the shell OPENS to and nothing else — no request, write or server ever reads
// them to decide where something acts (STATE rules 11–14). A request carries the
// active organization the person can see.

import { supabase } from "@/utils/supabase/client";

export interface AccountOrganizationChoices {
  lastActiveOrganizationId: string | null;
  startupOrganizationId: string | null;
}

const NONE: AccountOrganizationChoices = {
  lastActiveOrganizationId: null,
  startupOrganizationId: null,
};

// The two columns and RPCs are newer than the generated types; the shapes are
// declared here and the client is narrowed once instead of casting per call.
interface ChoicesRow {
  last_active_organization_id: string | null;
  startup_organization_id: string | null;
}
interface UntypedUsersSchema {
  from(table: "user_preferences"): {
    select(columns: string): {
      eq(
        column: "user_id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: ChoicesRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc(
    fn: "set_last_active_organization" | "set_startup_organization",
    args: { p_organization_id: string | null },
  ): PromiseLike<{ error: { message: string } | null }>;
}
function usersSchema(): UntypedUsersSchema {
  return supabase.schema("users") as unknown as UntypedUsersSchema;
}

/**
 * Read the account's last active and start-up organizations. A person with no
 * preferences row has neither (null, null). Throws when the read fails — the
 * ladder then shows the honest "could not check" state, never a guess.
 */
export async function readAccountOrganizationChoices(
  userId: string,
): Promise<AccountOrganizationChoices> {
  const { data, error } = await usersSchema()
    .from("user_preferences")
    .select("last_active_organization_id, startup_organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`the account's organization read failed: ${error.message}`);
  if (!data) return NONE;
  return {
    lastActiveOrganizationId: data.last_active_organization_id ?? null,
    startupOrganizationId: data.startup_organization_id ?? null,
  };
}

/** Save where the person now works, for their next load. Throws on refusal. */
export async function writeLastActiveOrganization(organizationId: string): Promise<void> {
  const { error } = await usersSchema().rpc("set_last_active_organization", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

/** Set (or clear, with null) the Start-up organization setting. Throws on refusal. */
export async function writeStartupOrganization(organizationId: string | null): Promise<void> {
  const { error } = await usersSchema().rpc("set_startup_organization", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}
