"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
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
 */
export function useTabRealtimeWatcher(): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const tabsState = useAppSelector(selectCodeTabs);

  useEffect(() => {
    type WatchEntry = {
      tabId: string;
      table: string;
      rowId: string;
      channel: RealtimeChannel;
    };

    const supabase = createClient();
    const watched: WatchEntry[] = [];
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

      const channelName = uniqueChannelTopic(`code-tab-rt:${table}:${rowId}`);
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as never,
          {
            event: "UPDATE",
            schema,
            table,
            filter: `id=eq.${rowId}`,
          },
          (payload: { new?: Record<string, unknown> }) => {
            const newRow = payload.new;
            const updatedAt =
              typeof newRow?.updated_at === "string"
                ? newRow.updated_at
                : undefined;
            if (!updatedAt) return;

            const liveTab = selectTabById(tabId)(store.getState());
            if (!liveTab) return;

            // No-op when our local watermark already matches (i.e. this
            // realtime event is the echo of our own save).
            if (liveTab.remoteUpdatedAt === updatedAt) return;

            dispatch(
              setTabRemoteUpdatedAt({ id: tabId, remoteUpdatedAt: updatedAt }),
            );

            if (liveTab.dirty) {
              const warnKey = `${tabId}:${updatedAt}`;
              if (warnedDirtyKeys.has(warnKey)) return;
              warnedDirtyKeys.add(warnKey);
              toast.warning(`"${liveTab.name}" was updated remotely`, {
                description:
                  "Reload the tab to see the latest, or save to keep your local edits and overwrite.",
              });
            }
          },
        )
        .subscribe();

      watched.push({ tabId, table, rowId, channel });
    }

    return () => {
      for (const w of watched) {
        supabase.removeChannel(w.channel);
      }
    };
  }, [tabsState.order, dispatch, store]);
}
