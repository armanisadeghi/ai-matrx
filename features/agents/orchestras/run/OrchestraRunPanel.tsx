// features/agents/agent-sets/run/SetRunPanel.tsx
//
// The embedded run experience for the set builder — a right-side panel
// co-mounted with the canvas so the REAL canvas lights up live as each member
// executes (the whole point of the live-highlight feature). Embeds the
// canonical AgentRunnerPage under a builder-scoped surfaceKey; the run's
// conversation is observed via the conversation-focus registry with the same
// key (see SetBuilder), never by forking AgentRunnerPage.

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ExternalLink, Loader2, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { accentClasses } from "../components/accents";
import type { SetAccent } from "../constants";

// The full conversation runtime is heavy — keep it out of the builder chunk
// until the panel actually opens.
const AgentRunnerPage = dynamic(
  () =>
    import("@/features/agents/components/run/AgentRunnerPage").then(
      (m) => m.AgentRunnerPage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export interface SetRunPanelProps {
  orchestratorId: string;
  /** The builder's run surface key — MUST match what SetBuilder observes. */
  surfaceKey: string;
  accent: SetAccent;
  /** The active run conversation (from the focus registry), for the
   *  open-full-runner link so it lands on the same conversation. */
  conversationId: string | null;
  onClose: () => void;
}

export function SetRunPanel({
  orchestratorId,
  surfaceKey,
  accent,
  conversationId,
  onClose,
}: SetRunPanelProps) {
  const a = accentClasses(accent);
  const fullRunnerHref = conversationId
    ? `/agents/${orchestratorId}/run?conversationId=${conversationId}`
    : `/agents/${orchestratorId}/run`;

  return (
    <div className="flex h-full w-[24rem] shrink-0 flex-col border-l border-border bg-card xl:w-[28rem]">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border p-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shadow-sm", a.glyph)}>
          <Play className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">Run set</div>
          <div className="text-[11px] text-muted-foreground">
            Members light up on the canvas as they run
          </div>
        </div>
        <Button variant="ghost" size="icon" asChild>
          <Link
            href={fullRunnerHref}
            target="_blank"
            aria-label="Open full runner"
            title="Open full runner"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close run panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <AgentRunnerPage
          agentId={orchestratorId}
          surfaceKey={surfaceKey}
          sourceFeature="agent-runner"
          backHref="/agents/sets"
          basePath="/agents"
          retainOnUnmount
        />
      </div>
    </div>
  );
}
