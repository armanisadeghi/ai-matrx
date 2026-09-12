/**
 * The `matrx-server-bus:<audience>` channel spec — IDENTITY ONLY.
 *
 * Every channel mechanic (ref-counted shared rooms, jittered reconnect with a
 * stability reset, the decoupled ordered handler queue, dedup, tab-sleep and
 * network awareness, diagnostics) belongs to `@ai-matrx/realtime`. There is no
 * `.channel(` in this file and there must never be one — a second copy beside
 * the package is the named failure.
 *
 * RAW WIRE, and the two named downgrades it costs (package README § 9):
 *  - Echo suppression cannot key on `cid`: aidream publishes over the Realtime
 *    HTTP broadcast endpoint, so nothing on this bus carries a Matrx envelope.
 *    This client never publishes here, so there is no echo to suppress;
 *    `isOwnMessage` is declared honestly as "never ours" rather than left off,
 *    which would silence the package's warning about a raw wire with no
 *    sender identity.
 *  - Dedup cannot key on `eid`: `eventKey` supplies one from `requestId`, so a
 *    redelivered directive is one directive, not two.
 */

import type { ChannelSpec } from "@ai-matrx/realtime";
import {
  DIRECTIVE_BROADCAST_EVENT,
  parseDirective,
  serverBusChannelName,
  type Directive,
} from "./directiveEnvelope";

export type DirectiveSink = (directive: Directive) => void;

/**
 * Build the spec for one server-bus room.
 *
 * @param audience    `<userId>` for this user's room, or `"platform"`
 * @param onDirective called once per well-formed directive
 */
export function serverBusChannelSpec(
  audience: string,
  onDirective: DirectiveSink,
): ChannelSpec {
  return {
    topic: serverBusChannelName(audience),
    // The publisher owns this wire: aidream posts the bare v2 envelope to the
    // Realtime HTTP broadcast endpoint. Wrapping it would put a shape on the
    // wire that the extension and desktop clients (same contract) do not read.
    wire: { mode: "raw", isOwnMessage: () => false },
    broadcast: [
      {
        event: DIRECTIVE_BROADCAST_EVENT,
        onMessage: ({ data }) => {
          const result = parseDirective(data);
          if (result.ok) {
            onDirective(result.directive);
            return;
          }
          if (result.reason === "not_a_directive") {
            // Other kinds legitimately share this bus (`wake`, `rpc`). Not a
            // fault, not our traffic, no noise.
            return;
          }
          // Everything else means a publisher drifted from the contract, and
          // the remedy is a contract change, not a retry.
          console.warn(
            `[directives] Dropped a payload on ${serverBusChannelName(audience)}: ` +
              `${result.reason} (${result.detail}). The publisher and ` +
              `lib/client-directives/directiveEnvelope.ts disagree; both sides plus ` +
              `common-docs/systems/platform/realtime/CLIENT-DIRECTIVES.md must ` +
              `change together.`,
            data,
          );
        },
      },
    ],
    eventKey: (_source, payload) => {
      const id = (payload as { requestId?: unknown } | null)?.requestId;
      return typeof id === "string" ? `directive:${id}` : undefined;
    },
    // Broadcast is ephemeral and EVERY directive is a hint, never a value: a
    // receiver always re-reads through its own normal path, and each of those
    // paths keeps its own TTL/poll as the correctness backstop. So there is
    // nothing to re-read here on reconnect that the missed directive would
    // not already have been re-read by. Declared honestly with the reason
    // rather than left off, which would silence the package's warning about a
    // channel with no backfill door.
    onBackfill: () => {
      // Intentionally nothing — see above.
    },
  };
}
