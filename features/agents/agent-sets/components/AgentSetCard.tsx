// features/agents/agent-sets/components/AgentSetCard.tsx
//
// A list tile for one Agent Set on /agents/sets. The orchestrator agent is the
// set's face: its name + description (or the set tagline) head the card, with an
// accent-tinted header, a member-count strip, and an "Open in builder" action.

"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Webhook, Network, ArrowRight, Loader2, Play, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
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

  const setHref = `/agents/sets/${summary.orchestratorId}`;
  const runHref = `/agents/${summary.orchestratorId}/run`;

  const open = () => startNavigation(() => router.push(setHref));

  // THE DOOR LAW: the card was `role="button"` + `router.push` — clicking
  // worked and nothing else did (no cmd-click, no middle-click, no "open in
  // new tab", and a tab stop that announced no destination). The doors now
  // live on the real anchors inside it: the set's name, its member count, and
  // Run. The card keeps its whole-tile click as a convenience on top.
  return (
    <Card
      onClick={open}
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
        {/* A count is a door: the members it counts are named on the builder. */}
        <Link
          href={setHref}
          onClick={(e) => e.stopPropagation()}
          title={`${count} member${count === 1 ? "" : "s"} — open the set to see them`}
          className={cn(
            "absolute right-3 top-3 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background",
            a.text,
          )}
        >
          <Users className="h-3 w-3" />
          {count}
        </Link>
      </div>

      <div className="group/entity-ref flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-sm font-semibold text-foreground" title={title}>
          <EntityRef
            token="agent"
            id={summary.orchestratorId}
            name={title}
            href={setHref}
            showIcon={false}
          />
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
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Link
              href={runHref}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted",
                a.text,
              )}
              title="Run this orchestrator — it delegates to its members"
            >
              <Play className="h-3.5 w-3.5" /> Run
            </Link>
            {/* "Open" looked like an action and was decoration — it is the
                real door now, so it can be cmd-clicked like any link. */}
            <Link
              href={setHref}
              onClick={(e) => e.stopPropagation()}
              title={`Open ${title}`}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted",
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
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
