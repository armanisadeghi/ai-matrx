/**
 * Envelope helpers for hosts (accumulator / splitter / renderers):
 * reading `metadata.__ir` off render blocks, reconstructing the full source
 * object (schema values + residues merged back), and the Phase-2 shadow
 * parity check that proves the kind parser and JSON.parse agree byte-for-
 * byte on real traffic before any rendering flips.
 */

import { readEnvelope } from "@ai-matrx/content-ir";

// The PURE gate lives in core/envelope-read.ts (twin-safe — aidream's
// Workflow Studio consumes it with its own hooks). This module is the
// frontend HOST SHELL: it binds the memo seed + Error Inspector hooks and
// keeps the historical import path stable.
export { readEnvelope };

// The ingest guard for server-built envelopes lives in the chat package's content-ir host seam
// (`host/content-ir-slots`): it seeds the region-envelope memo through the slot this app registers
// (providers/chatContentIrRegistration.ts) and reports a malformed envelope through diagnostics.
export { sanitizeInboundEnvelopeMetadata } from "@ai-matrx/chat/host/content-ir-slots";

// reconstructRegionValue + stripKindDeep live in the pure kernel; the parity check lives in the
// chat package (it reads the same envelope the package's stream accumulator builds).
export { reconstructRegionValue, stripKindDeep } from "@ai-matrx/content-ir";
export { envelopeMatchesParsedSource } from "@ai-matrx/chat/utils/content-ir/envelope-parity";
