"use client";

import { ReferenceCopyButton } from "@ai-matrx/chat/host/ui-slots";

export function AgentReferenceCopyButton({
  agentId,
  agentName,
  size = "sm",
  className,
}: {
  agentId: string;
  agentName?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const toastLabel = agentName?.trim() || "Agent";
  return (
    <ReferenceCopyButton
      referenceType="agent"
      id={agentId}
      label={agentName}
      toastLabel={toastLabel}
      size={size}
      className={className}
    />
  );
}
