"use client";

/**
 * ConversationLaneToggles — the five independent on/off lane gates inside
 * the canonical conversation filter popover, in Arman's order:
 * Chat | Matrx | Auto | Plugins | Subagents.
 *
 * The choice is the VIEWER's (one persisted preference,
 * `userPreferences.conversationFilters.lanes`), so every sidebar, history
 * window and picker honors it at once. It writes ONLY the preference; each
 * mounted `ConversationHistorySidebar` syncs its scope's lane gate from it and
 * refetches (server-side `lane in (...)`). The source tree below never writes
 * lanes, so its "Select all" cannot re-admit a lane that is off.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  selectConversationLanes,
  selectLaneCounts,
  selectSourceFacetsStatus,
} from "@/features/agents/redux/conversation-history/selectors";
import {
  CONVERSATION_LANES,
  DEFAULT_CONVERSATION_LANES,
  LANE_META,
  normalizeLanes,
  type ConversationLane,
} from "@/features/agents/redux/conversation-history/lanes";

/** Writes the viewer's lane choice (persisted by the preferences engine). */
export function useSetConversationLanes(): (
  lanes: readonly ConversationLane[],
) => void {
  const dispatch = useAppDispatch();
  return (lanes) =>
    dispatch(
      setPreference({
        module: "conversationFilters",
        preference: "lanes",
        value: normalizeLanes([...lanes]),
      }),
    );
}

export interface ConversationLaneTogglesProps {
  className?: string;
}

export const ConversationLaneToggles: React.FC<
  ConversationLaneTogglesProps
> = ({ className }) => {
  const lanes = useAppSelector(selectConversationLanes);
  const counts = useAppSelector(selectLaneCounts);
  const facetsStatus = useAppSelector(selectSourceFacetsStatus);
  const setLanes = useSetConversationLanes();
  const countsKnown = facetsStatus === "succeeded";

  return (
    <ToggleGroup
      type="multiple"
      value={lanes}
      onValueChange={(next) => setLanes(normalizeLanes(next))}
      aria-label="Conversation lanes"
      className={cn(
        "grid w-full grid-cols-5 overflow-hidden rounded-sm border border-border bg-background",
        className,
      )}
    >
      {CONVERSATION_LANES.map((lane) => {
        const meta = LANE_META[lane];
        const on = lanes.includes(lane);
        const count = counts[lane];
        return (
          <ToggleGroupItem
            key={lane}
            value={lane}
            aria-label={`${meta.label}${on ? " (shown)" : " (hidden)"}`}
            title={
              countsKnown
                ? `${meta.label} · ${count.toLocaleString()} — ${meta.description}`
                : `${meta.label} — ${meta.description}`
            }
            className={cn(
              "h-7 min-w-0 rounded-none border-0 border-r border-border px-1 text-[10px] font-medium whitespace-nowrap text-muted-foreground last:border-r-0",
              "hover:bg-accent hover:text-foreground data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:shadow-none",
            )}
          >
            {meta.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
};

/**
 * The honest empty state when every lane is off: says so, and offers the one
 * click that brings the default lanes back.
 */
export const AllLanesOffNotice: React.FC<{ className?: string }> = ({
  className,
}) => {
  const setLanes = useSetConversationLanes();
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-3 py-6 text-center text-xs text-muted-foreground",
        className,
      )}
    >
      <span>Every lane is off.</span>
      <button
        type="button"
        onClick={() => setLanes(DEFAULT_CONVERSATION_LANES)}
        className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
      >
        Show Chat and Matrx
      </button>
    </div>
  );
};

export default ConversationLaneToggles;
