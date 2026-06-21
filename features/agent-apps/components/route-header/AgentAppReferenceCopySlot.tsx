"use client";

import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

/** Client slot for `AgentAppHeader` — copies an `agent_app` RecordRef fence. */
export function AgentAppReferenceCopySlot({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  return (
    <ReferenceCopyButton
      referenceType="agent_app"
      id={appId}
      label={appName}
      toastLabel={appName}
      size="sm"
    />
  );
}
