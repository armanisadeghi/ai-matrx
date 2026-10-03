/**
 * The Mandate's context kill switch, for the context table and the send path.
 *
 * A mandate run's Holder may be closed to ambient context by its Mandate
 * (`contract.auto_context_disabled`), not only by its own agent definition.
 * The server applies both (RULES.md §2); the client must too, or the table
 * would show a value as sent that the server drops.
 *
 * THE SEND IS NEVER HELD BY A RE-READ (2026-10-02 latency regression: each
 * 5-minute cache miss cost a full server round trip before the send's real
 * request). The last answer per mandate is returned at once and refreshed
 * beside the send. A mandate with no answer yet is waited for — guessing
 * `false` would send page values the server then withholds (R2-1). Every
 * resolution invalidation (an organization switch, a binding write) forgets
 * the answers, since a verdict is true for one person in one organization.
 */

import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { onMandateCacheInvalidated, resolveMandate } from "../../../../mandates/service";

const lastKnown = new Map<AnyMandateKey, boolean>();
let forgetsOnInvalidation = false;

function forgetOnInvalidation(): void {
  if (forgetsOnInvalidation) return;
  forgetsOnInvalidation = true;
  onMandateCacheInvalidated((mandateKey) => {
    if (mandateKey === undefined) lastKnown.clear();
    else lastKnown.delete(mandateKey);
  });
}

function refreshKillSwitch(mandateKey: AnyMandateKey): Promise<boolean> {
  return resolveMandate(mandateKey, { optional: true }).then(
    (mandate) => {
      const closed = mandate?.contract.autoContextDisabled === true;
      lastKnown.set(mandateKey, closed);
      return closed;
    },
    (error: unknown) => {
      // The run itself resolves the mandate again and fails loudly there; the
      // table falls back to the agent's own switch, and the receipt check
      // reports any difference.
      console.warn(`[context-rules] could not read mandate "${mandateKey}" kill switch`, error);
      return lastKnown.get(mandateKey) ?? false;
    },
  );
}

export async function resolveMandateKillSwitch(
  mandateKey: AnyMandateKey | null | undefined,
): Promise<boolean> {
  if (!mandateKey) return false;
  forgetOnInvalidation();
  const known = lastKnown.get(mandateKey);
  const fresh = refreshKillSwitch(mandateKey);
  return known ?? fresh;
}
