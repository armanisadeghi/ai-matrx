// features/agents/agent-sets/components/AgentPeekButton.tsx
//
// A self-contained "quick look" control. Opens the agent peek as a NON-BLOCKING
// draggable WindowPanel (AgentPeekWindow), never a blocking modal. The window is
// dynamic()-imported so WindowPanel stays out of the bundles of the eagerly-loaded
// surfaces that render this button (agent cards, the library rail).

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

const AgentPeekWindow = dynamic(() => import("./AgentPeekWindow"), { ssr: false });

export function AgentPeekButton({ agentId, className }: { agentId: string; className?: string }) {
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
      {open && <AgentPeekWindow agentId={agentId} onClose={() => setOpen(false)} />}
    </>
  );
}
