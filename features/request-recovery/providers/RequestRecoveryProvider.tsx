/**
 * Request Recovery Provider
 *
 * Scans IndexedDB on mount for orphaned (failed / in-flight) payload records,
 * makes them available to the recovery UI, and keeps the netHealth slice's
 * `online` flag in sync with `navigator.onLine`.
 *
 * Mirrors features/audio/providers/AudioRecoveryProvider.tsx.
 */

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  payloadSafetyStore,
  type PayloadRecord,
} from "@/lib/persistence/payloadSafetyStore";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setOnline } from "@/lib/redux/net/netHealthSlice";

interface RequestRecoveryContextValue {
  items: PayloadRecord[];
  hasItems: boolean;
  hasNewItems: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
  markViewed: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
  updatePayload: (
    id: string,
    updates: Partial<
      Pick<PayloadRecord, "payload" | "rawUserInput" | "label">
    >,
  ) => Promise<void>;
}

const noop = async () => {};

const RequestRecoveryContext = createContext<RequestRecoveryContextValue>({
  items: [],
  hasItems: false,
  hasNewItems: false,
  isOpen: false,
  open: () => {},
  close: () => {},
  refresh: noop,
  markViewed: noop,
  deleteItem: noop,
  deleteAll: noop,
  updatePayload: noop,
});

export function useRequestRecovery() {
  return useContext(RequestRecoveryContext);
}

export function RequestRecoveryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<PayloadRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      if (typeof window === "undefined" || !window.indexedDB) {
        setItems([]);
        return;
      }
      const orphans = await payloadSafetyStore.getOrphaned();
      setItems(orphans);
    } catch (err) {
      console.warn("[RequestRecoveryProvider] failed to read IndexedDB:", err);
    } finally {
      refreshing.current = false;
    }
  }, []);

  // Initial scan + periodic refresh while the panel is closed so newly-failed
  // requests show up without a full page reload.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOnline = () => dispatch(setOnline(true));
    const onOffline = () => dispatch(setOnline(false));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [dispatch]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    void refresh();
  }, [refresh]);

  const markViewed = useCallback(
    async (id: string) => {
      await payloadSafetyStore.markViewed(id);
      await refresh();
    },
    [refresh],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      await payloadSafetyStore.deleteEntry(id);
      await refresh();
    },
    [refresh],
  );

  const deleteAll = useCallback(async () => {
    await payloadSafetyStore.clearAll();
    await refresh();
  }, [refresh]);

  const updatePayload = useCallback(
    async (
      id: string,
      updates: Partial<
        Pick<PayloadRecord, "payload" | "rawUserInput" | "label">
      >,
    ) => {
      await payloadSafetyStore.updatePayload(id, updates);
      await refresh();
    },
    [refresh],
  );

  const hasItems = items.length > 0;
  const hasNewItems = items.some((item) => !item.viewedByUser);

  const value: RequestRecoveryContextValue = {
    items,
    hasItems,
    hasNewItems,
    isOpen,
    open,
    close,
    refresh,
    markViewed,
    deleteItem,
    deleteAll,
    updatePayload,
  };

  return (
    <RequestRecoveryContext.Provider value={value}>
      {children}
    </RequestRecoveryContext.Provider>
  );
}
