"use client";

import { useEffect, useRef } from "react";
import { useWarmOnMount, useWarmup } from "@ai-matrx/agents/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

/**
 * Warm-up for a chat page that runs under a mandate (`/chat/new`, an
 * agent-less conversation): the mandate on landing, and again with reason
 * `org_change` when the active organization changes — a verdict is per
 * organization. Renders nothing. A server without the `mandate` warmer yet
 * lists it under "unknown", which the primitive ignores.
 */
export function ChatMandateWarmup({
  mandateKey,
  agentId,
}: {
  mandateKey: string;
  agentId?: string | null;
}) {
  useWarmOnMount(
    [
      { key: "mandate", id: mandateKey },
      { key: "agent", id: agentId ?? undefined },
    ],
    "route",
  );

  const warmup = useWarmup();
  const organizationId = useAppSelector(selectOrganizationId);
  const warmedOrg = useRef<string | null>(organizationId);
  useEffect(() => {
    if (!warmup || !organizationId || organizationId === warmedOrg.current)
      return;
    warmedOrg.current = organizationId;
    warmup.warm([{ key: "mandate", id: mandateKey }], "org_change");
  }, [warmup, organizationId, mandateKey]);

  return null;
}
