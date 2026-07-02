// features/agents/agent-sets/components/AgentPeekButton.tsx
//
// A self-contained "quick look" control that reuses the canonical
// AgentSneakPeekModal (the same peek used on agent cards + the agent dropdown).
// Owns its own open state so it drops into any surface — library rail row,
// member card — with zero prop threading.

"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentSneakPeekModal } from "@/features/agents/components/agent-listings/AgentSneakPeekModal";

export function AgentPeekButton({
  agentId,
  navigationIds,
  className,
}: {
  agentId: string;
  /** Optional ordered ids for ←/→ prev-next inside the peek modal. */
  navigationIds?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Quick look"
        title="Quick look"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Lightbulb className="h-3.5 w-3.5" />
      </button>
      <AgentSneakPeekModal
        agentId={agentId}
        isOpen={open}
        onClose={() => setOpen(false)}
        navigationIds={navigationIds}
      />
    </>
  );
}
