// features/voice-agent/relay/relay.test.ts
//
// Unit tests for the Voice Communication Layer's pure core: cue protocol,
// question ledger, and the relay controller's ROUTING LAW invariants
// (utterance routing, unsolicited-response watchdog, cue windows).
// The controller is React-free — tested with a fake session handle.

import {
  buildDeliveryCueText,
  buildNarrationCueText,
  DELIVERY_CUE_PREFIX,
  NARRATION_CUE_PREFIX,
} from "./relayProtocol";
import { createQuestionLedger } from "./questionLedger";
import {
  composeBrainMessage,
  createVoiceExchangeLog,
  formatVoiceExchange,
} from "./sideChannel";
import { createVoiceRelayController } from "./relayController";
import type { RelaySessionHandle } from "./types";
import type { XaiServerEvent } from "../transport/serverEvents";

// ── Cue protocol ────────────────────────────────────────────────────────────

describe("relayProtocol", () => {
  it("builds a delivery cue with response, role, and ledger", () => {
    const cue = buildDeliveryCueText("The answer is 42.", {
      speakerRole: "Adversary",
      ledgerSummary: "q1 (pending): What is your budget?",
    });
    expect(cue.startsWith(DELIVERY_CUE_PREFIX)).toBe(true);
    expect(cue).toContain("Speaking role: Adversary");
    expect(cue).toContain("The answer is 42.");
    expect(cue).toContain("q1 (pending): What is your budget?");
  });

  it("omits empty ledger and role sections", () => {
    const cue = buildDeliveryCueText("Hello.", { ledgerSummary: "" });
    expect(cue).not.toContain("open questions");
    expect(cue).not.toContain("Speaking role");
  });

  it("builds a narration cue", () => {
    const cue = buildNarrationCueText("Searching the knowledge base");
    expect(cue.startsWith(NARRATION_CUE_PREFIX)).toBe(true);
    expect(cue).toContain("Searching the knowledge base");
  });
});

describe("relayProtocol pacing", () => {
  it("names the active pacing mode in the delivery cue, defaulting to one_at_a_time", () => {
    expect(buildDeliveryCueText("Hi.")).toContain("Pacing mode: one_at_a_time");
    expect(buildDeliveryCueText("Hi.", { pacing: "grouped" })).toContain(
      "Pacing mode: grouped",
    );
  });
});

// ── Side channel (voice_exchange) ───────────────────────────────────────────

describe("sideChannel", () => {
  it("drains recorded turns into an XML block and clears", () => {
    const log = createVoiceExchangeLog();
    log.record("communicator", "So the key parts are A & B?");
    log.record("user", "yes <exactly>");
    const turns = log.drain();
    expect(log.size()).toBe(0);
    const block = formatVoiceExchange(turns);
    expect(block).toContain("<voice_exchange");
    expect(block).toContain("<communicator>So the key parts are A &amp; B?</communicator>");
    expect(block).toContain("<user>yes &lt;exactly&gt;</user>");
  });

  it("composeBrainMessage prepends the block only when turns exist", () => {
    expect(composeBrainMessage([], "just me")).toBe("just me");
    const withBlock = composeBrainMessage(
      [{ speaker: "communicator", text: "I asked about budget." }],
      "around 5k",
    );
    expect(withBlock.startsWith("<voice_exchange")).toBe(true);
    expect(withBlock.endsWith("around 5k")).toBe(true);
  });

  it("ignores empty turns and caps runaway text", () => {
    const log = createVoiceExchangeLog();
    log.record("user", "   ");
    expect(log.size()).toBe(0);
    log.record("communicator", "x".repeat(5_000));
    const [turn] = log.drain();
    expect(turn.text.length).toBeLessThanOrEqual(1_501);
  });
});

// ── Question ledger ─────────────────────────────────────────────────────────

describe("questionLedger", () => {
  it("adds, transitions, and serializes; answered questions leave the summary", () => {
    const ledger = createQuestionLedger();
    const q1 = ledger.add("What is your budget?");
    const q2 = ledger.add("What is your timeline?");
    expect(q1.id).toBe("q1");
    expect(q2.id).toBe("q2");

    ledger.setStatus(q1.id, "asked");
    expect(ledger.serialize()).toContain("q1 (asked)");
    expect(ledger.pending()).toHaveLength(2);

    ledger.setStatus(q1.id, "answered");
    expect(ledger.serialize()).not.toContain("q1");
    expect(ledger.pending()).toHaveLength(1);
  });

  it("is idempotent on identical question text (model retries)", () => {
    const ledger = createQuestionLedger();
    const a = ledger.add("Same question?");
    const b = ledger.add("Same question?");
    expect(a.id).toBe(b.id);
    expect(ledger.all()).toHaveLength(1);
  });

  it("returns null for an unknown id", () => {
    const ledger = createQuestionLedger();
    expect(ledger.setStatus("q9", "answered")).toBeNull();
  });
});

// ── Relay controller ────────────────────────────────────────────────────────

function makeHandle() {
  const sent: string[] = [];
  let cancels = 0;
  const listeners = new Set<(e: XaiServerEvent) => void>();
  const handle: RelaySessionHandle = {
    sendRaw: (p) => {
      sent.push(p);
    },
    cancelResponse: () => {
      cancels += 1;
    },
    onEvent: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const emit = (e: XaiServerEvent) => {
    for (const cb of listeners) cb(e);
  };
  return {
    handle,
    sent,
    emit,
    getCancels: () => cancels,
  };
}

const transcriptDone = (transcript: string): XaiServerEvent => ({
  type: "conversation.item.input_audio_transcription.completed",
  transcript,
});

const responseCreated: XaiServerEvent = {
  type: "response.created",
  response: { id: "r1" },
};

describe("relayController", () => {
  it("routes a completed user transcript to onUserUtterance and awaits the brain", () => {
    const utterances: string[] = [];
    const controller = createVoiceRelayController({
      onUserUtterance: (t) => utterances.push(t),
      log: () => {},
    });
    const { handle, emit } = makeHandle();
    controller.binding.attach(handle);

    emit(transcriptDone("  My budget is small.  "));
    expect(utterances).toEqual(["My budget is small."]);
    expect(controller.isAwaitingBrain()).toBe(true);

    // Empty transcript is ignored.
    emit(transcriptDone("   "));
    expect(utterances).toHaveLength(1);
  });

  it("cancels an unsolicited response ONLY while awaiting the brain, and screams", () => {
    let screamed = 0;
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      onUnsolicitedResponse: () => {
        screamed += 1;
      },
      log: () => {},
    });
    const { handle, emit, getCancels } = makeHandle();
    controller.binding.attach(handle);

    // Not awaiting — a tool-loop continuation response is allowed.
    emit(responseCreated);
    expect(getCancels()).toBe(0);

    // Awaiting the brain — an unsolicited response is the exact failure the
    // layer exists to prevent: cancel + scream.
    emit(transcriptDone("hello"));
    emit(responseCreated);
    expect(getCancels()).toBe(1);
    expect(screamed).toBe(1);
  });

  it("speakDelivery sends a cue item + response.create, and its response is expected", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      log: () => {},
    });
    const { handle, emit, sent, getCancels } = makeHandle();
    controller.binding.attach(handle);

    emit(transcriptDone("hi"));
    controller.speakDelivery("The answer.", { ledgerSummary: "q1 (pending): x" });

    expect(controller.isAwaitingBrain()).toBe(false);
    const parsed = sent.map((s) => JSON.parse(s) as { type: string });
    expect(parsed.map((p) => p.type)).toEqual([
      "conversation.item.create",
      "response.create",
    ]);
    // The response our cue provoked is OURS — never cancelled.
    emit(responseCreated);
    expect(getCancels()).toBe(0);
  });

  it("narration keeps awaiting the brain and does not trip the watchdog", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      log: () => {},
    });
    const { handle, emit, getCancels } = makeHandle();
    controller.binding.attach(handle);

    emit(transcriptDone("hi"));
    controller.speakNarration("Passing that along.");
    expect(controller.isAwaitingBrain()).toBe(true);
    emit(responseCreated); // the narration response — expected
    expect(getCancels()).toBe(0);
    emit(responseCreated); // a second, unrequested response while awaiting → cancel
    expect(getCancels()).toBe(1);
  });

  it("prunes cue items beyond the window with conversation.item.delete", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      windowItems: 2,
      log: () => {},
    });
    const { handle, sent } = makeHandle();
    controller.binding.attach(handle);

    controller.speakDelivery("one");
    controller.speakDelivery("two");
    controller.speakDelivery("three");

    const deletes = sent
      .map((s) => JSON.parse(s) as { type: string; item_id?: string })
      .filter((p) => p.type === "conversation.item.delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].item_id).toBe("relay_cue_1");
  });

  it("clearAwaitingBrain disarms the watchdog when a turn settles with no delivery", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      log: () => {},
    });
    const { handle, emit, getCancels } = makeHandle();
    controller.binding.attach(handle);

    emit(transcriptDone("hi"));
    expect(controller.isAwaitingBrain()).toBe(true);
    // The brain failed / answered empty — no delivery will come.
    controller.clearAwaitingBrain();
    expect(controller.isAwaitingBrain()).toBe(false);
    // A later legitimate response (e.g. tool continuation) is not cancelled.
    emit(responseCreated);
    expect(getCancels()).toBe(0);
  });

  it("records the Communicator's spoken transcript into the voice exchange", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      log: () => {},
    });
    const { handle, emit } = makeHandle();
    controller.binding.attach(handle);

    emit({
      type: "response.output_audio_transcript.done",
      transcript: "Great — so budget is the main concern. What's the timeline?",
    });
    controller.recordSideChannelUserTurn("wait, say that again");

    const turns = controller.drainVoiceExchange();
    expect(turns).toEqual([
      {
        speaker: "communicator",
        text: "Great — so budget is the main concern. What's the timeline?",
      },
      { speaker: "user", text: "wait, say that again" },
    ]);
    // Drain clears — the next brain turn starts a fresh exchange.
    expect(controller.drainVoiceExchange()).toEqual([]);
  });

  it("publishes the serialized exchange on every change, and empty on drain", () => {
    const blocks: string[] = [];
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      onExchangeUpdated: (b) => blocks.push(b),
      log: () => {},
    });
    const { handle, emit } = makeHandle();
    controller.binding.attach(handle);

    emit({
      type: "response.output_audio_transcript.done",
      transcript: "What's the timeline?",
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("<communicator>");

    controller.drainVoiceExchange();
    expect(blocks[blocks.length - 1]).toBe("");
  });

  it("drops cues after detach instead of throwing", () => {
    const controller = createVoiceRelayController({
      onUserUtterance: () => {},
      log: () => {},
    });
    const { handle, sent } = makeHandle();
    const cleanup = controller.binding.attach(handle);
    cleanup();
    controller.speakDelivery("late");
    expect(sent).toHaveLength(0);
  });
});
