import { createStore } from "zustand";
import type { ResearchTopic, ResearchProgress } from "../types";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";

export interface TopicStoreState {
  topicId: string;
  topic: ResearchTopic | null;
  progress: ResearchProgress | null;
  isLoading: boolean;
  error: string | null;

  debugEvents: TypedStreamEvent[];
  activeStreamName: string | null;
}

export interface TopicStoreActions {
  setTopic: (topic: ResearchTopic | null) => void;
  setProgress: (progress: ResearchProgress | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  pushDebugEvents: (events: TypedStreamEvent[], streamName: string) => void;
  clearDebugEvents: () => void;
}

export type TopicStore = TopicStoreState & TopicStoreActions;

export interface TopicStoreInitialData {
  topic?: ResearchTopic | null;
  progress?: ResearchProgress | null;
}

export function createTopicStore(
  topicId: string,
  initialData?: TopicStoreInitialData,
) {
  const hasInitialData = initialData?.topic != null;

  return createStore<TopicStore>()((set) => ({
    topicId,
    topic: initialData?.topic ?? null,
    progress: initialData?.progress ?? null,
    isLoading: !hasInitialData,
    error: null,
    debugEvents: [],
    activeStreamName: null,

    setTopic: (topic) => set({ topic }),
    setProgress: (progress) => set({ progress }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
    pushDebugEvents: (events, streamName) =>
      set((state) => ({
        debugEvents: [...state.debugEvents, ...events],
        activeStreamName: streamName,
      })),
    clearDebugEvents: () => set({ debugEvents: [], activeStreamName: null }),
  }));
}
