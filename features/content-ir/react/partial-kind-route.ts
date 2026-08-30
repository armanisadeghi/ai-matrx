/**
 * The Matrix binding of the PROVISIONAL (streaming partial kinds) route.
 *
 * Contract: `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md`.
 * The reader/validator half is `@ai-matrx/content-ir` (`wire/partial-kind`);
 * the ROUTE half — withhold-by-default, the per-kind opt-in, the
 * anti-stuck-skeleton backstop, the terminal rules — is
 * `@ai-matrx/content-ir-react` (`route/partial-kind-route.ts`), and since
 * 0.8.0 the per-host partial application is `createKindRouteBinding`. Read
 * the semantics there; this module only injects our registries.
 *
 * The wire gate runs in the execution system's `process-stream.ts`.
 */

import { createKindRouteBinding } from "@ai-matrx/content-ir-react";
import {
  MATRX_OWNED_BLOCK_TYPES,
  matrxKindRouteEnv,
} from "../host/route-env";

export {
  IR_PROVISIONAL_KEY,
  envelopeFromPartialKind,
  isProvisionalBlock,
  markKindPartialUnsafe,
  resetPartialUnsafeKinds,
  resolveAnnouncedKindLoading,
  type ProvisionalKindRender,
} from "@ai-matrx/content-ir-react";

const binding = createKindRouteBinding(matrxKindRouteEnv, {
  ownedTypes: MATRX_OWNED_BLOCK_TYPES,
});

/** Has this kind opted in to being handed a provisional value? */
export const isPartialReadyKind = binding.isPartialReadyKind;

/**
 * Resolve a block's provisional render, or null when there is nothing to show
 * provisionally (no event, a terminal event, a withheld kind, a kind nothing
 * can route, or a verified envelope that already won).
 */
export const resolveProvisionalKindRender =
  binding.resolveProvisionalKindRender;
