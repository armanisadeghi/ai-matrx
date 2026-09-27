// features/agents/components/ambient-assistant/ambientAssistantSuppression.ts
//
// A page that OWNS the screen and the microphone for a while (a timed FastFire
// drill, a live recording) can hold the ambient assistant away: while any
// holder is active the scroll launcher neither reveals nor stays mounted, so
// it never covers the activity and never starts the chat-voice session (whose
// mount prepares a realtime voice token).
//
// Page-pass 2026-09-27: the FastFire Start button sits at the bottom of the
// setup, so pointing at it for 600ms tripped the launcher's "bottom intent"
// reveal — the chat composer came up and a chat-voice token was minted as the
// drill started.

import { useEffect, useId, useSyncExternalStore } from "react";

const holders = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isSuppressed = (): boolean => holders.size > 0;

/** True while some page holds the ambient assistant away. */
export function useAmbientAssistantSuppressed(): boolean {
  return useSyncExternalStore(subscribe, isSuppressed, () => false);
}

/** Hold the ambient assistant away while `active` is true (and mounted). */
export function useSuppressAmbientAssistant(active: boolean): void {
  const id = useId();
  useEffect(() => {
    if (!active) return undefined;
    holders.add(id);
    emit();
    return () => {
      holders.delete(id);
      emit();
    };
  }, [active, id]);
}
