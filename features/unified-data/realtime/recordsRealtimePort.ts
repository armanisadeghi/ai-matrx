// features/unified-data/realtime/recordsRealtimePort.ts
//
// THE REALTIME PORT THE GRID'S BANNER HAS BEEN NAMING.
//
// Until today every store grid in this app printed *"Not live: this host bound no realtime
// port, so this list updates when you reload it."* That sentence was honest and it was not a
// stub: `postgres_changes` genuinely cannot serve this store. Schema `custom` has ZERO table
// grants on purpose — it is doors-only — so realtime's RLS check answers 401 and delivers
// nothing, and `custom.record`'s sixteen hash partitions defeat both publication shapes on
// top of that (measured, lane LIMITS-FIX-UI-2 §7).
//
// So the store goes live the other way: the database BROADCASTS a notice on a private topic,
// and this file joins that topic.
//
//   custom:table:<table_id>   private, one per Table.
//
// WHAT COMES DOWN THE WIRE IS NOT DATA. `{table_id, kind, op, record_ids, fields_changed, at}`
// — ids and nothing else, never a value, never a title. That is not squeamishness: ONE topic
// serves a whole Table, and two people admitted to the same Table do not necessarily see the
// same rows in it. Per-record visibility is decided by the ladder at READ time, so anything
// riding this wire would travel past that decision. The notice is a nudge; the hook re-reads
// the affected records through `custom.read_records`, which applies the ladder, and a record
// the reader may not see simply does not come back.
//
// WHO IS ADMITTED is decided in the database, by the SAME call the read door makes
// (`custom.assert_may_know_table`), through the one RLS policy on `realtime.messages`. There
// is nothing to check here and deliberately no second opinion: a browser that is not admitted
// never joins, and one that is joins to notices it could have read the long way anyway.
//
// ECHO SUPPRESSION, BY OP ID — the gap this file used to declare honestly is closed.
// Until 2026-09-21 the notice had no way of saying WHICH browser's write caused it, so this
// spec carried `acceptEchoFromSelf: true` and a paragraph admitting the writer heard its own
// write back. It does not any more. Every write through `@ai-matrx/records` mints a uuid and
// sends it as the platform envelope key `_op_id`; the store lifts that key out before its
// undeclared-key guard and before storage — it is NEVER written onto the record — and returns
// it in the notice as `op_id`; `isOwnOp` recognises it here. A notice this browser caused now
// costs nothing at all: not a read, not a render.
//
// AND THE IDS ARE USED AS IDS. `sink.records(ids)` hands the package the exact records that
// moved and `useRecords` re-reads THOSE through `custom.read_records_by_ids` — the same
// ladder, the same masking, the same page ceiling — instead of the whole page. Only
// `record_ids: null` (the store saying it cannot name them: a reconnect, a tab wake, or more
// ids than it will list) costs a page.

import {
  defineChannelNamespace,
  subscribeToRealtimeManager,
  type ChannelSpec,
} from "@ai-matrx/realtime";
import { isOwnOp, type RecordsRealtimePort, type Uuid } from "@ai-matrx/records";

import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";

/**
 * The topic is a CONTRACT WITH THE DATABASE, not a name this client is free to choose — a
 * Postgres trigger writes it and an RLS policy parses it. `foreignTopic` is exactly the
 * package's door for that case (it is what the Chrome extension bridge uses), so the string
 * is still built in one place and still cannot be typed by hand at a call site.
 */
const storeTableChannel = defineChannelNamespace({
  namespace: "records-store-table",
  foreignTopic: "custom:table",
  parts: ["tableId"],
  description:
    "One Table in the record store. Carries NOTICES written by custom.io_outbox_broadcast_stmt — which record ids moved and whether the table's shape moved — never any value. Authorized by the one RLS policy on realtime.messages, which asks the store's own ladder.",
});

/** Coalesce a burst into one re-read. A statement is already one notice; this catches two. */
const NUDGE_DEBOUNCE_MS = 150;

interface StoreNotice {
  table_id?: string;
  kind?: "record" | "field" | "table";
  op?: "created" | "updated" | "deleted";
  /**
   * The client operation that caused this change, when the writer declared one as `_op_id`.
   * Null for a server-side write, an agent tool, or any caller that sends none — all of which
   * are changes this browser has not seen and must read.
   */
  op_id?: string | null;
  /** `null` MEANS "re-read the page" — above the cap the database stops listing ids. */
  record_ids?: string[] | null;
  fields_changed?: boolean;
  at?: string;
}

/**
 * Bind the store's live-updates port for this host.
 *
 * `organizationId` is not decoration: the store's switch is per organization, and the port
 * reads it for itself rather than trusting that whoever mounted it did. The mount already
 * refuses to render when the store is off, so the two can only ever disagree in the seconds
 * after somebody flips it — and when they do, this SAYS SO rather than sitting on a topic
 * nobody is broadcasting to.
 */
export function createRecordsRealtimePort(organizationId: string): RecordsRealtimePort {
  return {
    subscribeRecords({ table_id }, sink) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let pending = new Set<string>();
      let reReadWholePage = false;

      const flush = () => {
        timer = null;
        const ids = [...pending] as Uuid[];
        const wholePage = reReadWholePage;
        pending = new Set();
        reReadWholePage = false;
        // THE IDS ARE USED AS IDS NOW. `null` is reserved for the one thing it means — the
        // store could not name them, or the socket was away — and costs a whole page. A nudge
        // that names three records re-reads three records.
        if (wholePage) sink.records(null);
        else if (ids.length > 0) sink.records(ids);
      };

      const nudge = () => {
        if (timer !== null) return;
        timer = setTimeout(flush, NUDGE_DEBOUNCE_MS);
      };

      const spec = (): ChannelSpec => ({
        topic: storeTableChannel.topic({ tableId: table_id }),
        // Database Broadcast is authorized by RLS on realtime.messages, which is what
        // `private` means here — the package awaits `setAuth()` before subscribing, which is
        // the step whose absence makes a channel look healthy and deliver nothing forever.
        private: true,
        // The sender is Postgres, so there is no Matrx envelope to unwrap — and echo
        // suppression is NOT delegated to the manager, because it cannot recognise a
        // database's notice as ours. It is done below, by the op id the write door carried.
        wire: { mode: "raw" },
        broadcast: [
          {
            event: "records.changed",
            onMessage: (message) => {
              const notice = (message.data ?? {}) as StoreNotice;

              // OUR OWN WRITE, ALREADY APPLIED — dropped before anything else. The writer's
              // own column change has already ticked the package's shape revision, and its
              // own row change already came back from the door it wrote through.
              if (isOwnOp(notice.op_id)) return;

              if (notice.kind === "field" || notice.kind === "table") {
                // A COLUMN IS NOT A ROW. Re-reading the rows would redraw the same table
                // without the new column in it. The PORT says so through the contract now; it
                // no longer reaches around it into the package's react entry point.
                sink.shape();
              }
              if (notice.kind === "field") return;
              if (notice.record_ids == null) reReadWholePage = true;
              else for (const id of notice.record_ids) pending.add(id);
              nudge();
            },
          },
        ],
        // A CHANNEL WITH NO RECONCILIATION IS A SCREEN THAT WILL EVENTUALLY LIE. Realtime has
        // no replay, so everything that happened while the laptop was asleep is gone; the
        // only correct answer on any recovery path is to read the page again.
        onBackfill: () => {
          reReadWholePage = true;
          flush();
        },
      });

      // THE ONE SWITCH THE STORE'S SCREENS READ, asked here too. It is an async door, so the
      // join happens when it answers; `cancelled` covers an unmount that beats it.
      let stop: (() => void) | null = null;
      let cancelled = false;
      void UNIFIED_DATA_CAMPAIGN.enabled(organizationId)
        .then((on) => {
          if (cancelled) return;
          if (!on) {
            // NOTHING FAILS SILENTLY. The mount already refuses to render with the store off,
            // so reaching here means the switch moved under an open page — say which, and
            // what to do, instead of leaving a screen labelled "Live" that hears nothing.
            console.warn(
              "[records/realtime] The record store is switched off for this organization, so this " +
                `table is not live. Nothing was subscribed for ${table_id}. Reload the page — the ` +
                "screen will say so itself once it re-reads the switch.",
            );
            return;
          }
          stop = subscribeToRealtimeManager(spec);
        })
        .catch((error: unknown) => {
          console.warn(
            "[records/realtime] Could not read the record store's switch, so this table is not " +
              `live and nothing was subscribed for ${table_id}. Reload the page to try again.`,
            error,
          );
        });

      return () => {
        cancelled = true;
        if (timer !== null) clearTimeout(timer);
        stop?.();
      };
    },
  };
}
