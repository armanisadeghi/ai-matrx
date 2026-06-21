"use client";

import { AgentAppReferenceCopySlot } from "./AgentAppReferenceCopySlot";

/** Right-cluster actions for agent-app route headers (reference copy, etc.). */
export function AgentAppHeaderActions({
  appId,
  appName,
}: {
  appId: string;
  appName: string;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <AgentAppReferenceCopySlot appId={appId} appName={appName} />
    </div>
  );
}
