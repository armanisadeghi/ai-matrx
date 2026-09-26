"use client";

/**
 * "Review answers" — the entry to the decision review queue, shown only for an
 * agent whose messages ask decision questions. Used on the agent's page, its
 * run page and the battle Decisions panel.
 */

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentMessages } from "@/features/agents/redux/agent-definition/selectors";
import { agentAsksDecisions } from "../queue";
import { reviewAnswersHref } from "../service";

export function ReviewAnswersLink({
  agentId,
  force = false,
  className,
}: {
  agentId: string;
  /** Skip the definition check — the caller already knows answers exist. */
  force?: boolean;
  className?: string;
}) {
  const messages = useAppSelector((state) => selectAgentMessages(state, agentId));
  if (!force && !agentAsksDecisions(messages)) return null;
  return (
    <Button asChild size="sm" variant="outline" className={className ?? "h-7 gap-1.5 text-xs"}>
      <Link href={reviewAnswersHref(agentId)}>
        <ListChecks className="h-3.5 w-3.5" />
        Review answers
      </Link>
    </Button>
  );
}
