// features/agents/agent-sets/components/AgentSetCard.tsx
//
// A list tile for one Agent Set on /agents/sets. The orchestrator agent is the
// set's face: its name + description (or the set tagline) head the card, with an
// accent-tinted header, a member-count strip, and an "Open in builder" action.
//
// THE DOOR LAW (common-docs/policies/no-dead-ends.md): the tile used to be a
// `role="button"` div calling `router.push` — a plain left click was the ONLY
// way in (no cmd-click, no middle-click, no "open in new tab", and a tab stop
// that announced no destination). Every way into the set is now a real anchor:
// the set's NAME, the member COUNT, "Open" and "Run", plus a mouse-only
// full-tile overlay link so clicking empty card area still opens the set. The
// overlay is `tabIndex={-1}` + `aria-hidden` — it is the same destination as
// the name, so it must not become a second tab stop or a second announcement.
// Keyboard users tab straight onto the real links; there is no synthetic key
// handler and no anchor nested inside a button.

"use client";

import Link from "next/link";
import { Webhook, Network, ArrowRight, Play, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { accentClasses } from "./accents";
import type { AgentSetSummary } from "../types";

export function AgentSetCard({ summary }: { summary: AgentSetSummary }) {
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

  return (
    <Card
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden border-border transition-all",
        "hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2",
        a.ring,
      )}
    >
      {/* Mouse-only whole-tile door — the click target the old `onClick` gave,
          as a real link. Hidden from keyboard + AT because the name anchor
          below already offers this exact destination. */}
      <Link
        href={setHref}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 z-10"
      />

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
          title={`${count} member${count === 1 ? "" : "s"} — open the set to see them`}
          className={cn(
            "absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium backdrop-blur transition-colors hover:bg-background",
            a.text,
          )}
        >
          <Users className="h-3 w-3" />
          {count}
        </Link>
      </div>

      <div className="group/entity-ref flex flex-1 flex-col gap-2 p-4">
        {/* z-20 keeps the name + its peek/new-tab controls above the overlay. */}
        <h3
          className="relative z-20 self-start max-w-full text-sm font-semibold text-foreground"
          title={title}
        >
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
          <div className="relative z-20 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Link
              href={runHref}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted",
                a.text,
              )}
              title="Run this orchestrator — it delegates to its members"
            >
              <Play className="h-3.5 w-3.5" /> Run
            </Link>
            {/* "Open" looked like an action and was decoration — it is a real
                door now, so it can be cmd-clicked like any link. */}
            <Link
              href={setHref}
              title={`Open ${title}`}
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted",
                a.text,
              )}
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
