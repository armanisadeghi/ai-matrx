"use client";

import { Badge } from "@ai-matrx/design-system/controls";
import { useAgentProofStatus } from "../proof-status";

/** "Unproven" / "Proven" / "Failed proof" on an agent saved unproven; nothing otherwise. */
export function AgentProofBadge({ agentId, className }: { agentId: string; className?: string }) {
  const status = useAgentProofStatus(agentId);
  if (status === "unproven") return <Badge tone="warning" className={className}>Unproven</Badge>;
  if (status === "proven") return <Badge tone="success" className={className}>Proven</Badge>;
  if (status === "failed_proof") return <Badge tone="destructive" className={className}>Failed proof</Badge>;
  return null;
}
