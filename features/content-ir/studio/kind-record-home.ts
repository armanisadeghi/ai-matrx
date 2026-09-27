/**
 * WHERE THIS ORGANIZATION KEEPS ITS KIND RECORDS — the browser half of the one question.
 *
 * `content_ir.kind_instance` is declared superseded by `custom.record`
 * (`platform.deprecated_relations`, W1-REG). aidream answers "which store holds THIS
 * organization's kind records" in ONE door (`aidream/services/kind_records/routed.py`
 * → `matrx_records.server.RecordsGateway.route_for("content_ir.kind_instance")`), and every
 * server path asks it. The browser reads and writes the database directly (platform law),
 * so it asks the SAME question here, built from the SAME two facts — never a second rule:
 *
 *   1. the organization's record-store switch — `platform.unified_data_store_on`, read
 *      through `UNIFIED_DATA_CAMPAIGN.enabled` (the gateway's `store_is_on`); and
 *   2. whether the source is ADOPTED in that organization — a Table this person can see
 *      whose slug (or name) is `kind_instance`, the gateway's `slug_for` convention, read
 *      through the store's own `tableList` door (the gateway's `_slug_map`).
 *
 * Both yes → the record store; anything else → today's table, which is its live truth until
 * the day its records move. An unreadable switch reads OFF (the switch module announces it),
 * exactly as the gateway's `backend_for` does, so a database hiccup never promotes an
 * organization onto a store its rows are not in.
 */

import type { RecordsClient } from "@ai-matrx/records/core";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { createClient } from "@/utils/supabase/client";

/** The legacy relation this answer speaks for — aidream `routed.SOURCE`. */
export const KIND_RECORD_SOURCE = "content_ir.kind_instance";
/** The Table slug that relation resolves to — aidream `matrx_records.server.slug_for`. */
export const KIND_RECORD_SLUG = KIND_RECORD_SOURCE.split(".").slice(-1)[0];

export type KindRecordHome =
  | { store: "older"; why: string }
  | {
      store: "record";
      organizationId: string;
      userId: string;
      /** The organization's kind-record Table. */
      tableId: string;
      why: string;
    };

const clients = new Map<string, RecordsClient>();

/** The store's client for a record-store home, acting as that person in that organization. */
export async function kindRecordClient(
  home: Extract<KindRecordHome, { store: "record" }>,
): Promise<RecordsClient> {
  const key = `${home.organizationId}:${home.userId}`;
  const held = clients.get(key);
  if (held) return held;
  // Loaded only when an organization's answer is the store, so the older path pays nothing.
  const [{ createRecordsClient }, { personActor, recordsDataSource }] = await Promise.all([
    import("@ai-matrx/records/core"),
    import("@ai-matrx/records-ui"),
  ]);
  const client = createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(home.userId),
    organizationId: home.organizationId,
  });
  clients.set(key, client);
  return client;
}

/**
 * Which store holds this organization's kind records, for this person — the one question.
 *
 * A Table-list read the store refuses THROWS with the store's own sentence: the switch said
 * this organization keeps its data in the store, so "could not look" must never quietly
 * become "write the old table".
 */
export async function whereKindRecordsLive(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<KindRecordHome> {
  if (!organizationId || !userId) {
    return {
      store: "older",
      why: "no organization or no signed-in person, so there is nobody to ask the record store as",
    };
  }
  if (!(await UNIFIED_DATA_CAMPAIGN.enabled(organizationId))) {
    return {
      store: "older",
      why: "this organization has its record store switched off (or it could not be read), so its kind records live in today's table",
    };
  }
  const probe = { store: "record" as const, organizationId, userId, tableId: "", why: "" };
  const client = await kindRecordClient(probe);
  const tables = await client.tableList();
  if (!tables.ok) {
    throw new Error(
      `We could not check where this organization keeps its saved shapes — the record store refused its table list: ${tables.error.message}. Nothing was read or written; try again.`,
    );
  }
  const table = tables.data.find(
    (t) => t.slug === KIND_RECORD_SLUG || t.name === KIND_RECORD_SLUG,
  );
  if (!table) {
    return {
      store: "older",
      why: `the record store is on for this organization, but ${KIND_RECORD_SOURCE} is not adopted yet — no Table with slug "${KIND_RECORD_SLUG}" — so its kind records still live in today's table`,
    };
  }
  return {
    store: "record",
    organizationId,
    userId,
    tableId: table.id,
    why: `this organization keeps its kind records in the record store (Table ${table.id})`,
  };
}
