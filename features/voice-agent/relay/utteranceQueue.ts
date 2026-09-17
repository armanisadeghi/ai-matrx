// features/voice-agent/relay/utteranceQueue.ts
//
// 🚨 NEVER LOSE A WORD.
//
// Until 2026-09-17 `useVoiceRelaySession.onUserUtterance` did this when the
// primary conversation had not been minted yet:
//
//     console.warn("[voice-relay] utterance captured before the primary
//                   conversation was ready — dropped (the brain has no
//                   address yet).");
//     return;
//
// A dropped utterance is the single worst thing this product can do: the
// Expert SAID it, the microphone HEARD it, the transcript EXISTS — and the
// platform threw it away with a console warning nobody reads. It is the exact
// class the audio pipeline already protects against at the PCM layer
// ("Buffer PCM captured before `session.updated` — never drop it", FEATURE.md)
// and it was unprotected one layer up, where the words are.
//
// The window is small on a desktop surface that mounted its conversation
// before the mic button existed — and wide open on a hands-free surface where
// the human taps ONE control and starts talking immediately (the drive lane).
//
// This module is the pure core: a bounded FIFO with an honest overflow. It
// keeps no React state and no timers, so it is testable without a store.

/** One captured utterance waiting for the brain to have an address. */
export interface QueuedUtterance {
  text: string;
  /** Wall clock when the transcript completed, for ordering and honesty. */
  atMs: number;
}

export interface UtteranceQueue {
  /** Hold an utterance. Empty/blank text is ignored (never queued). */
  enqueue(text: string, atMs?: number): void;
  /**
   * Hand every held utterance to `deliver`, oldest first, and empty the queue.
   * Returns how many were delivered.
   */
  flush(deliver: (utterance: QueuedUtterance) => void): number;
  size(): number;
  /** Utterances this queue had to discard because it was full. Never hidden. */
  droppedCount(): number;
  clear(): void;
}

/**
 * Cap so a permanently-broken surface cannot grow memory without bound. Twenty
 * complete spoken turns is far beyond any real "conversation is still minting"
 * window; reaching it means something is actually broken, and the count is
 * exposed so the surface can SAY so rather than silently forgetting.
 */
export const UTTERANCE_QUEUE_MAX = 20;

export function createUtteranceQueue(
  max: number = UTTERANCE_QUEUE_MAX,
): UtteranceQueue {
  const held: QueuedUtterance[] = [];
  let dropped = 0;

  return {
    enqueue(text, atMs = Date.now()) {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      if (held.length >= max) {
        // Oldest-first eviction would lose the start of the story; newest-first
        // would lose what she just said. We keep the OLDEST (the answer that
        // was actually asked for) and count what we could not keep, loudly.
        dropped += 1;
        console.error(
          "[voice-relay] the utterance buffer is full — an utterance could " +
            "not be held. The surface must tell the speaker that the " +
            "conversation is not reaching the interviewer.",
          { max, droppedSoFar: dropped },
        );
        return;
      }
      held.push({ text: trimmed, atMs });
    },
    flush(deliver) {
      if (held.length === 0) return 0;
      const batch = held.splice(0, held.length);
      for (const utterance of batch) deliver(utterance);
      return batch.length;
    },
    size() {
      return held.length;
    },
    droppedCount() {
      return dropped;
    },
    clear() {
      held.length = 0;
    },
  };
}
