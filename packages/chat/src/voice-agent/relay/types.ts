// features/voice-agent/relay/types.ts
//
// The Voice Communication Layer's relay types (working label: "the
// Communicator"). Cross-repo system-of-record:
// common-docs/systems/agents/voice/STATE.md
//
// THE ROUTING LAW in one sentence: the realtime voice model is the MOUTH,
// never the brain — the user's utterances route to a primary text agent, and
// the voice model speaks only on an explicit cue carrying that agent's
// response.

import type { XaiServerEvent } from "../transport/serverEvents";

/**
 * The narrow seam `useXaiVoiceSession` hands the relay: raw send + event
 * subscription + response cancel. Deliberately NOT the whole XaiClient — the
 * relay must never own connection lifecycle.
 */
export interface RelaySessionHandle {
  sendRaw(payload: string): void;
  cancelResponse(): void;
  onEvent(cb: (event: XaiServerEvent) => void): () => void;
}

/**
 * Opt-in relay binding on `useXaiVoiceSession`. When present, the session is
 * opened with `turn_detection.create_response: false` (the voice model never
 * auto-answers the user) and the binding is attached for the session's
 * lifetime; its cleanup runs on stop.
 */
export interface VoiceRelayBinding {
  attach(handle: RelaySessionHandle): () => void;
}

export type LedgerQuestionStatus = "pending" | "asked" | "answered";

export interface LedgerQuestion {
  id: string;
  text: string;
  status: LedgerQuestionStatus;
}

/**
 * Question pacing (Arman's ruling 3, 2026-08-17): configuration, never dogma.
 * The surface sets the default; the user sees and controls it; the
 * Communicator's cue names the active mode.
 */
export type QuestionPacing = "one_at_a_time" | "grouped";

/** Options for a delivery cue (the primary agent's answer → speech). */
export interface DeliveryCueOptions {
  /** Named speaking role in multi-agent surfaces ("Adversary", "Scout"). */
  speakerRole?: string;
  /** Serialized open-question ledger injected with every delivery. */
  ledgerSummary?: string;
  /** Active pacing mode, named in the cue. Defaults to one_at_a_time. */
  pacing?: QuestionPacing;
}
