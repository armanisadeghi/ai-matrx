"use client";

// features/applets/route/useChangeByTalkingDisclosure.ts
//
// "Change it by talking" (Overview, Settings) hands the Applet to the builder's
// fixed job, `applets.build`. Disclosure only: the job is named in the top
// Agents menu; nothing is drawn on the page (agent-disclosure).

import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { APPLETS_SURFACE_NAME } from "@/features/surfaces/manifests/applets.manifest";

// Declared in aidream (client_mandates.py, applets.build); allowlisted in
// scripts/mandate-keys-allowlist.json until @ai-matrx/agents publishes it.
const BUILD = storedMandateKey("applets.build");

const DISCLOSURE = [
  { mandateKey: BUILD, does: "changes this Applet from what you tell it", surfaceName: APPLETS_SURFACE_NAME },
] as const;

export function useChangeByTalkingDisclosure(): void {
  useDeclaredSurfaceMandates(DISCLOSURE);
}
