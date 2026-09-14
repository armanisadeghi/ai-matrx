"use client";

import { useEffect, useRef, useState } from "react";
import type { Resource } from "@/features/agents/resources/types";

export type PreparedResourceIdentity = { userId: string; organizationId: string };
export function isPreparedResourceIdentity(value: unknown): value is PreparedResourceIdentity {
  return Boolean(value && typeof value === "object" &&
    "userId" in value && typeof value.userId === "string" && value.userId &&
    "organizationId" in value && typeof value.organizationId === "string" && value.organizationId);
}

function isTextResource(value: unknown): value is Extract<Resource, { type: "text" }> {
  if (!value || typeof value !== "object" || !("type" in value) || value.type !== "text" || !("data" in value)) return false;
  const data = value.data;
  return Boolean(data && typeof data === "object" &&
    "id" in data && typeof data.id === "string" && data.id &&
    "label" in data && typeof data.label === "string" &&
    "text" in data && typeof data.text === "string");
}

/** Seed once, after the resource entry exists, without crossing a capture identity. */
export function usePreparedResourceSeed({ conversationId, ready, resources, expectedIdentity, currentIdentity, attach, reportError }: {
  conversationId: string | null;
  ready: boolean;
  resources: Resource[] | null | undefined;
  expectedIdentity: PreparedResourceIdentity | null | undefined;
  currentIdentity: { userId: string | null | undefined; organizationId: string | null | undefined };
  attach(resource: Resource): Promise<boolean>;
  reportError(message: string): void;
}) {
  const consumed = useRef(new Set<string>());
  const [attachedConversationId, setAttachedConversationId] = useState<string | null>(null);
  useEffect(() => {
    if (!conversationId || !resources?.length || consumed.current.has(conversationId)) return;
    if (!isPreparedResourceIdentity(expectedIdentity) || expectedIdentity.userId !== currentIdentity.userId || expectedIdentity.organizationId !== currentIdentity.organizationId) {
      consumed.current.add(conversationId);
      reportError("Prepared content was discarded because its account or organization no longer matches. Reopen Alchemy in the current workspace.");
      return;
    }
    if (!ready) return;
    consumed.current.add(conversationId);
    if (!resources.every(isTextResource)) {
      reportError("Prepared content could not be attached. Reopen Alchemy and capture it again.");
      return;
    }
    void Promise.all(resources.map((resource) => attach(resource))).then(
      (results) => {
        if (results.every(Boolean)) setAttachedConversationId(conversationId);
        else reportError("Prepared content could not be attached. Reopen Alchemy and try again.");
      },
      () => reportError("Prepared content could not be attached. Reopen Alchemy and try again."),
    );
  }, [conversationId, ready, resources, expectedIdentity, currentIdentity.userId, currentIdentity.organizationId, attach, reportError]);
  return attachedConversationId === conversationId && isPreparedResourceIdentity(expectedIdentity) && expectedIdentity.userId === currentIdentity.userId && expectedIdentity.organizationId === currentIdentity.organizationId;
}
