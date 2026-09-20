/**
 * applyRecordChange — THE RESUME. The person said yes, so the change the agent
 * was refused now happens under the PERSON's own authority.
 *
 * WHY THE BROWSER AND NOT THE SERVER. The `records` tool has already answered
 * by the time anybody sees a card: the agent's call is over, there is no
 * suspended call to unblock, and an approval that could only be honoured by
 * re-running the agent would be an approval of something else. So the approval
 * is applied here, through the record store's OWN doors, as the signed-in
 * person — which is also the honest reading of what happened: the organization
 * asks A PERSON before an agent changes a table that already existed, and the
 * person is the one who made this write.
 *
 * WHAT IS WRITTEN IS WHAT WAS SHOWN. The declaration the server built travels
 * whole (`recordChangeApproval.ts`) and is handed to the doors unchanged. This
 * module derives nothing about a field's shape: the store's own expansion
 * already produced a document its guards accept, and a second derivation in
 * the browser is how an approved change quietly becomes a different one.
 *
 * A FIELD IS TWO WRITES, IN THIS ORDER — the table has to declare the key
 * before any definition for it is accepted (REC-1 / FLD-8, `custom._field_shape_guard`),
 * which is exactly the order the server's own unattended path uses. The table's
 * `fields` list is read back first, so approving a column somebody already
 * added says so instead of writing it twice.
 *
 * NOTHING FAILS SILENTLY. Every refusal comes back in the store's own words.
 */

import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
} from "@/lib/knobs/unifiedDataCampaign";

import type { RecordChangeWait } from "./recordChangeApproval";

export type ApplyApprovedOutcome =
  /** The store changed. `detail` names what a person will now see. */
  | { status: "applied"; detail: string; recordId: string | null }
  /** It was already there. A no-op, said out loud rather than dressed as a win. */
  | { status: "already"; detail: string }
  /** The store said no. `detail` is the store's own sentence, never a paraphrase. */
  | { status: "refused"; detail: string };

/**
 * THE switch, and there is only one: does this ORGANIZATION keep its data in
 * the unified record store? Asked before any door, exactly as every other
 * served reach into the store asks it.
 */
async function clientOrRefusal(): Promise<
  { client: RecordsClient } | { refused: string }
> {
  const state = getStoreSingleton()?.getState();
  const organizationId = state ? selectActiveOrganizationId(state) : null;
  const userId = state ? selectUserId(state) : null;
  if (!(await UNIFIED_DATA_CAMPAIGN.enabled(organizationId))) {
    return { refused: UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE };
  }
  if (!organizationId) {
    return {
      refused: "No organization is active, so the record store cannot be reached.",
    };
  }
  return {
    client: createRecordsClient({
      dataSource: recordsDataSource(createClient()),
      actor: personActor(userId),
      organizationId,
    }),
  };
}

function declaredKeys(document: unknown): string[] {
  const fields = (document as Record<string, unknown> | null)?.["fields"];
  if (!Array.isArray(fields)) return [];
  return fields
    .map((entry) =>
      entry !== null && typeof entry === "object"
        ? (entry as Record<string, unknown>)["name"]
        : null,
    )
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/** Apply exactly the change a person approved. */
export async function applyApprovedRecordChange(
  wait: RecordChangeWait,
): Promise<ApplyApprovedOutcome> {
  const resolved = await clientOrRefusal();
  if ("refused" in resolved) return { status: "refused", detail: resolved.refused };
  const { client } = resolved;

  if (wait.change.change === "table") {
    const homeId = wait.change.homeId;
    if (!homeId) {
      return {
        status: "refused",
        detail:
          "This table has nowhere to live — the proposal named no home — so it cannot be created from here.",
      };
    }
    const declared = await client.tableDeclare({
      spec: wait.change.spec,
      homeId,
    });
    if (!declared.ok) return { status: "refused", detail: declared.error.message };
    return {
      status: "applied",
      recordId: declared.data,
      detail: `${wait.change.name} is now a table in this organization.`,
    };
  }

  const { tableId, key, label, declaration } = wait.change;

  const table = await client.recordRead({ record_id: tableId });
  if (!table.ok) return { status: "refused", detail: table.error.message };

  const keys = declaredKeys(table.data.document);
  if (keys.includes(key)) {
    return {
      status: "already",
      detail: `${label} is already a column on this table.`,
    };
  }

  // 1 — the TABLE declares the key. Nothing accepts a definition before this.
  const told = await client.recordUpdate({
    record_id: tableId,
    patch: { fields: [...keys.map((name) => ({ name })), { name: key }] },
  });
  if (!told.ok) return { status: "refused", detail: told.error.message };

  // 2 — the definition itself, as a Field record (REC-25), written exactly as
  //     the store built it.
  const kernel = await client.fieldKernelId();
  if (!kernel.ok) return { status: "refused", detail: kernel.error.message };

  const written = await client.recordWrite({
    table_id: kernel.data,
    data: declaration as Parameters<RecordsClient["recordWrite"]>[0]["data"],
  });
  if (!written.ok) return { status: "refused", detail: written.error.message };

  return {
    status: "applied",
    recordId: written.data,
    detail: `${label} is now a column on this table.`,
  };
}

/**
 * What the table a pending column belongs to is CALLED.
 *
 * A card that says "a column on table 8f3c…" names a record a person cannot
 * recognise, which is the same dead end in a smaller font. The store's own read
 * door answers, under the person's own rights; when it cannot, the caller says
 * nothing about the table rather than showing an id.
 */
export async function tableNameFor(tableId: string): Promise<string | null> {
  const resolved = await clientOrRefusal();
  if ("refused" in resolved) return null;
  const read = await resolved.client.recordRead({ record_id: tableId });
  if (!read.ok) return null;
  const document = read.data.document as Record<string, unknown> | null;
  const name = document?.["name"] ?? document?.["label_singular"];
  return typeof name === "string" && name.trim() ? name : null;
}
