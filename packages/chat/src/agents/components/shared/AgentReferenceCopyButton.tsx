"use client";

import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";

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
