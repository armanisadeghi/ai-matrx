// features/agents/agent-sets/components/AgentSetCard.tsx
//
// A list tile for one Agent Set on /agents/sets. The orchestrator agent is the
// set's face: its name + description (or the set tagline) head the card, with an
// accent-tinted header, a member-count strip, and an "Open in builder" action.

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Webhook, Network, ArrowRight, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { accentClasses } from "./accents";
import type { AgentSetSummary } from "../types";

export function AgentSetCard({ summary }: { summary: AgentSetSummary }) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const a = accentClasses(summary.config.accent);

  const title = summary.label?.trim() || summary.name || "Untitled Set";
  const subtitle =
    summary.config.tagline?.trim() ||
    summary.description ||
    "An orchestrated set of agents.";
  const count = summary.memberCount;
  const strip = Math.min(count, 6);

  const open = () =>
    startNavigation(() => router.push(`/agents/sets/${summary.orchestratorId}`));

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden border-border transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2",
        a.ring,
        isNavigating && "pointer-events-none opacity-70",
      )}
    >
      {/* accent header */}
      <div className={cn("relative h-16 bg-gradient-to-br", a.gradient)}>
        <div className="absolute left-4 top-4 flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl shadow-sm",
              a.glyph,
            )}
          >
            <Network className="h-5 w-5" />
          </div>
        </div>
        <div
          className={cn(
            "absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium backdrop-blur",
            a.text,
          )}
        >
          <Users className="h-3 w-3" />
          {count}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground" title={title}>
          {title}
        </h3>
        <p className="line-clamp-2 flex-1 text-xs leading-snug text-muted-foreground">
          {subtitle}
        </p>

        {/* member strip */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center -space-x-1.5">
            {count === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">No members yet</span>
            ) : (
              <>
                {Array.from({ length: strip }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md border border-background shadow-sm",
                      a.soft,
                    )}
                  >
                    <Webhook className={cn("h-3 w-3", a.text)} />
                  </div>
                ))}
                {count > strip && (
                  <span className="pl-2.5 text-[11px] font-medium text-muted-foreground">
                    +{count - strip}
                  </span>
                )}
              </>
            )}
          </div>
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100",
              a.text,
            )}
          >
            {isNavigating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                Open <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        </div>
      </div>
    </Card>
  );
}
