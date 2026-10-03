import { createStore } from "zustand";
import type { ResearchTopic, ResearchProgress } from "../types";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";

/**
 * The topic workspace's LOCAL store: its id and the stream-debug bus. The
 * topic and its overview are not here — they live in Redux by topic id
 * (`ResearchContext.tsx`, `useStoreRead`), so a remount never reads them again.
 */
export interface TopicStoreState {
  topicId: string;
  debugEvents: TypedStreamEvent[];
  activeStreamName: string | null;
}

export interface TopicStoreActions {
  pushDebugEvents: (events: TypedStreamEvent[], streamName: string) => void;
  clearDebugEvents: () => void;
}

export type TopicStore = TopicStoreState & TopicStoreActions;

/** A server-rendered topic: seeds the Redux copy when it has none. */
export interface TopicStoreInitialData {
  topic?: ResearchTopic | null;
  progress?: ResearchProgress | null;
}

export function createTopicStore(topicId: string) {
  return createStore<TopicStore>()((set) => ({
    topicId,
    debugEvents: [],
    activeStreamName: null,
    pushDebugEvents: (events, streamName) =>
      set((state) => ({
        debugEvents: [...state.debugEvents, ...events],
        activeStreamName: streamName,
      })),
    clearDebugEvents: () => set({ debugEvents: [], activeStreamName: null }),
  }));
}
