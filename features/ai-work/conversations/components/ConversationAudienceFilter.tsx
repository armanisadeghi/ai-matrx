"use client";

// features/ai-work/conversations/components/ConversationAudienceFilter.tsx
//
// THE DOOR to the rows the default list does not show.
//
// ~4,613 of the conversations in this corpus are `conversation_type='subagent'`
// internal machine runs — batch derivations, sweeps, meta-builder calls. They
// are real records and must stay reachable, but showing them by default buries
// every conversation a person actually had.
//
// So the default is honest instead of silent: this control states which slice
// is on screen, states how many rows the other slice holds (a TRUE count, from
// the same facets query that feeds the column filters), and switches in one
// click. It writes the ordinary `conversation_type` filter — the same bag the
// column header and the Filters panel write — so nothing here is a private
// second filtering path that could disagree with them.

import { Cpu, Layers, User } from "lucide-react";
import { cn } from "@/utils/cn";
import { facetCount, type EntityFacets } from "@/lib/entity-list/types";
import type { EntityListController } from "@/lib/entity-list/config";
import {
  applyAudience,
  HUMAN_CONVERSATION_TYPES,
  MACHINE_CONVERSATION_TYPES,
  readAudience,
  type ConversationAudience,
  type ConversationBrowseRow,
} from "../types";

function sumFacet(
  facets: EntityFacets,
  values: readonly string[],
): number {
  return values.reduce(
    (total, value) => total + facetCount(facets, "conversation_type", value),
    0,
  );
}

const OPTIONS: {
  id: Exclude<ConversationAudience, "custom">;
  label: string;
  icon: typeof User;
  hint: string;
}[] = [
  {
    id: "people",
    label: "Your work",
    icon: User,
    hint: "Chats, workflow runs, research, scheduled runs and podcast builds.",
  },
  {
    id: "machine",
    label: "Internal machine runs",
    icon: Cpu,
    hint: "Subagent, automatic, system and hindsight-replay runs the platform generated for itself.",
  },
  {
    id: "all",
    label: "Everything",
    icon: Layers,
    hint: "Every conversation, human and machine.",
  },
];

export function ConversationAudienceFilter({
  list,
}: {
  list: EntityListController<ConversationBrowseRow>;
}) {
  const active = readAudience(list.query.filters);
  const counts: Record<Exclude<ConversationAudience, "custom">, number> = {
    people: sumFacet(list.facets, HUMAN_CONVERSATION_TYPES),
    machine: sumFacet(list.facets, MACHINE_CONVERSATION_TYPES),
    all:
      sumFacet(list.facets, HUMAN_CONVERSATION_TYPES) +
      sumFacet(list.facets, MACHINE_CONVERSATION_TYPES),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex items-center rounded-md border border-border bg-card p-0.5"
        role="group"
        aria-label="Which conversations to show"
      >
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = active === option.id;
          return (
            <button
              key={option.id}
              type="button"
              title={option.hint}
              aria-pressed={selected}
              onClick={() =>
                list.setFilters(applyAudience(list.query.filters, option.id))
              }
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{option.label}</span>
              {/* A count IS a door: the number on "Internal machine runs" is
                  how the user knows something is being held back, and clicking
                  it is how they reach it. */}
              <span className="tabular-nums opacity-70">
                {counts[option.id].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      {active === "custom" && (
        <span className="text-xs text-muted-foreground">
          Custom type filter applied — the presets above replace it.
        </span>
      )}
    </div>
  );
}
