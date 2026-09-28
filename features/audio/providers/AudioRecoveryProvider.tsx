/**
 * Audio Recovery Provider
 *
 * Detects orphaned audio recordings in IndexedDB on mount and surfaces
 * a recovery UI so the user can retrieve their lost audio/text.
 */

"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { toast } from "@/lib/toast";
import { audioSafetyStore, SafetyRecord } from "../services/audioSafetyStore";
import { discardChunkJournal } from "../services/audioChunkJournal";
import { getSharedDirtyRecordingMarker } from "@ai-matrx/browser-audio/core";

interface AudioRecoveryContextValue {
  hasRecoveredData: boolean;
  recoveredItems: SafetyRecord[];
  dismissItem: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  getAudioBlob: (id: string) => Promise<Blob | null>;
  refreshRecovery: () => Promise<void>;
  initialize: () => void;
  /**
   * The orphan scan (the IndexedDB read) failed — "no recovered recordings"
   * is then unknown, not true. Null after a scan that succeeded (RC-B12 r12).
   */
  recoveryError: unknown;
}

const AudioRecoveryContext = createContext<AudioRecoveryContextValue>({
  hasRecoveredData: false,
  recoveredItems: [],
  dismissItem: async () => {},
  dismissAll: async () => {},
  getAudioBlob: async () => null,
  refreshRecovery: async () => {},
  initialize: () => {},
  recoveryError: null,
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
  const [recoveryError, setRecoveryError] = useState<unknown>(null);

  const checkForOrphans = useCallback(async () => {
    try {
      if (typeof window === "undefined" || !window.indexedDB) return;
      const orphans = await audioSafetyStore.getOrphaned();
      setRecoveredItems(orphans);
      setRecoveryError(null);
      // Clean scan — nothing to recover, so the dirty-recording boot marker
      // (which auto-activates the audio system on boot) has done its job.
      if (orphans.length === 0) getSharedDirtyRecordingMarker().clear();
    } catch (err) {
      console.warn("[AudioRecoveryProvider] Failed to check IndexedDB:", err);
      setRecoveryError(err ?? true);
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
      setRecoveredItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        // Last orphan handled — stop re-activating audio on every boot.
        if (next.length === 0) getSharedDirtyRecordingMarker().clear();
        return next;
      });
    } catch (err) {
      console.error("[AudioRecoveryProvider] Failed to delete entry:", err);
      toast.error("Couldn't discard that recovered recording — it is still saved on this device.");
    }
  }, []);

  const dismissAll = useCallback(async () => {
    try {
      for (const item of recoveredItems) {
        await audioSafetyStore.deleteEntry(item.id);
        void discardChunkJournal(item.id);
      }
      setRecoveredItems([]);
      getSharedDirtyRecordingMarker().clear();
    } catch (err) {
      console.error(
        "[AudioRecoveryProvider] Failed to clear all entries:",
        err,
      );
      toast.error("Couldn't discard every recovered recording — some may still be saved on this device.");
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
    recoveryError,
  };

  return (
    <AudioRecoveryContext.Provider value={value}>
      {children}
    </AudioRecoveryContext.Provider>
  );
}
