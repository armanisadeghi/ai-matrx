"use client";

// WHICH AGENT IS THIS? (Arman, 2026-08-21): "When I'm clicking these buttons,
// I need to see which agent it's invoking, because I need to go look at that
// agent's instructions and figure out what's wrong."
//
// One tiny muted chip, dropped beside the title of every AI-backed surface.
// Hover names the Mandate key and today's bound agent, and it links to the
// Mandate admin where the binding (and the agent's instructions) are edited.
// The Mandate is the selector — no agent id is ever pinned in code — so the
// chip states the KEY as truth and the agent name as "today".

import Link from "next/link";
import { UserCog } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AgentCredit({
  mandate,
  agent,
}: {
  /** The mandate key this surface resolves through, e.g. "masterwork.scout". */
  mandate: string;
  /** The agent bound to it today (display only — the mandate is the truth). */
  agent?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/agents/mandates"
          className="inline-flex items-center gap-1 rounded px-1 text-[10px] text-muted-foreground/70 hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <UserCog className="h-3 w-3" />
          <span className="hidden sm:inline">{mandate}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Runs through the <span className="font-mono">{mandate}</span> mandate
          {agent ? (
            <>
              {" "}
              — today that&apos;s <span className="font-mono">{agent}</span>
            </>
          ) : null}
          . Click to open the mandate admin and edit its instructions.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
