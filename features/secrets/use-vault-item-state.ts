"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";

export interface VaultItemState {
  isFavorite: boolean;
  lastViewedAt: string | null;
}

type Status = "loading" | "ready" | "error" | "unavailable";
interface Snapshot {
  key: string;
  status: Status;
  items: Map<string, VaultItemState>;
  error: string | null;
}
interface Intent {
  key: string;
  token: number;
  operation: "favorite" | "touch";
  touchIntent?: string;
}
const EMPTY_ITEMS = new Map<string, VaultItemState>();

/** Canonical per-user state, intersected with the current authorized Vault list. */
export function useVaultItemState({ actorId, organizationId, scopeKey, itemIds }: {
  actorId: string | null;
  organizationId: string | null;
  scopeKey: string;
  itemIds: readonly string[];
}) {
  const ids = [...new Set(itemIds)].sort();
  const idsKey = ids.join("\u0000");
  const contextKey = actorId ? JSON.stringify([actorId, organizationId, scopeKey, ids]) : null;
  const [retry, setRetry] = useState(0);
  // Retry invalidates the rendered snapshot immediately, without a synchronous
  // state update in an effect or a window in which stale flags are actionable.
  const key = contextKey === null ? null : JSON.stringify([contextKey, retry]);
  const live = useRef({ key, contextKey, ids: new Set(ids) });
  const nextToken = useRef(0);
  const [pendingView, setPendingView] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  // Drop the rendered busy projection when its context departs. Otherwise a
  // later A → B → A visit could revive an old disabled control.
  if (pendingView.key !== key && pendingView.ids.size > 0) {
    setPendingView({ key: key ?? "", ids: new Set() });
  }
  const pending = useRef(new Map<string, Intent>());
  const queuedTouches = useRef(new Map<string, Intent>());
  const [snapshot, setSnapshot] = useState<Snapshot>({
    key: "", status: "loading", items: EMPTY_ITEMS, error: null,
  });
  const snapshotRef = useRef(snapshot);
  useLayoutEffect(() => {
    if (live.current.key !== key) {
      pending.current.clear();
    }
    if (live.current.contextKey !== contextKey) queuedTouches.current.clear();
    live.current = { key, contextKey, ids: new Set(ids) };
    snapshotRef.current = snapshot;
  }, [key, contextKey, idsKey, snapshot]);

  const isCurrent = (requestKey: string, itemId?: string) =>
    live.current.key === requestKey && (!itemId || live.current.ids.has(itemId));

  useEffect(() => {
    if (!key || ids.length === 0) return;
    let cancelled = false;
    void favoritesService.getBulk("credential_item", ids).then((result) => {
      if (cancelled || !isCurrent(key)) return;
      if (isScopesRpcErr(result)) {
        setSnapshot({ key, status: "error", items: EMPTY_ITEMS, error: "Couldn't load your favorites and recent views. Retry." });
        return;
      }
      const items = new Map<string, VaultItemState>();
      for (const row of result.data.items) {
        if (live.current.ids.has(row.entityId)) items.set(row.entityId, {
          isFavorite: row.isFavorite, lastViewedAt: row.lastViewedAt,
        });
      }
      setSnapshot({ key, status: "ready", items, error: null });
    }).catch(() => {
      if (!cancelled && isCurrent(key)) setSnapshot({
        key, status: "error", items: EMPTY_ITEMS,
        error: "Couldn't load your favorites and recent views. Retry.",
      });
    });
    return () => { cancelled = true; };
  }, [key, idsKey]);

  const fail = (requestKey: string, message: string) => {
    if (!isCurrent(requestKey)) return;
    setSnapshot((current) => current.key === requestKey
      ? { ...current, status: "error", error: `${message}. Retry.` }
      : current);
  };

  const reconcile = async (itemId: string, requestKey: string, intent: Intent) => {
    const result = await favoritesService.getBulk("credential_item", [itemId]);
    if (!isCurrent(requestKey, itemId) || pending.current.get(itemId) !== intent) return false;
    if (isScopesRpcErr(result)) {
      fail(requestKey, "Couldn't refresh your favorites and recent views");
      return false;
    }
    const row = result.data.items.find((candidate) => candidate.entityId === itemId);
    setSnapshot((current) => {
      if (current.key !== requestKey) return current;
      const items = new Map(current.items);
      items.set(itemId, { isFavorite: row?.isFavorite ?? false, lastViewedAt: row?.lastViewedAt ?? null });
      // A successful sibling readback must not erase another item's failure.
      return { ...current, items };
    });
    return true;
  };

  const ready = (requestKey: string) => snapshotRef.current.key === requestKey
    && snapshotRef.current.status === "ready";

  const run = async (itemId: string, requestKey: string, operation: "favorite" | "touch", touchIntent?: string) => {
    if (!isCurrent(requestKey, itemId) || !ready(requestKey) || pending.current.has(itemId)) return false;
    const intent = { key: requestKey, token: ++nextToken.current, operation, touchIntent };
    pending.current.set(itemId, intent);
    setPendingView({ key: requestKey, ids: new Set(pending.current.keys()) });
    try {
      const result = operation === "favorite"
        ? await favoritesService.setFavorite("credential_item", itemId, !snapshotRef.current.items.get(itemId)?.isFavorite)
        : await favoritesService.touch("credential_item", itemId);
      if (!isCurrent(requestKey, itemId) || pending.current.get(itemId) !== intent) return false;
      if (isScopesRpcErr(result)) {
        if (operation === "touch" && contextKey) queuedTouches.current.set(itemId, { key: contextKey, token: ++nextToken.current, operation: "touch", touchIntent });
        fail(requestKey, operation === "favorite" ? "Couldn't update this favorite" : "Couldn't update this recent view");
        return false;
      }
      // Keep the per-item lock until the server readback finishes.
      const reconciled = await reconcile(itemId, requestKey, intent);
      if (!reconciled && operation === "touch" && isCurrent(requestKey, itemId) && pending.current.get(itemId) === intent && contextKey) {
        queuedTouches.current.set(itemId, { key: contextKey, token: ++nextToken.current, operation: "touch", touchIntent });
      }
      return reconciled;
    } catch {
      if (pending.current.get(itemId) === intent && isCurrent(requestKey, itemId)) {
        if (operation === "touch" && contextKey) queuedTouches.current.set(itemId, { key: contextKey, token: ++nextToken.current, operation: "touch", touchIntent });
        fail(requestKey, operation === "favorite" ? "Couldn't update this favorite" : "Couldn't update this recent view");
      }
      return false;
    } finally {
      if (pending.current.get(itemId) === intent) {
        pending.current.delete(itemId);
        if (isCurrent(requestKey)) setPendingView({ key: requestKey, ids: new Set(pending.current.keys()) });
        const queued = queuedTouches.current.get(itemId);
        if (queued?.key === contextKey && isCurrent(requestKey, itemId)) {
          // Dispatch after React has committed any error/readback state. The
          // ready-state effect owns draining; failure retains the retry UI.
          setSnapshot((current) => current.key === requestKey ? { ...current } : current);
        }
      }
    }
  };

  const touch = async (itemId: string, touchIntent?: string) => {
    if (!key || !contextKey || !isCurrent(key, itemId)) return false;
    const active = pending.current.get(itemId);
    if (!ready(key) || active) {
      // A retry drain and the routed-item effect can both express the same
      // routed open in one commit. Direct opens remain distinct intentions.
      if (!(touchIntent && active?.operation === "touch" && active.touchIntent === touchIntent)) {
        queuedTouches.current.set(itemId, { key: contextKey, token: ++nextToken.current, operation: "touch", touchIntent });
      }
      return true; // The explicit intent was accepted; the effect owns delivery.
    }
    return run(itemId, key, "touch", touchIntent);
  };

  useEffect(() => {
    if (!key || snapshot.key !== key || snapshot.status !== "ready") return;
    for (const [itemId, intent] of queuedTouches.current) {
      if (intent.key !== contextKey || !live.current.ids.has(itemId)) {
        queuedTouches.current.delete(itemId);
      } else if (!pending.current.has(itemId)) {
        queuedTouches.current.delete(itemId);
        void run(itemId, key, "touch", intent.touchIntent);
      }
    }
  }, [key, snapshot]);

  const current: Snapshot = !key
    ? { key: "", status: "unavailable", items: EMPTY_ITEMS, error: "Sign in to load saved Vault views." }
    : ids.length === 0 ? { key, status: "ready", items: EMPTY_ITEMS, error: null }
    : snapshot.key === key ? snapshot
    : { key, status: "loading", items: EMPTY_ITEMS, error: null };
  return {
    status: current.status, error: current.error, stateById: current.items,
    pendingItemIds: pendingView.key === key ? pendingView.ids : new Set<string>(),
    retry: () => setRetry((value) => value + 1),
    toggleFavorite: (itemId: string) => key ? run(itemId, key, "favorite") : Promise.resolve(false),
    touch,
  };
}
