"use client";

/**
 * <FastPathMandateGuard> — the Server-Component door to
 * `verifyFastPathAgainstMandate`. A server page that paints or launches a
 * hard-coded agent (an SSR seed-mirror fallback) mounts this beside it; the
 * browser re-asks the Mandate and screams to admins on a mismatch. Renders
 * nothing and changes nothing the user sees.
 */

import { useEffect } from "react";
import type { AnyMandateKey } from "./mandate-key";
import { verifyFastPathAgainstMandate } from "./fast-path-guard";

export function FastPathMandateGuard({
  mandateKey,
  hardcodedAgentId,
  surface,
}: {
  mandateKey: AnyMandateKey;
  hardcodedAgentId: string;
  surface: string;
}) {
  useEffect(() => {
    void verifyFastPathAgainstMandate({ mandateKey, hardcodedAgentId, surface });
  }, [mandateKey, hardcodedAgentId, surface]);
  return null;
}
