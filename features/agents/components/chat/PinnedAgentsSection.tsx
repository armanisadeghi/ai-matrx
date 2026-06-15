"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentConsumer } from "@/features/agents/hooks/useAgentConsumer";
import { makeSelectFilteredAgents } from "@/features/agents/redux/agent-consumers/selectors";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { FavoriteAgentButton } from "@/features/agents/components/agent-listings/FavoriteAgentButton";

interface PinnedAgentsSectionProps {
  /** Currently active agentId — used to highlight the row when present. */
  activeAgentId?: string;
  /** Click handler — receives the selected agent's id. */
  onSelect: (agentId: string) => void;
}

const CONSUMER_ID = "chat-sidebar-pinned";
/** Collapsed pin list length before "Show all" appears. */
const PINNED_COLLAPSED_LIMIT = 5;

/**
 * Renders the user's pinned agents at the top of the chat sidebar.
 *
 * Backed by the same centralized agent-consumers Redux pipeline that powers
 * `AgentListDropdown` — we register a dedicated consumer ("chat-sidebar-pinned")
 * with `favFilter: "yes"`, then read `makeSelectFilteredAgents(consumerId)`.
 * This means the section reflects whatever the user has favorited via the
 * canonical FavoriteAgentButton (toggling persists through `saveAgentField`
 * → `agx_agent.is_favorite`), respects archive/access filters consistently
 * with the rest of the app, and shares the agent registry with the dropdown
 * (no parallel fetches).
 *
 * We intentionally do NOT trigger an agent-list fetch from this component:
 * if the registry hasn't been populated yet (user hasn't opened the picker),
 * we render nothing rather than pulling every agent down just to filter to
 * favorites. The list populates as soon as the user opens the dropdown — same
 * lazy behavior as everywhere else.
 */
export function PinnedAgentsSection({
  activeAgentId,
  onSelect,
}: PinnedAgentsSectionProps) {
  const dispatch = useAppDispatch();

  // Register a dedicated consumer for the chat sidebar's pinned view.
  // unregisterOnUnmount=false: the consumer slot is cheap and we want its
  // filter state to survive sidebar collapse/expand cycles.
  const consumer = useAgentConsumer(CONSUMER_ID);

  // Lazy-load the agent registry the same way `AgentListDropdown` does via
  // `ensureLoaded`. The thunk is idempotent (5-min TTL + in-flight dedup),
  // so this co-exists cleanly with the dropdown's own call — the second one
  // is a no-op. Without this, fresh page loads (full reload, not client nav)
  // would show an empty Pinned section even when favorites exist server-side.
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  // Make sure this consumer's filter is locked to favorites-only. Done in an
  // effect (not on register) so existing slots get corrected too. Cheap: the
  // setter is stable and re-dispatching the same value is a no-op in Redux.
  useEffect(() => {
    if (consumer.favFilter !== "yes") consumer.setFavFilter("yes");
  }, [consumer]);

  const selectFiltered = useMemo(
    () => makeSelectFilteredAgents(CONSUMER_ID),
    [],
  );
  const pinned = useAppSelector(selectFiltered);

  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const hasMorePins = pinned.length > PINNED_COLLAPSED_LIMIT;
  const visiblePins =
    showAll || !hasMorePins ? pinned : pinned.slice(0, PINNED_COLLAPSED_LIMIT);

  if (pinned.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:text-foreground"
        aria-expanded={open}
        aria-label="Toggle pinned agents"
      >
        {/* Label keeps the shared 12px left edge; the collapse chevron sits on
            the RIGHT so the text aligns with every other section + row. */}
        <span className="flex items-baseline gap-1.5">
          <span>Pinned Agents</span>
          <span className="text-[10px] text-muted-foreground/70 normal-case tracking-normal">
            {pinned.length}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
      </button>
      {open && (
        <ul className="pb-1.5">
          {visiblePins.map((agent) => {
            const isActive = activeAgentId === agent.id;
            return (
              <li
                key={agent.id}
                className={cn(
                  "group mx-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm cursor-pointer",
                  "text-foreground/90 hover:bg-accent/60",
                  isActive && "bg-accent/70",
                )}
                onClick={() => onSelect(agent.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(agent.id);
                  }
                }}
                title={agent.description || agent.name}
              >
                <span className="min-w-0 flex-1 truncate">
                  {agent.name || "Untitled agent"}
                </span>
                <span
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FavoriteAgentButton id={agent.id} variant="list" />
                </span>
              </li>
            );
          })}
          {hasMorePins && (
            <li className="mx-1">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="flex h-7 w-full items-center rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                aria-expanded={showAll}
              >
                {showAll ? "Show less" : "Show all"}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
