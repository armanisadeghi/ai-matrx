// features/transcripts/context/TranscriptsContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "@/utils/supabase/client";
import { uniqueChannelTopic } from "@/utils/supabase/realtime";
import type { ListScope } from "@/lib/list-scope/types";
import type {
  Transcript,
  CreateTranscriptInput,
  UpdateTranscriptInput,
} from "../types";
import * as transcriptsService from "../service/transcriptsService";

interface TranscriptsContextType {
  transcripts: Transcript[];
  isLoading: boolean;
  activeTranscript: Transcript | null;
  setActiveTranscript: (transcript: Transcript | null) => void;
  createTranscript: (input: CreateTranscriptInput) => Promise<Transcript>;
  updateTranscript: (
    id: string,
    updates: UpdateTranscriptInput,
  ) => Promise<void>;
  deleteTranscript: (id: string) => Promise<void>;
  copyTranscript: (id: string) => Promise<void>;
  refreshTranscripts: () => Promise<void>;
  initialize: () => void;
  initialized: boolean;
  /** VIEW LAW: the declared list scope driving fetchAllTranscripts. */
  scope: ListScope;
  setScope: (scope: ListScope) => void;
}

const TranscriptsContext = createContext<TranscriptsContextType | undefined>(
  undefined,
);

export function TranscriptsProvider({ children }: { children: ReactNode }) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTranscript, setActiveTranscript] = useState<Transcript | null>(
    null,
  );
  const [initialized, setInitialized] = useState(false);
  const [scope, setScope] = useState<ListScope>({ kind: "mine" });
  const channelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(
    null,
  );

  // Fetch all transcripts, scoped per THE VIEW LAW (defaults to "mine").
  const fetchAllTranscripts = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await transcriptsService.fetchTranscripts(scope);
      setTranscripts(data);

      // If we have an active transcript, refresh it from the new data
      if (activeTranscript) {
        const refreshedActive = data.find((t) => t.id === activeTranscript.id);
        if (refreshedActive) {
          setActiveTranscript(refreshedActive);
        } else if (data.length > 0) {
          // Active was deleted, select first one
          setActiveTranscript(data[0]);
        } else {
          setActiveTranscript(null);
        }
      } else if (data.length > 0) {
        // No active transcript, set the first one
        setActiveTranscript(data[0]);
      }
    } catch (error) {
      console.error("Error fetching transcripts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTranscript, scope]);

  // Re-fetch whenever the declared scope changes (after initial load).
  useEffect(() => {
    if (!initialized) return;
    fetchAllTranscripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, initialized]);

  const initialize = useCallback(() => {
    if (initialized) return;
    setInitialized(true);
    setIsLoading(true);

    fetchAllTranscripts();

    const channel = supabase
      .channel(uniqueChannelTopic("transcripts-changes"))
      .on(
        "postgres_changes",
        { event: "*", schema: "transcripts", table: "transcripts" },
        () => {
          fetchAllTranscripts();
        },
      )
      .subscribe();

    channelRef.current = channel;
  }, [initialized, fetchAllTranscripts]);

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  // Create transcript
  const createTranscript = useCallback(
    async (input: CreateTranscriptInput): Promise<Transcript> => {
      const newTranscript = await transcriptsService.createTranscript(input);
      // Add to the beginning of the list and set as active
      setTranscripts((prev) => [newTranscript, ...prev]);
      setActiveTranscript(newTranscript);
      return newTranscript;
    },
    [],
  );

  // Update transcript
  const updateTranscript = useCallback(
    async (id: string, updates: UpdateTranscriptInput): Promise<void> => {
      // Optimistic update for better UX
      if (activeTranscript?.id === id) {
        setActiveTranscript((prev) =>
          prev ? ({ ...prev, ...updates } as Transcript) : null,
        );
      }
      setTranscripts((prev) =>
        prev.map((t) =>
          t.id === id ? ({ ...t, ...updates } as Transcript) : t,
        ),
      );

      // Perform actual update
      const updated = await transcriptsService.updateTranscript(id, updates);

      // Update with server response
      setTranscripts((prev) => prev.map((t) => (t.id === id ? updated : t)));

      if (activeTranscript?.id === id) {
        setActiveTranscript(updated);
      }
    },
    [activeTranscript],
  );

  // Delete transcript
  const deleteTranscript = useCallback(
    async (id: string): Promise<void> => {
      await transcriptsService.deleteTranscript(id);

      // Remove from list immediately (optimistic update)
      const newTranscripts = transcripts.filter((t) => t.id !== id);
      setTranscripts(newTranscripts);

      // If deleting active transcript, select the first available one
      if (activeTranscript?.id === id) {
        setActiveTranscript(
          newTranscripts.length > 0 ? newTranscripts[0] : null,
        );
      }
    },
    [activeTranscript, transcripts],
  );

  // Copy transcript
  const copyTranscript = useCallback(async (id: string): Promise<void> => {
    const copied = await transcriptsService.copyTranscript(id);
    // Add copy to the beginning and set as active
    setTranscripts((prev) => [copied, ...prev]);
    setActiveTranscript(copied);
  }, []);

  // Refresh transcripts
  const refreshTranscripts = useCallback(async (): Promise<void> => {
    await fetchAllTranscripts();
  }, [fetchAllTranscripts]);

  const value: TranscriptsContextType = {
    transcripts,
    isLoading,
    activeTranscript,
    setActiveTranscript,
    createTranscript,
    updateTranscript,
    deleteTranscript,
    copyTranscript,
    refreshTranscripts,
    initialize,
    initialized,
    scope,
    setScope,
  };

  return (
    <TranscriptsContext.Provider value={value}>
      {children}
    </TranscriptsContext.Provider>
  );
}

export function useTranscriptsContext() {
  const context = useContext(TranscriptsContext);
  if (!context) {
    throw new Error(
      "useTranscriptsContext must be used within TranscriptsProvider",
    );
  }
  return context;
}
