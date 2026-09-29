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
// same rows in it. Who may read each record is decided by the ladder at READ time, so anything
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
  const existing = portsByOrganization.get(organizationId);
  if (existing) return existing;
  const port = buildRecordsRealtimePort(organizationId);
  portsByOrganization.set(organizationId, port);
  return port;
}

/**
 * 🚨 ONE PORT PER ORGANIZATION, SO THE SAME ARGUMENT IS THE SAME PORT (lane PANEL-REMOUNT,
 * 2026-09-24). `<RecordsProvider>` rebuilds its whole records client when `config.realtime`
 * changes identity — correctly: a different port is a different client — and every grid hook
 * re-reads on a new client. The /data-v2 pages build this port inline in `config`, so ANY
 * re-render of the page (a `?panels=` write when a window opened, `?view=`, anything that
 * moves `useSearchParams`) handed the provider a fresh object and the whole grid re-read
 * `table_kernel_id`, `applicable_fields`, `my_levels`… and redrew its rows. The port holds no
 * state of its own (every subscription's state lives in its own closure), so one per
 * organization is exactly as correct and makes every caller stable without a `useMemo`.
 */
const portsByOrganization = new Map<string, RecordsRealtimePort>();

/**
 * ONE LISTENER'S SIDE OF A TABLE'S CHANNEL: its own burst coalescing, fed by the table's ONE
 * subscription. Every hook that reads the same table (the grid, its summaries, the export, the
 * row-actions editor, the Sheet's own hook…) is a listener; none of them joins a channel.
 */
interface TableListener {
  notice(notice: StoreNotice): void;
  backfill(): void;
}

/**
 * 🚨 ONE CHANNEL PER TABLE, HOWEVER MANY READERS (merged-grid review 2, 2026-09-27: 124
 * `channel.raw.*` warnings in one session). Every `useRecords` on the page — the grid, the
 * export menu's page, the row-actions editor's sample, a second grid hook — called
 * `subscribeRecords`, and each call opened its own holder on `custom:table:<id>`; the manager
 * shares the wire, but each OPEN is announced, and every re-subscribe on a re-render announced
 * again. Now the port keeps ONE manager subscription per table (opened by the first listener,
 * closed by the last), and fans each notice out to the listeners. The spec also declares its
 * echo test (`isOwnOp` on the notice's `op_id`) and a dedup key, so the raw wire is guarded, not
 * merely announced as unguarded.
 */
interface TableChannel {
  listeners: Set<TableListener>;
  stop: (() => void) | null;
  cancelled: boolean;
}

/** The notice's own identity: a redelivered notice is the same statement at the same instant. */
export function noticeKey(notice: StoreNotice): string | undefined {
  if (!notice.at) return undefined;
  const ids = notice.record_ids == null ? "*" : [...notice.record_ids].sort().join(",");
  return `${notice.table_id ?? ""}:${notice.kind ?? ""}:${notice.op ?? ""}:${notice.op_id ?? ""}:${notice.at}:${ids}`;
}

function buildRecordsRealtimePort(organizationId: string): RecordsRealtimePort {
  const channels = new Map<string, TableChannel>();

  const open = (tableId: string): TableChannel => {
    const channel: TableChannel = { listeners: new Set(), stop: null, cancelled: false };
    const spec = (): ChannelSpec => ({
      topic: storeTableChannel.topic({ tableId }),
      // Database Broadcast is authorized by RLS on realtime.messages, which is what
      // `private` means here — the package awaits `setAuth()` before subscribing, which is
      // the step whose absence makes a channel look healthy and deliver nothing forever.
      private: true,
      // The sender is Postgres, so there is no Matrx envelope to unwrap. OUR OWN WRITE is known
      // by the op id the write door carried (`isOwnOp`) — declared to the manager, so the echo
      // is dropped before anything else and the raw wire is guarded, not warned about.
      wire: { mode: "raw", isOwnMessage: (payload) => isOwnOp((payload as StoreNotice | null)?.op_id) },
      // A redelivered notice is the same statement: the manager's dedup keys it by what it says.
      eventKey: (_source, payload) => noticeKey((payload ?? {}) as StoreNotice),
      broadcast: [
        {
          event: "records.changed",
          onMessage: (message) => {
            const notice = (message.data ?? {}) as StoreNotice;
            // Belt and braces: a notice the manager did not recognise as ours is still checked.
            if (isOwnOp(notice.op_id)) return;
            for (const listener of channel.listeners) listener.notice(notice);
          },
        },
      ],
      // A CHANNEL WITH NO RECONCILIATION IS A SCREEN THAT WILL EVENTUALLY LIE. Realtime has
      // no replay, so everything that happened while the laptop was asleep is gone; the
      // only correct answer on any recovery path is to read the page again.
      onBackfill: () => {
        for (const listener of channel.listeners) listener.backfill();
      },
    });

    // THE ONE SWITCH THE STORE'S SCREENS READ, asked here too. It is an async door, so the
    // join happens when it answers; `cancelled` covers the last listener leaving before it.
    void UNIFIED_DATA_CAMPAIGN.enabled(organizationId)
      .then((on) => {
        if (channel.cancelled) return;
        if (!on) {
          // NOTHING FAILS SILENTLY. The mount already refuses to render with the store off,
          // so reaching here means the switch moved under an open page — say which, and
          // what to do, instead of leaving a screen labelled "Live" that hears nothing.
          console.warn(
            "[records/realtime] The record store is switched off for this organization, so this " +
              `table is not live. Nothing was subscribed for ${tableId}. Reload the page — the ` +
              "screen will say so itself once it re-reads the switch.",
          );
          return;
        }
        channel.stop = subscribeToRealtimeManager(spec);
      })
      .catch((error: unknown) => {
        console.warn(
          "[records/realtime] Could not read the record store's switch, so this table is not " +
            `live and nothing was subscribed for ${tableId}. Reload the page to try again.`,
          error,
        );
      });
    return channel;
  };

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

      const listener: TableListener = {
        notice(notice) {
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
        backfill() {
          reReadWholePage = true;
          flush();
        },
      };

      const channel = channels.get(table_id) ?? open(table_id);
      channels.set(table_id, channel);
      channel.listeners.add(listener);

      return () => {
        if (timer !== null) clearTimeout(timer);
        channel.listeners.delete(listener);
        if (channel.listeners.size > 0) return;
        // The last reader of this table left: the table's one subscription goes with it.
        channel.cancelled = true;
        channel.stop?.();
        channels.delete(table_id);
      };
    },
  };
}
