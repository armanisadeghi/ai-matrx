/**
 * THE GUEST AI ALLOWANCE — the ONE client seam for the server's refusal.
 *
 * Product rule (owner, 2026-10-02): every feature is free forever for guests.
 * Only AI actions are counted, and ONLY the server counts them. Past the
 * allowance aidream answers
 *
 *   HTTP 403 {"error":"guest_ai_allowance_used","message":"…","allowance":3,"used":3}
 *
 * and, on a stream, the same code as the error event's `error_type`. The client
 * never counts, never blocks a click, never redirects: it shows ONE friendly
 * reminder (the `guestAiAllowance` overlay) and everything non-AI keeps working.
 *
 * WHERE IT HOOKS. Every request and stream failure in this app funnels through
 * the Error Inspector's single sink, `captureError` (lib/diagnostics/
 * errorCaptureStore.ts) — `callApi` and the package transports via
 * `captureApiError`, every NDJSON stream via `captureStreamEvent`, the python
 * client, the chat package through its diagnostics port. That sink calls
 * `noticeGuestAiAllowanceRefusal` on every capture, so every AI surface
 * inherits the reminder with zero per-feature code. The bridge
 * (`components/guest/GuestAiAllowanceBridge.tsx`) is the one listener; it opens
 * the overlay.
 *
 * This module imports nothing from the store, Redux or React, so the
 * diagnostics layer can call it without a cycle.
 */
export declare const GUEST_AI_ALLOWANCE_USED: "guest_ai_allowance_used";
export interface GuestAiAllowanceRefusal {
    /** The server's own sentence, when it sent one. */
    message: string | null;
    /** How many AI actions a guest gets, when the server said. */
    allowance: number | null;
    /** How many this guest has used, when the server said. */
    used: number | null;
}
/** The shape every capture site hands the sink — only what is read here. */
export interface RefusalCandidate {
    code?: string | undefined;
    relation?: string | undefined;
    userMessage?: string | undefined;
    raw?: unknown;
}
/** Read a refusal out of one captured failure, or `null` when it is not one. */
export declare function readGuestAiAllowanceRefusal(candidate: RefusalCandidate): GuestAiAllowanceRefusal | null;
type Listener = (refusal: GuestAiAllowanceRefusal) => void;
/** Subscribe the one bridge. Returns the unsubscribe. */
export declare function onGuestAiAllowanceUsed(listener: Listener): () => void;
/**
 * Called by the capture sink for EVERY captured failure. Returns true when the
 * failure was the allowance refusal (the sink then keeps it out of the durable
 * error record — it is an expected product answer, not a defect).
 */
export declare function noticeGuestAiAllowanceRefusal(candidate: RefusalCandidate): boolean;
export {};
