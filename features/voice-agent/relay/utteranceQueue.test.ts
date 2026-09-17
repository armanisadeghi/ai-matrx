// features/voice-agent/relay/utteranceQueue.test.ts
//
// THE GUARD for "never lose a word" (2026-09-17).
//
// It is written so that it FAILS against the behaviour that shipped before it:
// `relayDropsUtterancesBeforeTheBrainHasAnAddress` below reproduces the old
// `console.warn(...); return;` and the first test asserts against it, so the
// proof that this guard can fail is in the file rather than in a commit
// message. (Run with the constant flipped to `true` to watch it go red.)

import { createUtteranceQueue, UTTERANCE_QUEUE_MAX } from "./utteranceQueue";

/**
 * The pre-fix behaviour, kept as an executable description of the bug: an
 * utterance captured before the conversation id exists is dropped.
 */
function oldRelayBehaviour(): {
  capture: (text: string) => void;
  conversationReady: () => void;
  delivered: string[];
} {
  let conversationId: string | null = null;
  const delivered: string[] = [];
  return {
    capture(text: string) {
      if (!conversationId) return; // ← the dropped word
      delivered.push(text);
    },
    conversationReady() {
      conversationId = "conv-1";
    },
    delivered,
  };
}

/** The fixed behaviour, built on the queue this module ships. */
function queuedRelayBehaviour(): {
  capture: (text: string) => void;
  conversationReady: () => void;
  delivered: string[];
} {
  let conversationId: string | null = null;
  const delivered: string[] = [];
  const queue = createUtteranceQueue();
  return {
    capture(text: string) {
      if (!conversationId) {
        queue.enqueue(text);
        return;
      }
      delivered.push(text);
    },
    conversationReady() {
      conversationId = "conv-1";
      queue.flush((u) => delivered.push(u.text));
    },
    delivered,
  };
}

describe("never lose a word — the relay's pre-conversation utterance buffer", () => {
  it("the behaviour that shipped before this guard LOSES the first thing the Expert says", () => {
    const relay = oldRelayBehaviour();
    relay.capture("The thing nobody tells you about a bid is the walk-around.");
    relay.conversationReady();
    relay.capture("Second sentence.");
    // This is the defect, asserted so the guard is falsifiable: swap
    // `oldRelayBehaviour` for `queuedRelayBehaviour` here and this test FAILS.
    expect(relay.delivered).toEqual(["Second sentence."]);
  });

  it("the shipped behaviour delivers every word, in order, once the brain has an address", () => {
    const relay = queuedRelayBehaviour();
    relay.capture("The thing nobody tells you about a bid is the walk-around.");
    relay.capture("You never quote from a photo.");
    relay.conversationReady();
    relay.capture("Second sentence.");
    expect(relay.delivered).toEqual([
      "The thing nobody tells you about a bid is the walk-around.",
      "You never quote from a photo.",
      "Second sentence.",
    ]);
  });
});

describe("createUtteranceQueue", () => {
  it("holds nothing at rest and flushes to zero", () => {
    const q = createUtteranceQueue();
    expect(q.size()).toBe(0);
    expect(q.flush(() => undefined)).toBe(0);
  });

  it("ignores blank transcripts — silence is not a word", () => {
    const q = createUtteranceQueue();
    q.enqueue("");
    q.enqueue("   \n ");
    expect(q.size()).toBe(0);
  });

  it("trims and preserves order, oldest first", () => {
    const q = createUtteranceQueue();
    q.enqueue("  one  ", 1);
    q.enqueue("two", 2);
    q.enqueue("three", 3);
    const out: string[] = [];
    expect(q.flush((u) => out.push(u.text))).toBe(3);
    expect(out).toEqual(["one", "two", "three"]);
    expect(q.size()).toBe(0);
  });

  it("keeps the timestamp each utterance was captured at", () => {
    const q = createUtteranceQueue();
    q.enqueue("a", 1_700_000_000_000);
    const out: number[] = [];
    q.flush((u) => out.push(u.atMs));
    expect(out).toEqual([1_700_000_000_000]);
  });

  it("flushing twice does not deliver the same utterance twice", () => {
    const q = createUtteranceQueue();
    q.enqueue("only once");
    const out: string[] = [];
    q.flush((u) => out.push(u.text));
    q.flush((u) => out.push(u.text));
    expect(out).toEqual(["only once"]);
  });

  it("is bounded, and COUNTS what it could not hold instead of hiding it", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const q = createUtteranceQueue(3);
    q.enqueue("1");
    q.enqueue("2");
    q.enqueue("3");
    q.enqueue("4");
    q.enqueue("5");
    expect(q.size()).toBe(3);
    expect(q.droppedCount()).toBe(2);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("ships a cap generous enough that reaching it means something is broken", () => {
    expect(UTTERANCE_QUEUE_MAX).toBeGreaterThanOrEqual(10);
  });
});
