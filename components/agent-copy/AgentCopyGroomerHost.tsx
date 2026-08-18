"use client";

import nextDynamic from "next/dynamic";

import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";

const AgentCopyGroomerWindow = nextDynamic(
  () =>
    import("@/components/agent-copy/AgentCopyGroomerWindow").then(
      (module) => module.AgentCopyGroomerWindow,
    ),
  { ssr: false, loading: () => null },
);

export interface AgentCopyGroomerHostProps {
  open: boolean;
  config: AgentCopyGroomerConfig | null;
  onClose: () => void;
}

/** The single lazy front door shared by every way of opening the Groomer. */
export function AgentCopyGroomerHost({
  open,
  config,
  onClose,
}: AgentCopyGroomerHostProps) {
  return open && config ? (
    <AgentCopyGroomerWindow config={config} onClose={onClose} />
  ) : null;
}
