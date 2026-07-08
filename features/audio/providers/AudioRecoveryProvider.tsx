/**
 * Audio Recovery Provider
 *
 * Detects orphaned audio recordings in IndexedDB on mount and surfaces
 * a recovery UI so the user can retrieve their lost audio/text.
 */

"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { audioSafetyStore, SafetyRecord } from "../services/audioSafetyStore";
import { discardChunkJournal } from "../services/audioChunkJournal";

interface AudioRecoveryContextValue {
  hasRecoveredData: boolean;
  recoveredItems: SafetyRecord[];
  dismissItem: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  getAudioBlob: (id: string) => Promise<Blob | null>;
  refreshRecovery: () => Promise<void>;
  initialize: () => void;
}

const AudioRecoveryContext = createContext<AudioRecoveryContextValue>({
  hasRecoveredData: false,
  recoveredItems: [],
  dismissItem: async () => {},
  dismissAll: async () => {},
  getAudioBlob: async () => null,
  refreshRecovery: async () => {},
  initialize: () => {},
});

export function useAudioRecovery() {
  return useContext(AudioRecoveryContext);
}

export function AudioRecoveryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [recoveredItems, setRecoveredItems] = useState<SafetyRecord[]>([]);
  const [initialized, setInitialized] = useState(false);

  const checkForOrphans = useCallback(async () => {
    try {
      if (typeof window === "undefined" || !window.indexedDB) return;
      const orphans = await audioSafetyStore.getOrphaned();
      setRecoveredItems(orphans);
    } catch (err) {
      console.warn("[AudioRecoveryProvider] Failed to check IndexedDB:", err);
    }
  }, []);

  const initialize = useCallback(() => {
    if (initialized) return;
    setInitialized(true);
    checkForOrphans();
  }, [initialized, checkForOrphans]);

  const dismissItem = useCallback(async (id: string) => {
    try {
      await audioSafetyStore.deleteEntry(id);
      // User explicitly discarded the recording — drop its eager chunk
      // journal (cross-device staging) too. Best-effort.
      void discardChunkJournal(id);
      setRecoveredItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("[AudioRecoveryProvider] Failed to delete entry:", err);
    }
  }, []);

  const dismissAll = useCallback(async () => {
    try {
      for (const item of recoveredItems) {
        await audioSafetyStore.deleteEntry(item.id);
        void discardChunkJournal(item.id);
      }
      setRecoveredItems([]);
    } catch (err) {
      console.error(
        "[AudioRecoveryProvider] Failed to clear all entries:",
        err,
      );
    }
  }, [recoveredItems]);

  const getAudioBlob = useCallback(async (id: string): Promise<Blob | null> => {
    try {
      return await audioSafetyStore.getAudioBlob(id);
    } catch {
      return null;
    }
  }, []);

  const value: AudioRecoveryContextValue = {
    hasRecoveredData: recoveredItems.length > 0,
    recoveredItems,
    dismissItem,
    dismissAll,
    getAudioBlob,
    refreshRecovery: checkForOrphans,
    initialize,
  };

  return (
    <AudioRecoveryContext.Provider value={value}>
      {children}
    </AudioRecoveryContext.Provider>
  );
}
