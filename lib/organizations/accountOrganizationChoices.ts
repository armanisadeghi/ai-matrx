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

import {
  toAccountOrganizationChoices,
  writeLastActiveOrganization as writeLastActiveDoor,
  writeStartupOrganization as writeStartupDoor,
  type AccountOrganizationChoices,
} from "@ai-matrx/data/organizations";
import { supabase } from "@/utils/supabase/client";
import { forgetAccountPreferencesRow, readAccountPreferencesRow } from "@/lib/account/accountPreferencesRow";

export type { AccountOrganizationChoices };

/**
 * Read the account's last active and start-up organizations. A person with no
 * preferences row has neither (null, null). Throws when the read fails — the
 * ladder then shows the honest "could not check" state, never a guess. The
 * row is the shell boot's one shared read; its columns become the ladder's
 * input through the shared mapping (@ai-matrx/data/organizations).
 */
export async function readAccountOrganizationChoices(
  userId: string,
): Promise<AccountOrganizationChoices> {
  const { data, error } = await readAccountPreferencesRow(userId);
  if (error) throw new Error(`the account's organization read failed: ${error.message}`);
  return toAccountOrganizationChoices(data);
}

/** Save where the person now works, for their next load. Throws on refusal. */
export async function writeLastActiveOrganization(organizationId: string): Promise<void> {
  try {
    await writeLastActiveDoor(supabase, organizationId);
  } finally {
    forgetAccountPreferencesRow();
  }
}

/** Set (or clear, with null) the Start-up organization setting. Throws on refusal. */
export async function writeStartupOrganization(organizationId: string | null): Promise<void> {
  try {
    await writeStartupDoor(supabase, organizationId);
  } finally {
    forgetAccountPreferencesRow();
  }
}
