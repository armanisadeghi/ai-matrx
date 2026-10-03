"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useAppStore } from "@/lib/redux/hooks";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { selectStoreRead, setStoreReadData } from "@/lib/redux/slices/storeReadsSlice";
import * as service from "../service";
import {
  createTopicStore,
  type TopicStore,
  type TopicStoreInitialData,
} from "../state/topicStore";
import type { ResearchTopic, ResearchProgress } from "../types";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";

type TopicStoreInstance = ReturnType<typeof createTopicStore>;

const TopicStoreContext = createContext<TopicStoreInstance | null>(null);

function useTopicStore<T>(selector: (state: TopicStore) => T): T {
  const store = useContext(TopicStoreContext);
  if (!store)
    throw new Error("useTopicStore must be used within a TopicProvider");
  return useStore(store, selector);
}

// ============================================================================
// The topic and its overview live in Redux by topic id (`useStoreRead`): the
// first view reads them, a remount or a second view renders the stored copy
// and reads nothing; `refresh` / `refreshProgress` are the deliberate re-reads.
// ============================================================================

const topicKey = (topicId: string) => `research.topic:${topicId}`;
const overviewKey = (topicId: string) => `research.overview:${topicId}`;

function useTopicRead(topicId: string) {
  return useStoreRead<ResearchTopic | null>(topicKey(topicId), () => service.getTopic(topicId));
}

function useOverviewRead(topicId: string) {
  return useStoreRead<ResearchProgress | null>(overviewKey(topicId), () => service.getTopicOverview(topicId));
}

// ============================================================================
// Selector hooks — components subscribe to exactly what they need
// ============================================================================

export function useTopicId(): string {
  return useTopicStore((s) => s.topicId);
}

export function useTopicData(): {
  topic: ResearchTopic | null;
  isLoading: boolean;
  error: string | null;
} {
  const topicId = useTopicId();
  const read = useTopicRead(topicId);
  return {
    topic: read.data ?? null,
    isLoading: !read.hasData && read.status !== "error",
    // A failed refresh keeps the topic on screen; only a first read that
    // failed is the screen's error.
    error: read.hasData ? null : read.error,
  };
}

export function useTopicProgress(): ResearchProgress | null {
  const topicId = useTopicId();
  return useOverviewRead(topicId).data ?? null;
}

/** Targeted selector — primitive return, stable across rerenders. */
export function useTopicDescription(): string | null {
  return useTopicData().topic?.description ?? null;
}

// ============================================================================
// Stream Debug — selector hooks
// ============================================================================

export interface StreamDebugBus {
  events: TypedStreamEvent[];
  activeStreamName: string | null;
  pushEvents: (events: TypedStreamEvent[], streamName: string) => void;
  clearEvents: () => void;
}

export function useStreamDebug(): StreamDebugBus {
  const events = useTopicStore((s) => s.debugEvents);
  const activeStreamName = useTopicStore((s) => s.activeStreamName);
  const pushEvents = useTopicStore((s) => s.pushDebugEvents);
  const clearEvents = useTopicStore((s) => s.clearDebugEvents);
  return { events, activeStreamName, pushEvents, clearEvents };
}

// ============================================================================
// Backward-compatible hook — returns the same shape as the old Context
// ============================================================================

interface TopicContextValue {
  topicId: string;
  topic: ResearchTopic | null;
  progress: ResearchProgress | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshProgress: () => Promise<void>;
}

export function useTopicContext(): TopicContextValue {
  const topicId = useTopicId();
  const topicRead = useTopicRead(topicId);
  const overviewRead = useOverviewRead(topicId);
  const { topic, isLoading, error } = useTopicData();
  return {
    topicId,
    topic,
    progress: overviewRead.data ?? null,
    isLoading,
    error,
    // The topic, then its overview — the order the workspace has always read.
    refresh: async () => {
      await topicRead.refresh();
      await overviewRead.refresh();
    },
    refreshProgress: overviewRead.refresh,
  };
}

// ============================================================================
// Provider — the topic's local stream-debug store; the topic itself is in Redux
// ============================================================================

interface TopicProviderProps {
  topicId: string;
  /** The server-rendered topic: seeds the store when it has no copy yet. */
  initialData?: TopicStoreInitialData;
  children: ReactNode;
}

export function TopicProvider({
  topicId,
  initialData,
  children,
}: TopicProviderProps) {
  const storeRef = useRef<TopicStoreInstance | null>(null);
  if (!storeRef.current) {
    storeRef.current = createTopicStore(topicId);
  }
  return (
    <TopicStoreContext.Provider value={storeRef.current}>
      <TopicReads topicId={topicId} initialData={initialData} />
      {children}
    </TopicStoreContext.Provider>
  );
}

/**
 * Asks for the topic and its overview once per topic (a no-op when the store
 * has them). The first child of the provider, so its effects run before any
 * view inside asks.
 */
function TopicReads({ topicId, initialData }: { topicId: string; initialData?: TopicStoreInitialData }) {
  const reduxStore = useAppStore();
  // Declared BEFORE the reads below (effects run in order): a server-rendered
  // topic is an answer, never a reason to read it again.
  useEffect(() => {
    const state = reduxStore.getState();
    if (initialData?.topic && !selectStoreRead(state, topicKey(topicId))) {
      reduxStore.dispatch(setStoreReadData({ key: topicKey(topicId), data: initialData.topic }));
    }
    if (initialData?.progress && !selectStoreRead(state, overviewKey(topicId))) {
      reduxStore.dispatch(setStoreReadData({ key: overviewKey(topicId), data: initialData.progress }));
    }
  }, [reduxStore, topicId, initialData]);
  useTopicRead(topicId);
  useOverviewRead(topicId);
  return null;
}

/** @deprecated Use TopicProvider and useTopicContext instead */
export const ResearchProvider = TopicProvider;
/** @deprecated Use useTopicContext instead */
export const useResearchContext = useTopicContext;
