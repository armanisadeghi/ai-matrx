"use client";

import { useMandate, type MandateState } from "./useMandate";
import type { AmbientAssistantMandateChain } from "@/features/agents/components/ambient-assistant/ambientAssistantMandates";
import type { MandateKey } from "@ai-matrx/agents/mandates";

export interface ResolvedMandateChainState extends MandateState {
  /** Typed, never `string` (V-L6a) — this is the rung that actually answered. */
  mandateKey: MandateKey;
}

/** Resolve page -> module -> system, treating unbound overrides as optional. */
export function useMandateChain(
  chain: AmbientAssistantMandateChain,
): ResolvedMandateChainState {
  const system = useMandate(chain.system);
  const moduleOverride = useMandate(chain.module ?? chain.system, {
    optional: true,
  });
  const pageOverride = useMandate(chain.page ?? chain.module ?? chain.system, {
    optional: true,
  });

  const resolved =
    chain.page && pageOverride.mandate
      ? { ...pageOverride, mandateKey: chain.page }
      : chain.module && moduleOverride.mandate
        ? { ...moduleOverride, mandateKey: chain.module }
        : { ...system, mandateKey: chain.system };

  return {
    ...resolved,
    loading: system.loading || moduleOverride.loading || pageOverride.loading,
  };
}
