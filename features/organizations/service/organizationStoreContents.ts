/**
 * organizationStoreContents — WHAT AN ORGANIZATION HOLDS, AND THE SUPPORTED
 * WAY TO EMPTY IT.
 *
 * WHAT THIS CLOSES (bug 8500bd65-7a5c-4c22-8213-2e10d462d348). An organization
 * that holds record-store data could not be deleted, and the Danger Zone showed
 * the database's own string:
 *
 *   update or delete on table "organizations" violates foreign key constraint
 *   "record_organization_id_fkey"
 *
 * That is not a sentence, and it names nothing a person can do. There are
 * thirty-three foreign keys into `iam.organizations` from the store's schemas
 * and every one of them produces the same refusal, so the fix is not a message
 * per constraint — it is one door that says what the organization holds and one
 * door that empties it, both asked of the database's own catalog.
 *
 * NOTHING HERE DECIDES ANYTHING. The two doors do: `custom.organization_clear`
 * is owner-only, demands the organization's name back character for character,
 * retires through the store's own `custom.migrate_delete` (so `custom.migrate_undo`
 * puts it back), and destroys only what the retention rule no longer protects.
 * This module carries the answer to the screen and never paraphrases a refusal.
 *
 * THE SWITCH IS READ FIRST, like every other served reach into this store. When
 * it is off the organization simply holds nothing in the store as far as the
 * product is concerned, and the delete proceeds exactly as it did before.
 */

import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

/**
 * Schema `custom` is served by PostgREST (it is in `pgrst.db_schemas`) and its
 * two doors below are declared in `platform.client_callable_door` with an
 * EXECUTE grant for `authenticated`. It is NOT in the generated database types:
 * the store is declared closed in `platform.schema_client_exposure` until the
 * switch checklist opens it, so `pnpm db-types` does not emit it and the typed
 * client's `.schema()` rejects the name. This one narrow port is how every
 * served reach into the store gets there — `@ai-matrx/records` does the same
 * thing by taking its data source as a plain `object`.
 */
const STORE_SCHEMA = "custom";

type StoreRpc = {
  schema(name: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

function storeClient(): StoreRpc {
  return createClient() as unknown as StoreRpc;
}

/** What one organization holds, in the store's own words. */
export interface OrganizationStoreContents {
  /** True when the store holds nothing at all for this organization. */
  isEmpty: boolean;
  /** How many rows it holds across every table that would refuse the delete. */
  rowsHeld: number;
  /** The plain sentence a person reads. Never a paraphrase. */
  sentence: string;
}

/** What emptying it did, and what is left. */
export interface OrganizationClearOutcome {
  /** True when the store now holds nothing and the organization can be deleted. */
  isEmpty: boolean;
  /** The store's own sentence — what happened, what is waiting, and until when. */
  sentence: string;
}

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "The record store could not be reached.";
}

/**
 * What this organization holds in the record store. `null` means the store is
 * switched off for it — not "nothing", and not an error: there is nothing of
 * this kind to say, and the caller says nothing rather than inventing a count.
 */
export async function organizationStoreContents(
  organizationId: string,
): Promise<OrganizationStoreContents | null> {
  if (!(await UNIFIED_DATA_CAMPAIGN.enabled(organizationId))) return null;

  const { data, error } = await storeClient()
    .schema(STORE_SCHEMA)
    .rpc("organization_contents", { p_organization_id: organizationId });

  if (error) {
    // NOTHING FAILS SILENTLY. A count we could not take is said out loud, and
    // the delete is still offered — the database itself is the backstop.
    return {
      isEmpty: false,
      rowsHeld: 0,
      sentence: `We could not read what this organization holds: ${messageOf(error)}`,
    };
  }

  const answer = (data ?? {}) as Record<string, unknown>;
  return {
    isEmpty: answer["is_empty"] === true,
    rowsHeld: Number(answer["rows_held"] ?? 0),
    sentence: String(answer["sentence"] ?? ""),
  };
}

/**
 * Empty it, through the store's own doors. `confirmName` is the organization's
 * name as the person typed it; the door checks it again and refuses in its own
 * words when it does not match, so a caller cannot talk its way past the
 * confirmation by not drawing one.
 */
export async function clearOrganizationStore(
  organizationId: string,
  confirmName: string,
): Promise<OrganizationClearOutcome> {
  if (!(await UNIFIED_DATA_CAMPAIGN.enabled(organizationId))) {
    return {
      isEmpty: true,
      sentence: "The record store is switched off for this organization, so it holds nothing to remove.",
    };
  }

  const { data, error } = await storeClient()
    .schema(STORE_SCHEMA)
    .rpc("organization_clear", {
      p_organization_id: organizationId,
      p_confirm: confirmName,
      p_and_destroy: true,
    });

  if (error) {
    return { isEmpty: false, sentence: messageOf(error) };
  }

  const answer = (data ?? {}) as Record<string, unknown>;
  return {
    isEmpty: answer["is_empty"] === true,
    sentence: String(answer["sentence"] ?? ""),
  };
}

/**
 * THE LAST RESORT, and it exists because a foreign key is not a sentence. When
 * the delete is refused by something the clear does not cover — a feature
 * schema outside the store — the person is told what it means and what to do,
 * rather than being shown the constraint's name.
 */
export function plainFromDeleteRefusal(raw: string): string | null {
  if (!/violates foreign key constraint/i.test(raw)) return null;
  const table = /on table "([^"]+)"\s*$/i.exec(raw.trim())?.[1];
  return (
    "This organization still holds data that has to go first" +
    (table ? ` (its ${table.replace(/_/g, " ")} records)` : "") +
    ", so it was not deleted and nothing was lost. Remove or move that data, then delete the organization again — or tell us, and we will make it removable from here."
  );
}
