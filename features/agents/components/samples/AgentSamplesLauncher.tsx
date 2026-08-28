"use client";

/**
 * AgentSamplesLauncher — ONE small floating icon that opens the agent's test
 * cases (agent.exemplar) in a WindowPanel. Builder-only by Arman's ruling
 * (2026-08-26): the earlier full-width chip strip sat on top of the run
 * surfaces and was ripped out — samples must never add page chrome. Picking a
 * sample ("Use") prefills the test instance's variables + user input through
 * the SAME slices the human's own typing uses; the sample's user_input IS
 * human-typed text (raw-values invariant), so this is not a USER-INPUT-LAW
 * violation.
 */

import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOpenAgentTestCasesWindow } from "@/features/overlays/openers/agentTestCasesWindow";

export interface AgentSamplesLauncherProps {
  agentId: string;
  /** The live test instance a chosen sample prefills. */
  conversationId: string;
  /** Layout classes from the host. */
  className?: string;
}

export function AgentSamplesLauncher({
  agentId,
  conversationId,
  className,
}: AgentSamplesLauncherProps) {
  const openTestCases = useOpenAgentTestCasesWindow();

  return (
    <div className={cn("flex justify-end", className)}>
      <Button
        size="icon"
        variant="ghost"
        className="h-11 w-11 rounded-full border border-glass-edge bg-glass text-muted-foreground shadow-glass backdrop-blur-glass backdrop-saturate-glass hover:bg-glass-hover hover:text-foreground md:h-8 md:w-8"
        title="Test cases"
        aria-label="Open test cases"
        onClick={() => openTestCases({ agentId, conversationId })}
      >
        <FlaskConical className="h-4 w-4" />
      </Button>
    </div>
  );
}
