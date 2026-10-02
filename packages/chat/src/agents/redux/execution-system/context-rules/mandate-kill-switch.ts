/**
 * The Mandate's context kill switch, for the context table and the send path.
 *
 * A mandate run's Holder may be closed to ambient context by its Mandate
 * (`contract.auto_context_disabled`), not only by its own agent definition.
 * The server applies both (RULES.md §2); the client must too, or the table
 * would show a value as sent that the server drops.
 *
 * Reads the mandate resolution the launch already cached — no extra request on
 * the hot path.
 */

import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { resolveMandate } from "../../../../mandates/service";

export async function resolveMandateKillSwitch(
  mandateKey: AnyMandateKey | null | undefined,
): Promise<boolean> {
  if (!mandateKey) return false;
  try {
    const mandate = await resolveMandate(mandateKey, { optional: true });
    return mandate?.contract.autoContextDisabled === true;
  } catch (error) {
    // The run itself resolves the mandate again and fails loudly there; the
    // table falls back to the agent's own switch, and the receipt check
    // reports any difference.
    console.warn(`[context-rules] could not read mandate "${mandateKey}" kill switch`, error);
    return false;
  }
}
