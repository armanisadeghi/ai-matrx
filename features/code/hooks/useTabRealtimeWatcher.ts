"use client";

import { useEffect } from "react";
import { recordToast } from "@/lib/toast";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { supabase } from "@/utils/supabase/client";
import { useRealtimeManager } from "@ai-matrx/realtime/react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectCodeTabs,
  selectTabById,
  setTabRemoteUpdatedAt,
} from "../redux/tabsSlice";
import { getAdapterForTabId } from "../library-sources/registry";

/**
 * Subscribe to Supabase Realtime for every open library-source-backed
 * tab. When the underlying row changes elsewhere (another browser, a
 * Python agent, a SQL console), refresh the tab's `remoteUpdatedAt`
 * watermark so the next save either succeeds quietly (if the local
 * buffer is clean) or surfaces the conflict toast (if dirty).
 *
 * For dirty tabs, also fire a one-time soft warning telling the user
 * the row moved on remotely so they can decide whether to reload before
 * they hit save.
 *
 * REALTIME: `@ai-matrx/realtime` owns every one of these channels — unique
 * instance topics, dedup, the decoupled ordered handler queue, jittered
 * reconnect, tab sleep, diagnostics. What was here was a raw
 * `.channel(...).subscribe()` per tab (with an `as never` cast to get past the
 * `.on` types), manual `removeChannel` teardown, and NO catch-up read: a row
 * edited by a Python agent while the laptop slept left the tab's watermark
 * stale, so the next save either silently overwrote the agent's work or fired a
 * conflict that made no sense. `onBackfill` re-reads the watermark.
 *
 * The `remoteUpdatedAt === updatedAt` no-op below is NOT a second copy of echo
 * suppression: this feature's saves go through the library-source adapters and
 * are not registered on the package's write ledger, so the watermark is what
 * keeps our own save from raising a conflict toast against itself. If those
 * adapters are ever routed through `manager.ledger`, this check becomes
 * redundant and should go with them.
 */

/** One place names this channel. A second, different declaration throws. */
const codeTabChannel = defineChannelNamespace({
  namespace: "code-tab",
  parts: ["schema", "table", "rowId"],
  description: "One library-source-backed row behind an open code tab",
});
export function useTabRealtimeWatcher(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const tabsState = useAppSelector(selectCodeTabs);

  const manager = useRealtimeManager();

  useEffect(() => {
    if (!manager) return undefined;

    const closers: Array<() => void> = [];
    const warnedDirtyKeys = new Set<string>();

    for (const tabId of tabsState.order) {
      const adapter = getAdapterForTabId(tabId);
      if (!adapter) continue;
      const parsed = adapter.parseTabId(tabId);
      if (!parsed) continue;
      // adapter.sourceId is just this adapter's internal label, not
      // necessarily the real schema-qualified table name — use the
      // adapter-declared realtimeTable instead. Adapters without one (e.g. a
      // decommissioned source) have no live table to watch; skip rather than
      // filter on a guessed name that would silently never match.
      if (!adapter.realtimeTable) continue;
      const { schema, table } = adapter.realtimeTable;
      const rowId = parsed.rowId;

      /** Apply a fresh remote watermark, warning once if the tab is dirty. */
      const applyWatermark = (updatedAt: string | undefined): void => {
        if (!updatedAt) return;

        const liveTab = selectTabById(tabId)(store.getState());
        if (!liveTab) return;

        // No-op when our local watermark already matches (this event is the
        // echo of our own save — see the header for why this stays).
        if (liveTab.remoteUpdatedAt === updatedAt) return;

        dispatch(
          setTabRemoteUpdatedAt({ id: tabId, remoteUpdatedAt: updatedAt }),
        );

        if (liveTab.dirty) {
          const warnKey = `${tabId}:${updatedAt}`;
          if (warnedDirtyKeys.has(warnKey)) return;
          warnedDirtyKeys.add(warnKey);
          recordToast.warning(
            { type: table, id: rowId, title: liveTab.name },
            `"${liveTab.name}" was updated remotely`,
            {
              description:
                "Reload the tab to see the latest, or save to keep your local edits and overwrite.",
            },
          );
        }
      };

      const handle = manager.open({
        topic: codeTabChannel.topic({ schema, table, rowId }),
        postgresChanges: [
          {
            event: "UPDATE",
            schema,
            table,
            filter: `id=eq.${rowId}`,
            rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
            fingerprint: (row) => String(row.updated_at ?? ""),
            onChange: ({ row }) => {
              applyWatermark(
                typeof row?.updated_at === "string" ? row.updated_at : undefined,
              );
            },
          },
        ],
        // Realtime has no replay: a save that landed while the socket was down
        // would leave a permanently stale watermark. Re-read it.
        onBackfill: async () => {
          // Realtime has no replay, so re-read the row's watermark through the
          // adapter's own loader — the same call the tab used at open time.
          try {
            const fresh = await adapter.load(supabase, rowId, parsed.fieldId);
            applyWatermark(fresh.updatedAt);
          } catch (error) {
            // Not silent: a failed catch-up means this tab's conflict
            // detection is running on a stale watermark until the next event.
            console.warn(
              `[code-tab RT] catch-up read failed for ${table}:${rowId} — ` +
                "this tab's remote watermark may be stale; reopen the tab to " +
                "resync before saving.",
              error,
            );
          }
        },
      });

      closers.push(() => handle.close());
    }

    return () => {
      for (const close of closers) close();
    };
  }, [tabsState.order, dispatch, store, manager]);
}
